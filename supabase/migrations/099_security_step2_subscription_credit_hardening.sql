-- ============================================================
-- 098_security_step2_subscription_credit_hardening.sql
-- BisnisSehat: Security Fix Step 2 — Subscription, Credit & RPC Hardening
-- Conforms strictly to phase2.md specifications:
-- 1. FIX LEGACY DEFAULT 'pro'
-- 2. FIX SUBSCRIPTION CANCELLATION STATE
-- 3. FIX BASIC verify_payment AMOUNT BUG (Edge Function)
-- 4. CREDIT_LEDGER IDEMPOTENCY (UNIQUE index)
-- 5. FIX CROSS-USER SUBSCRIPTION RPC PROBING (Strict auth & IDOR protection)
-- 6. BASIC CANCELLATION PATH (Supports Basic and Pro cancellations)
-- 7. MANUAL ACTIVATION REGRESSION (Preserves manual code & link activations)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. FIX LEGACY DEFAULT 'pro'
-- ────────────────────────────────────────────────────
-- Ensure subscription_payments and subscriptions do NOT default to 'pro'
-- User baru tidak boleh otomatis menjadi Pro.
ALTER TABLE public.subscription_payments ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE public.subscription_payments ALTER COLUMN plan SET DEFAULT 'basic';

ALTER TABLE public.subscriptions ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'free';

-- Ensure subscriptions table has is_cancelled column
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- 2. CREDIT_LEDGER IDEMPOTENCY
-- ────────────────────────────────────────────────────────────
-- Ensure explicit UNIQUE index on idempotency_key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_ledger'::regclass
      AND contype = 'u'
      AND conname = 'credit_ledger_idempotency_key_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'credit_ledger'
      AND indexname = 'idx_credit_ledger_idempotency_key'
  ) THEN
    CREATE UNIQUE INDEX idx_credit_ledger_idempotency_key
      ON public.credit_ledger(idempotency_key)
      WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. HARDENED ENTITLEMENT RPCS (CROSS-USER PROBING & CANCELLATION SAFE)
-- ────────────────────────────────────────────────────────────

