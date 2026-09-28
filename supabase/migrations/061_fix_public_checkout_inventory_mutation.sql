-- ============================================================
-- 061_fix_public_checkout_inventory_mutation.sql
-- Fix Real Public Checkout Stock Mutation & Prevent Stale Inventory (sec.md)
-- 1. Hardened create_public_order:
--    - Safe variant jsonb parsing (supports both array and object formats)
--    - Row-level lock (FOR UPDATE) on public.inventory
--    - Strictly decrements inventory in the same transaction
--    - Decrements variant stock in notes if tracked
-- 2. Ensures inventory row exists for all products
-- ============================================================

-- Backfill missing inventory rows for products that don't have one
INSERT INTO public.inventory (product_id, quantity, min_stock, maximum_stock)
SELECT p.id, 0, 0, 0
FROM public.products p
LEFT JOIN public.inventory i ON i.product_id = p.id
WHERE i.id IS NULL
ON CONFLICT DO NOTHING;

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

    IF NOT FOUND THEN
      -- Create inventory record if missing so it is strictly tracked
      INSERT INTO public.inventory (product_id, quantity, min_stock, maximum_stock)
      VALUES (v_item_prod_id, 0, 0, 0)
      RETURNING id, quantity INTO v_inv;
    END IF;

    IF v_inv.quantity IS NOT NULL AND v_inv.quantity < v_item_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok tidak mencukupi untuk % (sisa %, diminta %)',
        v_prod.name, v_inv.quantity, v_item_qty
        USING ERRCODE = '23514';
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

    -- Variant calculations & snapshot (safe for both object and array variant formats)
    v_var_summary := '';
    IF v_notes_json->'variant_groups' IS NOT NULL AND jsonb_typeof(v_notes_json->'variant_groups') = 'array' THEN
      FOR v_var_group IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_sel_opt_name := NULL;
        IF jsonb_typeof(v_item_variants) = 'object' THEN
          v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        ELSIF jsonb_typeof(v_item_variants) = 'array' THEN
          SELECT (elem->>'option_name') INTO v_sel_opt_name
          FROM jsonb_array_elements(v_item_variants) elem
          WHERE (elem->>'group_id') = (v_var_group->>'id')
             OR (elem->>'group_name') = (v_var_group->>'name');
        END IF;

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

  -- 6. Insert order_items and update inventory atomically
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
        v_sel_opt_name := NULL;
        IF jsonb_typeof(v_item_variants) = 'object' THEN
          v_sel_opt_name := v_item_variants->>(v_var_group->>'name');
        ELSIF jsonb_typeof(v_item_variants) = 'array' THEN
          SELECT (elem->>'option_name') INTO v_sel_opt_name
          FROM jsonb_array_elements(v_item_variants) elem
          WHERE (elem->>'group_id') = (v_var_group->>'id')
             OR (elem->>'group_name') = (v_var_group->>'name');
        END IF;

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

    -- 7. Real Inventory Mutation: Decrement inventory strictly and safely
    UPDATE public.inventory
    SET quantity = quantity - v_item_qty,
        updated_at = now()
    WHERE product_id = v_item_prod_id;

    -- 8. If variant stock is tracked in product notes, decrement matching variant option stock
    IF v_notes_json->'variant_groups' IS NOT NULL AND jsonb_typeof(v_notes_json->'variant_groups') = 'array' THEN
      v_new_groups := '[]'::jsonb;
      FOR v_grp_elem IN SELECT * FROM jsonb_array_elements(v_notes_json->'variant_groups')
      LOOP
        v_new_opts := '[]'::jsonb;
        IF v_grp_elem->'options' IS NOT NULL AND jsonb_typeof(v_grp_elem->'options') = 'array' THEN
          FOR v_opt_elem IN SELECT * FROM jsonb_array_elements(v_grp_elem->'options')
          LOOP
            IF (v_opt_elem->>'name') = v_sel_opt_name AND v_opt_elem->'stock' IS NOT NULL THEN
              v_opt_elem := jsonb_set(
                v_opt_elem,
                '{stock}',
                to_jsonb(greatest(0, ((v_opt_elem->>'stock')::integer - v_item_qty)))
              );
            END IF;
            v_new_opts := v_new_opts || jsonb_build_array(v_opt_elem);
          END LOOP;
        END IF;
        v_grp_elem := jsonb_set(v_grp_elem, '{options}', v_new_opts);
        v_new_groups := v_new_groups || jsonb_build_array(v_grp_elem);
      END LOOP;
      v_updated_notes := jsonb_set(v_notes_json, '{variant_groups}', v_new_groups);
      UPDATE public.products
      SET notes = v_updated_notes::text,
          updated_at = now()
      WHERE id = v_item_prod_id;
    END IF;
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
