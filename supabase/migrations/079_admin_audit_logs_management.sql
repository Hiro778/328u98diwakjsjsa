-- ============================================================
-- 079_admin_audit_logs_management.sql
-- BisnisSehat - Tahap 9: Admin Audit Logs Management
-- Conforms strictly to @9.md & Context7 Supabase Guidelines:
-- - Server-Side Authorization via public.is_admin()
-- - SECURITY DEFINER, SET search_path = ''
-- - Database-side search, filters (action, actor, target_type, date range), sorting & pagination
-- - Read-only audit trail: immutable, append-only, zero delete/update operations
-- - Safe sanitization: zero passwords, tokens, API keys, or provider secrets exposed
-- ============================================================

-- 1. Optimized Indexes for Audit Log Queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at_asc ON public.admin_audit_logs(created_at ASC);

-- 2. Admin Audit Logs List RPC (Search, Filter, Sort, Pagination)
CREATE OR REPLACE FUNCTION public.get_admin_audit_logs(
  p_search text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_limit integer;
  v_offset integer;
  v_total_count bigint := 0;
  v_records jsonb := '[]'::jsonb;
  v_available_actions jsonb := '[]'::jsonb;
  v_available_target_types jsonb := '[]'::jsonb;
  v_search text;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses audit logs'
      USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_search := NULLIF(TRIM(p_search), '');

  -- Aggregate available distinct actions and target types for filter dropdowns
  SELECT COALESCE(jsonb_agg(DISTINCT action ORDER BY action), '[]'::jsonb)
  INTO v_available_actions
  FROM public.admin_audit_logs;

  SELECT COALESCE(jsonb_agg(DISTINCT target_type ORDER BY target_type), '[]'::jsonb)
  INTO v_available_target_types
  FROM public.admin_audit_logs;

  -- Count total matching rows
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.admin_audit_logs al
  LEFT JOIN public.profiles p ON p.id = al.admin_id
  WHERE
    (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
    AND (p_target_type IS NULL OR p_target_type = 'all' OR al.target_type = p_target_type)
    AND (p_actor_id IS NULL OR al.admin_id = p_actor_id)
    AND (p_date_from IS NULL OR al.created_at >= p_date_from)
    AND (p_date_to IS NULL OR al.created_at <= p_date_to)
    AND (
      v_search IS NULL OR
      al.action ILIKE ('%' || v_search || '%') OR
      al.target_id ILIKE ('%' || v_search || '%') OR
      al.reason ILIKE ('%' || v_search || '%') OR
      p.email ILIKE ('%' || v_search || '%') OR
      p.full_name ILIKE ('%' || v_search || '%')
    );

  -- Fetch matching records
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'admin_id', q.admin_id,
        'admin_email', q.admin_email,
        'admin_name', q.admin_name,
        'admin_avatar_url', q.admin_avatar_url,
        'action', q.action,
        'target_type', q.target_type,
        'target_id', q.target_id,
        'reason', q.reason,
        'metadata', (
          -- Sanitize sensitive keys from metadata payload
          q.metadata - 'password' - 'token' - 'access_token' - 'secret' - 'apiKey' - 'api_key' - 'server_key' - 'authorization' - 'signature_key'
        ),
        'created_at', q.created_at
      )
    ),
    '[]'::jsonb
  )
  INTO v_records
  FROM (
    SELECT
      al.id,
      al.admin_id,
      COALESCE(p.email, '') AS admin_email,
      COALESCE(p.full_name, p.email, 'Admin') AS admin_name,
      p.avatar_url AS admin_avatar_url,
      al.action,
      al.target_type,
      al.target_id,
      al.reason,
      al.metadata,
      al.created_at
    FROM public.admin_audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.admin_id
    WHERE
      (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
      AND (p_target_type IS NULL OR p_target_type = 'all' OR al.target_type = p_target_type)
      AND (p_actor_id IS NULL OR al.admin_id = p_actor_id)
      AND (p_date_from IS NULL OR al.created_at >= p_date_from)
      AND (p_date_to IS NULL OR al.created_at <= p_date_to)
      AND (
        v_search IS NULL OR
        al.action ILIKE ('%' || v_search || '%') OR
        al.target_id ILIKE ('%' || v_search || '%') OR
        al.reason ILIKE ('%' || v_search || '%') OR
        p.email ILIKE ('%' || v_search || '%') OR
        p.full_name ILIKE ('%' || v_search || '%')
      )
    ORDER BY
      CASE WHEN p_sort = 'oldest' THEN al.created_at END ASC,
      CASE WHEN p_sort <> 'oldest' THEN al.created_at END DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'records', v_records,
    'total_count', v_total_count,
    'available_actions', v_available_actions,
    'available_target_types', v_available_target_types,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_audit_logs(text, text, uuid, text, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_logs(text, text, uuid, text, timestamptz, timestamptz, text, integer, integer) TO authenticated, service_role;

-- 3. Admin Audit Log Detail RPC (Safe structured details + target context)
CREATE OR REPLACE FUNCTION public.get_admin_audit_log_detail(
  p_log_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_log record;
  v_admin record;
  v_target_info jsonb := '{}'::jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses audit log detail'
      USING ERRCODE = '42501';
  END IF;

  -- Fetch Audit Log record
  SELECT *
  INTO v_log
  FROM public.admin_audit_logs
  WHERE id = p_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUDIT_LOG_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Fetch Actor profile
  SELECT email, full_name, avatar_url
  INTO v_admin
  FROM public.profiles
  WHERE id = v_log.admin_id;

  -- Contextual target resolution without leaking sensitive cross-tenant data
  IF v_log.target_type = 'user' THEN
    SELECT jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'name', p.full_name,
      'status', p.status
    )
    INTO v_target_info
    FROM public.profiles p
    WHERE p.id::text = v_log.target_id;

  ELSIF v_log.target_type = 'business' THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'is_active', b.is_active
    )
    INTO v_target_info
    FROM public.businesses b
    WHERE b.id::text = v_log.target_id;

  ELSIF v_log.target_type = 'subscription' THEN
    SELECT jsonb_build_object(
      'id', s.id,
      'plan', s.plan,
      'status', s.status,
      'expires_at', s.expires_at
    )
    INTO v_target_info
    FROM public.subscriptions s
    WHERE s.id::text = v_log.target_id;

  ELSIF v_log.target_type = 'support_ticket' THEN
    SELECT jsonb_build_object(
      'id', st.id,
      'subject', st.subject,
      'category', st.category,
      'status', st.status,
      'priority', st.priority
    )
    INTO v_target_info
    FROM public.support_tickets st
    WHERE st.id::text = v_log.target_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_log.id,
    'admin_id', v_log.admin_id,
    'admin_email', COALESCE(v_admin.email, ''),
    'admin_name', COALESCE(v_admin.full_name, v_admin.email, 'Admin'),
    'admin_avatar_url', v_admin.avatar_url,
    'action', v_log.action,
    'target_type', v_log.target_type,
    'target_id', v_log.target_id,
    'reason', v_log.reason,
    'metadata', (
      -- Sanitize sensitive keys from metadata payload
      v_log.metadata - 'password' - 'token' - 'access_token' - 'secret' - 'apiKey' - 'api_key' - 'server_key' - 'authorization' - 'signature_key'
    ),
    'target_info', COALESCE(v_target_info, '{}'::jsonb),
    'created_at', v_log.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_audit_log_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_log_detail(uuid) TO authenticated, service_role;
