-- 027_margin_analysis_hpp_snapshot.sql
-- Margin Analysis: add hpp_snapshot to preserve HPP value at time of analysis
--
-- When a user runs Margin Analysis using HPP from HPP Calculator,
-- the HPP value is snapshot'd so history doesn't change if HPP is updated later.

ALTER TABLE public.margin_analyses
  ADD COLUMN IF NOT EXISTS hpp_snapshot numeric(15,2) DEFAULT NULL;
