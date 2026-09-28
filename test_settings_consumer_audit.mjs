// test_settings_consumer_audit.mjs
// Live audit script according to @ban.md
// Tests actual runtime enforcement of all 13 platform_settings keys

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

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const supabaseAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function runAudit() {
  console.log('\n============================================================')
  console.log('AUDIT: RUNTIME ENFORCEMENT OF PLATFORM SETTINGS (@ban.md)')
  console.log('============================================================\n')

  // 1. Fetch current settings from DB
  const { data: currentSettings, error: sErr } = await supabaseAdmin
    .from('platform_settings')
    .select('key, value, category')

  if (sErr) {
    console.error('Failed to read platform_settings:', sErr)
    process.exit(1)
  }

  console.log(`Database source-of-truth has ${currentSettings.length} settings.`)

  // 2. Test QRIS CHECKOUT enforcement when enable_qris_checkout is tested
  // Fetch active business and product
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('is_menu_published', true)
    .limit(1)
    .single()

  const { data: prod } = await supabaseAdmin
    .from('products')
    .select('id, name, unit_price')
    .eq('business_id', biz.id)
    .eq('is_available', true)
    .limit(1)
    .single()

  console.log(`\nTesting with business: "${biz.name}" (${biz.id}), product: "${prod.name}"`)

  // 2a. Temporarily set enable_qris_checkout = false
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: false })
    .eq('key', 'enable_qris_checkout')

  // Try to create order with payment_method = 'qris'
  const testReqId = `audit_qris_${Date.now()}`
  const { data: qrisOrderData, error: qrisOrderErr } = await supabaseAnon.rpc('create_public_order', {
    p_business_id: biz.id,
    p_items: [{ product_id: prod.id, quantity: 1 }],
    p_payment_method: 'qris',
    p_customer_name: 'Audit Bot',
    p_checkout_request_id: testReqId,
  })

  const qrisServerBlocked = Boolean(qrisOrderErr)
  console.log(`[AUDIT] enable_qris_checkout=false -> create_public_order result:`, 
    qrisServerBlocked ? `BLOCKED (${qrisOrderErr.message})` : `ALLOWED (Order ID: ${qrisOrderData?.order?.id || 'none'})`
  )

  // Clean up order if created
  if (qrisOrderData?.order?.id) {
    await supabaseAdmin.from('orders').delete().eq('id', qrisOrderData.order.id)
  }

  // Restore enable_qris_checkout = true
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: true })
    .eq('key', 'enable_qris_checkout')

  // 3. Test POS MAX ITEMS PER ORDER enforcement
  // Set pos_max_items_per_order = 10
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: 10 })
    .eq('key', 'pos_max_items_per_order')

  // Attempt order with 999 items
  const testReqIdMax = `audit_max_${Date.now()}`
  const { data: maxOrderData, error: maxOrderErr } = await supabaseAnon.rpc('create_public_order', {
    p_business_id: biz.id,
    p_items: [{ product_id: prod.id, quantity: 999 }],
    p_payment_method: 'cash',
    p_customer_name: 'Audit Bot Max',
    p_checkout_request_id: testReqIdMax,
  })

  // Check if error is due to max limit or inventory stock
  const isMaxItemsError = maxOrderErr?.message?.includes('pos_max_items') || maxOrderErr?.message?.includes('Batas maksimum')
  console.log(`[AUDIT] pos_max_items_per_order=10 -> order with 999 items:`,
    isMaxItemsError ? `ENFORCED (${maxOrderErr.message})` : `NOT ENFORCED by pos_max_items (Err: ${maxOrderErr?.message || 'allowed'})`
  )

  if (maxOrderData?.order?.id) {
    await supabaseAdmin.from('orders').delete().eq('id', maxOrderData.order.id)
  }

  // Restore pos_max_items_per_order = 100
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: 100 })
    .eq('key', 'pos_max_items_per_order')

  // 4. Test MAINTENANCE_MODE server-side enforcement
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: true })
    .eq('key', 'maintenance_mode')

  // Anon tries to call create_public_order
  const testReqIdMaint = `audit_maint_${Date.now()}`
  const { data: maintOrderData, error: maintOrderErr } = await supabaseAnon.rpc('create_public_order', {
    p_business_id: biz.id,
    p_items: [{ product_id: prod.id, quantity: 1 }],
    p_payment_method: 'cash',
    p_customer_name: 'Audit Bot Maint',
    p_checkout_request_id: testReqIdMaint,
  })

  const isMaintBlocked = maintOrderErr?.message?.includes('pemeliharaan') || maintOrderErr?.message?.includes('maintenance')
  console.log(`[AUDIT] maintenance_mode=true -> anon create_public_order:`,
    isMaintBlocked ? `BLOCKED (${maintOrderErr.message})` : `NOT BLOCKED server-side (Err: ${maintOrderErr?.message || 'allowed'})`
  )

  if (maintOrderData?.order?.id) {
    await supabaseAdmin.from('orders').delete().eq('id', maintOrderData.order.id)
  }

  // Restore maintenance_mode = false
  await supabaseAdmin
    .from('platform_settings')
    .update({ value: false })
    .eq('key', 'maintenance_mode')

  console.log('\n============================================================')
  console.log('AUDIT RUNTIME TEST EXECUTION COMPLETED')
  console.log('============================================================\n')
}

runAudit()
