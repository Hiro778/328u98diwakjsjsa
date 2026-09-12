-- 043_subscription_payments.sql
-- Subscription payment tracking for Midtrans integration
-- Applied via focused SQL (not supabase db push)

-- Add business_id to subscriptions for easier queries
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

-- Subscription payment records (separate from POS payments table)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  profile_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  midtrans_order_id     text NOT NULL UNIQUE,
  gross_amount          numeric(15,2) NOT NULL DEFAULT 130000,
  payment_method        text DEFAULT '',
  transaction_status    text DEFAULT 'pending',
  payment_status        text NOT NULL DEFAULT 'pending',
  paid_at               timestamptz,
  period_start          timestamptz NOT NULL,
  period_end            timestamptz NOT NULL,
  raw_response          jsonb DEFAULT '{}',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_profile_id ON public.subscription_payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_midtrans_id ON public.subscription_payments(midtrans_order_id);

-- RLS: users can only see their own subscription payments
CREATE POLICY "Users can view own subscription payments"
  ON subscription_payments FOR SELECT TO authenticated
  USING ((select auth.uid()) = profile_id);

CREATE POLICY "Users can insert own subscription payments"
  ON subscription_payments FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = profile_id);
