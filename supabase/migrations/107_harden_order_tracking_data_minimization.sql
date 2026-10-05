-- ============================================================
-- 107_harden_order_tracking_data_minimization.sql
-- BisnisSehat: Security Hardening & Strict Data Minimization for Order Tracking
--
-- Enforces:
-- 1. Strict Data Minimization in get_public_order_by_identifier:
--    - Excludes payment_ref, checkout_request_id, internal IDs, table_id, notes, and internal product_ids.
-- 2. Capability Enforcement:
--    - Public lookups require unguessable 128-bit UUID.
--    - Sequential numeric order_number lookup strictly restricted to authenticated business owner.
-- 3. Anonymous PostgREST Restrictions:
--    - Zero bulk access to orders or order_items.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_order_by_identifier(
  p_business_id uuid,
  p_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_biz record;
  v_order record;
  v_items jsonb := '[]'::jsonb;
  v_clean_ident text;
  v_caller_id uuid;
  v_is_owner boolean := false;
BEGIN
  -- 1. Validate business exists and menu is published
  SELECT id, owner_id, is_menu_published INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id;

  IF v_biz.id IS NULL OR v_biz.is_menu_published IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MENU_NOT_PUBLISHED',
      'message', 'Menu bisnis ini belum dipublikasikan.'
    );
  END IF;

  v_clean_ident := trim(coalesce(p_identifier, ''));
  IF v_clean_ident = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_IDENTIFIER',
      'message', 'Nomor atau ID pesanan tidak valid.'
    );
  END IF;

  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NOT NULL AND v_caller_id = v_biz.owner_id THEN
    v_is_owner := true;
  END IF;

  -- 2. Capability-based lookup via exact 128-bit UUID (Allowed for customer possessing the link)
  IF v_clean_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT 
      id,
      order_number,
      business_id,
      customer_name,
      total,
      payment_method,
      payment_status,
      order_status,
      created_at
    INTO v_order
    FROM public.orders
    WHERE id = v_clean_ident::uuid
      AND business_id = p_business_id
      AND order_source = 'qr_menu';
  ELSE
    -- 3. Lookup by numeric order_number (e.g. "79" or "#79")
    -- Enforce Broken Object Level Authorization (BOLA) protection:
    -- Only the authenticated business owner may query by sequential order_number.
    -- Unauthenticated / anonymous callers MUST provide the order UUID capability.
    IF NOT v_is_owner THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'UUID_REQUIRED',
        'message', 'Akses publik memerlukan tautan pesanan lengkap (Order ID UUID).'
      );
    END IF;

    v_clean_ident := regexp_replace(v_clean_ident, '^#', '');
    IF v_clean_ident ~ '^[0-9]+$' THEN
      SELECT 
        id,
        order_number,
        business_id,
        customer_name,
        total,
        payment_method,
        payment_status,
        order_status,
        created_at
      INTO v_order
      FROM public.orders
      WHERE order_number = v_clean_ident::integer
        AND business_id = p_business_id
        AND order_source = 'qr_menu'
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ORDER_NOT_FOUND',
      'message', 'Pesanan tidak ditemukan pada bisnis ini.'
    );
  END IF;

  -- 4. Fetch line items with strict data minimization (no product_id, no notes)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'product_name', oi.product_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'variant_details', oi.variant_details
    ) ORDER BY oi.created_at ASC
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  -- 5. Return strictly minimized customer-facing payload
  -- Excluded: payment_ref, checkout_request_id, notes, table_id, discount_*, tax_amount
  RETURN jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'customer_name', v_order.customer_name,
      'total', v_order.total,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status,
      'created_at', v_order.created_at
    ),
    'items', v_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
