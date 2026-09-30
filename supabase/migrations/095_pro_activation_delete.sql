-- ============================================================
-- 095_pro_activation_delete.sql
-- BisnisSehat - PRO Activation Code Permanent History Deletion
-- Conforms strictly to @act.md:
-- 1. Exposes admin_delete_pro_activation_code RPC exclusively for SUPER_ADMIN
-- 2. Deletion is PERMITTED ONLY for terminal statuses: 'revoked' and 'expired'
-- 3. Deletion is REJECTED for 'unused' (active) and 'redeemed'
-- 4. Records immutable PRO_ACTIVATION_CODE_DELETED audit log with safe metadata
-- 5. Revokes execution from anon/public, grants to authenticated (guarded by is_super_admin())
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_pro_activation_code(
  p_code_id uuid,
  p_reason text DEFAULT 'Dihapus oleh super admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_super boolean;
  v_code_row record;
  v_reason text;
  v_audit_details jsonb;
BEGIN
  -- 1. Server-side auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Require public.is_super_admin()
  v_is_super := public.is_super_admin();
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Forbidden: Hanya Super Admin yang diizinkan menghapus riwayat kode aktivasi'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate code_id
  IF p_code_id IS NULL THEN
    RAISE EXCEPTION 'ID kode aktivasi wajib diisi'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Mandatory non-empty normalized reason
  v_reason := TRIM(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan wajib diisi'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Pessimistic lock row before deletion
  SELECT * INTO v_code_row
  FROM public.pro_activation_codes
  WHERE id = p_code_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode aktivasi tidak ditemukan'
      USING ERRCODE = 'P0002';
  END IF;

  -- 6. Enforce allowed / rejected statuses
  IF v_code_row.status = 'redeemed' THEN
    RAISE EXCEPTION 'Kode aktivasi yang sudah digunakan (redeemed) tidak dapat dihapus'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_code_row.status = 'unused' THEN
    RAISE EXCEPTION 'Kode aktivasi masih aktif. Cabut (revoke) kode terlebih dahulu sebelum menghapus'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_code_row.status NOT IN ('revoked', 'expired') THEN
    RAISE EXCEPTION 'Hanya riwayat kode aktivasi yang dicabut (revoked) atau kadaluarsa (expired) yang dapat dihapus'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Prepare audit details (NEVER store plaintext code)
  v_audit_details := jsonb_build_object(
    'code_id', v_code_row.id,
    'masked_code', 'BS-PRO-••••-••••-' || SUBSTRING(v_code_row.id::text FROM 1 FOR 4),
    'target_email', v_code_row.target_email,
    'status_before_delete', v_code_row.status,
    'duration_days', v_code_row.duration_days,
    'created_at', v_code_row.created_at,
    'created_by', v_code_row.created_by,
    'deleted_by', v_caller_id,
    'deletion_reason', v_reason
  );

  -- 8. Write immutable audit log
  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    reason,
    details,
    metadata,
    created_at
  ) VALUES (
    v_caller_id,
    'PRO_ACTIVATION_CODE_DELETED',
    'pro_activation_code',
    p_code_id::text,
    v_reason,
    v_audit_details,
    v_audit_details,
    now()
  );

  -- 9. Delete exactly the single targeted row
  DELETE FROM public.pro_activation_codes
  WHERE id = p_code_id;

  -- 10. Return structured JSON result
  RETURN jsonb_build_object(
    'success', true,
    'id', p_code_id,
    'message', 'Riwayat kode aktivasi berhasil dihapus permanen'
  );
END;
$$;

-- 11. Security Hardening & Grants
REVOKE ALL ON FUNCTION public.admin_delete_pro_activation_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_pro_activation_code(uuid, text) TO authenticated;
