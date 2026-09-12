-- ============================================================
-- 034_production_capacity_planner.sql
-- Production Capacity Planner, BOMs, BOM Items, and Production Settings
-- ============================================================

-- 1. PRODUCTION BOMS
CREATE TABLE IF NOT EXISTS public.production_boms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name        text NOT NULL,
  batch_size  numeric(15,2) NOT NULL DEFAULT 1,
  batch_unit  text NOT NULL DEFAULT 'pcs',
  notes       text DEFAULT '',
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_boms_business_id ON public.production_boms(business_id);
CREATE INDEX IF NOT EXISTS idx_production_boms_product_id ON public.production_boms(product_id);

ALTER TABLE public.production_boms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_boms_owner_all"
  ON public.production_boms FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );

-- 2. PRODUCTION BOM ITEMS
CREATE TABLE IF NOT EXISTS public.production_bom_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id              uuid NOT NULL REFERENCES public.production_boms(id) ON DELETE CASCADE,
  material_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity_required   numeric(15,4) NOT NULL CHECK (quantity_required > 0),
  unit                text NOT NULL DEFAULT 'kg',
  notes               text DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_bom_items_bom_id ON public.production_bom_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_production_bom_items_material_product_id ON public.production_bom_items(material_product_id);

ALTER TABLE public.production_bom_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_bom_items_owner_all"
  ON public.production_bom_items FOR ALL TO authenticated
  USING (
    bom_id IN (
      SELECT id FROM public.production_boms WHERE business_id IN (
        SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (
    bom_id IN (
      SELECT id FROM public.production_boms WHERE business_id IN (
        SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
      )
    )
  );

-- 3. PRODUCTION SETTINGS
CREATE TABLE IF NOT EXISTS public.production_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id              uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  batch_capacity          numeric(15,2) NOT NULL DEFAULT 1,
  batch_unit              text NOT NULL DEFAULT 'pcs',
  production_time_minutes numeric(10,2) DEFAULT 0,
  workers_required        integer DEFAULT 1,
  work_hours_per_day      numeric(5,2) DEFAULT 8,
  work_days_per_period    integer DEFAULT 30,
  notes                   text DEFAULT '',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_settings_business_id ON public.production_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_production_settings_product_id ON public.production_settings(product_id);

ALTER TABLE public.production_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_settings_owner_all"
  ON public.production_settings FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (select auth.uid())
    )
  );
