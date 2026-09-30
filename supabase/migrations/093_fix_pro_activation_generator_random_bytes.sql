-- ============================================================
-- 093_fix_pro_activation_generator_random_bytes.sql
-- BisnisSehat - Fix gen_random_bytes schema reference in admin_generate_pro_activation_code
-- Resolves production error: function public.gen_random_bytes(integer) does not exist
-- pgcrypto extension is located in schema 'extensions'
-- ============================================================

-- Ensure admin_audit_logs has details column if referenced by activation flows
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS details jsonb;

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

GRANT EXECUTE ON FUNCTION public.admin_generate_pro_activation_code(integer, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
