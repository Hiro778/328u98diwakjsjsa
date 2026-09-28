-- ============================================================
-- 072_public_qris_checkout.sql
-- BisnisSehat: QRIS Phase 3 — Public Checkout QRIS Access & Order Integrity
-- Strictly enforces:
-- 1. Public read for business_payment_settings ONLY when is_menu_published = true AND qris_enabled = true
-- 2. Closes customer order tampering vulnerability by dropping orders_public_update
-- 3. Retains business-assets private storage isolation
-- ============================================================

-- 1. SECURITY HARDENING: Drop legacy public update on orders
-- Customers/anonymous users MUST NOT be able to modify payment_status,
-- order_status, total, or payment_method directly via REST/API.
DROP POLICY IF EXISTS "orders_public_update" ON public.orders;

-- 2. PUBLIC SELECT FOR QRIS SETTINGS
-- Allows unauthenticated / public customers to verify if QRIS is enabled
-- for a published business, without leaking un-published business assets.
DROP POLICY IF EXISTS "business_payment_settings_public_select" ON public.business_payment_settings;

CREATE POLICY "business_payment_settings_public_select"
  ON public.business_payment_settings FOR SELECT TO public
  USING (
    qris_enabled = true
    AND business_id IN (
      SELECT b.id FROM public.businesses b
      WHERE b.is_menu_published = true
      AND (
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_account_access_allowed')
        OR public.is_account_access_allowed(b.owner_id)
      )
    )
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
