import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RECEIPT_SETTINGS,
  formatReceiptWhatsAppText,
  getWhatsAppShareUrl,
} from '../services/receiptSettingsService.js'

test('DEFAULT_RECEIPT_SETTINGS has expected schema and values', () => {
  assert.equal(typeof DEFAULT_RECEIPT_SETTINGS.store_name, 'string')
  assert.equal(DEFAULT_RECEIPT_SETTINGS.paper_size, '58mm')
  assert.equal(DEFAULT_RECEIPT_SETTINGS.show_table, true)
  assert.equal(DEFAULT_RECEIPT_SETTINGS.show_cashier, true)
  assert.equal(DEFAULT_RECEIPT_SETTINGS.show_order_number, true)
})

test('formatReceiptWhatsAppText formats order with custom receipt settings', () => {
  const sampleOrder = {
    order_number: 'ORD-9901',
    table: { name: 'VIP 1' },
    created_at: '2026-09-18T10:30:00Z',
    items: [
      { product_name: 'Espresso Single', quantity: 2, unit_price: 15000, subtotal: 30000 },
      { product_name: 'Croissant Butter', quantity: 1, unit_price: 25000, subtotal: 25000 },
    ],
    subtotal: 55000,
    discount_amount: 5000,
    total: 50000,
    payment_method: 'cash',
    payment_status: 'paid',
  }

  const customSettings = {
    store_name: 'Warung Kopi Senja',
    store_address: 'Jl. Melati No. 12, Bandung',
    store_phone: '08123456789',
    header_text: 'Selamat Menikmati',
    footer_text: 'Terima kasih atas kunjungannya',
    show_table: true,
    show_cashier: true,
    show_order_number: true,
  }

  const waText = formatReceiptWhatsAppText({
    order: sampleOrder,
    settings: customSettings,
    cashierName: 'Budi Santoso',
  })

  // Verify store identity in WA text
  assert.ok(waText.includes('*WARUNG KOPI SENJA*'))
  assert.ok(waText.includes('Jl. Melati No. 12, Bandung'))
  assert.ok(waText.includes('Telp/WA: 08123456789'))
  assert.ok(waText.includes('_Selamat Menikmati_'))

  // Verify order details
  assert.ok(waText.includes('No. Pesanan : #ORD-9901'))
  assert.ok(waText.includes('Meja        : VIP 1'))
  assert.ok(waText.includes('Kasir       : Budi Santoso'))

  // Verify items
  assert.ok(waText.includes('2x Espresso Single'))
  assert.ok(waText.includes('1x Croissant Butter'))

  // Verify financial totals
  assert.ok(waText.includes('Subtotal'))
  assert.ok(waText.includes('Diskon'))
  assert.ok(waText.includes('*TOTAL'))
  assert.ok(waText.includes('Metode Bayar: Tunai'))
  assert.ok(waText.includes('Status      : *LUNAS*'))

  // Verify footer
  assert.ok(waText.includes('_Terima kasih atas kunjungannya_'))
})

test('formatReceiptWhatsAppText respects toggles (hide table, cashier, order number)', () => {
  const sampleOrder = {
    order_number: 'ORD-1234',
    table: { name: 'Meja 9' },
    created_at: '2026-09-18T12:00:00Z',
    items: [{ product_name: 'Teh Manis', quantity: 1, unit_price: 5000, subtotal: 5000 }],
    subtotal: 5000,
    total: 5000,
    payment_method: 'qris',
    payment_status: 'paid',
  }

  const minimalSettings = {
    store_name: 'Kedai Simpel',
    show_table: false,
    show_cashier: false,
    show_order_number: false,
  }

  const waText = formatReceiptWhatsAppText({
    order: sampleOrder,
    settings: minimalSettings,
    cashierName: 'Kasir Rahasia',
  })

  assert.ok(waText.includes('*KEDAI SIMPEL*'))
  assert.ok(!waText.includes('No. Pesanan'))
  assert.ok(!waText.includes('Meja        :'))
  assert.ok(!waText.includes('Kasir       :'))
})

test('getWhatsAppShareUrl sanitizes Indonesian telephone numbers correctly', () => {
  // With 08 prefix -> converts to 628
  const url1 = getWhatsAppShareUrl({ phone: '0812-3456-7890', text: 'Halo Struk' })
  assert.ok(url1.startsWith('https://wa.me/6281234567890?text=Halo%20Struk'))

  // With 62 prefix -> keeps 62
  const url2 = getWhatsAppShareUrl({ phone: '+6281299998888', text: 'Tes' })
  assert.ok(url2.startsWith('https://wa.me/6281299998888?text=Tes'))

  // Without phone -> wa.me/?text=...
  const url3 = getWhatsAppShareUrl({ phone: '', text: 'Tes' })
  assert.ok(url3.startsWith('https://wa.me/?text=Tes'))
})

test('Tenant Isolation RLS verification in SQL Migration 048', async () => {
  const fs = await import('node:fs')
  const migrationContent = fs.readFileSync('supabase/migrations/048_pos_receipt_settings.sql', 'utf-8')

  // Enforce RLS enabled
  assert.ok(migrationContent.includes('ALTER TABLE public.pos_receipt_settings ENABLE ROW LEVEL SECURITY;'))

  // Enforce all 4 tenant policies checking business ownership
  assert.ok(migrationContent.includes('CREATE POLICY "pos_receipt_settings_owner_select"'))
  assert.ok(migrationContent.includes('CREATE POLICY "pos_receipt_settings_owner_insert"'))
  assert.ok(migrationContent.includes('CREATE POLICY "pos_receipt_settings_owner_update"'))
  assert.ok(migrationContent.includes('CREATE POLICY "pos_receipt_settings_owner_delete"'))

  // Ensure owner_id check references auth.uid()
  assert.ok(migrationContent.includes('owner_id = (SELECT auth.uid())'))
})

test('ReceiptView component does NOT contain hardcoded "BisnisSehat POS" branding footer', async () => {
  const fs = await import('node:fs')
  const receiptViewCode = fs.readFileSync('src/components/pos/ReceiptView.jsx', 'utf-8')

  assert.ok(
    !receiptViewCode.includes('BisnisSehat POS'),
    'ReceiptView must not contain "BisnisSehat POS"'
  )
  assert.ok(
    !receiptViewCode.includes('www.bisnisehat.id'),
    'ReceiptView must not contain "www.bisnisehat.id"'
  )
  // Ensure footerText custom note rendering is preserved
  assert.ok(
    receiptViewCode.includes('{footerText}'),
    'ReceiptView must preserve custom footerText rendering'
  )
})

test('formatReceiptWhatsAppText does NOT output hardcoded "BisnisSehat POS" or "www.bisnisehat.id"', () => {
  const sampleOrder = {
    order_number: 'ORD-101',
    table: { name: '01' },
    created_at: '2026-09-18T10:00:00Z',
    items: [{ product_name: 'Kopi', quantity: 1, unit_price: 10000, subtotal: 10000 }],
    subtotal: 10000,
    total: 10000,
    payment_method: 'cash',
    payment_status: 'paid',
  }

  const settingsWithCustomFooter = {
    store_name: 'Toko Kopi ABC',
    footer_text: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.',
  }

  const waText = formatReceiptWhatsAppText({
    order: sampleOrder,
    settings: settingsWithCustomFooter,
  })

  assert.ok(!waText.includes('BisnisSehat POS'))
  assert.ok(!waText.includes('www.bisnisehat.id'))
  assert.ok(waText.includes('_Barang yang sudah dibeli tidak dapat ditukar/dikembalikan._'))
})

