-- ============================================================
-- 106_security_lockdown_public_orders.sql
-- BisnisSehat: Security Remediation for Priority #2
-- Public QR Order & Customer Data Exposure
--
-- Vulnerabilities Remediated:
-- 1. Blanket orders_public_select policy allowing anonymous dumping of all customer orders.
-- 2. Blanket order_items_public_select policy allowing anonymous dumping of all order line items.
-- 3. Sequential integer enumeration (BOLA/IDOR) in get_public_order_by_identifier.
-- 4. Overbroad column exposure (customer_name, financial totals, order notes) to anonymous clients.
-- ============================================================

-- 1. HARDEN get_public_order_by_identifier RPC
-- Allows anonymous retrieval ONLY with valid UUID capability (128-bit unguessable ID).
-- Numeric order_number lookup is restricted to authenticated business owners / admins.
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
  -- Verify business exists and is published
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

  -- 1. Capability-based lookup via exact 128-bit UUID (Allowed for customer possessing the link)
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
      created_at,
      notes,
      table_id
    INTO v_order
    FROM public.orders
    WHERE id = v_clean_ident::uuid
      AND business_id = p_business_id
      AND order_source = 'qr_menu';
  ELSE
    -- 2. Lookup by numeric order_number (e.g. "79" or "#79")
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
        created_at,
        notes,
        table_id
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

  -- Fetch items for this authorized order
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name', oi.product_name,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price,
      'subtotal', oi.subtotal,
      'variant_details', oi.variant_details,
      'notes', oi.notes
    ) ORDER BY oi.created_at ASC
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'business_id', v_order.business_id,
      'customer_name', v_order.customer_name,
      'total', v_order.total,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status,
      'created_at', v_order.created_at,
      'notes', v_order.notes,
      'table_id', v_order.table_id
    ),
    'items', v_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) TO anon, authenticated, service_role;

-- 2. LOCK DOWN public.order_items TABLE
-- Remove public select policy. Line items are accessed securely through get_public_order_by_identifier RPC.
DROP POLICY IF EXISTS "order_items_public_select" ON public.order_items;

-- Revoke table SELECT on order_items from public and anon
REVOKE SELECT ON TABLE public.order_items FROM public;
REVOKE SELECT ON TABLE public.order_items FROM anon;

-- Ensure anonymous can still INSERT for QR checkout fallback
GRANT INSERT ON TABLE public.order_items TO anon;

-- Ensure authenticated merchants retain SELECT/INSERT/UPDATE/DELETE on order_items
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;

-- 3. LOCK DOWN public.orders TABLE
-- Drop blanket public select policy
DROP POLICY IF EXISTS "orders_public_select" ON public.orders;

-- Revoke blanket table SELECT from public and anon
REVOKE SELECT ON TABLE public.orders FROM public;
REVOKE SELECT ON TABLE public.orders FROM anon;

-- Grant column-level SELECT on non-sensitive operational columns to anon for Realtime update sync.
-- SENSITIVE COLUMNS ARE COMPLETELY REVOKED FROM ANON:
-- customer_name, subtotal, total, notes, payment_ref, checkout_request_id, discount_*, tax_amount
GRANT SELECT (id, business_id, order_number, order_status, payment_status, created_at, updated_at) ON public.orders TO anon;

-- Ensure anonymous can still INSERT for QR checkout fallback
GRANT INSERT ON TABLE public.orders TO anon;

-- Grant full table access to authenticated merchants and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

-- Recreate orders_public_select scoped strictly to active, in-flight orders within last 2 hours
-- Historical completed/cancelled orders cannot be read via anon
CREATE POLICY "orders_public_select" ON public.orders FOR SELECT TO anon
  USING (
    order_source = 'qr_menu' AND
    business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true) AND
    order_status IN ('pending', 'baru', 'diproses', 'preparing') AND
    created_at >= (now() - interval '2 hours')
  );

NOTIFY pgrst, 'reload schema';
