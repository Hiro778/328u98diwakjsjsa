-- ============================================================
-- 064_admin_user_management.sql
-- BisnisSehat - Tahap 3: User Management & Account Status Control
-- Conforms strictly to @admin.md Section 4, 5, 6, 7, 8, 9, 27, 43
-- ============================================================

-- 1. Create admin_audit_logs table per @admin.md Section 27
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text not null default 'user',
  target_id text not null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for audit logs
create index if not exists idx_admin_audit_logs_target on public.admin_audit_logs(target_type, target_id);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);

-- RLS for admin_audit_logs (Immutable audit trail: SELECT and INSERT only)
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins can view audit logs" on public.admin_audit_logs;
drop policy if exists "Admins can insert audit logs" on public.admin_audit_logs;

create policy "Admins can view audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert audit logs"
  on public.admin_audit_logs
  for insert
  to authenticated
  with check (public.is_admin());

-- 2. Add status columns to public.profiles safely without breaking existing rows
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'
  ) then
    alter table public.profiles
      add column status text not null default 'active'
      check (status in ('active', 'suspended', 'banned', 'deleted'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status_reason'
  ) then
    alter table public.profiles
      add column status_reason text default '';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status_updated_at'
  ) then
    alter table public.profiles
      add column status_updated_at timestamptz default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at'
  ) then
    alter table public.profiles
      add column deleted_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_active_at'
  ) then
    alter table public.profiles
      add column last_active_at timestamptz default now();
  end if;
end $$;

-- Index on profiles status
create index if not exists idx_profiles_status on public.profiles(status);

