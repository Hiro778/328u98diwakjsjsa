-- 087_fix_merchant_process_order_payment_column.sql
-- ROOT CAUSE FIX: merchant_process_order dalam migration 084 menggunakan kolom `amount`
-- yang tidak ada di public.payments. Kolom yang benar adalah `gross_amount`.
-- Juga menyelaraskan payment_status 'completed' → 'paid' agar konsisten dengan
-- migration 073, 080, dan PosPage.jsx.

-- Recreate merchant_process_order with correct column name
CREATE OR REPLACE FUNCTION public.merchant_process_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_biz record;
  v_user_id uuid;
  v_pos_module_enabled boolean := true;
  v_maint_mode boolean := false;
BEGIN
  -- A. ENFORCE MAINTENANCE MODE
  SELECT coalesce((value#>>'{}')::boolean, false) INTO v_maint_mode
  FROM public.platform_settings
  WHERE key = 'maintenance_mode';

  IF v_maint_mode IS TRUE AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode).'
      USING ERRCODE = '55P03';
  END IF;

  -- B. ENFORCE POS MODULE FLAG
  SELECT coalesce((value#>>'{}')::boolean, true) INTO v_pos_module_enabled
  FROM public.platform_settings
  WHERE key = 'enable_pos_module';

  IF v_pos_module_enabled IS FALSE AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'PLATFORM_POS_DISABLED: Modul POS sedang dinonaktifkan oleh administrator platform.'
      USING ERRCODE = '42501';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Anda harus login untuk memproses pesanan' USING ERRCODE = '42501';
  END IF;

  -- 1. Fetch order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Verify business ownership
  SELECT * INTO v_biz
  FROM public.businesses
  WHERE id = v_order.business_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik bisnis pesanan ini' USING ERRCODE = '42501';
  END IF;

  -- 3. Check order status eligibility
  IF v_order.order_status = 'selesai' THEN
    RAISE EXCEPTION 'Pesanan sudah selesai dan tidak dapat diproses ulang' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Idempotency: if already paid & diproses, return existing state
  IF v_order.payment_status = 'paid' AND v_order.order_status = 'diproses' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', v_order.id,
      'payment_status', 'paid',
      'order_status', 'diproses'
    );
  END IF;

  -- 5. Atomically update order
  UPDATE public.orders
  SET
    payment_status = 'paid',
    order_status = 'diproses',
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- 6. Insert payment settlement record
  -- FIX: gunakan kolom gross_amount (bukan amount yang tidak ada di schema)
  -- FIX: payment_status 'paid' (konsisten dengan migration 073, 080, dan client code)
  INSERT INTO public.payments (
    order_id,
    business_id,
    gross_amount,
    payment_method,
    payment_status,
    paid_at,
    created_at
  ) VALUES (
    v_order.id,
    v_order.business_id,
    v_order.total,
    v_order.payment_method,
    'paid',
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order.id,
    'payment_status', v_order.payment_status,
    'order_status', v_order.order_status,
    'total', v_order.total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_process_order(uuid) TO authenticated, service_role;
