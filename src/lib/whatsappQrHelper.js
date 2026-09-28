import QRCode from 'qrcode'

/**
 * Normalizes and converts raw QR payloads (Baileys string, data URL, raw base64)
 * into a safe, valid Image Data URL ('data:image/png;base64,...').
 *
 * @param {string|object} rawPayload - Raw QR payload from Baileys or WebSocket
 * @returns {Promise<string|null>} - Valid data URL or null on failure
 */
export async function generateQrDataUrl(rawPayload) {
  if (!rawPayload) {
    logQrDiagnostic('empty_payload', rawPayload, null)
    return null
  }

  // Extract string from possible object wrappers: { qrcode: '...' } or { data: { qrcode: '...' } }
  let payloadStr = rawPayload
  if (typeof rawPayload === 'object') {
    payloadStr = rawPayload.qrcode || rawPayload.qr || rawPayload.data?.qrcode || rawPayload.data?.qr || rawPayload.data || ''
  }

  if (typeof payloadStr !== 'string' || !payloadStr.trim()) {
    logQrDiagnostic('invalid_payload_type', rawPayload, null)
    return null
  }

  payloadStr = payloadStr.trim()

  // 1. If payload is already a data URL (e.g. data:image/png;base64,...)
  if (payloadStr.startsWith('data:image/')) {
    logQrDiagnostic('already_data_url', payloadStr, payloadStr)
    return payloadStr
  }

  // 2. If payload is raw base64 image data without prefix (PNG or JPEG magic header)
  // PNG: iVBORw0KGgo, JPEG: /9j/, WebP: UklGR
  if (payloadStr.startsWith('iVBORw0KGgo') || payloadStr.startsWith('/9j/') || payloadStr.startsWith('UklGR')) {
    const dataUrl = `data:image/png;base64,${payloadStr}`
    logQrDiagnostic('prefixed_base64_image', payloadStr, dataUrl)
    return dataUrl
  }

  // 3. Raw QR content string (Baileys format, e.g. "2@pZ0N58032JkfaA...,g8sd9fsd...")
  try {
    const dataUrl = await QRCode.toDataURL(payloadStr, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 320,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
    logQrDiagnostic('generated_from_raw_qr', payloadStr, dataUrl)
    return dataUrl
  } catch (err) {
    console.error('[QR] Failed to generate QR data URL:', err?.message || err)
    logQrDiagnostic('generation_failed', payloadStr, null)
    return null
  }
}

/**
 * Diagnostic logger that is safe and adheres to security guidelines:
 * - Logs event/stage
 * - Logs whether payload exists
 * - Logs payload type and length
 * - Logs generated image source type and length
 * - NEVER prints raw QR string, session credentials, or pairing codes
 */
export function logQrDiagnostic(stage, payload, resultUrl = null) {
  const hasPayload = Boolean(payload)
  const payloadType = typeof payload
  const payloadLength = typeof payload === 'string' ? payload.length : (payload ? JSON.stringify(payload).length : 0)
  const resultType = typeof resultUrl
  const resultLength = typeof resultUrl === 'string' ? resultUrl.length : 0
  const isValidDataUrl = typeof resultUrl === 'string' && resultUrl.startsWith('data:image/')

  console.log(
    `[QR Diagnostic] Event: ${stage} | Has payload: ${hasPayload} | Payload type: ${payloadType} | Payload length: ${payloadLength} | Result type: ${resultType} | Result length: ${resultLength} | Valid data URL: ${isValidDataUrl}`
  )
}
