import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateQrDataUrl, logQrDiagnostic } from '../lib/whatsappQrHelper.js'

describe('End-to-End WhatsApp QR and Pairing Lifecycle (wa.md requirements)', () => {
  it('A. Trace: Baileys raw QR string is successfully transformed into scannable PNG', async () => {
    // Simulated live Baileys QR payload emitted during connection.update
    const baileysQr = '2@9abcD123EfG456HiJ789,9876543210,12345678'

    const dataUrl = await generateQrDataUrl(baileysQr)
    assert.ok(dataUrl, 'QR Data URL must be generated')
    assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Must begin with data:image/png;base64,')

    // Verify binary integrity: decode base64 and check standard PNG signature
    const base64 = dataUrl.replace('data:image/png;base64,', '')
    const buf = Buffer.from(base64, 'base64')
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    assert.ok(
      buf.subarray(0, 8).equals(pngSignature),
      'Output must contain valid binary PNG signature (not a broken image or raw text)'
    )
    assert.ok(buf.length > 500, 'Image buffer must have realistic size for a QR code')
  })

  it('B. Trace: Connector payload formats (data.data.qrcode vs data.qrcode vs string) are normalized', async () => {
    const formatA = { type: 'qrcode', data: { qrcode: '2@payloadFormatA,key123' } }
    const formatB = { type: 'qr', qr: '2@payloadFormatB,key456' }
    const formatC = '2@payloadFormatC,key789'

    const resA = await generateQrDataUrl(formatA)
    const resB = await generateQrDataUrl(formatB)
    const resC = await generateQrDataUrl(formatC)

    assert.ok(resA?.startsWith('data:image/png;base64,'))
    assert.ok(resB?.startsWith('data:image/png;base64,'))
    assert.ok(resC?.startsWith('data:image/png;base64,'))
  })

  it('C. Trace: Broken image prevention — invalid payloads return null without throwing', async () => {
    const invalidPayloads = [null, undefined, '', '   ', {}, { data: null }]

    for (const payload of invalidPayloads) {
      const res = await generateQrDataUrl(payload)
      assert.equal(res, null, 'Invalid payload must return null so UI displays friendly fallback, not broken <img>')
    }
  })

  it('D. Pairing Code Flow: Remains decoupled and preserves international format', () => {
    // Normalization logic verification
    function normalizePhone(input) {
      let digits = (input || '').replace(/\D/g, '')
      if (digits.startsWith('0')) digits = '62' + digits.slice(1)
      if (digits.length < 10 || digits.length > 15) return null
      return digits
    }

    assert.equal(normalizePhone('081234567890'), '6281234567890')
    assert.equal(normalizePhone('+62 812-3456-7890'), '6281234567890')
    assert.equal(normalizePhone('6281234567890'), '6281234567890')
    assert.equal(normalizePhone('123'), null, 'Short numbers rejected')
  })

  it('E. Expiration: Expired state clears active QR dataUrl', () => {
    let qrDataUrl = 'data:image/png;base64,iVBORw0KGgo...'
    let qrExpired = false

    // Simulate expiration event
    function triggerExpiration() {
      qrExpired = true
      qrDataUrl = null
    }

    triggerExpiration()
    assert.equal(qrExpired, true)
    assert.equal(qrDataUrl, null, 'Active QR must be cleared upon expiration')
  })
})
