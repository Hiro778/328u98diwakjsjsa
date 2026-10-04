-- ============================================================
-- 105_security_lockdown_creative_tables.sql
-- BisnisSehat: Security Fix BS-CONF-02 — AI & Creative Studio Lockdown
-- 
-- Vulnerabilities addressed:
-- 1. Direct client mutation on public.creative_prds, creative_assets, creative_generations
-- 2. Restricts table privileges: REVOKE INSERT, UPDATE, DELETE, TRUNCATE from client roles
-- 3. Drops overly permissive FOR ALL policies and replaces with strict FOR SELECT policies
-- 4. Attaches defense-in-depth trigger prevent_client_creative_mutation (HTTP 403 / 42501)
-- 5. Fixes claim_creative_free_usage_atomic schema discrepancy (consumed_at instead of created_at)
-- 6. Restores tenant isolation and caller ownership validation in claim_creative_free_usage_atomic
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. REVOKE MUTATION PRIVILEGES FROM CLIENT ROLES
-- ────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_prds FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_assets FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_generations FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_credits FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_free_usage FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.credit_ledger FROM anon, authenticated, public;

-- Grant least-privilege SELECT to authenticated
GRANT SELECT ON TABLE public.creative_prds TO authenticated;
GRANT SELECT ON TABLE public.creative_assets TO authenticated;
GRANT SELECT ON TABLE public.creative_generations TO authenticated;
GRANT SELECT ON TABLE public.creative_credits TO authenticated;
GRANT SELECT ON TABLE public.creative_free_usage TO authenticated;
GRANT SELECT ON TABLE public.credit_ledger TO authenticated;

-- Service role retains full operational control for trusted backend workflows
GRANT ALL ON TABLE public.creative_prds TO service_role;
GRANT ALL ON TABLE public.creative_assets TO service_role;
GRANT ALL ON TABLE public.creative_generations TO service_role;
GRANT ALL ON TABLE public.creative_credits TO service_role;
GRANT ALL ON TABLE public.creative_free_usage TO service_role;
GRANT ALL ON TABLE public.credit_ledger TO service_role;

-- ────────────────────────────────────────────────────────────
-- 2. HARDEN RLS POLICIES (DROP FOR ALL, ENFORCE FOR SELECT)
-- ────────────────────────────────────────────────────────────

-- 2.1. public.creative_prds
ALTER TABLE public.creative_prds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creative PRDs owner via brief" ON public.creative_prds;
DROP POLICY IF EXISTS "Creative PRDs owner read" ON public.creative_prds;
DROP POLICY IF EXISTS "Admins can view all creative PRDs" ON public.creative_prds;

CREATE POLICY "Creative PRDs owner read" ON public.creative_prds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.creative_briefs cb
      JOIN public.campaigns c ON c.id = cb.campaign_id
      JOIN public.businesses b ON b.id = c.business_id
      WHERE cb.id = creative_prds.brief_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can view all creative PRDs" ON public.creative_prds
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 2.2. public.creative_assets
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creative assets owner via business" ON public.creative_assets;
DROP POLICY IF EXISTS "Creative assets owner via business_id" ON public.creative_assets;
DROP POLICY IF EXISTS "Creative assets owner read" ON public.creative_assets;
DROP POLICY IF EXISTS "Admins can view all creative assets" ON public.creative_assets;

CREATE POLICY "Creative assets owner read" ON public.creative_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = creative_assets.business_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can view all creative assets" ON public.creative_assets
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 2.3. public.creative_generations
ALTER TABLE public.creative_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creative generations owner via business" ON public.creative_generations;
DROP POLICY IF EXISTS "Creative generations owner read" ON public.creative_generations;
DROP POLICY IF EXISTS "Admins can view all creative generations" ON public.creative_generations;

CREATE POLICY "Creative generations owner read" ON public.creative_generations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = creative_generations.business_id
        AND b.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can view all creative generations" ON public.creative_generations
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 3. DEFENSE-IN-DEPTH TRIGGERS PREVENTING CLIENT MUTATIONS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_client_creative_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    auth.role()
  );

  IF v_role IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'insufficient_privilege: Direct client mutation of creative artifacts is prohibited'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_creative_prds_mutation ON public.creative_prds;
CREATE TRIGGER trg_prevent_client_creative_prds_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.creative_prds
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_creative_mutation();

DROP TRIGGER IF EXISTS trg_prevent_client_creative_assets_mutation ON public.creative_assets;
CREATE TRIGGER trg_prevent_client_creative_assets_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.creative_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_creative_mutation();

DROP TRIGGER IF EXISTS trg_prevent_client_creative_generations_mutation ON public.creative_generations;
CREATE TRIGGER trg_prevent_client_creative_generations_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.creative_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_creative_mutation();

-- ────────────────────────────────────────────────────────────
-- 4. HARDEN CLAIM_CREATIVE_FREE_USAGE_ATOMIC RPC
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_creative_free_usage_atomic(
  p_business_id uuid,
  p_profile_id uuid,
  p_operation text,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean;
  v_is_adm boolean;
  v_already_consumed boolean;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement (@gas.md)
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi klaim AI dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  -- Caller verification: if called from user context, enforce ownership
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_is_adm := public.is_admin();
    IF NOT v_is_adm AND NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND owner_id = v_caller_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'UNAUTHORIZED_BUSINESS_OWNERSHIP'
      );
    END IF;
  END IF;

  -- Check if already used
  SELECT EXISTS (
    SELECT 1 FROM public.creative_free_usage
    WHERE business_id = p_business_id
  ) INTO v_already_consumed;

  IF v_already_consumed THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FREE_USAGE_ALREADY_CONSUMED'
    );
  END IF;

  -- Atomic reservation via UNIQUE CONSTRAINT on business_id (using consumed_at column)
  INSERT INTO public.creative_free_usage (
    business_id,
    profile_id,
    operation,
    request_id,
    consumed_at
  ) VALUES (
    p_business_id,
    COALESCE(p_profile_id, v_caller_id),
    p_operation,
    p_request_id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'business_id', p_business_id,
    'operation', p_operation,
    'request_id', p_request_id,
    'consumed_at', now()
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FREE_USAGE_ALREADY_CONSUMED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_creative_free_usage_atomic(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_creative_free_usage_atomic(uuid, uuid, text, text) TO authenticated, service_role;
