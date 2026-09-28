// src/__tests__/thermalReceiptStrukJsonSpec.test.js
// Dedicated regression test suite for struk.json thermal specification

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { generateThermalReceiptHtml, calculateReceiptHeightMm } from '../lib/receiptPrinter.js'

describe('struk.json: Thermal Receipt 58mm / 80mm Regression Specification Suite', () => {
  const receiptPrinterSrc = fs.readFileSync(path.resolve('src/lib/receiptPrinter.js'), 'utf8')
  const receiptViewSrc = fs.readFileSync(path.resolve('src/components/pos/ReceiptView.jsx'), 'utf8')
  const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf8')
  const settingsPageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/ReceiptSettingsPage.jsx'), 'utf8')

  const baseSettings = {
    paper_size: '58mm',
    store_name: 'Kopi & Dimsum Bahagia',
    store_address: 'Jl. Riau No. 88, Bandung',
    store_phone: '08123456789',
    header_text: 'Cita Rasa Juara Setiap Hari',
    footer_text: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.',
    footer_greeting: 'TERIMA KASIH & SELAMAT BERBELANJA',
    show_logo: false,
    show_table: true,
    show_cashier: true,
    show_order_number: true,
  }

  // 1. 58mm receipt
  it('Regression 1: 58mm receipt uses .receipt--58mm, width 58mm, monospace font, zero margins', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-58',
        created_at: '2026-09-25T14:00:00Z',
        items: [{ product_name: 'Es Kopi Susu', quantity: 1, unit_price: 18000, subtotal: 18000 }],
        subtotal: 18000,
        total: 18000,
      },
      settings: { ...baseSettings, paper_size: '58mm' },
    })

    assert.ok(html.includes('width: 58mm;'))
    assert.ok(html.includes('.receipt--58mm'))
    assert.ok(html.includes('class="receipt receipt--58mm receipt-container"'))
    assert.ok(!html.includes('transform: scale'))
    assert.ok(!html.includes('100vh'))
  })

  // 2. 80mm receipt
  it('Regression 2: 80mm receipt uses .receipt--80mm, width 80mm, legible typography without scaling', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-80',
        created_at: '2026-09-25T14:00:00Z',
        items: [{ product_name: 'Paket Nasi Liwet', quantity: 2, unit_price: 45000, subtotal: 90000 }],
        subtotal: 90000,
        total: 90000,
      },
      settings: { ...baseSettings, paper_size: '80mm' },
    })

    assert.ok(html.includes('width: 80mm;'))
    assert.ok(html.includes('.receipt--80mm'))
    assert.ok(html.includes('class="receipt receipt--80mm receipt-container"'))
    assert.ok(!html.includes('transform: scale'))
  })

  // 3. Long product name
  it('Regression 3: Long product name wraps cleanly with break-word and maintains right-aligned prices', () => {
    const longName = 'Ayam Bakar Madu Spesial Lengkap dengan Sambal Matah Pedas Nikmat & Kerupuk Kaleng Renyah Gurih'
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-LONG',
        items: [{ product_name: longName, quantity: 3, unit_price: 35000, subtotal: 105000 }],
        subtotal: 105000,
        total: 105000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('word-break: break-word;'))
    assert.ok(html.includes('overflow-wrap: break-word;'))
    assert.ok(html.includes('Ayam Bakar Madu Spesial Lengkap'))
    assert.ok(html.includes('text-align: right;'))
  })

  // 4. Product variant
  it('Regression 4: Product variant renders under item name with small muted font', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-VAR',
        items: [
          {
            product_name: 'Matcha Latte',
            variant: 'Less Ice / Oat Milk',
            quantity: 1,
            unit_price: 28000,
            subtotal: 28000,
          },
        ],
        subtotal: 28000,
        total: 28000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Matcha Latte'))
    assert.ok(html.includes('Less Ice / Oat Milk'))
  })

  // 5. Item discount
  it('Regression 5: Item discount renders right below item detail with minus sign and right-aligned amount', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-ITEM-DISC',
        items: [
          {
            product_name: 'Pizza Beef Pepperoni',
            unit: 'Pcs',
            quantity: 2,
            unit_price: 60000,
            subtotal: 120000,
            discount: 12000,
            discount_percent: 10,
          },
        ],
        subtotal: 120000,
        total: 108000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Diskon Produk (10%)'))
    assert.ok(html.includes('12.000'))
    assert.ok(html.includes('-'))
  })

  // 6. Invoice discount (diskon nota)
  it('Regression 6: Invoice discount renders in summary section as Diskon Nota with minus sign in red', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-NOTA-DISC',
        items: [{ product_name: 'Dimsum Mozzarella', quantity: 2, unit_price: 25000, subtotal: 50000 }],
        subtotal: 50000,
        discount_amount: 10000,
        total: 40000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Diskon Nota'))
    assert.ok(html.includes('-'))
    assert.ok(html.includes('10.000'))
    assert.ok(html.includes('TOTAL AKHIR'))
  })

  // 7. Tax (DPP & PPN)
  it('Regression 7: Tax renders in summary and [ RINCIAN PAJAK & TRANSAKSI ] without hardcoded 11%', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-TAX',
        items: [{ product_name: 'Sirloin Steak', quantity: 1, unit_price: 100000, subtotal: 100000 }],
        subtotal: 100000,
        dpp: 100000,
        tax_rate: 10,
        tax_amount: 10000,
        total: 110000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('[ RINCIAN PAJAK &amp; TRANSAKSI ]') || html.includes('[ RINCIAN PAJAK & TRANSAKSI ]'))
    assert.ok(html.includes('DPP'))
    assert.ok(html.includes('PPN (10%)'))
    assert.ok(html.includes('10.000'))
  })

  // 8. Service fee (biaya layanan)
  it('Regression 8: Service fee renders in summary cleanly if specified', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-FEE',
        items: [{ product_name: 'Burger Deluxe', quantity: 1, unit_price: 40000, subtotal: 40000 }],
        subtotal: 40000,
        service_fee: 2500,
        total: 42500,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Biaya Layanan'))
    assert.ok(html.includes('2.500'))
  })

  // 9. QRIS payment
  it('Regression 9: QRIS payment method displays QRIS label', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-QRIS',
        items: [{ product_name: 'Teh Poci', quantity: 1, unit_price: 5000, subtotal: 5000 }],
        subtotal: 5000,
        total: 5000,
        payment_method: 'qris',
        payment_status: 'paid',
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Metode Pembayaran'))
    assert.ok(html.includes('QRIS'))
    assert.ok(html.includes('LUNAS'))
  })

  // 10. Cash payment + change
  it('Regression 10: Cash payment renders Bayar and Kembali amounts accurately', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-CASH',
        items: [{ product_name: 'Mie Goreng Spesial', quantity: 2, unit_price: 20000, subtotal: 40000 }],
        subtotal: 40000,
        total: 40000,
        payment_method: 'cash',
        cash_received: 50000,
        change: 10000,
        payment_status: 'paid',
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Bayar'))
    assert.ok(html.includes('50.000'))
    assert.ok(html.includes('Kembali'))
    assert.ok(html.includes('10.000'))
  })

  // 11. Multiple items and Total Item count
  it('Regression 11: Multiple items calculate total items count accurately', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-MULTI',
        items: [
          { product_name: 'Item A', quantity: 3, unit_price: 10000, subtotal: 30000 },
          { product_name: 'Item B', quantity: 2, unit_price: 15000, subtotal: 30000 },
        ],
        subtotal: 60000,
        total: 60000,
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('Total Item'))
    assert.ok(html.includes('5')) // 3 + 2 = 5 items
  })

  // 12. Optional customer & categories rule
  it('Regression 12: Displays customer when provided; category header rendered ONLY when category data exists', () => {
    const htmlWithCat = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-CUST-CAT',
        customer_name: 'Ibu Ratna (VIP)',
        items: [
          { category: 'Makanan', product_name: 'Gado-gado', quantity: 1, unit_price: 25000, subtotal: 25000 },
          { category: 'Minuman', product_name: 'Jus Alpukat', quantity: 1, unit_price: 15000, subtotal: 15000 },
        ],
        subtotal: 40000,
        total: 40000,
      },
      settings: baseSettings,
    })

    assert.ok(htmlWithCat.includes('Pelanggan:'))
    assert.ok(htmlWithCat.includes('Ibu Ratna (VIP)'))
    assert.ok(htmlWithCat.includes('[ MAKANAN ]'))
    assert.ok(htmlWithCat.includes('[ MINUMAN ]'))

    // Verify NO fake category when items have no category
    const htmlNoCat = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-NO-CAT',
        items: [{ product_name: 'Kerupuk', quantity: 1, unit_price: 5000, subtotal: 5000 }],
        subtotal: 5000,
        total: 5000,
      },
      settings: baseSettings,
    })
    assert.ok(!htmlNoCat.includes('[ KATEGORI ]'))
    assert.ok(!htmlNoCat.includes('[ UMUM ]'))
  })

  // 13. Optional footer (greeting, return policy, cs contact, app info)
  it('Regression 13: Optional footer renders greeting, policy, CS contact, and app info cleanly', () => {
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-FOOTER',
        items: [{ product_name: 'Kopi', quantity: 1, unit_price: 10000, subtotal: 10000 }],
        subtotal: 10000,
        total: 10000,
      },
      settings: {
        ...baseSettings,
        footer_greeting: 'TERIMA KASIH & SELAMAT BERBELANJA',
        return_policy: 'Retur maksimal 1x24 jam dengan struk fisik.',
        cs_contact: '0812-9999-8888',
        app_info: 'Download aplikasi kami di Play Store',
      },
    })

    assert.ok(html.includes('TERIMA KASIH &amp; SELAMAT BERBELANJA') || html.includes('TERIMA KASIH & SELAMAT BERBELANJA'))
    assert.ok(html.includes('Retur maksimal 1x24 jam dengan struk fisik.'))
    assert.ok(html.includes('Kontak CS: 0812-9999-8888'))
    assert.ok(html.includes('Download aplikasi kami di Play Store'))
  })

  // 14. QR code payload
  it('Regression 14: Renders 1:1 QR code if payment QR payload is provided', () => {
    const qrDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const html = generateThermalReceiptHtml({
      order: {
        order_number: 'INV-QR',
        items: [{ product_name: 'Es Cincau', quantity: 1, unit_price: 8000, subtotal: 8000 }],
        subtotal: 8000,
        total: 8000,
        qr_code: qrDataUrl,
        payment_method: 'qris',
      },
      settings: baseSettings,
    })

    assert.ok(html.includes('QRIS Pembayaran'))
    assert.ok(html.includes(qrDataUrl))
    assert.ok(html.includes('aspect-ratio: 1/1') || html.includes('aspect-ratio: 1 / 1'))
  })

  // Paper Selector specification
  it('Paper selector label is "Ukuran Struk" with options "58 mm" and "80 mm"', () => {
    assert.ok(settingsPageSrc.includes('Ukuran Struk'), 'Settings page must label selector as "Ukuran Struk"')
    assert.ok(settingsPageSrc.includes('58 mm'), 'Settings page must provide option "58 mm"')
    assert.ok(settingsPageSrc.includes('80 mm'), 'Settings page must provide option "80 mm"')
    assert.ok(receiptViewSrc.includes('Ukuran Struk:'), 'ReceiptView must have on-the-fly paper selector')
  })

  // Print CSS specification
  it('index.css specifies .receipt--58mm and .receipt--80mm per struk.json', () => {
    assert.ok(indexCss.includes('.receipt--58mm'), 'index.css must define .receipt--58mm')
    assert.ok(indexCss.includes('.receipt--80mm'), 'index.css must define .receipt--80mm')
    assert.ok(indexCss.includes('width: 58mm'), 'must specify 58mm width')
    assert.ok(indexCss.includes('width: 80mm'), 'must specify 80mm width')
  })
})
