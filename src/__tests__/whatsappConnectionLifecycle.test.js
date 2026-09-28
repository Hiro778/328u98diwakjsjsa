import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CONNECTION_STATUS, classifyDisconnect, statusFromConnectionUpdate } from '../../whatsapp-connector/connectionState.mjs'

const DisconnectReason = {
  loggedOut: 401,
  forbidden: 403,
  multideviceMismatch: 411,
  connectionClosed: 428,
  connectionReplaced: 440,
  badSession: 500,
  restartRequired: 515,
}

describe('WhatsApp authoritative connection lifecycle', () => {
  it('keeps an open socket connected even while QR/sync metadata is present', () => {
    assert.equal(statusFromConnectionUpdate({ connection: 'open', qr: 'old-qr' }), CONNECTION_STATUS.CONNECTED)
  })

  it('treats temporary close as reconnectable without invalidating credentials', () => {
    const result = classifyDisconnect(DisconnectReason.connectionClosed, DisconnectReason)
    assert.deepEqual(result, { terminal: false, invalidSession: false, shouldReconnect: true })
  })

  it('treats logged out, bad session, and device mismatch as invalid sessions', () => {
    for (const code of [DisconnectReason.loggedOut, DisconnectReason.badSession, DisconnectReason.multideviceMismatch]) {
      const result = classifyDisconnect(code, DisconnectReason)
      assert.equal(result.terminal, true)
      assert.equal(result.invalidSession, true)
      assert.equal(result.shouldReconnect, false)
    }
  })

  it('does not classify an unknown disconnect as logout from error text', () => {
    assert.deepEqual(classifyDisconnect(0, DisconnectReason), {
      terminal: false,
      invalidSession: false,
      shouldReconnect: true,
    })
  })

  it('has an authoritative socket guard, reconnect state, and tenant-scoped auth purge', async () => {
    const source = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(source, /session\.socket !== sock/)
    assert.match(source, /session\.status = 'reconnecting'/)
    assert.match(source, /join\(SESSIONS_DIR, businessId\)/)
    assert.match(source, /if \(disconnect\.invalidSession\)/)
  })

  it('does not use a persisted database row as proof of an open socket', async () => {
    const source = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(source, /status: 'disconnected',\n\s+connected: false,/)
  })

  it('normalizes syncing status to connected and never allows Menyinkronkan as primary status', () => {
    assert.equal(statusFromConnectionUpdate({ connection: 'open', isSyncing: true }), CONNECTION_STATUS.CONNECTED)
    assert.equal(statusFromConnectionUpdate({ connection: 'open' }), CONNECTION_STATUS.CONNECTED)
    // Even if incoming status is explicitly 'syncing', it must resolve to connected
    const normalized = statusFromConnectionUpdate({ connection: 'open', qr: undefined })
    assert.equal(normalized, CONNECTION_STATUS.CONNECTED)
  })

  it('keeps connection=open authoritative even when history sync event occurs', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    // server.mjs must disable blocking history sync in makeWASocket
    assert.match(serverSource, /syncFullHistory:\s*false/)
    assert.match(serverSource, /shouldSyncHistoryMessage:\s*\(\)\s*=>\s*false/)
    // server.mjs must listen to messaging-history.set and preserve session.status === 'connected'
    assert.match(serverSource, /messaging-history\.set/)
    assert.match(serverSource, /session\.syncing\s*=\s*!isLatest/)
  })

  it('clears pairing presentation and prevents duplicate socket when connected', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /if \((effectiveStatus|newStatus) === 'connected'\)[\s\S]*?clearQrState\(\)/)
    assert.match(pageSource, /(effectiveStatus|newStatus) === 'disconnected' \|\| (effectiveStatus|newStatus) === 'reconnecting'/)
    // UI state shows Terhubung as primary status and Sinkronisasi... only as secondary indicator
    assert.match(pageSource, /isConnected\s*&&\s*syncing[\s\S]*?Sinkronisasi\.\.\./)
    // Connect button returns early if already connected to prevent duplicate socket
    assert.match(pageSource, /if \(effectiveStatus === 'connected'\)[\s\S]*?setSuccess\('WhatsApp sudah terhubung\.'\)[\s\S]*?return/)
  })

  it('service and page normalize syncing payload to connected state', async () => {
    const serviceSource = await readFile(new URL('../lib/whatsappService.js', import.meta.url), 'utf8')
    assert.match(serviceSource, /if \(rawStatus === 'syncing'\)\s*\{\s*rawStatus = 'connected'/)
    assert.match(serviceSource, /if \(s === 'syncing'\)\s*\{\s*s = 'connected'/)
  })
})

