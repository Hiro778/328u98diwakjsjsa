-- ============================================================
-- 094_pro_activation_email_binding.sql
-- BisnisSehat - PRO Activation Code Recipient Email Binding & Revocation
-- Conforms strictly to @act.md:
-- 1. Adds target_email and revoke_reason to public.pro_activation_codes
-- 2. admin_generate_pro_activation_code requires target_email and revokes older unused codes for that email
-- 3. admin_revoke_pro_activation_code allows admins to revoke unused codes with audit trail
-- 4. redeem_pro_activation_code strictly validates auth.users email matches target_email server-side
-- 5. get_admin_pro_activation_codes exposes target_email, creator, and revocation metadata
-- ============================================================

-- 1. SCHEMA MIGRATION: target_email and revoke_reason
ALTER TABLE public.pro_activation_codes ADD COLUMN IF NOT EXISTS target_email text;
ALTER TABLE public.pro_activation_codes ADD COLUMN IF NOT EXISTS revoke_reason text;

CREATE INDEX IF NOT EXISTS idx_pro_activation_codes_target_email ON public.pro_activation_codes(target_email);

-- 2. ADMIN GENERATE RPC (EMAIL BOUND + REPLACEMENT REVOCATION)
CREATE OR REPLACE FUNCTION public.admin_generate_pro_activation_code(
  p_target_email text,
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
  v_target_email text;
  v_random_bytes bytea;
  v_hex text;
  v_code text;
  v_code_hash text;
  v_code_id uuid;
  v_duration integer;
  v_old_code record;
BEGIN
  -- Strict server-side admin verification
  v_caller_id := auth.uid();
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat kode aktivasi PRO'
      USING ERRCODE = '42501';
  END IF;

  -- Validate target email (WAJIB diisi)
  IF p_target_email IS NULL OR TRIM(p_target_email) = '' THEN
    RAISE EXCEPTION 'Email penerima wajib diisi'
      USING ERRCODE = 'P0001';
  END IF;

  v_target_email := lower(trim(p_target_email));
  IF v_target_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Format email penerima tidak valid'
      USING ERRCODE = 'P0001';
  END IF;

  v_duration := LEAST(GREATEST(COALESCE(p_duration_days, 30), 1), 3650);

  -- Section 5: Satu email — satu active token.
  -- Jika admin membuat kode baru untuk email yang sama, revoke kode lama yang masih unused.
  FOR v_old_code IN
    SELECT id, target_email
    FROM public.pro_activation_codes
    WHERE target_email = v_target_email AND status = 'unused'
    FOR UPDATE
  LOOP
    UPDATE public.pro_activation_codes
    SET
      status = 'revoked',
      revoked_by = v_caller_id,
      revoked_at = now(),
      revoke_reason = 'Digantikan oleh kode aktivasi baru'
    WHERE id = v_old_code.id;

    INSERT INTO public.admin_audit_logs (
      admin_id,
      action,
      target_type,
      target_id,
      details,
      created_at
    ) VALUES (
      v_caller_id,
      'PRO_ACTIVATION_CODE_REVOKED',
      'pro_activation_code',
      v_old_code.id::text,
      jsonb_build_object(
        'code_id', v_old_code.id,
        'masked_identifier', 'BS-PRO-••••-••••-' || SUBSTRING(v_old_code.id::text FROM 1 FOR 4),
        'target_email', v_target_email,
        'actor_admin', v_caller_id,
        'reason', 'Digantikan oleh kode aktivasi baru'
      ),
      now()
    );
  END LOOP;

  -- 128-bit CSPRNG entropy: 16 bytes = 128 bits from extensions.gen_random_bytes
  v_random_bytes := extensions.gen_random_bytes(16);
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

  -- Cryptographic SHA-256 hash (Plaintext is NEVER stored in database)
  v_code_hash := encode(sha256(v_code::bytea), 'hex');

  -- Insert into pro_activation_codes
  INSERT INTO public.pro_activation_codes (
    code_hash,
    target_email,
    plan,
    duration_days,
    status,
    created_by,
    metadata,
    created_at
  ) VALUES (
    v_code_hash,
    v_target_email,
    'pro',
    v_duration,
    'unused',
    v_caller_id,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_code_id;

  -- Audit creation (Plaintext is NEVER recorded in audit log)
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
      'target_email', v_target_email,
      'plan', 'pro',
      'duration_days', v_duration,
      'masked_code', 'BS-PRO-••••-••••-' || SUBSTRING(v_hex FROM 29 FOR 4)
    ),
    now()
  );

  -- Return plaintext code to calling admin ONLY ONCE
  RETURN jsonb_build_object(
    'success', true,
    'id', v_code_id,
    'code', v_code,
    'target_email', v_target_email,
    'plan', 'pro',
    'duration_days', v_duration,
    'status', 'unused',
    'created_at', now()
  );
