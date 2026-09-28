-- 050_subscription_cancellation.sql
-- Implements explicit, secure, and idempotent subscription cancellation for BisnisSehat Pro
-- In accordance with plan.md:
-- 1. Server-side authenticated action only (auth.uid() verified).
-- 2. Checks profile/business ownership (prevents IDOR).
-- 3. Sets status = 'cancelled', records cancelled_at and cancelled_by.
-- 4. Never alters historical payment records, never issues fake refunds, never extends expiry.
-- 5. Idempotent: safe to invoke repeatedly.

-- 1. Add cancellation metadata columns if not present
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_cancelled
  ON public.subscriptions(status)
  WHERE status = 'cancelled';

-- 2. Atomic Cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_subscription_atomic(
  p_subscription_id uuid,
  p_business_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid;
  v_sub record;
  v_business_owner_id uuid;
BEGIN
  -- 1. Verify authenticated session
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi login diperlukan untuk membatalkan langganan'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Find subscription and verify ownership
  SELECT id, profile_id, business_id, plan, status, started_at, expires_at, cancelled_at
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription tidak ditemukan'
      USING ERRCODE = 'P0002';
  END IF;

  -- Verify caller is the profile owner or the owner of the linked business
  IF v_sub.profile_id <> v_caller_id THEN
    -- Check if linked business exists and caller is owner
    IF v_sub.business_id IS NOT NULL THEN
      SELECT owner_id INTO v_business_owner_id
      FROM public.businesses
      WHERE id = v_sub.business_id;

      IF v_business_owner_id <> v_caller_id THEN
        RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik langganan ini'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik langganan ini'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- If an explicit business_id was provided, verify it matches
  IF p_business_id IS NOT NULL AND v_sub.business_id IS NOT NULL AND v_sub.business_id <> p_business_id THEN
    RAISE EXCEPTION 'Akses ditolak: ID Bisnis tidak sesuai dengan data langganan'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Idempotency check: if already cancelled, return existing cancelled state
  IF v_sub.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'cancelled',
      'is_active', false,
      'subscription_id', v_sub.id,
      'cancelled_at', v_sub.cancelled_at,
      'expires_at', v_sub.expires_at,
      'message', 'Langganan sudah dalam status dihentikan sebelumnya'
    );
  END IF;

  -- 4. Execute cancellation: set status = 'cancelled'
  -- CRITICAL RULE: DO NOT delete subscription, DO NOT modify payment records, DO NOT issue refund, DO NOT modify expires_at
  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_caller_id,
    updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'cancelled',
    'is_active', false,
    'subscription_id', v_sub.id,
    'cancelled_at', now(),
    'expires_at', v_sub.expires_at,
    'message', 'Langganan Pro berhasil dihentikan'
  );
END;
$$;

-- Grant execution to authenticated users and service_role only
REVOKE ALL ON FUNCTION public.cancel_subscription_atomic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_atomic(uuid, uuid) TO authenticated, service_role;
