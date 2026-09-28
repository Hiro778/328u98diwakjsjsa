-- ============================================================
-- 073_qris_merchant_payment_confirmation.sql
-- BisnisSehat: QRIS Phase 4 — Merchant Payment Confirmation
-- Strictly server-side authorized:
-- 1. Only verified business owner (auth.uid() = businesses.owner_id) can confirm QRIS payment
-- 2. Strictly atomic and idempotent conditional update (pending -> paid only)
-- 3. Payment confirmation does NOT alter order_status (payment confirmation != order completion)
-- 4. Customer and public callers are forbidden from executing or altering payment_status
-- 5. Safe audit via payments table and updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_qris_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_order record;
  v_rows_updated integer;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Autentikasi diperlukan.' USING ERRCODE = '42501';
  END IF;

  -- 2. Enforce active account access (banned-user zero-access compliance)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
    IF NOT public.is_account_access_allowed(v_caller_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Verify order exists and belongs to the authenticated business owner
  SELECT 
    o.id, 
    o.business_id, 
    o.payment_method, 
    o.payment_status, 
    o.order_status, 
    o.total, 
    b.owner_id
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pesanan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki izin untuk mengonfirmasi pesanan bisnis ini.' USING ERRCODE = '42501';
  END IF;

  -- 4. Verify payment method is QRIS
  IF lower(coalesce(v_order.payment_method, '')) <> 'qris' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Hanya pesanan dengan metode pembayaran QRIS yang dapat dikonfirmasi.' USING ERRCODE = '22023';
  END IF;

  -- 5. Check idempotency: If already paid, return safe idempotent success without modifying again
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'payment_status', 'paid',
      'already_confirmed', true,
      'message', 'Pembayaran QRIS sudah dikonfirmasi sebelumnya.'
    );
  END IF;

  -- 6. Enforce state transition: Only 'pending' can transition to 'paid'
  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS: Status pembayaran (%) tidak valid untuk dikonfirmasi.', v_order.payment_status USING ERRCODE = '22023';
  END IF;

  -- 7. Atomic conditional update: Concurrency-safe update
  UPDATE public.orders
  SET 
    payment_status = 'paid',
    updated_at = now()
  WHERE id = p_order_id
    AND payment_method = 'qris'
    AND payment_status = 'pending'
    AND business_id = v_order.business_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Check if concurrent request already updated it to 'paid'
    SELECT payment_status INTO v_order.payment_status FROM public.orders WHERE id = p_order_id;
    IF v_order.payment_status = 'paid' THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'payment_status', 'paid',
        'already_confirmed', true,
        'message', 'Pembayaran QRIS sudah dikonfirmasi sebelumnya.'
      );
    END IF;

    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Terjadi konflik status saat mengonfirmasi pesanan.' USING ERRCODE = '40001';
  END IF;

  -- 8. Write payment transaction record if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payments 
      WHERE order_id = p_order_id AND payment_status = 'paid'
    ) THEN
      INSERT INTO public.payments (
        order_id,
        business_id,
        payment_provider,
        payment_method,
        gross_amount,
        payment_status,
        paid_at,
        created_at,
        updated_at
      ) VALUES (
        p_order_id,
        v_order.business_id,
        'manual_qris',
        'qris',
        v_order.total,
        'paid',
        now(),
        now(),
        now()
      );
    END IF;
  END IF;

  -- 9. Return sanitized result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_status', 'paid',
    'already_confirmed', false,
    'message', 'Pembayaran QRIS berhasil dikonfirmasi.'
  );
END;
$$;

-- Restrict execution: Revoke public execution, grant only to authenticated role
REVOKE EXECUTE ON FUNCTION public.confirm_qris_payment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_qris_payment(uuid) TO authenticated;

-- Comment for PostgREST API documentation
COMMENT ON FUNCTION public.confirm_qris_payment(uuid) IS 'Server-side authorized payment confirmation for QRIS orders by business owners.';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
