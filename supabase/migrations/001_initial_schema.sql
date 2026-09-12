-- ============================================================
-- 001_initial_schema.sql
-- BisnisSehat - initial database schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text default '',
  avatar_url text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Auto-create profile on user signup via trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. BUSINESSES
-- ============================================================
create table public.businesses (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text default '',
  industry    text default '',
  location    text default '',
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.businesses enable row level security;

create index businesses_owner_id_idx on public.businesses(owner_id);

create policy "Users can view own businesses"
  on businesses for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can insert own businesses"
  on businesses for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update own businesses"
  on businesses for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete own businesses"
  on businesses for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ============================================================
-- 3. PRODUCTS
-- ============================================================
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  sku         text,
  description text default '',
  category    text default '',
  unit        text default 'pcs',
  unit_price  numeric(15,2) default 0,
  cost_price  numeric(15,2) default 0,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.products enable row level security;

create index products_business_id_idx on public.products(business_id);

create policy "Users can view own business products"
  on products for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business products"
  on products for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business products"
  on products for update to authenticated
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

create policy "Users can delete own business products"
  on products for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 4. SUPPLIERS
-- ============================================================
create table public.suppliers (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  contact     text default '',
  phone       text default '',
  email       text default '',
  address     text default '',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.suppliers enable row level security;

create index suppliers_business_id_idx on public.suppliers(business_id);

create policy "Users can view own business suppliers"
  on suppliers for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business suppliers"
  on suppliers for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business suppliers"
  on suppliers for update to authenticated
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

create policy "Users can delete own business suppliers"
  on suppliers for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 5. INVENTORY
-- ============================================================
create table public.inventory (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.products(id) on delete cascade,
  quantity    integer default 0,
  min_stock   integer default 0,
  location    text default '',
  updated_at  timestamptz default now()
);

alter table public.inventory enable row level security;

create index inventory_product_id_idx on public.inventory(product_id);

create policy "Users can view own product inventory"
  on inventory for select to authenticated
  using (
    product_id in (
      select p.id from public.products p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own product inventory"
  on inventory for insert to authenticated
  with check (
    product_id in (
      select p.id from public.products p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = (select auth.uid())
    )
  );

create policy "Users can update own product inventory"
  on inventory for update to authenticated
  using (
    product_id in (
      select p.id from public.products p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = (select auth.uid())
    )
  )
  with check (
    product_id in (
      select p.id from public.products p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = (select auth.uid())
    )
  );

create policy "Users can delete own product inventory"
  on inventory for delete to authenticated
  using (
    product_id in (
      select p.id from public.products p
      join public.businesses b on b.id = p.business_id
      where b.owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 6. SALES
-- ============================================================
create table public.sales (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  quantity    integer not null default 1,
  unit_price  numeric(15,2) not null default 0,
  total       numeric(15,2) not null default 0,
  sale_date   date not null default current_date,
  notes       text default '',
  created_at  timestamptz default now()
);

alter table public.sales enable row level security;

create index sales_business_id_idx on public.sales(business_id);
create index sales_product_id_idx on public.sales(product_id);

create policy "Users can view own business sales"
  on sales for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business sales"
  on sales for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business sales"
  on sales for update to authenticated
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

create policy "Users can delete own business sales"
  on sales for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 7. EXPENSES
-- ============================================================
create table public.expenses (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  category     text not null default '',
  description  text default '',
  amount       numeric(15,2) not null default 0,
  expense_date date not null default current_date,
  notes        text default '',
  created_at   timestamptz default now()
);

alter table public.expenses enable row level security;

create index expenses_business_id_idx on public.expenses(business_id);

create policy "Users can view own business expenses"
  on expenses for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business expenses"
  on expenses for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business expenses"
  on expenses for update to authenticated
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

create policy "Users can delete own business expenses"
  on expenses for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 8. CUSTOMERS
-- ============================================================
create table public.customers (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  email       text default '',
  phone       text default '',
  address     text default '',
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.customers enable row level security;

create index customers_business_id_idx on public.customers(business_id);

create policy "Users can view own business customers"
  on customers for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business customers"
  on customers for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business customers"
  on customers for update to authenticated
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

create policy "Users can delete own business customers"
  on customers for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 9. EXPORT PROJECTS
-- ============================================================
create table public.export_projects (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  destination     text not null default '',
  incoterm        text default 'FOB',
  quantity        numeric(15,2) default 0,
  unit            text default 'kg',
  production_cost numeric(15,2) default 0,
  export_cost     numeric(15,2) default 0,
  est_revenue     numeric(15,2) default 0,
  status          text default 'draft',
  notes           text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.export_projects enable row level security;

create index export_projects_business_id_idx on public.export_projects(business_id);

create policy "Users can view own business exports"
  on export_projects for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business exports"
  on export_projects for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business exports"
  on export_projects for update to authenticated
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

create policy "Users can delete own business exports"
  on export_projects for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 10. SUBSCRIPTIONS
-- ============================================================
create table public.subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  plan          text not null default 'free',
  status        text not null default 'inactive',
  started_at    timestamptz,
  expires_at    timestamptz,
  payment_ref   text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.subscriptions enable row level security;

create index subscriptions_profile_id_idx on public.subscriptions(profile_id);

create policy "Users can view own subscription"
  on subscriptions for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy "Users can insert own subscription"
  on subscriptions for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy "Users can update own subscription"
  on subscriptions for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);
