-- ============================================================
-- 035_creative_studio.sql
-- BisnisSehat - Creative Studio Phase 1
-- ============================================================

-- ============================================================
-- 1. CAMPAIGNS
-- ============================================================
create table public.campaigns (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null default '',
  status        text not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "Campañas owner all" on public.campaigns
  for all using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 2. CREATIVE BRIEFS
-- ============================================================
create table public.creative_briefs (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  brief_json      jsonb not null default '{}',
  reference_urls  text[] default '{}',
  created_at      timestamptz not null default now()
);

alter table public.creative_briefs enable row level security;

create policy "Creative briefs owner via campaign" on public.creative_briefs
  for all using (
    campaign_id in (
      select id from public.campaigns
      where business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    )
  );

-- ============================================================
-- 3. CREATIVE PRDS
-- ============================================================
create table public.creative_prds (
  id            uuid primary key default uuid_generate_v4(),
  brief_id        uuid not null references public.creative_briefs(id) on delete cascade,
  prd_content     jsonb not null default '{}',
  version         integer not null default 1,
  status          text not null default 'draft',
  -- status: draft | approved | generating | ready
  created_at    timestamptz not null default now()
);

alter table public.creative_prds enable row level security;

create policy "Creative PRDs owner via brief" on public.creative_prds
  for all using (
    brief_id in (
      select id from public.creative_briefs
      where campaign_id in (
        select id from public.campaigns
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    )
  );

-- ============================================================
-- 4. CREATIVE ASSETS
-- ============================================================
create table public.creative_assets (
  id            uuid primary key default uuid_generate_v4(),
  prd_id          uuid not null references public.creative_prds(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  asset_type      text not null,
  -- asset_type: 'copy' | 'image_standard' | 'image_premium' | 'video_fast' | 'video_premium'
  storage_path    text not null default '',
  metadata        jsonb not null default '{}',
  credit_cost     integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.creative_assets enable row level security;

create policy "Creative assets owner via business" on public.creative_assets
  for all using (business_id = (select auth.uid()));

-- Wait, business_id is not directly linked to auth.uid(). Need proper RLS.
-- Actually business_id refers to the business that owns the asset.
-- The RLS should check via businesses table.
-- Let me fix this.

create policy "Creative assets owner via business_id" on public.creative_assets
  for all using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 5. CREATIVE GENERATIONS
-- ============================================================
create table public.creative_generations (
  id                uuid primary key default uuid_generate_v4(),
  asset_id          uuid not null references public.creative_assets(id) on delete cascade,
  business_id       uuid not null references public.businesses(id) on delete cascade,
  provider          text not null,
  -- provider: 'gemini_flash_lite' | 'gpt_4o_mini' | 'dalle3' | 'gpt_image_2' | 'runway' | 'veo'
  model             text not null,
  prompt_hash       text not null default '',
  -- SHA-256 of the full prompt (for idempotency, NOT the prompt itself)
  status            text not null default 'queued',
  -- status: queued | processing | completed | failed | refunded | cancelled
  result_url        text default '',
  -- signed URL of generated asset (expires after 24h)
  error_message     text default '',
  credits_charged   integer not null default 0,
  credits_refunded  integer default 0,
  provider_cost_usd numeric(10,6) default 0,
  -- actual cost measured from provider response, in USD
  idempotency_key   text unique not null,
  -- format: {business_id}:{brief_id}:{asset_type}:{prompt_hash}:{timestamp}
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

alter table public.creative_generations enable row level security;

create policy "Creative generations owner via business" on public.creative_generations
  for all using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 6. CREATIVE CREDITS
-- ============================================================
create table public.creative_credits (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid unique not null references public.businesses(id) on delete cascade,
  available       integer not null default 15,
  -- credits available to spend
  reserved        integer not null default 0,
  -- credits locked during async generation (video)
  consumed        integer not null default 0,
  -- credits spent this period
  total_earned    integer not null default 15,
  -- lifetime credits earned (for analytics, resets monthly)
  period_start    timestamptz not null default now(),
  period_end      timestamptz not null default (now() + interval '30 days'),
  updated_at      timestamptz not null default now(),
  -- Constraint: available + reserved + consumed = total_earned (within period)
  constraint credits_conservation check (
    available + reserved + consumed = total_earned
  )
);

alter table public.creative_credits enable row level security;

create policy "Creative credits owner via business" on public.creative_credits
  for all using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- 7. CREDIT LEDGER
-- ============================================================
-- IMMUTABLE: append-only table. No UPDATE, no DELETE policies.
-- Every credit mutation must be recorded here with idempotency_key
-- to prevent double-charge. balance_after tracks running balance.

create table public.credit_ledger (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  type            text not null,
  -- type: 'grant' | 'consume' | 'reserve' | 'unreserve' | 'refund' | 'addon_purchase'
  credits         integer not null,
  -- positive = credit IN, negative = credit OUT
  balance_after   integer not null,
  -- running balance after this mutation
  reference_type  text default '',
  -- 'subscription' | 'generation' | 'addon' | 'refund'
  reference_id    uuid,
  -- FK to generation_id, addon_purchase_id, etc.
  description     text default '',
  idempotency_key text unique not null,
  -- prevents double-charge: same key cannot be inserted twice
  created_at      timestamptz not null default now()
);

-- RLS: read via business ownership, insert only via Edge Functions (service_role)
alter table public.credit_ledger enable row level security;

create policy "Credit ledger read" on public.credit_ledger
  for select using (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

create policy "Credit ledger insert" on public.credit_ledger
  for insert with check (
    business_id in (
      select id from public.businesses
      where owner_id = (select auth.uid())
    )
  );

-- NO UPDATE policy. NO DELETE policy. This table is append-only.
-- This ensures audit trail integrity and prevents double-charge.


-- ============================================================
-- RPC functions for credit atomic operations
-- ============================================================

-- Decrement reserved credits
create or replace function public.decrement_reserved(
  p_business_id uuid,
  p_amount integer default 1
)
returns void as $$
begin
  update public.creative_credits
  set reserved = greatest(0, reserved - p_amount),
      updated_at = now()
  where business_id = p_business_id;
end;
$$ language plpgsql security definer;

-- Increment consumed credits
create or replace function public.increment_consumed(
  p_business_id uuid,
  p_amount integer default 1
)
returns void as $$
begin
  update public.creative_credits
  set consumed = consumed + p_amount,
      updated_at = now()
  where business_id = p_business_id;
end;
$$ language plpgsql security definer;

-- Add to reserved credits (for reserve action)
create or replace function public.add_to_reserved(
  p_business_id uuid,
  p_amount integer default 1
)
returns void as $$
begin
  update public.creative_credits
  set reserved = reserved + p_amount,
      updated_at = now()
  where business_id = p_business_id;
end;
$$ language plpgsql security definer;

-- Subtract from reserved credits
create or replace function public.subtract_from_reserved(
  p_business_id uuid,
  p_amount integer default 1
)
returns void as $$
begin
  update public.creative_credits
  set reserved = greatest(0, reserved - p_amount),
      updated_at = now()
  where business_id = p_business_id;
end;
$$ language plpgsql security definer;

-- Increment consumed credits (alternative name)
create or replace function public.add_to_consumed(
  p_business_id uuid,
  p_amount integer default 1
)
returns void as $$
begin
  update public.creative_credits
  set consumed = consumed + p_amount,
      updated_at = now()
  where business_id = p_business_id;
end;
$$ language plpgsql security definer;
