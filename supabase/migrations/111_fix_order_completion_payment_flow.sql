-- ============================================================
-- 111_fix_order_completion_payment_flow.sql
-- BisnisSehat: Align Order Completion With Payment Flow (@122.md)
--
-- 1. Authoritative merchant_complete_order RPC with flow-aware settlement
-- 2. Concurrency-safe order row locking (SELECT ... FOR UPDATE OF o)
-- 3. Atomic merchant-controlled settlement (manual_qris / cash)
-- 4. Strict Midtrans validation: unpaid Midtrans orders remain BLOCKED
-- 5. Anti-tampering trigger: browser cannot mark Midtrans payments paid
-- 6. Preserves global payment prerequisite in enforce_order_state_transitions
-- ============================================================

-- ── 1. HARDEN ORDER STATE TRANSITIONS TRIGGER ──────────────────
-- Preserves the global security prerequisite that completed orders must be paid,
-- while explicitly protecting external gateway payments from browser tampering.
CREATE OR REPLACE FUNCTION public.enforce_order_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Prevent tenant migration (business_id tampering)
  IF OLD.business_id <> NEW.business_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Tenant business_id tidak dapat diubah.' USING ERRCODE = '42501';
  END IF;

  -- Prevent order_number tampering
  IF OLD.order_number <> NEW.order_number THEN
    RAISE EXCEPTION 'FORBIDDEN: Nomor pesanan tidak dapat diubah.' USING ERRCODE = '42501';
  END IF;

  -- 1. Terminal state protection: Selesai is final
  IF OLD.order_status IN ('selesai', 'completed') AND NEW.order_status NOT IN ('selesai', 'completed') THEN
    RAISE EXCEPTION 'STATE_VIOLATION: Pesanan yang telah selesai tidak dapat diubah kembali ke status %.', NEW.order_status
      USING ERRCODE = '22023';
  END IF;

  -- 2. Terminal state protection: Dibatalkan is final
  IF OLD.order_status IN ('dibatalkan', 'cancelled') AND NEW.order_status NOT IN ('dibatalkan', 'cancelled') THEN
    RAISE EXCEPTION 'STATE_VIOLATION: Pesanan yang telah dibatalkan tidak dapat diproses atau diselesaikan kembali.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Midtrans / Gateway Anti-Tampering: Browser/client cannot mark gateway payment as paid
  IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
     AND NEW.payment_status IN ('paid', 'lunas')
     AND (
       LOWER(COALESCE(NEW.payment_method, '')) IN ('online', 'midtrans')
       OR EXISTS (
         SELECT 1 FROM public.payments p
         WHERE p.order_id = NEW.id AND LOWER(COALESCE(p.payment_provider, '')) = 'midtrans'
       )
     ) THEN
    IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
      RAISE EXCEPTION 'FORBIDDEN: Status pembayaran gateway hanya dapat diperbarui oleh gateway pembayaran.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Global Payment prerequisite: cannot complete order without being paid
  IF NEW.order_status IN ('selesai', 'completed') AND NEW.payment_status NOT IN ('paid', 'lunas') THEN
    RAISE EXCEPTION 'STATE_VIOLATION: Pesanan tidak dapat diselesaikan tanpa status pembayaran lunas (paid).'
      USING ERRCODE = '22023';
  END IF;

  -- Auto-update updated_at timestamp
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_state_transitions ON public.orders;
CREATE TRIGGER trg_enforce_order_state_transitions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_state_transitions();


-- ── 2. RECREATE merchant_complete_order WITH FLOW-AWARE SETTLEMENT ─
CREATE OR REPLACE FUNCTION public.merchant_complete_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_order record;
  v_payment record;
  v_rows_updated integer;
  v_is_midtrans boolean := false;
  v_provider text;
