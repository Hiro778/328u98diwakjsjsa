-- ============================================================
-- 077_admin_support_management.sql
-- BisnisSehat - Tahap 7: Admin Support Management
-- Conforms strictly to @7.md & Context7 Supabase Guidelines:
-- - Server-Side Authorization via public.is_admin()
-- - SECURITY DEFINER, SET search_path = ''
-- - Database-side search, status/priority/category filters, sorting & pagination
-- - Audit logging into public.admin_audit_logs for ticket updates
-- ============================================================

-- 1. Optimized Indexes for Support Ticket queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority ON public.support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at ON public.support_tickets(updated_at DESC);

-- 2. Admin Support Tickets Paginated Query RPC
CREATE OR REPLACE FUNCTION public.get_admin_support_tickets(
  p_search text DEFAULT NULL,
  p_status_filter text DEFAULT 'all',
  p_priority_filter text DEFAULT 'all',
  p_category_filter text DEFAULT 'all',
  p_sort_by text DEFAULT 'newest',
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
  v_records jsonb;
  v_total_count bigint;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses support ticket management'
      USING ERRCODE = '42501';
  END IF;

  -- Calculate Total Count matching filters
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.support_tickets st
  LEFT JOIN public.profiles p ON p.id = st.user_id
  LEFT JOIN public.businesses b ON b.id = st.business_id
  WHERE
    -- Status Filter
    (p_status_filter = 'all' OR st.status = p_status_filter)
    -- Priority Filter
    AND (p_priority_filter = 'all' OR st.priority = p_priority_filter)
    -- Category Filter
    AND (p_category_filter = 'all' OR st.category = p_category_filter)
    -- Search Query (ticket id, subject, description, user email, user name, business name)
    AND (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR st.id::text ILIKE '%' || TRIM(p_search) || '%'
      OR st.subject ILIKE '%' || TRIM(p_search) || '%'
      OR st.description ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(b.name, '') ILIKE '%' || TRIM(p_search) || '%'
    );

  -- Fetch Sorted & Paginated Data
  SELECT jsonb_agg(sub)
  INTO v_records
  FROM (
    SELECT
      st.id,
      st.business_id,
      st.user_id,
      st.category,
      st.subject,
      st.description,
      st.page_url,
      st.priority,
      st.status,
      st.screenshot_url,
      st.admin_note,
      st.created_at,
      st.updated_at,
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name
      ) AS user,
      jsonb_build_object(
        'id', b.id,
        'name', b.name
      ) AS business
    FROM public.support_tickets st
    LEFT JOIN public.profiles p ON p.id = st.user_id
    LEFT JOIN public.businesses b ON b.id = st.business_id
    WHERE
      (p_status_filter = 'all' OR st.status = p_status_filter)
      AND (p_priority_filter = 'all' OR st.priority = p_priority_filter)
      AND (p_category_filter = 'all' OR st.category = p_category_filter)
      AND (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR st.id::text ILIKE '%' || TRIM(p_search) || '%'
        OR st.subject ILIKE '%' || TRIM(p_search) || '%'
        OR st.description ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(b.name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
    ORDER BY
      CASE WHEN p_sort_by = 'oldest' THEN st.created_at END ASC,
      CASE WHEN p_sort_by = 'priority' THEN
        CASE st.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
      END ASC,
      CASE WHEN p_sort_by = 'status' THEN
        CASE st.status
          WHEN 'new' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'waiting_user' THEN 3
          WHEN 'resolved' THEN 4
          WHEN 'closed' THEN 5
          ELSE 6
        END
      END ASC,
      st.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0)
  ) sub;

  RETURN jsonb_build_object(
    'records', COALESCE(v_records, '[]'::jsonb),
    'total_count', v_total_count,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_support_tickets(text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_tickets(text, text, text, text, text, integer, integer) TO authenticated, service_role;

-- 3. Admin Support Ticket Detail RPC
CREATE OR REPLACE FUNCTION public.get_admin_support_ticket_detail(
  p_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_ticket record;
  v_user jsonb;
  v_business jsonb;
  v_audit_logs jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses detail support ticket'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    st.id,
    st.business_id,
    st.user_id,
    st.category,
    st.subject,
    st.description,
    st.page_url,
    st.priority,
    st.status,
    st.screenshot_url,
    st.admin_note,
    st.created_at,
    st.updated_at
  INTO v_ticket
  FROM public.support_tickets st
  WHERE st.id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'SUPPORT_TICKET_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  -- Resolve User Profile
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name
  )
  INTO v_user
  FROM public.profiles p
  WHERE p.id = v_ticket.user_id;

  -- Resolve Business
  IF v_ticket.business_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'name', b.name
    )
    INTO v_business
    FROM public.businesses b
    WHERE b.id = v_ticket.business_id;
  ELSE
    v_business := NULL;
  END IF;

  -- Fetch Audit Logs for this ticket
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'admin_id', al.admin_id,
        'action', al.action,
        'reason', al.reason,
        'metadata', al.metadata,
        'created_at', al.created_at
      ) ORDER BY al.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_audit_logs
  FROM public.admin_audit_logs al
  WHERE al.target_type = 'support_ticket'
    AND al.target_id = p_ticket_id::text;

  RETURN jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'business_id', v_ticket.business_id,
      'user_id', v_ticket.user_id,
      'category', v_ticket.category,
      'subject', v_ticket.subject,
      'description', v_ticket.description,
      'page_url', v_ticket.page_url,
      'priority', v_ticket.priority,
      'status', v_ticket.status,
      'screenshot_url', v_ticket.screenshot_url,
      'admin_note', v_ticket.admin_note,
      'created_at', v_ticket.created_at,
      'updated_at', v_ticket.updated_at
    ),
    'user', v_user,
    'business', v_business,
    'audit_logs', v_audit_logs
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_support_ticket_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_ticket_detail(uuid) TO authenticated, service_role;

