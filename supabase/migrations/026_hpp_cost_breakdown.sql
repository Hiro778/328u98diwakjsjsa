-- 026_hpp_cost_breakdown.sql
-- HPP Calculator: add waste_percentage column + cost_breakdown JSONB for full snapshot
--
-- Changes:
--   1. ALTER hpp_calculations: add waste_percentage (numeric, persisted from form)
--   2. ALTER hpp_calculations: add cost_breakdown (jsonb, full line-item snapshot)
--   3. Add index on product_id for cross-tool queries
--
-- cost_breakdown JSONB structure:
-- {
--   "materials": [{ "name": "", "quantity": 1, "unit": "kg", "pricePerUnit": 5000 }],
--   "packaging": [{ "name": "", "quantity": 1, "unit": "pcs", "pricePerUnit": 500 }],
--   "labor":     [{ "name": "", "cost": 10000 }],
--   "overhead":  [{ "name": "", "cost": 5000 }],
--   "otherCosts": [{ "name": "", "cost": 2000 }]
-- }

-- ══════════════════════════════════════════════════════════
-- 1. ADD waste_percentage COLUMN
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.hpp_calculations
  ADD COLUMN IF NOT EXISTS waste_percentage numeric(7,2) NOT NULL DEFAULT 0;

-- ══════════════════════════════════════════════════════════
-- 2. ADD cost_breakdown JSONB COLUMN
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.hpp_calculations
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT '{}';

-- ══════════════════════════════════════════════════════════
-- 3. INDEX on product_id for cross-tool queries
-- (business_id index already exists from 008)
-- ══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS hpp_calculations_product_id_idx
  ON public.hpp_calculations(product_id)
  WHERE product_id IS NOT NULL;
