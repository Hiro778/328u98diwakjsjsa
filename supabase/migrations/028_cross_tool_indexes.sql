-- ============================================================
-- 028_cross_tool_indexes.sql
-- Add product_id indexes for cross-tool queries
-- ============================================================

-- Index for Margin Analysis cross-tool queries
-- Enables efficient lookup: "get all margin analyses for product X"
CREATE INDEX IF NOT EXISTS margin_analyses_product_id_idx
  ON public.margin_analyses(product_id)
  WHERE product_id IS NOT NULL;

-- Index for BEP Calculator cross-tool queries
-- Enables efficient lookup: "get all BEP calculations for product X"
CREATE INDEX IF NOT EXISTS bep_calculations_product_id_idx
  ON public.bep_calculations(product_id)
  WHERE product_id IS NOT NULL;
