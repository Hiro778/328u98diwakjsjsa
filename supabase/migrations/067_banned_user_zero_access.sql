-- ============================================================
-- 067_banned_user_zero_access.sql
-- Urgent Security Hardening: Banned User Must Have Zero App Access
-- 
-- 1. Helper function public.is_user_banned(user_id)
-- 2. Trigger on public.profiles to block any update by banned users & prevent self-unban
-- 3. Hardened admin_update_user_status RPC:
--    - Sets profiles.status = 'banned'
--    - Sets auth.users.banned_until = 'infinity' (blocks token refresh & login in GoTrue)
--    - Deletes from auth.sessions (terminates active sessions immediately)
--    - Unban sets auth.users.banned_until = null
-- 4. RLS Hardening on core tables (businesses, profiles) to deny banned users
-- ============================================================

-- 1. Security Definer Helper: is_user_banned()
create or replace function public.is_user_banned(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select status in ('banned', 'deleted')
    from public.profiles
    where id = coalesce(p_user_id, auth.uid())
  ), false);
$$;

-- 2. Trigger Function: prevent_banned_user_tampering
-- Prevents banned users from updating anything on their profile,
-- and prevents regular users from tampering with their own status/status_reason.
create or replace function public.prevent_banned_user_tampering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_adm boolean;
  v_is_service_role boolean;
begin
  -- Check if caller is service_role or admin
  v_is_service_role := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    or coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'service_role', 'supabase_admin')
  );
  v_is_adm := v_is_service_role or public.is_admin();

  -- If caller is not an admin / service_role:
  if not v_is_adm then
    -- If currently banned or deleted, reject any profile update
    if old.status in ('banned', 'deleted') then
      raise exception 'Akses ditolak: Akun Anda sedang diblokir (banned)' using errcode = '42501';
    end if;

    -- Non-admin cannot alter status or reason
    if new.status is distinct from old.status then
      new.status := old.status;
    end if;
    if new.status_reason is distinct from old.status_reason then
      new.status_reason := old.status_reason;
    end if;
    if new.status_updated_at is distinct from old.status_updated_at then
      new.status_updated_at := old.status_updated_at;
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      new.deleted_at := old.deleted_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_banned_user_tampering on public.profiles;
create trigger trg_prevent_banned_user_tampering
  before update on public.profiles
  for each row
  execute function public.prevent_banned_user_tampering();

-- 3. Hardened Server-side Action RPC: admin_update_user_status
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
  v_is_service_role boolean;
  v_current_status text;
  v_action text;
begin
  -- 1. Authorization Check (Allow admins or service_role)
  v_is_service_role := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    or coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'service_role', 'supabase_admin')
  );
  v_is_adm := v_is_service_role or public.is_admin();
  v_is_super := v_is_service_role or public.is_super_admin();

  if not v_is_adm then
    raise exception 'Unauthorized: Only admins can modify user status' using errcode = '42501';
  end if;

  -- Self-protection invariant: Admin cannot ban/suspend/delete their own account
  if not v_is_service_role and p_target_user_id = v_admin_id then
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

  -- 3. Atomic Database Update (Profiles)
  update public.profiles
  set
    status = p_new_status,
    status_reason = coalesce(p_reason, ''),
    status_updated_at = now(),
    deleted_at = case when p_new_status = 'deleted' then now() else deleted_at end,
    updated_at = now()
  where id = p_target_user_id;

  -- 4. Deep Security Hardening in Supabase Auth Engine:
  if p_new_status in ('banned', 'deleted') then
    -- A. Revoke in GoTrue (auth.users) so login & token refresh are immediately rejected
    update auth.users
    set banned_until = 'infinity'::timestamptz
    where id = p_target_user_id;

    -- B. Immediately terminate all active sessions
    delete from auth.sessions
    where user_id = p_target_user_id;

  elsif p_new_status in ('active', 'suspended') then
    -- When unbanned or restored, remove the GoTrue ban
    update auth.users
    set banned_until = null
    where id = p_target_user_id;
  end if;

  -- 5. Mandatory Audit Log Entry
  insert into public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) values (
    coalesce(v_admin_id, p_target_user_id),
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

-- 4. RLS Hardening on Businesses Table
-- Banned users are strictly forbidden from viewing, inserting, updating, or deleting businesses
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
    and not public.is_user_banned(auth.uid())
  );

create policy "Users can insert own businesses"
  on public.businesses
  for insert
  to authenticated
  with check (
    (auth.uid() = owner_id)
    and not public.is_user_banned(auth.uid())
  );

create policy "Users can update own businesses"
  on public.businesses
  for update
  to authenticated
  using (
    (auth.uid() = owner_id)
    and not public.is_user_banned(auth.uid())
  )
  with check (
    (auth.uid() = owner_id)
    and not public.is_user_banned(auth.uid())
  );

create policy "Users can delete own businesses"
  on public.businesses
  for delete
  to authenticated
  using (
    (auth.uid() = owner_id)
    and not public.is_user_banned(auth.uid())
  );

-- 5. RLS Hardening on Profiles Table
-- Banned users cannot update their profile
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (
    (auth.uid() = id)
    and not public.is_user_banned(auth.uid())
  )
  with check (
    (auth.uid() = id)
    and not public.is_user_banned(auth.uid())
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
