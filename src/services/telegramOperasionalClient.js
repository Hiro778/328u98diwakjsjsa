/**
 * Telegram Operasional Client Service
 *
 * Client-safe service for Telegram Operasional UI.
 * Connects to Supabase using client RLS boundaries.
 * Strictly excludes server-side execution, Node runtime environment variables, and AI Operator.
 */

import { supabase } from '../lib/supabase.js'
import {
  encryptBotToken,
  decryptBotToken,
  isEncryptedToken,
} from '../lib/telegramCrypto.js'

export { encryptBotToken, decryptBotToken, isEncryptedToken }

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  new_order: true,
  order_status: true,
  low_stock: true,
  out_of_stock: false,
}

/**
 * Masks a Telegram Bot Token for safe client display.
 * Format: 123456789:ABC...XYZ -> 123456789:AA••••••••••xyz
 */
export function maskBotToken(token) {
  if (!token || typeof token !== 'string') return ''
  const trimmed = token.trim()
  const colonIdx = trimmed.indexOf(':')
  if (colonIdx === -1) {
    return '••••••••••••'
  }
  const botId = trimmed.slice(0, colonIdx)
  const secret = trimmed.slice(colonIdx + 1)
  if (secret.length <= 6) {
    return `${botId}:••••••`
  }
  const prefix = secret.slice(0, 2)
  const suffix = secret.slice(-3)
  return `${botId}:${prefix}••••••••••${suffix}`
}

/**
 * Validates token format
 */
export function validateTokenFormat(token) {
  if (!token || typeof token !== 'string') return false
  const trimmed = token.trim()
  // Telegram Bot Token pattern: <digits>:<alphanumeric_- of 30-50 chars>
  const tokenRegex = /^\d{7,14}:[A-Za-z0-9_-]{30,50}$/
  return tokenRegex.test(trimmed)
}

/**
 * Verifies bot token with official Telegram Bot API (getMe)
 */
export async function verifyTelegramBotToken(token, { fetchFn = fetch } = {}) {
  if (!validateTokenFormat(token)) {
    return {
      valid: false,
      error: 'Bot Token tidak valid. Periksa token dari @BotFather.',
    }
  }

  try {
    const url = `https://api.telegram.org/bot${token.trim()}/getMe`
    const res = await fetchFn(url, { method: 'GET' })
    const data = await res.json()

    if (data && data.ok && data.result) {
      return {
        valid: true,
        bot: {
          id: String(data.result.id),
          username: data.result.username || '',
          firstName: data.result.first_name || '',
          canJoinGroups: data.result.can_join_groups ?? false,
        },
      }
    }

    return {
      valid: false,
      error: 'Bot Token tidak valid. Periksa token dari @BotFather.',
    }
  } catch (err) {
    return {
      valid: false,
      error: 'Gagal menghubungi Telegram Bot API. Periksa koneksi internet.',
    }
  }
}

/**
 * Get Telegram connection status for a business
 * Never exposes the raw bot_token.
 */
export async function getTelegramStatus(businessId, { mockDb = null } = {}) {
  if (!businessId) throw new Error('business_id is required')

  if (mockDb) {
    const found = mockDb.get(businessId)
    if (!found) {
      return {
        isConfigured: false,
        isConnected: false,
        status: 'disconnected',
        botUsername: null,
        botFirstName: null,
        chatId: null,
        chatTitle: null,
        maskedToken: null,
        notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      }
    }
    return {
      isConfigured: found.status === 'configured' || found.status === 'connected',
      isConnected: Boolean(found.is_connected && found.chat_id),
      status: found.status,
      botUsername: found.bot_username,
      botFirstName: found.bot_first_name,
      chatId: found.chat_id,
      chatTitle: found.chat_title,
      maskedToken: found.bot_token_masked,
      notificationPreferences: found.notification_preferences || DEFAULT_NOTIFICATION_PREFERENCES,
      connectedAt: found.created_at,
    }
  }

  try {
    const { data, error } = await supabase
      .from('telegram_bot_settings')
      .select('id, business_id, bot_token_masked, bot_id, bot_username, bot_first_name, chat_id, chat_title, is_connected, status, notification_preferences, created_at')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error || !data) {
      return {
        isConfigured: false,
        isConnected: false,
        status: 'disconnected',
        botUsername: null,
        botFirstName: null,
        chatId: null,
        chatTitle: null,
        maskedToken: null,
        notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      }
    }

    return {
      isConfigured: data.status === 'configured' || data.status === 'connected',
      isConnected: Boolean(data.is_connected && data.chat_id),
      status: data.status,
      botUsername: data.bot_username,
      botFirstName: data.bot_first_name,
      chatId: data.chat_id,
      chatTitle: data.chat_title,
      maskedToken: data.bot_token_masked,
      notificationPreferences: data.notification_preferences || DEFAULT_NOTIFICATION_PREFERENCES,
      connectedAt: data.created_at,
    }
  } catch (err) {
    console.error('[telegramOperasionalClient] getTelegramStatus error:', err)
    return {
      isConfigured: false,
      isConnected: false,
      status: 'disconnected',
      botUsername: null,
      botFirstName: null,
      chatId: null,
      chatTitle: null,
      maskedToken: null,
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    }
  }
}

/**
 * Connect Telegram Bot with a verified Bot Token
 */
