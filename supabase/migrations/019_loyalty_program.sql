-- ============================================================
-- 019_loyalty_program.sql
-- BisnisSehat - Loyalty Program: programs, rewards, ledger, redemptions
-- ============================================================

-- ============================================================
-- 1. ADD LOYALTY FIELDS TO CUSTOMERS
-- ============================================================
alter table public.customers
  add column loyalty_points_balance integer not null default 0,
  add column loyalty_lifetime_points integer not null default 0,
  add column loyalty_total_redeemed integer not null default 0,
  add column loyalty_is_member boolean not null default false;

-- ============================================================
-- 2. LOYALTY PROGRAMS (one per business, config)
-- ============================================================
create table public.loyalty_programs (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references public.businesses(id) on delete cascade,
  name                    text not null default 'Program Loyalitas',
  is_active               boolean not null default true,
  min_transaction_amount  numeric(15,2) not null default 0,
  points_per_rule         integer not null default 1,
  rule_amount             numeric(15,2) not null default 10000,
  min_points_redeem       integer not null default 100,
  points_expiry_days      integer,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table public.loyalty_programs enable row level security;

create unique index loyalty_programs_business_id_idx on public.loyalty_programs(business_id);

create policy "Users can view own business loyalty program"
  on loyalty_programs for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business loyalty program"
  on loyalty_programs for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business loyalty program"
  on loyalty_programs for update to authenticated
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

create policy "Users can delete own business loyalty program"
  on loyalty_programs for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 3. LOYALTY REWARDS (catalog)
-- ============================================================
create table public.loyalty_rewards (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  name              text not null,
  description       text default '',
  points_required   integer not null default 0,
  stock             integer,
  is_active         boolean not null default true,
  expiry_date       date,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.loyalty_rewards enable row level security;

create index loyalty_rewards_business_id_idx on public.loyalty_rewards(business_id);

create policy "Users can view own business loyalty rewards"
  on loyalty_rewards for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business loyalty rewards"
  on loyalty_rewards for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business loyalty rewards"
  on loyalty_rewards for update to authenticated
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

create policy "Users can delete own business loyalty rewards"
  on loyalty_rewards for delete to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 4. LOYALTY POINTS LEDGER (immutable audit trail)
-- ============================================================
create table public.loyalty_points_ledger (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  type            text not null,
  points          integer not null,
  balance_after   integer not null,
  reference_type  text default '',
  reference_id    uuid,
  description     text default '',
  created_at      timestamptz default now()
);

alter table public.loyalty_points_ledger enable row level security;

create index loyalty_points_ledger_business_id_idx on public.loyalty_points_ledger(business_id);
create index loyalty_points_ledger_customer_id_idx on public.loyalty_points_ledger(customer_id);

create policy "Users can view own business loyalty ledger"
  on loyalty_points_ledger for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business loyalty ledger"
  on loyalty_points_ledger for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- No UPDATE/DELETE policies — ledger is immutable

-- ============================================================
-- 5. LOYALTY REDEMPTIONS
-- ============================================================
create table public.loyalty_redemptions (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  reward_id       uuid references public.loyalty_rewards(id) on delete set null,
  points_spent    integer not null default 0,
  status          text not null default 'completed',
  created_at      timestamptz default now()
);

alter table public.loyalty_redemptions enable row level security;

create index loyalty_redemptions_business_id_idx on public.loyalty_redemptions(business_id);
create index loyalty_redemptions_customer_id_idx on public.loyalty_redemptions(customer_id);

create policy "Users can view own business loyalty redemptions"
  on loyalty_redemptions for select to authenticated
  using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can insert own business loyalty redemptions"
  on loyalty_redemptions for insert to authenticated
  with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Users can update own business loyalty redemptions"
  on loyalty_redemptions for update to authenticated
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
