-- ============================================================
-- 070_business_qris_payment_settings.sql
-- BisnisSehat: QRIS Phase 1 — Business QRIS Payment Settings
-- Strictly tenant-isolated via RLS matching business ownership
-- ============================================================

CREATE TABLE IF NOT EXISTS public.business_payment_settings (
  business_id         uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  qris_image_url      text NULL,
  qris_enabled        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Index on business_id (primary key already has unique btree index, ensure lookup efficiency)
CREATE INDEX IF NOT EXISTS idx_business_payment_settings_biz ON public.business_payment_settings(business_id);

-- Trigger to maintain updated_at column automatically
CREATE OR REPLACE FUNCTION public.handle_business_payment_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_payment_settings_updated_at ON public.business_payment_settings;
CREATE TRIGGER trg_business_payment_settings_updated_at
  BEFORE UPDATE ON public.business_payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_business_payment_settings_updated_at();

-- Enable Row Level Security
ALTER TABLE public.business_payment_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "business_payment_settings_owner_select" ON public.business_payment_settings;
DROP POLICY IF EXISTS "business_payment_settings_owner_insert" ON public.business_payment_settings;
DROP POLICY IF EXISTS "business_payment_settings_owner_update" ON public.business_payment_settings;
DROP POLICY IF EXISTS "business_payment_settings_owner_delete" ON public.business_payment_settings;

-- 1. SELECT: Owner can only view their own business payment settings
CREATE POLICY "business_payment_settings_owner_select"
  ON public.business_payment_settings FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed((SELECT auth.uid()))
      )
    )
  );

-- 2. INSERT: Owner can only insert payment settings for their own business
CREATE POLICY "business_payment_settings_owner_insert"
  ON public.business_payment_settings FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed((SELECT auth.uid()))
      )
    )
  );

-- 3. UPDATE: Owner can only update payment settings for their own business
CREATE POLICY "business_payment_settings_owner_update"
  ON public.business_payment_settings FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed((SELECT auth.uid()))
      )
    )
  );

-- 4. DELETE: Owner can only delete payment settings for their own business
CREATE POLICY "business_payment_settings_owner_delete"
  ON public.business_payment_settings FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE owner_id = (SELECT auth.uid())
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed((SELECT auth.uid()))
      )
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
