-- ============================================================
-- 110_harden_admin_user_status_authorization.sql
-- BisnisSehat: Security Hardening for admin_update_user_status & admin_set_user_status
-- Remediation for Confirmed Security Finding: BS-CONF-04 (CVSS 9.8)
--
-- Vulnerability:
-- In 071_fix_gotrue_banned_until_compatibility.sql, the role detection check used:
--   v_is_service_role := (
--     current_setting('request.jwt.claim.role', true) = 'service_role'
--     OR coalesce(auth.role(), '') = 'service_role'
--     OR current_user IN ('postgres', 'service_role', 'supabase_admin')
--   );
-- Because the function is SECURITY DEFINER, current_user evaluates to 'postgres'
-- for all invocations, granting full administrative bypass to anonymous callers
-- and non-admin authenticated users to ban, suspend, or delete any account.
--
-- Remediation:
-- 1. Remove current_user evaluation, strictly verifying service_role via JWT claims / auth.role().
-- 2. Require active authentication (v_admin_id IS NOT NULL) and public.is_admin() for non-service_role callers.
-- 3. Require public.is_super_admin() for account deletion ('deleted').
-- 4. Preserve self-protection invariant (admin cannot ban/suspend/delete their own account).
-- 5. Revoke EXECUTE privileges from PUBLIC and anon on both admin_update_user_status and admin_set_user_status.
-- 6. Grant EXECUTE privileges strictly to authenticated and service_role.
-- ============================================================

-- 1. Redefine public.admin_update_user_status with hardened authorization logic
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
  -- 1. Strict Service Role Verification (Never trust current_user in SECURITY DEFINER)
  v_is_service_role := (
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR COALESCE(auth.role(), '') = 'service_role'
  );

  -- 2. Role-Based Access Control (RBAC) Enforcement
  IF NOT v_is_service_role THEN
    IF v_admin_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only admins can modify user status' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_is_adm := v_is_service_role OR public.is_admin();
  v_is_super := v_is_service_role OR public.is_super_admin();

  -- 3. Self-protection invariant: Admin cannot ban/suspend/delete their own account
  IF NOT v_is_service_role AND p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Forbidden: Admin tidak boleh mengubah status akun miliknya sendiri' USING ERRCODE = '42501';
  END IF;

  -- 4. Validate target user exists
  SELECT status INTO v_current_status
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  -- 5. Permission check per action type
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

  -- 6. Atomic Database Update (Profiles)
  UPDATE public.profiles
  SET
    status = p_new_status,
    status_reason = coalesce(p_reason, ''),
    status_updated_at = now(),
    deleted_at = CASE WHEN p_new_status = 'deleted' THEN now() ELSE deleted_at END,
    updated_at = now()
  WHERE id = p_target_user_id;

  -- 7. Deep Security Hardening in Supabase Auth Engine:
  IF p_new_status IN ('banned', 'deleted') THEN
    UPDATE auth.users
    SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
    WHERE id = p_target_user_id;

    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

  ELSIF p_new_status = 'suspended' THEN
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;

  ELSIF p_new_status = 'active' THEN
    UPDATE auth.users
    SET banned_until = null
    WHERE id = p_target_user_id;
  END IF;

  -- 8. Mandatory Audit Log Entry
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

-- 2. Redefine public.admin_set_user_status alias
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

-- 3. Strict Privilege Revocations & Grants
REVOKE ALL ON FUNCTION public.admin_update_user_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated, service_role;

-- 4. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
