import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateQrDataUrl, logQrDiagnostic } from '../lib/whatsappQrHelper.js'

describe('WhatsApp QR Fix & Trace Suite (wa.md requirements)', () => {
  it('1. converts raw Baileys QR string into a valid PNG data URL', async () => {
    const rawBaileysQr = '2@rF3kX9abc123DEF456,8x9Yz012,34567890'
    const dataUrl = await generateQrDataUrl(rawBaileysQr)

    assert.ok(dataUrl, 'dataUrl must not be null or undefined')
    assert.match(dataUrl, /^data:image\/png;base64,iVBOR/, 'Must be a valid base64 PNG data URL')
    assert.ok(dataUrl.length > 500, 'Data URL length should be substantial for a valid QR code')
  })

  it('2. preserves existing valid data URL without double-prefixing', async () => {
    const existingDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
    const result = await generateQrDataUrl(existingDataUrl)

    assert.equal(result, existingDataUrl)
    assert.ok(!result.includes('data:image/png;base64,data:image/'), 'Must not double-prefix data URL')
  })

  it('3. normalizes raw base64 PNG data missing the data:image prefix', async () => {
    const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAUAAA...'
    const result = await generateQrDataUrl(rawBase64)

    assert.ok(result.startsWith('data:image/png;base64,iVBORw0KGgoAAA'), 'Should prepend data:image prefix')
  })

  it('4. extracts QR string safely when payload is inside an object wrapper', async () => {
    const objectPayload = {
      type: 'qrcode',
      data: { qrcode: '2@sample-baileys-qr-code,abc123' },
    }
    const result = await generateQrDataUrl(objectPayload)

    assert.ok(result, 'Must successfully parse wrapped payload')
    assert.match(result, /^data:image\/png;base64,/)
  })

  it('5. safely handles null, undefined, empty, or invalid input without throwing', async () => {
    const r1 = await generateQrDataUrl(null)
    assert.equal(r1, null)

    const r2 = await generateQrDataUrl(undefined)
    assert.equal(r2, null)

    const r3 = await generateQrDataUrl('')
    assert.equal(r3, null)

    const r4 = await generateQrDataUrl('   ')
    assert.equal(r4, null)

    const r5 = await generateQrDataUrl({})
    assert.equal(r5, null)
  })

  it('6. safe diagnostic logger never logs full QR string or sensitive credentials', () => {
    const rawQr = '2@sensitive-full-qr-string-with-tokens-and-encryption-keys,12345'
    const generatedUrl = 'data:image/png;base64,iVBORw0KGgoAAA...'

    const originalLog = console.log
    let loggedOutput = ''
    console.log = (...args) => {
      loggedOutput += args.join(' ')
    }

    try {
      logQrDiagnostic('test_event', rawQr, generatedUrl)

      assert.ok(loggedOutput.includes('[QR Diagnostic] Event: test_event'))
      assert.ok(loggedOutput.includes('Has payload: true'))
      assert.ok(loggedOutput.includes(`Payload length: ${rawQr.length}`))
      assert.ok(loggedOutput.includes('Valid data URL: true'))

      // Security requirement: MUST NOT leak raw QR string content
      assert.ok(
        !loggedOutput.includes(rawQr),
        'Full raw QR string must NEVER be printed in diagnostic logs'
      )
    } finally {
      console.log = originalLog
    }
  })

  it('7. QR generation handles rapid sequential replacement without memory leaks or stale state', async () => {
    const qr1 = '2@first-qr-string,session1'
    const qr2 = '2@second-qr-string,session1'

    const url1 = await generateQrDataUrl(qr1)
    const url2 = await generateQrDataUrl(qr2)

    assert.ok(url1.startsWith('data:image/png;base64,'))
    assert.ok(url2.startsWith('data:image/png;base64,'))
    assert.notEqual(url1, url2, 'Different QR strings must produce distinct QR image data URLs')
  })
})
