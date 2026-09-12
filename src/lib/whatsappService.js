/**
 * WhatsApp Service — Baileys connector client.
 *
 * Communicates with a persistent Node.js connector service
 * running Baileys for WhatsApp Web protocol.
 *
 * All credentials are stored server-side (encrypted).
 * Frontend never sees auth state or session files.
 */

import { supabase } from './supabase'

const CONNECTOR_URL = import.meta.env.VITE_WHATSAPP_CONNECTOR_URL || 'http://localhost:3001'

// ══════════════════════════════════════════════════════════
// Connection Status
// ══════════════════════════════════════════════════════════

/**
 * Get WhatsApp connection status for a business.
 * Queries the connector service, falls back to Supabase DB.
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
      return {
        status: data.status || 'disconnected',
        connected: data.connected || false,
        phoneNumber: data.phoneNumber || '',
        businessId,
        lastError: data.lastError || null,
        connectorAvailable: true
      }
    }
  } catch {
    // Connector not available
  }

  // Fallback: query Supabase directly
  try {
    const { data: conn } = await supabase
      .from('whatsapp_business_connections')
      .select('status, display_phone_number, last_error, connected_at')
      .eq('business_id', businessId)
      .maybeSingle()

    return {
      status: conn?.status || 'disconnected',
      connected: conn?.status === 'connected',
      phoneNumber: conn?.display_phone_number || '',
      businessId,
      lastError: conn?.last_error || null,
      connectorAvailable: false
    }
  } catch {
    return { status: 'disconnected', connected: false, phoneNumber: '', businessId, connectorAvailable: false }
  }
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
    return { success: true, connectionId: data.connectionId, qrRequired: data.qrRequired }
  } catch (err) {
    console.error('[WA] POST error:', err.name, err.message)
    if (err.name === 'TimeoutError') {
      return { success: false, error: 'Connector service timeout' }
    }
    return { success: false, error: 'Connector service unavailable. Pastikan Node.js WhatsApp service berjalan.' }
  }
}

// ══════════════════════════════════════════════════════════
// WebSocket Listener
// ══════════════════════════════════════════════════════════

/**
 * Listen for real-time updates (QR, status, pairing code) via WebSocket.
 *
 * @param {string} businessId
 * @param {object} callbacks - { onQr, onStatus, onError, onPairingCode, onPairingCodeError }
 * @returns {WebSocket} Caller should close on unmount
 */
export function listenForUpdates(businessId, { onQr, onStatus, onError, onPairingCode, onPairingCodeError }) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const connectorHost = CONNECTOR_URL.replace(/^https?:\/\//, '')
  const wsUrl = `${wsProtocol}://${connectorHost}/?businessId=${businessId}`

  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log(`[WS] CONNECTED businessId=${businessId}`)
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log(`[WS] message type=${data.type}`)
      switch (data.type) {
        case 'qrcode':
          onQr?.(data.data.qrcode)
          break
        case 'status':
          onStatus?.(data.data.status, data.data.phoneNumber)
          break
        case 'error':
          onError?.(data.data.message)
          break
        case 'pairing_code':
          onPairingCode?.(data.data.code)
          break
        case 'pairing_code_error':
          onPairingCodeError?.(data.data.message)
          break
      }
    } catch {
      // Ignore parse errors
    }
  }

  ws.onclose = (event) => {
    console.log(`[WS] CLOSED code=${event.code} reason=${event.reason || 'none'}`)
    // 1000 = normal closure, 1001 = going away, 1005 = no status received (browser internal)
    if (event.code !== 1000 && event.code !== 1001 && event.code !== 1005) {
      onError?.(`Koneksi WebSocket terputus (code: ${event.code})`)
    }
  }

  ws.onerror = () => {
    // WebSocket connection failed - connector may not be running
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
