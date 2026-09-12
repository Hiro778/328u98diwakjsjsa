-- ============================================================
-- 009_margin_analysis.sql
-- Margin Analysis — persist analysis results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.margin_analyses (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id            uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id             uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name           text NOT NULL,

  cost_per_unit          numeric(15,2) NOT NULL DEFAULT 0,
  gross_selling_price    numeric(15,2) NOT NULL DEFAULT 0,
  discount_percent       numeric(7,2) NOT NULL DEFAULT 0,
  effective_selling_price numeric(15,2) NOT NULL DEFAULT 0,
  selling_cost_per_unit  numeric(15,2) NOT NULL DEFAULT 0,

  total_cost_per_unit    numeric(15,2) NOT NULL DEFAULT 0,
  profit_per_unit        numeric(15,2) NOT NULL DEFAULT 0,
  margin_percent         numeric(7,2) NOT NULL DEFAULT 0,
  markup_percent         numeric(7,2) NOT NULL DEFAULT 0,

  quantity               integer NOT NULL DEFAULT 1,
  revenue                numeric(15,2) NOT NULL DEFAULT 0,
  total_cost             numeric(15,2) NOT NULL DEFAULT 0,
  total_profit           numeric(15,2) NOT NULL DEFAULT 0,

  analysis_mode          text NOT NULL DEFAULT 'price' CHECK (analysis_mode IN ('price', 'target_margin', 'target_markup')),
  target_margin          numeric(7,2) DEFAULT 0,
  target_markup          numeric(7,2) DEFAULT 0,

  notes                  text DEFAULT '',

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.margin_analyses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS margin_analyses_business_id_idx ON public.margin_analyses(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "margin_analyses_select" ON public.margin_analyses
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "margin_analyses_insert" ON public.margin_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "margin_analyses_update" ON public.margin_analyses
  FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "margin_analyses_delete" ON public.margin_analyses
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
