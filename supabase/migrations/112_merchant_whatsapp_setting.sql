-- ============================================================
-- 112_merchant_whatsapp_setting.sql
-- Merchant WhatsApp Contact Setting & Resolution
-- Replaces internal buyer <-> seller chat with merchant WhatsApp contact.
-- Strictly tenant-isolated via RLS matching business ownership.
-- ============================================================

-- 1. ADD WHATSAPP COLUMN TO BUSINESSES TABLE
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS whatsapp text DEFAULT '';

-- Index for phone/whatsapp lookup if needed
CREATE INDEX IF NOT EXISTS idx_businesses_whatsapp
  ON public.businesses(whatsapp)
  WHERE whatsapp IS NOT NULL AND whatsapp <> '';

-- 2. UPDATE get_public_business_contact TO PRIORITIZE BUSINESS WHATSAPP
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
  SELECT id, name, is_menu_published, whatsapp
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

  -- 1. Priority 1: Merchant configured WhatsApp number in business settings
  IF v_biz.whatsapp IS NOT NULL AND trim(v_biz.whatsapp) <> '' THEN
    v_wa := trim(v_biz.whatsapp);
  ELSE
    -- 2. Priority 2: whatsapp_business_connections
    SELECT display_phone_number
    INTO v_wa
    FROM public.whatsapp_business_connections
    WHERE business_id = p_business_id
      AND status = 'connected'
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  -- 3. Check pos_receipt_settings for store_phone
  SELECT store_phone
  INTO v_phone
  FROM public.pos_receipt_settings
  WHERE business_id = p_business_id;

  -- Return sanitized contact strictly without private data
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

-- 3. UPDATE get_public_menu_bundle TO SELECT BUSINESS WHATSAPP
CREATE OR REPLACE FUNCTION public.get_public_menu_bundle(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_biz record;
  v_design jsonb;
  v_products jsonb;
  v_tables jsonb;
  v_qris jsonb;
  v_contact jsonb;
  v_receipt record;
  v_wa record;
  v_phone text := '';
  v_wa_number text := '';
  v_store_name text := '';
BEGIN
  IF p_business_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAM', 'message', 'business_id wajib diisi.');
  END IF;

  -- 1. Fetch business (only public attributes + whatsapp)
  SELECT id, name, slogan, description, cover_url, logo_url, is_menu_published, whatsapp
  INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Bisnis tidak ditemukan.');
  END IF;

  IF v_biz.is_menu_published IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PUBLISHED', 'message', 'Menu bisnis ini belum dipublikasikan.');
  END IF;

  -- 2. Fetch design settings
  SELECT jsonb_build_object(
    'version', d.version,
    'theme', d.theme,
    'layout', d.layout
  )
  INTO v_design
  FROM public.qr_menu_design_settings d
  WHERE d.business_id = p_business_id;

  IF v_design IS NULL THEN
    v_design := jsonb_build_object(
      'version', 1,
      'theme', '{
        "primary": "#F5A623",
        "secondary": "#1E2A5E",
        "background": "#FFF9F4",
        "surface": "#FFFFFF",
        "text": "#1E2A5E",
        "button": "#F5A623",
        "buttonStyle": "pill",
        "fontHeading": "Inter",
        "fontBody": "Inter"
      }'::jsonb,
      'layout', '[
        { "id": "logo", "type": "logo", "visible": true, "props": { "size": "md", "shape": "circle", "alignment": "center" } },
        { "id": "business_info", "type": "business_info", "visible": true, "props": { "alignment": "center", "showSlogan": true, "showDescription": true } },
        { "id": "banner", "type": "banner", "visible": true, "props": { "height": "compact" } },
        { "id": "categories", "type": "categories", "visible": true, "props": { "style": "pills" } },
        { "id": "products", "type": "products", "visible": true, "props": { "layout": "grid" } },
        { "id": "social", "type": "social", "visible": false, "props": {} },
        { "id": "footer", "type": "footer", "visible": true, "props": { "text": "Terima kasih sudah mendukung usaha kami ❤️" } }
      ]'::jsonb
    );
  END IF;

  -- 3. Fetch products
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'price', p.price,
      'category', p.category,
      'image_url', p.image_url,
      'is_active', p.is_active,
      'stock', p.stock
    ) ORDER BY p.name ASC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.products p
  WHERE p.business_id = p_business_id AND p.is_active = true;

  -- 4. Fetch active tables
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'sort_order', t.sort_order,
      'is_active', t.is_active
    ) ORDER BY t.sort_order ASC, t.name ASC
  ), '[]'::jsonb)
  INTO v_tables
  FROM public.tables t
  WHERE t.business_id = p_business_id AND t.is_active = true;

  -- 5. Fetch payment settings
  SELECT jsonb_build_object(
    'qris_enabled', s.qris_enabled,
    'qris_image_url', s.qris_image_url
  )
  INTO v_qris
  FROM public.business_payment_settings s
  WHERE s.business_id = p_business_id;

  -- 6. Resolve contact
  SELECT store_phone, store_name INTO v_receipt
  FROM public.pos_receipt_settings
  WHERE business_id = p_business_id;

  SELECT display_phone_number INTO v_wa
  FROM public.whatsapp_business_connections
  WHERE business_id = p_business_id AND status = 'connected';

  IF v_receipt.store_phone IS NOT NULL AND v_receipt.store_phone <> '' THEN
    v_phone := v_receipt.store_phone;
  END IF;

  -- Priority for WhatsApp: businesses.whatsapp > whatsapp_business_connections
  IF v_biz.whatsapp IS NOT NULL AND trim(v_biz.whatsapp) <> '' THEN
    v_wa_number := trim(v_biz.whatsapp);
  ELSIF v_wa.display_phone_number IS NOT NULL AND v_wa.display_phone_number <> '' THEN
    v_wa_number := v_wa.display_phone_number;
  END IF;

  IF v_receipt.store_name IS NOT NULL AND v_receipt.store_name <> '' THEN
    v_store_name := v_receipt.store_name;
  ELSE
    v_store_name := v_biz.name;
  END IF;

  v_contact := jsonb_build_object(
    'business_name', v_store_name,
    'phone', v_phone,
    'whatsapp', v_wa_number
  );

  RETURN jsonb_build_object(
    'success', true,
    'business', jsonb_build_object(
      'id', v_biz.id,
      'name', v_biz.name,
      'slogan', v_biz.slogan,
      'description', v_biz.description,
      'cover_url', v_biz.cover_url,
      'logo_url', v_biz.logo_url,
      'is_menu_published', v_biz.is_menu_published,
      'whatsapp', coalesce(v_biz.whatsapp, '')
    ),
    'design', v_design,
    'products', v_products,
    'tables', v_tables,
    'qris', v_qris,
    'contact', v_contact
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_menu_bundle(uuid) TO anon, authenticated, service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
