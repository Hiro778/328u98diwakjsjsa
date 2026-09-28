-- ============================================================
-- 084_platform_settings_runtime_enforcement.sql
-- BisnisSehat: Runtime Enforcement Layer for Platform Settings (@ban.md)
--
-- Features implemented:
-- 1. Public RPC: get_public_platform_settings() for safe client-side reads
-- 2. Authoritative server-side checks in create_public_order():
--    - maintenance_mode -> reject anonymous/non-admin order creation
--    - enable_pos_module -> reject POS/menu ordering
--    - enable_qris_checkout -> reject QRIS payment_method
--    - pos_max_items_per_order -> reject total quantity exceeding configured threshold
-- 3. Authoritative server-side checks in create_pos_order():
--    - maintenance_mode -> reject non-admin POS creation
--    - enable_pos_module -> reject non-admin POS operations
--    - pos_max_items_per_order -> reject total quantity exceeding configured threshold
-- 4. Authoritative server-side checks in merchant_process_order() & merchant_complete_order():
--    - maintenance_mode -> reject
--    - enable_pos_module -> reject
-- 5. Authoritative server-side check in delete_completed_order():
--    - maintenance_mode -> reject
--    - enable_pos_module -> reject
-- 6. Authoritative server-side check in handle_new_user() trigger:
--    - enable_user_registration -> reject new user signup in auth.users
-- 7. Trigger on public.orders:
--    - Prevent direct PostgREST insert bypass of platform flags
-- ============================================================

-- 1. Create Public RPC: get_public_platform_settings()
CREATE OR REPLACE FUNCTION public.get_public_platform_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_rec record;
BEGIN
  -- Safe whitelist of keys readable by public & normal authenticated users
  -- Zero secrets, tokens, passwords, or internal keys are ever exposed.
  FOR v_rec IN
    SELECT key, value
    FROM public.platform_settings
    WHERE key IN (
      'platform_name',
      'support_email',
      'support_phone',
      'support_operating_hours',
      'maintenance_mode',
      'announcement_banner_enabled',
      'announcement_banner_text',
      'enable_user_registration',
      'enable_ai_features',
      'enable_qris_checkout',
      'enable_pos_module',
      'pos_max_items_per_order',
      'session_idle_timeout_minutes'
    )
  LOOP
    v_result := jsonb_set(v_result, ARRAY[v_rec.key], v_rec.value, true);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_platform_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_settings() TO anon, authenticated, service_role;


