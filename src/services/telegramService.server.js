/**
 * Telegram Operasional Server Service
 *
 * Server-only service for handling Telegram Webhook updates,
 * pairing verification, and AI Operator message routing.
 * Must NEVER be imported into client-side browser bundles.
 */

import { supabase } from '../lib/supabase.js'
import {
  encryptBotToken,
  decryptBotToken,
  isEncryptedToken,
} from '../lib/telegramCrypto.js'
import { processAiOperatorMessage } from './telegramAiOperator.server.js'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  maskBotToken,
  validateTokenFormat,
  verifyTelegramBotToken,
  getTelegramStatus,
  connectTelegramBot,
  generatePairingCode,
  sendTelegramRawMessage,
  sendTelegramTestMessage,
  updateTelegramPreferences,
  disconnectTelegram,
} from './telegramOperasionalClient.js'

export {
  encryptBotToken,
  decryptBotToken,
  isEncryptedToken,
  DEFAULT_NOTIFICATION_PREFERENCES,
  maskBotToken,
  validateTokenFormat,
  verifyTelegramBotToken,
  getTelegramStatus,
  connectTelegramBot,
  generatePairingCode,
  sendTelegramRawMessage,
  sendTelegramTestMessage,
  updateTelegramPreferences,
  disconnectTelegram,
}

/**
 * Verifies and consumes a pairing token to link chat_id to a business
 */
export async function verifyAndConsumePairingCode(
  { pairingCode, chatId, chatTitle = '' },
  { mockDb = null, mockDbTokens = null, now = new Date() } = {}
) {
  if (!pairingCode) return { success: false, error: 'Kode pairing diperlukan.' }
  if (!chatId) return { success: false, error: 'Chat ID diperlukan.' }

  const cleanCode = pairingCode.trim().toUpperCase()

  if (mockDbTokens && mockDb) {
    const tokenRecord = mockDbTokens.get(cleanCode)
    if (!tokenRecord) {
      return { success: false, error: 'Kode pairing tidak ditemukan.' }
    }
    if (tokenRecord.is_used) {
      return { success: false, error: 'Kode pairing sudah pernah digunakan.' }
    }
    if (new Date(tokenRecord.expires_at).getTime() < now.getTime()) {
      return { success: false, error: 'Kode pairing sudah kedaluwarsa.' }
    }

    // Consume token
    tokenRecord.is_used = true
    tokenRecord.used_at = now.toISOString()

    // Bind chat
    const settings = mockDb.get(tokenRecord.business_id)
    if (settings) {
      settings.chat_id = String(chatId)
      settings.chat_title = chatTitle || 'Private Chat'
      settings.is_connected = true
      settings.status = 'connected'
      settings.updated_at = now.toISOString()
    }

    return { success: true, businessId: tokenRecord.business_id }
  }

  // Production Supabase flow
  const { data: tokenRecord, error: tokenErr } = await supabase
    .from('telegram_pairing_tokens')
    .select('*')
    .eq('pairing_code', cleanCode)
    .eq('is_used', false)
    .gt('expires_at', now.toISOString())
    .maybeSingle()

  if (tokenErr || !tokenRecord) {
    return {
      success: false,
      error: 'Kode pairing tidak valid atau sudah kedaluwarsa.',
    }
  }

  // Mark token used
  await supabase
    .from('telegram_pairing_tokens')
    .update({ is_used: true, used_at: now.toISOString() })
    .eq('id', tokenRecord.id)

  // Bind chat_id to business
  const { error: updateErr } = await supabase
    .from('telegram_bot_settings')
    .update({
      chat_id: String(chatId),
      chat_title: chatTitle || 'Private Chat',
      is_connected: true,
      status: 'connected',
      updated_at: now.toISOString(),
    })
    .eq('business_id', tokenRecord.business_id)

  if (updateErr) {
    return { success: false, error: 'Gagal menghubungkan chat Telegram ke bisnis.' }
  }

  return { success: true, businessId: tokenRecord.business_id }
}

/**
 * Processes incoming Telegram Webhook updates with strict idempotency
 */
