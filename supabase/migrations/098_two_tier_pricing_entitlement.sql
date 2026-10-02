-- ============================================================
-- 097_two_tier_pricing_entitlement.sql
-- BisnisSehat: 2-Tier Pricing Model (Basic Rp35K & Pro Rp130K)
-- Conforms strictly to @gas.md specifications:
-- 1. Free plan removed from active entitlement model.
-- 2. Basic (Rp35.000/mo) & Pro (Rp130.000/mo) active tiers.
-- 3. Backward compatibility: existing 'free' subscriptions preserved as legacy.
-- 4. Server-side enforcement for Pro and Basic tiers.
-- ============================================================

-- 1. Add plan column to subscription_payments if not exists
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'pro';

-- 2. Helper function: Check if business has an active Pro subscription
CREATE OR REPLACE FUNCTION public.is_business_pro_active(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.subscriptions s ON s.profile_id = b.owner_id
    WHERE b.id = p_business_id
      AND LOWER(s.plan) = 'pro'
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );
$$;

-- 3. Helper function: Check if business has ANY active subscription (Basic or Pro)
CREATE OR REPLACE FUNCTION public.is_business_subscription_active(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.subscriptions s ON s.profile_id = b.owner_id
    WHERE b.id = p_business_id
      AND LOWER(s.plan) IN ('basic', 'pro')
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );
$$;

-- 4. Helper function: Check user's active plan ('pro', 'basic', or NULL)
CREATE OR REPLACE FUNCTION public.get_user_active_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT s.plan
  FROM public.subscriptions s
  WHERE s.profile_id = p_user_id
    AND s.status = 'active'
    AND LOWER(s.plan) IN ('basic', 'pro')
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY 
    CASE WHEN LOWER(s.plan) = 'pro' THEN 1 ELSE 2 END,
    s.created_at DESC
  LIMIT 1;
$$;

-- 5. Helper function: Check if user has active Pro
CREATE OR REPLACE FUNCTION public.is_user_pro_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = p_user_id
      AND LOWER(s.plan) = 'pro'
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );
$$;

-- 6. Helper function: Check if user has active Basic or Pro
CREATE OR REPLACE FUNCTION public.is_user_subscription_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = p_user_id
      AND LOWER(s.plan) IN ('basic', 'pro')
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  );
$$;

-- 7. Update get_admin_subscriptions RPC to support 'basic', 'pro', 'free', and 'all'
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
  -- Strict Server-Side Admin Authorization
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mengakses subscription management'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Calculate total matching count
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
    (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR s.id::text ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(s.provider_transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(b.name, def_biz.name, '') ILIKE '%' || TRIM(p_search) || '%'
    )
    AND (
      p_plan_filter = 'all'
      OR LOWER(s.plan) = LOWER(p_plan_filter)
    )
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

  -- 2. Query paginated subscriptions
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
      s.cancelled_at,
      s.cancellation_reason,
      p.email AS user_email,
      p.full_name AS user_full_name,
      COALESCE(b.id, def_biz.id) AS business_id,
      COALESCE(b.name, def_biz.name, 'Belum Ada Bisnis') AS business_name,
      CASE
        WHEN s.status = 'cancelled' THEN 'cancelled'
        WHEN s.status = 'active' AND s.expires_at IS NOT NULL AND s.expires_at <= NOW() THEN 'expired'
        WHEN s.status = 'active' THEN 'active'
        ELSE s.status
      END AS computed_status,
      COALESCE(pay.latest_amount, 
        CASE 
          WHEN LOWER(s.plan) = 'basic' THEN 35000 
          WHEN LOWER(s.plan) = 'pro' THEN 130000 
          ELSE 0 
        END
      ) AS latest_payment_amount,
      pay.latest_payment_status,
      pay.latest_paid_at
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
      SELECT
        sp.gross_amount AS latest_amount,
        sp.payment_status AS latest_payment_status,
        sp.paid_at AS latest_paid_at
      FROM public.subscription_payments sp
      WHERE sp.subscription_id = s.id
      ORDER BY sp.created_at DESC
      LIMIT 1
    ) pay ON true
    WHERE
      (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR s.id::text ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(s.provider_transaction_id, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.email, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(b.name, def_biz.name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
      AND (
        p_plan_filter = 'all'
        OR LOWER(s.plan) = LOWER(p_plan_filter)
      )
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
      CASE WHEN p_sort_by = 'newest' THEN s.created_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'oldest' THEN s.created_at END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'expires_soon' THEN s.expires_at END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'expires_late' THEN s.expires_at END DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(fs)), '[]'::jsonb)
  INTO v_subscriptions
  FROM filtered_subs fs;

  RETURN jsonb_build_object(
    'subscriptions', v_subscriptions,
    'total_count', v_total_count
  );
END;
$$;
