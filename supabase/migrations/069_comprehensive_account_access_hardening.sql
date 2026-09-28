-- ============================================================
-- 069_comprehensive_account_access_hardening.sql
-- BisnisSehat: Complete Zero-Access Security Enforcement for Banned/Suspended/Deleted Users
--
-- Tables hardened:
-- 1. subscriptions (SELECT, INSERT, UPDATE)
-- 2. subscription_payments (SELECT)
-- 3. web_push_subscriptions (ALL)
-- 4. support_tickets (SELECT, INSERT, UPDATE)
--
-- RPCs hardened:
-- 1. create_pos_order
-- 2. adjust_stock
-- 3. admin_update_user_status (evict sessions for suspended too)
-- ============================================================

-- 1. RLS Hardening: subscriptions
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

CREATE POLICY "Users can update own subscription"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

-- 2. RLS Hardening: subscription_payments
DROP POLICY IF EXISTS "Users can view own subscription payments" ON public.subscription_payments;

CREATE POLICY "Users can view own subscription payments"
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = profile_id)
    AND public.is_account_access_allowed(auth.uid())
  );

-- 3. RLS Hardening: web_push_subscriptions
DROP POLICY IF EXISTS "web_push_user_all" ON public.web_push_subscriptions;

CREATE POLICY "web_push_user_all"
  ON public.web_push_subscriptions
  FOR ALL
  TO authenticated
  USING (
    (auth.uid() = user_id)
    AND public.is_account_access_allowed(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id)
    AND public.is_account_access_allowed(auth.uid())
  );

-- 4. RLS Hardening: support_tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Users can insert own tickets" ON public.support_tickets;

CREATE POLICY "Users can view own tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    ((auth.uid() = user_id) AND public.is_account_access_allowed(auth.uid()))
    OR public.is_admin()
  );

CREATE POLICY "Users can insert own tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.uid() = user_id) AND public.is_account_access_allowed(auth.uid()))
    OR public.is_admin()
  );

-- 5. RPC Hardening: create_pos_order
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
BEGIN
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

    -- ATOMIC STOCK LOCK & VALIDATION
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

-- 6. RPC Hardening: adjust_stock
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text DEFAULT NULL,
  p_reference_type text DEFAULT 'manual',
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

  IF v_current_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Sesi tidak ditemukan');
  END IF;

  IF NOT public.is_account_access_allowed(v_current_user) THEN
    RETURN json_build_object('success', false, 'error', 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir');
  END IF;

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

-- 7. Update admin_update_user_status to evict sessions on suspended as well
CREATE OR REPLACE FUNCTION public.admin_update_user_status(
  p_target_user_id uuid,
  p_new_status text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_adm boolean;
  v_is_super boolean;
  v_is_service_role boolean;
  v_current_status text;
  v_action text;
BEGIN
  -- 1. Authorization Check (Allow admins or service_role)
  v_is_service_role := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'service_role', 'supabase_admin')
  );
  v_is_adm := v_is_service_role OR public.is_admin();
  v_is_super := v_is_service_role OR public.is_super_admin();

  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can modify user status' USING ERRCODE = '42501';
  END IF;

  -- Self-protection invariant: Admin cannot ban/suspend/delete their own account
  IF NOT v_is_service_role AND p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Forbidden: Admin tidak boleh mengubah status akun miliknya sendiri' USING ERRCODE = '42501';
  END IF;

  -- Validate target user exists
  SELECT status INTO v_current_status
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Permission check per action type
  IF p_new_status = 'deleted' THEN
    IF NOT v_is_super THEN
      RAISE EXCEPTION 'Forbidden: Hanya SUPER_ADMIN yang memiliki izin untuk menghapus user' USING ERRCODE = '42501';
    END IF;
    v_action := 'USER_DELETED';
  ELSIF p_new_status = 'banned' THEN
    v_action := 'USER_BANNED';
  ELSIF p_new_status = 'suspended' THEN
    v_action := 'USER_SUSPENDED';
  ELSIF p_new_status = 'active' THEN
    IF v_current_status = 'banned' THEN
      v_action := 'USER_UNBANNED';
    ELSIF v_current_status = 'suspended' THEN
      v_action := 'USER_UNSUSPENDED';
    ELSE
      v_action := 'USER_ACTIVATED';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid status value: %', p_new_status;
  END IF;

  -- Mandatory reason for destructive/restrictive actions
  IF p_new_status IN ('suspended', 'banned', 'deleted') AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'Alasan (reason) wajib diisi untuk tindakan %', v_action USING ERRCODE = '22023';
  END IF;

  -- 3. Atomic Database Update (Profiles)
  UPDATE public.profiles
  SET
    status = p_new_status,
    status_reason = coalesce(p_reason, ''),
    status_updated_at = now(),
    deleted_at = CASE WHEN p_new_status = 'deleted' THEN now() ELSE deleted_at END,
    updated_at = now()
  WHERE id = p_target_user_id;

  -- 4. Deep Security Hardening in Supabase Auth Engine:
  IF p_new_status IN ('banned', 'deleted') THEN
    -- A. Revoke in GoTrue (auth.users) so login & token refresh are immediately rejected
    UPDATE auth.users
    SET banned_until = 'infinity'::timestamptz
    WHERE id = p_target_user_id;

    -- B. Immediately terminate all active sessions
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

  ELSIF p_new_status = 'suspended' THEN
    -- Invalidate active sessions immediately upon suspension
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;

  ELSIF p_new_status = 'active' THEN
    -- When unbanned or restored, remove the GoTrue ban
    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;
  END IF;

  -- 5. Mandatory Audit Log Entry
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) VALUES (
    coalesce(v_admin_id, p_target_user_id),
    v_action,
    'user',
    p_target_user_id::text,
    coalesce(p_reason, ''),
    jsonb_build_object(
      'previous_status', v_current_status,
      'new_status', p_new_status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action,
    'target_user_id', p_target_user_id,
    'new_status', p_new_status
  );
END;
$$;
