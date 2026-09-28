-- ============================================================
-- 076_admin_ai_usage.sql
-- BisnisSehat - Tahap 6: Admin AI Usage Management
-- Conforms strictly to @6.md & Context7 Supabase Guidelines:
-- - Server-Side Authorization via public.is_admin()
-- - SECURITY DEFINER, SET search_path = ''
-- - Read-only monitoring without changing entitlements or billing
-- ============================================================

-- 1. Optimized Indexes for AI Usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at_desc ON public.ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON public.ai_usage(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON public.ai_usage(operation);
CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON public.ai_usage(status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_profile_id ON public.ai_usage(profile_id);

-- 2. Admin AI Usage Paginated Query RPC
CREATE OR REPLACE FUNCTION public.get_admin_ai_usage(
  p_search text DEFAULT NULL,
  p_time_range text DEFAULT 'all',
  p_operation_filter text DEFAULT 'all',
  p_model_filter text DEFAULT 'all',
  p_status_filter text DEFAULT 'all',
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
  v_time_threshold timestamptz;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses monitoring AI usage'
      USING ERRCODE = '42501';
  END IF;

  -- Determine Time Filter Boundary
  IF p_time_range = 'today' THEN
    v_time_threshold := date_trunc('day', now());
  ELSIF p_time_range = '7d' THEN
    v_time_threshold := now() - INTERVAL '7 days';
  ELSIF p_time_range = '30d' THEN
    v_time_threshold := now() - INTERVAL '30 days';
  ELSE
    v_time_threshold := NULL;
  END IF;

  -- Calculate Total Count matching filters
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.ai_usage u
  LEFT JOIN public.profiles p ON p.id = u.profile_id
  LEFT JOIN public.businesses b ON b.id = u.business_id
  WHERE
    -- Time Filter
    (v_time_threshold IS NULL OR u.created_at >= v_time_threshold)
    -- Operation / Tool Filter
    AND (p_operation_filter = 'all' OR u.operation = p_operation_filter)
    -- Model Filter
    AND (p_model_filter = 'all' OR u.model = p_model_filter)
    -- Status Filter
    AND (p_status_filter = 'all' OR u.status = p_status_filter)
    -- Search Query
    AND (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR u.request_id ILIKE '%' || TRIM(p_search) || '%'
      OR u.model ILIKE '%' || TRIM(p_search) || '%'
      OR u.operation ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(b.name, '') ILIKE '%' || TRIM(p_search) || '%'
    );

  -- Fetch Sorted & Paginated Data
  SELECT jsonb_agg(sub)
  INTO v_records
  FROM (
    SELECT
      u.id,
      u.business_id,
      u.profile_id,
      u.operation,
      u.model,
      u.input_tokens,
      u.output_tokens,
      u.total_tokens,
      u.credits_charged,
      u.provider_cost_usd,
      u.is_estimated,
      u.status,
      u.request_id,
      u.created_at,
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name
      ) AS user,
      jsonb_build_object(
        'id', b.id,
        'name', b.name
      ) AS business
    FROM public.ai_usage u
    LEFT JOIN public.profiles p ON p.id = u.profile_id
    LEFT JOIN public.businesses b ON b.id = u.business_id
    WHERE
      (v_time_threshold IS NULL OR u.created_at >= v_time_threshold)
      AND (p_operation_filter = 'all' OR u.operation = p_operation_filter)
      AND (p_model_filter = 'all' OR u.model = p_model_filter)
      AND (p_status_filter = 'all' OR u.status = p_status_filter)
      AND (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR u.request_id ILIKE '%' || TRIM(p_search) || '%'
        OR u.model ILIKE '%' || TRIM(p_search) || '%'
        OR u.operation ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(b.name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
    ORDER BY
      CASE WHEN p_sort_by = 'oldest' THEN u.created_at END ASC,
      CASE WHEN p_sort_by = 'highest_tokens' THEN u.total_tokens END DESC,
      CASE WHEN p_sort_by = 'highest_credits' THEN u.credits_charged END DESC,
      CASE WHEN p_sort_by = 'highest_cost' THEN u.provider_cost_usd END DESC,
      u.created_at DESC
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

REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage(text, text, text, text, text, text, integer, integer) TO authenticated, service_role;

-- 3. Admin AI Usage Stats RPC
CREATE OR REPLACE FUNCTION public.get_admin_ai_usage_stats(
  p_time_range text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_time_threshold timestamptz;
  v_stats jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses ringkasan statistik AI usage'
      USING ERRCODE = '42501';
  END IF;

  IF p_time_range = 'today' THEN
    v_time_threshold := date_trunc('day', now());
  ELSIF p_time_range = '7d' THEN
    v_time_threshold := now() - INTERVAL '7 days';
  ELSIF p_time_range = '30d' THEN
    v_time_threshold := now() - INTERVAL '30 days';
  ELSE
    v_time_threshold := NULL;
  END IF;

  SELECT jsonb_build_object(
    'total_requests', COUNT(*),
    'total_credits', COALESCE(SUM(credits_charged), 0),
    'total_tokens', COALESCE(SUM(total_tokens), 0),
    'input_tokens', COALESCE(SUM(input_tokens), 0),
    'output_tokens', COALESCE(SUM(output_tokens), 0),
    'total_cost_usd', ROUND(COALESCE(SUM(provider_cost_usd), 0)::numeric, 6),
    'active_users', COUNT(DISTINCT profile_id),
    'active_businesses', COUNT(DISTINCT business_id),
    'success_requests', COUNT(*) FILTER (WHERE status = 'success'),
    'failed_requests', COUNT(*) FILTER (WHERE status = 'failed')
  )
  INTO v_stats
  FROM public.ai_usage
  WHERE (v_time_threshold IS NULL OR created_at >= v_time_threshold);

  RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage_stats(text) TO authenticated, service_role;

-- 4. Admin AI Usage Detail RPC
CREATE OR REPLACE FUNCTION public.get_admin_ai_usage_detail(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_detail jsonb;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat detail AI usage'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'business_id', u.business_id,
    'profile_id', u.profile_id,
    'operation', u.operation,
    'model', u.model,
    'input_tokens', u.input_tokens,
    'output_tokens', u.output_tokens,
    'total_tokens', u.total_tokens,
    'credits_charged', u.credits_charged,
    'provider_cost_usd', u.provider_cost_usd,
    'is_estimated', u.is_estimated,
    'status', u.status,
    'request_id', u.request_id,
    'metadata', u.metadata,
    'created_at', u.created_at,
    'user', jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name
    ),
    'business', jsonb_build_object(
      'id', b.id,
      'name', b.name
    )
  )
  INTO v_detail
  FROM public.ai_usage u
  LEFT JOIN public.profiles p ON p.id = u.profile_id
  LEFT JOIN public.businesses b ON b.id = u.business_id
  WHERE u.id = p_id;

  IF v_detail IS NULL THEN
    RAISE EXCEPTION 'AI_USAGE_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_detail;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage_detail(uuid) TO authenticated, service_role;
