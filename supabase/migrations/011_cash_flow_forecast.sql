-- ============================================================
-- 011_cash_flow_forecast.sql
-- Cash Flow Forecast — persist forecast results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_flow_forecasts (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  forecast_name         text NOT NULL DEFAULT '',
  forecast_period       text NOT NULL DEFAULT '3_months',

  opening_cash          numeric(15,2) NOT NULL DEFAULT 0,
  total_inflows         numeric(15,2) NOT NULL DEFAULT 0,
  total_outflows        numeric(15,2) NOT NULL DEFAULT 0,
  net_cash_flow         numeric(15,2) NOT NULL DEFAULT 0,
  closing_cash          numeric(15,2) NOT NULL DEFAULT 0,
  minimum_cash_balance  numeric(15,2) NOT NULL DEFAULT 0,
  maximum_cash_balance  numeric(15,2) NOT NULL DEFAULT 0,
  shortfall_detected    boolean NOT NULL DEFAULT false,
  shortfall_amount      numeric(15,2) NOT NULL DEFAULT 0,

  -- Store transactions as JSONB for flexibility
  inflows               jsonb NOT NULL DEFAULT '[]'::jsonb,
  outflows              jsonb NOT NULL DEFAULT '[]'::jsonb,
  periods               jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_flow_forecasts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cash_flow_forecasts_business_id_idx ON public.cash_flow_forecasts(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "cash_flow_forecasts_select" ON public.cash_flow_forecasts
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "cash_flow_forecasts_insert" ON public.cash_flow_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "cash_flow_forecasts_update" ON public.cash_flow_forecasts
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

CREATE POLICY "cash_flow_forecasts_delete" ON public.cash_flow_forecasts
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
