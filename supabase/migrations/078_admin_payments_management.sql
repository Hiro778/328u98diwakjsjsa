-- ============================================================
-- 078_admin_payments_management.sql
-- BisnisSehat - Tahap 8: Admin Payments Management
-- Conforms strictly to @8.md & Context7 Supabase Guidelines:
-- - Server-Side Authorization via public.is_admin()
-- - SECURITY DEFINER, SET search_path = ''
-- - Database-side search, filters (type, provider, method, status), sorting & pagination
-- - Unified payment aggregation across public.payments and public.subscription_payments
-- - READ-ONLY monitoring first: safe sanitized response, zero secrets exposed
-- ============================================================

-- 1. Optimized Indexes for Payment Queries
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(payment_provider);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(payment_method);

CREATE INDEX IF NOT EXISTS idx_sub_payments_created_at ON public.subscription_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON public.subscription_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_method ON public.subscription_payments(payment_method);

-- 2. Admin Payment Metrics RPC
CREATE OR REPLACE FUNCTION public.get_admin_payment_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_total_payments bigint := 0;
  v_order_payments_count bigint := 0;
  v_sub_payments_count bigint := 0;
  v_paid_count bigint := 0;
  v_pending_count bigint := 0;
  v_failed_count bigint := 0;
  v_refunded_count bigint := 0;
  v_total_gross_amount numeric := 0;
  v_today_gross_amount numeric := 0;
  v_month_gross_amount numeric := 0;
  v_today_start timestamptz;
  v_month_start timestamptz;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses payments management'
      USING ERRCODE = '42501';
  END IF;

  v_today_start := date_trunc('day', now());
  v_month_start := date_trunc('month', now());

  -- Metrics from public.payments (Order/POS)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE payment_status IN ('paid', 'settlement')),
    COUNT(*) FILTER (WHERE payment_status IN ('pending')),
    COUNT(*) FILTER (WHERE payment_status IN ('failed', 'cancel', 'expire', 'deny', 'dibatalkan')),
    COUNT(*) FILTER (WHERE payment_status IN ('refund', 'refunded')),
    COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement')), 0),
    COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement') AND created_at >= v_today_start), 0),
    COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement') AND created_at >= v_month_start), 0)
  INTO
    v_order_payments_count,
    v_paid_count,
    v_pending_count,
    v_failed_count,
    v_refunded_count,
    v_total_gross_amount,
    v_today_gross_amount,
    v_month_gross_amount
  FROM public.payments;

  -- Metrics from public.subscription_payments (Subscriptions)
  SELECT
    COUNT(*),
    v_paid_count + COUNT(*) FILTER (WHERE payment_status IN ('paid', 'settlement', 'capture')),
    v_pending_count + COUNT(*) FILTER (WHERE payment_status IN ('pending')),
    v_failed_count + COUNT(*) FILTER (WHERE payment_status IN ('failed', 'cancel', 'expire', 'deny')),
    v_refunded_count + COUNT(*) FILTER (WHERE payment_status IN ('refund', 'refunded')),
    v_total_gross_amount + COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement', 'capture')), 0),
    v_today_gross_amount + COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement', 'capture') AND created_at >= v_today_start), 0),
    v_month_gross_amount + COALESCE(SUM(gross_amount) FILTER (WHERE payment_status IN ('paid', 'settlement', 'capture') AND created_at >= v_month_start), 0)
  INTO
    v_sub_payments_count,
    v_paid_count,
    v_pending_count,
    v_failed_count,
    v_refunded_count,
    v_total_gross_amount,
    v_today_gross_amount,
    v_month_gross_amount
  FROM public.subscription_payments;

  v_total_payments := v_order_payments_count + v_sub_payments_count;

  RETURN jsonb_build_object(
    'total_payments', v_total_payments,
    'order_payments_count', v_order_payments_count,
    'subscription_payments_count', v_sub_payments_count,
    'paid_count', v_paid_count,
    'pending_count', v_pending_count,
    'failed_count', v_failed_count,
    'refunded_count', v_refunded_count,
    'total_gross_amount', v_total_gross_amount,
    'today_gross_amount', v_today_gross_amount,
    'month_gross_amount', v_month_gross_amount
  );
END;
$$;

