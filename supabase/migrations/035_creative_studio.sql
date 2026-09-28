-- ============================================================
-- 035_creative_studio.sql
-- BisnisSehat - Creative Studio & Creative Credits Full Production Migration
-- Conforms strictly to fixwa.md specifications
-- ============================================================

-- Enable uuid extension if not enabled
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. CAMPAIGNS
-- ============================================================
create table if not exists public.campaigns (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null default '',
  status        text not null default 'draft', -- draft | active | completed | archived
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.campaigns enable row level security;

do $$ begin
  drop policy if exists "Campañas owner all" on public.campaigns;
  create policy "Campaigns owner all" on public.campaigns
    for all using (
      exists (
        select 1 from public.businesses b
        where b.id = campaigns.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_campaigns_business_id on public.campaigns(business_id);

-- ============================================================
-- 2. CREATIVE BRIEFS
-- ============================================================
create table if not exists public.creative_briefs (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  brief_json      jsonb not null default '{}',
  reference_urls  text[] default '{}',
  created_at      timestamptz not null default now()
);

alter table public.creative_briefs enable row level security;

do $$ begin
  drop policy if exists "Creative briefs owner via campaign" on public.creative_briefs;
  create policy "Creative briefs owner via campaign" on public.creative_briefs
    for all using (
      exists (
        select 1 from public.campaigns c
        join public.businesses b on b.id = c.business_id
        where c.id = creative_briefs.campaign_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_creative_briefs_campaign_id on public.creative_briefs(campaign_id);

-- ============================================================
-- 3. CREATIVE PRDS
-- ============================================================
create table if not exists public.creative_prds (
  id            uuid primary key default uuid_generate_v4(),
  brief_id      uuid not null references public.creative_briefs(id) on delete cascade,
  prd_content   jsonb not null default '{}',
  version       integer not null default 1,
  status        text not null default 'draft', -- draft | approved | generating | ready
  created_at    timestamptz not null default now()
);

alter table public.creative_prds enable row level security;

do $$ begin
  drop policy if exists "Creative PRDs owner via brief" on public.creative_prds;
  create policy "Creative PRDs owner via brief" on public.creative_prds
    for all using (
      exists (
        select 1 from public.creative_briefs cb
        join public.campaigns c on c.id = cb.campaign_id
        join public.businesses b on b.id = c.business_id
        where cb.id = creative_prds.brief_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_creative_prds_brief_id on public.creative_prds(brief_id);

-- ============================================================
-- 4. CREATIVE ASSETS (FIXED RLS - NO business_id = auth.uid())
-- ============================================================
create table if not exists public.creative_assets (
  id            uuid primary key default uuid_generate_v4(),
  prd_id        uuid not null references public.creative_prds(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  asset_type    text not null, -- copy | image_standard | image_premium | video_fast | video_premium
  storage_path  text not null default '',
  metadata      jsonb not null default '{}',
  credit_cost   integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.creative_assets enable row level security;

do $$ begin
  drop policy if exists "Creative assets owner via business" on public.creative_assets;
  drop policy if exists "Creative assets owner via business_id" on public.creative_assets;
  create policy "Creative assets owner via business" on public.creative_assets
    for all using (
      exists (
        select 1 from public.businesses b
        where b.id = creative_assets.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_creative_assets_business_id on public.creative_assets(business_id);
create index if not exists idx_creative_assets_prd_id on public.creative_assets(prd_id);

-- ============================================================
-- 5. CREATIVE GENERATIONS (Generation Jobs & Audit)
-- ============================================================
create table if not exists public.creative_generations (
  id                uuid primary key default uuid_generate_v4(),
  asset_id          uuid not null references public.creative_assets(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  provider          text not null default 'gemini_flash',
  model             text not null default 'gemini-2.5-flash',
  prompt_hash       text not null default '',
  status            text not null default 'queued', -- queued | processing | completed | failed | refunded
  result_url        text default '',
  error_message     text default '',
  credits_charged   integer not null default 0,
  credits_refunded  integer default 0,
  provider_cost_usd numeric(12,6) default 0,
  idempotency_key   text unique not null,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

alter table public.creative_generations enable row level security;

do $$ begin
  drop policy if exists "Creative generations owner via business" on public.creative_generations;
  create policy "Creative generations owner via business" on public.creative_generations
    for all using (
      exists (
        select 1 from public.businesses b
        where b.id = creative_generations.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_creative_gen_business on public.creative_generations(business_id);

-- ============================================================
-- 6. CREATIVE CREDITS (PER BUSINESS)
-- ============================================================
create table if not exists public.creative_credits (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid unique not null references public.businesses(id) on delete cascade,
  available       integer not null default 0,
  reserved        integer not null default 0,
  consumed        integer not null default 0,
  total_earned    integer not null default 0,
  updated_at      timestamptz not null default now()
);

alter table public.creative_credits enable row level security;

do $$ begin
  drop policy if exists "Creative credits owner via business" on public.creative_credits;
  create policy "Creative credits owner via business" on public.creative_credits
    for select using (
      exists (
        select 1 from public.businesses b
        where b.id = creative_credits.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_creative_credits_business on public.creative_credits(business_id);

-- ============================================================
-- 7. 1X FREE USAGE TRACKING (LIFETIME PER BUSINESS)
-- ============================================================
create table if not exists public.creative_free_usage (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null unique references public.businesses(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  operation     text not null,
  request_id    text not null,
  consumed_at   timestamptz not null default now()
);

alter table public.creative_free_usage enable row level security;

do $$ begin
  create policy "Creative free usage read via business" on public.creative_free_usage
    for select using (
      exists (
        select 1 from public.businesses b
        where b.id = creative_free_usage.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_free_usage_business on public.creative_free_usage(business_id);

-- ============================================================
-- 8. CREDIT LEDGER (IMMUTABLE APPEND-ONLY AUDIT TRAIL)
-- ============================================================
create table if not exists public.credit_ledger (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  type            text not null, -- TOPUP | AI_USAGE | REFUND | FREE_USAGE | RESERVE | UNRESERVE
  credits         integer not null, -- positive = in, negative = out
  balance_after   integer not null,
  reference_type  text default '', -- generation | subscription | topup | refund
  reference_id    uuid,
  description     text default '',
  idempotency_key text unique not null,
  created_at      timestamptz not null default now()
);

alter table public.credit_ledger enable row level security;

do $$ begin
  drop policy if exists "Credit ledger read" on public.credit_ledger;
  drop policy if exists "Credit ledger insert" on public.credit_ledger;
  create policy "Credit ledger read" on public.credit_ledger
    for select using (
      exists (
        select 1 from public.businesses b
        where b.id = credit_ledger.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_credit_ledger_business on public.credit_ledger(business_id);
create index if not exists idx_credit_ledger_created on public.credit_ledger(created_at desc);

-- ============================================================
-- 9. AI USAGE LEDGER (ACTUAL TOKENS & PROVIDER COST)
-- ============================================================
create table if not exists public.ai_usage (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete set null,
  operation         text not null,
  model             text not null default 'gemini-2.5-flash',
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  total_tokens      integer not null default 0,
  credits_charged   integer not null default 0,
  provider_cost_usd numeric(12, 6) not null default 0,
  is_estimated      boolean not null default false,
  status            text not null default 'success',
  request_id        text unique not null,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

do $$ begin
  create policy "AI usage read via business" on public.ai_usage
    for select using (
      exists (
        select 1 from public.businesses b
        where b.id = ai_usage.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_ai_usage_business on public.ai_usage(business_id);
create index if not exists idx_ai_usage_request_id on public.ai_usage(request_id);

-- ============================================================
-- 10. CREDIT PURCHASES (MIDTRANS TOP UP TRANSACTIONS)
-- ============================================================
create table if not exists public.credit_purchases (
  id                      uuid primary key default uuid_generate_v4(),
  business_id             uuid not null references public.businesses(id) on delete cascade,
  profile_id              uuid not null references public.profiles(id) on delete cascade,
  order_id                text not null unique, -- Prefix: CREDIT-<uuid>
  package_key             text not null, -- starter | growth | pro | business
  amount_idr              numeric(15, 2) not null,
  credits                 integer not null,
  status                  text not null default 'pending', -- pending | paid | failed | expired
  snap_token              text default '',
  midtrans_transaction_id text default '',
  raw_response            jsonb default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.credit_purchases enable row level security;

do $$ begin
  create policy "Credit purchases read via business" on public.credit_purchases
    for select using (
      exists (
        select 1 from public.businesses b
        where b.id = credit_purchases.business_id
          and b.owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists idx_credit_purchases_business on public.credit_purchases(business_id);
create index if not exists idx_credit_purchases_order_id on public.credit_purchases(order_id);

-- ============================================================
-- 11. ATOMIC PL/PGSQL FUNCTIONS (ANTI-RACE CONDITION & IDEMPOTENCY)
-- ============================================================

-- Atomic Credit Debit
create or replace function public.deduct_creative_credits_atomic(
  p_business_id uuid,
  p_credits integer,
  p_operation text,
  p_request_id text,
  p_metadata jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_available integer;
  v_consumed integer;
  v_new_balance integer;
begin
  select available, consumed into v_available, v_consumed
  from public.creative_credits
  where business_id = p_business_id
  for update;

  if not found then
    insert into public.creative_credits (business_id, available, consumed, total_earned)
    values (p_business_id, 0, 0, 0)
    returning available, consumed into v_available, v_consumed;
  end if;

  if v_available < p_credits then
    return jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CREDITS',
      'available', v_available,
      'required', p_credits
    );
  end if;

  v_new_balance := v_available - p_credits;
  update public.creative_credits
  set available = v_new_balance,
      consumed = v_consumed + p_credits,
      updated_at = now()
  where business_id = p_business_id;

  insert into public.credit_ledger (
    business_id, type, credits, balance_after, idempotency_key, description
  ) values (
    p_business_id, 'AI_USAGE', -p_credits, v_new_balance, p_request_id, p_operation
  );

  return jsonb_build_object(
    'success', true,
    'balance_after', v_new_balance,
    'credits_deducted', p_credits
  );
end;
$$;

-- Atomic Credit Grant (Anti-duplicate webhook)
create or replace function public.grant_creative_credits_atomic(
  p_business_id uuid,
  p_credits integer,
  p_order_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_available integer;
  v_total_earned integer;
  v_new_balance integer;
begin
  select available, total_earned into v_available, v_total_earned
  from public.creative_credits
  where business_id = p_business_id
  for update;

  if not found then
    insert into public.creative_credits (business_id, available, consumed, total_earned)
    values (p_business_id, p_credits, 0, p_credits)
    returning available, total_earned into v_available, v_total_earned;
    v_new_balance := p_credits;
  else
    v_new_balance := v_available + p_credits;
    update public.creative_credits
    set available = v_new_balance,
        total_earned = v_total_earned + p_credits,
        updated_at = now()
    where business_id = p_business_id;
  end if;

  insert into public.credit_ledger (
    business_id, type, credits, balance_after, idempotency_key, description
  ) values (
    p_business_id, 'TOPUP', p_credits, v_new_balance, p_order_id || ':grant', 'Top up ' || p_credits || ' credits'
  );

  return jsonb_build_object('success', true, 'balance_after', v_new_balance);
end;
$$;

-- Reload PostgREST schema cache immediately
notify pgrst, 'reload schema';
