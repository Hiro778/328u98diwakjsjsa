import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  OPERATIONAL_INTENTS,
  parseOperationalText,
  parseIndonesianNumber,
  extractEmail,
  extractPhone,
  validateOperationalCommand,
  executeOperationalCommand,
  handleOperationalMessage,
  handleGuidedCommand,
  checkIdempotency,
  recordProcessed,
  resolveProduct,
  resolveSupplier,
  resolveCustomer,
  resolveInvoice
} from '../lib/operationalEngine.js'

// ── Mock Tenant-Scoped Database ──
function createMockSupabase() {
  const db = {
    products: [],
    inventory: [],
    stock_movements: [],
    suppliers: [],
    customers: [],
    expenses: [],
    sales: [],
    invoices: [],
    invoice_payments: [],
    whatsapp_message_queue: []
  }

  const client = {
    _db: db,
    from(tableName) {
      const table = db[tableName] || []
      let filters = []
      let operation = 'select'
      let insertItems = []
      let updatePayload = null
      let isSingle = false
      let isMaybeSingle = false

      const builder = {
        select(fields) {
          return builder
        },
        eq(col, val) {
          filters.push(row => row[col] === val)
          return builder
        },
        ilike(col, pattern) {
          filters.push(row => {
            const val = String(row[col] || '').toLowerCase()
            const p = pattern.replace(/%/g, '').toLowerCase()
            return val.includes(p)
          })
          return builder
        },
        limit(n) {
          return builder
        },
        single() {
          isSingle = true
          return builder
        },
        maybeSingle() {
          isMaybeSingle = true
          return builder
        },
        insert(payload) {
          operation = 'insert'
          const items = Array.isArray(payload) ? payload : [payload]
          insertItems = items.map((item, idx) => ({
            id: item.id || `uuid_${tableName}_${Date.now()}_${idx}`,
            created_at: new Date().toISOString(),
            ...item
          }))
          table.push(...insertItems)
          return builder
        },
        update(payload) {
          operation = 'update'
          updatePayload = payload
          return builder
        },
        delete() {
          operation = 'delete'
          return builder
        },
        then(resolve, reject) {
          try {
            if (operation === 'insert') {
              if (isSingle || isMaybeSingle) {
                resolve({ data: insertItems[0] || null, error: null })
              } else {
                resolve({ data: insertItems, error: null })
              }
              return
            }

            if (operation === 'update') {
              const updated = []
              for (let i = 0; i < table.length; i++) {
                if (filters.every(f => f(table[i]))) {
                  table[i] = { ...table[i], ...updatePayload, updated_at: new Date().toISOString() }
                  updated.push(table[i])
                }
              }
              resolve({ data: updated, error: null })
              return
            }

            if (operation === 'delete') {
              let count = 0
              for (let i = table.length - 1; i >= 0; i--) {
                if (filters.every(f => f(table[i]))) {
                  table.splice(i, 1)
                  count++
                }
              }
              resolve({ data: count, error: null })
              return
            }

            // operation === 'select'
            let rows = table.filter(r => filters.every(f => f(r)))
            if (isSingle) {
              resolve({ data: rows[0] || null, error: rows[0] ? null : new Error('Not found') })
            } else if (isMaybeSingle) {
              resolve({ data: rows[0] || null, error: null })
            } else {
              resolve({ data: rows, error: null })
            }
          } catch (err) {
            resolve({ data: null, error: err })
          }
        }
      }

      return builder
    }
  }

  return client
}

