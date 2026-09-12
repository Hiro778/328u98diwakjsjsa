-- 039_legalitas_v2_planner_cache.sql
-- Legalitas V2: Verification planner support + cache table
--
-- Changes:
--   1. Add business_entity_type column to legal_checks
--   2. Add TERKONFIRMASI to legal_check_results.status CHECK
--   3. Create legal_check_cache table for source result caching
--
-- Backward compatible: existing rows unaffected.

-- ══════════════════════════════════════════════════════════
-- 1. Add business_entity_type to legal_checks
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_checks
  ADD COLUMN IF NOT EXISTS business_entity_type text;

-- ══════════════════════════════════════════════════════════
-- 2. Add TERKONFIRMASI to status CHECK constraint
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_check_results
  DROP CONSTRAINT IF EXISTS legal_check_results_status_check;

ALTER TABLE legal_check_results
  ADD CONSTRAINT legal_check_results_status_check
    CHECK (status IN (
      -- Legacy statuses (migration 024)
      'CHECKING', 'FOUND', 'NOT_FOUND', 'ERROR', 'NEEDS_OFFICIAL_VERIFICATION',
      -- V1 statuses (migration 033)
      'DITEMUKAN', 'TIDAK_DITEMUKAN', 'PERLU_DITINJAU', 'TIDAK_RELEVAN', 'GAGAL_DIPERIKSA',
      -- V2 new status
      'TERKONFIRMASI'
    ));

-- ══════════════════════════════════════════════════════════
-- 3. Cache table
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS legal_check_cache (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source           text NOT NULL,
  identifier_key   text NOT NULL,
  status           text NOT NULL,
  result_summary   text,
  result_detail    jsonb,
  portal_link      text,
  checked_at       timestamptz NOT NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════
-- 4. Indexes
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_legal_check_cache_lookup
  ON legal_check_cache(business_id, source, identifier_key);

CREATE INDEX IF NOT EXISTS idx_legal_check_cache_expires
  ON legal_check_cache(expires_at);

-- ══════════════════════════════════════════════════════════
-- 5. RLS
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_check_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_check_cache_owner_access"
  ON legal_check_cache
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
