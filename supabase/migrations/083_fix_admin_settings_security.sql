-- ============================================================
-- 083_fix_admin_settings_security.sql
-- BisnisSehat: Hardening Admin Settings RPC Security & Whitelist Check (@10.md)
--
-- Fixes:
-- 1. get_admin_settings(): Replace current_user check with pure public.is_admin()
--    or service_role check so normal authenticated users are strictly blocked with 42501.
-- 2. update_admin_setting(): Ensure non-admin users and invalid keys are properly validated.
-- ============================================================

-- 1. Security Definer RPC: get_admin_settings()
CREATE OR REPLACE FUNCTION public.get_admin_settings()
RETURNS TABLE (
  id uuid,
  key text,
  value jsonb,
  category text,
  description text,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Strict authorization: Admin or Service Role only
  IF NOT (
    public.is_admin() OR
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR
    auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin administratif untuk melihat konfigurasi platform.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.key,
    s.value,
    s.category,
    s.description,
    s.updated_by,
    s.created_at,
    s.updated_at
  FROM public.platform_settings s
  ORDER BY s.category ASC, s.key ASC;
END;
$$;

-- 2. Security Definer RPC: update_admin_setting()
CREATE OR REPLACE FUNCTION public.update_admin_setting(
  p_key text,
  p_value jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_old_setting record;
  v_updated_setting record;
  v_audit_action text;
BEGIN
  -- 1. Authorization check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR auth.role() = 'service_role' THEN
      SELECT user_id INTO v_admin_id FROM public.admin_users LIMIT 1;
    ELSE
      RAISE EXCEPTION 'Akses ditolak: Anda tidak memiliki izin administratif untuk mengubah konfigurasi platform.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya admin yang berhak memperbarui konfigurasi platform.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Reject null or empty key
  IF p_key IS NULL OR TRIM(p_key) = '' THEN
    RAISE EXCEPTION 'INVALID_SETTING_KEY: Kunci konfigurasi tidak boleh kosong.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Explicit rejection of forbidden secret-like patterns
  IF lower(p_key) ~ '(secret|token|password|cred|api_key|service_role)' THEN
    RAISE EXCEPTION 'FORBIDDEN_SETTING: Kunci konfigurasi rahasia tidak boleh dimodifikasi melalui platform settings.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Whitelist check
  IF p_key NOT IN (
    'platform_name',
    'support_email',
    'support_phone',
    'support_operating_hours',
    'maintenance_mode',
    'announcement_banner_enabled',
    'announcement_banner_text',
    'enable_user_registration',
    'enable_ai_features',
    'enable_qris_checkout',
    'enable_pos_module',
    'pos_max_items_per_order',
    'session_idle_timeout_minutes'
  ) THEN
    RAISE EXCEPTION 'INVALID_SETTING_KEY: Kunci konfigurasi "%" tidak terdaftar atau tidak diizinkan.', p_key
      USING ERRCODE = '22023';
  END IF;

  -- 5. Value validation
  IF p_key IN ('maintenance_mode', 'announcement_banner_enabled', 'enable_user_registration', 'enable_ai_features', 'enable_qris_checkout', 'enable_pos_module') THEN
    IF jsonb_typeof(p_value) <> 'boolean' THEN
      RAISE EXCEPTION 'INVALID_SETTING_VALUE: Nilai untuk "%" harus bertipe boolean (true/false).', p_key
        USING ERRCODE = '22023';
    END IF;
  ELSIF p_key IN ('platform_name', 'support_phone', 'support_operating_hours', 'announcement_banner_text') THEN
    IF jsonb_typeof(p_value) <> 'string' THEN
      RAISE EXCEPTION 'INVALID_SETTING_VALUE: Nilai untuk "%" harus bertipe teks.', p_key
        USING ERRCODE = '22023';
    END IF;
  ELSIF p_key = 'support_email' THEN
    IF jsonb_typeof(p_value) <> 'string' OR NOT (p_value #>> '{}' ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') THEN
      RAISE EXCEPTION 'INVALID_SETTING_VALUE: Nilai support_email harus berupa format email yang valid.'
        USING ERRCODE = '22023';
    END IF;
  ELSIF p_key IN ('pos_max_items_per_order', 'session_idle_timeout_minutes') THEN
    IF jsonb_typeof(p_value) <> 'number' OR (p_value::text)::numeric <= 0 THEN
      RAISE EXCEPTION 'INVALID_SETTING_VALUE: Nilai untuk "%" harus bertipe angka positif lebih dari nol.', p_key
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Find existing row
  SELECT * INTO v_old_setting
  FROM public.platform_settings
  WHERE key = p_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTING_NOT_FOUND: Konfigurasi dengan kunci "%" tidak ditemukan dalam database.', p_key
      USING ERRCODE = 'P0002';
  END IF;

  -- 7. Update row
  UPDATE public.platform_settings
  SET
    value = p_value,
    updated_by = v_admin_id,
    updated_at = now()
  WHERE key = p_key
  RETURNING * INTO v_updated_setting;

  -- 8. Determine audit log action
  IF p_key = 'maintenance_mode' THEN
    v_audit_action := 'MAINTENANCE_MODE_CHANGED';
  ELSIF v_updated_setting.category = 'feature_flags' THEN
    v_audit_action := 'FEATURE_FLAG_CHANGED';
  ELSE
    v_audit_action := 'SETTINGS_UPDATED';
  END IF;

  -- 9. Write to admin_audit_logs if admin_id is valid
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs (
      admin_id,
      action,
      target_type,
      target_id,
      reason,
      metadata,
      created_at
    ) VALUES (
      v_admin_id,
      v_audit_action,
      'platform_settings',
      v_updated_setting.id::text,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin memperbarui konfigurasi ' || p_key),
      jsonb_build_object(
        'key', p_key,
        'old_value', v_old_setting.value,
        'new_value', p_value,
        'category', v_updated_setting.category
      ),
      now()
    );
  END IF;

  RETURN to_jsonb(v_updated_setting);
END;
$$;

-- 3. Grant & Revoke Execution Permissions
REVOKE EXECUTE ON FUNCTION public.get_admin_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_settings() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_admin_setting(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_setting(text, jsonb, text) TO authenticated, service_role;