-- 2. Update handle_new_user() with enable_user_registration check
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reg_enabled boolean := true;
BEGIN
  -- Check if platform_settings table exists and registration is enabled
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_settings') THEN
    SELECT coalesce((value#>>'{}')::boolean, true) INTO v_reg_enabled
    FROM public.platform_settings
    WHERE key = 'enable_user_registration';
    
    IF v_reg_enabled IS FALSE THEN
      RAISE EXCEPTION 'REGISTRATION_DISABLED: Pendaftaran pengguna baru dinonaktifkan sementara oleh administrator platform.'
        USING ERRCODE = '55P03';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN new;
END;
$$;


-- 3. Hardened create_public_order with authoritative platform_settings checks
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

    -- Insert stock movement record
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
      'out',
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


-- 4. HARDEN create_pos_order WITH PLATFORM SETTINGS
CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_business_id uuid,
  p_items jsonb,
  p_customer_name text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_discount_type text DEFAULT 'nominal',
  p_discount_value numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
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
  v_max_items integer := 100;
  v_total_qty integer := 0;
BEGIN
  -- 0. PLATFORM SETTINGS ENFORCEMENT
  IF coalesce((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode).'
        USING ERRCODE = '55P03';
    END IF;
  END IF;

  IF coalesce((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'enable_pos_module'), true) IS FALSE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'POS_DISABLED: Modul POS saat ini sedang dinonaktifkan oleh administrator platform.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1. Authentication & Account Access Check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_account_access_allowed(v_user_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir' USING ERRCODE = '42501';
  END IF;

  SELECT id, owner_id, name INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id AND owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan atau Anda tidak memiliki hak akses' USING ERRCODE = '42501';
  END IF;

  -- 2. Idempotency Check
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

  -- pos_max_items_per_order enforcement
  SELECT coalesce((value#>>'{}')::integer, 100) INTO v_max_items
  FROM public.platform_settings
  WHERE key = 'pos_max_items_per_order';

  SELECT coalesce(sum((item->>'quantity')::integer), 0) INTO v_total_qty
  FROM jsonb_array_elements(p_items) AS item;

  IF v_total_qty > v_max_items THEN
    RAISE EXCEPTION 'Batas maksimum pos_max_items_per_order (% item) terlampaui. Total pesanan Anda: % item.', v_max_items, v_total_qty
      USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate Subtotal & Validate Tenant/Stock Isolation
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih dari 0' USING ERRCODE = '22023';
    END IF;

    SELECT id, business_id, name, unit_price, is_available, is_active
    INTO v_prod
    FROM public.products
    WHERE id = v_item_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan' USING ERRCODE = '42501';
    END IF;

    IF v_prod.business_id <> p_business_id THEN
      RAISE EXCEPTION 'Pelanggaran isolasi tenant: Produk % bukan milik bisnis ini', v_prod.name
        USING ERRCODE = '42501';
    END IF;

    SELECT id, quantity INTO v_inv
    FROM public.inventory
    WHERE product_id = v_item_prod_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory (product_id, quantity, min_stock, maximum_stock)
      VALUES (v_item_prod_id, 0, 0, 0)
      RETURNING id, quantity INTO v_inv;
    END IF;

    IF v_inv.quantity IS NOT NULL AND v_inv.quantity < v_item_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok tidak mencukupi untuk % (sisa %, diminta %)',
        v_prod.name, v_inv.quantity, v_item_qty
        USING ERRCODE = '23514';
    END IF;

    v_unit_price := coalesce(v_prod.unit_price, 0);
    v_line_subtotal := v_unit_price * v_item_qty;
    v_subtotal := v_subtotal + v_line_subtotal;
  END LOOP;

  -- 5. Calculate Discount and Total
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := round(v_subtotal * (coalesce(p_discount_value, 0) / 100.0), 2);
  ELSE
    v_discount_amount := least(coalesce(p_discount_value, 0), v_subtotal);
  END IF;

  v_total := greatest(0, v_subtotal - v_discount_amount);

  -- 6. Insert Order
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
    total,
    notes,
    checkout_request_id
  ) VALUES (
    p_business_id,
    p_table_id,
    coalesce(p_customer_name, ''),
    'pos',
    'completed',
    coalesce(p_payment_method, 'cash'),
    'paid',
    v_subtotal,
    v_discount_amount,
    v_total,
    coalesce(p_notes, ''),
    nullif(trim(p_checkout_request_id), '')
  ) RETURNING * INTO v_order;

  -- 7. Insert Order Items & Update Inventory atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_prod_id := (v_item->>'product_id')::uuid;
    v_item_qty := coalesce((v_item->>'quantity')::integer, 1);

    SELECT id, name, unit_price INTO v_prod
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

    v_inserted_items := v_inserted_items || to_jsonb(v_inserted_item);

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

GRANT EXECUTE ON FUNCTION public.create_pos_order(uuid, jsonb, text, uuid, text, text, numeric, text, text) TO authenticated;


-- 5. Hardened merchant_process_order with enable_pos_module & maintenance_mode check
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


-- 6. Hardened merchant_complete_order with enable_pos_module & maintenance_mode check
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

  -- 6. Strict lifecycle check: Order MUST be processed first
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

GRANT EXECUTE ON FUNCTION public.merchant_complete_order(uuid) TO authenticated;


-- 7. Hardened delete_completed_order
DROP FUNCTION IF EXISTS public.delete_completed_order(uuid);
CREATE OR REPLACE FUNCTION public.delete_completed_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order_status text;
  v_business_id uuid;
BEGIN
  -- A. PLATFORM SETTINGS ENFORCEMENT
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

  -- 1. Must be authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi autentikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed') THEN
    IF NOT public.is_account_access_allowed(v_user_id) THEN
      RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Verify that the order exists and belongs to a business owned by the authenticated user
  SELECT coalesce(o.order_status, o.status), o.business_id
  INTO v_order_status, v_business_id
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id
    AND b.owner_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan atau Anda tidak memiliki hak akses ke pesanan ini' USING ERRCODE = '42501';
  END IF;

  -- 3. Strictly verify order status: only completed orders can be deleted
  IF v_order_status NOT IN ('selesai', 'completed', 'cancelled', 'dibatalkan') THEN
    RAISE EXCEPTION 'Hanya pesanan berstatus selesai yang dapat dihapus dari riwayat' USING ERRCODE = '22023';
  END IF;

  -- 4. Clean up child records
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.payments WHERE order_id = p_order_id;

  -- 5. Delete the order record
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_completed_order(uuid) TO authenticated;


-- 8. TRIGGER FOR DIRECT TABLE INSERT PROTECTION ON orders
CREATE OR REPLACE FUNCTION public.check_order_platform_settings_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_maintenance boolean;
  v_qris_enabled boolean;
  v_pos_enabled boolean;
BEGIN
  -- A. Maintenance Mode check (Admins exempt)
  SELECT coalesce((value#>>'{}')::boolean, false) INTO v_maintenance
  FROM public.platform_settings WHERE key = 'maintenance_mode';
  IF v_maintenance IS TRUE AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode).' USING ERRCODE = '55P03';
  END IF;

  -- B. QRIS checkout flag check
  IF lower(coalesce(NEW.payment_method, 'cash')) = 'qris' THEN
    SELECT coalesce((value#>>'{}')::boolean, true) INTO v_qris_enabled
    FROM public.platform_settings WHERE key = 'enable_qris_checkout';
    IF v_qris_enabled IS FALSE THEN
      RAISE EXCEPTION 'QRIS_DISABLED: Pembayaran QRIS saat ini sedang dinonaktifkan oleh platform.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- C. POS module check for POS orders
  IF lower(coalesce(NEW.order_source, '')) = 'pos' THEN
    SELECT coalesce((value#>>'{}')::boolean, true) INTO v_pos_enabled
    FROM public.platform_settings WHERE key = 'enable_pos_module';
    IF v_pos_enabled IS FALSE AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'POS_DISABLED: Modul POS saat ini sedang dinonaktifkan oleh platform.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_platform_settings ON public.orders;
CREATE TRIGGER trg_enforce_order_platform_settings
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_platform_settings_allowed();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
