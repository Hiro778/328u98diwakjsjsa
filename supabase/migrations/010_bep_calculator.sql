-- ============================================================
-- 010_bep_calculator.sql
-- BEP Calculator — persist calculation results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bep_calculations (
  id                                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id                       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id                        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name                      text NOT NULL DEFAULT '',

  selling_price_per_unit            numeric(15,2) NOT NULL DEFAULT 0,

  material_cost_per_unit            numeric(15,2) NOT NULL DEFAULT 0,
  packaging_cost_per_unit           numeric(15,2) NOT NULL DEFAULT 0,
  sales_fee_per_unit                numeric(15,2) NOT NULL DEFAULT 0,
  other_variable_cost_per_unit      numeric(15,2) NOT NULL DEFAULT 0,
  variable_cost_per_unit            numeric(15,2) NOT NULL DEFAULT 0,

  rent                              numeric(15,2) NOT NULL DEFAULT 0,
  fixed_labor                       numeric(15,2) NOT NULL DEFAULT 0,
  utilities                         numeric(15,2) NOT NULL DEFAULT 0,
  software                          numeric(15,2) NOT NULL DEFAULT 0,
  other_fixed_costs                 numeric(15,2) NOT NULL DEFAULT 0,
  fixed_costs                       numeric(15,2) NOT NULL DEFAULT 0,

  contribution_margin_per_unit      numeric(15,2) NOT NULL DEFAULT 0,
  contribution_margin_ratio         numeric(8,4) NOT NULL DEFAULT 0,

  bep_units                         numeric(15,2) NOT NULL DEFAULT 0,
  bep_revenue                       numeric(15,2) NOT NULL DEFAULT 0,

  actual_units                      integer DEFAULT 0,
  actual_revenue                    numeric(15,2) DEFAULT 0,

  margin_of_safety                  numeric(15,2) DEFAULT 0,
  margin_of_safety_percent          numeric(8,4) DEFAULT 0,

  target_profit                     numeric(15,2) DEFAULT 0,
  required_units_for_target_profit  numeric(15,2) DEFAULT 0,
  required_revenue_for_target_profit numeric(15,2) DEFAULT 0,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bep_calculations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS bep_calculations_business_id_idx ON public.bep_calculations(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "bep_calculations_select" ON public.bep_calculations
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "bep_calculations_insert" ON public.bep_calculations
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "bep_calculations_update" ON public.bep_calculations
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

CREATE POLICY "bep_calculations_delete" ON public.bep_calculations
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
