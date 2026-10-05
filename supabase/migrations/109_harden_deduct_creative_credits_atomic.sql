-- ============================================================
-- 109_harden_deduct_creative_credits_atomic.sql
-- BisnisSehat: Security Hardening for deduct_creative_credits_atomic
--
-- Vulnerabilities addressed:
-- 1. Closes anonymous authorization bypass in deduct_creative_credits_atomic
-- 2. Strictly enforces authentication and active account status for user callers
-- 3. Verifies business ownership (owner_id = auth.uid()) for authenticated non-admin users
-- 4. Allows trusted service_role backend invocation
-- 5. Revokes EXECUTE privileges from PUBLIC and anon
-- ============================================================

CREATE OR REPLACE FUNCTION public.deduct_creative_credits_atomic(
  p_business_id uuid,
  p_credits integer,
  p_operation text,
  p_request_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
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
  v_available integer;
  v_consumed integer;
  v_new_balance integer;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement (@gas.md)
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi kredit AI dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 1. Check Caller Execution Context (service_role vs client user)
  v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  -- 2. Authentication & Tenant Authorization Check
  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    -- Enforce active account access
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
      IF NOT public.is_account_access_allowed(v_caller_id) THEN
        RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Enforce business ownership
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

  -- 3. Input boundary validation
  IF p_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CREDIT_AMOUNT'
    );
  END IF;

  -- 4. Idempotency Check: if already processed with this request_id, return current balance safely
  IF p_request_id IS NOT NULL AND trim(p_request_id) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.credit_ledger
      WHERE business_id = p_business_id AND idempotency_key = p_request_id
    ) THEN
      SELECT available INTO v_available
      FROM public.creative_credits
      WHERE business_id = p_business_id;

      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'balance_after', COALESCE(v_available, 0),
        'credits_deducted', 0
      );
    END IF;
  END IF;

  -- 5. Row-level Lock (FOR UPDATE) & Balance Check
  SELECT available, consumed INTO v_available, v_consumed
  FROM public.creative_credits
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.creative_credits (business_id, available, consumed, total_earned)
    VALUES (p_business_id, 0, 0, 0)
    RETURNING available, consumed INTO v_available, v_consumed;
  END IF;

  IF v_available < p_credits THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'available', v_available,
      'required', p_credits
    );
  END IF;

  -- 6. Atomic Balance Mutation
  v_new_balance := v_available - p_credits;
  UPDATE public.creative_credits
  SET available = v_new_balance,
      consumed = v_consumed + p_credits,
      updated_at = now()
  WHERE business_id = p_business_id;

  -- 7. Record Immutable Ledger Entry
  INSERT INTO public.credit_ledger (
    business_id, type, credits, balance_after, idempotency_key, description
  ) VALUES (
    p_business_id, 'AI_USAGE', -p_credits, v_new_balance, p_request_id, p_operation
  );

  RETURN jsonb_build_object(
    'success', true,
    'balance_after', v_new_balance,
    'credits_deducted', p_credits
  );
END;
$$;

-- 8. Restrict Privileges: REVOKE FROM PUBLIC & anon, GRANT ONLY TO authenticated & service_role
REVOKE ALL ON FUNCTION public.deduct_creative_credits_atomic(uuid, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_creative_credits_atomic(uuid, integer, text, text, jsonb) TO authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