export async function connectTelegramBot(
  { businessId, botToken },
  { fetchFn = fetch, mockDb = null } = {}
) {
  if (!businessId) throw new Error('business_id is required')
  if (!botToken || !String(botToken).trim()) {
    throw new Error('Bot Token wajib diisi.')
  }

  // 1. Verify token with Telegram Bot API
  const verification = await verifyTelegramBotToken(botToken, { fetchFn })
  if (!verification.valid) {
    throw new Error(verification.error || 'Bot Token tidak valid. Periksa token dari @BotFather.')
  }

  const maskedToken = maskBotToken(botToken)
  const botTokenEncrypted = await encryptBotToken(botToken.trim())
  const now = new Date().toISOString()

  const payload = {
    business_id: businessId,
    bot_token_encrypted: botTokenEncrypted,
    bot_token_masked: maskedToken,
    bot_id: verification.bot.id,
    bot_username: verification.bot.username,
    bot_first_name: verification.bot.firstName,
    chat_id: null,
    chat_title: null,
    is_connected: false,
    status: 'configured',
    notification_preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    updated_at: now,
  }

  if (mockDb) {
    mockDb.set(businessId, {
      ...payload,
      id: `tg_set_${Date.now()}`,
      created_at: now,
    })
    return {
      success: true,
      bot: verification.bot,
      maskedToken,
    }
  }

  const { error } = await supabase
    .from('telegram_bot_settings')
    .upsert(payload, { onConflict: 'business_id' })

  if (error) {
    throw new Error('Gagal menyimpan konfigurasi bot Telegram.')
  }

  return {
    success: true,
    bot: verification.bot,
    maskedToken,
  }
}

/**
 * Generate a single-use, short-lived pairing code (BS-XXXXXX) valid for 10 minutes
 */
export async function generatePairingCode(businessId, { mockDbTokens = null, now = new Date() } = {}) {
  if (!businessId) throw new Error('business_id is required')

  const randomDigits = Math.floor(100000 + Math.random() * 900000)
  const pairingCode = `BS-${randomDigits}`
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()

  const tokenPayload = {
    id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    business_id: businessId,
    pairing_code: pairingCode,
    expires_at: expiresAt,
    is_used: false,
    created_at: now.toISOString(),
  }

  if (mockDbTokens) {
    mockDbTokens.set(pairingCode, tokenPayload)
    return { pairingCode, expiresAt }
  }

  const { error } = await supabase.from('telegram_pairing_tokens').insert({
    business_id: businessId,
    pairing_code: pairingCode,
    expires_at: expiresAt,
    is_used: false,
  })

  if (error) {
    throw new Error('Gagal membuat kode pairing Telegram.')
  }

  return { pairingCode, expiresAt }
}

/**
 * Raw Telegram Bot API sendMessage call
 */
export async function sendTelegramRawMessage({ botToken, chatId, text, fetchFn = fetch }) {
  if (!botToken || !chatId || !text) {
    throw new Error('botToken, chatId, and text are required')
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  const data = await res.json()
  if (!data.ok) {
    throw new Error(data.description || 'Gagal mengirim pesan Telegram.')
  }

  return data.result
}

/**
 * Send a Test Message via Telegram Bot API
 */
export async function sendTelegramTestMessage(
  businessId,
  { customText, mockDb = null, fetchFn = fetch } = {}
) {
  if (!businessId) throw new Error('business_id is required')

  let settings = null
  if (mockDb) {
    settings = mockDb.get(businessId)
  } else {
    const { data } = await supabase
      .from('telegram_bot_settings')
      .select('bot_token_encrypted, bot_token, chat_id, is_connected')
      .eq('business_id', businessId)
      .maybeSingle()
    settings = data
  }

  const storedToken = settings?.bot_token_encrypted || settings?.bot_token
  if (!settings || !storedToken) {
    throw new Error('Bot Telegram belum dikonfigurasi.')
  }
  if (!settings.chat_id || !settings.is_connected) {
    throw new Error('Telegram belum terhubung dengan akun/chat. Selesaikan pairing terlebih dahulu.')
  }

  // Decrypt token strictly in memory
  let resolvedToken = storedToken
  if (isEncryptedToken(storedToken)) {
    resolvedToken = await decryptBotToken(storedToken)
  }

  const messageText =
    customText ||
    '🔔 <b>BisnisSehat POS &amp; Operasional</b>\n\nBisnisSehat terhubung dengan Telegram Operasional.\nSistem siap mengirim notifikasi transaksi dan stok.'

  try {
    await sendTelegramRawMessage({
      botToken: resolvedToken,
      chatId: settings.chat_id,
      text: messageText,
      fetchFn,
    })

    return { success: true, message: 'Pesan tes berhasil dikirim.' }
  } catch (err) {
    // Sanitize error: NEVER leak bot_token
    const safeError = err.message ? err.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[TOKEN]') : 'Gagal mengirim pesan Telegram.'
    throw new Error(safeError)
  }
}

/**
 * Update Notification Preferences
 */
export async function updateTelegramPreferences(businessId, preferences, { mockDb = null } = {}) {
  if (!businessId) throw new Error('business_id is required')

  const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences }

  if (mockDb) {
    const settings = mockDb.get(businessId)
    if (settings) {
      settings.notification_preferences = merged
    }
    return { success: true, preferences: merged }
  }

  const { error } = await supabase
    .from('telegram_bot_settings')
    .update({ notification_preferences: merged, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)

  if (error) {
    throw new Error('Gagal memperbarui preferensi notifikasi.')
  }

  return { success: true, preferences: merged }
}

/**
 * Disconnect Telegram integration cleanly
 */
export async function disconnectTelegram(businessId, { mockDb = null } = {}) {
  if (!businessId) throw new Error('business_id is required')

  if (mockDb) {
    mockDb.delete(businessId)
    return { success: true }
  }

  const { error } = await supabase
    .from('telegram_bot_settings')
    .delete()
    .eq('business_id', businessId)

  if (error) {
    throw new Error('Gagal memutuskan koneksi Telegram.')
  }

  return { success: true }
}
