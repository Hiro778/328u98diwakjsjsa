-- ============================================================
-- 014_financial_health_score.sql
-- Financial Health Score — persist score snapshots for history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_health_scores (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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

  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_health_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS financial_health_scores_business_id_idx ON public.financial_health_scores(business_id);
CREATE INDEX IF NOT EXISTS financial_health_scores_date_idx ON public.financial_health_scores(created_at DESC);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "financial_health_scores_select" ON public.financial_health_scores
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "financial_health_scores_insert" ON public.financial_health_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "financial_health_scores_delete" ON public.financial_health_scores
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