-- 3.1. get_user_active_plan: Only own user or admin; ignores cancelled
CREATE OR REPLACE FUNCTION public.get_user_active_plan(p_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_id uuid;
  v_is_service_role boolean;
  v_is_adm boolean;
  v_plan text;
BEGIN
  v_is_service_role := current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_target_id := COALESCE(p_user_id, v_caller_id);

    IF v_target_id <> v_caller_id THEN
      v_is_adm := public.is_admin();
      IF NOT v_is_adm THEN
        RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk status pengguna lain' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    v_target_id := p_user_id;
  END IF;

  IF v_target_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.plan INTO v_plan
  FROM public.subscriptions s
  WHERE s.profile_id = v_target_id
    AND s.status = 'active'
    AND COALESCE(s.is_cancelled, false) = false
    AND LOWER(s.plan) IN ('basic', 'pro')
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY 
    CASE WHEN LOWER(s.plan) = 'pro' THEN 1 ELSE 2 END,
    s.created_at DESC
  LIMIT 1;

  RETURN v_plan;
END;
$$;

-- 3.2. is_user_pro_active: Only own user or admin; ignores cancelled
CREATE OR REPLACE FUNCTION public.is_user_pro_active(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_id uuid;
  v_is_service_role boolean;
  v_is_adm boolean;
  v_exists boolean;
BEGIN
  v_is_service_role := current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_target_id := COALESCE(p_user_id, v_caller_id);

    IF v_target_id <> v_caller_id THEN
      v_is_adm := public.is_admin();
      IF NOT v_is_adm THEN
        RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk status pengguna lain' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    v_target_id := p_user_id;
  END IF;

  IF v_target_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = v_target_id
      AND LOWER(s.plan) = 'pro'
      AND s.status = 'active'
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- 3.3. is_user_subscription_active: Only own user or admin; ignores cancelled
CREATE OR REPLACE FUNCTION public.is_user_subscription_active(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_target_id uuid;
  v_is_service_role boolean;
  v_is_adm boolean;
  v_exists boolean;
BEGIN
  v_is_service_role := current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_target_id := COALESCE(p_user_id, v_caller_id);

    IF v_target_id <> v_caller_id THEN
      v_is_adm := public.is_admin();
      IF NOT v_is_adm THEN
        RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk status pengguna lain' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    v_target_id := p_user_id;
  END IF;

  IF v_target_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.profile_id = v_target_id
      AND LOWER(s.plan) IN ('basic', 'pro')
      AND s.status = 'active'
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- 3.4. is_business_pro_active: Only business owner or admin
CREATE OR REPLACE FUNCTION public.is_business_pro_active(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean;
  v_is_adm boolean;
  v_exists boolean;
BEGIN
  v_is_service_role := current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_is_adm := public.is_admin();
    IF NOT v_is_adm AND NOT EXISTS (
      SELECT 1 FROM public.businesses WHERE id = p_business_id AND owner_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk bisnis pengguna lain' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.subscriptions s ON s.profile_id = b.owner_id
    WHERE b.id = p_business_id
      AND LOWER(s.plan) = 'pro'
      AND s.status = 'active'
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- 3.5. is_business_subscription_active: Only business owner or admin
CREATE OR REPLACE FUNCTION public.is_business_subscription_active(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean;
  v_is_adm boolean;
  v_exists boolean;
BEGIN
  v_is_service_role := current_user IN ('postgres', 'service_role', 'supabase_admin')
    OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR auth.role() = 'service_role';

  IF NOT v_is_service_role THEN
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
    END IF;

    v_is_adm := public.is_admin();
    IF NOT v_is_adm AND NOT EXISTS (
      SELECT 1 FROM public.businesses WHERE id = p_business_id AND owner_id = v_caller_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk bisnis pengguna lain' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.businesses b
    JOIN public.subscriptions s ON s.profile_id = b.owner_id
    WHERE b.id = p_business_id
      AND LOWER(s.plan) IN ('basic', 'pro')
      AND s.status = 'active'
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. HARDENED CANCELLATION RPC (BASIC & PRO, CANONICAL STATE)
-- ────────────────────────────────────────────────────────────

-- 4.1. Overload (p_business_id uuid, p_reason text DEFAULT '')
CREATE OR REPLACE FUNCTION public.cancel_subscription_atomic(
  p_business_id uuid,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub_id uuid;
  v_plan text;
  v_status text;
  v_expires_at timestamptz;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi pembatalan dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 1. Verify caller session
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi login diperlukan untuk membatalkan langganan'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Strictly verify account access
  IF NOT public.is_account_access_allowed(v_caller_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Verify business ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND owner_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk bisnis ini'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Query active subscription (supports BOTH 'basic' and 'pro')
  SELECT id, plan, status, expires_at
  INTO v_sub_id, v_plan, v_status, v_expires_at
  FROM public.subscriptions
  WHERE profile_id = v_caller_id
    AND LOWER(plan) IN ('basic', 'pro')
    AND status = 'active'
    AND COALESCE(is_cancelled, false) = false
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- If no active subscription found, check if already cancelled (idempotent)
  IF v_sub_id IS NULL THEN
    SELECT id, plan, expires_at
    INTO v_sub_id, v_plan, v_expires_at
    FROM public.subscriptions
    WHERE profile_id = v_caller_id
      AND LOWER(plan) IN ('basic', 'pro')
      AND (status = 'cancelled' OR is_cancelled = true)
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_sub_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'status', 'cancelled',
        'is_active', false,
        'already_cancelled', true,
        'expires_at', v_expires_at,
        'message', 'Langganan sudah dalam status dibatalkan sebelumnya.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_ACTIVE_SUBSCRIPTION',
      'message', 'Tidak ditemukan langganan aktif untuk dibatalkan.'
    );
  END IF;

  -- 5. Canonical Cancellation Update
  -- Sets status = 'cancelled' AND is_cancelled = true
  -- Preserves expires_at (no truncated paid period, no fake refund)
  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    is_cancelled = true,
    cancelled_at = now(),
    cancelled_by = v_caller_id,
    cancellation_reason = COALESCE(p_reason, ''),
    updated_at = now()
  WHERE id = v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'plan', v_plan,
    'status', 'cancelled',
    'is_active', false,
    'is_cancelled', true,
    'cancelled_at', now(),
    'expires_at', v_expires_at,
    'message', 'Langganan ' || UPPER(v_plan) || ' berhasil dihentikan.'
  );
END;
$$;

-- 4.2. Overload (p_subscription_id uuid, p_business_id uuid DEFAULT NULL)
CREATE OR REPLACE FUNCTION public.cancel_subscription_atomic(
  p_subscription_id uuid,
  p_business_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_sub record;
  v_business_owner_id uuid;
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi pembatalan dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 1. Verify caller session
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Sesi login diperlukan untuk membatalkan langganan'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify account access
  IF NOT public.is_account_access_allowed(v_caller_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Load subscription
  SELECT id, profile_id, business_id, plan, status, started_at, expires_at, cancelled_at, is_cancelled
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Verify ownership
  IF v_sub.profile_id <> v_caller_id THEN
    IF v_sub.business_id IS NOT NULL THEN
      SELECT owner_id INTO v_business_owner_id
      FROM public.businesses
      WHERE id = v_sub.business_id;

      IF v_business_owner_id <> v_caller_id THEN
        RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik langganan ini' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik langganan ini' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- If explicit business_id was passed, verify match
  IF p_business_id IS NOT NULL AND v_sub.business_id IS NOT NULL AND v_sub.business_id <> p_business_id THEN
    RAISE EXCEPTION 'Akses ditolak: ID Bisnis tidak sesuai dengan data langganan' USING ERRCODE = '42501';
  END IF;

  -- 5. Idempotent check
  IF v_sub.status = 'cancelled' OR v_sub.is_cancelled = true THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'cancelled',
      'is_active', false,
      'subscription_id', v_sub.id,
      'plan', v_sub.plan,
      'already_cancelled', true,
      'cancelled_at', v_sub.cancelled_at,
      'expires_at', v_sub.expires_at,
      'message', 'Langganan sudah dalam status dihentikan sebelumnya'
    );
  END IF;

  -- 6. Canonical Update: Set status = 'cancelled' AND is_cancelled = true
  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    is_cancelled = true,
    cancelled_at = now(),
    cancelled_by = v_caller_id,
    updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'cancelled',
    'is_active', false,
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'is_cancelled', true,
    'cancelled_at', now(),
    'expires_at', v_sub.expires_at,
    'message', 'Langganan ' || UPPER(v_sub.plan) || ' berhasil dihentikan'
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. PERMISSIONS RE-LOCKDOWN
-- ────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_user_active_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_pro_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_subscription_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_pro_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_subscription_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_subscription_atomic(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_subscription_atomic(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_active_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_pro_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_subscription_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_business_pro_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_business_subscription_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_atomic(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_atomic(uuid, uuid) TO authenticated, service_role;
