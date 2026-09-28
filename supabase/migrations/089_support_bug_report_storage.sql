-- ============================================================
-- 089_support_bug_report_storage.sql
-- BisnisSehat - Redesign "Laporkan Bug" Native Form & Storage
-- Conforms strictly to @30.md & Context7 Supabase Guidelines:
-- - Private storage bucket 'support-screenshots'
-- - Scoped path: support/{user_id}/{ticket_id}/{filename}
-- - RLS policies for storage.objects: user isolated, admin read-all
-- - Secure RPC public.create_bug_report_ticket
-- ============================================================

-- 1. Create Private Storage Bucket for Support Screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-screenshots',
  'support-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- 2. Storage Objects RLS Policies
DROP POLICY IF EXISTS "support_screenshots_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "support_screenshots_select_own_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "support_screenshots_delete_own_or_admin" ON storage.objects;

-- INSERT: Authenticated user can only upload to their own user_id directory
CREATE POLICY "support_screenshots_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-screenshots'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid()::text)
      OR (
        (storage.foldername(name))[1] = 'support'
        AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
      )
    )
    AND (public.is_account_access_allowed(auth.uid()) OR public.is_admin())
  );

-- SELECT: Ticket owner or Admin can read screenshots
CREATE POLICY "support_screenshots_select_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-screenshots'
    AND (
      (
        (storage.foldername(name))[1] = (SELECT auth.uid()::text)
        OR (
          (storage.foldername(name))[1] = 'support'
          AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
        )
      )
      OR public.is_admin()
    )
  );

-- DELETE: Ticket owner or Admin can delete screenshot (for cleanup or administration)
CREATE POLICY "support_screenshots_delete_own_or_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'support-screenshots'
    AND (
      (
        (storage.foldername(name))[1] = (SELECT auth.uid()::text)
        OR (
          (storage.foldername(name))[1] = 'support'
          AND (storage.foldername(name))[2] = (SELECT auth.uid()::text)
        )
      )
      OR public.is_admin()
    )
  );

-- 3. Stored Procedure for atomic & safe Bug Report Submission
CREATE OR REPLACE FUNCTION public.create_bug_report_ticket(
  p_ticket_id uuid,
  p_business_id uuid,
  p_description text,
  p_page_url text,
  p_screenshot_url text,
  p_subject text DEFAULT 'Bug Report'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_verified_business_id uuid := NULL;
  v_trimmed_desc text;
  v_trimmed_page text;
  v_trimmed_screenshot text;
  v_subject text;
  v_ticket record;
BEGIN
  -- 1. Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan untuk melaporkan bug'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Account access check (not banned)
  IF NOT public.is_account_access_allowed(v_user_id) THEN
    RAISE EXCEPTION 'Forbidden: Akun Anda sedang dibatasi atau ditangguhkan'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate description
  v_trimmed_desc := trim(COALESCE(p_description, ''));
  IF length(v_trimmed_desc) = 0 THEN
    RAISE EXCEPTION 'Deskripsi bug wajib diisi'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Validate screenshot
  v_trimmed_screenshot := trim(COALESCE(p_screenshot_url, ''));
  IF length(v_trimmed_screenshot) = 0 THEN
    RAISE EXCEPTION 'Screenshot bukti bug wajib dilampirkan'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Validate business_id ownership (prevent arbitrary business_id)
  IF p_business_id IS NOT NULL THEN
    SELECT id INTO v_verified_business_id
    FROM public.businesses
    WHERE id = p_business_id
      AND owner_id = v_user_id
    LIMIT 1;
  END IF;

  v_trimmed_page := substring(COALESCE(p_page_url, '') from 1 for 1000);
  v_subject := COALESCE(NULLIF(trim(p_subject), ''), 'Bug Report');

  -- 6. Insert ticket
  INSERT INTO public.support_tickets (
    id,
    business_id,
    user_id,
    category,
    subject,
    description,
    page_url,
    priority,
    status,
    screenshot_url,
    admin_note,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(p_ticket_id, gen_random_uuid()),
    v_verified_business_id,
    v_user_id,
    'Bug',
    v_subject,
    v_trimmed_desc,
    v_trimmed_page,
    'medium',
    'new',
    v_trimmed_screenshot,
    NULL,
    now(),
    now()
  )
  RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'business_id', v_ticket.business_id,
    'user_id', v_ticket.user_id,
    'category', v_ticket.category,
    'subject', v_ticket.subject,
    'description', v_ticket.description,
    'page_url', v_ticket.page_url,
    'priority', v_ticket.priority,
    'status', v_ticket.status,
    'screenshot_url', v_ticket.screenshot_url,
    'created_at', v_ticket.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_bug_report_ticket(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bug_report_ticket(uuid, uuid, text, text, text, text) TO authenticated, service_role;
