/**
 * WhatsApp Service — Baileys connector client.
 *
 * Communicates with a persistent Node.js connector service
 * running Baileys for WhatsApp Web protocol.
 *
 * All credentials are stored server-side (encrypted).
 * Frontend never sees auth state or session files.
 */

const CONNECTOR_URL = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_WHATSAPP_CONNECTOR_URL) || 'http://localhost:3001'

// ══════════════════════════════════════════════════════════
// Connection Status
// ══════════════════════════════════════════════════════════

/**
 * Check if the connector service is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkConnectorHealth() {
  try {
    const res = await fetch(`${CONNECTOR_URL}/health`, {
      signal: AbortSignal.timeout(3000)
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Get WhatsApp connection status for a business.
 * Queries the connector service. A database row is only last-known state and
 * must not be presented as an active Baileys connection.
 *
 * @param {string} businessId
 * @returns {{ status, connected, phoneNumber, connectorAvailable, ... } | null}
 */
export async function getConnectionStatus(businessId) {
  if (!businessId) return null

  // Try connector service first
  try {
    const res = await fetch(`${CONNECTOR_URL}/status/${businessId}`, {
      signal: AbortSignal.timeout(3000)
    })
    if (res.ok) {
      const data = await res.json()
      let rawStatus = data.status || 'disconnected'
      const isSyncing = Boolean(data.syncing || rawStatus === 'syncing')
      if (rawStatus === 'syncing') {
        rawStatus = 'connected'
      }
      return {
        status: rawStatus,
        connected: rawStatus === 'connected' || data.connected || false,
        syncing: isSyncing,
        phoneNumber: data.phoneNumber || '',
        businessId,
        qrcode: data.qrcode || null,
        lastError: data.lastError || null,
        connectorAvailable: true
      }
    }
  } catch {
    // Connector not available
  }

  return { status: 'disconnected', connected: false, phoneNumber: '', businessId, connectorAvailable: false }
}

// ══════════════════════════════════════════════════════════
// Connect
// ══════════════════════════════════════════════════════════

/**
 * Start WhatsApp connection for a business.
 * Connector service will generate QR code.
 *
 * @param {string} businessId
 * @returns {{ success, connectionId?, error? }}
 */
export async function initiateConnection(businessId) {
  if (!businessId) return { success: false, error: 'businessId required' }

  const url = `${CONNECTOR_URL}/connect/${businessId}`
  console.log(`[WA] initiateConnection START url=${url}`)

  try {
    console.log('[WA] fetch sending POST')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    })
    console.log(`[WA] fetch returned status=${res.status}`)

    const data = await res.json()
    console.log('[WA] response parsed ok=' + res.ok)

    if (!res.ok) {
      console.log('[WA] POST failed:', data.error)
      return { success: false, error: data.error || 'Connection failed' }
    }

    console.log('[WA] POST success connectionId=' + data.connectionId)
    return { success: true, connectionId: data.connectionId, status: data.status, qrRequired: data.qrRequired }
  } catch (err) {
    console.error('[WA] POST error:', err.name, err.message)
    if (err.name === 'TimeoutError') {
      return { success: false, error: 'Connector service timeout' }
    }
    return { success: false, error: 'Connector service unavailable. Pastikan Node.js WhatsApp service berjalan.' }
  }
}

// Active WebSocket tracker per business: businessId -> WebSocket
const activeWebSockets = new Map()

/**
 * Listen for real-time updates (QR, status, pairing code) via WebSocket.
 * Guarantees strictly 1 active WebSocket connection per businessId.
 *
 * @param {string} businessId
 * @param {object} callbacks - { onQr, onStatus, onError, onPairingCode, onPairingCodeError, onQrExpired, onWsStateChange }
 * @returns {WebSocket} Caller should close on unmount
 */
