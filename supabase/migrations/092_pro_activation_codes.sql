-- ============================================================
-- 092_pro_activation_codes.sql
-- BisnisSehat - PRO Activation Code System & Rate Limiting
-- Conforms strictly to @act.md & @gas.md:
-- 1. Table public.pro_activation_codes (code_hash, status, duration_days, plan, etc.)
-- 2. Table public.pro_activation_rate_limits (server-side anti-brute-force)
-- 3. Strict RLS: regular users & anon have zero access (no select/insert/update/delete)
-- 4. Server-Side RPC: redeem_pro_activation_code (SECURITY DEFINER, FOR UPDATE row locking, atomic subscription grant)
-- 5. Server-Side Admin RPC: admin_generate_pro_activation_code (128-bit CSPRNG entropy, returns plaintext ONLY once, DB only stores hash)
-- 6. Server-Side Admin RPC: get_admin_pro_activation_codes (masked codes, search, filter, pagination)
-- ============================================================

-- Ensure pgcrypto extension is available for CSPRNG & hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════
-- 1. TABLE: public.pro_activation_codes
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pro_activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'pro' CHECK (plan = 'pro'),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  status text NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'redeemed', 'revoked', 'expired')),
  expires_at timestamptz NULL,
  redeemed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_business_id uuid NULL REFERENCES public.businesses(id) ON DELETE SET NULL,
  redeemed_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for fast lookup & filtering
CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_hash ON public.pro_activation_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_status ON public.pro_activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_redeemed_by ON public.pro_activation_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_created_by ON public.pro_activation_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_created_at ON public.pro_activation_codes(created_at DESC);

-- ══════════════════════════════════════════════════════════
-- 2. TABLE: public.pro_activation_rate_limits
-- Anti-brute force tracking (max 5 failed attempts per 15 minutes)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pro_activation_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_pro_activation_rate_limits_locked ON public.pro_activation_rate_limits(locked_until);

-- ══════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.pro_activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_activation_rate_limits ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS "pro_activation_codes_admin_select" ON public.pro_activation_codes;
DROP POLICY IF EXISTS "pro_activation_codes_admin_insert" ON public.pro_activation_codes;
DROP POLICY IF EXISTS "pro_activation_codes_admin_update" ON public.pro_activation_codes;
DROP POLICY IF EXISTS "pro_activation_codes_admin_delete" ON public.pro_activation_codes;
DROP POLICY IF EXISTS "pro_activation_codes_deny_all" ON public.pro_activation_codes;
DROP POLICY IF EXISTS "pro_activation_rate_limits_deny_all" ON public.pro_activation_rate_limits;

-- Only verified admins can select pro_activation_codes
CREATE POLICY "pro_activation_codes_admin_select"
  ON public.pro_activation_codes
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Rate limits table has zero direct client access (only SECURITY DEFINER RPCs can modify)
-- Explicitly deny regular access by not having any permissive policies for anon/authenticated