export async function processTelegramWebhookUpdate(
  update,
  {
    mockDb = null,
    mockDbTokens = null,
    mockProcessedUpdates = null,
    fetchFn = fetch,
    now = new Date(),
  } = {}
) {
  if (!update || !update.update_id) {
    return { ignored: true, reason: 'invalid_update' }
  }

  const updateId = update.update_id

  // 1. Idempotency Check
  if (mockProcessedUpdates) {
    if (mockProcessedUpdates.has(updateId)) {
      return { ignored: true, reason: 'duplicate' }
    }
    mockProcessedUpdates.add(updateId)
  } else {
    const { data: existing } = await supabase
      .from('telegram_processed_updates')
      .select('update_id')
      .eq('update_id', updateId)
      .maybeSingle()

    if (existing) {
      return { ignored: true, reason: 'duplicate' }
    }

    await supabase.from('telegram_processed_updates').insert({ update_id: updateId })
  }

  // 2. Parse message
  const msg = update.message || update.edited_message
  if (!msg || !msg.text) {
    return { processed: true, action: 'no_text' }
  }

  const text = msg.text.trim()
  const chatId = msg.chat?.id
  const chatTitle = msg.chat?.title || msg.chat?.username || msg.chat?.first_name || ''

  // Look for pairing code: BS-XXXXXX
  const pairingMatch = text.match(/BS-\d{6}/i)
  if (pairingMatch) {
    const code = pairingMatch[0].toUpperCase()
    const pairRes = await verifyAndConsumePairingCode(
      { pairingCode: code, chatId, chatTitle },
      { mockDb, mockDbTokens, now }
    )

    if (pairRes.success) {
      // Send confirmation message to user on Telegram
      let botToken = null
      if (mockDb) {
        const rawOrEnc =
            mockDb.get(pairRes.businessId)?.bot_token_encrypted ||
            mockDb.get(pairRes.businessId)?.bot_token
        if (rawOrEnc) {
          botToken = isEncryptedToken(rawOrEnc) ? await decryptBotToken(rawOrEnc) : rawOrEnc
        }
      }

      if (botToken) {
        await sendTelegramRawMessage({
          botToken,
          chatId,
          text: '🎉 Selamat! BisnisSehat berhasil terhubung dengan Telegram Operasional Anda.\n\nNotifikasi order baru dan peringatan stok akan dikirimkan ke sini.',
          fetchFn,
        })
      }

      return { processed: true, action: 'paired', businessId: pairRes.businessId }
    } else {
      return { processed: true, action: 'pairing_failed', error: pairRes.error }
    }
  }

  // 3. Resolve businessId from authenticated Telegram connection
  let businessId = null
  let botToken = null

  if (mockDb) {
    for (const [bId, settings] of mockDb.entries()) {
      if (String(settings.chat_id) === String(chatId) && settings.is_connected) {
        businessId = bId
        const rawOrEnc = settings.bot_token_encrypted || settings.bot_token
        if (rawOrEnc) {
          botToken = isEncryptedToken(rawOrEnc) ? await decryptBotToken(rawOrEnc) : rawOrEnc
        }
        break
      }
    }
  } else {
    const { data: settings } = await supabase
      .from('telegram_bot_settings')
      .select('business_id, bot_token_encrypted, bot_token, chat_id, is_connected')
      .eq('chat_id', String(chatId))
      .eq('is_connected', true)
      .maybeSingle()

    if (settings) {
      businessId = settings.business_id
      const rawOrEnc = settings.bot_token_encrypted || settings.bot_token
      if (rawOrEnc) {
        botToken = isEncryptedToken(rawOrEnc) ? await decryptBotToken(rawOrEnc) : rawOrEnc
      }
    }
  }

  if (!businessId) {
    return {
      processed: true,
      action: 'unauthorized_chat',
      reply: 'Chat Telegram ini belum terhubung dengan akun BisnisSehat. Silakan lakukan pairing dari menu Operasional terlebih dahulu.',
    }
  }

  // 4. Delegate to BisnisSehat AI Operator
  const { reply } = await processAiOperatorMessage({
    chatId,
    text,
    businessId,
    mockDb,
    fetchFn,
  })

  if (reply && botToken) {
    try {
      await sendTelegramRawMessage({
        botToken,
        chatId,
        text: reply,
        fetchFn,
      })
    } catch {
      // Message delivery logged
    }
  }

  return { processed: true, action: 'ai_operator_handled', businessId, reply }
}
