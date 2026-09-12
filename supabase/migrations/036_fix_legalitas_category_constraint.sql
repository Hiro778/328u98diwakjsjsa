-- 036_fix_legalitas_category_constraint.sql
-- FIX: legal_check_results.category CHECK constraint missing 'oss' and 'djki'
--
-- Root cause: migration 033 expanded the CHECK but omitted 'oss' and 'djki'.
-- Edge Function legalitas-check inserts categories: oss, ahu, djki, bpom, bpjph
-- INSERTs with category 'oss' or 'djki' fail with constraint violation.
--
-- This migration drops the incomplete constraint and replaces it with the full set.

-- ══════════════════════════════════════════════════════════
-- Fix category CHECK constraint
-- ══════════════════════════════════════════════════════════
ALTER TABLE legal_check_results
  DROP CONSTRAINT IF EXISTS legal_check_results_category_check;

ALTER TABLE legal_check_results
  ADD CONSTRAINT legal_check_results_category_check
    CHECK (category IN (
      -- Legacy categories (from migration 024)
      'nib', 'pirt', 'halal', 'trademark',
      -- New multi-source categories (from migration 033 + this fix)
      'oss', 'ahu', 'djki', 'bpom', 'bpjph'
    ));