-- ══════════════════════════════════════════════════════════
-- 4. RPC: redeem_pro_activation_code
-- Atomic, single-use, rate-limited, updates existing subscription model
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.redeem_pro_activation_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
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
  -- 1. Must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Anda harus login untuk mengaktifkan kode PRO'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Server-side Rate Limiting Check
  SELECT * INTO v_rate_row
  FROM public.pro_activation_rate_limits
  WHERE user_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    -- Check if currently locked
    IF v_rate_row.locked_until IS NOT NULL AND v_rate_row.locked_until > now() THEN
      RAISE EXCEPTION 'Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.'
        USING ERRCODE = '42501';
    END IF;

    -- If past window (> 15 mins since first failure), reset window
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

  -- Prevent oversized inputs / DOS
  IF LENGTH(v_normalized_code) > 100 OR LENGTH(v_normalized_code) < 10 THEN
    -- Record failed attempt
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

  -- 5. Row-level Lock (FOR UPDATE) - ensures atomic single-use
  SELECT *
  INTO v_code_row
  FROM public.pro_activation_codes
  WHERE code_hash = v_code_hash
  FOR UPDATE;

  -- 6. Validate Code Existence, Status, Expiry
  IF NOT FOUND OR v_code_row.status <> 'unused' OR (v_code_row.expires_at IS NOT NULL AND v_code_row.expires_at < now()) THEN
    -- Increment rate limiter
    INSERT INTO public.pro_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.pro_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.pro_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    -- Generic safe error message (anti-enumeration)
    RAISE EXCEPTION 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Reset rate limit counter on valid code attempt
  DELETE FROM public.pro_activation_rate_limits WHERE user_id = v_caller_id;

  -- 8. Resolve user's business if any
  SELECT id INTO v_business_id
  FROM public.businesses
  WHERE owner_id = v_caller_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- 9. Atomically mark code as REDEEMED
  UPDATE public.pro_activation_codes
  SET
    status = 'redeemed',
    redeemed_by = v_caller_id,
    redeemed_business_id = v_business_id,
    redeemed_at = now()
  WHERE id = v_code_row.id;

  -- 10. Grant / Extend PRO Subscription Entitlement using EXISTING subscription schema
  SELECT * INTO v_existing_sub
  FROM public.subscriptions
  WHERE profile_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    -- If already has active PRO expiring in the future, extend it seamlessly
    IF v_existing_sub.status = 'active' AND v_existing_sub.plan = 'pro' AND v_existing_sub.expires_at IS NOT NULL AND v_existing_sub.expires_at > now() THEN
      v_new_expires_at := v_existing_sub.expires_at + (v_code_row.duration_days || ' days')::interval;
    ELSE
      v_new_expires_at := now() + (v_code_row.duration_days || ' days')::interval;
    END IF;

    UPDATE public.subscriptions
    SET
      plan = 'pro',
      status = 'active',
      started_at = COALESCE(v_existing_sub.started_at, now()),
      expires_at = v_new_expires_at,
      business_id = COALESCE(v_existing_sub.business_id, v_business_id),
      payment_provider = 'activation_code',
      provider_transaction_id = 'ACT-' || SUBSTRING(v_code_row.id::text FROM 1 FOR 8),
      cancelled_at = NULL,
      cancelled_by = NULL,
      updated_at = now()
    WHERE id = v_existing_sub.id;
  ELSE
    v_new_expires_at := now() + (v_code_row.duration_days || ' days')::interval;

    INSERT INTO public.subscriptions (
      profile_id,
      business_id,
      plan,
      status,
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
      now(),
      v_new_expires_at,
      'activation_code',
      'ACT-' || SUBSTRING(v_code_row.id::text FROM 1 FOR 8),
      now(),
      now()
    );
  END IF;

  -- 11. Write safe audit log to existing public.admin_audit_logs
  -- NEVER store plaintext or code_hash in audit log
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
      'business_id', v_business_id,
      'new_expires_at', v_new_expires_at
    ),
    now()
  );

  -- 12. Return Success Payload (NO secret data returned)
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

