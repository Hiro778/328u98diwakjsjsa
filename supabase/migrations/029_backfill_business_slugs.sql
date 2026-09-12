-- ============================================================
-- 029_backfill_business_slugs.sql
-- Backfill: generate slugs for businesses that don't have one.
-- The slug column was added in 003 but never populated during
-- onboarding, which breaks image upload (storage folder path).
-- ============================================================

-- Backfill missing slugs using a simple slugify of the business name
-- + first 4 chars of the UUID to ensure uniqueness.
UPDATE public.businesses
SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi'))
         || '-' || substr(id::text, 1, 4)
WHERE slug IS NULL OR slug = '';

-- Ensure slug is NOT NULL going forward
ALTER TABLE public.businesses
  ALTER COLUMN slug SET NOT NULL;
