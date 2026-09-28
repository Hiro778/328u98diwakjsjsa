-- ============================================================
-- 068_account_access_enforcement.sql
-- BisnisSehat: Authoritative Server-Side Account Access Enforcement
-- 
-- Rules:
-- 1. profiles.status = 'active' → allowed
-- 2. profiles.status = 'suspended' → denied
-- 3. profiles.status = 'banned' → denied
-- 4. profiles.status = 'deleted' → denied
-- 5. User not found / unauthenticated → denied
-- 6. ADMIN/SUPER_ADMIN access to Admin Control Center is preserved.
-- ============================================================

-- 1. Authoritative Helper: public.is_account_access_allowed()
create or replace function public.is_account_access_allowed(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.status = 'active'
      from public.profiles p
      where p.id = coalesce(p_user_id, auth.uid())
    ),
    false
  );
$$;

-- Grant execution to authenticated & service_role
grant execute on function public.is_account_access_allowed(uuid) to authenticated, service_role, anon;

-- 2. Add public.profiles to supabase_realtime publication for instant broadcast of status changes
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception
  when others then null;
end $$;

-- 3. RLS Hardening: public.businesses
drop policy if exists "Users can view own businesses" on public.businesses;
drop policy if exists "Users can insert own businesses" on public.businesses;
drop policy if exists "Users can update own businesses" on public.businesses;
drop policy if exists "Users can delete own businesses" on public.businesses;

create policy "Users can view own businesses"
  on public.businesses
  for select
  to authenticated
  using (
    (auth.uid() = owner_id)
    and public.is_account_access_allowed(auth.uid())
  );

create policy "Users can insert own businesses"
  on public.businesses
  for insert
  to authenticated
  with check (
    (auth.uid() = owner_id)
    and public.is_account_access_allowed(auth.uid())
  );

create policy "Users can update own businesses"
  on public.businesses
  for update
  to authenticated
  using (
    (auth.uid() = owner_id)
    and public.is_account_access_allowed(auth.uid())
  )
  with check (
    (auth.uid() = owner_id)
    and public.is_account_access_allowed(auth.uid())
  );

create policy "Users can delete own businesses"
  on public.businesses
  for delete
  to authenticated
  using (
    (auth.uid() = owner_id)
    and public.is_account_access_allowed(auth.uid())
  );

-- 4. RLS Hardening: public.profiles update
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (
    (auth.uid() = id)
    and public.is_account_access_allowed(auth.uid())
  )
  with check (
    (auth.uid() = id)
    and public.is_account_access_allowed(auth.uid())
  );

-- 5. Harden user-facing RPC: cancel_subscription_atomic
create or replace function public.cancel_subscription_atomic(
  p_business_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_sub_id uuid;
  v_plan text;
  v_status text;
  v_expires_at timestamptz;
begin
  -- 1. Strictly verify account access
  if not public.is_account_access_allowed(v_caller_id) then
    raise exception 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir' using errcode = '42501';
  end if;

  -- 2. Verify business ownership
  if not exists (
    select 1 from public.businesses
    where id = p_business_id and owner_id = v_caller_id
  ) then
    raise exception 'Unauthorized business access' using errcode = '42501';
  end if;

  -- 3. Query active subscription
  select id, plan, status, expires_at
  into v_sub_id, v_plan, v_status, v_expires_at
  from public.subscriptions
  where profile_id = v_caller_id and plan = 'pro' and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if v_sub_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_PRO_SUBSCRIPTION'
    );
  end if;

  -- 4. Set cancel flag
  update public.subscriptions
  set
    is_cancelled = true,
    cancelled_at = now(),
    cancellation_reason = coalesce(p_reason, ''),
    updated_at = now()
  where id = v_sub_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at,
    'is_cancelled', true
  );
end;
$$;

-- 6. Harden user-facing RPC: delete_completed_order
create or replace function public.delete_completed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order_status text;
  v_biz_id uuid;
begin
  -- 1. Strictly verify account access
  if not public.is_account_access_allowed(v_caller_id) then
    raise exception 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir' using errcode = '42501';
  end if;

  -- 2. Find order and verify ownership
  select o.status, o.business_id
  into v_order_status, v_biz_id
  from public.orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id and b.owner_id = v_caller_id;

  if v_order_status is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if v_order_status not in ('completed', 'cancelled') then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_COMPLETED');
  end if;

  delete from public.orders where id = p_order_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Reload schema
notify pgrst, 'reload schema';
