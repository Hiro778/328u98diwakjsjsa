-- ============================================================
-- 086_order_status_realtime_sync.sql
-- BisnisSehat: QRIS Order Status Synchronization & Realtime (@3.md)
-- 
-- 1. Adds public.orders to supabase_realtime publication
-- 2. Sets REPLICA IDENTITY FULL on public.orders for reliable column filters in realtime
-- 3. Hardens orders_public_select RLS policy for anonymous customer status tracking
-- 4. Creates secure RPC get_public_order_by_identifier to load order by UUID or order_number (#79)
-- ============================================================

-- 1. ADD ORDERS TO REALTIME PUBLICATION
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- 2. REPLICA IDENTITY FULL
-- Ensures updated row column values are fully broadcast for client-side filter evaluation
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 3. HARDEN ORDERS PUBLIC SELECT RLS POLICY
-- Allows customers on published QR menus to view their recent order record and receive realtime UPDATE events
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_public_select' AND tablename = 'orders') THEN
    DROP POLICY "orders_public_select" ON public.orders;
  END IF;
  
  CREATE POLICY "orders_public_select" ON public.orders FOR SELECT TO public
    USING (
      order_source = 'qr_menu' AND
      business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true) AND
      created_at >= (now() - interval '7 days')
    );
END $$;

-- 4. SECURE RPC TO LOOKUP ORDER BY UUID OR ORDER NUMBER
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
  v_biz_exists boolean;
  v_order record;
  v_clean_ident text;
BEGIN
  -- Verify business exists and is published
  SELECT is_menu_published INTO v_biz_exists
  FROM public.businesses
  WHERE id = p_business_id;

  IF v_biz_exists IS NULL OR v_biz_exists = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MENU_NOT_PUBLISHED',
      'message', 'Menu bisnis ini belum dipublikasikan.'
    );
  END IF;

  v_clean_ident := trim(p_identifier);
  IF v_clean_ident IS NULL OR v_clean_ident = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_IDENTIFIER',
      'message', 'Nomor atau ID pesanan tidak valid.'
    );
  END IF;

  -- 1. Check if identifier is valid UUID
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
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_identifier(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
