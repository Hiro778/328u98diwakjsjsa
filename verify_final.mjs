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

async function verify() {
  console.log('=== SCHEMA VERIFICATION ===\n')

  // 1. products.notes
  const { data: p, error: pe } = await supabase.from('products').select('notes').limit(1)
  console.log('products.notes:', pe ? `FAIL — ${pe.message}` : 'EXISTS ✓')

  // 2. inventory.maximum_stock
  const { data: i, error: ie } = await supabase.from('inventory').select('maximum_stock, supplier_id').limit(1)
  console.log('inventory.maximum_stock:', ie?.message?.includes('maximum_stock') ? 'FAIL' : 'EXISTS ✓')
  console.log('inventory.supplier_id:', ie?.message?.includes('supplier_id') ? 'FAIL' : 'EXISTS ✓')

  // 3. stock_movements
  const { data: sm, error: sme } = await supabase.from('stock_movements').select('id').limit(1)
  console.log('stock_movements:', sme ? `FAIL — ${sme.message}` : 'EXISTS ✓')

  // 4. adjust_stock RPC
  const { data: rpc, error: rpe } = await supabase.rpc('adjust_stock', {
    p_product_id: '00000000-0000-0000-0000-000000000000',
    p_movement_type: 'stock_in',
    p_quantity: 1,
    p_reason: 'test'
  })
  const rpcExists = !rpe?.message?.includes('does not exist')
  console.log('adjust_stock RPC:', rpcExists ? 'EXISTS ✓' : 'FAIL — NOT FOUND')

  console.log('\n=== DONE ===')
}

verify().catch(e => console.error('Fatal:', e.message))
