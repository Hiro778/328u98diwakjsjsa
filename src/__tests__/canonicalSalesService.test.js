import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFinalTransaction,
  aggregateSalesMetrics,
  wibDateToUtcRange,
  getWibDateString,
} from '../services/canonicalSalesService.js'

describe('Canonical Sales Service & Single Source of Truth Suite (sumber.md & fix.md)', () => {
  // ─── 1. isFinalTransaction ──────────────────────────────────────────
  it('1. isFinalTransaction correctly classifies orders by status and payment', () => {
    // Final / completed orders
    assert.equal(isFinalTransaction({ order_status: 'selesai', payment_status: 'paid' }), true)
    assert.equal(isFinalTransaction({ order_status: 'completed', payment_status: 'paid' }), true)
    assert.equal(isFinalTransaction({ order_status: 'selesai', payment_status: 'pending' }), true)
    assert.equal(isFinalTransaction({ order_status: 'pending', payment_status: 'paid' }), true)

    // Non-final / cancelled orders
    assert.equal(isFinalTransaction({ order_status: 'dibatalkan', payment_status: 'pending' }), false)
    assert.equal(isFinalTransaction({ order_status: 'cancelled', payment_status: 'pending' }), false)
    assert.equal(isFinalTransaction({ order_status: 'dibatalkan', payment_status: 'paid' }), false)
    assert.equal(isFinalTransaction({ order_status: 'pending', payment_status: 'failed' }), false)

    // Pending / in-progress unpaid orders
    assert.equal(isFinalTransaction({ order_status: 'pending', payment_status: 'pending' }), false)
    assert.equal(isFinalTransaction({ order_status: 'siap', payment_status: 'pending' }), false)
    assert.equal(isFinalTransaction({ order_status: 'diproses', payment_status: 'pending' }), false)

    // Fallback for unit test mock objects with undefined statuses
    assert.equal(isFinalTransaction({ total: 50000 }), true)

    // Null / undefined safety
    assert.equal(isFinalTransaction(null), false)
    assert.equal(isFinalTransaction(undefined), false)
  })

  // ─── 2. aggregateSalesMetrics ──────────────────────────────────────
  it('2. aggregateSalesMetrics accurately sums only final transactions and computes 6 KPIs', () => {
    const mixedOrders = [
      // Final completed orders
      {
        total: 100000,
        discount_amount: 10000,
        order_status: 'selesai',
        payment_status: 'paid',
        items: [
          { product_name: 'Kopi Susu', quantity: 2, subtotal: 60000 },
          { product_name: 'Roti Bakar', quantity: 1, subtotal: 40000 },
        ],
      },
      {
        total: 200000,
        discount_amount: 0,
        order_status: 'completed',
        payment_status: 'paid',
        items: [
          { product_name: 'Kopi Susu', quantity: 4, subtotal: 200000 },
        ],
      },
      // Cancelled order (MUST NOT be counted in revenue or transactions)
      {
        total: 500000,
        discount_amount: 50000,
        order_status: 'dibatalkan',
        payment_status: 'pending',
        items: [
          { product_name: 'Kopi Susu', quantity: 10, subtotal: 500000 },
        ],
      },
      // Pending unpaid order (MUST NOT be counted in revenue or transactions)
      {
        total: 300000,
        discount_amount: 0,
        order_status: 'pending',
        payment_status: 'pending',
        items: [
          { product_name: 'Steak', quantity: 2, subtotal: 300000 },
        ],
      },
      // Refunded order (Counts towards kerugian, NOT positive revenue)
      {
        total: -50000,
        discount_amount: 0,
        order_status: 'dibatalkan',
        payment_status: 'refunded',
        items: [],
      },
    ]

    const metrics = aggregateSalesMetrics(mixedOrders)

    // Only 2 final transactions (100k + 200k = 300k)
    assert.equal(metrics.totalRevenue, 300000)
    assert.equal(metrics.totalOmzet, 300000)
    assert.equal(metrics.totalTransaksi, 2)
    assert.equal(metrics.totalDiskon, 10000)
    assert.equal(metrics.totalProdukTerjual, 7) // 2 + 1 + 4
    assert.equal(metrics.totalKerugian, 50000)
    assert.equal(metrics.rataRataNilaiTransaksi, 150000)
    assert.ok(metrics.produkTerlaris.includes('Kopi Susu (6 terjual)'))
  })

  // ─── 3. wibDateToUtcRange & getWibDateString ───────────────────────
  it('3. Timezone helpers accurately convert WIB date strings to UTC query boundaries', () => {
    const { startIso, endIso } = wibDateToUtcRange('2026-09-24', '2026-09-24')
    // 2026-09-24 00:00:00 WIB = 2026-09-23 17:00:00 UTC
    assert.equal(startIso, '2026-09-23T17:00:00.000Z')
    // 2026-09-24 23:59:59.999 WIB = 2026-09-24 16:59:59.999 UTC
    assert.equal(endIso, '2026-09-24T16:59:59.999Z')

    // Converting UTC created_at back to WIB
    const wibStr = getWibDateString('2026-09-23T17:30:00.000Z')
    assert.equal(wibStr, '2026-09-24')
  })

  // ─── 4. Zero Data Safety ───────────────────────────────────────────
  it('4. aggregateSalesMetrics handles empty array safely without NaN', () => {
    const metrics = aggregateSalesMetrics([])
    assert.equal(metrics.totalRevenue, 0)
    assert.equal(metrics.totalTransaksi, 0)
    assert.equal(metrics.totalProdukTerjual, 0)
    assert.equal(metrics.totalDiskon, 0)
    assert.equal(metrics.totalKerugian, 0)
    assert.equal(metrics.rataRataNilaiTransaksi, 0)
    assert.equal(metrics.produkTerlaris, '-')
  })
})
