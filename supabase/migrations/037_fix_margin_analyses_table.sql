-- ============================================================
-- 037_fix_margin_analyses_table.sql
-- Ensure margin_analyses table exists with all columns
-- (combines 009 + 027, idempotent via IF NOT EXISTS)
-- Uses gen_random_uuid() (built-in PG13+) — no extension needed
-- Also enables uuid-ossp for other migrations that use it
-- ============================================================

-- 0. Enable uuid-ossp extension (needed by migrations 017+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.margin_analyses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

  hpp_snapshot           numeric(15,2) DEFAULT NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 3. Add hpp_snapshot column if table existed without it
ALTER TABLE public.margin_analyses
  ADD COLUMN IF NOT EXISTS hpp_snapshot numeric(15,2) DEFAULT NULL;

-- 4. Enable RLS
ALTER TABLE public.margin_analyses ENABLE ROW LEVEL SECURITY;

-- 5. Index
CREATE INDEX IF NOT EXISTS margin_analyses_business_id_idx ON public.margin_analyses(business_id);

-- 6. RLS Policies (DROP IF EXISTS first to avoid duplicate errors)
DROP POLICY IF EXISTS "margin_analyses_select" ON public.margin_analyses;
DROP POLICY IF EXISTS "margin_analyses_insert" ON public.margin_analyses;
DROP POLICY IF EXISTS "margin_analyses_update" ON public.margin_analyses;
DROP POLICY IF EXISTS "margin_analyses_delete" ON public.margin_analyses;

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
