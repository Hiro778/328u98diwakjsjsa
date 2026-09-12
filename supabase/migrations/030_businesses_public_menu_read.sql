-- ============================================================
-- 030_businesses_public_menu_read.sql
-- Fix: allow public (unauthenticated) users to read businesses
-- where is_menu_published = true.
--
-- Without this, PublicMenuPage (/menu/:slug) cannot load the
-- business record and shows "Bisnis tidak ditemukan."
-- ============================================================

CREATE POLICY "businesses_public_menu_read" ON businesses
  FOR SELECT TO public
  USING (is_menu_published = true);
