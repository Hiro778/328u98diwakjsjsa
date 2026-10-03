import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseBusinessIntent, BUSINESS_TOOLS } from '../services/aiIntentRouter.js'
import {
  handleAiBusinessAnalystRequest,
  executeCreateSupplier,
} from '../services/aiBusinessAnalyst.server.js'

describe('AI Business Analyst — Deterministic Intent & Entity Router Suite', () => {
  describe('1. create_supplier Natural Language Variants', () => {
    it('1. "bisa tambah supplier yanto?" resolves to create_supplier with name yanto', () => {
      const res = parseBusinessIntent('bisa tambah supplier yanto?')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name?.toLowerCase(), 'yanto')
    })

    it('2. "tambah supplier Yanto" resolves to create_supplier with name Yanto', () => {
      const res = parseBusinessIntent('tambah supplier Yanto')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, 'Yanto')
    })

    it('3. "buat supplier baru namanya Yanto" resolves to create_supplier with name Yanto', () => {
      const res = parseBusinessIntent('buat supplier baru namanya Yanto')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, 'Yanto')
    })

    it('4. "masukin Yanto sebagai supplier" resolves to create_supplier with name Yanto', () => {
      const res = parseBusinessIntent('masukin Yanto sebagai supplier')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, 'Yanto')
    })

    it('5. "daftarkan supplier Yanto" resolves to create_supplier with name Yanto', () => {
      const res = parseBusinessIntent('daftarkan supplier Yanto')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, 'Yanto')
    })

    it('6. "gw mau nambah supplier" resolves to create_supplier with null name', () => {
      const res = parseBusinessIntent('gw mau nambah supplier')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, null)
    })

    it('7. "buat supplier baru dong" resolves to create_supplier with null name', () => {
      const res = parseBusinessIntent('buat supplier baru dong')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.type, 'WRITE')
      assert.equal(res.entity.name, null)
    })
  })

  describe('2. All Required WRITE Tools Parsing', () => {
    it('resolves create_supplier', () => {
      const res = parseBusinessIntent('tambah supplier Toko Abadi')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_SUPPLIER)
      assert.equal(res.entity.name, 'Toko Abadi')
    })

    it('resolves update_supplier', () => {
      const res = parseBusinessIntent('ubah supplier Toko Abadi')
      assert.equal(res.tool, BUSINESS_TOOLS.UPDATE_SUPPLIER)
      assert.equal(res.entity.name, 'Toko Abadi')
    })

    it('resolves delete_supplier', () => {
      const res = parseBusinessIntent('hapus supplier Toko Abadi')
      assert.equal(res.tool, BUSINESS_TOOLS.DELETE_SUPPLIER)
      assert.equal(res.entity.name, 'Toko Abadi')
    })

    it('resolves create_product', () => {
      const res = parseBusinessIntent('tambah produk Kopi Gula Aren')
      assert.equal(res.tool, BUSINESS_TOOLS.CREATE_PRODUCT)
      assert.equal(res.entity.name, 'Kopi Gula Aren')
    })

    it('resolves update_product', () => {
      const res = parseBusinessIntent('ubah harga produk Kopi Gula Aren')
      assert.equal(res.tool, BUSINESS_TOOLS.UPDATE_PRODUCT)
      assert.equal(res.entity.name, 'Kopi Gula Aren')
    })

    it('resolves delete_product', () => {
      const res = parseBusinessIntent('hapus produk Roti Cokelat')
      assert.equal(res.tool, BUSINESS_TOOLS.DELETE_PRODUCT)
      assert.equal(res.entity.name, 'Roti Cokelat')
    })

    it('resolves update_inventory', () => {
      const res = parseBusinessIntent('update stok kopi jadi 25')
      assert.equal(res.tool, BUSINESS_TOOLS.UPDATE_INVENTORY)
      assert.ok(res.entity.target)
    })
  })

  describe('3. All Required READ Tools Parsing', () => {
    it('resolves analyze_sales', () => {
      const res = parseBusinessIntent('Produk apa paling laku bulan ini?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_SALES)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_revenue', () => {
      const res = parseBusinessIntent('Berapa omzet saya bulan ini?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_REVENUE)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_profit', () => {
      const res = parseBusinessIntent('Berapa margin saya?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_PROFIT)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_inventory', () => {
      const res = parseBusinessIntent('cek status inventori gudang')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_INVENTORY)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_low_stock', () => {
      const res = parseBusinessIntent('Kapan saya harus restock?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_LOW_STOCK)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_orders', () => {
      const res = parseBusinessIntent('bagaimana rekap pesanan dan transaksi hari ini?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_ORDERS)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_products', () => {
      const res = parseBusinessIntent('tampilkan katalog produk')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_PRODUCTS)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_suppliers', () => {
      const res = parseBusinessIntent('siapa saja daftar supplier aktif?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_SUPPLIERS)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_cashflow', () => {
      const res = parseBusinessIntent('bagaimana kondisi arus kas bisnis?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_CASHFLOW)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_customer_metrics', () => {
      const res = parseBusinessIntent('berapa metrik pelanggan baru bulan ini?')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_CUSTOMER_METRICS)
      assert.equal(res.type, 'READ')
    })

    it('resolves analyze_risk', () => {
      const res = parseBusinessIntent('analisis risiko operasional bisnis saya')
      assert.equal(res.tool, BUSINESS_TOOLS.ANALYZE_RISK)
      assert.equal(res.type, 'READ')
    })
  })

  describe('4. Server Execution of create_supplier', () => {
    it('creates supplier when user says "bisa tambah supplier yanto?"', async () => {
      const mockDb = {
        suppliers: [],
        orders: [],
        products: [],
        inventory: [],
      }

      const res = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        message: 'bisa tambah supplier yanto?',
        db: mockDb,
      })

      assert.equal(res.status, 200)
      assert.ok(res.text.includes('yanto'))
      assert.ok(res.text.includes('berhasil ditambahkan'))
      assert.equal(mockDb.suppliers.length, 1)
      assert.equal(mockDb.suppliers[0].name, 'yanto')
    })

    it('prompts "Siap. Nama supplier yang mau ditambahkan siapa?" when given "tambah supplier" without name', async () => {
      const mockDb = { suppliers: [] }
      const res = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        message: 'tambah supplier',
        db: mockDb,
      })

      assert.equal(res.status, 200)
      assert.equal(res.text, 'Siap. Nama supplier yang mau ditambahkan siapa?')
      assert.equal(mockDb.suppliers.length, 0)
    })

    it('cross-tenant supplier mutation is denied', async () => {
      const mockDb = {
        suppliers: [{ id: 'sup_99', name: 'Yanto', business_id: 'biz_other_tenant' }],
      }

      // Trying to delete supplier belonging to another tenant
      const res = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        message: 'hapus supplier Yanto',
        db: mockDb,
      })

      assert.equal(res.status, 200)
      // Since it belongs to another tenant, it is NOT found in biz_test_01
      assert.ok(res.text.includes('tidak ditemukan'))
      assert.equal(res.confirmationRequired, undefined)
    })

    it('denies malformed input safely', async () => {
      const mockDb = { suppliers: [] }
      const res1 = await executeCreateSupplier({
        db: mockDb,
        businessId: 'biz_test_01',
        userId: 'usr_owner_1',
        name: '',
      })
      assert.equal(res1.success, false)
      assert.equal(res1.error, 'Nama supplier wajib diisi.')

      const res2 = await executeCreateSupplier({
        db: mockDb,
        businessId: 'biz_test_01',
        userId: 'usr_owner_1',
        name: null,
      })
      assert.equal(res2.success, false)
      assert.equal(res2.error, 'Nama supplier wajib diisi.')
    })
  })

  describe('5. Destructive Operations & Confirmation Requirement', () => {
    it('"hapus supplier Yanto" → delete_supplier + confirmation required', async () => {
      const mockDb = {
        suppliers: [{ id: 'sup_yanto_1', name: 'Yanto', business_id: 'biz_test_01' }],
        inventory: [],
      }

      const res = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        message: 'hapus supplier Yanto',
        db: mockDb,
      })

      assert.equal(res.status, 200)
      assert.equal(res.confirmationRequired, true)
      assert.equal(res.action, 'delete_supplier')
      assert.ok(res.confirmationId)
      assert.equal(res.target.name, 'Yanto')
      // Supplier must NOT be deleted yet before confirmation
      assert.equal(mockDb.suppliers.length, 1)
    })

    it('confirmation is required before mutation and deletes after confirmed: true', async () => {
      const mockDb = {
        suppliers: [{ id: 'sup_yanto_1', name: 'Yanto', business_id: 'biz_test_01' }],
        inventory: [],
      }

      // Step 1: Request delete
      const reqRes = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        message: 'hapus supplier Yanto',
        db: mockDb,
      })
      assert.equal(reqRes.confirmationRequired, true)

      // Step 2: Confirm delete
      const confirmRes = await handleAiBusinessAnalystRequest({
        user: { id: 'usr_owner_1' },
        businessId: 'biz_test_01',
        confirmationId: reqRes.confirmationId,
        confirmed: true,
        db: mockDb,
      })

      assert.equal(confirmRes.status, 200)
      assert.ok(confirmRes.text.includes('berhasil dihapus'))
      assert.equal(mockDb.suppliers.length, 0)
    })
  })
})