-- 3. Server-side RPC: get_admin_users (Search, Filter, Sort, Paginate)
create or replace function public.get_admin_users(
  p_search text default null,
  p_plan_filter text default 'all',
  p_status_filter text default 'all',
  p_sort_by text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_users jsonb;
  v_total_count bigint;
begin
  -- Enforce server authorization
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can query user management' using errcode = '42501';
  end if;

  -- Filter & Query CTE
  with user_data as (
    select
      p.id,
      p.email,
      coalesce(nullif(p.full_name, ''), p.email) as name,
      p.avatar_url,
      p.status,
      p.status_reason,
      p.created_at,
      coalesce(p.last_active_at, p.updated_at, p.created_at) as last_active,
      -- Business info
      b.id as business_id,
      b.name as business_name,
      coalesce((select count(*) from public.businesses where owner_id = p.id), 0) as business_count,
      -- Subscription Plan
      case
        when s.plan = 'pro' and s.status = 'active' and s.expires_at > now() then 'Pro'
        else 'Free'
      end as plan,
      s.status as subscription_status,
      s.expires_at as subscription_expires_at,
      -- AI usage
      coalesce(cc.consumed, 0) as ai_credits_used,
      coalesce(cc.available, 0) as ai_credits_remaining
    from public.profiles p
    left join lateral (
      select id, name from public.businesses
      where owner_id = p.id
      order by created_at desc
      limit 1
    ) b on true
    left join lateral (
      select plan, status, expires_at from public.subscriptions
      where profile_id = p.id
      order by created_at desc
      limit 1
    ) s on true
    left join lateral (
      select consumed, available from public.creative_credits
      where business_id = b.id
      limit 1
    ) cc on true
    where
      -- Search
      (
        p_search is null
        or trim(p_search) = ''
        or p.full_name ilike '%' || trim(p_search) || '%'
        or p.email ilike '%' || trim(p_search) || '%'
        or p.id::text ilike '%' || trim(p_search) || '%'
        or b.name ilike '%' || trim(p_search) || '%'
      )
      -- Plan Filter
      and (
        p_plan_filter = 'all'
        or (p_plan_filter = 'pro' and s.plan = 'pro' and s.status = 'active' and s.expires_at > now())
        or (p_plan_filter = 'free' and not (s.plan = 'pro' and s.status = 'active' and s.expires_at > now()))
      )
      -- Status Filter
      and (
        p_status_filter = 'all'
        or p.status = p_status_filter
      )
  )
  select
    coalesce(jsonb_agg(u), '[]'::jsonb),
    count(*)
  into v_users, v_total_count
  from (
    select * from user_data
    order by
      case when p_sort_by = 'newest' then created_at end desc,
      case when p_sort_by = 'oldest' then created_at end asc,
      case when p_sort_by = 'highest_ai' then ai_credits_used end desc,
      case when p_sort_by = 'latest_activity' then last_active end desc,
      created_at desc
    limit p_limit
    offset p_offset
  ) u;

  return jsonb_build_object(
    'users', v_users,
    'total_count', v_total_count
  );
end;
$$;

-- 4. Server-side RPC: get_admin_user_detail (Section 5 User Detail)
create or replace function public.get_admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_profile jsonb;
  v_business jsonb;
  v_subscription jsonb;
  v_ai_usage jsonb;
  v_support jsonb;
  v_security jsonb;
  v_audit_logs jsonb;
  v_biz_id uuid;
  v_businesses jsonb;
  v_business_count bigint;
begin
  -- 1. Authorization Check
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can view user details' using errcode = '42501';
  end if;

  -- 2. Profile
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', coalesce(nullif(p.full_name, ''), p.email),
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'status', p.status,
    'status_reason', p.status_reason,
    'created_at', p.created_at,
    'last_active', coalesce(p.last_active_at, p.updated_at, p.created_at)
  ) into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if v_profile is null then
    return jsonb_build_object('error', 'USER_NOT_FOUND');
  end if;

  -- 3. Business & Businesses List
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'type', coalesce(nullif(b.business_type, ''), 'UMKM'),
      'category', coalesce(nullif(b.business_category, ''), 'Umum'),
      'location', coalesce(b.location, ''),
      'status', case when b.is_active then 'active' else 'inactive' end,
      'created_at', b.created_at
    ) order by b.created_at desc), '[]'::jsonb),
    count(*)
  into v_businesses, v_business_count
  from public.businesses b
  where b.owner_id = p_user_id;

  if v_business_count > 0 then
    v_business := v_businesses->0;
    v_biz_id := (v_business->>'id')::uuid;
  else
    v_business := null;
    v_biz_id := null;
  end if;

  -- 4. Subscription
  select jsonb_build_object(
    'id', s.id,
    'plan', s.plan,
    'status', s.status,
    'start_date', s.created_at,
    'expiry_date', s.expires_at,
    'payment_status', coalesce(
      (select payment_status from public.subscription_payments where profile_id = p_user_id order by created_at desc limit 1),
      'none'
    )
  ) into v_subscription
  from public.subscriptions s
  where s.profile_id = p_user_id
  order by s.created_at desc
  limit 1;

  -- 5. AI Usage
  select jsonb_build_object(
    'total_credits', coalesce(cc.total_earned, 0),
    'used_credits', coalesce(cc.consumed, 0),
    'remaining_credits', coalesce(cc.available, 0),
    'requests_total', coalesce(gen.total_req, 0),
    'requests_success', coalesce(gen.success_req, 0),
    'requests_failed', coalesce(gen.failed_req, 0),
    'total_tokens', 0,
    'input_tokens', 0,
    'output_tokens', 0
  ) into v_ai_usage
  from (select 1) dummy
  left join public.creative_credits cc on cc.business_id = v_biz_id
  left join lateral (
    select
      count(*) as total_req,
      count(*) filter (where status = 'completed') as success_req,
      count(*) filter (where status = 'failed') as failed_req
    from public.creative_generations
    where business_id = v_biz_id
  ) gen on true;

  -- 6. Support
  select jsonb_build_object(
    'total_tickets', count(*),
    'open_tickets', count(*) filter (where status in ('new', 'in_progress', 'waiting_user')),
    'resolved_tickets', count(*) filter (where status in ('resolved', 'closed'))
  ) into v_support
  from public.support_tickets
  where user_id = p_user_id;

  -- 7. Security & Audit Trail
  select jsonb_build_object(
    'account_status', (v_profile->>'status'),
    'status_reason', (v_profile->>'status_reason'),
    'last_login', (v_profile->>'last_active')
  ) into v_security;

  select coalesce(jsonb_agg(al), '[]'::jsonb) into v_audit_logs
  from (
    select
      id,
      admin_id,
      action,
      reason,
      metadata,
      created_at
    from public.admin_audit_logs
    where target_type = 'user' and target_id = p_user_id::text
    order by created_at desc
    limit 10
  ) al;

  return jsonb_build_object(
    'profile', v_profile,
    'business', v_business,
    'businesses', v_businesses,
    'business_count', v_business_count,
    'subscription', v_subscription,
    'ai_usage', v_ai_usage,
    'support', v_support,
    'security', v_security,
    'audit_logs', v_audit_logs
  );
