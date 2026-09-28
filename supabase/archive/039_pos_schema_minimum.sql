-- ============================================================
-- 039_pos_schema_minimum.sql
-- Minimal POS/QR Menu schema — applied 2026-09-09
--
-- PURPOSE: Add missing tables/columns for QR Menu & POS.
-- This is a minimal subset of migration 003, WITHOUT slug.
-- Production businesses currently has: id, owner_id, name,
--   description, industry, location, is_active, created_at,
--   updated_at, business_type, business_category, business_focus.
--
-- APPLIES:
--   - businesses: is_menu_published, slogan, cover_url, logo_url
--   - products: menu_category_id
--   - menu_categories (new table)
--   - tables (new table)
--   - orders (new table)
--   - order_items (new table)
--   - payments (new table)
--   - shifts (new table)
--   - storage bucket policies (ID-based, NOT slug)
--
-- DOES NOT ADD: businesses.slug
-- ============================================================

-- ============================================================
-- 1. BUSINESSES — add menu/branding columns
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses' AND column_name='is_menu_published'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN is_menu_published boolean default false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses' AND column_name='slogan'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN slogan text default '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses' AND column_name='cover_url'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN cover_url text default '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='businesses' AND column_name='logo_url'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN logo_url text default '';
  END IF;
END $$;

-- ============================================================
-- 2. MENU CATEGORIES (must exist before products.menu_category_id FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer default 0,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS menu_categories_business_id_idx ON public.menu_categories(business_id);

-- Owner policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_select_owner' AND tablename = 'menu_categories') THEN
    CREATE POLICY "menu_categories_select_owner" ON menu_categories FOR SELECT TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_insert_owner' AND tablename = 'menu_categories') THEN
    CREATE POLICY "menu_categories_insert_owner" ON menu_categories FOR INSERT TO authenticated
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_update_owner' AND tablename = 'menu_categories') THEN
    CREATE POLICY "menu_categories_update_owner" ON menu_categories FOR UPDATE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_delete_owner' AND tablename = 'menu_categories') THEN
    CREATE POLICY "menu_categories_delete_owner" ON menu_categories FOR DELETE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

-- Public read (for published menu)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'menu_categories_public_read' AND tablename = 'menu_categories') THEN
    CREATE POLICY "menu_categories_public_read" ON menu_categories FOR SELECT
      USING (is_active = true AND business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true));
  END IF;
END $$;

-- ============================================================
-- 3. PRODUCTS — add menu_category_id
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='menu_category_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN menu_category_id uuid references public.menu_categories(id) on delete set null;
  END IF;
END $$;

-- ============================================================
-- 4. TABLES (meja)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tables (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tables_business_id_idx ON public.tables(business_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tables_select_owner' AND tablename = 'tables') THEN
    CREATE POLICY "tables_select_owner" ON tables FOR SELECT TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tables_insert_owner' AND tablename = 'tables') THEN
    CREATE POLICY "tables_insert_owner" ON tables FOR INSERT TO authenticated
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tables_update_owner' AND tablename = 'tables') THEN
    CREATE POLICY "tables_update_owner" ON tables FOR UPDATE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tables_delete_owner' AND tablename = 'tables') THEN
    CREATE POLICY "tables_delete_owner" ON tables FOR DELETE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tables_public_read' AND tablename = 'tables') THEN
    CREATE POLICY "tables_public_read" ON tables FOR SELECT
      USING (is_active = true AND business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true));
  END IF;
END $$;

-- ============================================================
-- 5. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  order_number    serial,
  table_id        uuid references public.tables(id) on delete set null,
  customer_name   text default '',
  order_source    text not null default 'pos',
  order_status    text not null default 'pending',
  payment_method  text default '',
  payment_status  text not null default 'pending',
  payment_ref     text default '',
  subtotal        numeric(15,2) default 0,
  discount_type   text default '',
  discount_value  numeric(15,2) default 0,
  discount_amount numeric(15,2) default 0,
  total           numeric(15,2) default 0,
  notes           text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS orders_business_id_idx ON public.orders(business_id);
CREATE INDEX IF NOT EXISTS orders_table_id_idx ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS orders_order_status_idx ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at desc);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_select_owner' AND tablename = 'orders') THEN
    CREATE POLICY "orders_select_owner" ON orders FOR SELECT TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_insert_owner' AND tablename = 'orders') THEN
    CREATE POLICY "orders_insert_owner" ON orders FOR INSERT TO authenticated
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_update_owner' AND tablename = 'orders') THEN
    CREATE POLICY "orders_update_owner" ON orders FOR UPDATE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_delete_owner' AND tablename = 'orders') THEN
    CREATE POLICY "orders_delete_owner" ON orders FOR DELETE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

-- Public insert/update (QR menu orders)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_public_insert' AND tablename = 'orders') THEN
    CREATE POLICY "orders_public_insert" ON orders FOR INSERT
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_public_update' AND tablename = 'orders') THEN
    CREATE POLICY "orders_public_update" ON orders FOR UPDATE
      USING (business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true));
  END IF;
