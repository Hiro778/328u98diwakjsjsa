-- 042_google_business_profile.sql
-- Google Business Profile Integration: OAuth connection, locations, states
--
-- API Surface (CORRECTED):
--   - Account Management: v1 mybusinessaccountmanagement.googleapis.com
--   - Business Information / Locations: v1 mybusinessbusinessinformation.googleapis.com
--   - Reviews: v4 mybusiness.googleapis.com (active, not deprecated)
--   - Local Posts: v4 mybusiness.googleapis.com (active, not deprecated)
--   - Performance: v1 businessprofileperformance.googleapis.com
--
-- Changes:
--   1. CREATE google_business_connections: OAuth credentials per business
--   2. CREATE google_business_locations: multiple locations per connection
--   3. CREATE google_business_oauth_states: CSRF state tracking
--   4. RLS policies (owner-scoped via business_id → owner_id)
--   5. Indexes, triggers, cleanup functions

-- ══════════════════════════════════════════════════════════
-- 1. GOOGLE BUSINESS CONNECTIONS
-- ══════════════════════════════════════════════════════════
-- One OAuth connection per BisnisSehat business.
-- Refresh token encrypted with AES-256-GCM, service_role only.

CREATE TABLE IF NOT EXISTS google_business_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Google account info (populated after OAuth + account fetch)
  google_account_id     text NOT NULL DEFAULT '',
  google_account_name   text NOT NULL DEFAULT '',
  -- OAuth credentials (encrypted, accessed only by Edge Functions with service_role)
  refresh_token_encrypted text DEFAULT NULL,
  token_expires_at      timestamptz DEFAULT NULL,
  scope                 text DEFAULT 'https://www.googleapis.com/auth/business.manage',
  -- Connection state
  status                text NOT NULL DEFAULT 'not_connected' CHECK (status IN (
    'not_connected',
    'connecting',
    'connected',
    'token_expired',
    'error',
    'disconnected'
  )),
  last_error            text DEFAULT '',
  connected_at          timestamptz DEFAULT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

CREATE INDEX IF NOT EXISTS idx_gbc_business ON google_business_connections(business_id);
CREATE INDEX IF NOT EXISTS idx_gbc_user ON google_business_connections(user_id);

ALTER TABLE google_business_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbc_owner_select" ON google_business_connections FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbc_owner_insert" ON google_business_connections FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbc_owner_update" ON google_business_connections FOR UPDATE TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbc_owner_delete" ON google_business_connections FOR DELETE TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- ══════════════════════════════════════════════════════════
-- 2. GOOGLE BUSINESS LOCATIONS
-- ══════════════════════════════════════════════════════════
-- Multiple locations per connection. Synced from Google Business Information API v1.

CREATE TABLE IF NOT EXISTS google_business_locations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         uuid NOT NULL REFERENCES public.google_business_connections(id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  google_account_id     text NOT NULL DEFAULT '',
  google_location_id    text NOT NULL DEFAULT '',
  location_name         text NOT NULL DEFAULT '',
  address               text NOT NULL DEFAULT '',
  category              text NOT NULL DEFAULT '',
  state                 text NOT NULL DEFAULT '',
  phone_number          text NOT NULL DEFAULT '',
  website_uri           text NOT NULL DEFAULT '',
  maps_url              text NOT NULL DEFAULT '',
  profile_url           text NOT NULL DEFAULT '',
  -- Feature availability (determined by API access checks)
  reviews_enabled       boolean DEFAULT false,
  posts_enabled         boolean DEFAULT false,
  performance_enabled   boolean DEFAULT false,
  -- Sync metadata
  synced_at             timestamptz DEFAULT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, google_location_id)
);

CREATE INDEX IF NOT EXISTS idx_gbl_connection ON google_business_locations(connection_id);
CREATE INDEX IF NOT EXISTS idx_gbl_business ON google_business_locations(business_id);

ALTER TABLE google_business_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbl_owner_select" ON google_business_locations FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbl_owner_insert" ON google_business_locations FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbl_owner_update" ON google_business_locations FOR UPDATE TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbl_owner_delete" ON google_business_locations FOR DELETE TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- ══════════════════════════════════════════════════════════
-- 3. GOOGLE BUSINESS OAUTH STATES
-- ══════════════════════════════════════════════════════════
-- CSRF state with business_id + user_id binding, expiration, replay protection.

CREATE TABLE IF NOT EXISTS google_business_oauth_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state           text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  used            boolean DEFAULT false,
  used_at         timestamptz DEFAULT NULL,
  ip_address      text DEFAULT NULL,
  user_agent      text DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_gbos_business ON google_business_oauth_states(business_id);
CREATE INDEX IF NOT EXISTS idx_gbos_state ON google_business_oauth_states(state) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_gbos_expires ON google_business_oauth_states(expires_at) WHERE used = false;

ALTER TABLE google_business_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gbos_owner_select" ON google_business_oauth_states FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbos_owner_insert" ON google_business_oauth_states FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));
CREATE POLICY "gbos_owner_update" ON google_business_oauth_states FOR UPDATE TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- ══════════════════════════════════════════════════════════
-- 4. UPDATED_AT TRIGGERS
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_google_business_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_business_connections_updated_at
  BEFORE UPDATE ON google_business_connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_google_business_updated_at();

CREATE TRIGGER google_business_locations_updated_at
  BEFORE UPDATE ON google_business_locations
  FOR EACH ROW EXECUTE FUNCTION public.handle_google_business_updated_at();

-- ══════════════════════════════════════════════════════════
-- 5. CLEANUP FUNCTION
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_google_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM google_business_oauth_states
  WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
