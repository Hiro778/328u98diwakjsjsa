-- ============================================================
-- 063_admin_overview_and_layout.sql
-- BisnisSehat - Tahap 2: Admin Layout & Overview Metrics
-- Conforms strictly to @admin.md Section 0, 2, 3, 23, 30, 35
-- ============================================================

-- 1. Create support_tickets table per @admin.md Section 23
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Lainnya',
  subject text not null default '',
  description text not null default '',
  page_url text default '',
  priority text not null default 'medium', -- low | medium | high | urgent
  status text not null default 'new',      -- new | in_progress | waiting_user | resolved | closed
  screenshot_url text default '',
  admin_note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for support_tickets
create index if not exists idx_support_tickets_user_id on public.support_tickets(user_id);
create index if not exists idx_support_tickets_business_id on public.support_tickets(business_id);
create index if not exists idx_support_tickets_status on public.support_tickets(status);
create index if not exists idx_support_tickets_created_at on public.support_tickets(created_at desc);

-- Enable RLS on support_tickets
alter table public.support_tickets enable row level security;

-- Drop existing policies for clean idempotency
drop policy if exists "Users can insert own tickets" on public.support_tickets;
drop policy if exists "Users can view own tickets" on public.support_tickets;
drop policy if exists "Admins can view all tickets" on public.support_tickets;
drop policy if exists "Admins can update tickets" on public.support_tickets;
drop policy if exists "Admins can delete tickets" on public.support_tickets;

-- User Policies:
create policy "Users can insert own tickets"
  on public.support_tickets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view own tickets"
  on public.support_tickets
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Admin Management Policies:
create policy "Admins can update tickets"
  on public.support_tickets
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete tickets"
  on public.support_tickets
  for delete
  to authenticated
  using (public.is_super_admin());

-- 2. Server-side Overview RPC Function: get_admin_dashboard_overview()
-- Gathers actual database statistics across profiles, businesses, subscriptions, AI, and payments
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

  -- 2. User Stats
  select count(*) into v_total_users from public.profiles;
  v_active_users := v_total_users;

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
  -- Payments Today (Midtrans subscriptions + POS completed payments)
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

  -- Payments This Month
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

  -- Total Subscription Revenue
  select coalesce(sum(gross_amount), 0) into v_sub_revenue
  from public.subscription_payments
  where payment_status in ('paid', 'settlement');

  -- 7. Real Database Recent Activity (Actual user registrations and AI operations)
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
      'suspended', null, -- Belum ada kolom suspended di schema profiles
      'banned', null,    -- Belum ada kolom banned di schema profiles
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

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
