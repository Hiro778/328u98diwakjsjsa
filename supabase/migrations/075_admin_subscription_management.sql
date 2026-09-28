-- ============================================================
-- 075_admin_subscription_management.sql
-- BisnisSehat - Tahap 5: Admin Subscription Management RPC Fix
-- Conforms strictly to @qr.md Stage 5 & Context7 Supabase Guidelines:
-- - Replaces get_admin_subscriptions with correct single-query separation
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_subscriptions(
  p_search text DEFAULT NULL,
  p_plan_filter text DEFAULT 'all',
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
  v_subscriptions jsonb;
  v_total_count bigint;
BEGIN
  -- 1. Strict Server-Side Authorization
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses subscription management'
      USING ERRCODE = '42501';
  END IF;

  -- 2. First calculate total matching count
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.subscriptions s
  LEFT JOIN public.profiles p ON p.id = s.profile_id
  LEFT JOIN public.businesses b ON b.id = s.business_id
  LEFT JOIN LATERAL (
    SELECT bz.id, bz.name
    FROM public.businesses bz
    WHERE bz.owner_id = s.profile_id
    ORDER BY bz.created_at ASC
    LIMIT 1
  ) def_biz ON s.business_id IS NULL
  WHERE
    -- Search Filter
    (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR s.id::text ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(s.provider_transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(b.name, def_biz.name, '') ILIKE '%' || TRIM(p_search) || '%'
    )
    -- Plan Filter
    AND (
      p_plan_filter = 'all'
      OR LOWER(s.plan) = LOWER(p_plan_filter)
    )
    -- Status Filter
    AND (
      p_status_filter = 'all'
      OR (
        p_status_filter = 'active'
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
      )
      OR (
        p_status_filter = 'expired'
        AND s.status = 'active'
        AND s.expires_at IS NOT NULL
        AND s.expires_at <= NOW()
      )
      OR (
        p_status_filter = 'cancelled'
        AND s.status = 'cancelled'
      )
      OR (
        p_status_filter = 'inactive'
        AND s.status = 'inactive'
      )
    );

  -- 3. Query paginated subscriptions
  WITH filtered_subs AS (
    SELECT
      s.id,
      s.profile_id,
      s.plan,
      s.status AS raw_status,
      s.started_at,
      s.expires_at,
      s.created_at,
      s.updated_at,
      s.payment_provider,
      s.provider_transaction_id,
      s.business_id,
      s.cancelled_at,
      s.cancelled_by,
      -- Derived Status
      CASE
        WHEN s.status = 'cancelled' THEN 'cancelled'
        WHEN s.status = 'active' AND s.expires_at IS NOT NULL AND s.expires_at <= NOW() THEN 'expired'
        ELSE s.status
      END AS computed_status,
      -- Owner Profile
      p.email AS user_email,
      COALESCE(NULLIF(p.full_name, ''), p.email) AS user_name,
      p.avatar_url AS user_avatar,
      p.status AS user_status,
      -- Linked Business
      COALESCE(b.id, def_biz.id) AS resolved_business_id,
      COALESCE(b.name, def_biz.name, '—') AS business_name,
      -- Latest Payment Info
      sp.gross_amount AS last_payment_amount,
      sp.payment_method AS last_payment_method,
      sp.payment_status AS last_payment_status,
      sp.paid_at AS last_paid_at
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.businesses b ON b.id = s.business_id
    LEFT JOIN LATERAL (
      SELECT bz.id, bz.name
      FROM public.businesses bz
      WHERE bz.owner_id = s.profile_id
      ORDER BY bz.created_at ASC
      LIMIT 1
    ) def_biz ON s.business_id IS NULL
    LEFT JOIN LATERAL (
      SELECT pay.gross_amount, pay.payment_method, pay.payment_status, pay.paid_at
      FROM public.subscription_payments pay
      WHERE pay.subscription_id = s.id OR pay.profile_id = s.profile_id
      ORDER BY pay.created_at DESC
      LIMIT 1
    ) sp ON true
    WHERE
      -- Search Filter
      (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR s.id::text ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(s.provider_transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(b.name, def_biz.name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
      -- Plan Filter
      AND (
        p_plan_filter = 'all'
        OR LOWER(s.plan) = LOWER(p_plan_filter)
      )
      -- Status Filter
      AND (
        p_status_filter = 'all'
        OR (
          p_status_filter = 'active'
          AND s.status = 'active'
          AND (s.expires_at IS NULL OR s.expires_at > NOW())
        )
        OR (
          p_status_filter = 'expired'
          AND s.status = 'active'
          AND s.expires_at IS NOT NULL
          AND s.expires_at <= NOW()
        )
        OR (
          p_status_filter = 'cancelled'
          AND s.status = 'cancelled'
        )
        OR (
          p_status_filter = 'inactive'
          AND s.status = 'inactive'
        )
      )
    ORDER BY
      CASE WHEN p_sort_by = 'oldest' THEN s.created_at END ASC,
      CASE WHEN p_sort_by = 'expires_soon' THEN s.expires_at END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'expires_late' THEN s.expires_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'newest' OR p_sort_by IS NULL OR p_sort_by = '' THEN s.created_at END DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(100, p_limit))
    OFFSET GREATEST(0, p_offset)
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'profile_id', f.profile_id,
          'plan', f.plan,
          'status', f.computed_status,
          'raw_status', f.raw_status,
          'started_at', f.started_at,
          'expires_at', f.expires_at,
          'created_at', f.created_at,
          'updated_at', f.updated_at,
          'payment_provider', f.payment_provider,
          'provider_transaction_id', f.provider_transaction_id,
          'business_id', f.resolved_business_id,
          'business_name', f.business_name,
          'cancelled_at', f.cancelled_at,
          'cancelled_by', f.cancelled_by,
          'user', jsonb_build_object(
            'id', f.profile_id,
            'email', f.user_email,
            'name', f.user_name,
            'avatar_url', f.user_avatar,
            'status', f.user_status
          ),
          'last_payment', CASE
            WHEN f.last_payment_status IS NOT NULL THEN jsonb_build_object(
              'amount', f.last_payment_amount,
              'method', f.last_payment_method,
              'status', f.last_payment_status,
              'paid_at', f.last_paid_at
            )
            ELSE NULL
          END
        )
      ),
      '[]'::jsonb
    )
  INTO v_subscriptions
  FROM filtered_subs f;

  RETURN jsonb_build_object(
    'subscriptions', COALESCE(v_subscriptions, '[]'::jsonb),
    'total_count', COALESCE(v_total_count, 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_subscriptions(text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_subscriptions(text, text, text, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
