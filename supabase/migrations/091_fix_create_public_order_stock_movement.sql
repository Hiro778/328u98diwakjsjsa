-- ============================================================
-- 091_fix_create_public_order_stock_movement.sql
-- BisnisSehat: Fix stock_movements movement_type in create_public_order
-- Table stock_movements CHECK constraint requires:
-- movement_type IN ('stock_in', 'stock_out', 'adjustment_increase', 'adjustment_decrease')
-- ============================================================

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
  v_updated_notes jsonb;
  v_new_groups jsonb;
  v_grp_elem jsonb;
  v_opt_elem jsonb;
  v_new_opts jsonb;

  -- Platform Settings Enforcement Variables
  v_maint_mode boolean := false;
  v_pos_module_enabled boolean := true;
  v_qris_platform_enabled boolean := true;
  v_max_items integer := 100;
  v_total_qty integer := 0;
BEGIN
  -- A. ENFORCE MAINTENANCE MODE
  SELECT coalesce((value#>>'{}')::boolean, false) INTO v_maint_mode
  FROM public.platform_settings
  WHERE key = 'maintenance_mode';

  IF v_maint_mode IS TRUE AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Pemesanan publik dinonaktifkan sementara.'
      USING ERRCODE = '55P03';
  END IF;

  -- B. ENFORCE POS MODULE FLAG
  SELECT coalesce((value#>>'{}')::boolean, true) INTO v_pos_module_enabled
  FROM public.platform_settings
  WHERE key = 'enable_pos_module';

  IF v_pos_module_enabled IS FALSE AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'PLATFORM_POS_DISABLED: Modul POS dan pemesanan publik sedang dinonaktifkan oleh administrator platform.'
      USING ERRCODE = '42501';
  END IF;

  -- C. ENFORCE QRIS CHECKOUT FLAG
  IF lower(coalesce(p_payment_method, 'cash')) = 'qris' THEN
    SELECT coalesce((value#>>'{}')::boolean, true) INTO v_qris_platform_enabled
    FROM public.platform_settings
    WHERE key = 'enable_qris_checkout';

    IF v_qris_platform_enabled IS FALSE THEN
      RAISE EXCEPTION 'QRIS_DISABLED: Pembayaran QRIS sedang dinonaktifkan di seluruh platform oleh administrator platform.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

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

  -- D. ENFORCE POS MAX ITEMS PER ORDER
  SELECT coalesce((value#>>'{}')::integer, 100) INTO v_max_items
  FROM public.platform_settings
  WHERE key = 'pos_max_items_per_order';

  SELECT coalesce(sum((item->>'quantity')::integer), 0) INTO v_total_qty
  FROM jsonb_array_elements(p_items) AS item;

  IF v_total_qty > v_max_items THEN
    RAISE EXCEPTION 'Batas maksimum pos_max_items_per_order (% item) terlampaui. Total pesanan Anda: % item.', v_max_items, v_total_qty
      USING ERRCODE = '22023';
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
    WHERE id = v_item_prod_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan atau bukan milik bisnis ini' USING ERRCODE = '42501';
    END IF;

    IF v_prod.is_available IS NOT TRUE OR v_prod.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Produk "%" sedang tidak tersedia', v_prod.name USING ERRCODE = 'P0001';
    END IF;

    -- Check inventory quantity with row lock
    SELECT id, quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_item_prod_id
    FOR UPDATE;

    IF FOUND AND v_inv.quantity IS NOT NULL THEN
      IF v_inv.quantity < v_item_qty THEN
        RAISE EXCEPTION 'Stok untuk produk "%" tidak mencukupi (sisa: %, dipesan: %)', v_prod.name, v_inv.quantity, v_item_qty USING ERRCODE = 'P0001';
      END IF;
    END IF;

    -- Price & Discounts calculation
    v_base_price := coalesce(v_prod.unit_price, 0);
    v_final_unit_price := v_base_price;
    v_discount_amount := 0;

    v_notes_json := '{}'::jsonb;
    IF v_prod.notes IS NOT NULL AND trim(v_prod.notes) <> '' THEN
      BEGIN
        v_notes_json := v_prod.notes::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_notes_json := '{}'::jsonb;
      END;
    END IF;

    IF (v_notes_json->'discount') IS NOT NULL AND jsonb_typeof(v_notes_json->'discount') = 'object' THEN
      v_disc_type := v_notes_json->'discount'->>'type';
      v_disc_val := (v_notes_json->'discount'->>'value')::numeric;
      v_disc_pub := coalesce((v_notes_json->'discount'->>'is_public')::boolean, false);
      v_disc_start := (v_notes_json->'discount'->>'start_date')::timestamptz;
      v_disc_end := (v_notes_json->'discount'->>'end_date')::timestamptz;

      IF v_disc_pub IS TRUE
         AND (v_disc_start IS NULL OR now() >= v_disc_start)
         AND (v_disc_end IS NULL OR now() <= v_disc_end) THEN
        IF v_disc_type = 'percentage' AND v_disc_val > 0 THEN
          v_discount_amount := round((v_base_price * v_disc_val / 100.0), 2);
          IF v_discount_amount > v_base_price THEN v_discount_amount := v_base_price; END IF;
        ELSIF v_disc_type = 'fixed' AND v_disc_val > 0 THEN
          v_discount_amount := v_disc_val;
          IF v_discount_amount > v_base_price THEN v_discount_amount := v_base_price; END IF;
        END IF;
        v_final_unit_price := v_base_price - v_discount_amount;
      END IF;
    END IF;

    -- Add variant price adjustments
    v_var_summary := '';
    IF jsonb_typeof(v_item_variants) = 'object' AND v_notes_json ? 'variant_groups' THEN
      FOR v_var_group IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        IF v_sel_opt_name IS NOT NULL AND (v_var_group ? 'options') THEN
          FOR v_var_opt IN SELECT * FROM jsonb_array_elements(v_var_group->'options')
          LOOP
            IF (v_var_opt->>'name') = v_sel_opt_name THEN
              v_final_unit_price := v_final_unit_price + coalesce((v_var_opt->>'price_adjustment')::numeric, 0);
              IF v_var_summary = '' THEN
                v_var_summary := (v_var_group->>'name') || ': ' || v_sel_opt_name;
              ELSE
                v_var_summary := v_var_summary || ', ' || (v_var_group->>'name') || ': ' || v_sel_opt_name;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    v_line_subtotal := v_final_unit_price * v_item_qty;
    v_order_subtotal := v_order_subtotal + v_line_subtotal;
  END LOOP;

  -- 5. Insert order
  INSERT INTO public.orders (
    business_id,
    table_id,
    customer_name,
    order_source,
    order_status,
    payment_method,
    payment_status,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    notes,
    checkout_request_id
  ) VALUES (
    p_business_id,
    p_table_id,
    coalesce(nullif(trim(p_customer_name), ''), 'Pelanggan'),
    'qr_menu',
    'pending',
    coalesce(p_payment_method, 'cash'),
    'pending',
    v_order_subtotal,
    0,
    0,
    v_order_subtotal,
    p_notes,
    trim(p_checkout_request_id)
  )
  RETURNING * INTO v_order;

  -- 6. Insert order items & reduce stock atomically
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
    v_final_unit_price := v_base_price;
    v_discount_amount := 0;

    v_notes_json := '{}'::jsonb;
    IF v_prod.notes IS NOT NULL AND trim(v_prod.notes) <> '' THEN
      BEGIN
        v_notes_json := v_prod.notes::jsonb;
      EXCEPTION WHEN OTHERS THEN
        v_notes_json := '{}'::jsonb;
      END;
    END IF;

    IF (v_notes_json->'discount') IS NOT NULL AND jsonb_typeof(v_notes_json->'discount') = 'object' THEN
      v_disc_type := v_notes_json->'discount'->>'type';
      v_disc_val := (v_notes_json->'discount'->>'value')::numeric;
      v_disc_pub := coalesce((v_notes_json->'discount'->>'is_public')::boolean, false);
      v_disc_start := (v_notes_json->'discount'->>'start_date')::timestamptz;
      v_disc_end := (v_notes_json->'discount'->>'end_date')::timestamptz;

      IF v_disc_pub IS TRUE
         AND (v_disc_start IS NULL OR now() >= v_disc_start)
         AND (v_disc_end IS NULL OR now() <= v_disc_end) THEN
        IF v_disc_type = 'percentage' AND v_disc_val > 0 THEN
          v_discount_amount := round((v_base_price * v_disc_val / 100.0), 2);
          IF v_discount_amount > v_base_price THEN v_discount_amount := v_base_price; END IF;
        ELSIF v_disc_type = 'fixed' AND v_disc_val > 0 THEN
          v_discount_amount := v_disc_val;
          IF v_discount_amount > v_base_price THEN v_discount_amount := v_base_price; END IF;
        END IF;
        v_final_unit_price := v_base_price - v_discount_amount;
      END IF;
    END IF;

    v_full_item_name := v_prod.name;
    v_var_summary := '';
    IF jsonb_typeof(v_item_variants) = 'object' AND v_notes_json ? 'variant_groups' THEN
      FOR v_var_group IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        IF v_sel_opt_name IS NOT NULL AND (v_var_group ? 'options') THEN
          FOR v_var_opt IN SELECT * FROM jsonb_array_elements(v_var_group->'options')
          LOOP
            IF (v_var_opt->>'name') = v_sel_opt_name THEN
              v_final_unit_price := v_final_unit_price + coalesce((v_var_opt->>'price_adjustment')::numeric, 0);
              IF v_var_summary = '' THEN
                v_var_summary := (v_var_group->>'name') || ': ' || v_sel_opt_name;
              ELSE
                v_var_summary := v_var_summary || ', ' || (v_var_group->>'name') || ': ' || v_sel_opt_name;
              END IF;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
    END IF;

    IF v_var_summary <> '' THEN
      v_full_item_name := v_prod.name || ' (' || v_var_summary || ')';
    END IF;

    v_line_subtotal := v_final_unit_price * v_item_qty;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      notes
    ) VALUES (
      v_order.id,
      v_item_prod_id,
      v_full_item_name,
      v_item_qty,
      v_final_unit_price,
      v_line_subtotal,
      jsonb_build_object(
        'base_price', v_base_price,
        'discount_amount', v_discount_amount,
        'selected_variants', v_item_variants
      )::text
    )
    RETURNING * INTO v_inserted_item;

    v_inserted_items := v_inserted_items || jsonb_build_array(to_jsonb(v_inserted_item));

    -- Mutate inventory table directly
    UPDATE public.inventory
    SET quantity = quantity - v_item_qty,
        updated_at = now()
    WHERE product_id = v_item_prod_id;

    -- Mutate variant option stock in products.notes if applicable
    IF jsonb_typeof(v_item_variants) = 'object' AND v_notes_json ? 'variant_groups' THEN
      v_new_groups := '[]'::jsonb;
      FOR v_grp_elem IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := v_item_variants->>(v_grp_elem->>'name');
        IF v_sel_opt_name IS NOT NULL AND (v_grp_elem ? 'options') THEN
          v_new_opts := '[]'::jsonb;
          FOR v_opt_elem IN SELECT * FROM jsonb_array_elements(v_grp_elem->'options')
          LOOP
            IF (v_opt_elem->>'name') = v_sel_opt_name AND (v_opt_elem ? 'stock') AND (v_opt_elem->>'stock') IS NOT NULL THEN
              v_opt_elem := jsonb_set(
                v_opt_elem,
                '{stock}',
                to_jsonb(greatest(0, coalesce((v_opt_elem->>'stock')::integer, 0) - v_item_qty))
              );
            END IF;
            v_new_opts := v_new_opts || jsonb_build_array(v_opt_elem);
          END LOOP;
          v_grp_elem := jsonb_set(v_grp_elem, '{options}', v_new_opts);
        END IF;
        v_new_groups := v_new_groups || jsonb_build_array(v_grp_elem);
      END LOOP;

      v_updated_notes := jsonb_set(v_notes_json, '{variant_groups}', v_new_groups);
      UPDATE public.products
      SET notes = v_updated_notes::text,
          updated_at = now()
      WHERE id = v_item_prod_id;
    END IF;

    -- Insert stock movement record with valid check constraint: 'stock_out'
    INSERT INTO public.stock_movements (
      business_id,
      product_id,
      movement_type,
      quantity,
      reason,
      created_at
    ) VALUES (
      p_business_id,
      v_item_prod_id,
      'stock_out',
      v_item_qty,
      'Pesanan QR Menu #' || substr(v_order.id::text, 1, 8),
      now()
    );
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
