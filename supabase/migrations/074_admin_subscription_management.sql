-- ============================================================
-- 074_admin_subscription_management.sql
-- BisnisSehat - Tahap 5: Admin Subscription Management
-- Conforms strictly to @qr.md Stage 5 & Context7 Supabase Guidelines:
-- - Server-side authorization via public.is_admin()
-- - SECURITY DEFINER with search_path = '' and fully qualified names
-- - Server-side search, plan filter, status filter, sort, and pagination
-- - Clean audit logging for subscription cancellations
-- ============================================================

-- 1. RPC: get_admin_subscriptions (Search, Filter, Sort, Paginate)
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

-- 2. RPC: get_admin_subscription_detail
CREATE OR REPLACE FUNCTION public.get_admin_subscription_detail(
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_sub record;
  v_owner jsonb;
  v_business jsonb;
  v_payments jsonb;
  v_audit_logs jsonb;
  v_computed_status text;
BEGIN
  -- 1. Authorization
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat detail subscription'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch Subscription Row
  SELECT *
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Langganan tidak ditemukan'
      USING ERRCODE = 'P0002';
  END IF;

  -- Compute status
  IF v_sub.status = 'cancelled' THEN
    v_computed_status := 'cancelled';
  ELSIF v_sub.status = 'active' AND v_sub.expires_at IS NOT NULL AND v_sub.expires_at <= NOW() THEN
    v_computed_status := 'expired';
  ELSE
    v_computed_status := v_sub.status;
  END IF;

  -- 3. Fetch Owner Profile
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', COALESCE(NULLIF(p.full_name, ''), p.email),
    'avatar_url', p.avatar_url,
    'status', p.status,
    'created_at', p.created_at
  )
  INTO v_owner
  FROM public.profiles p
  WHERE p.id = v_sub.profile_id;

  -- 4. Fetch Linked Business
  IF v_sub.business_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'business_type', b.business_type,
      'business_category', b.business_category,
      'is_active', b.is_active,
      'location', b.location
    )
    INTO v_business
    FROM public.businesses b
    WHERE b.id = v_sub.business_id;
  ELSE
    SELECT jsonb_build_object(
      'id', bz.id,
      'name', bz.name,
      'business_type', bz.business_type,
      'business_category', bz.business_category,
      'is_active', bz.is_active,
      'location', bz.location
    )
    INTO v_business
    FROM public.businesses bz
    WHERE bz.owner_id = v_sub.profile_id
    ORDER BY bz.created_at ASC
    LIMIT 1;
  END IF;

  -- 5. Fetch Payment History
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pay.id,
        'midtrans_order_id', pay.midtrans_order_id,
        'gross_amount', pay.gross_amount,
        'payment_method', pay.payment_method,
        'payment_status', pay.payment_status,
        'transaction_status', pay.transaction_status,
        'paid_at', pay.paid_at,
        'period_start', pay.period_start,
        'period_end', pay.period_end,
        'created_at', pay.created_at
      ) ORDER BY pay.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.subscription_payments pay
  WHERE pay.subscription_id = p_subscription_id
     OR (v_sub.profile_id IS NOT NULL AND pay.profile_id = v_sub.profile_id);

  -- 6. Fetch Admin Audit Logs for this subscription
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
  WHERE al.target_type = 'subscription'
    AND al.target_id = p_subscription_id::text;

  RETURN jsonb_build_object(
    'subscription', jsonb_build_object(
      'id', v_sub.id,
      'profile_id', v_sub.profile_id,
      'business_id', v_sub.business_id,
      'plan', v_sub.plan,
      'status', v_computed_status,
      'raw_status', v_sub.status,
      'started_at', v_sub.started_at,
      'expires_at', v_sub.expires_at,
      'payment_provider', v_sub.payment_provider,
      'provider_transaction_id', v_sub.provider_transaction_id,
      'cancelled_at', v_sub.cancelled_at,
      'cancelled_by', v_sub.cancelled_by,
      'created_at', v_sub.created_at,
      'updated_at', v_sub.updated_at
    ),
    'owner', v_owner,
    'business', v_business,
    'payments', v_payments,
    'audit_logs', v_audit_logs
  );
END;
$$;

-- 3. RPC: admin_cancel_subscription
CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(
  p_subscription_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid;
  v_is_adm boolean;
  v_sub record;
BEGIN
  -- 1. Verify admin session
  v_admin_id := (SELECT auth.uid());
  v_is_adm := public.is_admin();

  IF v_admin_id IS NULL OR NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang berhak membatalkan langganan'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate reason
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_REASON: Alasan pembatalan langganan wajib diisi.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Load subscription
  SELECT id, profile_id, business_id, plan, status, expires_at
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Langganan tidak ditemukan'
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Idempotent check: If already cancelled
  IF v_sub.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'subscription_id', p_subscription_id,
      'already_cancelled', true,
      'message', 'Langganan sudah dalam status dibatalkan sebelumnya.'
    );
  END IF;

  -- 5. Atomic Update
  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_by = v_admin_id,
    updated_at = NOW()
  WHERE id = p_subscription_id;

  -- 6. Record Audit Log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    metadata
  ) VALUES (
    v_admin_id,
    'CANCEL_SUBSCRIPTION',
    'subscription',
    p_subscription_id::text,
    TRIM(p_reason),
    jsonb_build_object(
      'previous_status', v_sub.status,
      'plan', v_sub.plan,
      'expires_at', v_sub.expires_at,
      'profile_id', v_sub.profile_id,
      'business_id', v_sub.business_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'already_cancelled', false,
    'message', 'Langganan berhasil dibatalkan.'
  );
END;
$$;

-- 4. Revocation & Grants
REVOKE EXECUTE ON FUNCTION public.get_admin_subscriptions(text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_subscriptions(text, text, text, text, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_subscription_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_subscription_detail(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) TO authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
