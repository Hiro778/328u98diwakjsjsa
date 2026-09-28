-- ============================================================
-- Migration 051: Telegram Operasional Integration
-- Provides secure storage for official Telegram Bot API tokens,
-- single-use pairing codes, and update idempotency tracking.
-- ============================================================

-- 1. Telegram Bot Settings per Business (Tenant-isolated)
CREATE TABLE IF NOT EXISTS public.telegram_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL,
  bot_token_masked TEXT NOT NULL,
  bot_id TEXT,
  bot_username TEXT,
  bot_first_name TEXT,
  chat_id TEXT,
  chat_title TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'configured' CHECK (status IN ('disconnected', 'configured', 'connected')),
  notification_preferences JSONB NOT NULL DEFAULT '{"new_order": true, "order_status": true, "low_stock": true, "out_of_stock": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookup by business_id and bot_id
CREATE INDEX IF NOT EXISTS idx_telegram_bot_settings_business ON public.telegram_bot_settings(business_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_settings_bot_id ON public.telegram_bot_settings(bot_id);

-- 2. Telegram Pairing Tokens (Single-use, Short-lived)
CREATE TABLE IF NOT EXISTS public.telegram_pairing_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  pairing_code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_pairing_code ON public.telegram_pairing_tokens(pairing_code);
CREATE INDEX IF NOT EXISTS idx_telegram_pairing_business ON public.telegram_pairing_tokens(business_id);

-- 3. Telegram Processed Updates (Webhook Idempotency)
CREATE TABLE IF NOT EXISTS public.telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.telegram_bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_pairing_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;

-- Policies for telegram_bot_settings
CREATE POLICY "telegram_bot_settings_select" ON public.telegram_bot_settings
  FOR SELECT USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_bot_settings_insert" ON public.telegram_bot_settings
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_bot_settings_update" ON public.telegram_bot_settings
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_bot_settings_delete" ON public.telegram_bot_settings
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

-- Policies for telegram_pairing_tokens
CREATE POLICY "telegram_pairing_tokens_select" ON public.telegram_pairing_tokens
  FOR SELECT USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_pairing_tokens_insert" ON public.telegram_pairing_tokens
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_pairing_tokens_update" ON public.telegram_pairing_tokens
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY "telegram_pairing_tokens_delete" ON public.telegram_pairing_tokens
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );

-- Policies for telegram_processed_updates (Server/Service Role or Tenant check)
CREATE POLICY "telegram_processed_updates_policy" ON public.telegram_processed_updates
  FOR ALL USING (
    business_id IS NULL OR business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid()))
  );