-- 4. Admin Update Support Ticket RPC (Mutation & Audit Trail)
CREATE OR REPLACE FUNCTION public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_status text DEFAULT NULL,
  p_admin_note text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_is_adm boolean;
  v_old_ticket record;
  v_new_status text;
  v_new_priority text;
  v_new_admin_note text;
  v_res jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_admin_id := (SELECT auth.uid());
  v_is_adm := public.is_admin();

  IF v_admin_id IS NULL OR NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang berhak memperbarui support ticket'
      USING ERRCODE = '42501';
  END IF;

  -- Load existing ticket
  SELECT *
  INTO v_old_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF v_old_ticket IS NULL THEN
    RAISE EXCEPTION 'SUPPORT_TICKET_NOT_FOUND: Tiket support tidak ditemukan.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Status validation
  IF p_status IS NOT NULL AND TRIM(p_status) <> '' THEN
    IF p_status NOT IN ('new', 'in_progress', 'waiting_user', 'resolved', 'closed') THEN
      RAISE EXCEPTION 'INVALID_STATUS: Status tiket tidak valid. Diperbolehkan: new, in_progress, waiting_user, resolved, closed.'
        USING ERRCODE = '22023';
    END IF;
    v_new_status := p_status;
  ELSE
    v_new_status := v_old_ticket.status;
  END IF;

  -- Priority validation
  IF p_priority IS NOT NULL AND TRIM(p_priority) <> '' THEN
    IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
      RAISE EXCEPTION 'INVALID_PRIORITY: Prioritas tiket tidak valid. Diperbolehkan: low, medium, high, urgent.'
        USING ERRCODE = '22023';
    END IF;
    v_new_priority := p_priority;
  ELSE
    v_new_priority := v_old_ticket.priority;
  END IF;

  -- Admin Note update
  IF p_admin_note IS NOT NULL THEN
    v_new_admin_note := p_admin_note;
  ELSE
    v_new_admin_note := v_old_ticket.admin_note;
  END IF;

  -- Perform atomic update
  UPDATE public.support_tickets
  SET
    status = v_new_status,
    priority = v_new_priority,
    admin_note = v_new_admin_note,
    updated_at = now()
  WHERE id = p_ticket_id;

  -- Insert Audit Log into existing public.admin_audit_logs
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
    'support_ticket_update',
    'support_ticket',
    p_ticket_id::text,
    COALESCE(NULLIF(TRIM(p_reason), ''), NULLIF(TRIM(p_admin_note), ''), 'Pembaruan tiket oleh admin'),
    jsonb_build_object(
      'old_status', v_old_ticket.status,
      'new_status', v_new_status,
      'old_priority', v_old_ticket.priority,
      'new_priority', v_new_priority,
      'note_updated', (p_admin_note IS NOT NULL AND p_admin_note <> COALESCE(v_old_ticket.admin_note, ''))
    ),
    now()
  );

  -- Return updated detail
  v_res := public.get_admin_support_ticket_detail(p_ticket_id);
  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_support_ticket(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_support_ticket(uuid, text, text, text, text) TO authenticated, service_role;

-- 5. Admin Support Stats RPC
CREATE OR REPLACE FUNCTION public.get_admin_support_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_stats jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses ringkasan statistik support'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_tickets', COUNT(*),
    'new_tickets', COUNT(*) FILTER (WHERE status = 'new'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'waiting_user', COUNT(*) FILTER (WHERE status = 'waiting_user'),
    'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
    'closed', COUNT(*) FILTER (WHERE status = 'closed'),
    'urgent_tickets', COUNT(*) FILTER (WHERE priority = 'urgent')
  )
  INTO v_stats
  FROM public.support_tickets;

  RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_support_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_support_stats() TO authenticated, service_role;
