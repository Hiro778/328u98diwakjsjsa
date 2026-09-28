-- 052_fix_public_order_rpc.sql
-- BisnisSehat: Update create_public_order to use inventory.quantity and products.is_available

CREATE OR REPLACE FUNCTION public.create_public_order(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_customer_name text DEFAULT '',
  p_table_id uuid DEFAULT NULL,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_biz record;
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

  -- 2. Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang belanja tidak boleh kosong' USING ERRCODE = '22023';
  END IF;

  -- 3. Calculate order total & validate each item
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

    -- STOCK INTEGRITY CHECK (via inventory row lock)
    SELECT id, quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_item_prod_id
    FOR UPDATE;

    IF FOUND AND v_inv.quantity IS NOT NULL THEN
      IF v_inv.quantity < v_item_qty THEN
        RAISE EXCEPTION 'Stok tidak mencukupi untuk % (sisa %, diminta %)',
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

          -- Add variant price adjustment if configured
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

  -- 4. Create Order record
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
    notes
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
    coalesce(p_notes, '')
  ) RETURNING * INTO v_order;

  -- 5. Insert order_items and update inventory
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

    -- Inventory decrement if tracking exists
    UPDATE public.inventory
    SET quantity = quantity - v_item_qty,
        updated_at = now()
    WHERE product_id = v_item_prod_id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'items', v_inserted_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, text, text, uuid, text) TO anon, authenticated, service_role;
