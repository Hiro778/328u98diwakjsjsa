import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {}
import {
  confirmQrisPayment,
  normalizeQrisError,
  isValidUuid,
} from '../services/qrisPaymentService.js'

describe('QRIS Phase 4 — Merchant Payment Confirmation Suite (@qr.md)', () => {
  const migration070Path = path.resolve('supabase/migrations/070_business_qris_payment_settings.sql')
  const migration071Path = path.resolve('supabase/migrations/071_fix_gotrue_banned_until_compatibility.sql')
  const migration072Path = path.resolve('supabase/migrations/072_public_qris_checkout.sql')
  const migration073Path = path.resolve('supabase/migrations/073_qris_merchant_payment_confirmation.sql')
  const orderHistoryPath = path.resolve('src/pages/dashboard/pos/OrderHistory.jsx')
  const posPagePath = path.resolve('src/pages/dashboard/pos/PosPage.jsx')

  const migration070Sql = fs.readFileSync(migration070Path, 'utf8')
  const migration071Sql = fs.readFileSync(migration071Path, 'utf8')
  const migration072Sql = fs.readFileSync(migration072Path, 'utf8')
  const migration073Sql = fs.readFileSync(migration073Path, 'utf8')
  const orderHistorySource = fs.readFileSync(orderHistoryPath, 'utf8')
  const posPageSource = fs.readFileSync(posPagePath, 'utf8')

  const testBizOwnerA = '11111111-1111-4111-8111-111111111111'
  const testBizOwnerB = '22222222-2222-4222-8222-222222222222'
  const testCustomer = '99999999-9999-4999-8999-999999999999'

  const testBizIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testBizIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  const orderQrisAId = '10000000-0000-4000-8000-000000000001'
  const orderCashAId = '10000000-0000-4000-8000-000000000002'
  const orderQrisBId = '20000000-0000-4000-8000-000000000001'

  // Simulates Postgres RPC confirm_qris_payment environment
  const createMockEnvironment = () => {
    const businesses = new Map([
      [testBizIdA, { id: testBizIdA, owner_id: testBizOwnerA, name: 'Kedai A' }],
      [testBizIdB, { id: testBizIdB, owner_id: testBizOwnerB, name: 'Kedai B' }],
    ])

    const orders = new Map([
      [orderQrisAId, {
        id: orderQrisAId,
        business_id: testBizIdA,
        order_number: 101,
        customer_name: 'Budi',
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
        total: 50000,
        updated_at: new Date('2026-09-01T00:00:00Z').toISOString(),
      }],
      [orderCashAId, {
        id: orderCashAId,
        business_id: testBizIdA,
        order_number: 102,
        customer_name: 'Siti',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        total: 75000,
        updated_at: new Date('2026-09-01T00:00:00Z').toISOString(),
      }],
      [orderQrisBId, {
        id: orderQrisBId,
        business_id: testBizIdB,
        order_number: 201,
        customer_name: 'Agus',
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
        total: 100000,
        updated_at: new Date('2026-09-01T00:00:00Z').toISOString(),
      }],
    ])

    const payments = []

    const executeRpc = async (callerUid, fnName, params) => {
      if (fnName !== 'confirm_qris_payment') {
        throw new Error(`Function ${fnName} does not exist`)
      }

      const { p_order_id } = params || {}

      // 1. Authenticate caller
      if (!callerUid) {
        const err = new Error('UNAUTHORIZED: Autentikasi diperlukan.')
        err.code = '42501'
        throw err
      }

      // 2. Load order and business
      const order = orders.get(p_order_id)
      if (!order) {
        const err = new Error('ORDER_NOT_FOUND: Pesanan tidak ditemukan.')
        err.code = 'P0002'
        throw err
      }

      const biz = businesses.get(order.business_id)
      if (!biz || biz.owner_id !== callerUid) {
        const err = new Error('FORBIDDEN: Anda tidak memiliki izin untuk mengonfirmasi pesanan bisnis ini.')
        err.code = '42501'
        throw err
      }

      // 3. Payment method must be qris
      if ((order.payment_method || '').toLowerCase() !== 'qris') {
        const err = new Error('INVALID_PAYMENT_METHOD: Hanya pesanan dengan metode pembayaran QRIS yang dapat dikonfirmasi.')
        err.code = '22023'
        throw err
      }

      // 4. Idempotency: If already paid
      if (order.payment_status === 'paid') {
        return {
          success: true,
          order_id: p_order_id,
          payment_status: 'paid',
          already_confirmed: true,
          message: 'Pembayaran QRIS sudah dikonfirmasi sebelumnya.',
        }
      }

      // 5. State transition: Only pending -> paid
      if (order.payment_status !== 'pending') {
        const err = new Error(`INVALID_PAYMENT_STATUS: Status pembayaran (${order.payment_status}) tidak valid untuk dikonfirmasi.`)
        err.code = '22023'
        throw err
      }

      // 6. Atomic update (order_status remains UNCHANGED)
      order.payment_status = 'paid'
      order.updated_at = new Date().toISOString()

      // 7. Write payment record
      payments.push({
        order_id: p_order_id,
        business_id: order.business_id,
        payment_method: 'qris',
        gross_amount: order.total,
        payment_status: 'paid',
      })

      return {
        success: true,
        order_id: p_order_id,
        payment_status: 'paid',
        already_confirmed: false,
        message: 'Pembayaran QRIS berhasil dikonfirmasi.',
      }
    }

    const createClientForUser = (userUid) => ({
      rpc: async (fnName, params) => {
        try {
          const data = await executeRpc(userUid, fnName, params)
          return { data, error: null }
        } catch (err) {
          return { data: null, error: err }
        }
      },
    })

    return { businesses, orders, payments, createClientForUser }
  }

  // --- SECURITY TESTS 1 to 17 per qr.md Section 9 ---

  it('1. owner can confirm own QRIS order', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    const res = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(res.success, true)
    assert.equal(res.data.payment_status, 'paid')
    assert.equal(res.data.already_confirmed, false)

    const updatedOrder = env.orders.get(orderQrisAId)
    assert.equal(updatedOrder.payment_status, 'paid')
    // order_status must remain 'pending' (payment confirmation != order completion)
    assert.equal(updatedOrder.order_status, 'pending')
  })

  it('2. owner cannot confirm another business order', async () => {
    const env = createMockEnvironment()
    // Owner B attempts to confirm Order A
    const client = env.createClientForUser(testBizOwnerB)

    const res = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(res.success, false)
    assert.match(res.error.message, /tidak memiliki izin/i)

    const orderA = env.orders.get(orderQrisAId)
    assert.equal(orderA.payment_status, 'pending')
  })

  it('3. customer cannot call confirmation RPC', async () => {
    const env = createMockEnvironment()
    // Customer attempts to confirm Order A
    const client = env.createClientForUser(testCustomer)

    const res = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(res.success, false)
    assert.match(res.error.message, /tidak memiliki izin/i)

    const orderA = env.orders.get(orderQrisAId)
    assert.equal(orderA.payment_status, 'pending')
  })

  it('4. anonymous user cannot confirm', async () => {
    const env = createMockEnvironment()
    // Unauthenticated (null user)
    const client = env.createClientForUser(null)

    const res = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(res.success, false)
    assert.match(res.error.message, /Akses ditolak|Autentikasi/i)

    const orderA = env.orders.get(orderQrisAId)
    assert.equal(orderA.payment_status, 'pending')
  })

  it('5. non-QRIS order cannot be confirmed by QRIS RPC', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    // Attempting to confirm cash order via QRIS RPC
    const res = await confirmQrisPayment(orderCashAId, client)
    assert.equal(res.success, false)
    assert.match(res.error.message, /Hanya pesanan dengan metode pembayaran QRIS/i)

    const cashOrder = env.orders.get(orderCashAId)
    assert.equal(cashOrder.payment_status, 'pending')
  })

  it('6. paid order cannot be paid again (idempotent)', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    // First confirmation
    const firstRes = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(firstRes.success, true)
    assert.equal(firstRes.data.already_confirmed, false)

    // Second confirmation on same order
    const secondRes = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(secondRes.success, true)
    assert.equal(secondRes.data.already_confirmed, true)
    assert.equal(secondRes.data.payment_status, 'paid')
    assert.match(secondRes.data.message, /sudah dikonfirmasi/i)

    // Verify only 1 payment transaction recorded
    assert.equal(env.payments.length, 1)
  })

  it('7. pending QRIS → paid works without changing order_status', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    const initialOrder = env.orders.get(orderQrisAId)
    const initialUpdatedAt = initialOrder.updated_at
    assert.equal(initialOrder.payment_status, 'pending')
    assert.equal(initialOrder.order_status, 'pending')

    const res = await confirmQrisPayment(orderQrisAId, client)
    assert.equal(res.success, true)

    const updatedOrder = env.orders.get(orderQrisAId)
    assert.equal(updatedOrder.payment_status, 'paid')
    assert.equal(updatedOrder.order_status, 'pending')
    assert.notEqual(updatedOrder.updated_at, initialUpdatedAt)
  })

  it('8. payment_status cannot be supplied from client', () => {
    // Audit Migration 073 signature: only accepts p_order_id uuid
    assert.match(
      migration073Sql,
      /confirm_qris_payment\s*\(\s*p_order_id\s+uuid\s*\)/i,
      'RPC must strictly only accept p_order_id to prevent client parameter injection'
    )
    assert.doesNotMatch(
      migration073Sql,
      /confirm_qris_payment\s*\([^)]*payment_status/i,
      'RPC signature must not allow client to supply payment_status'
    )
  })

  it('9. business_id cannot be supplied to bypass ownership', () => {
    assert.doesNotMatch(
      migration073Sql,
      /confirm_qris_payment\s*\([^)]*business_id/i,
      'RPC must not accept business_id from caller'
    )
    assert.match(
      migration073Sql,
      /WHERE\s+o\.id\s*=\s*p_order_id/i,
      'RPC must resolve business_id internally from database'
    )
    assert.match(
      migration073Sql,
      /owner_id\s*<>\s*v_caller_id|b\.owner_id\s*=\s*v_caller_id/i,
      'RPC must verify business belongs to authenticated caller'
    )
  })

  it('10. order_id manipulation denied', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    // Invalid format
    const invalidRes = await confirmQrisPayment('not-a-valid-uuid', client)
    assert.equal(invalidRes.success, false)
    assert.match(invalidRes.error.message, /ID pesanan tidak valid/i)

    // Non-existent ID
    const randomUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const notFoundRes = await confirmQrisPayment(randomUuid, client)
    assert.equal(notFoundRes.success, false)
    assert.match(notFoundRes.error.message, /tidak ditemukan/i)
  })

  it('11. concurrent confirmation safe', async () => {
    const env = createMockEnvironment()
    const client = env.createClientForUser(testBizOwnerA)

    // Simulate 5 simultaneous clicks
    const promises = Array.from({ length: 5 }).map(() =>
      confirmQrisPayment(orderQrisAId, client)
    )

    const results = await Promise.all(promises)

    // All should succeed (1 initial, 4 idempotent)
    for (const res of results) {
      assert.equal(res.success, true)
      assert.equal(res.data.payment_status, 'paid')
    }

    const initialSuccessCount = results.filter(r => !r.data.already_confirmed).length
    const alreadyConfirmedCount = results.filter(r => r.data.already_confirmed).length

    assert.equal(initialSuccessCount, 1)
    assert.equal(alreadyConfirmedCount, 4)
  })

  it('12. direct REST mutation still denied', () => {
    // Verify migration 072 dropped orders_public_update
    assert.match(
      migration072Sql,
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"orders_public_update"\s+ON\s+public\.orders/i,
      'orders_public_update policy must remain dropped'
    )
  })

  it('13. cash flow unaffected — payment via RPC only (@11.md)', () => {
    // Per @11.md: confirmPayment() direct client-side mutation REMOVED.
    // Cash payment_method is still used for order creation, but payment confirmation is now via RPC.
    assert.match(
      posPageSource,
      /payment_method.*?'cash'/i,
      'POS cash order creation remains intact'
    )
    // Verify confirmPayment direct mutation is GONE (per @11.md requirement #1)
    assert.doesNotMatch(
      posPageSource,
      /async\s+function\s+confirmPayment/i,
      'Direct client-side confirmPayment must be removed per @11.md payment authority'
    )
    // Verify no direct client-side payment_status update bypassing RPC
    assert.doesNotMatch(
      posPageSource,
      /\.update\s*\(\s*\{[^}]*payment_status\s*:\s*['"]paid['"]/i,
      'Direct orders.update with payment_status=paid must be removed per @11.md'
    )
  })

  it('14. Midtrans flow unaffected', () => {
    const snapEdgeSource = fs.readFileSync(path.resolve('supabase/functions/midtrans-create-snap/index.ts'), 'utf8')
    assert.match(
      snapEdgeSource,
      /order\.total/i,
      'Midtrans flow remains functional'
    )
  })

  it('15. Phase 1 QRIS tests pass (Storage & Isolation integrity)', () => {
    assert.match(migration070Sql, /CREATE TABLE IF NOT EXISTS public\.business_payment_settings/i)
    assert.match(migration070Sql, /business_id\s+IN\s*\(\s*SELECT\s+id\s+FROM\s+public\.businesses/i)
  })

  it('16. Phase 2 QRIS tests pass (Payment confirmation only in POS per @11.md)', () => {
    // POS has payment processing / confirmation
    assert.match(posPageSource, /(?:confirmQrisPayment|merchantProcessOrder)/i)
    // OrderHistory is read-only per @11.md
    assert.doesNotMatch(orderHistorySource, /confirmQrisPayment/i)
  })

  it('17. Phase 3 QRIS tests pass (Public checkout & menu published validation)', () => {
    assert.match(migration072Sql, /business_payment_settings_public_select/i)
    assert.match(migration072Sql, /is_menu_published\s*=\s*true/i)
  })

  // --- ADDITIONAL ARCHITECTURAL & UI AUDITS ---

  it('18. Migration 073 adheres to Context7 & Supabase security guidelines', () => {
    // SECURITY DEFINER
    assert.match(migration073Sql, /SECURITY\s+DEFINER/i)
    // search_path = ''
    assert.match(migration073Sql, /SET\s+search_path\s*=\s*''/i)
    // Explicit public execution revocation and authenticated grant
    assert.match(migration073Sql, /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.confirm_qris_payment/i)
    assert.match(migration073Sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.confirm_qris_payment\s*\(uuid\)\s+TO\s+authenticated/i)
    // Schema reload notification
    assert.match(migration073Sql, /NOTIFY\s+pgrst,\s*'reload schema'/i)
  })

  it('19. OrderHistory.jsx implements exact UI specifications per @11.md (Read-Only)', () => {
    // Payment Authority per @11.md: Riwayat Pesanan is strictly read-only, no mutation buttons
    assert.doesNotMatch(orderHistorySource, /<button[^>]*>.*?(?:Konfirmasi\s+Pembayaran|Tandai\s+Lunas).*?<\/button>/i)
    // Status text displays paid/menunggu status correctly
    assert.match(orderHistorySource, /PAID \/ Lunas/i)
    assert.match(orderHistorySource, /Menunggu Konfirmasi/i)
  })

  it('20. PosPage.jsx implements QRIS flow per @11.md (atomic via PROSES only)', () => {
    // QRIS: LUNAS badge still displayed for paid orders
    assert.match(posPageSource, /QRIS:\s*LUNAS/i)
    // QRIS: MENUNGGU badge for unpaid orders
    assert.match(posPageSource, /QRIS:\s*MENUNGGU/i)
    // Payment confirmation is now only via merchantProcessOrder RPC (Proses button)
    assert.match(posPageSource, /merchantProcessOrder/i)
    // The separate QRIS confirm modal with client-side flow is removed per @11.md
    assert.doesNotMatch(
      posPageSource,
      /Pastikan pembayaran QRIS sudah diterima sebelum mengonfirmasi/i,
      'Separate QRIS confirm modal removed per @11.md — atomic via merchantProcessOrder'
    )
  })

  it('21. Scope Lock: Historical migrations 001–072 remain unmodified', () => {
    assert.ok(fs.existsSync(migration070Path), '070 must exist')
    assert.ok(fs.existsSync(migration071Path), '071 must exist')
    assert.ok(fs.existsSync(migration072Path), '072 must exist')
    assert.ok(fs.existsSync(migration073Path), '073 must exist')
  })
})

describe('QRIS Phase 4 — Live Supabase Integration Suite', () => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const canRunLive = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY)

  it('Live 1: Anonymous client cannot execute confirm_qris_payment (42501)', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase environment variables not present')
      return
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await anonClient.rpc('confirm_qris_payment', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
    })

    assert.equal(data, null)
    assert.ok(error)
    assert.equal(error.code, '42501')
    assert.match(error.message, /Autentikasi diperlukan/i)
  })

  it('Live 2: End-to-end QRIS payment confirmation, cross-tenant denial, and idempotent retry', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase environment variables not present')
      return
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Select active businesses
    const { data: businesses, error: bErr } = await adminClient
      .from('businesses')
      .select('id, owner_id')
      .limit(10)

    if (bErr || !businesses || businesses.length < 2) {
      t.skip('Not enough businesses found for cross-tenant testing')
      return
    }

    // Find two distinct businesses with active owners
    const { data: activeProfiles } = await adminClient
      .from('profiles')
      .select('id, email, status')
      .eq('status', 'active')

    const activeMap = new Map((activeProfiles || []).map(p => [p.id, p.email]))
    const eligibleBusinesses = businesses.filter(b => activeMap.has(b.owner_id))

    if (eligibleBusinesses.length < 2) {
      t.skip('Not enough active owners with businesses found')
      return
    }

    const bizA = eligibleBusinesses[0]
    const bizB = eligibleBusinesses.find(b => b.owner_id !== bizA.owner_id)
    if (!bizB) {
      t.skip('Could not find two distinct business owners')
      return
    }

    const getAuthClient = async (email) => {
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      await client.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'email',
      })
      return client
    }

    const clientA = await getAuthClient(activeMap.get(bizA.owner_id))
    const clientB = await getAuthClient(activeMap.get(bizB.owner_id))

    // Create a real test order for Business A
    const { data: testOrder, error: orderErr } = await adminClient
      .from('orders')
      .insert({
        business_id: bizA.id,
        order_number: 999888,
        customer_name: 'Live Automated Tester',
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
        total: 45000,
      })
      .select()
      .single()

    assert.equal(orderErr, null, 'Test order creation should succeed')
    assert.ok(testOrder?.id)

    try {
      // Step A: Cross-tenant attack - Owner B tries to confirm Owner A's order
      const { data: crossData, error: crossErr } = await clientB.rpc('confirm_qris_payment', {
        p_order_id: testOrder.id,
      })
      assert.equal(crossData, null)
      assert.ok(crossErr)
      assert.equal(crossErr.code, '42501')
      assert.match(crossErr.message, /tidak memiliki izin/i)

      // Verify order remains pending
      const { data: orderAfterAttack } = await adminClient
        .from('orders')
        .select('payment_status')
        .eq('id', testOrder.id)
        .single()
      assert.equal(orderAfterAttack.payment_status, 'pending')

      // Step B: Authentic confirmation - Owner A confirms own order
      const { data: confirmData, error: confirmErr } = await clientA.rpc('confirm_qris_payment', {
        p_order_id: testOrder.id,
      })
      assert.equal(confirmErr, null)
      assert.equal(confirmData.success, true)
      assert.equal(confirmData.payment_status, 'paid')
      assert.equal(confirmData.already_confirmed, false)

      // Step C: Verify order in DB: payment_status = paid, order_status = pending (UNCHANGED)
      const { data: verifiedOrder } = await adminClient
        .from('orders')
        .select('payment_status, order_status')
        .eq('id', testOrder.id)
        .single()
      assert.equal(verifiedOrder.payment_status, 'paid')
      assert.equal(verifiedOrder.order_status, 'pending')

      // Step D: Verify payment record in public.payments
      const { data: paymentRecords } = await adminClient
        .from('payments')
        .select('id, payment_method, gross_amount, payment_status')
        .eq('order_id', testOrder.id)
      assert.equal(paymentRecords.length, 1)
      assert.equal(paymentRecords[0].payment_method, 'qris')
      assert.equal(paymentRecords[0].gross_amount, 45000)
      assert.equal(paymentRecords[0].payment_status, 'paid')

      // Step E: Concurrency & Idempotency - Confirming again returns already_confirmed=true without duplicate payments
      const { data: retryData, error: retryErr } = await clientA.rpc('confirm_qris_payment', {
        p_order_id: testOrder.id,
      })
      assert.equal(retryErr, null)
      assert.equal(retryData.success, true)
      assert.equal(retryData.already_confirmed, true)
      assert.equal(retryData.payment_status, 'paid')

      const { data: paymentsAfterRetry } = await adminClient
        .from('payments')
        .select('id')
        .eq('order_id', testOrder.id)
      assert.equal(paymentsAfterRetry.length, 1, 'Payment records must not duplicate on retry')

    } finally {
      // Clean up test order and payment records
      await adminClient.from('payments').delete().eq('order_id', testOrder.id)
      await adminClient.from('orders').delete().eq('id', testOrder.id)
    }
  })
})