describe('WhatsApp Operational System (fixwa.md specifications)', () => {
  // ── TEST 1: Indonesian Number & Currency Normalization ──
  describe('1. Indonesian Number & Currency Parsing', () => {
    it('correctly parses pure numbers and dot notation', () => {
      assert.equal(parseIndonesianNumber('50000'), 50000)
      assert.equal(parseIndonesianNumber('50.000'), 50000)
      assert.equal(parseIndonesianNumber('1.500.000'), 1500000)
    })

    it('correctly parses Rp prefix and suffixes (k, rb, jt)', () => {
      assert.equal(parseIndonesianNumber('Rp 50.000'), 50000)
      assert.equal(parseIndonesianNumber('Rp. 10000'), 10000)
      assert.equal(parseIndonesianNumber('50k'), 50000)
      assert.equal(parseIndonesianNumber('100rb'), 100000)
      assert.equal(parseIndonesianNumber('1.5jt'), 1500000)
      assert.equal(parseIndonesianNumber('2 juta'), 2000000)
    })

    it('extracts emails and Indonesian phone numbers', () => {
      assert.equal(extractEmail('Yanto supplier email yanto@gmail.com nomor 08123456789'), 'yanto@gmail.com')
      assert.equal(extractPhone('nomor 08123456789 email test@domain.com'), '08123456789')
      assert.equal(extractPhone('telp: +62811223344'), '+62811223344')
    })
  })

  // ── TEST 2: Deterministic Rule-Based Parser (Mode 1) ──
  describe('2. Deterministic Rule-Based Parser (Mode 1)', () => {
    it('parses CREATE_SUPPLIER from natural text', () => {
      const res = parseOperationalText('Tambah supplier Yanto email yanto@gmail.com nomor 08123456789')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_SUPPLIER)
      assert.equal(res.data.name, 'Yanto')
      assert.equal(res.data.email, 'yanto@gmail.com')
      assert.equal(res.data.phone, '08123456789')
    })

    it('parses CREATE_SUPPLIER without explicit command verb', () => {
      const res = parseOperationalText('Yanto supplier email yanto@gmail.com')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_SUPPLIER)
      assert.equal(res.data.name, 'Yanto')
      assert.equal(res.data.email, 'yanto@gmail.com')
    })

    it('parses CREATE_PRODUCT with prices, stock, and warehouse', () => {
      const res = parseOperationalText('Tambah produk Kopi Susu harga beli 5000 harga jual 10000 stok 100 masuk Gudang Utama')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_PRODUCT)
      assert.equal(res.data.name, 'Kopi Susu')
      assert.equal(res.data.purchase_price, 5000)
      assert.equal(res.data.selling_price, 10000)
      assert.equal(res.data.initial_stock, 100)
      assert.ok(res.data.warehouse.includes('Gudang Utama'))
    })

    it('parses ADD_STOCK with quantity and warehouse', () => {
      const res = parseOperationalText('Tambah stok kecap 100 di Gudang Utama')
      assert.equal(res.intent, OPERATIONAL_INTENTS.ADD_STOCK)
      assert.equal(res.data.product_name, 'kecap')
      assert.equal(res.data.quantity, 100)
      assert.equal(res.data.warehouse, 'Gudang Utama')
    })

    it('parses REDUCE_STOCK with quantity and reason', () => {
      const res = parseOperationalText('Kurangi stok Kopi Susu 10 karena rusak')
      assert.equal(res.intent, OPERATIONAL_INTENTS.REDUCE_STOCK)
      assert.equal(res.data.product_name, 'Kopi Susu')
      assert.equal(res.data.quantity, 10)
      assert.equal(res.data.reason, 'rusak')
    })

    it('parses CREATE_CUSTOMER', () => {
      const res = parseOperationalText('Tambah pelanggan Budi nomor 0812999888 email budi@gmail.com')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_CUSTOMER)
      assert.equal(res.data.name, 'Budi')
      assert.equal(res.data.phone, '0812999888')
      assert.equal(res.data.email, 'budi@gmail.com')
    })

    it('parses CREATE_EXPENSE', () => {
      const res = parseOperationalText('Catat pengeluaran 500000 untuk beli bahan baku')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_EXPENSE)
      assert.equal(res.data.amount, 500000)
      assert.ok(res.data.description.includes('beli bahan baku'))
    })

    it('parses CREATE_INCOME', () => {
      const res = parseOperationalText('Catat pemasukan 1000000 penjualan')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_INCOME)
      assert.equal(res.data.amount, 1000000)
      assert.equal(res.data.description, 'penjualan')
    })

    it('parses CREATE_SALE', () => {
      const res = parseOperationalText('Catat penjualan Kopi Susu 2 harga 10000')
      assert.equal(res.intent, OPERATIONAL_INTENTS.CREATE_SALE)
      assert.equal(res.data.product_name, 'Kopi Susu')
      assert.equal(res.data.quantity, 2)
      assert.equal(res.data.unit_price, 10000)
      assert.equal(res.data.total, 20000)
    })

    it('parses RECORD_PAYMENT', () => {
      const res = parseOperationalText('Bayar invoice INV-001 500000')
      assert.equal(res.intent, OPERATIONAL_INTENTS.RECORD_PAYMENT)
      assert.equal(res.data.invoice_number, 'INV-001')
      assert.equal(res.data.amount, 500000)
    })

    it('parses STOCK_TRANSFER with destination warehouse', () => {
      const res = parseOperationalText('Transfer stok Kopi Susu ke Gudang Bandung')
      assert.equal(res.intent, OPERATIONAL_INTENTS.STOCK_TRANSFER)
      assert.equal(res.data.product_name, 'Kopi Susu')
      assert.equal(res.data.to_location, 'Gudang Bandung')
    })

    it('parses STOCK_TRANSFER with source and destination', () => {
      const res = parseOperationalText('Pindah stok Kopi Susu dari Gudang Utama ke Gudang Bandung')
      assert.equal(res.intent, OPERATIONAL_INTENTS.STOCK_TRANSFER)
      assert.equal(res.data.product_name, 'Kopi Susu')
      assert.equal(res.data.from_location, 'Gudang Utama')
      assert.equal(res.data.to_location, 'Gudang Bandung')
    })

    it('parses SHOW_MENU and SHOW_HELP', () => {
      assert.equal(parseOperationalText('menu').intent, OPERATIONAL_INTENTS.SHOW_MENU)
      assert.equal(parseOperationalText('bantuan').intent, OPERATIONAL_INTENTS.SHOW_MENU)
      assert.equal(parseOperationalText('bisnis sehat').intent, OPERATIONAL_INTENTS.SHOW_MENU)
    })
  })

  // ── TEST 3: Validation Layer ──
  describe('3. Validation Layer', () => {
    it('validates complete product command', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_PRODUCT,
        data: { name: 'Kopi Susu', purchase_price: 5000, selling_price: 10000, initial_stock: 50 }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, true)
      assert.equal(v.errors.length, 0)
    })

    it('rejects product command with missing prices and returns Indonesian guidance prompt', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_PRODUCT,
        data: { name: 'Kopi Susu' }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, false)
      assert.ok(v.prompt.includes('Harga beli?'))
      assert.ok(v.prompt.includes('Harga jual?'))
    })

    it('rejects add stock with negative or zero quantity', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.ADD_STOCK,
        data: { product_name: 'Kopi', quantity: 0 }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, false)
      assert.ok(v.prompt.includes('Berapa jumlah stok'))
    })

    it('rejects supplier with invalid email format', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_SUPPLIER,
        data: { name: 'Yanto', email: 'invalid-email' }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, false)
      assert.ok(v.errors.some(e => e.includes('email')))
    })

    it('validates STOCK_TRANSFER command with product and destination', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.STOCK_TRANSFER,
        data: { product_name: 'Kopi Susu', to_location: 'Gudang Bandung' }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, true)
      assert.equal(v.errors.length, 0)
    })

    it('rejects STOCK_TRANSFER with missing destination', () => {
      const cmd = {
        intent: OPERATIONAL_INTENTS.STOCK_TRANSFER,
        data: { product_name: 'Kopi Susu' }
      }
      const v = validateOperationalCommand(cmd)
      assert.equal(v.valid, false)
      assert.ok(v.prompt.includes('Ke mana stok'))
    })
  })

  // ── TEST 4: Tenant Isolation & Entity Resolution ──
  describe('4. Tenant Isolation & Entity Resolution', () => {
    it('strictly isolates products by business_id', async () => {
      const supabase = createMockSupabase()
      const businessA = 'biz_AAA'
      const businessB = 'biz_BBB'

      // Product in Business A
      await supabase.from('products').insert({
        business_id: businessA,
        name: 'Kopi Susu',
        unit_price: 10000,
        cost_price: 5000
      })

      // Try resolving from Business B
      const resB = await resolveProduct({
        supabase,
        businessId: businessB,
        productName: 'Kopi Susu'
      })
      assert.equal(resB.notFound, true, 'Business B must NOT see Business A products')

      // Resolve from Business A
      const resA = await resolveProduct({
        supabase,
        businessId: businessA,
        productName: 'Kopi Susu'
      })
      assert.ok(resA.product, 'Business A should find its own product')
      assert.equal(resA.product.name, 'Kopi Susu')
    })

    it('handles ambiguous entity resolution gracefully', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_123'

      await supabase.from('products').insert([
        { business_id: businessId, name: 'Kopi Susu Gula Aren', unit_price: 15000 },
        { business_id: businessId, name: 'Kopi Hitam Tubruk', unit_price: 10000 }
      ])

      const res = await resolveProduct({
        supabase,
        businessId,
        productName: 'Kopi'
      })

      assert.equal(res.ambiguous, true)
      assert.equal(res.options.length, 2)
      assert.ok(res.options.includes('Kopi Susu Gula Aren'))
      assert.ok(res.options.includes('Kopi Hitam Tubruk'))
    })
  })

  // ── TEST 5: Idempotency ──
  describe('5. Idempotency Layer', () => {
    it('prevents duplicate message execution for identical business_id + message_id', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_idemp_test'
      const msgId = 'msg_unique_12345'

      // First check: should not be duplicate
      const check1 = await checkIdempotency({ supabase, businessId, whatsappMessageId: msgId })
      assert.equal(check1.isDuplicate, false)

      // Record message as processed
      await recordProcessed({ supabase, businessId, whatsappMessageId: msgId })

      // Second check: must detect duplicate
      const check2 = await checkIdempotency({ supabase, businessId, whatsappMessageId: msgId })
      assert.equal(check2.isDuplicate, true)
    })
  })

  // ── TEST 6: Unified Execution Engine (Database Mutations) ──
  describe('6. Unified Execution Engine (Mode 1 & Mode 2 Mutate Real DB)', () => {
    it('executes CREATE_PRODUCT: populates products, inventory, and stock_movements', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_prod_test'

      const command = {
        intent: OPERATIONAL_INTENTS.CREATE_PRODUCT,
        source: 'rule_based',
        data: {
          name: 'Kopi Susu Aren',
          purchase_price: 6000,
          selling_price: 12000,
          initial_stock: 50,
          warehouse: 'Gudang Utama',
          unit: 'cup'
        }
      }

      const res = await executeOperationalCommand(command, { supabase, businessId })
      assert.equal(res.success, true)
      assert.ok(res.message.includes('✅ *Berhasil dicatat*'))
      assert.ok(res.message.includes('Kopi Susu Aren'))

      // Verify DB persistence
      assert.equal(supabase._db.products.length, 1)
      assert.equal(supabase._db.products[0].name, 'Kopi Susu Aren')
      assert.equal(supabase._db.products[0].unit_price, 12000)

      assert.equal(supabase._db.inventory.length, 1)
      assert.equal(supabase._db.inventory[0].quantity, 50)
      assert.equal(supabase._db.inventory[0].location, 'Gudang Utama')

      assert.equal(supabase._db.stock_movements.length, 1)
      assert.equal(supabase._db.stock_movements[0].movement_type, 'stock_in')
      assert.equal(supabase._db.stock_movements[0].quantity, 50)
    })

    it('executes ADD_STOCK and updates inventory & audit trail', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_stock_test'

      // Setup existing product
      const { data: prod } = await supabase.from('products').insert({
        business_id: businessId,
        name: 'Kecap Manis',
        unit_price: 15000,
        cost_price: 10000,
        unit: 'botol'
      })
      await supabase.from('inventory').insert({
        product_id: prod[0].id,
        quantity: 20,
        location: 'Gudang Utama'
      })

      const addCmd = {
        intent: OPERATIONAL_INTENTS.ADD_STOCK,
        source: 'guided_form',
        data: {
          product_name: 'Kecap Manis',
          quantity: 30,
          warehouse: 'Gudang Utama'
        }
      }

      const res = await executeOperationalCommand(addCmd, { supabase, businessId })
      assert.equal(res.success, true)
      assert.ok(res.message.includes('Stok sekarang: *50*'))

      assert.equal(supabase._db.inventory[0].quantity, 50)
      assert.equal(supabase._db.stock_movements.length, 1)
      assert.equal(supabase._db.stock_movements[0].movement_type, 'stock_in')
      assert.equal(supabase._db.stock_movements[0].quantity, 30)
    })

    it('executes REDUCE_STOCK and prevents negative stock', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_stock_reduce'

      const { data: prod } = await supabase.from('products').insert({
        business_id: businessId,
        name: 'Roti Coklat',
        unit_price: 5000
      })
      await supabase.from('inventory').insert({
        product_id: prod[0].id,
        quantity: 10
      })

      // 1. Attempt reducing 15 (exceeds current stock 10)
      const failCmd = {
        intent: OPERATIONAL_INTENTS.REDUCE_STOCK,
        data: { product_name: 'Roti Coklat', quantity: 15 }
      }
      const failRes = await executeOperationalCommand(failCmd, { supabase, businessId })
      assert.equal(failRes.success, false)
      assert.ok(failRes.message.includes('Stok tidak mencukupi'))
      assert.equal(supabase._db.inventory[0].quantity, 10, 'Stock must not change on failure')

      // 2. Reduce 4 (valid)
      const okCmd = {
        intent: OPERATIONAL_INTENTS.REDUCE_STOCK,
        data: { product_name: 'Roti Coklat', quantity: 4 }
      }
      const okRes = await executeOperationalCommand(okCmd, { supabase, businessId })
      assert.equal(okRes.success, true)
      assert.equal(supabase._db.inventory[0].quantity, 6)
      assert.equal(supabase._db.stock_movements.length, 1)
      assert.equal(supabase._db.stock_movements[0].movement_type, 'stock_out')
    })

    it('executes CREATE_EXPENSE and records into expenses table', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_exp_test'

      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_EXPENSE,
        data: { amount: 500000, category: 'Bahan Baku', description: 'Beli gula dan kopi' }
      }
      const res = await executeOperationalCommand(cmd, { supabase, businessId })
      assert.equal(res.success, true)
      assert.equal(supabase._db.expenses.length, 1)
      assert.equal(supabase._db.expenses[0].amount, 500000)
    })

    it('executes CREATE_INCOME and records into sales table', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_inc_test'

      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_INCOME,
        data: { amount: 1000000, description: 'Penjualan offline' }
      }
      const res = await executeOperationalCommand(cmd, { supabase, businessId })
      assert.equal(res.success, true)
      assert.equal(supabase._db.sales.length, 1)
      assert.equal(supabase._db.sales[0].total, 1000000)
    })

    it('executes CREATE_INVOICE and RECORD_PAYMENT atomically', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_inv_test'

      // 1. Create Invoice
      const invCmd = {
        intent: OPERATIONAL_INTENTS.CREATE_INVOICE,
        data: { invoice_number: 'INV-2026-001', amount: 500000, customer_name: 'Pak Joko' }
      }
      const invRes = await executeOperationalCommand(invCmd, { supabase, businessId })
      assert.equal(invRes.success, true)
      assert.equal(supabase._db.invoices[0].amount, 500000)
      assert.equal(supabase._db.invoices[0].status, 'pending')

      // 2. Partial Payment (300.000)
      const pay1 = {
        intent: OPERATIONAL_INTENTS.RECORD_PAYMENT,
        data: { invoice_number: 'INV-2026-001', amount: 300000, method: 'Transfer' }
      }
      const payRes1 = await executeOperationalCommand(pay1, { supabase, businessId })
      assert.equal(payRes1.success, true)
      assert.equal(supabase._db.invoices[0].paid_amount, 300000)
      assert.equal(supabase._db.invoices[0].status, 'partially_paid')

      // 3. Full Payment Remaining (200.000)
      const pay2 = {
        intent: OPERATIONAL_INTENTS.RECORD_PAYMENT,
        data: { invoice_number: 'INV-2026-001', amount: 200000, method: 'Transfer' }
      }
      const payRes2 = await executeOperationalCommand(pay2, { supabase, businessId })
      assert.equal(payRes2.success, true)
      assert.equal(supabase._db.invoices[0].paid_amount, 500000)
      assert.equal(supabase._db.invoices[0].status, 'paid')
    })

    it('honestly handles CREATE_WAREHOUSE with clear guidance without mock data', async () => {
      const supabase = createMockSupabase()
      const cmd = {
        intent: OPERATIONAL_INTENTS.CREATE_WAREHOUSE,
        data: { name: 'Gudang Bandung' }
      }
      const res = await executeOperationalCommand(cmd, { supabase, businessId: 'biz_wh' })
      assert.equal(res.success, true)
      assert.ok(res.message.includes('Manajemen Gudang Mandiri'))
      assert.ok(res.message.includes('lokasi penyimpanan'))
    })

    it('executes STOCK_TRANSFER and updates inventory.location properly', async () => {
      const supabase = createMockSupabase()
      const businessId = 'biz_transfer'

      // 1. Create product with initial inventory at Gudang Utama
      const { data: prod } = await supabase.from('products').insert({
        business_id: businessId,
        name: 'Kopi Susu',
        unit_price: 15000,
        cost_price: 8000,
        unit: 'botol'
      }).single()

      await supabase.from('inventory').insert({
        product_id: prod.id,
        quantity: 50,
        location: 'Gudang Utama'
      })

      // 2. Execute STOCK_TRANSFER to Gudang Bandung
      const cmd = {
        intent: OPERATIONAL_INTENTS.STOCK_TRANSFER,
        data: {
          product_name: 'Kopi Susu',
          from_location: 'Gudang Utama',
          to_location: 'Gudang Bandung',
          quantity: 20
        }
      }

      const res = await executeOperationalCommand(cmd, { supabase, businessId })
      assert.equal(res.success, true)
      assert.ok(res.message.includes('Gudang Bandung'))
      assert.ok(res.message.includes('Transfer stok berhasil dicatat'))
      assert.equal(supabase._db.inventory[0].location, 'Gudang Bandung')
    })
  })

  // ── TEST 7: Mode 1 (Text) vs Mode 2 (Guided Form) Parity ──
  describe('7. Mode 1 (Text) vs Mode 2 (Form) Equivalence', () => {
    it('produces identical database results for Mode 1 and Mode 2', async () => {
      const supabase1 = createMockSupabase()
      const supabase2 = createMockSupabase()
      const businessId = 'biz_parity'

      // Mode 1: Text message
      const textMsg = 'Tambah supplier Yanto email yanto@gmail.com nomor 08123456789'
      await handleOperationalMessage({
        text: textMsg,
        businessId,
        supabase: supabase1
      })

      // Mode 2: Guided Form submit
      const formCmd = {
        intent: OPERATIONAL_INTENTS.CREATE_SUPPLIER,
        source: 'guided_form',
        data: {
          name: 'Yanto',
          email: 'yanto@gmail.com',
          phone: '08123456789'
        }
      }
      await handleGuidedCommand({
        command: formCmd,
        businessId,
        supabase: supabase2
      })

      // Verify identical DB state
      assert.equal(supabase1._db.suppliers.length, 1)
      assert.equal(supabase2._db.suppliers.length, 1)
      assert.equal(supabase1._db.suppliers[0].name, supabase2._db.suppliers[0].name)
      assert.equal(supabase1._db.suppliers[0].email, supabase2._db.suppliers[0].email)
      assert.equal(supabase1._db.suppliers[0].phone, supabase2._db.suppliers[0].phone)
    })
  })
})
