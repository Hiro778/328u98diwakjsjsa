-- ============================================================
-- 079_order_processing_and_chat.sql
-- BisnisSehat: QRIS Rework & Food-Ordering Flow Rework (@fix.md)
--
-- Features implemented:
-- 1. Merchant-owned QRIS: Atomic merchant confirmation on "PROSES"
-- 2. Simplified order lifecycle: BARU -> DIPROSES -> SELESAI (READY/SIAP removed)
-- 3. Dedicated customer <-> merchant order chat (public.order_messages)
-- 4. Server-side atomic RPCs with strict tenant isolation & security definer
-- 5. Realtime support for orders & order_messages
-- ============================================================

-- 1. Create order_messages table
CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'merchant')),
  sender_name text NOT NULL DEFAULT '',
  message text NOT NULL CHECK (length(trim(message)) > 0 AND length(message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lightning fast lookups & realtime filter
CREATE INDEX IF NOT EXISTS idx_order_messages_order_created 
  ON public.order_messages(order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_order_messages_biz_created 
  ON public.order_messages(business_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Drop any previous policies
DROP POLICY IF EXISTS "order_messages_merchant_select" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_merchant_insert" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_customer_select" ON public.order_messages;
DROP POLICY IF EXISTS "order_messages_customer_insert" ON public.order_messages;

-- RLS: Merchant select (only for businesses they own)
CREATE POLICY "order_messages_merchant_select"
  ON public.order_messages FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT b.id FROM public.businesses b
      WHERE b.owner_id = (SELECT auth.uid())
    )
  );

-- RLS: Merchant insert (only for businesses they own and sender_type = merchant)
CREATE POLICY "order_messages_merchant_insert"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'merchant'
    AND business_id IN (
      SELECT b.id FROM public.businesses b
      WHERE b.owner_id = (SELECT auth.uid())
    )
  );

-- RLS: Customer select (only for published qr_menu orders within 24 hours)
CREATE POLICY "order_messages_customer_select"
  ON public.order_messages FOR SELECT TO public
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.businesses b ON b.id = o.business_id
      WHERE b.is_menu_published = true
        AND o.order_source = 'qr_menu'
        AND o.created_at >= (now() - interval '24 hours')
    )
  );

-- RLS: Customer insert (only for processing qr_menu orders within 24 hours)
CREATE POLICY "order_messages_customer_insert"
  ON public.order_messages FOR INSERT TO public
  WITH CHECK (
    sender_type = 'customer'
    AND order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.businesses b ON b.id = o.business_id
      WHERE b.is_menu_published = true
        AND o.order_source = 'qr_menu'
        AND o.order_status = 'diproses'
        AND o.created_at >= (now() - interval '24 hours')
    )
  );

-- Enable Supabase Realtime for order_messages
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ============================================================
-- 2. RPC: merchant_process_order
-- Atomically confirms QRIS payment + begins order processing
-- ============================================================
CREATE OR REPLACE FUNCTION public.merchant_process_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_order record;
  v_rows_updated integer;
  v_new_payment_status text;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Autentikasi diperlukan.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify account access (banned-user zero-access compliance)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
    IF NOT public.is_account_access_allowed(v_caller_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Verify order exists and caller owns the business
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
    RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki izin untuk memproses pesanan bisnis ini.' USING ERRCODE = '42501';
  END IF;

  -- 4. Check idempotency: If already in 'diproses', return success safely
  IF v_order.order_status = 'diproses' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'order_status', 'diproses',
      'payment_status', v_order.payment_status,
      'already_processed', true,
      'message', 'Pesanan sudah sedang diproses.'
    );
  END IF;

  -- 5. Prevent processing cancelled or completed orders
  IF v_order.order_status IN ('dibatalkan', 'cancelled', 'selesai', 'completed') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: Pesanan dengan status % tidak dapat diproses.', v_order.order_status
      USING ERRCODE = '22023';
  END IF;

  v_new_payment_status := v_order.payment_status;

  -- 6. Atomic QRIS confirmation:
  -- If order uses QRIS and payment is pending, merchant "Proses" confirms payment received
  IF lower(coalesce(v_order.payment_method, '')) = 'qris' AND v_order.payment_status = 'pending' THEN
    v_new_payment_status := 'paid';

    -- Insert into payments table if exists
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
  END IF;

  -- 7. Update order status atomically
  UPDATE public.orders
  SET 
    order_status = 'diproses',
    payment_status = v_new_payment_status,
    updated_at = now()
  WHERE id = p_order_id
    AND business_id = v_order.business_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Terjadi konflik saat memproses pesanan.' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_status', 'diproses',
    'payment_status', v_new_payment_status,
    'already_processed', false,
    'message', 'Pesanan berhasil dikonfirmasi dan mulai diproses.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merchant_process_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.merchant_process_order(uuid) TO authenticated;
COMMENT ON FUNCTION public.merchant_process_order(uuid) IS 'Server-side atomic transition from pending to diproses with QRIS payment confirmation.';


