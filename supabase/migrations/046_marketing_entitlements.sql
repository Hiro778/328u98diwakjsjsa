-- ============================================================
-- 046_marketing_entitlements.sql
-- BisnisSehat - Feature Entitlement & Paywall System
-- Strictly conforms to lock.md specifications
-- Server-side enforcement for Marketing tools & 1x lifetime AI Studio free usage
-- ============================================================

-- 1. HELPER FUNCTION: Check if business has active Pro subscription
create or replace function public.is_business_pro_active(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.businesses b
    join public.subscriptions s on s.profile_id = b.owner_id
    where b.id = p_business_id
      and s.plan = 'pro'
      and s.status = 'active'
      and s.expires_at > now()
  );
$$;

-- 2. ATOMIC 1X LIFETIME FREE AI USAGE CLAIM (Anti-Race Condition)
create or replace function public.claim_creative_free_usage_atomic(
  p_business_id uuid,
  p_profile_id uuid,
  p_operation text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_already_consumed boolean;
begin
  -- Check if already used
  select exists (
    select 1 from public.creative_free_usage
    where business_id = p_business_id
  ) into v_already_consumed;

  if v_already_consumed then
    return jsonb_build_object(
      'success', false,
      'error', 'FREE_USAGE_ALREADY_CONSUMED'
    );
  end if;

  -- Atomic reservation via UNIQUE CONSTRAINT on business_id
  insert into public.creative_free_usage (
    business_id,
    profile_id,
    operation,
    request_id,
    consumed_at
  ) values (
    p_business_id,
    p_profile_id,
    p_operation,
    p_request_id,
    now()
  )
  on conflict (business_id) do nothing;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'CONCURRENT_CLAIM_PREVENTED'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'claimed', true
  );
end;
$$;

-- 3. ROLLBACK FREE USAGE (On AI generation or validation failure)
create or replace function public.rollback_creative_free_usage(
  p_business_id uuid,
  p_request_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.creative_free_usage
  where business_id = p_business_id and request_id = p_request_id;
$$;

-- 4. UPDATE RLS ON PRO-ONLY TABLES: A/B TESTING
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ab_experiments') then
    alter table public.ab_experiments enable row level security;
    drop policy if exists "ab_experiments_owner_select" on public.ab_experiments;
    drop policy if exists "ab_experiments_pro_select" on public.ab_experiments;
    execute $p$
      create policy "ab_experiments_pro_select"
        on public.ab_experiments for select to authenticated
        using (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;

    drop policy if exists "ab_experiments_owner_insert" on public.ab_experiments;
    drop policy if exists "ab_experiments_pro_insert" on public.ab_experiments;
    execute $p$
      create policy "ab_experiments_pro_insert"
        on public.ab_experiments for insert to authenticated
        with check (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;

    drop policy if exists "ab_experiments_owner_update" on public.ab_experiments;
    drop policy if exists "ab_experiments_pro_update" on public.ab_experiments;
    execute $p$
      create policy "ab_experiments_pro_update"
        on public.ab_experiments for update to authenticated
        using (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        )
        with check (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;

    drop policy if exists "ab_experiments_owner_delete" on public.ab_experiments;
    drop policy if exists "ab_experiments_pro_delete" on public.ab_experiments;
    execute $p$
      create policy "ab_experiments_pro_delete"
        on public.ab_experiments for delete to authenticated
        using (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ab_variants') then
    alter table public.ab_variants enable row level security;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ab_results') then
    alter table public.ab_results enable row level security;
  end if;
end $$;

-- 5. UPDATE RLS ON PRO-ONLY TABLES: COMPETITOR ANALYSIS
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'competitor_analyses') then
    alter table public.competitor_analyses enable row level security;
    drop policy if exists "ca_select" on public.competitor_analyses;
    drop policy if exists "ca_pro_select" on public.competitor_analyses;
    execute $p$
      create policy "ca_pro_select"
        on public.competitor_analyses for select to authenticated
        using (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;

    drop policy if exists "ca_insert" on public.competitor_analyses;
    drop policy if exists "ca_pro_insert" on public.competitor_analyses;
    execute $p$
      create policy "ca_pro_insert"
        on public.competitor_analyses for insert to authenticated
        with check (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'competitor_research_tasks') then
    alter table public.competitor_research_tasks enable row level security;
  end if;
end $$;

-- 6. UPDATE RLS ON PRO-ONLY TABLES: GOOGLE BUSINESS PROFILE
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'google_business_connections') then
    alter table public.google_business_connections enable row level security;
    drop policy if exists "gbc_owner_select" on public.google_business_connections;
    drop policy if exists "gbc_pro_select" on public.google_business_connections;
    execute $p$
      create policy "gbc_pro_select"
        on public.google_business_connections for select to authenticated
        using (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;

    drop policy if exists "gbc_owner_insert" on public.google_business_connections;
    drop policy if exists "gbc_pro_insert" on public.google_business_connections;
    execute $p$
      create policy "gbc_pro_insert"
        on public.google_business_connections for insert to authenticated
        with check (
          business_id in (
            select id from public.businesses where owner_id = (select auth.uid())
          ) and public.is_business_pro_active(business_id)
        );
    $p$;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'google_business_locations') then
    alter table public.google_business_locations enable row level security;
  end if;
end $$;

-- 7. REVOKE PRIVILEGES ON ENTITLEMENT TABLES TO PREVENT CLIENT-SIDE TAMPERING
revoke insert, update, delete on public.creative_free_usage from anon, authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke insert, update, delete on public.subscription_payments from anon, authenticated;

-- Reload schema cache
notify pgrst, 'reload schema';