end;
$$;

-- 5. Server-side Action RPC: admin_update_user_status (Suspend, Unsuspend, Ban, Unban, Soft Delete)
create or replace function public.admin_update_user_status(
  p_target_user_id uuid,
  p_new_status text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_is_adm boolean;
  v_is_super boolean;
  v_current_status text;
  v_action text;
begin
  -- 1. Authorization Check
  v_is_adm := public.is_admin();
  v_is_super := public.is_super_admin();

  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can modify user status' using errcode = '42501';
  end if;

  -- Self-protection invariant: Admin cannot ban/suspend/delete their own account
  if p_target_user_id = v_admin_id then
    raise exception 'Forbidden: Admin tidak boleh mengubah status akun miliknya sendiri' using errcode = '42501';
  end if;

  -- Validate target user exists
  select status into v_current_status
  from public.profiles
  where id = p_target_user_id;

  if not found then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;

  -- 2. Permission check per action type
  if p_new_status = 'deleted' then
    -- DELETION is reserved exclusively for SUPER_ADMIN
    if not v_is_super then
      raise exception 'Forbidden: Hanya SUPER_ADMIN yang memiliki izin untuk menghapus user' using errcode = '42501';
    end if;
    v_action := 'USER_DELETED';
  elsif p_new_status = 'banned' then
    v_action := 'USER_BANNED';
  elsif p_new_status = 'suspended' then
    v_action := 'USER_SUSPENDED';
  elsif p_new_status = 'active' then
    if v_current_status = 'banned' then
      v_action := 'USER_UNBANNED';
    elsif v_current_status = 'suspended' then
      v_action := 'USER_UNSUSPENDED';
    else
      v_action := 'USER_ACTIVATED';
    end if;
  else
    raise exception 'Invalid status value: %', p_new_status;
  end if;

  -- Mandatory reason for destructive/restrictive actions
  if p_new_status in ('suspended', 'banned', 'deleted') and (p_reason is null or trim(p_reason) = '') then
    raise exception 'Alasan (reason) wajib diisi untuk tindakan %', v_action using errcode = '22023';
  end if;

  -- 3. Atomic Database Update (Soft-delete preserves all FKs and transaction histories)
  update public.profiles
  set
    status = p_new_status,
    status_reason = coalesce(p_reason, ''),
    status_updated_at = now(),
    deleted_at = case when p_new_status = 'deleted' then now() else deleted_at end,
    updated_at = now()
  where id = p_target_user_id;

  -- 4. Mandatory Audit Log Entry
  insert into public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) values (
    v_admin_id,
    v_action,
    'user',
    p_target_user_id::text,
    coalesce(p_reason, ''),
    jsonb_build_object(
      'previous_status', v_current_status,
      'new_status', p_new_status
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'target_user_id', p_target_user_id,
    'new_status', p_new_status
  );
end;
$$;

-- 6. Update get_admin_dashboard_overview to return actual suspended & banned counts
create or replace function public.get_admin_dashboard_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_total_users bigint;
  v_active_users bigint;
  v_suspended_users bigint;
  v_banned_users bigint;
  v_free_users bigint;
  v_pro_users bigint;
  v_active_businesses bigint;
  v_ai_credits_used numeric;
  v_ai_credits_remaining numeric;
  v_ai_requests_today bigint;
  v_tickets_new bigint;
  v_tickets_in_progress bigint;
  v_tickets_waiting_user bigint;
  v_tickets_resolved bigint;
  v_payments_today numeric;
  v_payments_month numeric;
  v_sub_revenue numeric;
  v_recent_activities jsonb;
begin
  -- 1. Enforce strict server-side authorization
  v_is_adm := public.is_admin();
  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can access dashboard overview' using errcode = '42501';
  end if;

  -- 2. User Stats with real database status
  select count(*) into v_total_users from public.profiles;
  select count(*) into v_active_users from public.profiles where status = 'active';
  select count(*) into v_suspended_users from public.profiles where status = 'suspended';
  select count(*) into v_banned_users from public.profiles where status = 'banned';

  -- Active Pro vs Free Users
  select count(distinct profile_id) into v_pro_users
  from public.subscriptions
  where plan = 'pro'
    and status = 'active'
    and expires_at > now();

  v_free_users := greatest(v_total_users - v_pro_users, 0);

  -- 3. Business Stats
  select count(*) into v_active_businesses from public.businesses;

  -- 4. AI Credits & Usage
  select
    coalesce(sum(consumed), 0),
    coalesce(sum(available), 0)
  into v_ai_credits_used, v_ai_credits_remaining
  from public.creative_credits;

  select count(*) into v_ai_requests_today
  from public.creative_generations
  where created_at >= date_trunc('day', now());

  -- 5. Support Tickets
  select count(*) into v_tickets_new
  from public.support_tickets where status = 'new';

  select count(*) into v_tickets_in_progress
  from public.support_tickets where status = 'in_progress';

  select count(*) into v_tickets_waiting_user
  from public.support_tickets where status = 'waiting_user';

  select count(*) into v_tickets_resolved
  from public.support_tickets where status in ('resolved', 'closed');

  -- 6. Payments & Revenue
  select coalesce(sum(gross_amount), 0) into v_payments_today
  from (
    select gross_amount from public.subscription_payments
    where payment_status in ('paid', 'settlement')
      and created_at >= date_trunc('day', now())
    union all
    select gross_amount from public.payments
    where payment_status in ('paid', 'settlement')
      and created_at >= date_trunc('day', now())
  ) t_today;

  select coalesce(sum(gross_amount), 0) into v_payments_month
  from (
    select gross_amount from public.subscription_payments
    where payment_status in ('paid', 'settlement')
      and created_at >= date_trunc('month', now())
    union all
    select gross_amount from public.payments
    where payment_status in ('paid', 'settlement')
      and created_at >= date_trunc('month', now())
  ) t_month;

  select coalesce(sum(gross_amount), 0) into v_sub_revenue
  from public.subscription_payments
  where payment_status in ('paid', 'settlement');

  -- 7. Real Database Recent Activity
  select coalesce(jsonb_agg(act), '[]'::jsonb) into v_recent_activities
  from (
    select
      'USER_SIGNUP' as type,
      coalesce(nullif(full_name, ''), email) as title,
      'Pengguna baru mendaftar di BisnisSehat' as description,
      created_at
    from public.profiles
    order by created_at desc
    limit 5
  ) act;

  return jsonb_build_object(
    'users', jsonb_build_object(
      'total', v_total_users,
      'active', v_active_users,
      'suspended', v_suspended_users,
      'banned', v_banned_users,
      'free', v_free_users,
      'pro', v_pro_users
    ),
    'businesses', jsonb_build_object(
      'active', v_active_businesses
    ),
    'ai', jsonb_build_object(
      'credits_used', v_ai_credits_used,
      'credits_remaining', v_ai_credits_remaining,
      'requests_today', v_ai_requests_today
    ),
    'support', jsonb_build_object(
      'new', v_tickets_new,
      'in_progress', v_tickets_in_progress,
      'waiting_user', v_tickets_waiting_user,
      'resolved', v_tickets_resolved
    ),
    'payments', jsonb_build_object(
      'today', v_payments_today,
      'this_month', v_payments_month,
      'subscription_revenue', v_sub_revenue
    ),
    'recent_activities', v_recent_activities,
    'timestamp', now()
  );
end;
$$;

-- Reload schema
notify pgrst, 'reload schema';
