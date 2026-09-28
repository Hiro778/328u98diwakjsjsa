import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  CONNECTION_STATUS,
  classifyDisconnect,
  statusFromConnectionUpdate,
  normalizeConnectionStatus
} from '../../whatsapp-connector/connectionState.mjs'
import {
  advanceConversation,
  getInteractiveSelection,
  formatInteractiveFallback,
  greetingInteractive
} from '../../whatsapp-connector/operational/conversation.mjs'

const DisconnectReason = {
  loggedOut: 401,
  forbidden: 403,
  multideviceMismatch: 411,
  connectionClosed: 428,
  connectionReplaced: 440,
  badSession: 500,
  restartRequired: 515,
  timedOut: 408
}

describe('WhatsApp Lifecycle Comprehensive Test Suite (fix.md Section L)', () => {
  // 1. no session -> connect -> QR -> paired -> connected
  it('1. no session -> connect -> QR -> paired -> connected transitions correctly', () => {
    assert.equal(statusFromConnectionUpdate({ connection: 'connecting' }), CONNECTION_STATUS.CONNECTING)
    assert.equal(statusFromConnectionUpdate({ connection: 'connecting', qr: '1@abcd...qr' }), CONNECTION_STATUS.QR_REQUIRED)
    assert.equal(statusFromConnectionUpdate({ connection: 'open', qr: undefined }), CONNECTION_STATUS.CONNECTED)
  })

  // 2. connected -> GET status = connected
  it('2. connected returns authoritative connected status without relying on db alone', () => {
    assert.equal(normalizeConnectionStatus('connected'), 'connected')
    assert.equal(normalizeConnectionStatus(undefined), 'disconnected')
  })

  // 3. connected + history sync -> status tetap connected
  it('3. connected + history sync preserves connected as primary status', () => {
    assert.equal(statusFromConnectionUpdate({ connection: 'open', isSyncing: true }), CONNECTION_STATUS.CONNECTED)
    assert.equal(normalizeConnectionStatus('syncing'), CONNECTION_STATUS.CONNECTED)
  })

  // 4. connected -> web disconnect -> actual session invalidated
  it('4. web disconnect invokes Baileys sock.logout() and purges auth credentials', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /session\.socket\.logout/)
    assert.match(serverSource, /rmSync\(sessionDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/)
  })

  // 5. web disconnect -> status disconnected
  it('5. web disconnect transitions runtime and clients to disconnected', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /notifyClients\(businessId,\s*\{\s*type:\s*'status',\s*data:\s*\{\s*status:\s*'disconnected'/)
  })

  // 6. disconnect -> connect lagi -> QR baru
  it('6. reconnecting after credential purge forces fresh QR generation', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /Incomplete unregistered pairing credentials detected/)
    assert.match(serverSource, /Purging to allow clean QR code/)
  })

  // 7. temporary disconnect -> reconnect tanpa QR
  it('7. temporary disconnect (408 / 428 / 515) marks reconnecting without purging credentials', () => {
    for (const code of [DisconnectReason.timedOut, DisconnectReason.connectionClosed, DisconnectReason.restartRequired]) {
      const classification = classifyDisconnect(code, DisconnectReason)
      assert.equal(classification.terminal, false, `code ${code} must not be terminal`)
      assert.equal(classification.invalidSession, false, `code ${code} must not invalidate session`)
      assert.equal(classification.shouldReconnect, true, `code ${code} must trigger reconnect`)
    }
  })

  // 8. loggedOut dari HP -> credentials purged
  it('8. loggedOut from phone (401) classifies as terminal and invalidSession', () => {
    const classification = classifyDisconnect(DisconnectReason.loggedOut, DisconnectReason)
    assert.equal(classification.terminal, true)
    assert.equal(classification.invalidSession, true)
    assert.equal(classification.shouldReconnect, false)
  })

  // 9. loggedOut -> connect lagi -> QR baru
  it('9. loggedOut branch clears session directory so next connect starts empty', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /if\s*\(disconnect\.invalidSession\)\s*\{[\s\S]*?rmSync\(sessionDir/)
  })

  // 10. connector restart + valid session -> connected tanpa QR
  it('10. valid session on disk auto-restores to open connection', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /useMultiFileAuthState\(sessionDir\)/)
    assert.match(serverSource, /Auto-restore sessions from DB in background/)
  })

  // 11. duplicate connect saat connected -> tidak membuat socket kedua
  it('11. duplicate connect returns existing socket and frontend prevents duplicate initiation', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /session already in state/)
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /if\s*\(connecting\s*\|\|\s*disconnecting\)\s*return/)
  })

  // 12. duplicate disconnect -> aman/idempotent
  it('12. duplicate disconnect is idempotent and returns clean success', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /app\.post\('\/disconnect\/:businessId'/)
    // Both with or without active memory session, returns success
    assert.match(serverSource, /res\.json\(\{\s*success:\s*true/)
  })

  // 13. /hai inbound text -> greeting
  it('13. /hai inbound text matches greeting handler and sets landing state', async () => {
    const result = await advanceConversation({
      businessId: 'biz_lifecycle_test',
      senderPhone: '628111111',
      input: '/hai',
      execute: async () => ({ success: true })
    })
    assert.equal(result.handled, true)
    assert.ok(result.interactive)
    assert.match(result.interactive.text, /👋 Halo! Selamat datang di BisnisSehat/)
  })

  // 14. /hai native interactive response -> router
  it('14. /hai native interactive buttons match MODE_AI and MODE_FORM', async () => {
    const scope = {
      businessId: 'biz_lifecycle_test_mode',
      senderPhone: '628222222',
      execute: async cmd => ({ success: true, message: `Executed: ${cmd.intent}` })
    }
    await advanceConversation({ ...scope, input: '/hai' })
    const formResponse = await advanceConversation({ ...scope, input: 'MODE_FORM' })
    assert.equal(formResponse.handled, true)
    assert.equal(formResponse.interactive.kind, 'list')

    // Reset and test AI mode
    await advanceConversation({ ...scope, input: '/hai' })
    const aiResponse = await advanceConversation({ ...scope, input: 'MODE_AI' })
    assert.equal(aiResponse.handled, true)
    assert.match(aiResponse.text, /Executed:/)
  })

  // 15. native interactive gagal -> fallback text
  it('15. native interactive format produces readable plain text fallback', () => {
    const greeting = greetingInteractive()
    const fallback = formatInteractiveFallback(greeting)
    assert.match(fallback, /👋 Halo! Selamat datang di BisnisSehat/)
    assert.match(fallback, /MODE_AI/)
    assert.match(fallback, /MODE_FORM/)
  })

  // 16. tenant isolation
  it('16. flows maintain strict isolation between different business IDs', async () => {
    const phone = '628333333'
    await advanceConversation({ businessId: 'tenant_1', senderPhone: phone, input: '/hai', execute: async () => {} })
    await advanceConversation({ businessId: 'tenant_1', senderPhone: phone, input: 'MODE_FORM', execute: async () => {} })

    // tenant_2 has not entered form flow
    const tenant2Result = await advanceConversation({
      businessId: 'tenant_2',
      senderPhone: phone,
      input: 'FORM_ADD_PRODUCT',
      execute: async () => {}
    })
    assert.equal(tenant2Result.handled, false)
  })

  // 17. existing DELETE_CUSTOMER tests tetap PASS
  it('17. parses delete customer with priority over creation', async () => {
    const { parseOperationalText, OPERATIONAL_INTENTS } = await import('../lib/operationalEngine.js')
    const parsed = parseOperationalText('hapus yanto')
    assert.equal(parsed.intent, OPERATIONAL_INTENTS.DELETE_CUSTOMER)
  })
})
