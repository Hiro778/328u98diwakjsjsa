-- ============================================================
-- 057_qr_menu_design_settings.sql
-- Custom QR Menu Designer Theme & Layout Configuration
-- Strictly tenant-isolated via RLS matching business ownership
-- Public read allowed only for published business menus
-- Storage policies for tenant-isolated uploads to 'product-images'
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qr_menu_design_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  version             int NOT NULL DEFAULT 1,
  theme               jsonb NOT NULL DEFAULT '{
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
  layout              jsonb NOT NULL DEFAULT '[
    { "id": "logo", "type": "logo", "visible": true, "props": { "size": "md", "shape": "circle", "alignment": "center" } },
    { "id": "business_info", "type": "business_info", "visible": true, "props": { "alignment": "center", "showSlogan": true, "showDescription": true } },
    { "id": "banner", "type": "banner", "visible": true, "props": { "height": "compact" } },
    { "id": "categories", "type": "categories", "visible": true, "props": { "style": "pills" } },
    { "id": "products", "type": "products", "visible": true, "props": { "layout": "grid" } },
    { "id": "social", "type": "social", "visible": false, "props": {} },
    { "id": "footer", "type": "footer", "visible": true, "props": { "text": "Terima kasih sudah mendukung usaha kami ❤️" } }
  ]'::jsonb,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Index for fast lookup by business_id
CREATE INDEX IF NOT EXISTS idx_qr_menu_design_settings_biz ON public.qr_menu_design_settings(business_id);

-- Enable Row Level Security
ALTER TABLE public.qr_menu_design_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "qr_menu_design_settings_owner_select" ON public.qr_menu_design_settings;
DROP POLICY IF EXISTS "qr_menu_design_settings_owner_insert" ON public.qr_menu_design_settings;
DROP POLICY IF EXISTS "qr_menu_design_settings_owner_update" ON public.qr_menu_design_settings;
DROP POLICY IF EXISTS "qr_menu_design_settings_owner_delete" ON public.qr_menu_design_settings;
DROP POLICY IF EXISTS "qr_menu_design_settings_public_select" ON public.qr_menu_design_settings;

-- 1. SELECT: Owner can select their business's design settings
CREATE POLICY "qr_menu_design_settings_owner_select"
  ON public.qr_menu_design_settings FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 2. INSERT: Owner can insert design settings for their business
CREATE POLICY "qr_menu_design_settings_owner_insert"
  ON public.qr_menu_design_settings FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 3. UPDATE: Owner can update design settings for their business
CREATE POLICY "qr_menu_design_settings_owner_update"
  ON public.qr_menu_design_settings FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 4. DELETE: Owner can delete design settings for their business
CREATE POLICY "qr_menu_design_settings_owner_delete"
  ON public.qr_menu_design_settings FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 5. PUBLIC SELECT: Anyone (anon/authenticated) can read design settings if the business has published its menu
CREATE POLICY "qr_menu_design_settings_public_select"
  ON public.qr_menu_design_settings FOR SELECT TO public
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE is_menu_published = true
    )
  );

-- ─── STORAGE POLICIES FOR QR MENU ASSETS IN 'product-images' ──────
-- Path convention: qr-menu/{businessId}/logo/... or qr-menu/{businessId}/banner/...
DROP POLICY IF EXISTS "product_images_qr_menu_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_qr_menu_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_qr_menu_delete" ON storage.objects;

CREATE POLICY "product_images_qr_menu_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] = 'qr-menu'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "product_images_qr_menu_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] = 'qr-menu'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "product_images_qr_menu_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] = 'qr-menu'
      AND (storage.foldername(name))[2] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );
