-- ============================================================
-- 071_fix_gotrue_banned_until_compatibility.sql
-- Fix GoTrue banned_until scanner compatibility
--
-- GoTrue/lib/pq fails when scanning 'infinity'::timestamptz into Go *time.Time:
-- "sql: Scan error on column index 1, name='banned_until': unsupported Scan, storing driver.Value type string into type *time.Time"
--
-- This migration updates admin_update_user_status (and provides admin_set_user_status alias)
-- to use a concrete finite timestamp ('2099-12-31 23:59:59+00'::timestamptz)
-- for banned/deleted accounts instead of 'infinity'.
-- UNBAN/ACTIVE continues to reset banned_until = null.
-- All RLS, RBAC, session termination, and audit log semantics are preserved.
-- ============================================================

-- 1. Ensure any remaining legacy 'infinity' rows are safely replaced with finite timestamp
UPDATE auth.users
SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
WHERE banned_until = 'infinity'::timestamptz;

-- 2. Correct admin_update_user_status to NEVER write 'infinity'
CREATE OR REPLACE FUNCTION public.admin_update_user_status(
  p_target_user_id uuid,
  p_new_status text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_adm boolean;
  v_is_super boolean;
  v_is_service_role boolean;
  v_current_status text;
  v_action text;
BEGIN
  -- 1. Authorization Check (Allow admins or service_role)
  v_is_service_role := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR coalesce(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'service_role', 'supabase_admin')
  );
  v_is_adm := v_is_service_role OR public.is_admin();
  v_is_super := v_is_service_role OR public.is_super_admin();

  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can modify user status' USING ERRCODE = '42501';
  END IF;

  -- Self-protection invariant: Admin cannot ban/suspend/delete their own account
  IF NOT v_is_service_role AND p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Forbidden: Admin tidak boleh mengubah status akun miliknya sendiri' USING ERRCODE = '42501';
  END IF;

  -- Validate target user exists
  SELECT status INTO v_current_status
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Permission check per action type
  IF p_new_status = 'deleted' THEN
    IF NOT v_is_super THEN
      RAISE EXCEPTION 'Forbidden: Hanya SUPER_ADMIN yang memiliki izin untuk menghapus user' USING ERRCODE = '42501';
    END IF;
    v_action := 'USER_DELETED';
  ELSIF p_new_status = 'banned' THEN
    v_action := 'USER_BANNED';
  ELSIF p_new_status = 'suspended' THEN
    v_action := 'USER_SUSPENDED';
  ELSIF p_new_status = 'active' THEN
    IF v_current_status = 'banned' THEN
      v_action := 'USER_UNBANNED';
    ELSIF v_current_status = 'suspended' THEN
      v_action := 'USER_UNSUSPENDED';
    ELSE
      v_action := 'USER_ACTIVATED';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid status value: %', p_new_status;
  END IF;

  -- Mandatory reason for destructive/restrictive actions
  IF p_new_status IN ('suspended', 'banned', 'deleted') AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION 'Alasan (reason) wajib diisi untuk tindakan %', v_action USING ERRCODE = '22023';
  END IF;

  -- 3. Atomic Database Update (Profiles)
  UPDATE public.profiles
  SET
    status = p_new_status,
    status_reason = coalesce(p_reason, ''),
    status_updated_at = now(),
    deleted_at = CASE WHEN p_new_status = 'deleted' THEN now() ELSE deleted_at END,
    updated_at = now()
  WHERE id = p_target_user_id;

  -- 4. Deep Security Hardening in Supabase Auth Engine:
  IF p_new_status IN ('banned', 'deleted') THEN
    -- A. Revoke in GoTrue (auth.users) so login & token refresh are immediately rejected.
    -- Use finite timestamptz compatible with Go time.Time scanner.
    UPDATE auth.users
    SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
    WHERE id = p_target_user_id;

    -- B. Immediately terminate all active sessions
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

  ELSIF p_new_status = 'suspended' THEN
    -- Invalidate active sessions immediately upon suspension
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;

  ELSIF p_new_status = 'active' THEN
    -- When unbanned or restored, remove the GoTrue ban
    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;
  END IF;

  -- 5. Mandatory Audit Log Entry
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) VALUES (
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

  RETURN jsonb_build_object(
    'success', true,
    'action', v_action,
    'target_user_id', p_target_user_id,
    'new_status', p_new_status
  );
END;
$$;

-- 3. Provide admin_set_user_status alias to match specification requirements
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_target_user_id uuid,
  p_new_status text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.admin_update_user_status(p_target_user_id, p_new_status, p_reason);
END;
$$;

-- 4. Grant appropriate execute permissions
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated, service_role;
