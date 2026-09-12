-- ============================================================
-- 013_anomaly_detection.sql
-- Anomaly Detection — persist detection results for history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.anomaly_detections (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id           uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  anomaly_date          date NOT NULL,
  anomaly_type          text NOT NULL DEFAULT 'time_series',
  metric                text NOT NULL DEFAULT '',
  severity              text NOT NULL DEFAULT 'normal',
  direction             text NOT NULL DEFAULT 'increase',

  current_value         numeric(15,2) NOT NULL DEFAULT 0,
  baseline_median       numeric(15,2) NOT NULL DEFAULT 0,
  difference            numeric(15,2) NOT NULL DEFAULT 0,
  percentage_difference numeric(8,2) NOT NULL DEFAULT 0,
  robust_score          numeric(8,2),
  confidence            text NOT NULL DEFAULT 'Terbatas',

  related_transaction_id uuid,
  details               jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anomaly_detections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS anomaly_detections_business_id_idx ON public.anomaly_detections(business_id);
CREATE INDEX IF NOT EXISTS anomaly_detections_date_idx ON public.anomaly_detections(anomaly_date DESC);

-- ─── RLS Policies ─────────────────────────────────────────

CREATE POLICY "anomaly_detections_select" ON public.anomaly_detections
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "anomaly_detections_insert" ON public.anomaly_detections
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "anomaly_detections_delete" ON public.anomaly_detections
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
    )
  );
