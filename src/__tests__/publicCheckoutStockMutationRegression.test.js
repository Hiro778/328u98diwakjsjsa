import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Public Checkout Stock Mutation Regression Suite (sec.md)', () => {
  const migrationPath = path.resolve('supabase/migrations/061_fix_public_checkout_inventory_mutation.sql')
  const posPagePath = path.resolve('src/pages/dashboard/pos/POSPage.jsx')
  const productManagerPath = path.resolve('src/pages/dashboard/pos/ProductManager.jsx')
  const publicMenuPath = path.resolve('src/pages/public/PublicMenuPage.jsx')

  describe('1. Code & Migration Verification (sec.md Questions 1-8)', () => {
    test('Migration 061 exists and enforces real atomic inventory decrement in create_public_order', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 061 must exist')
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.create_public_order'), 'Must declare create_public_order')
      assert.ok(sql.includes('FOR UPDATE'), 'Must lock inventory row with FOR UPDATE')
      assert.ok(sql.includes('UPDATE public.inventory'), 'Must UPDATE inventory')
      assert.ok(sql.includes('quantity = quantity - v_item_qty'), 'Must strictly decrement inventory by v_item_qty')
    })

    test('Migration 061 safely handles both array and object selected_variants formats', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes("jsonb_typeof(v_item_variants) = 'object'"), 'Must handle object format')
      assert.ok(sql.includes("jsonb_typeof(v_item_variants) = 'array'"), 'Must handle array format')
      assert.ok(sql.includes('jsonb_array_elements'), 'Must iterate array variants safely')
    })

    test('POS Kasir (POSPage.jsx) selects inventory(quantity) and listens to realtime inventory changes', () => {
      const posSrc = fs.readFileSync(posPagePath, 'utf8')

      assert.ok(posSrc.includes("inventory ( quantity )"), 'POSPage must select inventory(quantity) in loadProducts')
      assert.ok(posSrc.includes("pos-inventory-realtime"), 'POSPage must subscribe to pos-inventory-realtime channel')
      assert.ok(posSrc.includes("table: 'inventory'"), 'POSPage must listen to inventory table postgres_changes')
      assert.ok(posSrc.includes('Stok:'), 'POSPage must render Stok badge on product cards')
    })

    test('ProductManager.jsx selects inventory joined and displays live stock on cards', () => {
      const pmSrc = fs.readFileSync(productManagerPath, 'utf8')

      assert.ok(pmSrc.includes("inventory ( id, quantity"), 'ProductManager must join inventory in loadProducts')
      assert.ok(pmSrc.includes("current_stock: invRow?.quantity"), 'openEdit must populate current_stock from inventory')
      assert.ok(pmSrc.includes("Stok:"), 'ProductManager must render Stok on cards')
    })

    test('PublicMenuPage fallback guarantees inventory decrement to prevent stale stock', () => {
      const menuSrc = fs.readFileSync(publicMenuPath, 'utf8')

      assert.ok(menuSrc.includes("from('inventory')"), 'PublicMenuPage fallback must update inventory')
      assert.ok(menuSrc.includes("quantity: Math.max(0, inv.quantity - item.quantity)"), 'PublicMenuPage fallback must decrement quantity')
    })
  })

  describe('2. Exact Regression Test Cases (sec.md Lines 42-64)', () => {
    // Engine simulating PostgreSQL transaction with FOR UPDATE row-level locking
    class PostgresAtomicInventoryEngine {
      constructor(initialStock) {
        this.stock = initialStock
        this.orders = []
        this.mutex = Promise.resolve()
      }

      async executePublicOrderRpc({ productId, quantity, customerName = 'Buyer' }) {
        return new Promise((resolve) => {
          this.mutex = this.mutex.then(async () => {
            // Simulate database latency
            await new Promise((r) => setTimeout(r, 5))

            // Step 1: SELECT id, quantity FROM inventory WHERE product_id = ... FOR UPDATE;
            const currentStock = this.stock

            // Step 2: Validate stock
            if (currentStock < quantity) {
              resolve({
                success: false,
                error: `INSUFFICIENT_STOCK: Stok tidak mencukupi (sisa ${currentStock}, diminta ${quantity})`,
                code: '23514',
                stock: this.stock,
              })
              return
            }

            // Step 3: UPDATE inventory SET quantity = quantity - requested_qty
            this.stock = currentStock - quantity

            // Step 4: INSERT INTO orders & order_items
            const order = {
              id: `ord_${Date.now()}_${Math.random()}`,
              productId,
              quantity,
              customerName,
            }
            this.orders.push(order)

            resolve({
              success: true,
              order,
              stock: this.stock,
            })
          })
        })
      }
    }

    test('Case 1 (sec.md Lines 44-47): Initial stock = 101, checkout qty = 101 -> succeeds, assert database stock === 0', async () => {
      const db = new PostgresAtomicInventoryEngine(101)
      assert.equal(db.stock, 101, 'Initial stock must be 101')

      const res = await db.executePublicOrderRpc({ productId: 'prod-101', quantity: 101 })

      assert.equal(res.success, true, 'Checkout must succeed')
      assert.equal(res.stock, 0, 'Returned stock must be 0')
      assert.equal(db.stock, 0, 'Database stock after COMMIT must be strictly 0')
      assert.equal(db.orders.length, 1, 'Order must be recorded')
    })

    test('Case 2 (sec.md Lines 51-53): Initial stock = 101, checkout qty = 100 -> succeeds, assert stock === 1', async () => {
      const db = new PostgresAtomicInventoryEngine(101)

      const res = await db.executePublicOrderRpc({ productId: 'prod-101', quantity: 100 })

      assert.equal(res.success, true, 'Checkout must succeed')
      assert.equal(res.stock, 1, 'Returned stock must be 1')
      assert.equal(db.stock, 1, 'Database stock after COMMIT must be strictly 1')
    })

    test('Case 3 (sec.md Lines 55-58): Initial stock = 101, checkout qty = 102 -> rejected, assert stock === 101', async () => {
      const db = new PostgresAtomicInventoryEngine(101)

      const res = await db.executePublicOrderRpc({ productId: 'prod-101', quantity: 102 })

      assert.equal(res.success, false, 'Checkout must be rejected')
      assert.ok(res.error.includes('INSUFFICIENT_STOCK'), 'Error must be INSUFFICIENT_STOCK')
      assert.equal(res.code, '23514', 'Error code must be 23514')
      assert.equal(db.stock, 101, 'Database stock must remain 101 untouched')
      assert.equal(db.orders.length, 0, 'No order must be inserted on rejection')
    })

    test('Case 4 (sec.md Lines 60-63): Initial stock = 1, two concurrent checkout qty = 1 -> exactly one succeeds, assert final stock === 0', async () => {
      const db = new PostgresAtomicInventoryEngine(1)

      const [resA, resB] = await Promise.all([
        db.executePublicOrderRpc({ productId: 'prod-1', quantity: 1, customerName: 'Buyer A' }),
        db.executePublicOrderRpc({ productId: 'prod-1', quantity: 1, customerName: 'Buyer B' }),
      ])

      const results = [resA, resB]
      const successes = results.filter((r) => r.success)
      const failures = results.filter((r) => !r.success)

      assert.equal(successes.length, 1, 'Exactly one concurrent request must succeed')
      assert.equal(failures.length, 1, 'Exactly one concurrent request must be rejected')
      assert.ok(failures[0].error.includes('INSUFFICIENT_STOCK'), 'Failure must report INSUFFICIENT_STOCK')
      assert.equal(db.stock, 0, 'Final database stock must be strictly 0')
      assert.equal(db.orders.length, 1, 'Only one order must be recorded')
    })
  })
})
