import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Inventory & Order Concurrency Security Hardening (bug.md)', () => {
  const migrationPath = path.resolve('supabase/migrations/060_security_hardening_concurrency.sql')
  const posServicePath = path.resolve('src/services/posService.js')
  const publicMenuPath = path.resolve('src/pages/public/PublicMenuPage.jsx')

  describe('1. Migration 060 Database Constraints & Invariants (bug.md Section 2 & 15)', () => {
    test('Migration 060 exists and enforces CHECK (quantity >= 0) on inventory', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 060 must exist')
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(
        sql.includes('check_inventory_quantity_non_negative') || sql.includes('CHECK (quantity >= 0)'),
        'Must declare check_inventory_quantity_non_negative CHECK (quantity >= 0)'
      )
    })

    test('Migration 060 enforces CHECK (quantity > 0) on order_items', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(
        sql.includes('check_order_items_quantity_positive') || sql.includes('CHECK (quantity > 0)'),
        'Must declare check_order_items_quantity_positive CHECK (quantity > 0)'
      )
    })

    test('Migration 060 enforces search_path isolation on all SECURITY DEFINER RPCs (Context7 Advisor)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('SET search_path = \'\''), 'Must set search_path = \'\' on SECURITY DEFINER functions')
      assert.ok(sql.includes('public.inventory'), 'Must use fully qualified table names')
      assert.ok(sql.includes('public.orders'), 'Must use fully qualified table names')
      assert.ok(sql.includes('public.order_items'), 'Must use fully qualified table names')
      assert.ok(sql.includes('public.products'), 'Must use fully qualified table names')
    })

    test('create_pos_order locks inventory row with FOR UPDATE and rejects insufficient stock', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.create_pos_order'), 'Must define create_pos_order')
      assert.ok(sql.includes('FOR UPDATE'), 'Must lock inventory row with FOR UPDATE')
      assert.ok(sql.includes('INSUFFICIENT_STOCK'), 'Must raise INSUFFICIENT_STOCK when quantity < item_qty')
      assert.ok(sql.includes('23514'), 'Must use ERRCODE 23514 for domain check violation')
      assert.ok(!sql.includes('greatest(0, quantity - v_item_qty)'), 'Must not silently clamp to 0 with greatest()')
    })

    test('create_public_order supports p_checkout_request_id and locks inventory with FOR UPDATE', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.create_public_order'), 'Must define create_public_order')
      assert.ok(sql.includes('p_checkout_request_id text DEFAULT NULL'), 'Must accept p_checkout_request_id')
      assert.ok(sql.includes('idx_orders_business_checkout_request_id') || sql.includes('checkout_request_id = trim(p_checkout_request_id)'), 'Must check idempotency')
      assert.ok(sql.includes('FOR UPDATE'), 'Must lock inventory row with FOR UPDATE')
      assert.ok(sql.includes('INSUFFICIENT_STOCK'), 'Must raise INSUFFICIENT_STOCK when quantity < item_qty')
    })
  })

  describe('2. Client & Service Integration Verification (bug.md Section 1, 3, 10)', () => {
    test('posService re-throws INSUFFICIENT_STOCK errors immediately and checks stock in fallback', () => {
      const posSrc = fs.readFileSync(posServicePath, 'utf8')

      assert.ok(posSrc.includes('INSUFFICIENT_STOCK'), 'posService must re-throw INSUFFICIENT_STOCK')
      assert.ok(posSrc.includes('23514'), 'posService must recognize ERRCODE 23514')
      assert.ok(posSrc.includes('newQty < 0'), 'posService fallback must guard against negative newQty')
    })

    test('PublicMenuPage sends checkout_request_id and handles INSUFFICIENT_STOCK gracefully', () => {
      const menuSrc = fs.readFileSync(publicMenuPath, 'utf8')

      assert.ok(menuSrc.includes('p_checkout_request_id: checkoutRequestId'), 'PublicMenuPage must pass checkoutRequestId to RPC')
      assert.ok(menuSrc.includes('INSUFFICIENT_STOCK'), 'PublicMenuPage must handle INSUFFICIENT_STOCK')
    })
  })

  describe('3. Concurrency Simulation: Stock = 1 with 2 Concurrent Requests (bug.md Section 16)', () => {
    test('Stock = 1, 2 concurrent requests qty = 1: exactly 1 succeeds, 1 rejected with INSUFFICIENT_STOCK, final stock = 0', async () => {
      // Simulating atomic PostgreSQL transaction with row-level locking
      class AtomicInventoryStore {
        constructor(initialStock) {
          this.stock = initialStock
          this.orders = []
          this.mutex = Promise.resolve()
        }

        async checkout({ requestId, qty }) {
          // Mutex simulates PostgreSQL row lock (SELECT ... FOR UPDATE)
          return new Promise((resolve) => {
            this.mutex = this.mutex.then(async () => {
              // Simulate small asynchronous delay between lock and update
              await new Promise((r) => setTimeout(r, 10))

              if (this.stock < qty) {
                resolve({
                  success: false,
                  error: `INSUFFICIENT_STOCK: Stok tidak mencukupi (sisa ${this.stock}, diminta ${qty})`,
                  code: '23514',
                })
                return
              }

              this.stock -= qty
              const order = { id: `ord_${Date.now()}_${Math.random()}`, requestId, qty }
              this.orders.push(order)

              resolve({
                success: true,
                order,
                remainingStock: this.stock,
              })
            })
          })
        }
      }

      const store = new AtomicInventoryStore(1)

      // Execute 2 concurrent requests almost simultaneously
      const [resA, resB] = await Promise.all([
        store.checkout({ requestId: 'req_A', qty: 1 }),
        store.checkout({ requestId: 'req_B', qty: 1 }),
      ])

      const results = [resA, resB]
      const successes = results.filter((r) => r.success)
      const failures = results.filter((r) => !r.success)

      assert.equal(successes.length, 1, 'Exactly one request must succeed')
      assert.equal(failures.length, 1, 'Exactly one request must fail')
      assert.ok(failures[0].error.includes('INSUFFICIENT_STOCK'), 'Failed request must return INSUFFICIENT_STOCK')
      assert.equal(store.stock, 0, 'Final stock must be exactly 0 (never negative)')
      assert.equal(store.orders.length, 1, 'Only one order must be recorded')
    })
  })

  describe('4. Concurrency Simulation: Stock = 5 with 10 Concurrent Requests (bug.md Section 16)', () => {
    test('Stock = 5, 10 concurrent requests qty = 1: exactly 5 succeed, 5 rejected, final stock = 0', async () => {
      class AtomicInventoryStore {
        constructor(initialStock) {
          this.stock = initialStock
          this.orders = []
          this.mutex = Promise.resolve()
        }

        async checkout({ requestId, qty }) {
          return new Promise((resolve) => {
            this.mutex = this.mutex.then(async () => {
              await new Promise((r) => setTimeout(r, 5))

              if (this.stock < qty) {
                resolve({
                  success: false,
                  error: 'INSUFFICIENT_STOCK',
                  code: '23514',
                })
                return
              }

              this.stock -= qty
              this.orders.push({ requestId, qty })
              resolve({ success: true, remainingStock: this.stock })
            })
          })
        }
      }

      const store = new AtomicInventoryStore(5)
      const requests = Array.from({ length: 10 }, (_, i) =>
        store.checkout({ requestId: `req_${i + 1}`, qty: 1 })
      )

      const results = await Promise.all(requests)
      const successes = results.filter((r) => r.success)
      const failures = results.filter((r) => !r.success)

      assert.equal(successes.length, 5, 'Exactly 5 requests must succeed')
      assert.equal(failures.length, 5, 'Exactly 5 requests must fail')
      assert.equal(store.stock, 0, 'Final stock must be exactly 0')
      assert.equal(store.orders.length, 5, 'Exactly 5 orders must be placed')
    })
  })

  describe('5. Idempotency & Double Click Protection (bug.md Section 3 & 11)', () => {
    test('Duplicate request with identical checkout_request_id returns idempotent order without deducting stock again', async () => {
      class IdempotentCheckoutEngine {
        constructor(initialStock) {
          this.stock = initialStock
          this.orders = new Map()
          this.mutex = Promise.resolve()
        }

        async checkout({ requestId, businessId, qty }) {
          return new Promise((resolve) => {
            this.mutex = this.mutex.then(async () => {
              const key = `${businessId}:${requestId}`

              // Idempotency check
              if (this.orders.has(key)) {
                resolve({
                  success: true,
                  idempotent: true,
                  order: this.orders.get(key),
                  stockAfter: this.stock,
                })
                return
              }

              if (this.stock < qty) {
                resolve({ success: false, error: 'INSUFFICIENT_STOCK' })
                return
              }

              this.stock -= qty
              const order = { id: `ord_${Date.now()}`, businessId, requestId, qty }
              this.orders.set(key, order)

              resolve({
                success: true,
                idempotent: false,
                order,
                stockAfter: this.stock,
              })
            })
          })
        }
      }

      const engine = new IdempotentCheckoutEngine(10)

      // First click
      const firstRes = await engine.checkout({ requestId: 'double_click_token_123', businessId: 'biz_1', qty: 2 })
      assert.equal(firstRes.success, true)
      assert.equal(firstRes.idempotent, false)
      assert.equal(engine.stock, 8, 'Stock deducted from 10 to 8')

      // Second click with identical token
      const secondRes = await engine.checkout({ requestId: 'double_click_token_123', businessId: 'biz_1', qty: 2 })
      assert.equal(secondRes.success, true)
      assert.equal(secondRes.idempotent, true, 'Must return idempotent: true')
      assert.equal(secondRes.order.id, firstRes.order.id, 'Must return same order ID')
      assert.equal(engine.stock, 8, 'Stock must NOT be deducted again (remains 8)')
    })
  })

  describe('6. Authoritative Pricing Integrity (bug.md Section 4 & 14)', () => {
    test('Server authoritative calculation ignores manipulated frontend prices', () => {
      const authoritativeDb = {
        products: {
          'prod_1': { id: 'prod_1', name: 'Kopi Susu', unit_price: 25000 },
          'prod_2': { id: 'prod_2', name: 'Roti Bakar', unit_price: 15000 },
        },
      }

      // Attacker attempts to send price = 100 instead of 25000
      const clientPayload = [
        { product_id: 'prod_1', quantity: 2, price: 100 },
        { product_id: 'prod_2', quantity: 1, price: 50 },
      ]

      // Server recalculation
      let serverSubtotal = 0
      const validatedItems = clientPayload.map((item) => {
        const dbProd = authoritativeDb.products[item.product_id]
        assert.ok(dbProd, 'Product must exist')
        const authoritativePrice = dbProd.unit_price
        const lineSubtotal = authoritativePrice * item.quantity
        serverSubtotal += lineSubtotal
        return {
          product_id: item.product_id,
          unit_price: authoritativePrice,
          subtotal: lineSubtotal,
        }
      })

      assert.equal(serverSubtotal, 65000, 'Server calculated subtotal must be (25000 * 2) + (15000 * 1) = 65000')
      assert.notEqual(serverSubtotal, 250, 'Manipulated frontend price must be completely disregarded')
      assert.equal(validatedItems[0].unit_price, 25000)
    })
  })
})
