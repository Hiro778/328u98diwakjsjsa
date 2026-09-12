/**
 * Runtime test — simulates exact ProductForm flow.
 * Tests: product INSERT → get ID → inventory INSERT → verify → cleanup
 * Uses anon key (same as frontend).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync(new URL('.env', import.meta.url), 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

let testProductId = null
let testInventoryId = null
let testBusinessId = null
let pass = 0
let fail = 0

function ok(label) { pass++; console.log(`  ✓ ${label}`) }
function fail_(label, err) { fail++; console.log(`  ✗ ${label}: ${err}`) }

async function cleanup() {
  if (testInventoryId) {
    await supabase.from('inventory').delete().eq('id', testInventoryId)
  }
  if (testProductId) {
    await supabase.from('products').delete().eq('id', testProductId)
  }
}

async function run() {
  console.log('=== RUNTIME TEST: Product + Inventory Flow ===\n')

  // Step 0: Need a business_id. Find one from existing data.
  console.log('Step 0: Find business...')
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id')
    .limit(1)

  if (bizErr || !businesses?.length) {
    console.log('  ✗ No businesses found. Cannot run test without auth.')
    console.log('  Error:', bizErr?.message || 'No businesses')
    process.exit(1)
  }
  testBusinessId = businesses[0].id
  ok(`Found business: ${testBusinessId}`)

  // Step 1: Create product (exactly as ProductForm does)
  console.log('\nStep 1: CREATE PRODUCT...')
  const productPayload = {
    business_id: testBusinessId,
    name: 'Kecap Test',
    sku: null,
    description: '',
    category: 'Makanan',
    unit: 'pcs',
    unit_price: 15000,
    cost_price: 10000,
    notes: 'testing inventory',
    is_active: true,
  }

  const { data: prodData, error: prodErr } = await supabase
    .from('products')
    .insert(productPayload)
    .select('id')
    .single()

  if (prodErr) {
    fail_('PRODUCT INSERT', `code=${prodErr.code} msg=${prodErr.message} details=${prodErr.details}`)
    process.exit(1)
  }
  testProductId = prodData.id
  ok(`Product created: ${testProductId}`)

  // Step 2: Get product ID
  console.log('\nStep 2: PRODUCT ID...')
  if (testProductId && testProductId.length === 36) {
    ok(`Product ID valid UUID: ${testProductId}`)
  } else {
    fail_('PRODUCT ID', `Invalid: ${testProductId}`)
  }

  // Step 3: Create inventory (exactly as ProductForm does)
  console.log('\nStep 3: CREATE INVENTORY...')
  const inventoryPayload = {
    product_id: testProductId,
    quantity: 100,
    min_stock: 10,
    maximum_stock: 500,
    supplier_id: null,
    location: '',
    updated_at: new Date().toISOString(),
  }

  const { data: invData, error: invErr } = await supabase
    .from('inventory')
    .insert(inventoryPayload)
    .select('id')
    .single()

  if (invErr) {
    fail_('INVENTORY INSERT', `code=${invErr.code} msg=${invErr.message} details=${invErr.details}`)
    await cleanup()
    process.exit(1)
  }
  testInventoryId = invData.id
  ok(`Inventory created: ${testInventoryId}`)

  // Step 4: Verify product_id link
  console.log('\nStep 4: VERIFY product_id...')
  const { data: linkedInv } = await supabase
    .from('inventory')
    .select('id, product_id, quantity, min_stock, maximum_stock')
    .eq('id', testInventoryId)
    .single()

  if (linkedInv?.product_id === testProductId) {
    ok(`product_id matches: ${linkedInv.product_id}`)
  } else {
    fail_('product_id link', `Expected ${testProductId}, got ${linkedInv?.product_id}`)
  }

  // Step 5: Verify business_id via join
  console.log('\nStep 5: VERIFY business_id...')
  const { data: joined } = await supabase
    .from('products')
    .select('id, business_id, name')
    .eq('id', testProductId)
    .single()

  if (joined?.business_id === testBusinessId) {
    ok(`business_id matches: ${joined.business_id}`)
  } else {
    fail_('business_id', `Expected ${testBusinessId}, got ${joined?.business_id}`)
  }

  // Step 6: Refresh — data persists
  console.log('\nStep 6: REFRESH (re-read)...')
  const { data: refreshed } = await supabase
    .from('products')
    .select(`
      id, name, sku, category, unit, cost_price, unit_price, notes, is_active,
      inventory ( quantity, min_stock, maximum_stock, location )
    `)
    .eq('id', testProductId)
    .single()

  if (refreshed?.name === 'Kecap Test' && refreshed?.inventory?.quantity === 100) {
    ok(`Data persists after refresh: name="${refreshed.name}" stock=${refreshed.inventory.quantity}`)
  } else {
    fail_('REFRESH', `Data mismatch: ${JSON.stringify(refreshed)}`)
  }

  // Step 7: No orphan product check
  console.log('\nStep 7: NO ORPHAN PRODUCT...')
  const { data: orphanCheck } = await supabase
    .from('inventory')
    .select('id')
    .eq('product_id', testProductId)
  if (orphanCheck && orphanCheck.length > 0) {
    ok('Product has inventory record — not orphan')
  } else {
    fail_('ORPHAN CHECK', 'No inventory record for product')
  }

  // Step 8: No duplicate inventory
  console.log('\nStep 8: NO DUPLICATE INVENTORY...')
  const { count } = await supabase
    .from('inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', testProductId)
  if (count === 1) {
    ok(`Exactly 1 inventory record (count=${count})`)
  } else {
    fail_('DUPLICATE CHECK', `Expected 1, got ${count}`)
  }

  // Step 9: Edit product (update)
  console.log('\nStep 9: EDIT PRODUCT...')
  const { error: editErr } = await supabase
    .from('products')
    .update({ notes: 'edited inventory test', unit_price: 16000, updated_at: new Date().toISOString() })
    .eq('id', testProductId)
    .eq('business_id', testBusinessId)

  if (editErr) {
    fail_('PRODUCT EDIT', editErr.message)
  } else {
    const { data: edited } = await supabase.from('products').select('notes, unit_price').eq('id', testProductId).single()
    if (edited?.notes === 'edited inventory test' && edited?.unit_price === 16000) {
      ok(`Product edited: notes="${edited.notes}" price=${edited.unit_price}`)
    } else {
      fail_('PRODUCT EDIT VERIFY', JSON.stringify(edited))
    }
  }

  // Step 10: Edit inventory (update)
  console.log('\nStep 10: EDIT INVENTORY...')
  const { error: invEditErr } = await supabase
    .from('inventory')
    .update({ quantity: 200, min_stock: 20, maximum_stock: 600, updated_at: new Date().toISOString() })
    .eq('id', testInventoryId)

  if (invEditErr) {
    fail_('INVENTORY EDIT', invEditErr.message)
  } else {
    const { data: invEdited } = await supabase.from('inventory').select('quantity, min_stock, maximum_stock').eq('id', testInventoryId).single()
    if (invEdited?.quantity === 200 && invEdited?.min_stock === 20 && invEdited?.maximum_stock === 600) {
      ok(`Inventory edited: qty=${invEdited.quantity} min=${invEdited.min_stock} max=${invEdited.maximum_stock}`)
    } else {
      fail_('INVENTORY EDIT VERIFY', JSON.stringify(invEdited))
    }
  }

  // Step 11: Stock adjustment via RPC
  console.log('\nStep 11: ADJUST_STOCK RPC...')
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('adjust_stock', {
    p_product_id: testProductId,
    p_movement_type: 'stock_in',
    p_quantity: 50,
    p_reason: 'Runtime test restock',
  })

  if (rpcErr) {
    fail_('ADJUST_STOCK RPC', rpcErr.message)
  } else if (rpcResult?.success) {
    ok(`Stock adjusted: new_stock=${rpcResult.new_stock}`)
  } else {
    fail_('ADJUST_STOCK RPC', rpcResult?.error || 'Unknown error')
  }

  // Step 12: Verify stock after adjustment
  console.log('\nStep 12: VERIFY STOCK AFTER ADJUSTMENT...')
  const { data: afterAdj } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('id', testInventoryId)
    .single()
  if (afterAdj?.quantity === 250) {
    ok(`Stock correct after adjustment: ${afterAdj.quantity} (200 + 50)`)
  } else {
    fail_('STOCK VERIFY', `Expected 250, got ${afterAdj?.quantity}`)
  }

  // Step 13: Check stock_movements
  console.log('\nStep 13: STOCK MOVEMENTS AUDIT...')
  const { data: movements } = await supabase
    .from('stock_movements')
    .select('movement_type, quantity, stock_before, stock_after, reason')
    .eq('product_id', testProductId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (movements?.[0]?.movement_type === 'stock_in' && movements[0]?.quantity === 50) {
    ok(`Movement recorded: type=${movements[0].movement_type} qty=${movements[0].quantity} before=${movements[0].stock_before} after=${movements[0].stock_after}`)
  } else {
    fail_('MOVEMENT AUDIT', JSON.stringify(movements))
  }

  // Cleanup
  console.log('\n=== CLEANUP ===')
  await cleanup()
  console.log('Test data deleted.\n')

  // Summary
  console.log('=== RESULTS ===')
  console.log(`  PASS: ${pass}`)
  console.log(`  FAIL: ${fail}`)
  console.log(fail === 0 ? '\n  ALL TESTS PASSED ✓' : '\n  SOME TESTS FAILED ✗')
  process.exit(fail === 0 ? 0 : 1)
}

run().catch(async e => {
  console.error('Fatal:', e.message)
  await cleanup()
  process.exit(1)
})
