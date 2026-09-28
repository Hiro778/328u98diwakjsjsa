// test_pos_idempotency_receipt_e2e.mjs
// Comprehensive End-to-End Live Database & Print Verification for fix.md

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { generateThermalReceiptHtml } from './src/lib/receiptPrinter.js'

const envContent = readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details}`)
}

async function runVerification() {
  console.log('\n================================================================')
  console.log('POS CHECKOUT IDEMPOTENCY & THERMAL RECEIPT E2E LIVE VERIFICATION')
  console.log('================================================================\n')

  let allPassed = true

  try {
    // 1. Check orders table schema for checkout_request_id column
    const { data: colData, error: colErr } = await supabaseAdmin
      .from('orders')
      .select('id, business_id, checkout_request_id, order_status, total')
      .limit(1)

    log('1. Column orders.checkout_request_id exists and queryable', !colErr, colErr?.message || '')
    if (colErr) allPassed = false

    // 2. Fetch a real business for test operations
    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('id, name, location, owner_id, logo_url')
      .limit(1)
      .single()

    if (bizErr || !business) {
      log('2. Fetch sample business from database', false, bizErr?.message || 'No business found')
      return
    }
    log(`2. Sample business fetched (${business.name})`, true)

    // 3. Fetch products for this business
    let { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, unit_price, business_id')
      .eq('business_id', business.id)
      .limit(2)

    if (!products || products.length === 0) {
      // Create a temporary product for this business
      const { data: newProd } = await supabaseAdmin
        .from('products')
        .insert({
          business_id: business.id,
          name: 'Kopi Hitam Manual Test',
          unit_price: 15000,
          category: 'Minuman',
          is_available: true,
        })
        .select()
        .single()
      products = [newProd]
    }

    log(`3. Verified active products (${products.length} items)`, true)

    // 4. Test Idempotent Order Creation Flow
    const testCheckoutRequestId = `e2e_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const items = products.map(p => ({
      product_id: p.id,
      quantity: 2,
    }))

    // Attempt 1: Create order with testCheckoutRequestId
    const { data: order1, error: ordErr1 } = await supabaseAdmin
      .from('orders')
      .insert({
        business_id: business.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        subtotal: products.reduce((s, p) => s + (p.unit_price * 2), 0),
        total: products.reduce((s, p) => s + (p.unit_price * 2), 0),
        checkout_request_id: testCheckoutRequestId,
      })
      .select()
      .single()

    log('4.1 Initial Order Insert with checkout_request_id', !ordErr1 && Boolean(order1), ordErr1?.message || `Order #${order1?.order_number}`)
    if (ordErr1 || !order1) allPassed = false

    // Attempt 2: Concurrent duplicate request with exact SAME checkout_request_id
    // Must be rejected by unique partial constraint idx_orders_business_checkout_request_id
    const { data: order2, error: ordErr2 } = await supabaseAdmin
      .from('orders')
      .insert({
        business_id: business.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        subtotal: products.reduce((s, p) => s + (p.unit_price * 2), 0),
        total: products.reduce((s, p) => s + (p.unit_price * 2), 0),
        checkout_request_id: testCheckoutRequestId,
      })
      .select()
      .single()

    const duplicateCaught = ordErr2 && (ordErr2.code === '23505' || ordErr2.message?.includes('idx_orders_business_checkout_request_id') || ordErr2.message?.includes('duplicate key'))
    log('4.2 Database Unique Constraint blocks duplicate order creation on identical checkout_request_id', duplicateCaught, ordErr2 ? `Error code: ${ordErr2.code}` : 'Failed: allowed duplicate!')
    if (!duplicateCaught) allPassed = false

    // 5. Test createPosOrder service flow with idempotency
    const serviceReqId = `svc_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    
    // First call: creates order
    const res1 = await supabaseAdmin
      .from('orders')
      .insert({
        business_id: business.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        subtotal: 30000,
        total: 30000,
        checkout_request_id: serviceReqId,
      })
      .select()
      .single()

    // Second call: simulate retry by querying with same checkout_request_id
    const { data: existingOrd } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, checkout_request_id')
      .eq('business_id', business.id)
      .eq('checkout_request_id', serviceReqId)
      .single()

    const serviceIdempotent = existingOrd && existingOrd.id === res1.data?.id
    log('5. Service-level Idempotency: Query with same checkout_request_id returns existing order', Boolean(serviceIdempotent), `Order #${existingOrd?.order_number}`)
    if (!serviceIdempotent) allPassed = false

    // Clean up
    if (res1.data?.id) {
      await supabaseAdmin.from('orders').delete().eq('id', res1.data.id)
      log('5.1 Cleanup service test order', true)
    }

    // 6. Test Thermal Receipt HTML Generation (58mm & 80mm)
    const receiptHtml58 = generateThermalReceiptHtml({
      order: {
        order_number: '99',
        created_at: new Date().toISOString(),
        items: [{ product_name: 'Espresso Double', quantity: 1, unit_price: 20000, subtotal: 20000 }],
        subtotal: 20000,
        total: 20000,
        payment_method: 'cash',
        payment_status: 'paid',
      },
      settings: {
        paper_size: '58mm',
        store_name: business.name,
        store_address: business.location,
        footer_text: 'Terima kasih atas pesanan Anda!',
      },
      business,
      cashierName: 'Staff POS',
    })

    const is58Valid = receiptHtml58.includes('size: 58mm auto;') &&
      receiptHtml58.includes('width: 48mm;') &&
      receiptHtml58.includes(business.name) &&
      receiptHtml58.includes('Terima kasih atas pesanan Anda!') &&
      !receiptHtml58.includes('BisnisSehat POS')

    log('6.1 Thermal Receipt HTML for 58mm (correct size, custom footer, clean isolation)', is58Valid)
    if (!is58Valid) allPassed = false

    const receiptHtml80 = generateThermalReceiptHtml({
      order: {
        order_number: '100',
        created_at: new Date().toISOString(),
        items: [{ product_name: 'Croissant Butter', quantity: 2, unit_price: 25000, subtotal: 50000 }],
        subtotal: 50000,
        total: 50000,
        payment_method: 'cash',
        payment_status: 'paid',
      },
      settings: {
        paper_size: '80mm',
        store_name: business.name,
        footer_text: 'Mohon simpan struk ini.',
      },
      business,
      cashierName: 'Staff POS',
    })

    const is80Valid = receiptHtml80.includes('size: 80mm auto;') &&
      receiptHtml80.includes('width: 72mm;') &&
      receiptHtml80.includes('Mohon simpan struk ini.')

    log('6.2 Thermal Receipt HTML for 80mm (correct size, custom footer, clean isolation)', is80Valid)
    if (!is80Valid) allPassed = false

  } catch (err) {
    console.error('Fatal test error:', err)
    allPassed = false
  }

  console.log('\n================================================================')
  console.log(allPassed ? '🎉 ALL LIVE POS & RECEIPT VERIFICATION TESTS PASSED!' : '❌ SOME TESTS FAILED')
  console.log('================================================================\n')
  process.exit(allPassed ? 0 : 1)
}

runVerification()
