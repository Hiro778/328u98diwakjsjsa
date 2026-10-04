-- 103_fix_bidirectional_order_chat.sql
-- Enables bidirectional Buyer <-> Seller order chat immediately after QRIS / order placement
-- Allows chat for active orders with status 'pending', 'baru', 'diproses', 'preparing'
-- Preserves chat closure on 'selesai', 'completed', 'dibatalkan', 'cancelled'

-- 1. Hardened send_order_message: Support pending/baru QR orders
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
  v_new_msg record;
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

  -- 3. Chat is active while order is active ('pending', 'baru', 'diproses', 'preparing')
  IF v_order.order_status NOT IN ('pending', 'baru', 'diproses', 'preparing') THEN
    IF v_order.order_status IN ('selesai', 'completed') THEN
      RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan sudah selesai.' USING ERRCODE = '22023';
    ELSIF v_order.order_status IN ('dibatalkan', 'cancelled') THEN
      RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan dibatalkan.' USING ERRCODE = '22023';
    ELSE
      RAISE EXCEPTION 'CHAT_NOT_ACTIVE: Obrolan tidak aktif untuk status pesanan ini.' USING ERRCODE = '22023';
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
  )
  RETURNING * INTO v_new_msg;

  RETURN jsonb_build_object(
    'success', true,
    'message', to_jsonb(v_new_msg)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_order_message(uuid, text, text, text) TO anon, authenticated;
COMMENT ON FUNCTION public.send_order_message(uuid, text, text, text) IS 'Send order chat message with strict tenant isolation, role anti-spoofing, and support for pending/diproses orders.';

-- 2. Update Customer Insert RLS Policy on order_messages
DROP POLICY IF EXISTS "order_messages_customer_insert" ON public.order_messages;
CREATE POLICY "order_messages_customer_insert"
  ON public.order_messages FOR INSERT TO public
  WITH CHECK (
    sender_type = 'customer'
    AND order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.businesses b ON b.id = o.business_id
      WHERE b.is_menu_published = true
        AND o.order_source = 'qr_menu'
        AND o.order_status IN ('pending', 'baru', 'diproses', 'preparing')
        AND o.created_at >= (now() - interval '24 hours')
    )
  );

-- 3. Replica Identity Full & Realtime Publication for order_messages
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'order_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
  END IF;
END $$;
