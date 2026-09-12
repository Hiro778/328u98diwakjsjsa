-- ============================================================
-- 015_loan_simulation.sql
-- Loan Simulation — persist simulation results
-- ============================================================

CREATE TABLE IF NOT EXISTS public.loan_simulations (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  principal             numeric(15,2) NOT NULL DEFAULT 0,
  annual_interest_rate  numeric(8,4) NOT NULL DEFAULT 0,
  tenor_months          integer NOT NULL DEFAULT 0,
  method                text NOT NULL DEFAULT 'annuity',

  admin_fee             numeric(15,2) NOT NULL DEFAULT 0,
  provision_rate        numeric(8,4) NOT NULL DEFAULT 0,
  other_fee             numeric(15,2) NOT NULL DEFAULT 0,

  monthly_payment       numeric(15,2) NOT NULL DEFAULT 0,
  total_interest        numeric(15,2) NOT NULL DEFAULT 0,
  total_fees            numeric(15,2) NOT NULL DEFAULT 0,
  total_payment         numeric(15,2) NOT NULL DEFAULT 0,
  effective_total_cost  numeric(15,2) NOT NULL DEFAULT 0,

  schedule              jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loan_simulations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS loan_simulations_business_id_idx ON public.loan_simulations(business_id);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "loan_simulations_select" ON public.loan_simulations
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "loan_simulations_insert" ON public.loan_simulations
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "loan_simulations_delete" ON public.loan_simulations
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
