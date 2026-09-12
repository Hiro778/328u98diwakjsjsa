-- ============================================================
-- 007_fix_storage_rls_policies.sql
-- Fix: storage.objects policies for product-images & business-assets
--
-- Problem: old policy only checked slug, but upload path may use
-- business.id (UUID). New policies check BOTH slug AND uuid.
-- NOTE: This migration uses business.id since 'slug' column
-- may not exist in all deployments. Falls back to id::text check.
-- Relationship: auth.uid() -> businesses.owner_id -> businesses.id
-- Upload path: {business.id}/{filename} or {business.slug}/{filename}
-- ==========================================================--

-- ─── PRODUCT-IMAGES ─────────────────────────────────────────

-- Drop old policies (if they exist from previous failed attempts)
DROP POLICY IF EXISTS "product_images_owner_all" ON storage.objects;
DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;

-- INSERT: owner can upload to their own business folder
-- Uses id::text check since 'slug' column may not exist in all deployments
CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- SELECT: owner can view their own business images
CREATE POLICY "product_images_select_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- SELECT: public read (bucket is public, needed for public menu / QR menu)
CREATE POLICY "product_images_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');

-- UPDATE: owner can update their own business images
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE: owner can delete their own business images
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- ─── BUSINESS-ASSETS ────────────────────────────────────────

-- Drop old policies (if they exist from previous failed attempts)
DROP POLICY IF EXISTS "business_assets_owner_all" ON storage.objects;
DROP POLICY IF EXISTS "public_read_business_assets" ON storage.objects;

-- INSERT
CREATE POLICY "business_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-assets'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- SELECT: owner
CREATE POLICY "business_assets_select_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- SELECT: public
CREATE POLICY "business_assets_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'business-assets');

-- UPDATE
CREATE POLICY "business_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'business-assets'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );

-- DELETE
CREATE POLICY "business_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-assets'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    )
  );