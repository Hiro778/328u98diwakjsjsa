-- ============================================================
-- 006_fix_products_columns.sql
-- Idempotent: tambahkan kolom produk yang kurang.
-- Tidak ada reference ke menu_categories.
-- ============================================================

-- image_url
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.products ADD COLUMN image_url text DEFAULT '';
  END IF;
END $$;

-- slogan
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'slogan'
  ) THEN
    ALTER TABLE public.products ADD COLUMN slogan text DEFAULT '';
  END IF;
END $$;

-- is_best_seller
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_best_seller'
  ) THEN
    ALTER TABLE public.products ADD COLUMN is_best_seller boolean DEFAULT false;
  END IF;
END $$;

-- sort_order
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.products ADD COLUMN sort_order integer DEFAULT 0;
  END IF;
END $$;

-- is_available
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_available'
  ) THEN
    ALTER TABLE public.products ADD COLUMN is_available boolean DEFAULT true;
  END IF;
END $$;

-- category (text, sumber kategori produk)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.products ADD COLUMN category text DEFAULT '';
  END IF;
END $$;
