-- ============================================================
-- 097_credit_activation_links.sql
-- BisnisSehat - Manual AI Credit Sales + One-Time Activation System
-- Conforms strictly to load.md & Context7 Supabase Guidelines:
-- 1. Table public.credit_activation_links (token_hash, status, 24h expiry, account binding)
-- 2. Table public.credit_activation_rate_limits (anti-brute-force rate limiting)
-- 3. Strict RLS: regular users and anon have zero direct access
-- 4. Server-Side Admin RPC: admin_generate_credit_activation (256-bit CSPRNG, authoritative packages, 24h expiry, audit logged)
-- 5. Server-Side Admin RPC: get_admin_credit_activations (masked identifiers, search, filter, pagination)
-- 6. Server-Side Admin RPC: get_admin_user_businesses (helper to list businesses for target user)
-- 7. Server-Side Admin RPC: admin_cancel_credit_activation (cancels pending activation)
-- 8. Server-Side Customer RPC: redeem_credit_activation (SECURITY DEFINER, FOR UPDATE row locking, atomic credit & ledger grant)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════
-- 1. TABLE: public.credit_activation_links
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.credit_activation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  package_key text NOT NULL,
  package_name text NOT NULL,
  credit_amount integer NOT NULL CHECK (credit_amount > 0),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'USED', 'EXPIRED', 'CANCELLED')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  used_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT check_credit_activation_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_credit_activation_links_hash ON public.credit_activation_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_credit_activation_links_profile ON public.credit_activation_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_credit_activation_links_business ON public.credit_activation_links(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_activation_links_status ON public.credit_activation_links(status);
CREATE INDEX IF NOT EXISTS idx_credit_activation_links_created_at ON public.credit_activation_links(created_at DESC);

-- ══════════════════════════════════════════════════════════
-- 2. TABLE: public.credit_activation_rate_limits
-- Anti-brute force tracking (max 5 failed attempts per 15 minutes)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.credit_activation_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_activation_rate_limits_locked ON public.credit_activation_rate_limits(locked_until);

-- ══════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.credit_activation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_activation_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_activation_links_admin_select" ON public.credit_activation_links;
DROP POLICY IF EXISTS "credit_activation_links_deny_all" ON public.credit_activation_links;
DROP POLICY IF EXISTS "credit_activation_rate_limits_deny_all" ON public.credit_activation_rate_limits;

-- Only verified admins can SELECT credit_activation_links
CREATE POLICY "credit_activation_links_admin_select"
  ON public.credit_activation_links
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Revoke all direct permissions from anon and public
REVOKE ALL ON public.credit_activation_links FROM anon, public;
REVOKE ALL ON public.credit_activation_rate_limits FROM anon, public;

GRANT SELECT ON public.credit_activation_links TO authenticated;

-- ══════════════════════════════════════════════════════════
-- 4. ADMIN RPC: admin_generate_credit_activation
-- 256-bit CSPRNG entropy, authoritative package mapping, 24h expiry
-- Plaintext token returned ONLY ONCE to calling admin; DB stores SHA-256 hash only.
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_generate_credit_activation(
  p_profile_id uuid,
  p_business_id uuid,
  p_package_key text,
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
  v_clean_pkg text;
  v_pkg_name text;
  v_credit_amount integer;
  v_price_idr numeric;
  v_expires_at timestamptz;
  v_random_bytes bytea;
  v_token text;
  v_token_hash text;
  v_activation_id uuid;
  v_profile_exists boolean;
  v_business_exists boolean;
BEGIN
  -- 1. Authenticated admin check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat link aktivasi kredit' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Profile Existence
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = p_profile_id) INTO v_profile_exists;
  IF NOT v_profile_exists THEN
    RAISE EXCEPTION 'User profile tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validate Business Ownership / Association
  SELECT EXISTS(
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND owner_id = p_profile_id
  ) INTO v_business_exists;
  IF NOT v_business_exists THEN
    RAISE EXCEPTION 'Bisnis tidak ditemukan atau bukan milik akun yang dipilih' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Authoritative Package Mapping (Server Decides Amount & Price)
  v_clean_pkg := LOWER(TRIM(COALESCE(p_package_key, '')));
  IF v_clean_pkg = 'starter' THEN
    v_pkg_name := 'Starter';
    v_credit_amount := 100;
    v_price_idr := 25000;
  ELSIF v_clean_pkg = 'growth' THEN
    v_pkg_name := 'Growth';
    v_credit_amount := 500;
    v_price_idr := 100000;
  ELSIF v_clean_pkg = 'pro' THEN
    v_pkg_name := 'Pro';
    v_credit_amount := 1000;
    v_price_idr := 175000;
  ELSIF v_clean_pkg = 'business' THEN
    v_pkg_name := 'Business';
    v_credit_amount := 3000;
    v_price_idr := 450000;
  ELSE
    RAISE EXCEPTION 'Paket kredit tidak valid: %', p_package_key USING ERRCODE = 'P0001';
  END IF;

  -- 5. Expiry: Exactly 24 hours from server time
  v_expires_at := now() + interval '24 hours';

  -- 6. Generate 256-bit cryptographically secure random token (32 bytes = 256 bits)
  BEGIN
    v_random_bytes := extensions.gen_random_bytes(32);
  EXCEPTION WHEN OTHERS THEN
    v_random_bytes := public.gen_random_bytes(32);
  END;
  v_token := encode(v_random_bytes, 'hex'); -- 64 hex chars opaque token

  -- 7. SHA-256 Hash for storage
  v_token_hash := encode(sha256(v_token::bytea), 'hex');

  -- 8. Insert into public.credit_activation_links
  INSERT INTO public.credit_activation_links (
    profile_id,
    business_id,
    package_key,
    package_name,
    credit_amount,
    token_hash,
    status,
    created_by,
    created_at,
    expires_at,
    metadata
  ) VALUES (
    p_profile_id,
    p_business_id,
    v_clean_pkg,
    v_pkg_name,
    v_credit_amount,
    v_token_hash,
    'PENDING',
    v_caller_id,
    now(),
    v_expires_at,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_activation_id;

  -- 9. Admin Audit Log (Raw token or URL is NEVER logged)
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    details,
    created_at
  ) VALUES (
    v_caller_id,
    'CREDIT_ACTIVATION_CREATED',
    'credit_activation',
    v_activation_id::text,
    jsonb_build_object(
      'activation_id', v_activation_id,
      'profile_id', p_profile_id,
      'business_id', p_business_id,
      'package_key', v_clean_pkg,
      'package_name', v_pkg_name,
      'credit_amount', v_credit_amount,
      'price_idr', v_price_idr,
      'expires_at', v_expires_at,
      'created_by', v_caller_id
    ),
    now()
  );

  -- 10. Return raw token and activation path to calling admin EXACTLY ONCE
  RETURN jsonb_build_object(
    'success', true,
    'id', v_activation_id,
    'token', v_token,
    'activation_path', '/activate-credit?t=' || v_token,
    'package_key', v_clean_pkg,
    'package_name', v_pkg_name,
    'credit_amount', v_credit_amount,
    'price_idr', v_price_idr,
    'expires_at', v_expires_at,
    'created_at', now()
  );
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 5. ADMIN RPC: get_admin_credit_activations
-- Lists activations with masked identifier, status, user & business info, pagination
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_credit_activations(
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
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat daftar aktivasi kredit'
      USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_search := NULLIF(TRIM(p_search), '');

  SELECT COUNT(*)
  INTO v_total
  FROM public.credit_activation_links c
  LEFT JOIN public.profiles p ON p.id = c.profile_id
  LEFT JOIN public.businesses b ON b.id = c.business_id
  WHERE
    (p_status = 'all' OR c.status = p_status)
    AND (
      v_search IS NULL
      OR c.id::text ILIKE '%' || v_search || '%'
      OR c.package_name ILIKE '%' || v_search || '%'
      OR COALESCE(p.email, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(b.name, '') ILIKE '%' || v_search || '%'
    );

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      c.id,
      'ACT-CREDIT-••••' || SUBSTRING(c.id::text FROM 1 FOR 4) AS masked_identifier,
      c.package_key,
      c.package_name,
      c.credit_amount,
      CASE
        WHEN c.status = 'PENDING' AND now() >= c.expires_at THEN 'EXPIRED'
        ELSE c.status
      END AS status,
      c.created_at,
      c.expires_at,
      c.used_at,
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name
      ) AS user,
      jsonb_build_object(
        'id', b.id,
        'name', b.name
      ) AS business
    FROM public.credit_activation_links c
    LEFT JOIN public.profiles p ON p.id = c.profile_id
    LEFT JOIN public.businesses b ON b.id = c.business_id
    WHERE
      (p_status = 'all' OR c.status = p_status)
      AND (
        v_search IS NULL
        OR c.id::text ILIKE '%' || v_search || '%'
        OR c.package_name ILIKE '%' || v_search || '%'
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

-- ══════════════════════════════════════════════════════════
-- 6. ADMIN RPC: get_admin_user_businesses
-- Lists businesses belonging to a user for admin selection dropdown
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_admin_user_businesses(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_adm boolean;
  v_items jsonb;
BEGIN
  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat melihat bisnis pengguna'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'created_at', b.created_at
  ) ORDER BY b.created_at ASC), '[]'::jsonb)
  INTO v_items
  FROM public.businesses b
  WHERE b.owner_id = p_user_id;

  RETURN v_items;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 7. ADMIN RPC: admin_cancel_credit_activation
-- Cancels a PENDING activation
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_cancel_credit_activation(p_activation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_adm boolean;
  v_row record;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  v_is_adm := public.is_admin();
  IF NOT v_is_adm THEN
    RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membatalkan aktivasi' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.credit_activation_links
  WHERE id = p_activation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktivasi tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Hanya aktivasi dengan status PENDING yang dapat dibatalkan' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.credit_activation_links
  SET status = 'CANCELLED'
  WHERE id = p_activation_id;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, details, created_at
  ) VALUES (
    v_caller_id,
    'CREDIT_ACTIVATION_CANCELLED',
    'credit_activation',
    p_activation_id::text,
    jsonb_build_object('activation_id', p_activation_id),
    now()
  );

  RETURN jsonb_build_object('success', true, 'id', p_activation_id, 'status', 'CANCELLED');
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 8. CUSTOMER REDEMPTION RPC: redeem_credit_activation
-- Atomic, row-locked, single-use, account-bound, ledger-audited
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.redeem_credit_activation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_clean_token text;
  v_token_hash text;
  v_activation record;
  v_rate_row record;
  v_available integer;
  v_consumed integer;
  v_total_earned integer;
  v_new_balance integer;
  c_max_attempts constant integer := 5;
  c_lock_duration constant interval := interval '15 minutes';
BEGIN
  -- 1. Verify caller is authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Anda harus login untuk mengaktifkan kredit'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Anti-brute force rate limiting check
  SELECT * INTO v_rate_row
  FROM public.credit_activation_rate_limits
  WHERE user_id = v_caller_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_rate_row.locked_until IS NOT NULL AND v_rate_row.locked_until > now() THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RATE_LIMITED',
        'message', 'Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.'
      );
    END IF;

    -- Reset window if 15 minutes have passed
    IF v_rate_row.first_failed_at + c_lock_duration < now() THEN
      UPDATE public.credit_activation_rate_limits
      SET failed_attempts = 0, first_failed_at = now(), last_failed_at = now(), locked_until = NULL
      WHERE user_id = v_caller_id;
    END IF;
  END IF;

  -- 3. Token input validation
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TOKEN',
      'message', 'Link aktivasi tidak valid.'
    );
  END IF;

  v_clean_token := TRIM(p_token);

  -- Check token length bounds (min 32, max 128 characters)
  IF LENGTH(v_clean_token) < 32 OR LENGTH(v_clean_token) > 128 THEN
    -- Increment rate limits
    INSERT INTO public.credit_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.credit_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.credit_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TOKEN',
      'message', 'Link aktivasi tidak valid.'
    );
  END IF;

  -- 4. Hash submitted token
  v_token_hash := encode(sha256(v_clean_token::bytea), 'hex');

  -- 5. Row-level Lock (FOR UPDATE)
  SELECT * INTO v_activation
  FROM public.credit_activation_links
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  -- If token not found
  IF NOT FOUND THEN
    INSERT INTO public.credit_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.credit_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.credit_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TOKEN',
      'message', 'Link aktivasi tidak valid.'
    );
  END IF;

  -- 6. Check Status: USED, CANCELLED, EXPIRED
  IF v_activation.status = 'USED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_USED',
      'message', 'Link aktivasi ini sudah digunakan.'
    );
  END IF;

  IF v_activation.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CANCELLED',
      'message', 'Link aktivasi sudah dibatalkan.'
    );
  END IF;

  -- 7. Check Expiry
  IF v_activation.status = 'EXPIRED' OR now() >= v_activation.expires_at THEN
    IF v_activation.status <> 'EXPIRED' THEN
      UPDATE public.credit_activation_links
      SET status = 'EXPIRED'
      WHERE id = v_activation.id;
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'EXPIRED',
      'message', 'Link aktivasi ini sudah kedaluwarsa.'
    );
  END IF;

  IF v_activation.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Link aktivasi tidak valid.'
    );
  END IF;

  -- 8. Account Binding: Activation profile_id MUST equal auth.uid()
  IF v_activation.profile_id <> v_caller_id THEN
    -- Generic safe error, never reveal target profile_id
    INSERT INTO public.credit_activation_rate_limits (user_id, failed_attempts, first_failed_at, last_failed_at)
    VALUES (v_caller_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
    SET failed_attempts = public.credit_activation_rate_limits.failed_attempts + 1,
        last_failed_at = now(),
        locked_until = CASE
          WHEN public.credit_activation_rate_limits.failed_attempts + 1 >= c_max_attempts THEN now() + c_lock_duration
          ELSE NULL
        END;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'WRONG_ACCOUNT',
      'message', 'Link aktivasi ini bukan untuk akun Anda.'
    );
  END IF;

  -- 9. Clear rate limits on valid redemption
  DELETE FROM public.credit_activation_rate_limits WHERE user_id = v_caller_id;

  -- 10. Lock credit balance: public.creative_credits
  SELECT available, consumed, total_earned
  INTO v_available, v_consumed, v_total_earned
  FROM public.creative_credits
  WHERE business_id = v_activation.business_id
  FOR UPDATE;

  -- 11. Update credit balance atomically
  IF NOT FOUND THEN
    INSERT INTO public.creative_credits (
      business_id, available, consumed, total_earned, updated_at
    ) VALUES (
      v_activation.business_id,
      v_activation.credit_amount,
      0,
      v_activation.credit_amount,
      now()
    )
    RETURNING available INTO v_new_balance;
  ELSE
    v_new_balance := v_available + v_activation.credit_amount;
    UPDATE public.creative_credits
    SET available = v_new_balance,
        total_earned = v_total_earned + v_activation.credit_amount,
        updated_at = now()
    WHERE business_id = v_activation.business_id;
  END IF;

  -- 12. Insert exactly ONE credit ledger record
  INSERT INTO public.credit_ledger (
    business_id,
    type,
    credits,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    description,
    created_at
  ) VALUES (
    v_activation.business_id,
    'TOPUP',
    v_activation.credit_amount,
    v_new_balance,
    'manual_activation',
    v_activation.id,
    'ACT-CREDIT-' || v_activation.id::text,
    'Aktivasi manual paket ' || v_activation.package_name || ' (+' || v_activation.credit_amount || ' credits)',
    now()
  );

  -- 13. Mark activation as USED
  UPDATE public.credit_activation_links
  SET status = 'USED',
      used_at = now(),
      used_by = v_caller_id
  WHERE id = v_activation.id;

  -- 14. Audit Log
  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, details, created_at
  ) VALUES (
    v_caller_id,
    'CREDIT_ACTIVATION_REDEEMED',
    'credit_activation',
    v_activation.id::text,
    jsonb_build_object(
      'activation_id', v_activation.id,
      'business_id', v_activation.business_id,
      'profile_id', v_activation.profile_id,
      'package_key', v_activation.package_key,
      'credit_amount', v_activation.credit_amount,
      'new_balance', v_new_balance
    ),
    now()
  );

  -- 15. Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'credits_added', v_activation.credit_amount,
    'package_name', v_activation.package_name,
    'new_balance', v_new_balance,
    'message', v_activation.credit_amount || ' Creative Credits berhasil ditambahkan.'
  );
END;
$$;

-- ══════════════════════════════════════════════════════════
-- 9. PERMISSIONS & SCHEMA NOTIFICATION
-- ══════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.admin_generate_credit_activation(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_credit_activations(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_user_businesses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_credit_activation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credit_activation(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_generate_credit_activation(uuid, uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_credit_activations(text, text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_businesses(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_credit_activation(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_credit_activation(text) FROM anon, public;

NOTIFY pgrst, 'reload schema';