-- ══════════════════════════════════════════════════════════
-- 5. ADMIN RPC: admin_generate_pro_activation_code
-- 128-bit CSPRNG Entropy, returns plaintext ONLY ONCE to admin, DB stores hash only
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_generate_pro_activation_code(
  p_duration_days integer DEFAULT 30,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_adm boolean;
  v_random_bytes bytea;
  v_hex text;
  v_code text;
  v_code_hash text;
  v_code_id uuid;
  v_duration integer;
BEGIN
  -- Strict server-side admin verification
  v_caller_id := auth.uid();
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat kode aktivasi PRO'
      USING ERRCODE = '42501';
  END IF;

  v_duration := LEAST(GREATEST(COALESCE(p_duration_days, 30), 1), 3650);

  -- 128-bit CSPRNG entropy: 16 bytes = 128 bits
  v_random_bytes := public.gen_random_bytes(16);
  v_hex := UPPER(encode(v_random_bytes, 'hex')); -- 32 hex chars

  -- Format: BS-PRO-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (8 groups of 4 = 32 hex chars = 128 bits)
  v_code := 'BS-PRO-' ||
    SUBSTRING(v_hex FROM 1 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 5 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 9 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 13 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 17 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 21 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 25 FOR 4) || '-' ||
    SUBSTRING(v_hex FROM 29 FOR 4);

  -- Cryptographic SHA-256 hash
  v_code_hash := encode(sha256(v_code::bytea), 'hex');

  -- Insert into pro_activation_codes (Plaintext is NEVER stored in database)
  INSERT INTO public.pro_activation_codes (
    code_hash,
    plan,
    duration_days,
    status,
    created_by,
    metadata,
    created_at
  ) VALUES (
    v_code_hash,
    'pro',
    v_duration,
    'unused',
    v_caller_id,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_code_id;

  -- Audit creation
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details,
    created_at
  ) VALUES (
    v_caller_id,
    'ACTIVATION_CODE_CREATED',
    'pro_activation_code',
    v_code_id::text,
    jsonb_build_object(
      'code_id', v_code_id,
      'plan', 'pro',
      'duration_days', v_duration,
      'masked_code', 'BS-PRO-••••-••••-••••-••••'
    ),
    now()
  );

  -- Return plaintext code to calling admin ONLY ONCE
  RETURN jsonb_build_object(
    'success', true,
    'id', v_code_id,
    'code', v_code,
    'plan', 'pro',
    'duration_days', v_duration,
    'status', 'unused',
    'created_at', now()
  );
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 6. ADMIN RPC: get_admin_pro_activation_codes
-- Lists codes with masked identifier, status, redeemer info, pagination
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_pro_activation_codes(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
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
  v_total bigint;
  v_items jsonb;
  v_search text;
BEGIN
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat daftar kode aktivasi'
      USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_search := NULLIF(TRIM(p_search), '');

  -- Total count
  SELECT COUNT(*)
  INTO v_total
  FROM public.pro_activation_codes c
  LEFT JOIN public.profiles p ON p.id = c.redeemed_by
  LEFT JOIN public.businesses b ON b.id = c.redeemed_business_id
  WHERE
    (p_status = 'all' OR c.status = p_status)
    AND (
      v_search IS NULL
      OR c.id::text ILIKE '%' || v_search || '%'
      OR COALESCE(p.email, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(b.name, '') ILIKE '%' || v_search || '%'
    );

  -- Aggregated list with masked code format
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      c.id,
      'BS-PRO-••••-••••-' || SUBSTRING(c.id::text FROM 1 FOR 4) AS masked_code,
      c.plan,
      c.duration_days,
      c.status,
      c.created_at,
      c.expires_at,
      c.redeemed_at,
      c.metadata,
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name
      ) AS redeemed_user,
      jsonb_build_object(
        'id', b.id,
        'name', b.name
      ) AS redeemed_business
    FROM public.pro_activation_codes c
    LEFT JOIN public.profiles p ON p.id = c.redeemed_by
    LEFT JOIN public.businesses b ON b.id = c.redeemed_business_id
    WHERE
      (p_status = 'all' OR c.status = p_status)
      AND (
        v_search IS NULL
        OR c.id::text ILIKE '%' || v_search || '%'
        OR COALESCE(p.email, '') ILIKE '%' || v_search || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(b.name, '') ILIKE '%' || v_search || '%'
      )
    ORDER BY c.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

-- Revoke dangerous direct permissions and ensure clean RPC permissions
REVOKE ALL ON public.pro_activation_codes FROM anon, public;
REVOKE ALL ON public.pro_activation_rate_limits FROM anon, public;

GRANT SELECT ON public.pro_activation_codes TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_pro_activation_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generate_pro_activation_code(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_pro_activation_codes(text, text, integer, integer) TO authenticated;

-- Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
