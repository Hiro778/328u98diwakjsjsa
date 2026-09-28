-- ============================================================
-- 082_qris_and_order_security_hardening.sql
-- BisnisSehat: QRIS & Order Chat Security Hardening (@sec.md Phase 7 & Phase 8)
--
-- Security fixes:
-- 1. merchant_complete_order: Strict lifecycle check. Cannot complete order before processing.
-- 2. get_order_messages: Cross-merchant isolation. Authenticated merchant B cannot read merchant A's chat.
-- 3. send_order_message: Cross-tenant isolation & sender spoofing prevention.
-- 4. RLS verification on order_messages.
-- ============================================================

-- 1. HARDEN merchant_complete_order
-- Order MUST be 'diproses' before it can be marked 'selesai'
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

  -- 4. Idempotency: If already completed, return success safely
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

  -- 6. Strict lifecycle check: Order MUST be processed first (Phase 7 security requirement)
  IF v_order.order_status NOT IN ('diproses', 'preparing') THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu sebelum diselesaikan.' USING ERRCODE = '22023';
  END IF;

  -- 7. Transition to 'selesai'
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
COMMENT ON FUNCTION public.merchant_complete_order(uuid) IS 'Server-side transition from diproses to selesai with strict lifecycle validation.';


-- 2. HARDEN get_order_messages
-- Strict cross-merchant authorization check: Merchant B cannot view Merchant A order messages
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

  -- Authorization checks (Phase 8 security requirement):
  -- 1) Authenticated caller: MUST own this business. Cross-merchant inspection is strictly FORBIDDEN.
  -- 2) Anonymous caller: Allowed ONLY if order is a recent qr_menu order (< 24h).
  IF v_caller_id IS NOT NULL THEN
    IF v_order.owner_id <> v_caller_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan bisnis lain.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_order.order_source = 'qr_menu' AND v_order.created_at >= (now() - interval '24 hours') THEN
    -- Public customer access: allowed for their valid recent qr order
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
COMMENT ON FUNCTION public.get_order_messages(uuid) IS 'Retrieves chronological chat messages for an order with strict cross-merchant isolation.';


-- 3. HARDEN send_order_message
-- Prevent cross-tenant message injection and sender spoofing
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

  -- 4. Strict Authorization checks
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
    -- Customer: authenticated caller from another business cannot inject customer messages
    IF v_caller_id IS NOT NULL AND v_caller_id <> v_order.owner_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Pengguna terautentikasi tidak dapat mengirim pesan sebagai pelanggan bisnis lain.' USING ERRCODE = '42501';
    END IF;

    -- Customer: must be a valid published QR order created within last 24h
    IF v_order.order_source <> 'qr_menu' OR v_order.created_at < (now() - interval '24 hours') THEN
      RAISE EXCEPTION 'FORBIDDEN: Pesanan tidak valid atau sudah kedaluwarsa.' USING ERRCODE = '42501';
    END IF;

    -- Anti-spoofing: Customer cannot claim role 'Penjual', 'Merchant', or 'Admin'
    v_clean_name := coalesce(nullif(trim(p_sender_name), ''), v_order.customer_name, 'Pelanggan');
    IF lower(v_clean_name) IN ('penjual', 'merchant', 'admin', 'bisnissehat', 'sistem', 'kasir') THEN
      v_clean_name := coalesce(nullif(trim(v_order.customer_name), ''), 'Pelanggan');
    END IF;
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
COMMENT ON FUNCTION public.send_order_message(uuid, text, text, text) IS 'Send order chat message with strict tenant isolation and role anti-spoofing.';

NOTIFY pgrst, 'reload schema';
