-- 032_marketplace_oauth_flow.sql
-- Marketplace OAuth Flow: multi-account support, OAuth state tracking, token management
--
-- Changes:
--   1. ALTER marketplace_connections: add OAuth columns, update status enum, drop unique constraint
--   2. CREATE marketplace_oauth_states: temporary state tracking for OAuth flow
--   3. UPDATE status enum to match new requirement

-- ══════════════════════════════════════════════════════════
-- 1. UPDATE marketplace_connections
-- ══════════════════════════════════════════════════════════

-- Drop the unique constraint that prevents multi-account
ALTER TABLE marketplace_connections
  DROP CONSTRAINT IF EXISTS marketplace_connections_business_id_marketplace_key;

-- Update status CHECK constraint to match new states
ALTER TABLE marketplace_connections
  DROP CONSTRAINT IF EXISTS marketplace_connections_status_check;

ALTER TABLE marketplace_connections
  ADD CONSTRAINT marketplace_connections_status_check CHECK (status IN (
    'not_connected',  -- No connection initiated
    'connecting',     -- OAuth redirect in progress
    'connected',      -- Active and verified
    'token_expired',  -- Token needs refresh
    'error',          -- Connection failed
    'disconnected'    -- User disconnected
  ));

-- Add OAuth token columns (replaces credentials_encrypted)
ALTER TABLE marketplace_connections
  ADD COLUMN IF NOT EXISTS access_token_encrypted text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS token_type text DEFAULT 'bearer',
  ADD COLUMN IF NOT EXISTS scope text DEFAULT '',
  ADD COLUMN IF NOT EXISTS authorization_status text DEFAULT 'not_started' CHECK (authorization_status IN (
    'not_started',  -- No authorization attempted
    'pending',      -- Authorization in progress
    'authorized',   -- Authorization completed, tokens obtained
    'expired',      -- Authorization expired, needs re-auth
    'error'         -- Authorization failed
  ));

-- Add marketplace-specific shop data
ALTER TABLE marketplace_connections
  ADD COLUMN IF NOT EXISTS shop_username text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_avatar_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_verified boolean DEFAULT false;

-- Update default status
ALTER TABLE marketplace_connections
  ALTER COLUMN status SET DEFAULT 'not_connected';

-- Update existing 'disconnected' status to 'not_connected' if needed
UPDATE marketplace_connections SET status = 'not_connected' WHERE status = 'disconnected';

-- ══════════════════════════════════════════════════════════
-- 2. CREATE marketplace_oauth_states
-- ══════════════════════════════════════════════════════════
-- Temporary table for OAuth state parameter tracking.
-- States expire after 10 minutes and are deleted after use.

CREATE TABLE IF NOT EXISTS marketplace_oauth_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  marketplace     text NOT NULL CHECK (marketplace IN ('shopee', 'tokopedia', 'tiktokshop')),
  state           text NOT NULL UNIQUE,  -- Random state parameter
  code_verifier   text DEFAULT NULL,     -- PKCE code verifier (optional)
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,  -- 10 minutes from creation
  used            boolean DEFAULT false,
  used_at         timestamptz DEFAULT NULL,
  ip_address      text DEFAULT NULL,
  user_agent      text DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_business
  ON marketplace_oauth_states(business_id, marketplace);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state
  ON marketplace_oauth_states(state) WHERE used = false;

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires
  ON marketplace_oauth_states(expires_at) WHERE used = false;

ALTER TABLE marketplace_oauth_states ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own OAuth states
CREATE POLICY "marketplace_oauth_states_owner_select"
  ON marketplace_oauth_states FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_oauth_states_owner_insert"
  ON marketplace_oauth_states FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

CREATE POLICY "marketplace_oauth_states_owner_update"
  ON marketplace_oauth_states FOR UPDATE TO authenticated
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

-- ══════════════════════════════════════════════════════════
-- 3. CLEANUP FUNCTION
-- ══════════════════════════════════════════════════════════

-- Function to cleanup expired OAuth states
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM marketplace_oauth_states
  WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
