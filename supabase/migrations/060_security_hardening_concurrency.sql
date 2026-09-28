-- ============================================================
-- 060_security_hardening_concurrency.sql
-- BisnisSehat Security Audit Hardening (Conforms to bug.md)
-- 1. Database-level constraints for non-negative inventory & positive order qty
-- 2. Hardened atomic create_pos_order with FOR UPDATE lock & search_path = ''
-- 3. Hardened atomic create_public_order with idempotency & FOR UPDATE lock
-- 4. Hardened adjust_stock & deduct_creative_credits_atomic with search_path = ''
-- ============================================================

-- ══════════════════════════════════════════════════════════
-- 1. DATABASE INVARIANTS & CHECK CONSTRAINTS (bug.md Section 2 & 15)
-- ══════════════════════════════════════════════════════════

-- Ensure no existing dirty data violates constraint before adding
UPDATE public.inventory
SET quantity = 0
WHERE quantity < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_inventory_quantity_non_negative'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT check_inventory_quantity_non_negative
      CHECK (quantity >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_order_items_quantity_positive'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT check_order_items_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════
-- 2. HARDENED ATOMIC POS ORDER CREATION (bug.md Section 1, 3, 4, 13)
-- ══════════════════════════════════════════════════════════

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
SET search_path = ''
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
  v_inv record;
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

  -- 4. Calculate Subtotal with Server-Side Price & Row-Locked Stock Verification
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
      RAISE EXCEPTION 'Pelanggaran isolasi tenant: Produk % bukan milik bisnis ini', v_prod.name USING ERRCODE = '42501';
    END IF;

    IF v_prod.is_available IS FALSE THEN
      RAISE EXCEPTION 'Produk % sedang tidak tersedia', v_prod.name USING ERRCODE = '23514';
    END IF;

    -- ATOMIC STOCK LOCK & VALIDATION (Anti-Overselling / Anti-Race Condition)
    SELECT id, quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_item_prod_id
    FOR UPDATE;

    IF FOUND AND v_inv.quantity IS NOT NULL THEN
      IF v_inv.quantity < v_item_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok tidak mencukupi untuk % (tersedia %, diminta %)',
          v_prod.name, v_inv.quantity, v_item_qty
          USING ERRCODE = '23514';
      END IF;
    END IF;

    v_unit_price := coalesce(v_prod.unit_price, 0);
    v_line_subtotal := v_unit_price * v_item_qty;
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  -- 5. Calculate Discount and Total (Server Authoritative)
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

    -- Decrement inventory strictly and safely
    UPDATE public.inventory
    SET quantity = quantity - v_item_qty,
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

GRANT EXECUTE ON FUNCTION public.create_pos_order(uuid, jsonb, uuid, uuid, text, text, numeric, text, text, text) TO authenticated;

-- ══════════════════════════════════════════════════════════
-- 3. HARDENED ATOMIC PUBLIC QR ORDER CREATION (bug.md Section 1, 3, 4)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_customer_name text DEFAULT '',
  p_table_id uuid DEFAULT NULL,
  p_notes text DEFAULT '',
  p_checkout_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_biz record;
  v_existing_order record;
  v_existing_items jsonb;
  v_item jsonb;
  v_item_prod_id uuid;
  v_item_qty integer;
  v_item_variants jsonb;
  v_prod record;
  v_inv record;
  v_notes_json jsonb;
  v_base_price numeric(15,2);
  v_final_unit_price numeric(15,2);
  v_discount_amount numeric(15,2);
  v_disc_type text;
  v_disc_val numeric(15,2);
  v_disc_pub boolean;
  v_disc_start timestamptz;
  v_disc_end timestamptz;
  v_var_group jsonb;
  v_var_opt jsonb;
  v_sel_opt_name text;
  v_var_summary text;
  v_full_item_name text;
  v_line_subtotal numeric(15,2);
  v_order_subtotal numeric(15,2) := 0;
  v_order record;
  v_inserted_items jsonb := '[]'::jsonb;
  v_inserted_item record;
BEGIN
  -- 1. Validate business exists & menu is published
  SELECT id, is_menu_published, name INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  IF v_biz.is_menu_published IS NOT TRUE THEN
    RAISE EXCEPTION 'Menu bisnis belum dipublikasikan' USING ERRCODE = '42501';
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

  -- 3. Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang belanja tidak boleh kosong' USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate order total & validate each item with stock lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);
    v_item_variants := coalesce(v_item->'selected_variants', '{}'::jsonb);

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih dari 0' USING ERRCODE = '22023';
    END IF;

    -- Fetch product
    SELECT id, business_id, name, unit_price, is_available, is_active, notes
    INTO v_prod
    FROM public.products
    WHERE id = v_item_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk dengan ID % tidak ditemukan', v_item_prod_id USING ERRCODE = '42501';
    END IF;

    -- TENANT ISOLATION CHECK
    IF v_prod.business_id <> p_business_id THEN
      RAISE EXCEPTION 'Pelanggaran isolasi tenant: Produk % bukan milik bisnis ini', v_prod.name
        USING ERRCODE = '42501';
    END IF;

    -- AVAILABILITY CHECK
    IF v_prod.is_available IS FALSE THEN
      RAISE EXCEPTION 'Produk % sedang tidak tersedia', v_prod.name USING ERRCODE = '23514';
    END IF;

    -- STOCK INTEGRITY CHECK (via inventory row lock FOR UPDATE)
    SELECT id, quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_item_prod_id
    FOR UPDATE;

    IF FOUND AND v_inv.quantity IS NOT NULL THEN
      IF v_inv.quantity < v_item_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok tidak mencukupi untuk % (sisa %, diminta %)',
          v_prod.name, v_inv.quantity, v_item_qty
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- SERVER-SIDE PRICE INTEGRITY
    v_base_price := coalesce(v_prod.unit_price, 0);

    -- Parse metadata from notes
    BEGIN
      v_notes_json := v_prod.notes::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_notes_json := '{}'::jsonb;
    END;

    -- Discount calculation
    v_discount_amount := 0;
    IF v_notes_json->'discount' IS NOT NULL THEN
      v_disc_type := v_notes_json->'discount'->>'type';
      v_disc_val := coalesce((v_notes_json->'discount'->>'value')::numeric, 0);
      v_disc_pub := coalesce((v_notes_json->'discount'->>'is_published')::boolean, false);
      v_disc_start := (v_notes_json->'discount'->>'start_at')::timestamptz;
      v_disc_end := (v_notes_json->'discount'->>'end_at')::timestamptz;

      IF v_disc_pub IS TRUE
         AND (v_disc_start IS NULL OR now() >= v_disc_start)
         AND (v_disc_end IS NULL OR now() <= v_disc_end)
         AND v_disc_val > 0 THEN
        IF v_disc_type = 'percentage' THEN
          v_discount_amount := round(v_base_price * (v_disc_val / 100.0), 2);
        ELSIF v_disc_type = 'fixed' THEN
          v_discount_amount := least(v_disc_val, v_base_price);
        END IF;
      END IF;
    END IF;

    v_final_unit_price := greatest(0, v_base_price - v_discount_amount);

    -- Variant calculations & snapshot
    v_var_summary := '';
    IF v_notes_json->'variant_groups' IS NOT NULL AND jsonb_typeof(v_notes_json->'variant_groups') = 'array' THEN
      FOR v_var_group IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        IF v_sel_opt_name IS NOT NULL AND v_sel_opt_name <> '' THEN
          IF v_var_summary <> '' THEN
            v_var_summary := v_var_summary || ', ';
          END IF;
          v_var_summary := v_var_summary || (v_var_group->>'name') || ': ' || v_sel_opt_name;

          IF v_var_group->'options' IS NOT NULL AND jsonb_typeof(v_var_group->'options') = 'array' THEN
            FOR v_var_opt IN SELECT * FROM jsonb_array_elements(v_var_group->'options')
            LOOP
              IF (v_var_opt->>'name') = v_sel_opt_name THEN
                v_final_unit_price := v_final_unit_price + coalesce((v_var_opt->>'price_adjustment')::numeric, 0);
              END IF;
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_full_item_name := v_prod.name;
    IF v_var_summary <> '' THEN
      v_full_item_name := v_full_item_name || ' (' || v_var_summary || ')';
    END IF;

    v_line_subtotal := v_final_unit_price * v_item_qty;
    v_order_subtotal := v_order_subtotal + v_line_subtotal;
  END LOOP;

  -- 5. Create Order record
  INSERT INTO public.orders (
    business_id,
    table_id,
    customer_name,
    order_source,
    order_status,
    payment_method,
    payment_status,
    subtotal,
    total,
    notes,
    checkout_request_id
  ) VALUES (
    p_business_id,
    p_table_id,
    coalesce(p_customer_name, ''),
    'qr_menu',
    'pending',
    coalesce(p_payment_method, 'cash'),
    'pending',
    v_order_subtotal,
    v_order_subtotal,
    coalesce(p_notes, ''),
    nullif(trim(p_checkout_request_id), '')
  ) RETURNING * INTO v_order;

  -- 6. Insert order_items and update inventory
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);
    v_item_variants := coalesce(v_item->'selected_variants', '{}'::jsonb);

    SELECT id, business_id, name, unit_price, is_available, is_active, notes
    INTO v_prod
    FROM public.products
    WHERE id = v_item_prod_id;

    v_base_price := coalesce(v_prod.unit_price, 0);
    BEGIN
      v_notes_json := v_prod.notes::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_notes_json := '{}'::jsonb;
    END;

    -- Discount
    v_discount_amount := 0;
    IF v_notes_json->'discount' IS NOT NULL THEN
      v_disc_type := v_notes_json->'discount'->>'type';
      v_disc_val := coalesce((v_notes_json->'discount'->>'value')::numeric, 0);
      v_disc_pub := coalesce((v_notes_json->'discount'->>'is_published')::boolean, false);
      v_disc_start := (v_notes_json->'discount'->>'start_at')::timestamptz;
      v_disc_end := (v_notes_json->'discount'->>'end_at')::timestamptz;

      IF v_disc_pub IS TRUE
         AND (v_disc_start IS NULL OR now() >= v_disc_start)
         AND (v_disc_end IS NULL OR now() <= v_disc_end)
         AND v_disc_val > 0 THEN
        IF v_disc_type = 'percentage' THEN
          v_discount_amount := round(v_base_price * (v_disc_val / 100.0), 2);
        ELSIF v_disc_type = 'fixed' THEN
          v_discount_amount := least(v_disc_val, v_base_price);
        END IF;
      END IF;
    END IF;

    v_final_unit_price := greatest(0, v_base_price - v_discount_amount);

    -- Variant summary & extra
    v_var_summary := '';
    IF v_notes_json->'variant_groups' IS NOT NULL AND jsonb_typeof(v_notes_json->'variant_groups') = 'array' THEN
      FOR v_var_group IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        IF v_sel_opt_name IS NOT NULL AND v_sel_opt_name <> '' THEN
          IF v_var_summary <> '' THEN
            v_var_summary := v_var_summary || ', ';
          END IF;
          v_var_summary := v_var_summary || (v_var_group->>'name') || ': ' || v_sel_opt_name;

          IF v_var_group->'options' IS NOT NULL AND jsonb_typeof(v_var_group->'options') = 'array' THEN
            FOR v_var_opt IN SELECT * FROM jsonb_array_elements(v_var_group->'options')
            LOOP
              IF (v_var_opt->>'name') = v_sel_opt_name THEN
                v_final_unit_price := v_final_unit_price + coalesce((v_var_opt->>'price_adjustment')::numeric, 0);
              END IF;
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;

    v_full_item_name := v_prod.name;
    IF v_var_summary <> '' THEN
      v_full_item_name := v_full_item_name || ' (' || v_var_summary || ')';
    END IF;

    v_line_subtotal := v_final_unit_price * v_item_qty;

    -- Insert order item with variant snapshot
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      variant_details
    ) VALUES (
      v_order.id,
      v_item_prod_id,
      v_full_item_name,
      v_item_qty,
      v_final_unit_price,
      v_line_subtotal,
      v_item_variants
    ) RETURNING * INTO v_inserted_item;

    v_inserted_items := v_inserted_items || to_jsonb(v_inserted_item);

    -- Inventory decrement strictly and safely
    UPDATE public.inventory
    SET quantity = quantity - v_item_qty,
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

GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, text, text, uuid, text, text) TO anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════
-- 4. HARDENED ADJUST_STOCK RPC (bug.md Section 1 & 13)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text DEFAULT '',
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inventory record;
  v_new_stock integer;
  v_business_id uuid;
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();

  SELECT i.id, i.quantity, i.product_id, p.business_id
  INTO v_inventory
  FROM public.inventory i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.product_id = p_product_id
  FOR UPDATE OF i;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Produk tidak ditemukan di persediaan');
  END IF;

  v_business_id := v_inventory.business_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_id AND owner_id = v_current_user
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Akses ditolak');
  END IF;

  CASE p_movement_type
    WHEN 'stock_in', 'adjustment_increase' THEN
      v_new_stock := v_inventory.quantity + p_quantity;
    WHEN 'stock_out', 'adjustment_decrease' THEN
      v_new_stock := v_inventory.quantity - p_quantity;
    ELSE
      RETURN json_build_object('success', false, 'error', 'Tipe gerakan tidak valid');
  END CASE;

  IF v_new_stock < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Stok tidak boleh negatif. Stok saat ini: ' || v_inventory.quantity || ', diminta: ' || p_quantity
    );
  END IF;

  UPDATE public.inventory
  SET quantity = v_new_stock, updated_at = now()
  WHERE id = v_inventory.id;

  INSERT INTO public.stock_movements (
    product_id, business_id, movement_type, quantity,
    stock_before, stock_after, reason,
    reference_type, reference_id, created_by
  ) VALUES (
    p_product_id, v_business_id, p_movement_type, p_quantity,
    v_inventory.quantity, v_new_stock, p_reason,
    p_reference_type, p_reference_id, v_current_user
  );

  RETURN json_build_object('success', true, 'new_stock', v_new_stock);
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 5. HARDENED DEDUCT_CREATIVE_CREDITS_ATOMIC (bug.md Section 5, 6, 13)
-- ══════════════════════════════════════════════════════════

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
  v_available integer;
  v_consumed integer;
  v_new_balance integer;
BEGIN
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