END;
$$;

-- 3. ADMIN REVOKE RPC
CREATE OR REPLACE FUNCTION public.admin_revoke_pro_activation_code(
  p_code_id uuid,
  p_reason text DEFAULT 'Dicabut oleh admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_adm boolean;
  v_code_row record;
  v_reason text;
BEGIN
  -- Strict server-side admin verification
  v_caller_id := auth.uid();
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mencabut kode aktivasi PRO'
      USING ERRCODE = '42501';
  END IF;

  IF p_code_id IS NULL THEN
    RAISE EXCEPTION 'ID kode aktivasi wajib diisi'
      USING ERRCODE = 'P0001';
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Dicabut oleh admin');

  -- Lock row
  SELECT * INTO v_code_row
  FROM public.pro_activation_codes
  WHERE id = p_code_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode aktivasi tidak ditemukan'
      USING ERRCODE = 'P0002';
  END IF;

  -- Cannot revoke already redeemed code
  IF v_code_row.status = 'redeemed' THEN
    RAISE EXCEPTION 'Kode aktivasi yang sudah digunakan tidak dapat dicabut'
      USING ERRCODE = 'P0001';
  END IF;

  -- If already revoked, return early
  IF v_code_row.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Kode aktivasi sudah dalam status dicabut'
    );
  END IF;

  -- Update status to revoked
  UPDATE public.pro_activation_codes
  SET
    status = 'revoked',
    revoked_by = v_caller_id,
    revoked_at = now(),
    revoke_reason = v_reason
  WHERE id = p_code_id;

  -- Insert audit log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details,
    created_at
  ) VALUES (
    v_caller_id,
    'PRO_ACTIVATION_CODE_REVOKED',
    'pro_activation_code',
    p_code_id::text,
    jsonb_build_object(
      'code_id', p_code_id,
      'masked_identifier', 'BS-PRO-••••-••••-' || SUBSTRING(p_code_id::text FROM 1 FOR 4),
      'target_email', v_code_row.target_email,
      'actor_admin', v_caller_id,
      'reason', v_reason
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kode aktivasi berhasil dicabut'
  );
END;
$$;

-- 4. REDEEM RPC: EMAIL-BOUND ENFORCEMENT
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
  -- 1. Must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Anda harus login untuk mengaktifkan kode PRO'
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
  -- If code has a target_email, it must match authenticated user's email
  IF v_code_row.target_email IS NOT NULL AND lower(trim(v_code_row.target_email)) <> v_user_email THEN
    -- Generic safe error without leaking code ownership
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

  -- 11. Grant / Extend PRO Subscription Entitlement
  SELECT * INTO v_existing_sub
  FROM public.subscriptions
  WHERE profile_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
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

-- 5. ADMIN LIST RPC (UPDATED WITH TARGET EMAIL AND REVOKE INFO)
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
  LEFT JOIN public.profiles creator ON creator.id = c.created_by
  WHERE
    (p_status = 'all' OR c.status = p_status)
    AND (
      v_search IS NULL
      OR c.id::text ILIKE '%' || v_search || '%'
      OR COALESCE(c.target_email, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.email, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(b.name, '') ILIKE '%' || v_search || '%'
    );

  -- Items query
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      c.id,
      'BS-PRO-••••-••••-' || SUBSTRING(c.id::text FROM 1 FOR 4) AS masked_code,
      c.target_email,
      c.plan,
      c.duration_days,
      c.status,
      c.created_at,
      c.expires_at,
      c.redeemed_at,
      c.revoked_at,
      c.revoke_reason,
      c.metadata,
      jsonb_build_object(
        'id', creator.id,
        'email', creator.email,
        'full_name', creator.full_name
      ) AS created_by_user,
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
    LEFT JOIN public.profiles creator ON creator.id = c.created_by
    WHERE
      (p_status = 'all' OR c.status = p_status)
      AND (
        v_search IS NULL
        OR c.id::text ILIKE '%' || v_search || '%'
        OR COALESCE(c.target_email, '') ILIKE '%' || v_search || '%'
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

-- 6. PERMISSIONS & POSTGREST CACHE
GRANT EXECUTE ON FUNCTION public.admin_generate_pro_activation_code(text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_pro_activation_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_pro_activation_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_pro_activation_codes(text, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
