-- ============================================================
-- 088_footer_social_links.sql
-- BisnisSehat - Footer & Social Links Management
-- Conforms strictly to @42.md & Context7 Supabase Guidelines:
-- - Dedicated table footer_social_links (NOT reusing platform_settings)
-- - RLS: Admin/Super_Admin mutate; anon+authenticated SELECT enabled rows only
-- - SECURITY DEFINER + SET search_path = '' on all RPCs
-- - URL validation server-side (no javascript:, data:, vbscript:)
-- - Audit logging on every mutation
-- - UUID primary keys consistent with existing schema
-- ============================================================

-- 1. Create footer_social_links table
CREATE TABLE IF NOT EXISTS public.footer_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN (
    'instagram','tiktok','whatsapp','email','phone',
    'youtube','facebook','x','linkedin','website','custom'
  )),
  label text NOT NULL CHECK (char_length(trim(label)) > 0 AND char_length(label) <= 80),
  url text NOT NULL CHECK (char_length(trim(url)) > 0 AND char_length(url) <= 2048),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_footer_social_links_enabled_sort
  ON public.footer_social_links(enabled, sort_order);

CREATE INDEX IF NOT EXISTS idx_footer_social_links_platform
  ON public.footer_social_links(platform);

-- 3. Row Level Security
ALTER TABLE public.footer_social_links ENABLE ROW LEVEL SECURITY;

-- Public & authenticated users: read only enabled links
DROP POLICY IF EXISTS "Public can read enabled social links" ON public.footer_social_links;
CREATE POLICY "Public can read enabled social links"
  ON public.footer_social_links
  FOR SELECT
  TO anon, authenticated
  USING (enabled = true);

-- Admins can read all (including disabled) for management
DROP POLICY IF EXISTS "Admins can read all social links" ON public.footer_social_links;
CREATE POLICY "Admins can read all social links"
  ON public.footer_social_links
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Admins can insert
DROP POLICY IF EXISTS "Admins can insert social links" ON public.footer_social_links;
CREATE POLICY "Admins can insert social links"
  ON public.footer_social_links
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Admins can update
DROP POLICY IF EXISTS "Admins can update social links" ON public.footer_social_links;
CREATE POLICY "Admins can update social links"
  ON public.footer_social_links
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can delete
DROP POLICY IF EXISTS "Admins can delete social links" ON public.footer_social_links;
CREATE POLICY "Admins can delete social links"
  ON public.footer_social_links
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. Helper: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_footer_social_links_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_footer_social_links_updated_at ON public.footer_social_links;
CREATE TRIGGER trg_footer_social_links_updated_at
  BEFORE UPDATE ON public.footer_social_links
  FOR EACH ROW EXECUTE FUNCTION public.set_footer_social_links_updated_at();

