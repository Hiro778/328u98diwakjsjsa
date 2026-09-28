-- ============================================================
-- 048_pos_receipt_settings.sql
-- BisnisSehat POS Receipt Settings & Store Profile
-- Strictly tenant-isolated via RLS matching business ownership
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_receipt_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  store_name          text NOT NULL DEFAULT '',
  store_address       text DEFAULT '',
  store_phone         text DEFAULT '',
  header_text         text DEFAULT '',
  footer_text         text DEFAULT '',
  show_logo           boolean DEFAULT false,
  show_table          boolean DEFAULT true,
  show_cashier        boolean DEFAULT true,
  show_order_number   boolean DEFAULT true,
  paper_size          text DEFAULT '58mm', -- '58mm' | '80mm'
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Index for fast lookup by business_id
CREATE INDEX IF NOT EXISTS idx_pos_receipt_settings_biz ON public.pos_receipt_settings(business_id);

-- Enable Row Level Security
ALTER TABLE public.pos_receipt_settings ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Users can only view receipt settings for businesses they own
CREATE POLICY "pos_receipt_settings_owner_select"
  ON public.pos_receipt_settings FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 2. INSERT: Users can only insert receipt settings for businesses they own
CREATE POLICY "pos_receipt_settings_owner_insert"
  ON public.pos_receipt_settings FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 3. UPDATE: Users can only update receipt settings for businesses they own
CREATE POLICY "pos_receipt_settings_owner_update"
  ON public.pos_receipt_settings FOR UPDATE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );

-- 4. DELETE: Users can only delete receipt settings for businesses they own
CREATE POLICY "pos_receipt_settings_owner_delete"
  ON public.pos_receipt_settings FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())
    )
  );