-- ============================================================
-- 3. RPC: merchant_complete_order
-- Atomically transitions order to 'selesai'
-- ============================================================
CREATE OR REPLACE FUNCTION public.merchant_complete_order(p_order_id uuid)
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

  -- 2. Verify account access
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
    IF NOT public.is_account_access_allowed(v_caller_id) THEN
      RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Verify order exists and belongs to caller
  SELECT 
    o.id, 
    o.business_id, 
    o.order_status, 
    b.owner_id
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pesanan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.owner_id <> v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki izin untuk menyelesaikan pesanan bisnis ini.' USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency: If already completed, return success
  IF v_order.order_status IN ('selesai', 'completed') THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'order_status', 'selesai',
      'already_completed', true,
      'message', 'Pesanan sudah diselesaikan sebelumnya.'
    );
  END IF;

  -- 5. Prevent completing cancelled orders
  IF v_order.order_status IN ('dibatalkan', 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: Pesanan yang dibatalkan tidak dapat diselesaikan.' USING ERRCODE = '22023';
  END IF;

  -- 6. Transition to 'selesai'
  UPDATE public.orders
  SET 
    order_status = 'selesai',
    updated_at = now()
  WHERE id = p_order_id
    AND business_id = v_order.business_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Terjadi konflik saat menyelesaikan pesanan.' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_status', 'selesai',
    'already_completed', false,
    'message', 'Pesanan berhasil diselesaikan.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merchant_complete_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.merchant_complete_order(uuid) TO authenticated;
COMMENT ON FUNCTION public.merchant_complete_order(uuid) IS 'Server-side transition from diproses to selesai.';


-- ============================================================
-- 4. RPC: send_order_message
-- Enables customer or merchant to post a chat message for an active order
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_order_message(
  p_order_id uuid,
  p_sender_type text,
  p_sender_name text,
  p_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_order record;
  v_clean_msg text;
  v_clean_name text;
  v_msg_row record;
BEGIN
  -- 1. Input sanitization & validation
  v_clean_msg := trim(coalesce(p_message, ''));
  IF length(v_clean_msg) = 0 THEN
    RAISE EXCEPTION 'EMPTY_MESSAGE: Pesan obrolan tidak boleh kosong.' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean_msg) > 2000 THEN
    RAISE EXCEPTION 'MESSAGE_TOO_LONG: Pesan tidak boleh melebihi 2000 karakter.' USING ERRCODE = '22023';
  END IF;

  IF p_sender_type NOT IN ('customer', 'merchant') THEN
    RAISE EXCEPTION 'INVALID_SENDER: Pengirim harus customer atau merchant.' USING ERRCODE = '22023';
  END IF;

  -- 2. Verify order exists
  SELECT 
    o.id, 
    o.business_id, 
    o.customer_name, 
    o.order_status, 
    o.order_source,
    o.created_at,
    b.name AS business_name, 
    b.owner_id, 
    b.is_menu_published
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pesanan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Chat is only active while order is being processed ('diproses')
  IF v_order.order_status NOT IN ('diproses', 'preparing') THEN
    IF v_order.order_status IN ('selesai', 'completed') THEN
      RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan sudah selesai.' USING ERRCODE = '22023';
    ELSIF v_order.order_status IN ('dibatalkan', 'cancelled') THEN
      RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan dibatalkan.' USING ERRCODE = '22023';
    ELSE
      RAISE EXCEPTION 'CHAT_NOT_ACTIVE: Obrolan baru aktif setelah pesanan mulai diproses penjual.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 4. Authorization checks
  v_caller_id := (SELECT auth.uid());

  IF p_sender_type = 'merchant' THEN
    -- Merchant MUST be authenticated and own this business
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Autentikasi diperlukan untuk penjual.' USING ERRCODE = '42501';
    END IF;
    IF v_order.owner_id <> v_caller_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Anda bukan pemilik bisnis pesanan ini.' USING ERRCODE = '42501';
    END IF;
    v_clean_name := coalesce(nullif(trim(p_sender_name), ''), v_order.business_name, 'Penjual');
  ELSE
    -- Customer: must be a valid published QR order created within last 24h
    IF v_order.order_source <> 'qr_menu' OR v_order.created_at < (now() - interval '24 hours') THEN
      RAISE EXCEPTION 'FORBIDDEN: Pesanan tidak valid atau sudah kedaluwarsa.' USING ERRCODE = '42501';
    END IF;
    v_clean_name := coalesce(nullif(trim(p_sender_name), ''), v_order.customer_name, 'Pelanggan');
  END IF;

  -- 5. Insert message
  INSERT INTO public.order_messages (
    order_id,
    business_id,
    sender_type,
    sender_name,
    message,
    created_at
  ) VALUES (
    p_order_id,
    v_order.business_id,
    p_sender_type,
    v_clean_name,
    v_clean_msg,
    now()
  ) RETURNING * INTO v_msg_row;

  RETURN jsonb_build_object(
    'success', true,
    'message', to_jsonb(v_msg_row)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_order_message(uuid, text, text, text) TO anon, authenticated;
COMMENT ON FUNCTION public.send_order_message(uuid, text, text, text) IS 'Send an order chat message between customer and merchant during processing.';


-- ============================================================
-- 5. RPC: get_order_messages
-- Fetches chronological chat messages for an order
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_order_messages(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_order record;
  v_messages jsonb;
BEGIN
  -- Verify order exists
  SELECT 
    o.id, 
    o.business_id, 
    o.order_source,
    o.created_at,
    b.owner_id, 
    b.is_menu_published
  INTO v_order
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pesanan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  v_caller_id := (SELECT auth.uid());

  -- Caller is authorized if:
  -- 1) Authenticated owner of the business, OR
  -- 2) Public visitor querying their recent valid qr_menu order (< 24 hours)
  IF v_caller_id IS NOT NULL AND v_order.owner_id = v_caller_id THEN
    -- Owner access: allowed
    NULL;
  ELSIF v_order.order_source = 'qr_menu' AND v_order.created_at >= (now() - interval '24 hours') THEN
    -- Customer access: allowed
    NULL;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan ini.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_messages
  FROM public.order_messages m
  WHERE m.order_id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'messages', v_messages
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_messages(uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.get_order_messages(uuid) IS 'Retrieves chronological chat messages for an order.';

NOTIFY pgrst, 'reload schema';
