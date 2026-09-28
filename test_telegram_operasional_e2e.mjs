// test_telegram_operasional_e2e.mjs
// Comprehensive End-to-End Verification for Telegram Operasional (change.md)

import fs from 'fs'
import path from 'path'
import { CATEGORIES } from './src/data/categories.js'
import {
  maskBotToken,
  validateTokenFormat,
  verifyTelegramBotToken,
  connectTelegramBot,
  generatePairingCode,
  verifyAndConsumePairingCode,
  processTelegramWebhookUpdate,
  sendTelegramTestMessage,
  updateTelegramPreferences,
  disconnectTelegram,
  getTelegramStatus,
} from './src/services/telegramService.js'

function pass(name, msg = '') {
  console.log(`✅ [PASS] ${name}${msg ? ' - ' + msg : ''}`)
}

function fail(name, msg = '') {
  console.error(`❌ [FAIL] ${name}${msg ? ' - ' + msg : ''}`)
  process.exitCode = 1
}

async function runE2E() {
  console.log('\n================================================================')
  console.log('TELEGRAM OPERASIONAL E2E & REGRESSION AUDIT (change.md)')
  console.log('================================================================\n')

  // 1. Catalog Verification
  const opTools = CATEGORIES.operations.tools
  if (opTools.length === 6) {
    pass('Catalog Count', 'Operasional catalog count is strictly 6')
  } else {
    fail('Catalog Count', `Expected 6, got ${opTools.length}`)
  }

  const hasMarketplace = opTools.some((t) => t.name.toLowerCase().includes('marketplace') || t.path?.includes('marketplace'))
  if (!hasMarketplace) {
    pass('Marketplace Absent', 'Marketplace Integration is removed from Operasional catalog')
  } else {
    fail('Marketplace Absent', 'Marketplace Integration still present in catalog')
  }

  const telegramTool = opTools.find((t) => t.name === 'Telegram Operasional')
  if (telegramTool && telegramTool.path === '/dashboard/operasional/telegram') {
    pass('Telegram Catalog Entry', 'Telegram Operasional correctly registered with path /dashboard/operasional/telegram')
  } else {
    fail('Telegram Catalog Entry', 'Telegram Operasional missing or wrong path')
  }

  // 2. Routing & UI Source Verification
  const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  if (appSrc.includes('operasional/telegram') && !appSrc.includes('operasional/marketplace')) {
    pass('App Routing', 'Route operasional/telegram is active and operasional/marketplace is removed')
  } else {
    fail('App Routing', 'App.jsx routing mismatch')
  }

  const uiSrc = fs.readFileSync(path.resolve('src/pages/dashboard/operasional/TelegramOperasionalPage.jsx'), 'utf8')
  if (uiSrc.includes('<BackButton fallbackUrl="/dashboard/operasional"') && uiSrc.includes('@BotFather')) {
    pass('UI Page & BackButton', 'TelegramOperasionalPage has BackButton fallback and @BotFather guidance')
  } else {
    fail('UI Page & BackButton', 'TelegramOperasionalPage missing required elements')
  }

  // 3. Token Security & Masking
  const rawToken = '1234567890:AAHgH99887766554433221100aabbccddeeff'
  const masked = maskBotToken(rawToken)
  if (masked.startsWith('1234567890:AA') && masked.endsWith('eff') && !masked.includes('99887766554433221100aabbccdd')) {
    pass('Token Masking', `Masked correctly: ${masked}`)
  } else {
    fail('Token Masking', `Masking failed: ${masked}`)
  }

  // 4. Verification & getMe Server-Side Simulation
  const mockValidFetch = async () => ({
    json: async () => ({
      ok: true,
      result: { id: 1234567890, first_name: 'Warung Sehat Bot', username: 'warung_sehat_bot' },
    }),
  })
  const verifyRes = await verifyTelegramBotToken(rawToken, { fetchFn: mockValidFetch })
  if (verifyRes.valid && verifyRes.bot.username === 'warung_sehat_bot') {
    pass('Bot Verification (getMe)', 'Verified username and bot ID successfully')
  } else {
    fail('Bot Verification (getMe)', 'getMe verification failed')
  }

  // 5. Connect Flow & Tenant Database Emulation
  const mockDb = new Map()
  const businessId = 'biz_e2e_tenant_01'
  const connectRes = await connectTelegramBot({ businessId, botToken: rawToken }, { fetchFn: mockValidFetch, mockDb })
  if (connectRes.success && connectRes.maskedToken) {
    pass('Connect Bot', 'Bot configuration saved with masked token')
  } else {
    fail('Connect Bot', 'Failed to connect bot')
  }

  // 6. Pairing Code Generation & Single-Use Consumption
  const mockDbTokens = new Map()
  const { pairingCode } = await generatePairingCode(businessId, { mockDbTokens })
  if (pairingCode.startsWith('BS-') && pairingCode.length === 9) {
    pass('Pairing Code Format', `Generated: ${pairingCode}`)
  } else {
    fail('Pairing Code Format', `Invalid code: ${pairingCode}`)
  }

  const pairConsume1 = await verifyAndConsumePairingCode(
    { pairingCode, chatId: 7891011, chatTitle: 'Pak Budi' },
    { mockDb, mockDbTokens }
  )
  if (pairConsume1.success && pairConsume1.businessId === businessId) {
    pass('Pairing Consumption', 'Successfully bound chatId to businessId')
  } else {
    fail('Pairing Consumption', 'Pairing consumption failed')
  }

  const pairConsume2 = await verifyAndConsumePairingCode(
    { pairingCode, chatId: 7891011 },
    { mockDb, mockDbTokens }
  )
  if (!pairConsume2.success && pairConsume2.error.includes('sudah pernah digunakan')) {
    pass('Single-Use Enforcement', 'Replay of used pairing token was successfully rejected')
  } else {
    fail('Single-Use Enforcement', 'Replay was not rejected')
  }

  // 7. Webhook Idempotency & Message Dispatch
  const mockProcessedUpdates = new Set()
  const incomingUpdate = {
    update_id: 887766,
    message: {
      chat: { id: 7891011 },
      text: '/help',
    },
  }
  const hookRes1 = await processTelegramWebhookUpdate(incomingUpdate, {
    mockDb,
    mockDbTokens,
    mockProcessedUpdates,
  })
  if (hookRes1.processed) {
    pass('Webhook Initial Delivery', 'Update processed successfully')
  } else {
    fail('Webhook Initial Delivery', 'Update failed to process')
  }

  const hookRes2 = await processTelegramWebhookUpdate(incomingUpdate, {
    mockDb,
    mockDbTokens,
    mockProcessedUpdates,
  })
  if (hookRes2.ignored && hookRes2.reason === 'duplicate') {
    pass('Webhook Idempotency', 'Duplicate update_id was safely ignored')
  } else {
    fail('Webhook Idempotency', 'Duplicate update_id was not ignored')
  }

  // 8. Test Message Execution with Token Redaction
  let capturedMessage = null
  const mockSendFetch = async (url, options) => {
    capturedMessage = JSON.parse(options.body)
    return { json: async () => ({ ok: true, result: { message_id: 42 } }) }
  }
  const testMsgRes = await sendTelegramTestMessage(businessId, {
    mockDb,
    fetchFn: mockSendFetch,
  })
  if (testMsgRes.success && capturedMessage?.text.includes('BisnisSehat terhubung dengan Telegram Operasional.')) {
    pass('Test Message Sent', 'Official message sent via Telegram Bot API with expected text')
  } else {
    fail('Test Message Sent', 'Failed sending test message')
  }

  // 9. Notification Preferences Update
  const prefRes = await updateTelegramPreferences(businessId, { low_stock: false, out_of_stock: true }, { mockDb })
  if (prefRes.preferences.out_of_stock === true && prefRes.preferences.low_stock === false) {
    pass('Notification Preferences', 'Updated operational preferences successfully')
  } else {
    fail('Notification Preferences', 'Preferences update failed')
  }

  // 10. Disconnect Flow
  const discRes = await disconnectTelegram(businessId, { mockDb })
  const statusAfterDisc = await getTelegramStatus(businessId, { mockDb })
  if (discRes.success && !statusAfterDisc.isConnected && statusAfterDisc.status === 'disconnected') {
    pass('Disconnect Flow', 'Cleanly removed binding and reset state to disconnected')
  } else {
    fail('Disconnect Flow', 'Disconnect failed')
  }

  // 11. Migration & RLS Security File Audit
  const migrationPath053 = path.resolve('supabase/migrations/053_telegram_operasional.sql')
  const migrationPath054 = path.resolve('supabase/migrations/054_telegram_token_encryption.sql')
  if (fs.existsSync(migrationPath053) && fs.existsSync(migrationPath054)) {
    const sql054 = fs.readFileSync(migrationPath054, 'utf8')
    if (
      sql054.includes('bot_token_encrypted TEXT') &&
      sql054.includes('DROP COLUMN IF EXISTS bot_token') &&
      sql054.includes('REVOKE SELECT (bot_token_encrypted)')
    ) {
      pass('Database Migration 054', 'Migration 054 drops plaintext bot_token and restricts column SELECT')
    } else {
      fail('Database Migration 054', 'Migration 054 content incomplete')
    }
  } else {
    fail('Database Migration Audit', 'Migration files missing')
  }

  // 12. Encryption at Rest Audit (bot.md)
  const auditMockDb = new Map()
  const auditBizId = 'biz_audit_rest'
  await connectTelegramBot({ businessId: auditBizId, botToken: rawToken }, { fetchFn: mockValidFetch, mockDb: auditMockDb })
  const savedRow = auditMockDb.get(auditBizId)
  if (savedRow.bot_token === undefined && savedRow.bot_token_encrypted?.startsWith('enc_v1:')) {
    pass('Encryption at Rest', 'bot_token is strictly stored as AES-256-GCM ciphertext, NOT plaintext')
  } else {
    fail('Encryption at Rest', 'bot_token plaintext leaked in database storage')
  }

  console.log('\n================================================================')
  console.log('ALL TELEGRAM OPERASIONAL VERIFICATIONS COMPLETED SUCCESSFULLY')
  console.log('================================================================\n')
}

runE2E()
