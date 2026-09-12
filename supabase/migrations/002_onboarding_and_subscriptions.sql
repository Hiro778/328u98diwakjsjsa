-- ============================================================
-- 002_onboarding_and_subscriptions.sql
-- BisnisSehat - onboarding flow + subscription enhancements
-- ============================================================

-- Fix: profiles INSERT RLS (client-side fallback was failing)
create policy "Users can insert own profile"
  on profiles for insert to authenticated
  with check ((select auth.uid()) = id);

-- Onboarding flag on profiles
alter table public.profiles
  add column onboarding_completed boolean not null default false;

-- Business onboarding fields
alter table public.businesses
  add column business_type    text default '',
  add column business_category text default '',
  add column business_focus   text default 'domestic';

-- Subscription payment provider fields
alter table public.subscriptions
  add column payment_provider        text default '',
  add column provider_transaction_id text default '';
