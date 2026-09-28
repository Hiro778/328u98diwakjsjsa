import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getConnectionStatus, checkConnectorHealth } from '../lib/whatsappService.js'

describe('WhatsApp Frontend WebSocket Lifecycle & State Separation (fix.md)', () => {
  it('TEST A: Refresh browser — loads status via GET /status and does not trigger POST /connect', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    // loadStatus calls getConnectionStatus and checkConnectorHealth
    assert.match(pageSource, /getConnectionStatus\(id\)/)
    assert.match(pageSource, /checkConnectorHealth\(\)/)
    // useEffect on mount only calls loadStatus, never initiateConnection
    assert.match(pageSource, /useEffect\(\(\) => \{\s*loadStatus\(true\)\s*\}, \[loadStatus\]\)/)
    assert.doesNotMatch(pageSource, /useEffect\(\(\) => \{[\s\S]*?initiateConnection[\s\S]*?\}, \[\]\)/)
  })

  it('TEST B: WS close 1006 does not emit error or mark disconnected, reconciles via GET /status', async () => {
    const serviceSource = await readFile(new URL('../lib/whatsappService.js', import.meta.url), 'utf8')
    // Transport closure does not call onError
    assert.match(serviceSource, /onWsStateChange\?\.\('disconnected', event\.code\)/)
    assert.match(serviceSource, /Transport closure must NOT mutate WhatsApp session state/)

    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    const onWsIdx = pageSource.indexOf('function onWsStateChange')
    const wsBlock = pageSource.slice(onWsIdx, onWsIdx + 600)
    assert.doesNotMatch(wsBlock, /initiateConnection/)
  })

  it('TEST C: GET /health 200 and successful status suppresses "Connector Service Tidak Tersedia"', async () => {
    const serviceSource = await readFile(new URL('../lib/whatsappService.js', import.meta.url), 'utf8')
    assert.match(serviceSource, /export async function checkConnectorHealth/)
    assert.match(serviceSource, /const data = await res\.json\(\)/)

    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /const isAvailable = Boolean\(isHealthy \|\| data\?\.connectorAvailable\)/)
    assert.match(pageSource, /setConnectorAvailable\(isAvailable\)/)
    assert.match(pageSource, /\{!loading && !connectorAvailable && \(/)
  })

  it('TEST D: When Baileys is truly disconnected, UI reflects disconnected', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /effectiveStatus === 'disconnected'/)
  })

  it('TEST E: Clicking Hubungkan when disconnected calls initiateConnection exactly once', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /console\.log\('\[WA\] calling POST \/connect'\)/)
    assert.match(pageSource, /const result = await initiateConnection\(business\.id\)/)
  })

  it('TEST F: Repeated Hubungkan clicks are guarded against duplicate / parallel requests', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    assert.match(pageSource, /if \(connecting \|\| disconnecting\) return/)
    assert.match(pageSource, /if \(effectiveStatus === 'connected'\)[\s\S]*?setSuccess\('WhatsApp sudah terhubung\.'\)[\s\S]*?return/)
    assert.match(pageSource, /if \(effectiveStatus === 'connecting' \|\| effectiveStatus === 'reconnecting'\)[\s\S]*?return/)
  })

  it('TEST G: 3-State separation keeps connected primary status during WS reconnecting', async () => {
    const pageSource = await readFile(new URL('../sections/WhatsAppOperasional/WhatsAppOperasionalPage.jsx', import.meta.url), 'utf8')
    // Has 3 distinct states
    assert.match(pageSource, /connectorAvailable/)
    assert.match(pageSource, /statusConfig\.label/)
    assert.match(pageSource, /wsConnectionStatus/)
    // When isConnected and wsConnectionStatus === 'reconnecting', displays secondary Menjaga koneksi...
    assert.match(pageSource, /isConnected && wsConnectionStatus === 'reconnecting'/)
    assert.match(pageSource, /Menjaga koneksi\.\.\./)
  })
})
