import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load .env manually
const envContent = readFileSync(new URL('.env', import.meta.url), 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function checkSchema() {
  console.log('=== SCHEMA VERIFICATION ===\n')

  // Check products columns
  const { data: prodCols, error: prodErr } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, column_default')
    .eq('table_name', 'products')
    .in('column_name', ['notes', 'is_active', 'cost_price', 'unit_price', 'sku', 'category'])

  if (prodErr) {
    console.log('products column check (information_schema may be blocked by RLS):', prodErr.message)
  } else {
    console.log('products columns:', JSON.stringify(prodCols, null, 2))
  }

  // Check inventory columns
  const { data: invCols, error: invErr } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, column_default')
    .eq('table_name', 'inventory')
    .in('column_name', ['quantity', 'min_stock', 'maximum_stock', 'supplier_id', 'location'])

  if (invErr) {
    console.log('inventory column check:', invErr.message)
  } else {
    console.log('inventory columns:', JSON.stringify(invCols, null, 2))
  }

  // Check stock_movements exists
  const { data: smCols, error: smErr } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_name', 'stock_movements')

  if (smErr) {
    console.log('stock_movements check:', smErr.message)
  } else {
    console.log('stock_movements table exists:', smCols && smCols.length > 0)
  }

  // Try to test adjust_stock RPC (will fail if not exists)
  const { data: rpcData, error: rpcErr } = await supabase.rpc('adjust_stock', {
    p_product_id: '00000000-0000-0000-0000-000000000000',
    p_movement_type: 'stock_in',
    p_quantity: 1,
    p_reason: 'schema check'
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('function') && rpcErr.message?.includes('does not exist')) {
      console.log('adjust_stock RPC: DOES NOT EXIST')
    } else {
      console.log('adjust_stock RPC: EXISTS (error is expected for fake UUID):', rpcErr.message)
    }
  } else {
    console.log('adjust_stock RPC: EXISTS and returned:', JSON.stringify(rpcData))
  }

  console.log('\n=== DONE ===')
}

checkSchema().catch(e => console.error('Fatal:', e.message))
