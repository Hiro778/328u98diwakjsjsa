import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
}

// 1. Anon client (mimics public browser customer)
const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
// 2. Admin client (for DB inspection & verification)
const adminClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function logResult(title, passed, detail = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${title} ${detail ? '— ' + detail : ''}`)
}

async function runTokoE2E() {
  console.log('================================================================')
  console.log('FINAL E2E CHECK — PUBLIC PRODUCT → CART → CHECKOUT → ORDER (toko.md)')
  console.log('================================================================\n')

  const bizId = 'b51fdc7e-6b7d-4207-8b30-d5f02275f686'
  let allPassed = true

  // Step 0: Ensure business and products are ready
  const { data: business } = await adminClient.from('businesses').select('*').eq('id', bizId).single()
  const { data: products } = await adminClient.from('products').select('*').eq('business_id', bizId)
  const productA = products[0]

  console.log(`Testing with Business: "${business.name}" (${business.id})`)
  console.log(`Testing with Product: "${productA.name}" (${productA.id}), DB Price: Rp${Number(productA.unit_price).toLocaleString('id-ID')}\n`)

  // Ensure inventory exists for productA with sufficient stock for testing
  const { data: inv } = await adminClient.from('inventory').select('*').eq('product_id', productA.id).maybeSingle()
  if (!inv) {
    await adminClient.from('inventory').insert({ product_id: productA.id, quantity: 10 })
  } else {
    await adminClient.from('inventory').update({ quantity: 10 }).eq('id', inv.id)
  }

  // -------------------------------------------------------------
  // TEST 1 & 2: ORDER CREATION & ORDER ITEMS VIA ANON CLIENT
  // -------------------------------------------------------------
  let testOrderId = null
  try {
    const { data: res, error: err } = await anonClient.rpc('create_public_order', {
      p_business_id: bizId,
      p_items: [
        {
          product_id: productA.id,
          quantity: 1,
          selected_variants: { 'Level': 'Pedas' }
        }
      ],
      p_payment_method: 'cash',
      p_customer_name: 'Customer E2E'
    })

    const orderCreated = !err && res?.success && res?.order?.id
    const itemsCreated = !err && Array.isArray(res?.items) && res?.items?.length === 1
    testOrderId = res?.order?.id

    logResult('1. ORDER CREATION', orderCreated, `Order ID: ${testOrderId}, Total: Rp${res?.order?.total}`)
    logResult('2. ORDER ITEMS', itemsCreated, `Item ID: ${res?.items?.[0]?.id}`)
    if (!orderCreated || !itemsCreated) allPassed = false
  } catch (e) {
    logResult('1. ORDER CREATION', false, e.message)
    logResult('2. ORDER ITEMS', false, e.message)
    allPassed = false
  }

  // -------------------------------------------------------------
  // TEST 3: RLS CHECK (Zero Policy Violations on Anonymous Flow)
  // -------------------------------------------------------------
  let rlsPassed = false
  try {
    // Attempting direct select on the created order using anon client
    const { data: anonOrder, error: anonErr } = await anonClient
      .from('orders')
      .select('id, business_id, total, order_source')
      .eq('id', testOrderId)
      .single()

    rlsPassed = !anonErr && anonOrder && anonOrder.id === testOrderId
    logResult('3. RLS (Zero Policy Violations)', rlsPassed, 'Anon customer can safely read own order without RLS violation')
  } catch (e) {
    logResult('3. RLS', false, e.message)
    rlsPassed = false
  }
  if (!rlsPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 4: PRICE INTEGRITY (Client Price Manipulation Resistance)
  // -------------------------------------------------------------
  // Client attempts to send manipulated price = 1
  let priceIntegrityPassed = false
  try {
    const { data: manipulatedRes, error: mErr } = await anonClient.rpc('create_public_order', {
      p_business_id: bizId,
      p_items: [
        {
          product_id: productA.id,
          quantity: 1,
          unit_price: 1, // Manipulated price!
          subtotal: 1,
          selected_variants: {}
        }
      ],
      p_payment_method: 'cash'
    })

    const orderTotal = manipulatedRes?.order?.total
    const expectedDbPrice = Number(productA.unit_price)

    // Server MUST use DB price, ignoring client's Rp1
    priceIntegrityPassed = !mErr && orderTotal === expectedDbPrice
    logResult('4. PRICE INTEGRITY', priceIntegrityPassed, `Client sent Rp1, Server enforced DB Price: Rp${orderTotal.toLocaleString('id-ID')}`)

    if (manipulatedRes?.order?.id) {
      await adminClient.from('orders').delete().eq('id', manipulatedRes.order.id)
    }
  } catch (e) {
    logResult('4. PRICE INTEGRITY', false, e.message)
  }
  if (!priceIntegrityPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 5: STOCK INTEGRITY (Reject Quantity > Stock)
  // -------------------------------------------------------------
  let stockIntegrityPassed = false
  try {
    // Current stock is 9 (10 - 1 from test 1). Try requesting 999.
    const { data: stockRes, error: sErr } = await anonClient.rpc('create_public_order', {
      p_business_id: bizId,
      p_items: [
        {
          product_id: productA.id,
          quantity: 999,
          selected_variants: {}
        }
      ],
      p_payment_method: 'cash'
    })

    // Expecting rejection with 23514 / error message
    stockIntegrityPassed = !!sErr && sErr.message.includes('Stok tidak mencukupi')
    logResult('5. STOCK INTEGRITY', stockIntegrityPassed, sErr?.message || 'Expected rejection')
  } catch (e) {
    logResult('5. STOCK INTEGRITY', false, e.message)
  }
  if (!stockIntegrityPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 6: VARIANT SNAPSHOT PERSISTENCE
  // -------------------------------------------------------------
  let variantSnapshotPassed = false
  try {
    const { data: itemData } = await adminClient
      .from('order_items')
      .select('*')
      .eq('order_id', testOrderId)
      .single()

    const hasSnapshot = itemData?.variant_details?.Level === 'Pedas'
    variantSnapshotPassed = hasSnapshot
    logResult('6. VARIANT SNAPSHOT', variantSnapshotPassed, JSON.stringify(itemData?.variant_details))
  } catch (e) {
    logResult('6. VARIANT SNAPSHOT', false, e.message)
  }
  if (!variantSnapshotPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 7: DISCOUNT CALCULATION
  // -------------------------------------------------------------
  let discountPassed = false
  let discountProdId = null
  try {
    // Create temporary product with 20% discount
    const normalPrice = 50000
    const discountPercent = 20
    const expectedDiscountedPrice = 40000

    const { data: dProd } = await adminClient
      .from('products')
      .insert({
        business_id: bizId,
        name: 'Produk Diskon E2E',
        unit_price: normalPrice,
        is_available: true,
        notes: JSON.stringify({
          discount: {
            type: 'percentage',
            value: discountPercent,
            is_published: true
          }
        })
      })
      .select()
      .single()

    discountProdId = dProd.id
    // Add inventory
    await adminClient.from('inventory').insert({ product_id: dProd.id, quantity: 10 })

    // Anonymous customer purchases discounted product
    const { data: dOrderRes, error: dErr } = await anonClient.rpc('create_public_order', {
      p_business_id: bizId,
      p_items: [
        {
          product_id: dProd.id,
          quantity: 1,
          selected_variants: {}
        }
      ],
      p_payment_method: 'cash'
    })

    const actualSavedPrice = dOrderRes?.items?.[0]?.unit_price
    const actualTotal = dOrderRes?.order?.total

    discountPassed = !dErr && actualSavedPrice === expectedDiscountedPrice && actualTotal === expectedDiscountedPrice
    logResult('7. DISCOUNT', discountPassed, `Normal: Rp${normalPrice.toLocaleString()}, Disc: 20%, Order Saved: Rp${actualSavedPrice.toLocaleString()}`)

    if (dOrderRes?.order?.id) {
      await adminClient.from('orders').delete().eq('id', dOrderRes.order.id)
    }
  } catch (e) {
    logResult('7. DISCOUNT', false, e.message)
  } finally {
    if (discountProdId) {
      await adminClient.from('inventory').delete().eq('product_id', discountProdId)
      await adminClient.from('products').delete().eq('id', discountProdId)
    }
  }
  if (!discountPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 8: TENANT ISOLATION (Deny Cross-Tenant Order)
  // -------------------------------------------------------------
  let tenantIsolationPassed = false
  try {
    // Attempting to order productA with another business_id
    const fakeBizId = '00000000-0000-0000-0000-000000000000'
    const { data: tRes, error: tErr } = await anonClient.rpc('create_public_order', {
      p_business_id: fakeBizId,
      p_items: [
        {
          product_id: productA.id,
          quantity: 1
        }
      ]
    })

    tenantIsolationPassed = !!tErr && (tErr.message.includes('Bisnis tidak ditemukan') || tErr.message.includes('Pelanggaran isolasi tenant'))
    logResult('8. TENANT ISOLATION', tenantIsolationPassed, tErr?.message || 'Expected rejection')
  } catch (e) {
    logResult('8. TENANT ISOLATION', false, e.message)
  }
  if (!tenantIsolationPassed) allPassed = false

  // -------------------------------------------------------------
  // TEST 9: DATABASE RECORD VERIFICATION
  // -------------------------------------------------------------
  let dbVerificationPassed = false
  try {
    const { data: verifiedOrder } = await adminClient
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', testOrderId)
      .single()

    dbVerificationPassed = verifiedOrder && verifiedOrder.order_items?.length > 0
    logResult('9. DATABASE RECORD VERIFICATION', dbVerificationPassed, `Verified order ${verifiedOrder?.order_number} persists in DB with ${verifiedOrder?.order_items?.length} item(s)`)
  } catch (e) {
    logResult('9. DATABASE RECORD VERIFICATION', false, e.message)
  }
  if (!dbVerificationPassed) allPassed = false

  // Clean up initial test order
  if (testOrderId) {
    await adminClient.from('orders').delete().eq('id', testOrderId)
  }

  console.log('\n================================================================')
  console.log(`FINAL VERIFICATION: ${allPassed ? 'ALL TESTS PASSED ✅' : 'FAILURES DETECTED ❌'}`)
  console.log('================================================================')

  process.exit(allPassed ? 0 : 1)
}

runTokoE2E()
