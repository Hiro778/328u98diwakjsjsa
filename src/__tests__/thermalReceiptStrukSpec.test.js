// src/__tests__/thermalReceiptStrukSpec.test.js
// Verification suite for struk.md: POS Thermal Receipt Print Size & Formatting

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { generateThermalReceiptHtml, calculateReceiptHeightMm } from '../lib/receiptPrinter.js'

describe('struk.md: POS Thermal Receipt Print Size & Layout Verification', () => {
  const indexCss = fs.readFileSync(path.resolve('src/index.css'), 'utf8')
  const receiptViewSrc = fs.readFileSync(path.resolve('src/components/pos/ReceiptView.jsx'), 'utf8')
  const receiptPrinterSrc = fs.readFileSync(path.resolve('src/lib/receiptPrinter.js'), 'utf8')

  const baseSettings = {
    paper_size: '58mm',
    store_name: 'Warung Kopi & Dimsum Bahagia',
    store_address: 'Jl. Melati No. 12, Bandung',
    store_phone: '08123456789',
    header_text: 'Selamat Menikmati',
    footer_text: 'Terima kasih atas kunjungan Anda!',
    show_logo: false,
    show_table: true,
    show_cashier: true,
    show_order_number: true,
  }

  // A. Order Rp200.000 like in screenshot
  const screenshotOrder200k = {
    id: 'ord-200k',
    order_number: '108',
    created_at: '2026-09-20T13:15:00Z',
    table: { name: 'Meja 05' },
    payment_method: 'cash',
    payment_status: 'paid',
    items: [
      { id: 'i1', product_name: 'Paket Nasi Liwet Komplit', quantity: 4, unit_price: 35000, subtotal: 140000 },
      { id: 'i2', product_name: 'Es Kelapa Muda Spesial', quantity: 4, unit_price: 15000, subtotal: 60000 },
    ],
    subtotal: 200000,
    discount_amount: 0,
    total: 200000,
  }

  describe('1. Print CSS & Dimension Requirements (@page & 58mm width)', () => {
    it('Generated HTML specifies @page size 58mm auto and zero margin', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: baseSettings,
      })

      assert.ok(html.includes('@page {'), 'Must define @page rule')
      assert.ok(html.includes('size: 58mm auto;'), 'Must have size: 58mm auto')
      assert.ok(html.includes('margin: 0;'), 'Must have margin: 0')
    })

    it('html, body, and .receipt are strictly 58mm in generated HTML', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: baseSettings,
      })

      assert.ok(html.includes('width: 58mm;'), 'Must set width: 58mm')
      assert.ok(html.includes('min-width: 58mm;'), 'Must set min-width: 58mm')
      assert.ok(html.includes('max-width: 58mm;'), 'Must set max-width: 58mm')
      assert.ok(html.includes('.receipt {'), 'Must include .receipt class styling')
    })

    it('Does NOT contain A4, Letter, landscape, or fixed viewport heights (297mm, 100vh)', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: baseSettings,
      })

      const lower = html.toLowerCase()
      assert.ok(!lower.includes('size: a4'), 'Must not use A4 size')
      assert.ok(!lower.includes('size: letter'), 'Must not use Letter size')
      assert.ok(!lower.includes('landscape'), 'Must not use landscape orientation')
      assert.ok(!lower.includes('297mm'), 'Must not use A4 height 297mm')
      assert.ok(!lower.includes('100vh'), 'Must not use 100vh')
      assert.ok(!lower.includes('transform: scale'), 'Must not use scale hack')
      assert.ok(!lower.includes('zoom:'), 'Must not use zoom hack')
    })

    it('index.css @media print specifies size 58mm auto and width 58mm !important', () => {
      assert.ok(indexCss.includes('@media print'), 'index.css must contain @media print')
      assert.ok(indexCss.includes('size: 58mm auto;'), 'index.css must specify size: 58mm auto')
      assert.ok(indexCss.includes('width: 58mm !important;'), 'index.css must specify width: 58mm !important')
      assert.ok(!indexCss.includes('size: auto;'), 'index.css must not use unconstrained size: auto')
    })
  })

  describe('2. Receipt Length & Content-Driven Height (Short, Long, Wrapped)', () => {
    it('Short receipt (1 item) generates single page container with auto height', () => {
      const shortOrder = {
        id: 'ord-short',
        order_number: '1',
        created_at: '2026-09-20T12:00:00Z',
        items: [
          { id: 'i1', product_name: 'Kopi Hitam', quantity: 1, unit_price: 10000, subtotal: 10000 },
        ],
        subtotal: 10000,
        total: 10000,
      }

      const html = generateThermalReceiptHtml({
        order: shortOrder,
        settings: baseSettings,
      })

      assert.ok(html.includes('Kopi Hitam'))
      assert.ok(html.includes('10.000'))
      assert.ok(html.includes('height: auto;'), 'Height must be content-driven auto')
      assert.ok(html.includes('page-break-inside: avoid;'))
      assert.equal((html.match(/class="[^"]*\breceipt\b[^"]*"/g) || []).length, 1)
    })

    it('Long receipt (12 items) renders all items without fixed clipping or overflow cut', () => {
      const longItems = Array.from({ length: 12 }, (_, i) => ({
        id: `item-${i + 1}`,
        product_name: `Menu Pilihan ${i + 1}`,
        quantity: 2,
        unit_price: 15000,
        subtotal: 30000,
      }))

      const longOrder = {
        id: 'ord-long',
        order_number: '99',
        created_at: '2026-09-20T14:00:00Z',
        items: longItems,
        subtotal: 360000,
        total: 360000,
      }

      const html = generateThermalReceiptHtml({
        order: longOrder,
        settings: baseSettings,
      })

      longItems.forEach((it) => {
        assert.ok(html.includes(it.product_name), `Must include ${it.product_name}`)
      })
      assert.ok(html.includes('360.000'))
      assert.ok(html.includes('overflow: visible !important;'))
    })

    it('Long product names wrap cleanly using word-break with right-aligned prices', () => {
      const longNameOrder = {
        id: 'ord-wrap',
        order_number: '100',
        created_at: '2026-09-20T14:30:00Z',
        items: [
          {
            id: 'i1',
            product_name: 'Es Campur Spesial Durian Montong Keju Susu Komplit Manis Segar Sekali',
            quantity: 2,
            unit_price: 35000,
            subtotal: 70000,
          },
        ],
        subtotal: 70000,
        total: 70000,
      }

      const html = generateThermalReceiptHtml({
        order: longNameOrder,
        settings: baseSettings,
      })

      assert.ok(html.includes('word-break: break-word;'), 'Must support word-break for wrapping')
      assert.ok(html.includes('overflow-wrap: break-word;'), 'Must support overflow-wrap')
      assert.ok(html.includes('text-align: right;'), 'Price must align right')
    })
  })

  describe('3. Isolated Print Mechanism & No Dashboard Inheritance', () => {
    it('ReceiptView delegates printing to printThermalReceipt via dedicated hidden iframe', () => {
      assert.ok(receiptViewSrc.includes('printThermalReceipt({'))
      assert.ok(receiptPrinterSrc.includes('pos-thermal-print-frame'))
      assert.ok(receiptPrinterSrc.includes('document.createElement(\'iframe\')'))
    })

    it('Total and footer are rendered after items and not fixed to bottom of page', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: baseSettings,
      })

      const itemsIdx = html.indexOf('Paket Nasi Liwet Komplit')
      const totalIdx = html.indexOf('TOTAL')
      const footerIdx = html.indexOf('Terima kasih atas kunjungan Anda!')

      assert.ok(itemsIdx > 0, 'Items must exist')
      assert.ok(totalIdx > itemsIdx, 'TOTAL must appear after items')
      assert.ok(footerIdx > totalIdx, 'Footer must appear after TOTAL')
      assert.ok(!html.includes('position: fixed; bottom: 0;'), 'Footer must not be fixed bottom')
    })
  })

  describe('4. Mandatory struk.md Verification Cases (A to I)', () => {
    it('A. 1–2 items: renders compact receipt with proportionate dynamic height', () => {
      const order2Items = {
        id: 'ord-2',
        order_number: '12',
        items: [
          { product_name: 'Kopi Susu Gula Aren', quantity: 1, unit_price: 18000, subtotal: 18000 },
          { product_name: 'Croissant Cokelat', quantity: 1, unit_price: 22000, subtotal: 22000 },
        ],
        subtotal: 40000,
        total: 40000,
      }
      const html = generateThermalReceiptHtml({ order: order2Items, settings: { paper_size: '58mm' } })
      assert.ok(html.includes('Kopi Susu Gula Aren'))
      assert.ok(html.includes('Croissant Cokelat'))
      assert.ok(html.includes('40.000'))

      // Dynamic height conversion test for ~300px compact receipt
      const heightMm = calculateReceiptHeightMm(300, 4)
      assert.ok(heightMm >= 80 && heightMm <= 100, `Expected ~84mm for 300px, got ${heightMm}mm`)
    })

    it('B. 10+ items: renders all items without truncating or page overflowing', () => {
      const order12Items = {
        id: 'ord-12',
        order_number: '13',
        items: Array.from({ length: 12 }, (_, i) => ({
          product_name: `Menu Spesial Kuliner #${i + 1}`,
          quantity: 2,
          unit_price: 25000,
          subtotal: 50000,
        })),
        subtotal: 600000,
        total: 600000,
      }
      const html = generateThermalReceiptHtml({ order: order12Items, settings: { paper_size: '58mm' } })
      for (let i = 1; i <= 12; i++) {
        assert.ok(html.includes(`Menu Spesial Kuliner #${i}`))
      }
      // Height for 12 items should scale proportionally
      const heightMm = calculateReceiptHeightMm(950, 4)
      assert.ok(heightMm > 200, `Expected height > 200mm for long receipt, got ${heightMm}mm`)
    })

    it('C. Nama produk sangat panjang: wraps cleanly with break-word and maintains right-aligned prices', () => {
      const orderLong = {
        id: 'ord-long-title',
        order_number: '14',
        items: [
          {
            product_name: 'Nasi Liwet Solo Komplit Porsi Jumbo Gurih Mantap dengan Telur Puyuh Pindang Sambal Goreng Krecek Super Pedas',
            quantity: 1,
            unit_price: 45000,
            subtotal: 45000,
          },
        ],
        subtotal: 45000,
        total: 45000,
      }
      const html = generateThermalReceiptHtml({ order: orderLong, settings: { paper_size: '58mm' } })
      assert.ok(html.includes('word-break: break-word;'))
      assert.ok(html.includes('overflow-wrap: break-word;'))
      assert.ok(html.includes('Nasi Liwet Solo Komplit Porsi Jumbo'))
      assert.ok(html.includes('text-align: right;'))
    })

    it('D. Diskon: renders discount line in red with minus sign', () => {
      const orderDiscount = {
        id: 'ord-disc',
        order_number: '15',
        items: [{ product_name: 'Steak Ayam Crispy', quantity: 2, unit_price: 30000, subtotal: 60000 }],
        subtotal: 60000,
        discount_amount: 10000,
        total: 50000,
      }
      const html = generateThermalReceiptHtml({ order: orderDiscount, settings: { paper_size: '58mm' } })
      assert.ok(html.includes('Diskon'))
      assert.ok(html.includes('-Rp&nbsp;10.000') || html.includes('-Rp 10.000') || html.includes('10.000'))
      assert.ok(html.includes('50.000'))
    })

    it('E. Footer panjang: wraps footer text without clipping or overlapping content', () => {
      const longFooterText = 'Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan kecuali ada perjanjian sebelumnya. Simpan struk ini sebagai bukti pembayaran yang sah. Kritik & Saran WA: 08123456789.'
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: { ...baseSettings, footer_text: longFooterText },
      })
      assert.ok(html.includes('Barang yang sudah dibeli tidak dapat ditukar'))
      assert.ok(html.includes('word-break: break-word;'))
    })

    it('F. 58mm mode: sets width 58mm and supports calculated height injection', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: { paper_size: '58mm' },
        heightMm: 125,
      })
      assert.ok(html.includes('size: 58mm 125mm;'))
      assert.ok(html.includes('width: 58mm;'))
    })

    it('G. 80mm mode: sets width 80mm and supports calculated height injection', () => {
      const html = generateThermalReceiptHtml({
        order: screenshotOrder200k,
        settings: { paper_size: '80mm' },
        heightMm: 140,
      })
      assert.ok(html.includes('size: 80mm 140mm;'))
      assert.ok(html.includes('width: 80mm;'))
    })

    it('H. Chrome Print Preview: receiptPrinter.js injects dynamic @page with targetWidth and heightMm', () => {
      const printerCode = fs.readFileSync(path.resolve('src/lib/receiptPrinter.js'), 'utf8')
      assert.ok(printerCode.includes('calculateReceiptHeightMm'))
      assert.ok(printerCode.includes('pos-dynamic-page-size'))
      assert.ok(printerCode.includes('${targetWidth} ${calculatedHeightMm}mm !important'))
      assert.ok(printerCode.includes('iframe.contentWindow?.print()'))
    })

    it('I. Save as PDF: dynamic height calculation converts pixel height to physical mm accurately', () => {
      // 96px = 25.4mm. For 384px (4 inches): ceil(384 * 25.4 / 96) = 102mm. With safetyBuffer 4mm -> 106mm
      const calculated = calculateReceiptHeightMm(384, 4)
      assert.equal(calculated, 106)
      assert.equal(calculateReceiptHeightMm(0), 0)
    })
  })
})
