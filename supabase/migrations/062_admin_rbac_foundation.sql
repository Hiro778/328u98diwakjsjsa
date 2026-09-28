-- ============================================================
-- 062_admin_rbac_foundation.sql
-- BisnisSehat - Tahap 1: Admin RBAC & Access Control Foundation
-- Conforms strictly to @admin.md Section 0, 1, 30, 31, 40, 41
-- ============================================================

-- 1. Create Enum for Internal Admin Roles
do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type public.admin_role as enum ('USER', 'ADMIN', 'SUPER_ADMIN');
  end if;
end $$;

-- 2. Create admin_users table
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.admin_role not null default 'ADMIN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_admin_users_user_id unique (user_id)
);

-- Indexes for efficient lookup
create index if not exists idx_admin_users_user_id on public.admin_users(user_id);
create index if not exists idx_admin_users_role on public.admin_users(role);

-- 3. Security Definer Helper: get_current_admin_role()
-- Takes identity strictly from auth.uid()
create or replace function public.get_current_admin_role()
returns public.admin_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.admin_role;
begin
  if v_uid is null then
    return 'USER'::public.admin_role;
  end if;

  select role into v_role
  from public.admin_users
  where user_id = v_uid;

  return coalesce(v_role, 'USER'::public.admin_role);
end;
$$;

-- 4. Security Definer Helper: is_admin()
-- Strictly verifies that auth.uid() has ADMIN or SUPER_ADMIN role
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role in ('ADMIN'::public.admin_role, 'SUPER_ADMIN'::public.admin_role)
  );
$$;

-- 5. Security Definer Helper: is_super_admin()
-- Strictly verifies that auth.uid() has SUPER_ADMIN role
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and role = 'SUPER_ADMIN'::public.admin_role
  );
$$;

-- 6. Trigger: Prevent self role escalation & non-superadmin elevation
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Prevent admin from modifying or elevating their own role
  if auth.uid() = old.user_id and new.role <> old.role then
    raise exception 'Forbidden: Admin tidak boleh mengubah atau menaikkan role dirinya sendiri' using errcode = '42501';
  end if;

  -- Only super admin can change any role
  if not public.is_super_admin() then
    raise exception 'Forbidden: Hanya SUPER_ADMIN yang dapat mengelola role admin' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on public.admin_users;
create trigger trg_prevent_self_role_escalation
  before update on public.admin_users
  for each row execute function public.prevent_self_role_escalation();

-- 7. Enable Row Level Security on admin_users
alter table public.admin_users enable row level security;

-- Drop any existing policies for clean idempotency
drop policy if exists "Admins can view admin users" on public.admin_users;
drop policy if exists "Super admins can insert admin users" on public.admin_users;
drop policy if exists "Super admins can update admin users" on public.admin_users;
drop policy if exists "Super admins can delete admin users" on public.admin_users;

-- Read policy: Only verified admins/super admins can view admin records; ordinary users get nothing
create policy "Admins can view admin users"
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin());

-- Write policies: Only super admins can insert, update, or delete admin accounts
create policy "Super admins can insert admin users"
  on public.admin_users
  for insert
  to authenticated
  with check (public.is_super_admin());

create policy "Super admins can update admin users"
  on public.admin_users
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Super admins can delete admin users"
  on public.admin_users
  for delete
  to authenticated
  using (public.is_super_admin());

-- Notify PostgREST schema cache
notify pgrst, 'reload schema';
