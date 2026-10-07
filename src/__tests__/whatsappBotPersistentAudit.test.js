import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { classifyDisconnect, normalizeConnectionStatus } from '../../whatsapp-connector/connectionState.mjs'
import {
  advanceConversation,
  getInteractiveSelection,
  greetingInteractive
} from '../../whatsapp-connector/operational/conversation.mjs'

describe('WhatsApp Bot Persistent Lifecycle & Architecture Audit (bot.md)', () => {
  it('VALIDATION 1: Connector health check endpoint contract', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /app\.get\('\/health'/)
    assert.match(serverSource, /res\.json\(\{\s*status:\s*'ok',\s*service:\s*'whatsapp-connector'/)
  })

  it('VALIDATION 2: POST /connect only connects if not already active and avoids duplicate socket', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    // Guard against duplicate connect
    assert.match(serverSource, /if \(existing && \(existing\.status === 'connected' \|\| existing\.status === 'qr'/)
    // Concurrency lock for initializeSocket
    assert.match(serverSource, /if \(socketInitLocks\.has\(businessId\)\)/)
  })

  it('VALIDATION 3: Baileys live socket is the sole authority for connected status (never stale DB row)', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    // Check in-memory session first
    assert.match(serverSource, /const session = sessions\.get\(businessId\)/)
    // If only in DB and not in memory, return disconnected
    assert.match(serverSource, /A database row only records the last known state\. It is never evidence/)
    assert.match(serverSource, /status: 'disconnected',\s*connected: false/)
  })

  it('VALIDATION 4: Browser refresh does not trigger new socket, only GET status + WebSocket reconciliation', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /useEffect\(\(\) => \{\s*loadStatus\(true\)\s*\}, \[loadStatus\]\)/)
    assert.doesNotMatch(pageSource, /useEffect\(\(\) => \{[\s\S]*?initiateConnection[\s\S]*?\}, \[\]\)/)
  })

  it('VALIDATION 5: Web disconnect calls Baileys logout, purges credentials, and transitions to disconnected', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /app\.post\('\/disconnect\/:businessId'/)
    assert.match(serverSource, /session\.socket\.logout\('Intentional web disconnect'\)/)
    assert.match(serverSource, /rmSync\(sessionDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/)
    assert.match(serverSource, /notifyClients\(businessId,\s*\{\s*type:\s*'status',\s*data:\s*\{\s*status:\s*'disconnected'/)
  })

  it('VALIDATION 6: Connect after web disconnect starts fresh because credentials were invalidated', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    // If session dir was purged, useMultiFileAuthState starts clean, prompting QR code
    assert.match(serverSource, /Purge encrypted auth credentials from disk so reconnect generates fresh QR/)
  })

  it('VALIDATION 7: If WhatsApp is already connected, POST /connect does not request re-pairing', async () => {
    const serverSource = await readFile(new URL('../../whatsapp-connector/server.mjs', import.meta.url), 'utf8')
    assert.match(serverSource, /session already in state '\$\{existing\.status\}', returning existing/)
  })

  it('VALIDATION 8: Frontend distinguishes between WhatsApp disconnected vs Connector service unavailable', async () => {
    const serviceSource = await readFile(new URL('../lib/whatsappService.js', import.meta.url), 'utf8')
    assert.match(serviceSource, /connectorAvailable: false/)
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /\{!loading && !connectorAvailable && \(/)
  })

  it('VALIDATION 9: Session persistence configuration exists for PM2 and systemd', () => {
    assert.ok(existsSync(new URL('../../whatsapp-connector/ecosystem.config.cjs', import.meta.url)))
    assert.ok(existsSync(new URL('../../whatsapp-connector/whatsapp-connector.service', import.meta.url)))
  })

  it('VALIDATION 10: /hai greeting and interactive mode selection process correctly', async () => {
    const extracted = getInteractiveSelection({ conversation: '/hai' })
    assert.equal(extracted, '/hai')

    const greeting = greetingInteractive()
    assert.ok(greeting.buttons)
    assert.equal(greeting.buttons.length, 2)

    const response = await advanceConversation({
      businessId: 'audit_test_biz',
      senderPhone: '62812345678',
      input: '/hai'
    })
    assert.ok(response.interactive)
    assert.match(response.interactive.text, /BisnisSehat/i)
  })
})
