-- ============================================================
-- 040_competitor_analysis.sql
-- BisnisSehat - Competitor Analysis Tool
-- Idempotent: safe to run multiple times
-- ============================================================

-- ============================================================
-- 1. COMPETITOR ANALYSES
-- ============================================================
create table if not exists public.competitor_analyses (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  title           text not null default '',
  description     text default '',
  status          text not null default 'draft',
  input_data      jsonb not null default '{}',
  research_data   jsonb default '{}',
  analysis_data   jsonb default '{}',
  sources         jsonb default '{}',
  status_message  text default '',
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.competitor_analyses enable row level security;

create index if not exists competitor_analyses_business_id_idx
  on public.competitor_analyses(business_id);
create index if not exists competitor_analyses_status_idx
  on public.competitor_analyses(status);
create index if not exists competitor_analyses_created_at_idx
  on public.competitor_analyses(created_at);

do $$ begin
  create policy "ca_select" on public.competitor_analyses
    for select to authenticated
    using (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "ca_insert" on public.competitor_analyses
    for insert to authenticated
    with check (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "ca_update" on public.competitor_analyses
    for update to authenticated
    using (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "ca_delete" on public.competitor_analyses
    for delete to authenticated
    using (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 2. RESEARCH CACHE
-- ============================================================
create table if not exists public.competitor_research_cache (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  competitor_name text not null,
  website         text,
  location        text,
  industry        text,
  research_data   jsonb not null default '{}',
  sources         jsonb default '{}',
  ttl_expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.competitor_research_cache enable row level security;

create unique index if not exists competitor_cache_unique_idx
  on public.competitor_research_cache(
    business_id,
    competitor_name,
    coalesce(website, ''),
    coalesce(location, ''),
    coalesce(industry, '')
  );

create index if not exists competitor_cache_business_idx
  on public.competitor_research_cache(business_id);
create index if not exists competitor_cache_expires_idx
  on public.competitor_research_cache(ttl_expires_at);

do $$ begin
  create policy "crc_select" on public.competitor_research_cache
    for select to authenticated
    using (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "crc_all" on public.competitor_research_cache
    for all to authenticated
    using (
      business_id in (
        select id from public.businesses
        where owner_id = (select auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 3. ANALYSIS HISTORY
-- ============================================================
create table if not exists public.competitor_analysis_history (
  id              uuid primary key default uuid_generate_v4(),
  analysis_id     uuid not null references public.competitor_analyses(id) on delete cascade,
  version         integer not null default 1,
  analysis_data   jsonb not null default '{}',
  notes           text default '',
  created_at      timestamptz default now()
);

alter table public.competitor_analysis_history enable row level security;

create index if not exists analysis_history_analysis_id_idx
  on public.competitor_analysis_history(analysis_id);

do $$ begin
  create policy "cah_select" on public.competitor_analysis_history
    for select to authenticated
    using (
      analysis_id in (
        select id from public.competitor_analyses
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "cah_insert" on public.competitor_analysis_history
    for insert to authenticated
    with check (
      analysis_id in (
        select id from public.competitor_analyses
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    );
exception when duplicate_object then null;
end $$;


-- ============================================================
-- 4. RESEARCH TASKS
-- ============================================================
create table if not exists public.competitor_research_tasks (
  id              uuid primary key default uuid_generate_v4(),
  analysis_id     uuid not null references public.competitor_analyses(id) on delete cascade,
  competitor_id   uuid not null,
  competitor_name text not null,
  website         text,
  status          text not null default 'pending',
  error_message   text default '',
  progress        integer not null default 0,
  result_data     jsonb default '{}',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.competitor_research_tasks enable row level security;

create index if not exists research_tasks_analysis_id_idx
  on public.competitor_research_tasks(analysis_id);
create index if not exists research_tasks_status_idx
  on public.competitor_research_tasks(status);

do $$ begin
  create policy "crt_select" on public.competitor_research_tasks
    for select to authenticated
    using (
      analysis_id in (
        select id from public.competitor_analyses
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "crt_insert" on public.competitor_research_tasks
    for insert to authenticated
    with check (
      analysis_id in (
        select id from public.competitor_analyses
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "crt_update" on public.competitor_research_tasks
    for update to authenticated
    using (
      analysis_id in (
        select id from public.competitor_analyses
        where business_id in (
          select id from public.businesses
          where owner_id = (select auth.uid())
        )
      )
    );
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 5. CLEANUP FUNCTION
-- ============================================================
create or replace function public.cleanup_old_competitor_analyses()
returns void as $$
begin
  delete from public.competitor_analyses
  where created_at < now() - interval '90 days';
  delete from public.competitor_research_cache
  where ttl_expires_at < now();
end;
$$ language plpgsql security definer;

-- ============================================================
-- 6. RPC FUNCTIONS
-- ============================================================
create or replace function public.get_competitor_cache(
  p_business_id uuid,
  p_competitor_name text,
  p_website text default null,
  p_location text default null,
  p_industry text default null
)
returns jsonb as $$
declare
  result jsonb;
begin
  select research_data into result
  from public.competitor_research_cache
  where business_id = p_business_id
    and competitor_name = p_competitor_name
    and (website is null or website = coalesce(p_website, ''))
    and (location is null or location = coalesce(p_location, ''))
    and (industry is null or industry = coalesce(p_industry, ''))
    and ttl_expires_at > now()
  limit 1;
  return coalesce(result, '{}');
end;
$$ language plpgsql security definer;

create or replace function public.competitor_cache_exists(
  p_business_id uuid,
  p_competitor_name text,
  p_website text default null,
  p_location text default null,
  p_industry text default null
)
returns boolean as $$
declare
  cnt integer;
begin
  select count(*) into cnt
  from public.competitor_research_cache
  where business_id = p_business_id
    and competitor_name = p_competitor_name
    and (website is null or website = coalesce(p_website, ''))
    and (location is null or location = coalesce(p_location, ''))
    and (industry is null or industry = coalesce(p_industry, ''))
    and ttl_expires_at > now();
  return cnt > 0;
end;
$$ language plpgsql security definer;

-- ============================================================
-- END OF MIGRATION 040
-- ============================================================
