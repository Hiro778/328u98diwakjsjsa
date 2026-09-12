-- 024_legal_checks.sql
-- Legal Checker: search-based legality check system
-- Does NOT replace 021 tables. Adds new tables for guided check flow.
--
-- Tables:
--   legal_checks         - Search event records (business name/brand query)
--   legal_check_results  - Per-category check results linked to a search
--
-- IMPORTANT: BisnisSehat does NOT have API access to government portals.
-- All statuses default to NEEDS_OFFICIAL_VERIFICATION (Guided Official Check).

-- ══════════════════════════════════════════════════════════
-- Legal Checks (search events)
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_checks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  search_query     text NOT NULL,
  normalized_query text NOT NULL,
  checked_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_checks_business_id ON legal_checks(business_id);
CREATE INDEX IF NOT EXISTS idx_legal_checks_normalized_query ON legal_checks(normalized_query);

ALTER TABLE legal_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_checks_owner_access"
  ON legal_checks
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════
-- Legal Check Results (per-category outcomes)
-- ══════════════════════════════════════════════════════════
-- Status values:
--   CHECKING                    = Sedang dalam proses pengecekan
--   FOUND                       = Ditemukan pada sumber yang diperiksa
--   NOT_FOUND                   = Belum ditemukan pada sumber yang diperiksa
--   ERROR                       = Terjadi kesalahan saat pengecekan
--   NEEDS_OFFICIAL_VERIFICATION = Perlu verifikasi langsung di portal resmi
--
-- Categories:
--   nib, pirt, halal, trademark

CREATE TABLE IF NOT EXISTS legal_check_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id          uuid NOT NULL REFERENCES legal_checks(id) ON DELETE CASCADE,
  category          text NOT NULL CHECK (category IN ('nib', 'pirt', 'halal', 'trademark')),
  status            text NOT NULL CHECK (status IN ('CHECKING', 'FOUND', 'NOT_FOUND', 'ERROR', 'NEEDS_OFFICIAL_VERIFICATION')),
  source            text,                 -- Portal name (e.g. "Portal OSS")
  source_url        text,                 -- Portal URL
  result_data       jsonb,                -- Any additional result info
  error_message     text,                 -- Error details if status is ERROR
  user_confirmed    boolean DEFAULT false, -- User confirmed after checking portal
  confirmed_number  text,                 -- Registration number user entered
  confirmed_at      timestamptz,          -- When user confirmed
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_check_results_check_id ON legal_check_results(check_id);

ALTER TABLE legal_check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_check_results_owner_access"
  ON legal_check_results
  FOR ALL
  USING (
    check_id IN (
      SELECT id FROM legal_checks WHERE business_id IN (
        SELECT id FROM businesses WHERE owner_id = auth.uid()
      )
    )
  );
