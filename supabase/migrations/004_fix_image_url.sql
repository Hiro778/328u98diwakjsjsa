-- ============================================================
-- 004_fix_image_url.sql
-- Fix: add image_url column to products if missing
-- ============================================================

-- Add image_url if it doesn't exist (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.products ADD COLUMN image_url text DEFAULT '';
  END IF;
END $$;

-- Add slogan if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'slogan'
  ) THEN
    ALTER TABLE public.products ADD COLUMN slogan text DEFAULT '';
  END IF;
END $$;

-- Add is_best_seller if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_best_seller'
  ) THEN
    ALTER TABLE public.products ADD COLUMN is_best_seller boolean default false;
  END IF;
END $$;

-- Add sort_order if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.products ADD COLUMN sort_order integer default 0;
  END IF;
END $$;

-- Add is_available if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_available'
  ) THEN
    ALTER TABLE public.products ADD COLUMN is_available boolean default true;
  END IF;
END $$;

-- Add menu_category_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'menu_category_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN menu_category_id uuid
      references public.menu_categories(id) on delete set null;
  END IF;
END $$;

-- Add slug to businesses if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN slug text unique;
  END IF;
END $$;

-- Add menu fields to businesses if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'slogan'
  ) THEN
    ALTER TABLE public.businesses
      ADD COLUMN slogan text default '',
      ADD COLUMN cover_url text default '',
      ADD COLUMN logo_url text default '',
      ADD COLUMN is_menu_published boolean default false;
  END IF;
END $$;
