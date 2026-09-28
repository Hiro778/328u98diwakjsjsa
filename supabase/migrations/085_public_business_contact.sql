-- ============================================================
-- 085_public_business_contact.sql
-- BisnisSehat: Public Business Contact for Order Waiting Screen (@2.md)
-- Allows customers on published QR menus to view official seller contact
-- Strictly prevents leakage of private profile emails, user IDs, or un-published menus.
-- ============================================================

-- 1. SECURE RPC TO FETCH PUBLISHED BUSINESS CONTACT
CREATE OR REPLACE FUNCTION public.get_public_business_contact(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_biz record;
  v_wa text := '';
  v_phone text := '';
BEGIN
  -- Verify business exists and is published
  SELECT id, name, is_menu_published
  INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND OR NOT coalesce(v_biz.is_menu_published, false) THEN
    RETURN jsonb_build_object(
      'business_id', p_business_id,
      'business_name', '',
      'whatsapp', '',
      'phone', '',
      'available', false
    );
  END IF;

  -- 1. Check whatsapp_business_connections for connected official WhatsApp
  SELECT display_phone_number
  INTO v_wa
  FROM public.whatsapp_business_connections
  WHERE business_id = p_business_id
    AND status = 'connected'
  ORDER BY updated_at DESC
  LIMIT 1;

  -- 2. Check pos_receipt_settings for store_phone
  SELECT store_phone
  INTO v_phone
  FROM public.pos_receipt_settings
  WHERE business_id = p_business_id;

  -- 3. Return sanitized contact strictly without private data
  RETURN jsonb_build_object(
    'business_id', p_business_id,
    'business_name', v_biz.name,
    'whatsapp', coalesce(v_wa, ''),
    'phone', coalesce(v_phone, ''),
    'available', (coalesce(v_wa, '') <> '' OR coalesce(v_phone, '') <> '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_business_contact(uuid) TO anon, authenticated, service_role;

-- 2. ALLOW PUBLIC SELECT ON POS_RECEIPT_SETTINGS FOR PUBLISHED BUSINESSES
-- Allows customers to view store phone and address printed on receipts / order status
DROP POLICY IF EXISTS "pos_receipt_settings_public_select" ON public.pos_receipt_settings;

CREATE POLICY "pos_receipt_settings_public_select"
  ON public.pos_receipt_settings FOR SELECT TO public
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE is_menu_published = true
    )
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
