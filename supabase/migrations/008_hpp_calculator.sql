-- ============================================================
-- 008_hpp_calculator.sql
-- HPP Calculator — persist calculation results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hpp_calculations (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name      text NOT NULL,
  quantity_produced numeric(15,2) NOT NULL CHECK (quantity_produced > 0),
  production_unit   text NOT NULL DEFAULT 'pcs',

  material_cost     numeric(15,2) NOT NULL DEFAULT 0,
  direct_labor_cost numeric(15,2) NOT NULL DEFAULT 0,
  packaging_cost    numeric(15,2) NOT NULL DEFAULT 0,
  overhead_cost     numeric(15,2) NOT NULL DEFAULT 0,
  other_cost        numeric(15,2) NOT NULL DEFAULT 0,

  total_cost        numeric(15,2) NOT NULL DEFAULT 0,
  hpp_per_unit      numeric(15,2) NOT NULL DEFAULT 0,

  markup_percent    numeric(7,2) NOT NULL DEFAULT 0,
  margin_percent    numeric(7,2) NOT NULL DEFAULT 0,
  price_mode        text NOT NULL DEFAULT 'markup' CHECK (price_mode IN ('markup', 'margin')),

  selling_price     numeric(15,2) DEFAULT 0,
  profit_per_unit   numeric(15,2) DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hpp_calculations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS hpp_calculations_business_id_idx ON public.hpp_calculations(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "hpp_calculations_select" ON public.hpp_calculations
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "hpp_calculations_insert" ON public.hpp_calculations
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "hpp_calculations_update" ON public.hpp_calculations
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

CREATE POLICY "hpp_calculations_delete" ON public.hpp_calculations
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
