-- ============================================================================
-- Migration 101: Fix Subscription Lifecycle, Ambiguity, and Canonical Resolution
-- ============================================================================
-- 1. Ensure public.subscriptions columns (cancellation_reason, is_cancelled) exist
-- 2. Harden redeem_pro_activation_code with deterministic canonical ordering,
--    explicit is_cancelled=false reset, and duplicate row consolidation
-- 3. Harden cancel_subscription_atomic & get_user_active_plan ordering
-- ============================================================================

-- 1. Schema Safety
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 2. Hardened redeem_pro_activation_code
CREATE OR REPLACE FUNCTION public.redeem_pro_activation_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_user_email text;
  v_normalized_code text;
  v_code_hash text;
  v_code_row record;
  v_business_id uuid;
  v_existing_sub record;
  v_new_expires_at timestamptz;
  v_rate_row record;
  c_max_attempts constant integer := 5;
  c_lock_duration constant interval := interval '15 minutes';
BEGIN
  -- 0. Server-Side Maintenance Mode Enforcement
  IF COALESCE((SELECT (value#>>'{}')::boolean FROM public.platform_settings WHERE key = 'maintenance_mode'), false) IS TRUE THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'MAINTENANCE_MODE: Sistem sedang dalam mode pemeliharaan (maintenance mode). Operasi aktivasi dibatasi untuk administrator.'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 1. Must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Anda harus login untuk mengaktifkan kode PRO'
      USING ERRCODE = '42501';
  END IF;

  -- Verify account access (reject banned/suspended users)
  IF NOT public.is_account_access_allowed(v_caller_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir'
      USING ERRCODE = '42501';
  END IF;

  -- Fetch user email from auth.users (never trust frontend input)
  SELECT lower(trim(email)) INTO v_user_email
  FROM auth.users
  WHERE id = v_caller_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Email pengguna tidak valid atau akun belum memiliki email terdaftar'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Server-side Rate Limiting Check
  SELECT * INTO v_rate_row
  FROM public.pro_activation_rate_limits
  WHERE user_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_rate_row.locked_until IS NOT NULL AND v_rate_row.locked_until > now() THEN
      RAISE EXCEPTION 'Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.'
        USING ERRCODE = '42501';
    END IF;

    IF v_rate_row.first_failed_at + c_lock_duration < now() THEN
      UPDATE public.pro_activation_rate_limits
      SET failed_attempts = 0, first_failed_at = now(), last_failed_at = now(), locked_until = NULL
      WHERE user_id = v_caller_id;
      v_rate_row.failed_attempts := 0;
    END IF;
  END IF;

  -- 3. Input Validation & Safe Normalization
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RAISE EXCEPTION 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.'
      USING ERRCODE = 'P0001';
  END IF;

  v_normalized_code := UPPER(TRIM(p_code));

  IF LENGTH(v_normalized_code) > 100 OR LENGTH(v_normalized_code) < 10 THEN
    INSERT INTO public.pro_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.pro_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.pro_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RAISE EXCEPTION 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Server-Side Cryptographic Hash (SHA-256)
  v_code_hash := encode(sha256(v_normalized_code::bytea), 'hex');

  -- 5. Row-level Lock (FOR UPDATE)
  SELECT *
  INTO v_code_row
  FROM public.pro_activation_codes
  WHERE code_hash = v_code_hash
  FOR UPDATE;

  -- 6. Validate Code Existence, Status, Expiry
  IF NOT FOUND OR v_code_row.status <> 'unused' OR (v_code_row.expires_at IS NOT NULL AND v_code_row.expires_at < now()) THEN
    INSERT INTO public.pro_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.pro_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.pro_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RAISE EXCEPTION 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. RECIPIENT EMAIL BINDING ENFORCEMENT
  IF v_code_row.target_email IS NOT NULL AND lower(trim(v_code_row.target_email)) <> v_user_email THEN
    INSERT INTO public.pro_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.pro_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.pro_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RAISE EXCEPTION 'Kode aktivasi tidak valid atau tidak ditujukan untuk akun ini.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Reset rate limit on success
  DELETE FROM public.pro_activation_rate_limits WHERE user_id = v_caller_id;

  -- 9. Resolve business ID
  SELECT id INTO v_business_id
  FROM public.businesses
  WHERE owner_id = v_caller_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- 10. Mark code as REDEEMED
  UPDATE public.pro_activation_codes
  SET
    status = 'redeemed',
    redeemed_by = v_caller_id,
    redeemed_business_id = v_business_id,
    redeemed_at = now()
  WHERE id = v_code_row.id;

  -- 11. Grant / Extend PRO Subscription Entitlement with CANONICAL RESOLUTION
  -- Phase 2: Deterministic canonical ordering
  SELECT *
  INTO v_existing_sub
  FROM public.subscriptions
  WHERE profile_id = v_caller_id
  ORDER BY
    CASE
      WHEN status = 'active'
      AND COALESCE(is_cancelled, false) = false
      THEN 1
      ELSE 2
    END,
    expires_at DESC NULLS LAST,
    updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Phase 3: Expiry Accumulation
    -- If existing subscription has expires_at > now(), preserve remaining paid entitlement
    -- regardless of whether the row was previously cancelled.
    IF v_existing_sub.expires_at IS NOT NULL AND v_existing_sub.expires_at > now() THEN
      v_new_expires_at := v_existing_sub.expires_at + (v_code_row.duration_days || ' days')::interval;
    ELSE
      v_new_expires_at := now() + (v_code_row.duration_days || ' days')::interval;
    END IF;

    -- Update canonical subscription to ACTIVE PRO, clearing all cancellation flags
    UPDATE public.subscriptions
    SET
      plan = 'pro',
      status = 'active',
      is_cancelled = false,
      cancellation_reason = NULL,
      cancelled_at = NULL,
      cancelled_by = NULL,
      started_at = COALESCE(v_existing_sub.started_at, now()),
      expires_at = v_new_expires_at,
      business_id = COALESCE(v_existing_sub.business_id, v_business_id),
      payment_provider = 'activation_code',
      provider_transaction_id = 'ACT-' || SUBSTRING(v_code_row.id::text FROM 1 FOR 8),
      updated_at = now()
    WHERE id = v_existing_sub.id;
  ELSE
    v_new_expires_at := now() + (v_code_row.duration_days || ' days')::interval;

    INSERT INTO public.subscriptions (
      profile_id,
      business_id,
      plan,
      status,
      is_cancelled,
      cancelled_at,
      cancelled_by,
      cancellation_reason,
      started_at,
      expires_at,
      payment_provider,
      provider_transaction_id,
      created_at,
      updated_at
    ) VALUES (
      v_caller_id,
      v_business_id,
      'pro',
      'active',
      false,
      NULL,
      NULL,
      NULL,
      now(),
      v_new_expires_at,
      'activation_code',
      'ACT-' || SUBSTRING(v_code_row.id::text FROM 1 FOR 8),
      now(),
      now()
    );
  END IF;

  -- 12. Audit Log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details,
    created_at
  ) VALUES (
    v_caller_id,
    'ACTIVATION_CODE_REDEEMED',
    'subscription',
    v_code_row.id::text,
    jsonb_build_object(
      'plan', 'pro',
      'duration_days', v_code_row.duration_days,
      'code_id', v_code_row.id,
      'target_email', v_code_row.target_email,
      'business_id', v_business_id,
      'new_expires_at', v_new_expires_at
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan', 'pro',
    'status', 'active',
    'duration_days', v_code_row.duration_days,
    'expires_at', v_new_expires_at,
    'message', 'Selamat! Akun BisnisSehat PRO Anda berhasil diaktifkan.'
  );
END;
$$;

-- Revoke & Grant for redeem_pro_activation_code
REVOKE ALL ON FUNCTION public.redeem_pro_activation_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_pro_activation_code(text) TO authenticated, service_role;

-- 3. Hardened cancel_subscription_atomic with Furthest Expiry Target
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
  v_business_owner_id uuid;
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

  -- 2. Verify account access
  IF NOT public.is_account_access_allowed(v_caller_id) THEN
    RAISE EXCEPTION 'Akses ditolak: Akun Anda tidak aktif atau sedang diblokir'
      USING ERRCODE = '42501';
  END IF;

  -- 3. If business_id provided, verify ownership
  IF p_business_id IS NOT NULL THEN
    SELECT owner_id INTO v_business_owner_id
    FROM public.businesses
    WHERE id = p_business_id;

    IF v_business_owner_id IS NOT NULL AND v_business_owner_id <> v_caller_id THEN
      RAISE EXCEPTION 'Akses ditolak: Anda bukan pemilik bisnis ini'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Query active subscription (targeting canonical active with furthest expiry)
  SELECT id, plan, status, expires_at
  INTO v_sub_id, v_plan, v_status, v_expires_at
  FROM public.subscriptions
  WHERE profile_id = v_caller_id
    AND LOWER(plan) IN ('basic', 'pro')
    AND status = 'active'
    AND COALESCE(is_cancelled, false) = false
  ORDER BY expires_at DESC NULLS LAST, updated_at DESC
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

REVOKE ALL ON FUNCTION public.cancel_subscription_atomic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_atomic(uuid, text) TO authenticated, service_role;

-- 4. Hardened get_user_active_plan with Canonical Resolution
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
    s.expires_at DESC NULLS LAST,
    s.updated_at DESC,
    s.created_at DESC
  LIMIT 1;

  RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_active_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_active_plan(uuid) TO authenticated, service_role;

-- 5. Notify PostgREST schema cache
NOTIFY pgrst, 'reload schema';
