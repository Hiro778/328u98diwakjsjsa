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

async function check() {
  // Try to query stock_movements (will fail if table doesn't exist or no access)
  const { data, error } = await supabase.from('stock_movements').select('id').limit(1)
  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      console.log('stock_movements: TABLE DOES NOT EXIST')
    } else if (error.message?.includes('RLS') || error.code === '42501') {
      console.log('stock_movements: EXISTS but RLS blocked (no business)')
    } else {
      console.log('stock_movements error:', error.code, error.message)
    }
  } else {
    console.log('stock_movements: EXISTS, rows:', data?.length)
  }

  // Try to query inventory with maximum_stock column
  const { data: inv, error: invErr } = await supabase.from('inventory').select('id, maximum_stock, supplier_id').limit(1)
  if (invErr) {
    if (invErr.message?.includes('maximum_stock')) {
      console.log('inventory.maximum_stock: COLUMN DOES NOT EXIST')
    } else if (invErr.message?.includes('supplier_id')) {
      console.log('inventory.supplier_id: COLUMN DOES NOT EXIST')
    } else {
      console.log('inventory error:', invErr.code, invErr.message)
    }
  } else {
    console.log('inventory: maximum_stock and supplier_id columns EXIST')
  }

  // Try to query products with notes column
  const { data: prods, error: prodErr } = await supabase.from('products').select('id, notes').limit(1)
  if (prodErr) {
    if (prodErr.message?.includes('notes')) {
      console.log('products.notes: COLUMN DOES NOT EXIST')
    } else {
      console.log('products error:', prodErr.code, prodErr.message)
    }
  } else {
    console.log('products.notes: column EXISTS')
  }
}

check().catch(e => console.error('Fatal:', e.message))
