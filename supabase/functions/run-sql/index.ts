// run-sql/index.ts
// Temporary migration helper — only runs hardcoded competitor-analysis migration
// NO persistent exec_sql function created — one-shot only
// Requires service-role key in Authorization header

import { corsResponse, jsonResponse, errorResponse } from "../_shared/response.ts";

const MIGRATION_SQL = `
-- 043_subscription_payments.sql
-- Subscription payment tracking for Midtrans integration

-- Add business_id to subscriptions for easier queries
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

-- Subscription payment records (separate from POS payments table)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  midtrans_order_id     text NOT NULL UNIQUE,
  gross_amount          numeric(15,2) NOT NULL DEFAULT 130000,
  payment_method        text DEFAULT '',
  transaction_status    text DEFAULT 'pending',
  payment_status        text NOT NULL DEFAULT 'pending',
  paid_at               timestamptz,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  raw_response          jsonb DEFAULT '{}',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_profile_id ON public.subscription_payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_midtrans_id ON public.subscription_payments(midtrans_order_id);

DO $$ BEGIN
  CREATE POLICY "Users can view own subscription payments"
    ON subscription_payments FOR SELECT TO authenticated
    USING ((select auth.uid()) = profile_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own subscription payments"
    ON subscription_payments FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = profile_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.competitor_analyses (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null default '',
  description text default '',
  status text not null default 'draft',
  input_data jsonb not null default '{}',
  research_data jsonb default '{}',
  analysis_data jsonb default '{}',
  sources jsonb default '{}',
  status_message text default '',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.competitor_analyses enable row level security;
create index if not exists competitor_analyses_business_id_idx on public.competitor_analyses(business_id);
create index if not exists competitor_analyses_status_idx on public.competitor_analyses(status);
create index if not exists competitor_analyses_created_at_idx on public.competitor_analyses(created_at);

do $$ begin
  create policy "Users can view own competitor analyses" on competitor_analyses for select to authenticated
    using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can insert own competitor analyses" on competitor_analyses for insert to authenticated
    with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can update own competitor analyses" on competitor_analyses for update to authenticated
    using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can delete own competitor analyses" on competitor_analyses for delete to authenticated
    using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;

create table if not exists public.competitor_research_cache (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  competitor_name text not null,
  website text,
  location text,
  industry text,
  research_data jsonb not null default '{}',
  sources jsonb default '{}',
  ttl_expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(business_id, competitor_name, coalesce(website, ''), coalesce(location, ''), coalesce(industry, ''))
);
alter table public.competitor_research_cache enable row level security;
create index if not exists competitor_cache_business_idx on public.competitor_research_cache(business_id);
create index if not exists competitor_cache_expires_idx on public.competitor_research_cache(ttl_expires_at);

do $$ begin
  create policy "Users can view own research cache" on competitor_research_cache for select to authenticated
    using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can insert/update own research cache" on competitor_research_cache for all to authenticated
    using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));
exception when duplicate_object then null; end $$;

create table if not exists public.competitor_analysis_history (
  id uuid primary key default uuid_generate_v4(),
  analysis_id uuid not null references public.competitor_analyses(id) on delete cascade,
  version integer not null default 1,
  analysis_data jsonb not null default '{}',
  notes text default '',
  created_at timestamptz default now()
);
alter table public.competitor_analysis_history enable row level security;
create index if not exists analysis_history_analysis_id_idx on public.competitor_analysis_history(analysis_id);

do $$ begin
  create policy "Users can view own analysis history" on competitor_analysis_history for select to authenticated
    using (analysis_id in (
      select id from public.competitor_analyses
      where business_id in (select id from public.businesses where owner_id = (select auth.uid()))
    ));
exception when duplicate_object then null; end $$;

create table if not exists public.competitor_research_tasks (
  id uuid primary key default uuid_generate_v4(),
  analysis_id uuid not null references public.competitor_analyses(id) on delete cascade,
  competitor_id uuid not null,
  competitor_name text not null,
  website text,
  status text not null default 'pending',
  error_message text default '',
  progress integer not null default 0,
  result_data jsonb default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.competitor_research_tasks enable row level security;
create index if not exists research_tasks_analysis_id_idx on public.competitor_research_tasks(analysis_id);
create index if not exists research_tasks_status_idx on public.competitor_research_tasks(status);

do $$ begin
  create policy "Users can view own research tasks" on competitor_research_tasks for select to authenticated
    using (analysis_id in (select id from public.competitor_analyses
      where business_id in (select id from public.businesses where owner_id = (select auth.uid()))));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can insert own research tasks" on competitor_research_tasks for insert to authenticated
    with check (analysis_id in (select id from public.competitor_analyses
      where business_id in (select id from public.businesses where owner_id = (select auth.uid()))));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can update own research tasks" on competitor_research_tasks for update to authenticated
    using (analysis_id in (select id from public.competitor_analyses
      where business_id in (select id from public.businesses where owner_id = (select auth.uid()))));
exception when duplicate_object then null; end $$;

create or replace function public.get_competitor_cache(
  p_business_id uuid, p_competitor_name text,
  p_website text default null, p_location text default null, p_industry text default null
) returns jsonb as $$
declare result jsonb;
begin
  select research_data into result from public.competitor_research_cache
  where business_id = p_business_id and competitor_name = p_competitor_name
    and (website is null or website = coalesce(p_website, ''))
    and (location is null or location = coalesce(p_location, ''))
    and (industry is null or industry = coalesce(p_industry, ''))
    and ttl_expires_at > now() limit 1;
  return coalesce(result, '{}');
end;
$$ language plpgsql security definer;

create or replace function public.competitor_cache_exists(
  p_business_id uuid, p_competitor_name text,
  p_website text default null, p_location text default null, p_industry text default null
) returns boolean as $$
declare c integer;
begin
  select count(*) into c from public.competitor_research_cache
  where business_id = p_business_id and competitor_name = p_competitor_name
    and (website is null or website = coalesce(p_website, ''))
    and (location is null or location = coalesce(p_location, ''))
    and (industry is null or industry = coalesce(p_industry, ''))
    and ttl_expires_at > now();
  return c > 0;
end;
$$ language plpgsql security definer;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);

    // Require service-role key
    const authHeader = req.headers.get("Authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      return errorResponse("Unauthorized", 401);
    }

    const { action } = await req.json();
    if (action !== "apply_migration") return errorResponse("Invalid action", 400);

    // Execute via Supabase SQL API
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const sqlResponse = await fetch(`${supabaseUrl}/pg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    const sqlText = await sqlResponse.text();
    if (!sqlResponse.ok) {
      return errorResponse(`SQL failed (${sqlResponse.status}): ${sqlText}`, 500);
    }

    return jsonResponse({ status: "ok", result: sqlText });
  } catch (error: any) {
    return errorResponse(error.message || "Internal server error", 500);
  }
});
