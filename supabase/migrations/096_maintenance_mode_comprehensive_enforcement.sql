-- ============================================================
-- 096_maintenance_mode_comprehensive_enforcement.sql
-- BisnisSehat: Authoritative Server-Side Maintenance Enforcement Layer (@gas.md)
--
-- Security specifications:
-- 1. Sensitive user-facing mutations MUST reject execution when maintenance_mode = true
--    unless the caller is a verified administrator (is_admin() = true).
-- 2. Prevents non-admin mutations on subscription cancellations, credit claims, and order flows.
-- 3. Ensures get_public_platform_settings() remains securely callable by anon, authenticated, and service_role.
-- ============================================================

-- 1. Harden cancel_subscription_atomic with authoritative maintenance_mode check
CREATE OR REPLACE FUNCTION public.cancel_subscription_atomic(
  p_business_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub_id uuid;
  v_plan text;
  v_status text;
  v_expires_at timestamptz;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement (@gas.md)
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi pembatalan dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 1. Strictly verify account access
  IF NOT public.is_account_access_allowed(v_caller_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify business ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND owner_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized business access' USING ERRCODE = '42501';
  END IF;

  -- 3. Query active subscription
  SELECT id, plan, status, expires_at
  INTO v_sub_id, v_plan, v_status, v_expires_at
  FROM public.subscriptions
  WHERE profile_id = v_caller_id AND plan = 'pro' AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_PRO_SUBSCRIPTION'
    );
  END IF;

  -- 4. Set cancel flag
  UPDATE public.subscriptions
  SET
    is_cancelled = true,
    cancelled_at = now(),
    cancellation_reason = COALESCE(p_reason, ''),
    updated_at = now()
  WHERE id = v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at,
    'is_cancelled', true
  );
END;
$$;

-- 2. Harden claim_creative_free_usage_atomic with authoritative maintenance_mode check
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
  v_already_consumed boolean;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement (@gas.md)
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi klaim AI dibatasi untuk administrator.'
        USING ERRCODE = '55000';
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

  -- Atomic reservation via UNIQUE CONSTRAINT on business_id
  INSERT INTO public.creative_free_usage (
    business_id,
    profile_id,
    operation,
    request_id,
    created_at
  ) VALUES (
    p_business_id,
    p_profile_id,
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

-- 3. Re-grant execute on functions
GRANT EXECUTE ON FUNCTION public.cancel_subscription_atomic(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_creative_free_usage_atomic(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated, service_role;
