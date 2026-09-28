-- ============================================================
-- Migration 054: Telegram Bot Token Application-Level Encryption
-- Replaces plaintext bot_token storage with AES-256-GCM encrypted
-- ciphertext (bot_token_encrypted) and column-level permission shielding.
-- ============================================================

-- 1. Add bot_token_encrypted column if not exists
ALTER TABLE public.telegram_bot_settings
  ADD COLUMN IF NOT EXISTS bot_token_encrypted TEXT;

-- 2. Drop the plaintext bot_token column to prevent any plaintext storage in Postgres
ALTER TABLE public.telegram_bot_settings
  DROP COLUMN IF EXISTS bot_token;

-- 3. Create a Safe View for Tenant Queries (excludes bot_token_encrypted completely)
CREATE OR REPLACE VIEW public.telegram_bot_settings_safe
WITH (security_invoker = on) AS
  SELECT
    id,
    business_id,
    bot_token_masked,
    bot_id,
    bot_username,
    bot_first_name,
    chat_id,
    chat_title,
    is_connected,
    status,
    notification_preferences,
    created_at,
    updated_at
  FROM public.telegram_bot_settings;

-- 4. Restrict column-level SELECT permissions on telegram_bot_settings
-- Ensure authenticated and anon roles cannot select bot_token_encrypted directly
REVOKE SELECT (bot_token_encrypted) ON public.telegram_bot_settings FROM anon, authenticated;
GRANT SELECT (
  id,
  business_id,
  bot_token_masked,
  bot_id,
  bot_username,
  bot_first_name,
  chat_id,
  chat_title,
  is_connected,
  status,
  notification_preferences,
  created_at,
  updated_at
) ON public.telegram_bot_settings TO authenticated;

-- Service role retains full access for Edge Functions and server tasks
GRANT ALL ON public.telegram_bot_settings TO service_role;
GRANT ALL ON public.telegram_bot_settings_safe TO authenticated, service_role;

-- 5. Comments for Documentation and Audit
COMMENT ON COLUMN public.telegram_bot_settings.bot_token_encrypted IS
  'Application-level AES-256-GCM encrypted Telegram Bot Token. Never stored or returned in plaintext.';
COMMENT ON COLUMN public.telegram_bot_settings.bot_token_masked IS
  'Masked bot token format (e.g. 123456789:AA••••••••••xyz) safe for UI display.';