-- 3. Admin Unified Payments Paginated Query RPC
CREATE OR REPLACE FUNCTION public.get_admin_payments(
  p_payment_type text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_payment_provider text DEFAULT 'all',
  p_payment_method text DEFAULT 'all',
  p_payment_status text DEFAULT 'all',
  p_transaction_status text DEFAULT 'all',
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
  v_records jsonb;
  v_total_count bigint;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses payments management'
      USING ERRCODE = '42501';
  END IF;

  -- Build Unified Filtered Common Table Expression
  WITH unified_payments AS (
    -- 1. Order/POS Payments
    SELECT
      p.id AS payment_id,
      'order'::text AS payment_type,
      p.order_id,
      ord.order_number,
      NULL::uuid AS subscription_id,
      NULL::text AS subscription_plan,
      biz.owner_id AS user_id,
      COALESCE(prof.full_name, '—') AS user_name,
      COALESCE(prof.email, '—') AS user_email,
      p.business_id,
      COALESCE(biz.name, '—') AS business_name,
      COALESCE(NULLIF(p.payment_provider, ''), 'manual') AS payment_provider,
      COALESCE(NULLIF(p.payment_method, ''), '—') AS payment_method,
      COALESCE(NULLIF(p.transaction_id, ''), ord.payment_ref, '') AS transaction_id,
      CASE WHEN p.payment_provider = 'midtrans' THEN p.transaction_id ELSE NULL END AS midtrans_order_id,
      p.gross_amount,
      p.payment_status,
      COALESCE(p.transaction_status, '') AS transaction_status,
      p.paid_at,
      p.created_at,
      p.updated_at
    FROM public.payments p
    LEFT JOIN public.orders ord ON ord.id = p.order_id
    LEFT JOIN public.businesses biz ON biz.id = p.business_id
    LEFT JOIN public.profiles prof ON prof.id = biz.owner_id
    WHERE (p_payment_type = 'all' OR p_payment_type = 'order')

    UNION ALL

    -- 2. Subscription Payments
    SELECT
      sp.id AS payment_id,
      'subscription'::text AS payment_type,
      NULL::uuid AS order_id,
      NULL::integer AS order_number,
      sp.subscription_id,
      sub.plan AS subscription_plan,
      sp.profile_id AS user_id,
      COALESCE(prof.full_name, '—') AS user_name,
      COALESCE(prof.email, '—') AS user_email,
      COALESCE(sub.business_id, def_biz.id) AS business_id,
      COALESCE(biz.name, def_biz.name, '—') AS business_name,
      'midtrans'::text AS payment_provider,
      COALESCE(NULLIF(sp.payment_method, ''), 'snap') AS payment_method,
      sp.midtrans_order_id AS transaction_id,
      sp.midtrans_order_id AS midtrans_order_id,
      sp.gross_amount,
      sp.payment_status,
      COALESCE(sp.transaction_status, '') AS transaction_status,
      sp.paid_at,
      sp.created_at,
      sp.updated_at
    FROM public.subscription_payments sp
    LEFT JOIN public.subscriptions sub ON sub.id = sp.subscription_id
    LEFT JOIN public.profiles prof ON prof.id = sp.profile_id
    LEFT JOIN public.businesses biz ON biz.id = sub.business_id
    LEFT JOIN LATERAL (
      SELECT bz.id, bz.name
      FROM public.businesses bz
      WHERE bz.owner_id = sp.profile_id
      ORDER BY bz.created_at ASC
      LIMIT 1
    ) def_biz ON sub.business_id IS NULL
    WHERE (p_payment_type = 'all' OR p_payment_type = 'subscription')
  ),
  filtered_payments AS (
    SELECT *
    FROM unified_payments up
    WHERE
      -- Provider Filter
      (p_payment_provider = 'all' OR LOWER(up.payment_provider) = LOWER(p_payment_provider))
      -- Method Filter
      AND (p_payment_method = 'all' OR LOWER(up.payment_method) = LOWER(p_payment_method))
      -- Status Filter
      AND (
        p_payment_status = 'all'
        OR (p_payment_status = 'paid' AND up.payment_status IN ('paid', 'settlement', 'capture'))
        OR (p_payment_status = 'pending' AND up.payment_status = 'pending')
        OR (p_payment_status = 'failed' AND up.payment_status IN ('failed', 'cancel', 'expire', 'deny', 'dibatalkan'))
        OR (p_payment_status = 'refunded' AND up.payment_status IN ('refund', 'refunded'))
        OR LOWER(up.payment_status) = LOWER(p_payment_status)
      )
      -- Transaction Status Filter
      AND (
        p_transaction_status = 'all'
        OR LOWER(up.transaction_status) = LOWER(p_transaction_status)
      )
      -- Date Range Filter
      AND (p_date_from IS NULL OR up.created_at >= p_date_from)
      AND (p_date_to IS NULL OR up.created_at <= p_date_to)
      -- Search Query (payment ID, order ID, transaction ID, Midtrans ID, email, name, business)
      AND (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR up.payment_id::text ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.order_id::text, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.subscription_id::text, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.midtrans_order_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR up.user_email ILIKE '%' || TRIM(p_search) || '%'
        OR up.user_name ILIKE '%' || TRIM(p_search) || '%'
        OR up.business_name ILIKE '%' || TRIM(p_search) || '%'
      )
  )
  SELECT COUNT(*) INTO v_total_count FROM filtered_payments;

  WITH filtered_payments AS (
    SELECT *
    FROM unified_payments up
    WHERE
      (p_payment_provider = 'all' OR LOWER(up.payment_provider) = LOWER(p_payment_provider))
      AND (p_payment_method = 'all' OR LOWER(up.payment_method) = LOWER(p_payment_method))
      AND (
        p_payment_status = 'all'
        OR (p_payment_status = 'paid' AND up.payment_status IN ('paid', 'settlement', 'capture'))
        OR (p_payment_status = 'pending' AND up.payment_status = 'pending')
        OR (p_payment_status = 'failed' AND up.payment_status IN ('failed', 'cancel', 'expire', 'deny', 'dibatalkan'))
        OR (p_payment_status = 'refunded' AND up.payment_status IN ('refund', 'refunded'))
        OR LOWER(up.payment_status) = LOWER(p_payment_status)
      )
      AND (
        p_transaction_status = 'all'
        OR LOWER(up.transaction_status) = LOWER(p_transaction_status)
      )
      AND (p_date_from IS NULL OR up.created_at >= p_date_from)
      AND (p_date_to IS NULL OR up.created_at <= p_date_to)
      AND (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR up.payment_id::text ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.order_id::text, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.subscription_id::text, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(up.midtrans_order_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR up.user_email ILIKE '%' || TRIM(p_search) || '%'
        OR up.user_name ILIKE '%' || TRIM(p_search) || '%'
        OR up.business_name ILIKE '%' || TRIM(p_search) || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(sub_query), '[]'::jsonb)
  INTO v_records
  FROM (
    SELECT
      payment_id,
      payment_type,
      order_id,
      order_number,
      subscription_id,
      subscription_plan,
      user_id,
      user_name,
      user_email,
      business_id,
      business_name,
      payment_provider,
      payment_method,
      transaction_id,
      midtrans_order_id,
      gross_amount,
      payment_status,
      transaction_status,
      paid_at,
      created_at,
      updated_at
    FROM filtered_payments
    ORDER BY
      CASE WHEN p_sort = 'newest' THEN created_at END DESC NULLS LAST,
      CASE WHEN p_sort = 'oldest' THEN created_at END ASC NULLS LAST,
      CASE WHEN p_sort = 'amount_desc' THEN gross_amount END DESC NULLS LAST,
      CASE WHEN p_sort = 'amount_asc' THEN gross_amount END ASC NULLS LAST,
      created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    OFFSET GREATEST(0, p_offset)
  ) sub_query;

  RETURN jsonb_build_object(
    'records', v_records,
    'total_count', v_total_count,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

-- 4. Admin Payment Detail Query RPC with Sanitization
CREATE OR REPLACE FUNCTION public.get_admin_payment_detail(
  p_payment_id uuid,
  p_payment_type text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_result jsonb;
  v_resolved_type text;
BEGIN
  -- Strict Server-Side Authorization Check
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat detail payment'
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_UUID: Payment ID wajib diisi'
      USING ERRCODE = '22023';
  END IF;

  v_resolved_type := LOWER(COALESCE(p_payment_type, 'auto'));

  -- Auto-detect type if 'auto'
  IF v_resolved_type = 'auto' THEN
    IF EXISTS (SELECT 1 FROM public.payments WHERE id = p_payment_id) THEN
      v_resolved_type := 'order';
    ELSIF EXISTS (SELECT 1 FROM public.subscription_payments WHERE id = p_payment_id) THEN
      v_resolved_type := 'subscription';
    ELSE
      RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Pembayaran dengan ID % tidak ditemukan', p_payment_id
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 1. Order Payment Detail
  IF v_resolved_type = 'order' THEN
    SELECT jsonb_build_object(
      'id', p.id,
      'payment_type', 'order',
      'order_id', p.order_id,
      'order_number', ord.order_number,
      'order_status', ord.order_status,
      'customer_name', ord.customer_name,
      'order_source', ord.order_source,
      'business_id', p.business_id,
      'business_name', COALESCE(biz.name, '—'),
      'user_id', biz.owner_id,
      'user_name', COALESCE(prof.full_name, '—'),
      'user_email', COALESCE(prof.email, '—'),
      'payment_provider', COALESCE(NULLIF(p.payment_provider, ''), 'manual'),
      'payment_method', COALESCE(NULLIF(p.payment_method, ''), '—'),
      'transaction_id', COALESCE(NULLIF(p.transaction_id, ''), ord.payment_ref, ''),
      'gross_amount', p.gross_amount,
      'payment_status', p.payment_status,
      'transaction_status', COALESCE(p.transaction_status, ''),
      'paid_at', p.paid_at,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      -- Sanitized safe metadata from raw_response: NEVER expose keys, tokens, or auth headers
      'safe_metadata', jsonb_strip_nulls(
        COALESCE(p.raw_response, '{}'::jsonb) - ARRAY[
          'server_key', 'client_key', 'authorization', 'secret', 'password', 'token',
          'access_token', 'apiKey', 'api_key', 'signature_key'
        ]
      )
    )
    INTO v_result
    FROM public.payments p
    LEFT JOIN public.orders ord ON ord.id = p.order_id
    LEFT JOIN public.businesses biz ON biz.id = p.business_id
    LEFT JOIN public.profiles prof ON prof.id = biz.owner_id
    WHERE p.id = p_payment_id;

    IF v_result IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Order payment tidak ditemukan' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_result;

  -- 2. Subscription Payment Detail
  ELSIF v_resolved_type = 'subscription' THEN
    SELECT jsonb_build_object(
      'id', sp.id,
      'payment_type', 'subscription',
      'subscription_id', sp.subscription_id,
      'subscription_plan', sub.plan,
      'subscription_status', sub.status,
      'profile_id', sp.profile_id,
      'user_id', sp.profile_id,
      'user_name', COALESCE(prof.full_name, '—'),
      'user_email', COALESCE(prof.email, '—'),
      'business_id', COALESCE(sub.business_id, def_biz.id),
      'business_name', COALESCE(biz.name, def_biz.name, '—'),
      'payment_provider', 'midtrans',
      'payment_method', COALESCE(NULLIF(sp.payment_method, ''), 'snap'),
      'transaction_id', sp.midtrans_order_id,
      'midtrans_order_id', sp.midtrans_order_id,
      'gross_amount', sp.gross_amount,
      'payment_status', sp.payment_status,
      'transaction_status', COALESCE(sp.transaction_status, ''),
      'period_start', sp.period_start,
      'period_end', sp.period_end,
      'paid_at', sp.paid_at,
      'created_at', sp.created_at,
      'updated_at', sp.updated_at,
      -- Sanitized safe metadata: strip secret tokens, signatures, and credentials
      'safe_metadata', jsonb_strip_nulls(
        COALESCE(sp.raw_response, '{}'::jsonb) - ARRAY[
          'server_key', 'client_key', 'authorization', 'secret', 'password', 'token',
          'access_token', 'apiKey', 'api_key', 'signature_key'
        ]
      )
    )
    INTO v_result
    FROM public.subscription_payments sp
    LEFT JOIN public.subscriptions sub ON sub.id = sp.subscription_id
    LEFT JOIN public.profiles prof ON prof.id = sp.profile_id
    LEFT JOIN public.businesses biz ON biz.id = sub.business_id
    LEFT JOIN LATERAL (
      SELECT bz.id, bz.name
      FROM public.businesses bz
      WHERE bz.owner_id = sp.profile_id
      ORDER BY bz.created_at ASC
      LIMIT 1
    ) def_biz ON sub.business_id IS NULL
    WHERE sp.id = p_payment_id;

    IF v_result IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Subscription payment tidak ditemukan' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_result;

  ELSE
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE: Tipe pembayaran tidak valid. Gunakan auto, order, atau subscription'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- 5. Revoke & Grant Access strictly following Principle of Least Privilege
REVOKE EXECUTE ON FUNCTION public.get_admin_payment_metrics() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_payments(text, text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_payment_detail(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_admin_payment_metrics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_payments(text, text, text, text, text, text, timestamptz, timestamptz, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_detail(uuid, text) TO authenticated, service_role;
