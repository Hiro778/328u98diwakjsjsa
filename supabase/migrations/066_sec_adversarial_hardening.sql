-- ============================================================
-- 061_sec_adversarial_hardening.sql
-- BisnisSehat Second-Pass Adversarial Security Hardening (sec.md)
-- 1. Hardens deduct_creative_credits_atomic with explicit caller ownership check.
-- 2. Restricts grant_creative_credits_atomic strictly to service_role (prevents client token generation).
-- 3. Hardens claim_creative_free_usage_atomic with caller ownership check.
-- 4. Restricts rollback_creative_free_usage strictly to service_role.
-- ============================================================

-- 1. HARDEN deduct_creative_credits_atomic
CREATE OR REPLACE FUNCTION public.deduct_creative_credits_atomic(
  p_business_id uuid,
  p_credits integer,
  p_operation text,
  p_request_id text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_available integer;
  v_consumed integer;
  v_new_balance integer;
BEGIN
  -- Security check: if invoked from authenticated user session, verify business ownership
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND owner_id = v_caller_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'UNAUTHORIZED_BUSINESS_OWNERSHIP'
      );
    END IF;
  END IF;

  -- Input boundary validation
  IF p_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CREDIT_AMOUNT'
    );
  END IF;

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

  v_new_balance := v_available - p_credits;
  UPDATE public.creative_credits
  SET available = v_new_balance,
      consumed = v_consumed + p_credits,
      updated_at = now()
  WHERE business_id = p_business_id;

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

-- 2. HARDEN & RESTRICT grant_creative_credits_atomic (SERVICE_ROLE ONLY)
CREATE OR REPLACE FUNCTION public.grant_creative_credits_atomic(
  p_business_id uuid,
  p_credits integer,
  p_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_available integer;
  v_total_earned integer;
  v_new_balance integer;
BEGIN
  -- Strict positive credit validation
  IF p_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CREDIT_AMOUNT');
  END IF;

  SELECT available, total_earned INTO v_available, v_total_earned
  FROM public.creative_credits
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.creative_credits (business_id, available, consumed, total_earned)
    VALUES (p_business_id, p_credits, 0, p_credits)
    RETURNING available, total_earned INTO v_available, v_total_earned;
    v_new_balance := p_credits;
  ELSE
    v_new_balance := v_available + p_credits;
    UPDATE public.creative_credits
    SET available = v_new_balance,
        total_earned = v_total_earned + p_credits,
        updated_at = now()
    WHERE business_id = p_business_id;
  END IF;

  INSERT INTO public.credit_ledger (
    business_id, type, credits, balance_after, idempotency_key, description
  ) VALUES (
    p_business_id, 'TOPUP', p_credits, v_new_balance, p_order_id || ':grant', 'Top up ' || p_credits || ' credits'
  );

  RETURN jsonb_build_object('success', true, 'balance_after', v_new_balance);
END;
$$;

-- Revoke execution permissions from public/anon/authenticated; allow ONLY service_role (Midtrans Webhook)
REVOKE EXECUTE ON FUNCTION public.grant_creative_credits_atomic(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_creative_credits_atomic(uuid, integer, text) TO service_role;

-- 3. HARDEN claim_creative_free_usage_atomic
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
  v_caller_id uuid;
  v_already_consumed boolean;
BEGIN
  -- Caller verification: if called by authenticated user, verify ownership
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    IF NOT EXISTS (
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

  -- Atomic reservation via UNIQUE CONSTRAINT on business_id
  INSERT INTO public.creative_free_usage (
    business_id,
    profile_id,
    operation,
    request_id,
    consumed_at
  ) VALUES (
    p_business_id,
    p_profile_id,
    p_operation,
    p_request_id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'claimed_at', now(),
    'operation', p_operation
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'FREE_USAGE_ALREADY_CONSUMED'
  );
END;
$$;

-- 4. RESTRICT rollback_creative_free_usage (SERVICE_ROLE ONLY)
REVOKE EXECUTE ON FUNCTION public.rollback_creative_free_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_creative_free_usage(uuid, text) TO service_role;

-- 5. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
