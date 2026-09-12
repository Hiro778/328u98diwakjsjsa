-- 033_legalitas_redesign.sql
-- Legal & Brand Checker: multi-source government verification + logo similarity
--
-- Changes:
--   1. Extend legal_checks with brand_name, nib_number, product_category, check_type
--   2. Extend legal_check_results with result_summary, result_detail, portal_link, checked_at
--   3. Expand legal_check_results.category CHECK to include ahu, bpom, bpjph
--   4. Expand legal_check_results.status CHECK with new statuses
--   5. Create legal_logo_checks for logo similarity results
--
-- Backward compatible: existing rows and old status values remain valid.

-- ══════════════════════════════════════════════════════════
-- 1. Extend legal_checks
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_checks
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS nib_number text,
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS check_type text NOT NULL DEFAULT 'sources'
    CHECK (check_type IN ('sources', 'logo'));

-- ══════════════════════════════════════════════════════════
-- 2. Extend legal_check_results
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_check_results
  ADD COLUMN IF NOT EXISTS result_summary text,
  ADD COLUMN IF NOT EXISTS result_detail jsonb,
  ADD COLUMN IF NOT EXISTS portal_link text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz;

-- ══════════════════════════════════════════════════════════
-- 3. Expand category CHECK constraint
-- ══════════════════════════════════════════════════════════
-- Drop old constraint, add new one with expanded categories
ALTER TABLE legal_check_results
  DROP CONSTRAINT IF EXISTS legal_check_results_category_check;

ALTER TABLE legal_check_results
  ADD CONSTRAINT legal_check_results_category_check
    CHECK (category IN ('nib', 'pirt', 'halal', 'trademark', 'ahu', 'bpom', 'bpjph'));

-- ══════════════════════════════════════════════════════════
-- 4. Expand status CHECK constraint
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_check_results
  DROP CONSTRAINT IF EXISTS legal_check_results_status_check;

ALTER TABLE legal_check_results
  ADD CONSTRAINT legal_check_results_status_check
    CHECK (status IN (
      'CHECKING', 'FOUND', 'NOT_FOUND', 'ERROR', 'NEEDS_OFFICIAL_VERIFICATION',
      'DITEMUKAN', 'TIDAK_DITEMUKAN', 'PERLU_DITINJAU', 'TIDAK_RELEVAN', 'GAGAL_DIPERIKSA'
    ));

-- ══════════════════════════════════════════════════════════
-- 5. Index for category queries
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_legal_check_results_category ON legal_check_results(category);

-- ══════════════════════════════════════════════════════════
-- 6. Logo Check Results
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_logo_checks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  check_id         uuid REFERENCES legal_checks(id) ON DELETE SET NULL,
  image_url        text NOT NULL,
  image_filename   text,
  overall_status   text NOT NULL DEFAULT 'CHECKING'
    CHECK (overall_status IN ('CHECKING', 'CLEAN', 'HAS_SIMILARITY', 'ERROR')),
  total_results    integer DEFAULT 0,
  results          jsonb DEFAULT '[]',
  error_message    text,
  checked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_logo_checks_business_id ON legal_logo_checks(business_id);

ALTER TABLE legal_logo_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_logo_checks_owner_access"
  ON legal_logo_checks
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
