-- ============================================================
-- 012_tax_planning.sql
-- Tax Planning — persist estimation results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tax_plannings (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  period                text NOT NULL DEFAULT 'annual',
  tax_regime            text NOT NULL DEFAULT 'umkm_final',

  revenue               numeric(15,2) NOT NULL DEFAULT 0,
  deductible_expenses   numeric(15,2) NOT NULL DEFAULT 0,
  taxable_base          numeric(15,2) NOT NULL DEFAULT 0,
  estimated_tax         numeric(15,2) NOT NULL DEFAULT 0,
  tax_already_paid      numeric(15,2) NOT NULL DEFAULT 0,
  remaining_tax         numeric(15,2) NOT NULL DEFAULT 0,
  effective_tax_rate    numeric(8,4) NOT NULL DEFAULT 0,
  post_tax_profit       numeric(15,2) NOT NULL DEFAULT 0,
  monthly_tax_reserve   numeric(15,2) NOT NULL DEFAULT 0,
  annual_tax_reserve    numeric(15,2) NOT NULL DEFAULT 0,

  -- Structured data
  scenario_data         jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_breakdown     jsonb NOT NULL DEFAULT '[]'::jsonb,

  notes                 text NOT NULL DEFAULT '',

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tax_plannings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS tax_plannings_business_id_idx ON public.tax_plannings(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "tax_plannings_select" ON public.tax_plannings
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "tax_plannings_insert" ON public.tax_plannings
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "tax_plannings_update" ON public.tax_plannings
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

CREATE POLICY "tax_plannings_delete" ON public.tax_plannings
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
