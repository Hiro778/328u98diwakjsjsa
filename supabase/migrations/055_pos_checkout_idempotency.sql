-- ============================================================
-- 055_pos_checkout_idempotency.sql
-- Atomic, Idempotent POS Order Creation & Unique Request Tracking
-- ============================================================

-- 1. Add checkout_request_id column to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_request_id text;

-- 2. Create partial unique index on (business_id, checkout_request_id)
-- Guarantees that the same checkout request cannot create duplicate orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_business_checkout_request_id
  ON public.orders (business_id, checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

-- 3. Atomic POS Order Creation RPC Function
CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_business_id uuid,
  p_items jsonb,
  p_table_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT '',
  p_discount_type text DEFAULT '',
  p_discount_value numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT '',
  p_checkout_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_biz record;
  v_existing_order record;
  v_existing_items jsonb;
  v_item jsonb;
  v_item_prod_id uuid;
  v_item_qty integer;
  v_prod record;
  v_unit_price numeric(15,2);
  v_line_subtotal numeric(15,2);
  v_subtotal numeric(15,2) := 0;
  v_discount_amount numeric(15,2) := 0;
  v_total numeric(15,2) := 0;
  v_order record;
  v_inserted_items jsonb := '[]'::jsonb;
  v_inserted_item record;
BEGIN
  -- 1. Authentication & Strict Tenant Isolation Check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_id, name INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan atau Anda tidak memiliki hak akses' USING ERRCODE = '42501';
  END IF;

  -- 2. Idempotency Check: return existing order if same checkout_request_id was already processed
  IF p_checkout_request_id IS NOT NULL AND trim(p_checkout_request_id) <> '' THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE business_id = p_business_id
      AND checkout_request_id = trim(p_checkout_request_id);

    IF FOUND THEN
      SELECT jsonb_agg(to_jsonb(oi)) INTO v_existing_items
      FROM public.order_items oi
      WHERE oi.order_id = v_existing_order.id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order', to_jsonb(v_existing_order),
        'items', coalesce(v_existing_items, '[]'::jsonb)
      );
    END IF;
  END IF;

  -- 3. Items validation
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang pesanan tidak boleh kosong' USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate Subtotal with Server-Side Price Verification
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih besar dari 0' USING ERRCODE = '22023';
    END IF;

    SELECT id, business_id, name, unit_price, is_available
    INTO v_prod
    FROM public.products
    WHERE id = v_item_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk dengan ID % tidak ditemukan', v_item_prod_id USING ERRCODE = '42501';
    END IF;

    IF v_prod.business_id <> p_business_id THEN
      RAISE EXCEPTION 'Produk % bukan milik bisnis ini', v_prod.name USING ERRCODE = '42501';
    END IF;

    v_unit_price := coalesce(v_prod.unit_price, 0);
    v_line_subtotal := v_unit_price * v_item_qty;
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  -- 5. Calculate Discount and Total
  IF p_discount_type = 'percent' THEN
    v_discount_amount := round((v_subtotal * (coalesce(p_discount_value, 0) / 100.0)), 2);
  ELSIF p_discount_type = 'nominal' THEN
    v_discount_amount := least(coalesce(p_discount_value, 0), v_subtotal);
  ELSE
    v_discount_amount := 0;
  END IF;
  v_total := greatest(0, v_subtotal - v_discount_amount);

  -- 6. Insert Order Record
  INSERT INTO public.orders (
    business_id,
    table_id,
    customer_name,
    order_source,
    order_status,
    payment_method,
    payment_status,
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    total,
    notes,
    checkout_request_id
  ) VALUES (
    p_business_id,
    p_table_id,
    coalesce(p_customer_name, ''),
    'pos',
    'pending',
    coalesce(p_payment_method, 'cash'),
    'pending',
    v_subtotal,
    coalesce(p_discount_type, ''),
    coalesce(p_discount_value, 0),
    v_discount_amount,
    v_total,
    coalesce(p_notes, ''),
    nullif(trim(p_checkout_request_id), '')
  ) RETURNING * INTO v_order;

  -- 7. Insert order_items and update inventory atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);

    SELECT name, unit_price INTO v_prod
    FROM public.products
    WHERE id = v_item_prod_id;

    v_unit_price := coalesce(v_prod.unit_price, 0);
    v_line_subtotal := v_unit_price * v_item_qty;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal
    ) VALUES (
      v_order.id,
      v_item_prod_id,
      v_prod.name,
      v_item_qty,
      v_unit_price,
      v_line_subtotal
    ) RETURNING * INTO v_inserted_item;

    v_inserted_items := v_inserted_items || jsonb_build_array(to_jsonb(v_inserted_item));

    -- Decrement inventory if tracked
    UPDATE public.inventory
    SET quantity = greatest(0, quantity - v_item_qty),
        updated_at = now()
    WHERE product_id = v_item_prod_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order', to_jsonb(v_order),
    'items', v_inserted_items
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_pos_order(uuid, jsonb, uuid, uuid, text, text, numeric, text, text, text) TO authenticated;