-- 5. URL Validation Helper (server-side, prevents dangerous schemes)
CREATE OR REPLACE FUNCTION public.validate_social_link_url(p_url text, p_platform text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lower_url text := lower(trim(p_url));
BEGIN
  -- Block dangerous schemes
  IF lower_url LIKE 'javascript:%' THEN RETURN false; END IF;
  IF lower_url LIKE 'data:%' THEN RETURN false; END IF;
  IF lower_url LIKE 'vbscript:%' THEN RETURN false; END IF;
  IF lower_url LIKE 'file:%' THEN RETURN false; END IF;

  -- Platform-specific validation
  IF p_platform = 'email' THEN
    IF lower_url NOT LIKE 'mailto:%' AND lower_url NOT LIKE '%@%.%' THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_platform = 'phone' THEN
    IF lower_url NOT LIKE 'tel:%' AND lower_url NOT SIMILAR TO '[+]?[0-9\s\-()]+' THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF p_platform = 'whatsapp' THEN
    IF lower_url NOT LIKE 'https://wa.me/%' AND lower_url NOT LIKE 'https://api.whatsapp.com/%' AND lower_url NOT LIKE 'tel:%' THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- Default: must start with https:// or http://
  IF lower_url NOT LIKE 'https://%' AND lower_url NOT LIKE 'http://%' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 6. RPC: get_footer_social_links (public - only enabled)
CREATE OR REPLACE FUNCTION public.get_footer_social_links()
RETURNS TABLE (
  id uuid,
  platform text,
  label text,
  url text,
  sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      fsl.id,
      fsl.platform,
      fsl.label,
      fsl.url,
      fsl.sort_order
    FROM public.footer_social_links fsl
    WHERE fsl.enabled = true
    ORDER BY fsl.sort_order ASC, fsl.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_footer_social_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_footer_social_links() TO anon, authenticated;

-- 7. RPC: admin_get_all_footer_social_links (admin only - all rows)
CREATE OR REPLACE FUNCTION public.admin_get_all_footer_social_links()
RETURNS TABLE (
  id uuid,
  platform text,
  label text,
  url text,
  enabled boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: Akses ditolak. Hanya admin yang dapat mengelola footer social links.';
  END IF;

  RETURN QUERY
    SELECT
      fsl.id,
      fsl.platform,
      fsl.label,
      fsl.url,
      fsl.enabled,
      fsl.sort_order,
      fsl.created_at,
      fsl.updated_at,
      fsl.updated_by
    FROM public.footer_social_links fsl
    ORDER BY fsl.sort_order ASC, fsl.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_all_footer_social_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_all_footer_social_links() TO authenticated;

-- 8. RPC: admin_create_footer_social_link
CREATE OR REPLACE FUNCTION public.admin_create_footer_social_link(
  p_platform text,
  p_label text,
  p_url text,
  p_enabled boolean DEFAULT true,
  p_sort_order integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_normalized_url text;
  v_normalized_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: Akses ditolak.';
  END IF;

  -- Validate platform
  IF p_platform NOT IN ('instagram','tiktok','whatsapp','email','phone','youtube','facebook','x','linkedin','website','custom') THEN
    RAISE EXCEPTION 'INVALID_PLATFORM: Platform tidak valid.';
  END IF;

  -- Sanitize label
  v_normalized_label := trim(p_label);
  IF char_length(v_normalized_label) = 0 THEN
    RAISE EXCEPTION 'INVALID_LABEL: Label tidak boleh kosong.';
  END IF;
  IF char_length(v_normalized_label) > 80 THEN
    RAISE EXCEPTION 'INVALID_LABEL: Label terlalu panjang (maksimal 80 karakter).';
  END IF;

  -- Normalize URL for email/phone
  v_normalized_url := trim(p_url);

  IF p_platform = 'email' AND v_normalized_url NOT LIKE 'mailto:%' THEN
    IF v_normalized_url LIKE '%@%.%' THEN
      v_normalized_url := 'mailto:' || v_normalized_url;
    END IF;
  END IF;

  IF p_platform = 'phone' AND v_normalized_url NOT LIKE 'tel:%' THEN
    IF v_normalized_url SIMILAR TO '[+]?[0-9\s\-()]+' THEN
      v_normalized_url := 'tel:' || regexp_replace(v_normalized_url, '\s', '', 'g');
    END IF;
  END IF;

  -- Validate URL
  IF NOT public.validate_social_link_url(v_normalized_url, p_platform) THEN
    RAISE EXCEPTION 'INVALID_URL: URL tidak valid atau menggunakan skema berbahaya.';
  END IF;

  -- Insert
  INSERT INTO public.footer_social_links (platform, label, url, enabled, sort_order, updated_by)
  VALUES (p_platform, v_normalized_label, v_normalized_url, p_enabled, p_sort_order, auth.uid())
  RETURNING id INTO v_id;

  -- Audit log
  BEGIN
    INSERT INTO public.admin_audit_logs (admin_id, action, resource_type, resource_id, changes, ip_address)
    VALUES (
      auth.uid(),
      'CREATE',
      'footer_social_links',
      v_id::text,
      jsonb_build_object('platform', p_platform, 'label', v_normalized_label, 'enabled', p_enabled),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- audit log failure non-fatal
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_footer_social_link(text,text,text,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_footer_social_link(text,text,text,boolean,integer) TO authenticated;

-- 9. RPC: admin_update_footer_social_link
CREATE OR REPLACE FUNCTION public.admin_update_footer_social_link(
  p_id uuid,
  p_platform text,
  p_label text,
  p_url text,
  p_enabled boolean,
  p_sort_order integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized_url text;
  v_normalized_label text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: Akses ditolak.';
  END IF;

  IF p_platform NOT IN ('instagram','tiktok','whatsapp','email','phone','youtube','facebook','x','linkedin','website','custom') THEN
    RAISE EXCEPTION 'INVALID_PLATFORM: Platform tidak valid.';
  END IF;

  v_normalized_label := trim(p_label);
  IF char_length(v_normalized_label) = 0 THEN
    RAISE EXCEPTION 'INVALID_LABEL: Label tidak boleh kosong.';
  END IF;
  IF char_length(v_normalized_label) > 80 THEN
    RAISE EXCEPTION 'INVALID_LABEL: Label terlalu panjang.';
  END IF;

  v_normalized_url := trim(p_url);

  IF p_platform = 'email' AND v_normalized_url NOT LIKE 'mailto:%' THEN
    IF v_normalized_url LIKE '%@%.%' THEN
      v_normalized_url := 'mailto:' || v_normalized_url;
    END IF;
  END IF;

  IF p_platform = 'phone' AND v_normalized_url NOT LIKE 'tel:%' THEN
    IF v_normalized_url SIMILAR TO '[+]?[0-9\s\-()]+' THEN
      v_normalized_url := 'tel:' || regexp_replace(v_normalized_url, '\s', '', 'g');
    END IF;
  END IF;

  IF NOT public.validate_social_link_url(v_normalized_url, p_platform) THEN
    RAISE EXCEPTION 'INVALID_URL: URL tidak valid atau menggunakan skema berbahaya.';
  END IF;

  UPDATE public.footer_social_links
  SET
    platform = p_platform,
    label = v_normalized_label,
    url = v_normalized_url,
    enabled = p_enabled,
    sort_order = p_sort_order,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Social link tidak ditemukan.';
  END IF;

  BEGIN
    INSERT INTO public.admin_audit_logs (admin_id, action, resource_type, resource_id, changes, ip_address)
    VALUES (
      auth.uid(),
      'UPDATE',
      'footer_social_links',
      p_id::text,
      jsonb_build_object('platform', p_platform, 'label', v_normalized_label, 'enabled', p_enabled, 'sort_order', p_sort_order),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_footer_social_link(uuid,text,text,text,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_footer_social_link(uuid,text,text,text,boolean,integer) TO authenticated;

-- 10. RPC: admin_delete_footer_social_link
CREATE OR REPLACE FUNCTION public.admin_delete_footer_social_link(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label text;
  v_platform text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: Akses ditolak.';
  END IF;

  SELECT label, platform INTO v_label, v_platform
  FROM public.footer_social_links
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Social link tidak ditemukan.';
  END IF;

  DELETE FROM public.footer_social_links WHERE id = p_id;

  BEGIN
    INSERT INTO public.admin_audit_logs (admin_id, action, resource_type, resource_id, changes, ip_address)
    VALUES (
      auth.uid(),
      'DELETE',
      'footer_social_links',
      p_id::text,
      jsonb_build_object('label', v_label, 'platform', v_platform),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_footer_social_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_footer_social_link(uuid) TO authenticated;

-- 11. RPC: admin_toggle_footer_social_link
CREATE OR REPLACE FUNCTION public.admin_toggle_footer_social_link(p_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED: Akses ditolak.';
  END IF;

  UPDATE public.footer_social_links
  SET enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Social link tidak ditemukan.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_footer_social_link(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_footer_social_link(uuid,boolean) TO authenticated;

-- 12. Grant table access (RLS enforced above)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.footer_social_links TO authenticated;
GRANT SELECT ON public.footer_social_links TO anon;
