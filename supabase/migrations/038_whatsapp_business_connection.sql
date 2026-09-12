-- ============================================================
-- 038_whatsapp_business_connection.sql
-- BisnisSehat - WhatsApp Business Connection (Phase 1)
-- ============================================================
-- Stores WhatsApp Business Cloud API connection state and
-- encrypted credentials per business.
--
-- REUSES:
--   whatsapp_message_queue (034) for webhook event idempotency
--   whatsapp_leads (020) for CRM / Sales Tracker
--
-- DOES NOT CREATE:
--   Duplicate queue tables
--   Duplicate connection tables for the same purpose
-- ============================================================

-- ══════════════════════════════════════════════════════════
-- 1. WHATSAPP BUSINESS CONNECTIONS
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_business_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Connection status
  status                text NOT NULL DEFAULT 'disconnected' CHECK (status IN (
    'disconnected',     -- No connection active
    'connecting',       -- OAuth flow initiated, waiting for callback
    'connected',        -- Active and verified
    'error'             -- Connection failed or token expired
  )),

  -- Meta / WhatsApp Business Platform identifiers
  -- These are safe to expose (not secrets)
  phone_number_id       text DEFAULT '',        -- WhatsApp Phone Number ID
  display_phone_number  text DEFAULT '',        -- Display phone number (masked in UI)
  whatsapp_business_id  text DEFAULT '',        -- WhatsApp Business Account ID
  waba_id               text DEFAULT '',        -- WhatsApp Business Account ID (WABA)
  app_id                text DEFAULT '',        -- Meta App ID
  business_name         text DEFAULT '',        -- Business name from Meta
  verified_name         text DEFAULT '',        -- Verified business name

  -- Encrypted credentials (server-side only, never exposed to frontend)
  access_token_encrypted  text DEFAULT NULL,    -- Business integration token (encrypted, from Embedded Signup code exchange)
  webhook_secret          text DEFAULT NULL,    -- Webhook verification token
  app_secret_encrypted    text DEFAULT NULL,    -- Meta App Secret (encrypted, for webhook validation)

  -- Embedded Signup configuration
  config_id               text DEFAULT '',      -- Facebook Login for Business configuration ID

  -- Webhook configuration
  webhook_url             text DEFAULT '',      -- Registered webhook URL
  webhook_verify_token    text DEFAULT '',      -- Verify token for GET challenge

  -- Connection metadata
  last_webhook_at         timestamptz,          -- Last webhook received
  last_error              text DEFAULT '',      -- Last error message
  error_count             integer DEFAULT 0,    -- Consecutive error count

  -- Timestamps
  connected_at            timestamptz,          -- When connection was established
  disconnected_at         timestamptz,          -- When connection was disconnected
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- One connection per business (WhatsApp Cloud API is per-business)
  UNIQUE(business_id)
);

-- ══════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_wa_connections_business
  ON whatsapp_business_connections(business_id);

CREATE INDEX IF NOT EXISTS idx_wa_connections_status
  ON whatsapp_business_connections(status)
  WHERE status = 'connected';

CREATE INDEX IF NOT EXISTS idx_wa_connections_phone_number
  ON whatsapp_business_connections(phone_number_id)
  WHERE phone_number_id != '';

-- Index for webhook lookup: phone_number_id -> connection -> business_id
CREATE INDEX IF NOT EXISTS idx_wa_connections_phone_lookup
  ON whatsapp_business_connections(phone_number_id, business_id)
  WHERE status = 'connected';

-- ══════════════════════════════════════════════════════════
-- 3. RLS POLICIES (Owner-scoped, same pattern as marketplace)
-- ══════════════════════════════════════════════════════════

ALTER TABLE whatsapp_business_connections ENABLE ROW LEVEL SECURITY;

-- Owner can read their own connection (credentials never exposed via RLS column)
CREATE POLICY "wa_connections_owner_select"
  ON whatsapp_business_connections FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can insert connections for their business
CREATE POLICY "wa_connections_owner_insert"
  ON whatsapp_business_connections FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can update their own connections
CREATE POLICY "wa_connections_owner_update"
  ON whatsapp_business_connections FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Owner can delete their connections
CREATE POLICY "wa_connections_owner_delete"
  ON whatsapp_business_connections FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- Service role full access (for Edge Functions)
CREATE POLICY "wa_connections_service_role_all"
  ON whatsapp_business_connections FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
-- 4. UPDATED_AT TRIGGER
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_whatsapp_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_business_connections_updated_at
  BEFORE UPDATE ON whatsapp_business_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_whatsapp_connection_updated_at();

-- ══════════════════════════════════════════════════════════
-- 5. WHATSAPP OAUTH STATES (dedicated, NOT reusing marketplace_oauth_states)
-- ══════════════════════════════════════════════════════════
-- marketplace_oauth_states has CHECK constraint IN ('shopee','tokopedia','tiktokshop')
-- Reusing it for 'whatsapp' would violate that constraint.
-- This is a dedicated table for WhatsApp OAuth state tracking.

CREATE TABLE IF NOT EXISTS whatsapp_oauth_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  state           text NOT NULL UNIQUE,       -- Cryptographically random state
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,       -- 10 minutes from creation
  used            boolean DEFAULT false,
  used_at         timestamptz DEFAULT NULL,
  ip_address      text DEFAULT NULL,
  user_agent      text DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_oauth_states_state
  ON whatsapp_oauth_states(state) WHERE used = false;

CREATE INDEX IF NOT EXISTS idx_wa_oauth_states_expires
  ON whatsapp_oauth_states(expires_at) WHERE used = false;

ALTER TABLE whatsapp_oauth_states ENABLE ROW LEVEL SECURITY;

-- Service role only (Edge Functions handle all state operations)
CREATE POLICY "wa_oauth_states_service_role_all"
  ON whatsapp_oauth_states FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
-- 6. WEBHOOK EVENT LOG (for audit trail)
-- ══════════════════════════════════════════════════════════
-- Immutable log of webhook events received.
-- Uses whatsapp_message_queue (034) for idempotency.
-- This table provides additional audit context.

CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connection_id         uuid REFERENCES public.whatsapp_business_connections(id) ON DELETE SET NULL,

  -- Event details
  event_type            text NOT NULL,           -- 'messages', 'statuses', 'account_update', etc.
  event_id              text,                    -- Meta event ID for deduplication
  phone_number_id       text,                    -- Which phone number the event is for
  sender_phone          text,                    -- Sender's phone (if message event)
  message_type          text,                    -- 'text', 'image', 'interactive', etc.

  -- Status
  status                text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',         -- Webhook received
    'logged',           -- Event logged successfully
    'duplicate',        -- Duplicate event, skipped
    'error'             -- Processing error
  )),

  -- Raw payload (for debugging, encrypted at rest via Supabase)
  payload               jsonb NOT NULL,

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_logs_business
  ON whatsapp_webhook_logs(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_logs_event_id
  ON whatsapp_webhook_logs(event_id)
  WHERE event_id IS NOT NULL;

ALTER TABLE whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Service role only (webhook logs are backend-only)
CREATE POLICY "wa_webhook_logs_service_role_all"
  ON whatsapp_webhook_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Owner can read their own webhook logs (for debugging)
CREATE POLICY "wa_webhook_logs_owner_select"
  ON whatsapp_webhook_logs FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );
