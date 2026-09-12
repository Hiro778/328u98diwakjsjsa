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

async function checkLoyaltyTables() {
  console.log('=== VERIFYING LOYALTY TABLES IN PRODUCTION DATABASE ===\n')

  const tables = [
    'loyalty_programs',
    'loyalty_rewards',
    'loyalty_points_ledger',
    'loyalty_redemptions'
  ]

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        console.log(`❌ ${table}: TABLE DOES NOT EXIST in production database`)
      } else if (error.message?.includes('RLS') || error.code === '42501') {
        console.log(`✅ ${table}: EXISTS (protected by RLS)`)
      } else {
        console.log(`⚠️ ${table} error: ${error.code} - ${error.message}`)
      }
    } else {
      console.log(`✅ ${table}: EXISTS (accessible)`)
    }
  }

  console.log('\n--- Checking Customer Loyalty Columns ---')
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, loyalty_points_balance, loyalty_lifetime_points, loyalty_total_redeemed, loyalty_is_member')
    .limit(1)

  if (custErr) {
    if (custErr.message?.includes('loyalty_')) {
      console.log(`❌ customers loyalty columns: MISSING - ${custErr.message}`)
    } else {
      console.log(`⚠️ customers check error: ${custErr.message}`)
    }
  } else {
    console.log('✅ customers loyalty columns: ALL EXIST')
  }

  console.log('\n=== VERIFICATION COMPLETED ===')
}

checkLoyaltyTables().catch(e => console.error('Fatal:', e.message))