END $$;

-- ============================================================
-- 6. ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity     integer not null default 1,
  unit_price   numeric(15,2) not null default 0,
  subtotal     numeric(15,2) not null default 0,
  created_at   timestamptz default now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'order_items_select_owner' AND tablename = 'order_items') THEN
    CREATE POLICY "order_items_select_owner" ON order_items FOR SELECT TO authenticated
      USING (order_id IN (SELECT id FROM public.orders WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'order_items_insert_owner' AND tablename = 'order_items') THEN
    CREATE POLICY "order_items_insert_owner" ON order_items FOR INSERT TO authenticated
      WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'order_items_delete_owner' AND tablename = 'order_items') THEN
    CREATE POLICY "order_items_delete_owner" ON order_items FOR DELETE TO authenticated
      USING (order_id IN (SELECT id FROM public.orders WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'order_items_public_insert' AND tablename = 'order_items') THEN
    CREATE POLICY "order_items_public_insert" ON order_items FOR INSERT
      WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true)));
  END IF;
END $$;

-- ============================================================
-- 7. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid primary key default uuid_generate_v4(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  business_id         uuid not null references public.businesses(id) on delete cascade,
  payment_provider    text default '',
  transaction_id      text default '',
  payment_method      text default '',
  gross_amount        numeric(15,2) default 0,
  transaction_status  text default '',
  payment_status      text not null default 'pending',
  paid_at             timestamptz,
  raw_response        jsonb default '{}',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS payments_business_id_idx ON public.payments(business_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'payments_select_owner' AND tablename = 'payments') THEN
    CREATE POLICY "payments_select_owner" ON payments FOR SELECT TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'payments_insert_owner' AND tablename = 'payments') THEN
    CREATE POLICY "payments_insert_owner" ON payments FOR INSERT TO authenticated
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'payments_update_owner' AND tablename = 'payments') THEN
    CREATE POLICY "payments_update_owner" ON payments FOR UPDATE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

-- ============================================================
-- 8. SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shifts (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  profile_id        uuid not null references public.profiles(id),
  status            text not null default 'open',
  kas_awal          numeric(15,2) default 0,
  kas_aktual        numeric(15,2) default 0,
  total_sales       numeric(15,2) default 0,
  total_cash        numeric(15,2) default 0,
  total_online      numeric(15,2) default 0,
  total_transactions integer default 0,
  total_refund      numeric(15,2) default 0,
  selisih           numeric(15,2) default 0,
  opened_at         timestamptz default now(),
  closed_at         timestamptz,
  created_at        timestamptz default now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS shifts_business_id_idx ON public.shifts(business_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shifts_select_owner' AND tablename = 'shifts') THEN
    CREATE POLICY "shifts_select_owner" ON shifts FOR SELECT TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shifts_insert_owner' AND tablename = 'shifts') THEN
    CREATE POLICY "shifts_insert_owner" ON shifts FOR INSERT TO authenticated
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shifts_update_owner' AND tablename = 'shifts') THEN
    CREATE POLICY "shifts_update_owner" ON shifts FOR UPDATE TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

-- ============================================================
-- 9. STORAGE — fix policies (ID-based, NOT slug)
-- Drop old slug-based policies from 003 if they exist,
-- then create correct ID-based policies (from migration 007).
-- ============================================================

-- product-images: drop old slug-based policy
DROP POLICY IF EXISTS "product_images_owner_all" ON storage.objects;
DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "product_images_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_select_owner' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "product_images_select_owner" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "product_images_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "product_images_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'product_images_select_public' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "product_images_select_public" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'product-images');
  END IF;
END $$;

-- business-assets: drop old slug-based policy
DROP POLICY IF EXISTS "business_assets_owner_all" ON storage.objects;
DROP POLICY IF EXISTS "public_read_business_assets" ON storage.objects;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_assets_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "business_assets_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'business-assets' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_assets_select_owner' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "business_assets_select_owner" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'business-assets' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_assets_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "business_assets_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'business-assets' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
      WITH CHECK (bucket_id = 'business-assets' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_assets_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "business_assets_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'business-assets' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'business_assets_select_public' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "business_assets_select_public" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'business-assets');
  END IF;
END $$;

-- ============================================================
-- PUBLIC MENU READ (businesses)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'businesses_public_menu_read' AND tablename = 'businesses') THEN
    CREATE POLICY "businesses_public_menu_read" ON businesses FOR SELECT TO public
      USING (is_menu_published = true);
  END IF;
END $$;

-- PUBLIC MENU READ (products)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_public_menu_read' AND tablename = 'products') THEN
    CREATE POLICY "products_public_menu_read" ON products FOR SELECT
      USING (is_available = true AND is_active = true AND business_id IN (SELECT id FROM public.businesses WHERE is_menu_published = true));
  END IF;
END $$;
