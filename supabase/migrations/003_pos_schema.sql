-- ============================================================
-- 003_pos_schema.sql
-- BisnisSehat - POS, QR Menu, Orders, Payments, Shifts
-- ============================================================

-- ============================================================
-- 1. ALTER BUSINESSES - add slug + menu fields
-- ============================================================
alter table public.businesses
  add column slug              text unique,
  add column slogan            text default '',
  add column cover_url         text default '',
  add column logo_url          text default '',
  add column is_menu_published boolean default false;

-- ============================================================
-- 2. MENU CATEGORIES (must exist before products FK reference)
-- ============================================================
create table public.menu_categories (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer default 0,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.menu_categories enable row level security;

create index menu_categories_business_id_idx on public.menu_categories(business_id);

create policy "Users can view own business menu categories"
  on menu_categories for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business menu categories"
  on menu_categories for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business menu categories"
  on menu_categories for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business menu categories"
  on menu_categories for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "menu_categories_public_read" on menu_categories for select
  using (
    is_active = true
    and business_id in (
      select id from public.businesses where is_menu_published = true
    )
  );

-- ============================================================
-- 3. ALTER PRODUCTS - add menu fields
-- ============================================================
alter table public.products
  add column image_url         text default '',
  add column slogan            text default '',
  add column is_best_seller    boolean default false,
  add column sort_order        integer default 0,
  add column is_available      boolean default true,
  add column menu_category_id  uuid references public.menu_categories(id) on delete set null;

create policy "products_public_menu_read" on products for select
  using (
    is_available = true
    and is_active = true
    and business_id in (
      select id from public.businesses where is_menu_published = true
    )
  );

-- ============================================================
-- 4. TABLES (meja)
-- ============================================================
create table public.tables (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sort_order  integer default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

alter table public.tables enable row level security;

create index tables_business_id_idx on public.tables(business_id);

create policy "Users can view own business tables"
  on tables for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business tables"
  on tables for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business tables"
  on tables for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business tables"
  on tables for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "tables_public_read" on tables for select
  using (
    is_active = true
    and business_id in (
      select id from public.businesses where is_menu_published = true
    )
  );

-- ============================================================
-- 5. ORDERS
-- ============================================================
create table public.orders (
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

alter table public.orders enable row level security;

create index orders_business_id_idx on public.orders(business_id);
create index orders_table_id_idx on public.orders(table_id);
create index orders_order_status_idx on public.orders(order_status);
create index orders_created_at_idx on public.orders(created_at desc);

create policy "Users can view own business orders"
  on orders for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business orders"
  on orders for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business orders"
  on orders for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own business orders"
  on orders for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "orders_public_insert" on orders for insert
  with check (
    business_id in (
      select id from public.businesses where is_menu_published = true
    )
  );

create policy "orders_public_update" on orders for update
  using (
    business_id in (
      select id from public.businesses where is_menu_published = true
    )
  )
  with check (
    business_id in (
      select id from public.businesses where is_menu_published = true
    )
  );

-- ============================================================
-- 6. ORDER ITEMS
-- ============================================================
create table public.order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity     integer not null default 1,
  unit_price   numeric(15,2) not null default 0,
  subtotal     numeric(15,2) not null default 0,
  created_at   timestamptz default now()
);

alter table public.order_items enable row level security;

create index order_items_order_id_idx on public.order_items(order_id);

create policy "Users can view own order items"
  on order_items for select to authenticated
  using (
    order_id in (
      select id from public.orders
      where business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    )
  );

create policy "Users can insert own order items"
  on order_items for insert to authenticated
  with check (
    order_id in (
      select id from public.orders
      where business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    )
  );

create policy "Users can delete own order items"
  on order_items for delete to authenticated
  using (
    order_id in (
      select id from public.orders
      where business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    )
  );

create policy "order_items_public_insert" on order_items for insert
  with check (
    order_id in (
      select id from public.orders
      where business_id in (
        select id from public.businesses where is_menu_published = true
      )
    )
  );

-- ============================================================
-- 7. PAYMENTS
-- ============================================================
create table public.payments (
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

alter table public.payments enable row level security;

create index payments_order_id_idx on public.payments(order_id);
create index payments_business_id_idx on public.payments(business_id);

create policy "Users can view own business payments"
  on payments for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business payments"
  on payments for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business payments"
  on payments for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 8. SHIFTS (shift kasir)
-- ============================================================
create table public.shifts (
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

alter table public.shifts enable row level security;

create index shifts_business_id_idx on public.shifts(business_id);

create policy "Users can view own business shifts"
  on shifts for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business shifts"
  on shifts for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business shifts"
  on shifts for update to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  )
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 9. STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
insert into storage.buckets (id, name, public) values ('business-assets', 'business-assets', true);

create policy "product_images_owner_all" on storage.objects for all
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select slug from public.businesses where owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select slug from public.businesses where owner_id = (select auth.uid())
    )
  );

create policy "business_assets_owner_all" on storage.objects for all
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] in (
      select slug from public.businesses where owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] in (
      select slug from public.businesses where owner_id = (select auth.uid())
    )
  );

create policy "public_read_product_images" on storage.objects for select
  using (bucket_id = 'product-images');

create policy "public_read_business_assets" on storage.objects for select
  using (bucket_id = 'business-assets');
