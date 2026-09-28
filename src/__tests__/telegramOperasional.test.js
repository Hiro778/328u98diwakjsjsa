// src/__tests__/telegramOperasional.test.js
// Complete Unit & Regression Test Suite for Telegram Operasional per change.md (Tests A through O)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { CATEGORIES } from '../data/categories.js'
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
} from '../services/telegramService.js'

describe('Telegram Operasional Specification & Security Suite (change.md)', () => {
  // Test A: Marketplace does NOT appear in tool catalog
  it('A. Marketplace does NOT appear in tool catalog (operations tools)', () => {
    const operationsTools = CATEGORIES.operations.tools
    const marketplaceTool = operationsTools.find(
      (t) =>
        t.id === 'marketplace' ||
        t.name?.toLowerCase().includes('marketplace') ||
        t.path?.includes('marketplace')
    )
    assert.equal(marketplaceTool, undefined, 'Marketplace Integration must be completely absent from operations tools')

    // Also check BusinessTools.jsx
    const businessToolsSrc = fs.readFileSync(path.resolve('src/sections/BusinessTools.jsx'), 'utf8')
    assert.ok(
      !businessToolsSrc.includes("'Marketplace Integration'"),
      'Marketplace Integration must not appear in BusinessTools.jsx'
    )
  })

  // Test B: Operasional count is strictly 6
  it('B. Operasional tools count is strictly 6', () => {
    const operationsTools = CATEGORIES.operations.tools
    assert.equal(operationsTools.length, 6, 'Operations category tools count must be strictly 6')

    const expectedToolNames = [
      'QR Menu & Pesanan',
      'POS / Kasir',
      'Inventory Management',
      'Supplier Database',
      'Production Capacity Planner',
      'Excel Penjualan Otomatis',
    ]

    const actualNames = operationsTools.map((t) => t.name)
    assert.deepEqual(
      actualNames.sort(),
      expectedToolNames.sort(),
      'Operations category must contain exactly the 6 defined tools'
    )
  })

  // Test C: Telegram tool is replaced with Excel Penjualan Otomatis per excell.md
  it('C. Telegram tool is removed from active catalog and replaced with Excel Penjualan Otomatis', () => {
    const telegramTool = CATEGORIES.operations.tools.find((t) => t.name === 'Telegram Operasional')
    assert.equal(telegramTool, undefined, 'Telegram Operasional must NOT be active in operations.tools')

    const excelTool = CATEGORIES.operations.tools.find((t) => t.name === 'Excel Penjualan Otomatis')
    assert.ok(excelTool, 'Excel Penjualan Otomatis must exist in operations.tools')
    assert.equal(excelTool.path, '/dashboard/operasional/excel-penjualan')
  })

  // Test D: Telegram route is configured in src/App.jsx
  it('D. Telegram route is configured in src/App.jsx and marketplace route is removed', () => {
    const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
    assert.ok(
      appSrc.includes("operasional/telegram"),
      'App.jsx must configure path: operasional/telegram'
    )
    assert.ok(
      appSrc.includes("TelegramOperasionalPage"),
      'App.jsx must import and use TelegramOperasionalPage'
    )
    assert.ok(
      !appSrc.includes("operasional/marketplace"),
      'App.jsx must NOT contain operasional/marketplace route'
    )
  })

  // Test E: Invalid Bot Token is rejected by verification logic
  it('E. Invalid Bot Token is rejected by verification logic', async () => {
    assert.equal(validateTokenFormat(''), false)
    assert.equal(validateTokenFormat('12345'), false)
    assert.equal(validateTokenFormat('abcdef:ghijklmn'), false)
    assert.equal(validateTokenFormat('12345678:short'), false)

    const result = await verifyTelegramBotToken('invalid_token_format')
    assert.equal(result.valid, false)
    assert.ok(result.error.includes('Bot Token tidak valid'))

    // Test rejection with mock fetch returning Telegram 401 Unauthorized
    const mockFetch401 = async () => ({
      json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }),
    })
    const validFormatButUnknown = '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
    const res401 = await verifyTelegramBotToken(validFormatButUnknown, { fetchFn: mockFetch401 })
    assert.equal(res401.valid, false)
    assert.ok(res401.error.includes('Bot Token tidak valid'))
  })

  // Test F: Valid Bot Token is verified via getMe
  it('F. Valid Bot Token is verified via getMe', async () => {
    const mockFetch200 = async (url) => {
      assert.ok(url.includes('/getMe'), 'Must invoke getMe endpoint')
      return {
        json: async () => ({
          ok: true,
          result: {
            id: 987654321,
            is_bot: true,
            first_name: 'BisnisSehat Ops Bot',
            username: 'bisnissehat_ops_bot',
            can_join_groups: true,
          },
        }),
      }
    }

    const testToken = '987654321:AAHk1_exampleTokenForTestingPurposes123'
    const res = await verifyTelegramBotToken(testToken, { fetchFn: mockFetch200 })
    assert.equal(res.valid, true)
    assert.equal(res.bot.id, '987654321')
    assert.equal(res.bot.username, 'bisnissehat_ops_bot')
    assert.equal(res.bot.firstName, 'BisnisSehat Ops Bot')
  })

  // Test G: Token is masked and not returned in plaintext to browser
  it('G. Token is masked and not returned in plaintext to browser', () => {
    const rawToken = '7123456789:AAFgH1234567890abcdefghijklmnopqr'
    const masked = maskBotToken(rawToken)

    assert.ok(!masked.includes('AAFgH1234567890abcdefghijklmnopqr'), 'Full secret must not be present')
    assert.ok(masked.startsWith('7123456789:AA'), 'Must preserve bot id and 2-char prefix')
    assert.ok(masked.endsWith('pqr'), 'Must preserve 3-char suffix')
    assert.ok(masked.includes('••••••••••'), 'Must contain mask bullets')
  })

  // Test H: Tenant A cannot read/modify Tenant B Telegram configuration
  it('H. Tenant A cannot read/modify Tenant B Telegram configuration (Tenant Isolation)', async () => {
    const mockDb = new Map()

    const tenantA = 'business_uuid_aaa'
    const tenantB = 'business_uuid_bbb'

    const mockFetch = async () => ({
      json: async () => ({
        ok: true,
        result: { id: 111, username: 'bot_a', first_name: 'Bot A' },
      }),
    })

    // Setup Tenant A
    await connectTelegramBot(
      { businessId: tenantA, botToken: '1111111111:AAHk1_tenantA_mockTokenForTest12345' },
      { fetchFn: mockFetch, mockDb }
    )

    // Tenant B queries status
    const statusB = await getTelegramStatus(tenantB, { mockDb })
    assert.equal(statusB.isConfigured, false)
    assert.equal(statusB.botUsername, null)

    // Tenant A queries status
    const statusA = await getTelegramStatus(tenantA, { mockDb })
    assert.equal(statusA.isConfigured, true)
    assert.equal(statusA.botUsername, 'bot_a')
    assert.ok(!statusA.maskedToken.includes('AAHk1_tenantA_mockTokenForTest12345'))

    // Verify migration RLS policy file enforces business_id isolation
    const migrationSql = fs.readFileSync(
      path.resolve('supabase/migrations/053_telegram_operasional.sql'),
      'utf8'
    )
    assert.ok(
      migrationSql.includes('business_id IN (SELECT id FROM public.businesses WHERE owner_id ='),
      'Migration must enforce tenant isolation through business owner check'
    )
    assert.ok(
      migrationSql.includes('ENABLE ROW LEVEL SECURITY'),
      'Migration must enable RLS on all telegram tables'
    )
  })

  // Test I: Expired pairing token is rejected
  it('I. Expired pairing token is rejected', async () => {
    const mockDbTokens = new Map()
    const mockDb = new Map()
    const businessId = 'biz_test_pairing'

    const baseTime = new Date('2026-09-19T10:00:00.000Z')
    const { pairingCode } = await generatePairingCode(businessId, {
      mockDbTokens,
      now: baseTime,
    })

    // Attempt to verify 11 minutes later (expiry is 10 minutes)
    const elevenMinutesLater = new Date('2026-09-19T10:11:00.000Z')
    const result = await verifyAndConsumePairingCode(
      { pairingCode, chatId: 123456789 },
      { mockDb, mockDbTokens, now: elevenMinutesLater }
    )

    assert.equal(result.success, false)
    assert.ok(result.error.includes('kedaluwarsa'), 'Must state that token is expired')
  })

  // Test J: Pairing token is single-use
  it('J. Pairing token is single-use and cannot be re-consumed', async () => {
    const mockDbTokens = new Map()
    const mockDb = new Map()
    const businessId = 'biz_single_use'

    mockDb.set(businessId, {
      business_id: businessId,
      bot_token: '1234567890:AAFgH1234567890abcdefghijklmnopqr',
      is_connected: false,
    })

    const baseTime = new Date('2026-09-19T10:00:00.000Z')
    const { pairingCode } = await generatePairingCode(businessId, {
      mockDbTokens,
      now: baseTime,
    })

    // First consumption: Success
    const res1 = await verifyAndConsumePairingCode(
      { pairingCode, chatId: 999888 },
      { mockDb, mockDbTokens, now: new Date('2026-09-19T10:02:00.000Z') }
    )
    assert.equal(res1.success, true)
    assert.equal(res1.businessId, businessId)

    // Second consumption with same token: Rejected
    const res2 = await verifyAndConsumePairingCode(
      { pairingCode, chatId: 999888 },
      { mockDb, mockDbTokens, now: new Date('2026-09-19T10:03:00.000Z') }
    )
    assert.equal(res2.success, false)
    assert.ok(res2.error.includes('sudah pernah digunakan'), 'Must reject reused pairing token')
  })

  // Test K: Chat ID is only linked after valid pairing code
  it('K. Chat ID is only linked after valid pairing code verification', async () => {
    const mockDbTokens = new Map()
    const mockDb = new Map()
    const businessId = 'biz_chat_id_link'

    mockDb.set(businessId, {
      business_id: businessId,
      bot_token: '1234567890:AAFgH1234567890abcdefghijklmnopqr',
      chat_id: null,
      is_connected: false,
      status: 'configured',
    })

    // Random non-existent pairing code fails
    const badRes = await verifyAndConsumePairingCode(
      { pairingCode: 'BS-999999', chatId: 77777 },
      { mockDb, mockDbTokens }
    )
    assert.equal(badRes.success, false)
    assert.equal(mockDb.get(businessId).chat_id, null)
    assert.equal(mockDb.get(businessId).is_connected, false)

    // Legitimate pairing code succeeds and links chat_id
    const { pairingCode } = await generatePairingCode(businessId, { mockDbTokens })
    const goodRes = await verifyAndConsumePairingCode(
      { pairingCode, chatId: 77777, chatTitle: '@manager_telegram' },
      { mockDb, mockDbTokens }
    )
    assert.equal(goodRes.success, true)
    assert.equal(mockDb.get(businessId).chat_id, '77777')
    assert.equal(mockDb.get(businessId).is_connected, true)
    assert.equal(mockDb.get(businessId).status, 'connected')
  })

  // Test L: Duplicate Telegram update is idempotent
  it('L. Duplicate Telegram update is idempotent (rejected/ignored)', async () => {
    const mockDbTokens = new Map()
    const mockDb = new Map()
    const mockProcessedUpdates = new Set()

    const update1 = {
      update_id: 554433,
      message: {
        chat: { id: 12345 },
        text: '/start',
      },
    }

    const firstRun = await processTelegramWebhookUpdate(update1, {
      mockDb,
      mockDbTokens,
      mockProcessedUpdates,
    })
    assert.equal(firstRun.ignored, undefined)

    // Repeat same update_id
    const secondRun = await processTelegramWebhookUpdate(update1, {
      mockDb,
      mockDbTokens,
      mockProcessedUpdates,
    })
    assert.equal(secondRun.ignored, true)
    assert.equal(secondRun.reason, 'duplicate')
  })

  // Test M: Test message triggers official Bot API and sanitizes secret errors
  it('M. Test message triggers official Bot API with sanitized errors', async () => {
    const mockDb = new Map()
    const businessId = 'biz_test_msg'

    mockDb.set(businessId, {
      business_id: businessId,
      bot_token: '1234567890:AAFgH1234567890abcdefghijklmnopqr',
      chat_id: '998877',
      is_connected: true,
    })

    let sentPayload = null
    const mockFetchSuccess = async (url, options) => {
      sentPayload = JSON.parse(options.body)
      return {
        json: async () => ({ ok: true, result: { message_id: 101 } }),
      }
    }

    const res = await sendTelegramTestMessage(businessId, {
      mockDb,
      fetchFn: mockFetchSuccess,
    })
    assert.equal(res.success, true)
    assert.equal(sentPayload.chat_id, '998877')
    assert.ok(sentPayload.text.includes('BisnisSehat terhubung dengan Telegram Operasional'))

    // Error case: Ensure raw token is never exposed in error message
    const mockFetchErrorWithTokenLeak = async () => {
      throw new Error(
        'Failed request to https://api.telegram.org/bot1234567890:AAFgH1234567890abcdefghijklmnopqr/sendMessage'
      )
    }

    await assert.rejects(
      async () => {
        await sendTelegramTestMessage(businessId, {
          mockDb,
          fetchFn: mockFetchErrorWithTokenLeak,
        })
      },
      (err) => {
        assert.ok(!err.message.includes('AAFgH1234567890abcdefghijklmnopqr'), 'Must not leak token in error')
        return true
      }
    )
  })

  // Test N: Disconnect cleanly deletes/deactivates binding
  it('N. Disconnect cleanly deactivates binding', async () => {
    const mockDb = new Map()
    const businessId = 'biz_disconnect'

    mockDb.set(businessId, {
      business_id: businessId,
      bot_token: '1234567890:AAFgH1234567890abcdefghijklmnopqr',
      chat_id: '123',
      is_connected: true,
      status: 'connected',
    })

    const res = await disconnectTelegram(businessId, { mockDb })
    assert.equal(res.success, true)

    const statusAfter = await getTelegramStatus(businessId, { mockDb })
    assert.equal(statusAfter.isConfigured, false)
    assert.equal(statusAfter.isConnected, false)
    assert.equal(statusAfter.status, 'disconnected')
  })

  // Test O: Marketplace cleanup does not damage other features
  it('O. Marketplace cleanup does not damage other operational and POS features', () => {
    // Verify core operational and POS tools are completely intact
    const posPage = path.resolve('src/pages/dashboard/pos/PosPage.jsx')
    const qrPage = path.resolve('src/pages/dashboard/pos/QRMenuPage.jsx')
    const inventoryPage = path.resolve('src/sections/Inventory/InventoryPage.jsx')
    const supplierPage = path.resolve('src/pages/dashboard/operasional/SupplierDatabasePage.jsx')
    const capacityPage = path.resolve('src/pages/dashboard/operasional/ProductionCapacityPlanner.jsx')
    const waPage = path.resolve('src/sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx')

    assert.ok(fs.existsSync(posPage), 'POS page must exist')
    assert.ok(fs.existsSync(qrPage), 'QR Menu page must exist')
    assert.ok(fs.existsSync(inventoryPage), 'Inventory page must exist')
    assert.ok(fs.existsSync(supplierPage), 'Supplier Database page must exist')
    assert.ok(fs.existsSync(capacityPage), 'Production Capacity Planner page must exist')
    assert.ok(fs.existsSync(waPage), 'WhatsApp Operasional page must exist')

    // Historical marketplace migrations 031 and 032 are untouched
    assert.ok(
      fs.existsSync(path.resolve('supabase/migrations/031_marketplace_integration.sql')),
      'Migration 031 must not be deleted'
    )
    assert.ok(
      fs.existsSync(path.resolve('supabase/migrations/032_marketplace_oauth_flow.sql')),
      'Migration 032 must not be deleted'
    )
  })

  // ============================================================
  // bot.md: SECURITY AUDIT — TELEGRAM BOT TOKEN STORAGE TESTS
  // ============================================================

  // Test P: Database storage does NOT store plaintext token
  it('P. Database storage does NOT store plaintext token (stores AES-256-GCM ciphertext only)', async () => {
    const mockDb = new Map()
    const businessId = 'biz_enc_storage_audit'
    const rawSecretToken = '5554443332:AAHgH_strictlySecretPlaintextTokenToAudit123'

    const mockFetch = async () => ({
      json: async () => ({
        ok: true,
        result: { id: 5554443332, username: 'audit_bot', first_name: 'Audit Bot' },
      }),
    })

    await connectTelegramBot({ businessId, botToken: rawSecretToken }, { fetchFn: mockFetch, mockDb })

    const storedRow = mockDb.get(businessId)
    assert.ok(storedRow, 'Stored record must exist')

    // Plaintext token must NOT be stored in database
    assert.equal(storedRow.bot_token, undefined, 'Database row must NOT have plaintext bot_token column')
    assert.ok(storedRow.bot_token_encrypted, 'Database row must have bot_token_encrypted')
    assert.ok(storedRow.bot_token_encrypted.startsWith('enc_v1:'), 'Encrypted token must have enc_v1: prefix')
    assert.ok(
      !storedRow.bot_token_encrypted.includes(rawSecretToken),
      'Ciphertext must not contain plaintext token'
    )
  })

  // Test Q: Encryption uses unique IV (Non-deterministic ciphertext)
  it('Q. Encryption uses unique IV (same token encrypted twice produces different ciphertexts)', async () => {
    const { encryptBotToken } = await import('../lib/telegramCrypto.js')
    const rawToken = '1234567890:AAHgH_uniqueIvTest1234567890'

    const enc1 = await encryptBotToken(rawToken)
    const enc2 = await encryptBotToken(rawToken)

    assert.notEqual(enc1, enc2, 'Two encryptions of same token must differ due to unique 12-byte IVs')
  })

  // Test R: In-memory decryption recovers the exact token for Telegram API call
  it('R. In-memory decryption recovers the exact token for Telegram API call', async () => {
    const { encryptBotToken, decryptBotToken } = await import('../lib/telegramCrypto.js')
    const rawToken = '9876543210:AAHgH_recoveryTestToken12345'

    const encrypted = await encryptBotToken(rawToken)
    const decrypted = await decryptBotToken(encrypted)

    assert.equal(decrypted, rawToken, 'Decrypted token must match original plaintext token')
  })

  // Test S: Browser/Client API never receives ciphertext or plaintext secret
  it('S. Browser/Client API never receives ciphertext or plaintext secret', async () => {
    const mockDb = new Map()
    const businessId = 'biz_client_leak_audit'
    const rawToken = '8887776665:AAHgH_browserLeakPreventionToken12'

    const mockFetch = async () => ({
      json: async () => ({
        ok: true,
        result: { id: 8887776665, username: 'leak_bot', first_name: 'Leak Bot' },
      }),
    })

    await connectTelegramBot({ businessId, botToken: rawToken }, { fetchFn: mockFetch, mockDb })

    const status = await getTelegramStatus(businessId, { mockDb })

    // Must NOT return raw token
    assert.equal(status.bot_token, undefined)
    assert.equal(status.botToken, undefined)
    // Must NOT return encrypted token
    assert.equal(status.bot_token_encrypted, undefined)
    assert.equal(status.botTokenEncrypted, undefined)
    // Must only return masked token
    assert.ok(status.maskedToken)
    assert.ok(!status.maskedToken.includes('AAHgH_browserLeakPreventionToken12'))
    assert.ok(status.maskedToken.includes('••••••••••'))
  })

  // Test T: Migration 054 drops plaintext bot_token and restricts column SELECT
  it('T. Migration 054 drops plaintext bot_token and restricts column SELECT', () => {
    const migration054 = fs.readFileSync(
      path.resolve('supabase/migrations/054_telegram_token_encryption.sql'),
      'utf8'
    )

    assert.ok(
      migration054.includes('ADD COLUMN IF NOT EXISTS bot_token_encrypted TEXT'),
      'Migration must add bot_token_encrypted column'
    )
    assert.ok(
      migration054.includes('DROP COLUMN IF EXISTS bot_token'),
      'Migration must drop plaintext bot_token column'
    )
    assert.ok(
      migration054.includes('REVOKE SELECT (bot_token_encrypted) ON public.telegram_bot_settings FROM anon, authenticated'),
      'Migration must revoke SELECT on bot_token_encrypted for client roles'
    )
    assert.ok(
      migration054.includes('CREATE OR REPLACE VIEW public.telegram_bot_settings_safe'),
      'Migration must provide safe view excluding secret columns'
    )
  })

  // Test U: Token rotation re-encrypts with new random IV and updates successfully
  it('U. Token rotation re-encrypts with new random IV and updates successfully', async () => {
    const mockDb = new Map()
    const businessId = 'biz_rotation_test'
    const tokenV1 = '1112223334:AAHgH_initialOldToken123456789'
    const tokenV2 = '9998887776:AAHgH_rotatedNewToken987654321'

    const mockFetchV1 = async () => ({
      json: async () => ({
        ok: true,
        result: { id: 1112223334, username: 'bot_v1', first_name: 'Bot V1' },
      }),
    })
    const mockFetchV2 = async () => ({
      json: async () => ({
        ok: true,
        result: { id: 9998887776, username: 'bot_v2', first_name: 'Bot V2' },
      }),
    })

    // Initial connect
    await connectTelegramBot({ businessId, botToken: tokenV1 }, { fetchFn: mockFetchV1, mockDb })
    const row1 = mockDb.get(businessId)
    const cipher1 = row1.bot_token_encrypted
    assert.equal(row1.bot_username, 'bot_v1')

    // Rotate token
    await connectTelegramBot({ businessId, botToken: tokenV2 }, { fetchFn: mockFetchV2, mockDb })
    const row2 = mockDb.get(businessId)
    const cipher2 = row2.bot_token_encrypted
    assert.equal(row2.bot_username, 'bot_v2')
    assert.notEqual(cipher1, cipher2, 'Ciphertext must be rotated')

    // Verify decryption of rotated token
    const { decryptBotToken } = await import('../lib/telegramCrypto.js')
    const decryptedV2 = await decryptBotToken(cipher2)
    assert.equal(decryptedV2, tokenV2)
  })
})
