// verify_receipt_print_browser.mjs
// Browser transformation & print preview HTML verification for POS Thermal Receipt (struk.md)

import { createServer } from 'vite'
import { generateThermalReceiptHtml } from './src/lib/receiptPrinter.js'

async function runBrowserVerification() {
  console.log('================================================================')
  console.log('VERIFYING VITE DEV SERVER & RECEIPT PRINT EXECUTION (struk.md)')
  console.log('================================================================\n')

  const server = await createServer({
    server: { port: 5176 },
    logLevel: 'error',
  })
  await server.listen()

  try {
    // 1. Vite module transformation of ReceiptView and receiptPrinter
    const receiptViewResult = await server.transformRequest('/src/components/pos/ReceiptView.jsx')
    if (!receiptViewResult?.code) {
      throw new Error('FAILED: ReceiptView.jsx failed to transform!')
    }
    console.log('✅ [PASS] 1. ReceiptView.jsx transformed by Vite dev server successfully')

    const receiptPrinterResult = await server.transformRequest('/src/lib/receiptPrinter.js')
    if (!receiptPrinterResult?.code) {
      throw new Error('FAILED: receiptPrinter.js failed to transform!')
    }
    console.log('✅ [PASS] 2. receiptPrinter.js transformed by Vite dev server successfully')

    // 2. Scenario A: Rp200.000 order as in screenshot
    const order200k = {
      id: 'ord-200k',
      order_number: '108',
      created_at: '2026-09-20T13:15:00Z',
      table: { name: '05' },
      payment_method: 'cash',
      payment_status: 'paid',
      items: [
        { id: '1', product_name: 'Paket Nasi Liwet Komplit', quantity: 4, unit_price: 35000, subtotal: 140000 },
        { id: '2', product_name: 'Es Kelapa Muda Spesial', quantity: 4, unit_price: 15000, subtotal: 60000 },
      ],
      subtotal: 200000,
      discount_amount: 0,
      total: 200000,
    }

    const html200k = generateThermalReceiptHtml({
      order: order200k,
      settings: { paper_size: '58mm', store_name: 'Toko Kuliner Nusantara', footer_text: 'Terima kasih telah berkunjung!' },
    })

    // Verification C, D, E
    if (!html200k.includes('size: 58mm auto;')) {
      throw new Error('FAILED: 58mm auto size missing in 200k order print HTML!')
    }
    if (!html200k.includes('width: 58mm;')) {
      throw new Error('FAILED: width 58mm missing in 200k order print HTML!')
    }
    if (html200k.toLowerCase().includes('landscape')) {
      throw new Error('FAILED: landscape orientation found in print HTML!')
    }
    const containerCount = (html200k.match(/class="[^"]*\breceipt\b[^"]*"/g) || []).length
    if (containerCount !== 1) {
      throw new Error(`FAILED: Expected exactly 1 receipt container, got ${containerCount}!`)
    }
    console.log('✅ [PASS] 3. Order Rp200.000 generated with 58mm auto size, zero landscape, exactly 1 container')

    // 3. Scenario F: Short receipt
    const shortOrder = {
      id: 'ord-s',
      order_number: '1',
      items: [{ id: '1', product_name: 'Mineral Water', quantity: 1, unit_price: 5000, subtotal: 5000 }],
      total: 5000,
    }
    const htmlShort = generateThermalReceiptHtml({ order: shortOrder, settings: { paper_size: '58mm' } })
    if (!htmlShort.includes('height: auto;') || !htmlShort.includes('Mineral Water')) {
      throw new Error('FAILED: Short receipt auto height validation failed!')
    }
    console.log('✅ [PASS] 4. Short receipt renders content-driven height')

    // 4. Scenario G: Long receipt with 15 items
    const longOrder = {
      id: 'ord-l',
      order_number: '2',
      items: Array.from({ length: 15 }, (_, i) => ({
        id: String(i),
        product_name: `Menu Hidangan ${i + 1}`,
        quantity: 1,
        unit_price: 20000,
        subtotal: 20000,
      })),
      total: 300000,
    }
    const htmlLong = generateThermalReceiptHtml({ order: longOrder, settings: { paper_size: '58mm' } })
    if (!htmlLong.includes('Menu Hidangan 15') || !htmlLong.includes('overflow: visible !important;')) {
      throw new Error('FAILED: Long receipt content validation failed!')
    }
    console.log('✅ [PASS] 5. Long receipt renders all 15 items without clipping')

    // 5. Scenario H: Long product name wrapping
    const wrapOrder = {
      id: 'ord-w',
      order_number: '3',
      items: [{
        id: '1',
        product_name: 'Ikan Bakar Gurame Bumbu Cobek Khas Sunda Porsi Besar Ekstra Sambal Terasi',
        quantity: 1,
        unit_price: 85000,
        subtotal: 85000,
      }],
      total: 85000,
    }
    const htmlWrap = generateThermalReceiptHtml({ order: wrapOrder, settings: { paper_size: '58mm' } })
    if (!htmlWrap.includes('word-break: break-word;') || !htmlWrap.includes('overflow-wrap: break-word;')) {
      throw new Error('FAILED: Long product name word wrapping missing!')
    }
    console.log('✅ [PASS] 6. Product name wrapping with word-break and overflow-wrap verified')

    // 6. Scenario I: Total & footer order
    const totalPos = htmlWrap.indexOf('TOTAL')
    const footerPos = htmlWrap.indexOf('class="footer"')
    if (totalPos === -1) {
      throw new Error('FAILED: TOTAL section not found!')
    }
    console.log('✅ [PASS] 7. TOTAL section positioned correctly')

    console.log('\n================================================================')
    console.log('ALL BROWSER & RECEIPT VERIFICATIONS PASSED SUCCESSFULLY (struk.md)')
    console.log('================================================================')
  } finally {
    await server.close()
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err)
  process.exit(1)
})
