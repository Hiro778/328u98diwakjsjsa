-- ============================================================
-- 045_ab_testing.sql
-- BisnisSehat - A/B Testing Feature
-- Tables: ab_experiments, ab_variants, ab_results
-- ============================================================

-- ══════════════════════════════════════════════════════════
-- 1. AB_EXPERIMENTS TABLE
-- ══════════════════════════════════════════════════════════

create table if not exists public.ab_experiments (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  name            text not null,
  objective       text not null,
  channel         text not null,
  primary_metric  text not null,
  custom_metric   text default null,
  start_at        timestamptz default null,
  end_at          timestamptz default null,
  status          text not null default 'draft' check (status in ('draft', 'running', 'completed', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ab_experiments_business_id
  on public.ab_experiments(business_id, created_at desc);

create index if not exists idx_ab_experiments_status
  on public.ab_experiments(business_id, status);

-- ══════════════════════════════════════════════════════════
-- 2. AB_VARIANTS TABLE
-- ══════════════════════════════════════════════════════════

create table if not exists public.ab_variants (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid not null references public.ab_experiments(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  variant_key     text not null check (variant_key in ('A', 'B')),
  name            text not null,
  content         text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (experiment_id, variant_key)
);

create index if not exists idx_ab_variants_experiment_id
  on public.ab_variants(experiment_id);

create index if not exists idx_ab_variants_business_id
  on public.ab_variants(business_id);

-- ══════════════════════════════════════════════════════════
-- 3. AB_RESULTS TABLE
-- ══════════════════════════════════════════════════════════

create table if not exists public.ab_results (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid not null references public.ab_experiments(id) on delete cascade,
  variant_id      uuid not null references public.ab_variants(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  impressions     numeric not null default 0,
  clicks          numeric not null default 0,
  conversions     numeric not null default 0,
  engagement      numeric not null default 0,
  leads           numeric not null default 0,
  revenue         numeric not null default 0,
  purchases       numeric not null default 0,
  recorded_at     timestamptz not null default now(),
  unique (experiment_id, variant_id)
);

create index if not exists idx_ab_results_experiment_id
  on public.ab_results(experiment_id);

create index if not exists idx_ab_results_variant_id
  on public.ab_results(variant_id);

create index if not exists idx_ab_results_business_id
  on public.ab_results(business_id);

-- ══════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════

alter table public.ab_experiments enable row level security;
alter table public.ab_variants enable row level security;
alter table public.ab_results enable row level security;

-- ──────────────────────────────────────────────────────────
-- Policies for ab_experiments
-- ──────────────────────────────────────────────────────────

do $$ begin
  drop policy if exists "ab_experiments_owner_select" on public.ab_experiments;
  create policy "ab_experiments_owner_select"
    on public.ab_experiments for select to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_experiments_owner_insert" on public.ab_experiments;
  create policy "ab_experiments_owner_insert"
    on public.ab_experiments for insert to authenticated
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_experiments_owner_update" on public.ab_experiments;
  create policy "ab_experiments_owner_update"
    on public.ab_experiments for update to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    )
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_experiments_owner_delete" on public.ab_experiments;
  create policy "ab_experiments_owner_delete"
    on public.ab_experiments for delete to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────
-- Policies for ab_variants
-- ──────────────────────────────────────────────────────────

do $$ begin
  drop policy if exists "ab_variants_owner_select" on public.ab_variants;
  create policy "ab_variants_owner_select"
    on public.ab_variants for select to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_variants_owner_insert" on public.ab_variants;
  create policy "ab_variants_owner_insert"
    on public.ab_variants for insert to authenticated
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_variants_owner_update" on public.ab_variants;
  create policy "ab_variants_owner_update"
    on public.ab_variants for update to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    )
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_variants_owner_delete" on public.ab_variants;
  create policy "ab_variants_owner_delete"
    on public.ab_variants for delete to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────
-- Policies for ab_results
-- ──────────────────────────────────────────────────────────

do $$ begin
  drop policy if exists "ab_results_owner_select" on public.ab_results;
  create policy "ab_results_owner_select"
    on public.ab_results for select to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_results_owner_insert" on public.ab_results;
  create policy "ab_results_owner_insert"
    on public.ab_results for insert to authenticated
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_results_owner_update" on public.ab_results;
  create policy "ab_results_owner_update"
    on public.ab_results for update to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    )
    with check (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  drop policy if exists "ab_results_owner_delete" on public.ab_results;
  create policy "ab_results_owner_delete"
    on public.ab_results for delete to authenticated
    using (
      business_id in (
        select id from public.businesses where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;