export function listenForUpdates(businessId, { onQr, onStatus, onError, onPairingCode, onPairingCodeError, onQrExpired, onWsStateChange }) {
  if (!businessId) return null

  // If a WebSocket is already active or connecting for this businessId, close the old one first
  const existingWs = activeWebSockets.get(businessId)
  if (existingWs && (existingWs.readyState === WebSocket.CONNECTING || existingWs.readyState === WebSocket.OPEN)) {
    console.log(`[WS] Closing previous duplicate socket for ${businessId}`)
    try {
      existingWs.close(1000, 'Replaced by new listener')
    } catch { /* ignore */ }
    activeWebSockets.delete(businessId)
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const connectorHost = CONNECTOR_URL.replace(/^https?:\/\//, '')
  const wsUrl = `${wsProtocol}://${connectorHost}/?businessId=${businessId}`

  const ws = new WebSocket(wsUrl)
  activeWebSockets.set(businessId, ws)

  ws.onopen = () => {
    console.log(`[WS] CONNECTED businessId=${businessId}`)
    onWsStateChange?.('connected')
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log(`[WS] message type=${data.type}`)
      switch (data.type) {
        case 'qrcode':
        case 'qr': {
          const qrVal =
            data?.data?.qrcode ??
            data?.data?.qr ??
            data?.qrcode ??
            data?.qr ??
            (typeof data?.data === 'string' ? data.data : null)
          if (qrVal) {
            onQr?.(qrVal)
          }
          break
        }
        case 'qr_expired':
          onQrExpired?.()
          break
        case 'status': {
          let s = data?.data?.status ?? data?.status
          const p = data?.data?.phoneNumber ?? data?.phoneNumber
          const isSyncing = Boolean(data?.data?.syncing ?? data?.syncing ?? (s === 'syncing'))
          if (s === 'syncing') {
            s = 'connected'
          }
          onStatus?.(s, p, { syncing: isSyncing })
          const nestedQr = data?.data?.qrcode ?? data?.data?.qr ?? data?.qrcode
          if ((s === 'qr' || s === 'connecting') && nestedQr) {
            onQr?.(nestedQr)
          }
          break
        }
        case 'error':
          onError?.(data?.data?.message ?? data?.message)
          break
        case 'pairing_code':
          onPairingCode?.(data?.data?.code ?? data?.code)
          break
        case 'pairing_code_error':
          onPairingCodeError?.(data?.data?.message ?? data?.message)
          break
      }
    } catch {
      // Ignore parse errors
    }
  }

  ws.onclose = (event) => {
    if (activeWebSockets.get(businessId) === ws) {
      activeWebSockets.delete(businessId)
    }
    console.log(`[WS] CLOSED code=${event.code} reason=${event.reason || 'none'}`)
    onWsStateChange?.('disconnected', event.code)
    // Transport closure must NOT mutate WhatsApp session state or broadcast false error.
  }

  ws.onerror = () => {
    // WebSocket connection failed - connector may not be running
    onWsStateChange?.('error')
  }

  return ws
}

/**
 * Request pairing code via WebSocket.
 * Sends action to connector, response arrives via onPairingCode callback.
 *
 * @param {WebSocket} ws - Active WebSocket connection
 * @param {string} phoneNumber - Normalized phone number (e.g., '6281234567890')
 */
export function requestPairingCode(ws, phoneNumber) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ action: 'request_pairing_code', phoneNumber }))
}

// ══════════════════════════════════════════════════════════
// Disconnect
// ══════════════════════════════════════════════════════════

/**
 * Disconnect WhatsApp for a business.
 *
 * @param {string} businessId
 * @returns {{ success, error? }}
 */
export async function disconnectConnection(businessId) {
  if (!businessId) return { success: false, error: 'businessId required' }

  try {
    const res = await fetch(`${CONNECTOR_URL}/disconnect/${businessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000)
    })

    const data = await res.json()
    return data
  } catch {
    return { success: false, error: 'Connector service tidak tersedia' }
  }
}

// ══════════════════════════════════════════════════════════
// Send Message
// ══════════════════════════════════════════════════════════

/**
 * Send a WhatsApp message.
 *
 * @param {string} businessId
 * @param {string} to - Phone number (e.g., '6281234567890')
 * @param {string} message - Message text
 * @returns {{ success, messageId?, error? }}
 */
export async function sendMessage(businessId, to, message) {
  if (!businessId || !to || !message) {
    return { success: false, error: 'Paramater tidak lengkap' }
  }

  try {
    const res = await fetch(`${CONNECTOR_URL}/send-message/${businessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message }),
      signal: AbortSignal.timeout(10000)
    })

    const data = await res.json()
    return data
  } catch {
    return { success: false, error: 'Connector service tidak tersedia' }
  }
}
