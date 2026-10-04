-- ============================================================================
-- Migration 102: QR Public Menu High Concurrency Optimization (1000 Users Scale)
-- ============================================================================
-- 1. Optimized covering composite indexes for public QR menu lookups
-- 2. Unified atomic RPC get_public_menu_bundle(p_business_id) for single-trip fetching
-- 3. Strict security: zero leakage of cost_price, notes, owner_id, or internal data
-- ============================================================================

-- 1. Covering Composite Indexes
CREATE INDEX IF NOT EXISTS idx_products_public_menu 
  ON public.products(business_id, is_available, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_tables_public_menu 
  ON public.tables(business_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_businesses_public_menu 
  ON public.businesses(id, is_menu_published);

CREATE INDEX IF NOT EXISTS idx_qr_design_public 
  ON public.qr_menu_design_settings(business_id);

CREATE INDEX IF NOT EXISTS idx_business_payment_public 
  ON public.business_payment_settings(business_id);

-- 2. Unified High-Performance RPC
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

  -- 1. Fetch business (only public attributes)
  SELECT id, name, slogan, description, cover_url, logo_url, is_menu_published, whatsapp, phone
  INTO v_biz
  FROM public.businesses
  WHERE id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Bisnis tidak ditemukan.');
  END IF;

  IF v_biz.is_menu_published IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PUBLISHED', 'message', 'Menu bisnis ini belum dipublikasikan.');
  END IF;

  -- 2. Fetch design settings (theme, layout, version only)
  SELECT jsonb_build_object(
    'version', coalesce(d.version, 1),
    'theme', d.theme,
    'layout', d.layout
  ) INTO v_design
  FROM public.qr_menu_design_settings d
  WHERE d.business_id = p_business_id;

  -- 3. Fetch products (strictly public columns - NEVER cost_price or notes)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'unit_price', p.unit_price,
      'category', p.category,
      'image_url', p.image_url,
      'slogan', p.slogan,
      'is_available', p.is_available,
      'is_active', p.is_active,
      'is_best_seller', p.is_best_seller,
      'sort_order', p.sort_order,
      'metadata', p.metadata
    ) ORDER BY p.sort_order ASC, p.name ASC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.products p
  WHERE p.business_id = p_business_id
    AND p.is_available = true
    AND p.is_active = true;

  -- 4. Fetch tables (strictly public display columns)
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
  WHERE t.business_id = p_business_id
    AND t.is_active = true;

  -- 5. Fetch QRIS settings
  SELECT jsonb_build_object(
    'business_id', s.business_id,
    'qris_enabled', coalesce(s.qris_enabled, false),
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
  ELSIF v_biz.phone IS NOT NULL THEN
    v_phone := v_biz.phone;
  END IF;

  IF v_wa.display_phone_number IS NOT NULL AND v_wa.display_phone_number <> '' THEN
    v_wa_number := v_wa.display_phone_number;
  ELSIF v_biz.whatsapp IS NOT NULL THEN
    v_wa_number := v_biz.whatsapp;
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
      'phone', v_biz.phone,
      'whatsapp', v_biz.whatsapp
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
