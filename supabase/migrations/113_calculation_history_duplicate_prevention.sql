-- ============================================================
-- 113_calculation_history_duplicate_prevention.sql
-- Global History Duplicate & Spam Prevention
--
-- Adds deterministic calculation fingerprint columns and tenant-scoped
-- UNIQUE indexes on (business_id, fingerprint) across all calculation history tables.
-- Guarantees database-level authoritative deduplication and idempotency
-- against rapid clicks and concurrent race conditions.
--
-- Preserves all existing history rows without destructive deletion.
-- ============================================================

-- 1. MARGIN ANALYSES
ALTER TABLE public.margin_analyses
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS margin_analyses_business_fingerprint_idx
  ON public.margin_analyses (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 2. HPP CALCULATIONS
ALTER TABLE public.hpp_calculations
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS hpp_calculations_business_fingerprint_idx
  ON public.hpp_calculations (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 3. BEP CALCULATIONS
ALTER TABLE public.bep_calculations
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS bep_calculations_business_fingerprint_idx
  ON public.bep_calculations (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 4. CASH FLOW FORECASTS
ALTER TABLE public.cash_flow_forecasts
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_forecasts_business_fingerprint_idx
  ON public.cash_flow_forecasts (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 5. LOAN SIMULATIONS
ALTER TABLE public.loan_simulations
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS loan_simulations_business_fingerprint_idx
  ON public.loan_simulations (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 6. TAX PLANNINGS
ALTER TABLE public.tax_plannings
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS tax_plannings_business_fingerprint_idx
  ON public.tax_plannings (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- 7. FINANCIAL HEALTH SCORES (Ensure table and column exist with RLS)
CREATE TABLE IF NOT EXISTS public.financial_health_scores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  analysis_period       text NOT NULL DEFAULT '30_days',
  period_start          date NOT NULL,
  period_end            date NOT NULL,

  score                 integer NOT NULL DEFAULT 0,
  profitability_score   integer NOT NULL DEFAULT 0,
  cash_flow_score       integer NOT NULL DEFAULT 0,
  margin_score          integer NOT NULL DEFAULT 0,
  break_even_score      integer NOT NULL DEFAULT 0,
  stability_score       integer NOT NULL DEFAULT 0,

  metrics               jsonb NOT NULL DEFAULT '{}'::jsonb,
  risks                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  positive_signals      jsonb NOT NULL DEFAULT '[]'::jsonb,

  fingerprint           text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_health_scores
  ADD COLUMN IF NOT EXISTS fingerprint text;

ALTER TABLE public.financial_health_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "financial_health_scores_select" ON public.financial_health_scores
    FOR SELECT TO authenticated
    USING (
      business_id IN (
        SELECT id FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "financial_health_scores_insert" ON public.financial_health_scores
    FOR INSERT TO authenticated
    WITH CHECK (
      business_id IN (
        SELECT id FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "financial_health_scores_delete" ON public.financial_health_scores
    FOR DELETE TO authenticated
    USING (
      business_id IN (
        SELECT id FROM public.businesses
        WHERE owner_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS financial_health_scores_business_fingerprint_idx
  ON public.financial_health_scores (business_id, fingerprint)
  WHERE fingerprint IS NOT NULL;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
