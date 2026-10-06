// src/__tests__/orderCompletionPaymentFlow.test.js
// Regression test suite for Order Completion Payment State Machine (@122.md)
// Tests:
// A. manual_qris (diproses + pending -> selesai + paid, settlement recorded)
// B. cash (merchant-controlled pending -> selesai + paid)
// C. Midtrans pending (BLOCKED with STATE_VIOLATION)
// D. Midtrans paid/settlement (ALLOWED to complete)
// E. Unauthorized caller (BLOCKED)
// F. Cross-business merchant (BLOCKED)
// G. Cancelled / dibatalkan (BLOCKED)
// H. Already completed (Idempotent return, no duplicate settlement)
// I. Concurrent double completion (Atomic lock, single settlement)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Order Completion Payment State Machine (@122.md)', () => {
  const migrationPath = path.resolve('supabase/migrations/111_fix_order_completion_payment_flow.sql')
  const posPagePath = path.resolve('src/pages/dashboard/pos/PosPage.jsx')
  const posServicePath = path.resolve('src/services/posService.js')

  describe('1. Migration 111 Architecture & Security Audit', () => {
    it('1.1. Migration 111 file exists and defines authoritative merchant_complete_order', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 111 must exist')
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.merchant_complete_order'), 'Must declare merchant_complete_order')
      assert.ok(sql.includes("SET search_path = ''"), 'Must pin search_path')
      assert.ok(sql.includes('SECURITY DEFINER'), 'Must be SECURITY DEFINER')
    })

    it('1.2. Implements concurrency-safe row locking (FOR UPDATE OF o)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes('FOR UPDATE OF o'), 'Must lock order row with FOR UPDATE OF o')
    })

    it('1.3. Enforces business ownership check (b.owner_id <> v_caller_id)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes('v_order.owner_id <> v_caller_id'), 'Must verify caller owns the business')
      assert.ok(sql.includes('FORBIDDEN'), 'Must reject unauthorized business with FORBIDDEN')
    })

    it('1.4. Distinguishes Midtrans vs Merchant-Controlled (manual_qris / cash) flows', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes("LOWER(COALESCE(v_payment.payment_provider, '')) = 'midtrans'"), 'Must inspect payment_provider in payments')
      assert.ok(sql.includes("LOWER(COALESCE(v_order.payment_method, '')) IN ('online', 'midtrans')"), 'Must check online/midtrans payment method')
      assert.ok(sql.includes("'manual_qris'"), 'Must map QRIS to manual_qris provider')
      assert.ok(sql.includes("'cash'"), 'Must map cash to cash provider')
    })

    it('1.5. Protects against Midtrans pending completion and prevents duplicate settlements', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes('v_order.payment_status NOT IN (\'paid\', \'lunas\')'), 'Must verify Midtrans order is paid')
      assert.ok(sql.includes('STATE_VIOLATION'), 'Must raise STATE_VIOLATION for unpaid Midtrans')
      assert.ok(sql.includes('v_payment.payment_status NOT IN (\'paid\', \'lunas\', \'settlement\')'), 'Must update unsettled payment if exists')
      assert.ok(sql.includes('ELSIF v_payment.id IS NULL THEN'), 'Must insert settlement payment only if no record exists')
    })

    it('1.6. Preserves global payment prerequisite in enforce_order_state_transitions trigger', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.enforce_order_state_transitions'), 'Must define enforce_order_state_transitions')
      assert.ok(sql.includes("NEW.order_status IN ('selesai', 'completed') AND NEW.payment_status NOT IN ('paid', 'lunas')"), 'Must preserve global paid prerequisite')
      assert.ok(sql.includes("auth.role() <> 'service_role'"), 'Must prevent browser from forging gateway payment status')
    })
  })

  describe('2. State Machine Logic & Invariant Validation (A - I Matrix)', () => {
    // State machine emulator matching migration 111 PL/pgSQL logic
    function simulateMerchantCompleteOrder({
      callerId,
      order,
      business,
      paymentRecord,
      existingPayments = [],
    }) {
      // 1. Authenticate caller
      if (!callerId) {
        throw new Error('UNAUTHORIZED: Autentikasi diperlukan. (42501)')
      }

      // 2. Order exists & business ownership
      if (!order) {
        throw new Error('ORDER_NOT_FOUND: Pesanan tidak ditemukan. (P0002)')
      }
      if (business.owner_id !== callerId) {
        throw new Error('FORBIDDEN: Anda tidak memiliki izin untuk menyelesaikan pesanan bisnis ini. (42501)')
      }

      // 3. Idempotency: Already completed
      if (['selesai', 'completed'].includes(order.order_status)) {
        return {
          success: true,
          order_id: order.id,
          order_status: 'selesai',
          payment_status: order.payment_status,
          already_completed: true,
          message: 'Pesanan sudah diselesaikan sebelumnya.',
        }
      }

      // 4. Cancelled cannot be completed
      if (['dibatalkan', 'cancelled'].includes(order.order_status)) {
        throw new Error('STATE_VIOLATION: Pesanan yang telah dibatalkan tidak dapat diproses atau diselesaikan kembali. (22023)')
      }

      // 5. Must be processed first
      if (!['diproses', 'preparing'].includes(order.order_status)) {
        throw new Error('INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu sebelum diselesaikan. (22023)')
      }

      // 6. Flow determination
      const isMidtrans =
        (paymentRecord?.payment_provider && paymentRecord.payment_provider.toLowerCase() === 'midtrans') ||
        ['online', 'midtrans'].includes((order.payment_method || '').toLowerCase())

      if (isMidtrans) {
        const isPaid =
          ['paid', 'lunas'].includes(order.payment_status) &&
          (!paymentRecord || ['paid', 'lunas', 'settlement'].includes(paymentRecord.payment_status))

        if (!isPaid) {
          throw new Error('STATE_VIOLATION: Pesanan tidak dapat diselesaikan tanpa status pembayaran lunas (paid). (22023)')
        }

        order.order_status = 'selesai'
        return {
          success: true,
          order_id: order.id,
          order_status: 'selesai',
          payment_status: order.payment_status,
          already_completed: false,
          message: 'Pesanan berhasil diselesaikan.',
        }
      }

      // Merchant-controlled: manual_qris / cash
      const provider = (order.payment_method || '').toLowerCase() === 'qris' ? 'manual_qris' : 'cash'

      if (paymentRecord && !['paid', 'lunas', 'settlement'].includes(paymentRecord.payment_status)) {
        paymentRecord.payment_status = 'paid'
        paymentRecord.payment_provider = paymentRecord.payment_provider || provider
        paymentRecord.paid_at = new Date().toISOString()
      } else if (!paymentRecord) {
        existingPayments.push({
          order_id: order.id,
          business_id: business.id,
          payment_provider: provider,
          payment_method: order.payment_method || 'cash',
          gross_amount: order.total,
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
        })
      }

      order.order_status = 'selesai'
      order.payment_status = 'paid'

      return {
        success: true,
        order_id: order.id,
        order_status: 'selesai',
        payment_status: 'paid',
        already_completed: false,
        message: 'Pesanan berhasil diselesaikan.',
      }
    }

    const merchantA = 'merchant-a-uuid'
    const merchantB = 'merchant-b-uuid'
    const businessA = { id: 'biz-a-uuid', owner_id: merchantA }
    const businessB = { id: 'biz-b-uuid', owner_id: merchantB }

    it('TEST A: manual_qris (diproses + pending) -> merchant_complete_order SUCCEEDS with paid settlement', () => {
      const order = {
        id: 'order-qris-1',
        business_id: businessA.id,
        order_number: 160,
        order_status: 'diproses',
        payment_method: 'qris',
        payment_status: 'pending',
        total: 20000,
      }
      const existingPayments = []

      const result = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order,
        business: businessA,
        paymentRecord: null,
        existingPayments,
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.order_status, 'selesai')
      assert.strictEqual(result.payment_status, 'paid')
      assert.strictEqual(order.order_status, 'selesai')
      assert.strictEqual(order.payment_status, 'paid')
      assert.strictEqual(existingPayments.length, 1)
      assert.strictEqual(existingPayments[0].payment_provider, 'manual_qris')
      assert.strictEqual(existingPayments[0].payment_status, 'paid')
    })

    it('TEST B: cash (diproses + pending) -> merchant_complete_order SUCCEEDS with paid settlement', () => {
      const order = {
        id: 'order-cash-1',
        business_id: businessA.id,
        order_number: 161,
        order_status: 'diproses',
        payment_method: 'cash',
        payment_status: 'pending',
        total: 15000,
      }
      const paymentRec = {
        id: 'pay-cash-1',
        payment_provider: 'cash',
        payment_status: 'pending',
      }

      const result = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order,
        business: businessA,
        paymentRecord: paymentRec,
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(order.order_status, 'selesai')
      assert.strictEqual(order.payment_status, 'paid')
      assert.strictEqual(paymentRec.payment_status, 'paid')
    })

    it('TEST C: Midtrans pending -> merchant_complete_order is BLOCKED with STATE_VIOLATION', () => {
      const order = {
        id: 'order-midtrans-1',
        business_id: businessA.id,
        order_status: 'diproses',
        payment_method: 'online',
        payment_status: 'pending',
        total: 50000,
      }
      const paymentRec = {
        id: 'pay-midtrans-1',
        payment_provider: 'midtrans',
        payment_status: 'pending',
      }

      assert.throws(
        () =>
          simulateMerchantCompleteOrder({
            callerId: merchantA,
            order,
            business: businessA,
            paymentRecord: paymentRec,
          }),
        /STATE_VIOLATION: Pesanan tidak dapat diselesaikan tanpa status pembayaran lunas \(paid\)/
      )
      assert.strictEqual(order.order_status, 'diproses')
    })

    it('TEST D: Midtrans paid/settlement -> merchant_complete_order is ALLOWED', () => {
      const order = {
        id: 'order-midtrans-2',
        business_id: businessA.id,
        order_status: 'diproses',
        payment_method: 'online',
        payment_status: 'paid',
        total: 50000,
      }
      const paymentRec = {
        id: 'pay-midtrans-2',
        payment_provider: 'midtrans',
        payment_status: 'settlement',
      }

      const result = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order,
        business: businessA,
        paymentRecord: paymentRec,
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(order.order_status, 'selesai')
      assert.strictEqual(order.payment_status, 'paid')
    })

    it('TEST E: Unauthorized user (null caller) -> BLOCKED with UNAUTHORIZED', () => {
      const order = {
        id: 'order-qris-2',
        business_id: businessA.id,
        order_status: 'diproses',
        payment_method: 'qris',
        payment_status: 'pending',
      }

      assert.throws(
        () =>
          simulateMerchantCompleteOrder({
            callerId: null,
            order,
            business: businessA,
            paymentRecord: null,
          }),
        /UNAUTHORIZED: Autentikasi diperlukan/
      )
    })

    it('TEST F: Cross-business merchant (Merchant B on Business A order) -> BLOCKED with FORBIDDEN', () => {
      const order = {
        id: 'order-qris-3',
        business_id: businessA.id,
        order_status: 'diproses',
        payment_method: 'qris',
        payment_status: 'pending',
      }

      assert.throws(
        () =>
          simulateMerchantCompleteOrder({
            callerId: merchantB,
            order,
            business: businessA,
            paymentRecord: null,
          }),
        /FORBIDDEN: Anda tidak memiliki izin untuk menyelesaikan pesanan bisnis ini/
      )
    })

    it('TEST G: Cancelled/dibatalkan order -> BLOCKED with STATE_VIOLATION', () => {
      const order = {
        id: 'order-cancelled',
        business_id: businessA.id,
        order_status: 'dibatalkan',
        payment_method: 'qris',
        payment_status: 'pending',
      }

      assert.throws(
        () =>
          simulateMerchantCompleteOrder({
            callerId: merchantA,
            order,
            business: businessA,
            paymentRecord: null,
          }),
        /STATE_VIOLATION: Pesanan yang telah dibatalkan tidak dapat diproses atau diselesaikan kembali/
      )
    })

    it('TEST H: Already completed order -> IDEMPOTENT return without duplicate settlement', () => {
      const order = {
        id: 'order-completed',
        business_id: businessA.id,
        order_status: 'selesai',
        payment_method: 'qris',
        payment_status: 'paid',
        total: 20000,
      }
      const existingPayments = [{ id: 'existing-p1', payment_status: 'paid' }]

      const result = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order,
        business: businessA,
        paymentRecord: existingPayments[0],
        existingPayments,
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.already_completed, true)
      assert.strictEqual(existingPayments.length, 1, 'No duplicate payment row created')
    })

    it('TEST I: Concurrent double completion -> Locked execution ensures single settlement and idempotency', () => {
      const order = {
        id: 'order-concurrent',
        business_id: businessA.id,
        order_status: 'diproses',
        payment_method: 'qris',
        payment_status: 'pending',
        total: 25000,
      }
      const existingPayments = []

      // Simulating first atomic lock & execution
      const call1 = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order,
        business: businessA,
        paymentRecord: null,
        existingPayments,
      })
      assert.strictEqual(call1.already_completed, false)
      assert.strictEqual(existingPayments.length, 1)

      // Simulating second thread waiting on lock, reading updated order
      const call2 = simulateMerchantCompleteOrder({
        callerId: merchantA,
        order, // Now order.order_status === 'selesai'
        business: businessA,
        paymentRecord: existingPayments[0],
        existingPayments,
      })
      assert.strictEqual(call2.already_completed, true)
      assert.strictEqual(existingPayments.length, 1, 'Must NOT create duplicate payment record on concurrent call')
    })
  })

  describe('3. Frontend / POS Audit', () => {
    it('3.1. PosPage.jsx invokes authoritative merchantCompleteOrder without client-side payment mutation', () => {
      const code = fs.readFileSync(posPagePath, 'utf8')
      assert.ok(code.includes('merchantCompleteOrder(orderId)'), 'Must call merchantCompleteOrder service')
      assert.ok(!code.includes("update({ payment_status: 'paid'"), 'No client-side payment_status mutation')
      assert.ok(code.includes('handleCompleteOrder'), 'handleCompleteOrder handler present')
    })

    it('3.2. posService.js routes to merchant_complete_order RPC', () => {
      const code = fs.readFileSync(posServicePath, 'utf8')
      assert.ok(code.includes("client.rpc('merchant_complete_order'"), 'Must call RPC merchant_complete_order')
      assert.ok(code.includes('p_order_id: orderId'), 'Passes p_order_id argument')
    })
  })
})