BEGIN
  -- A. ENFORCE PLATFORM SETTINGS
  IF coalesce((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam pemeliharaan (maintenance mode).' USING ERRCODE = '55P03';
    END IF;
  END IF;

  IF coalesce((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'enable_pos_module'), true) IS FALSE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'POS_DISABLED: Modul POS saat ini sedang dinonaktifkan oleh administrator platform.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1. Authenticate caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Autentikasi diperlukan.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify account access
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
    IF NOT public.is_account_access_allowed(v_caller_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Lock order row FOR UPDATE and verify business ownership (concurrency lock)
  SELECT 
    o.id, 
    o.business_id, 
    o.order_number,
    o.order_status, 
    o.payment_method,
    o.payment_status,
    o.total,
    b.owner_id
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pesanan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki izin untuk menyelesaikan pesanan bisnis ini.' USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency: If already completed, return success safely
  IF v_order.order_status IN ('selesai', 'completed') THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'order_status', 'selesai',
      'payment_status', v_order.payment_status,
      'already_completed', true,
      'message', 'Pesanan sudah diselesaikan sebelumnya.'
    );
  END IF;

  -- 5. Prevent completing cancelled orders
  IF v_order.order_status IN ('dibatalkan', 'cancelled') THEN
    RAISE EXCEPTION 'STATE_VIOLATION: Pesanan yang telah dibatalkan tidak dapat diproses atau diselesaikan kembali.' USING ERRCODE = '22023';
  END IF;

  -- 6. Strict lifecycle check: Order MUST be processed first
  IF v_order.order_status NOT IN ('diproses', 'preparing') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu sebelum diselesaikan.' USING ERRCODE = '22023';
  END IF;

  -- 7. Inspect related public.payments record & determine actual payment flow
  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Determine if this order is managed by Midtrans / external gateway
  IF v_payment.id IS NOT NULL AND LOWER(COALESCE(v_payment.payment_provider, '')) = 'midtrans' THEN
    v_is_midtrans := true;
  ELSIF LOWER(COALESCE(v_order.payment_method, '')) IN ('online', 'midtrans') THEN
    v_is_midtrans := true;
  ELSE
    v_is_midtrans := false;
  END IF;

  -- 8. Payment Validation & Settlement based on flow
  IF v_is_midtrans THEN
    -- Midtrans / external gateway:
    -- Must already be paid/settlement via authoritative webhook
    IF v_order.payment_status NOT IN ('paid', 'lunas') 
       OR (v_payment.id IS NOT NULL AND v_payment.payment_status NOT IN ('paid', 'lunas', 'settlement')) THEN
      RAISE EXCEPTION 'STATE_VIOLATION: Pesanan tidak dapat diselesaikan tanpa status pembayaran lunas (paid).'
        USING ERRCODE = '22023';
    END IF;

    -- Midtrans is already paid; complete the order
    UPDATE public.orders
    SET 
      order_status = 'selesai',
      updated_at = now()
    WHERE id = p_order_id
      AND business_id = v_order.business_id;

  ELSE
    -- Merchant-controlled payment: manual_qris, cash
    -- Settle payment in public.payments first (or update existing pending)
    v_provider := CASE 
      WHEN LOWER(COALESCE(v_order.payment_method, '')) = 'qris' THEN 'manual_qris' 
      ELSE 'cash' 
    END;

    -- Update existing unsettled payment record if present
    IF v_payment.id IS NOT NULL AND v_payment.payment_status NOT IN ('paid', 'lunas', 'settlement') THEN
      UPDATE public.payments
      SET 
        payment_status = 'paid',
        payment_provider = COALESCE(NULLIF(payment_provider, ''), v_provider),
        paid_at = COALESCE(paid_at, now()),
        updated_at = now()
      WHERE id = v_payment.id;
    -- Or insert settlement payment if no payment record exists for this order
    ELSIF v_payment.id IS NULL THEN
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
        v_provider,
        COALESCE(NULLIF(v_order.payment_method, ''), 'cash'),
        v_order.total,
        'paid',
        now(),
        now(),
        now()
      );
    END IF;

    -- Atomically update order to selesai and paid
    UPDATE public.orders
    SET 
      order_status = 'selesai',
      payment_status = 'paid',
      updated_at = now()
    WHERE id = p_order_id
      AND business_id = v_order.business_id;

  END IF;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Terjadi konflik saat menyelesaikan pesanan.' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_status', 'selesai',
    'payment_status', 'paid',
    'already_completed', false,
    'message', 'Pesanan berhasil diselesaikan.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merchant_complete_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.merchant_complete_order(uuid) TO authenticated, service_role;

-- ── 3. NOTIFY SCHEMA RELOAD ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
