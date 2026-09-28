import { createClient } from '@supabase/supabase-js'
import { readFileSync, unlinkSync } from 'fs'

const envContent = readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const adminClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function audit() {
  console.log('--- AUDITING REMOTE SUPABASE SCHEMA ---')
  const checkColumns = async (table, cols) => {
    console.log(`Checking columns for ${table}:`)
    for (const c of cols) {
      const { error } = await adminClient.from(table).select(c).limit(1)
      if (error) {
        console.log(`  - ${c}: FAIL (${error.message})`)
      } else {
        console.log(`  - ${c}: EXISTS`)
      }
    }
  }

  await checkColumns('payments', ['id', 'order_id', 'business_id', 'payment_provider', 'payment_method', 'gross_amount', 'amount', 'payment_status', 'paid_at', 'created_at', 'updated_at'])
  await checkColumns('subscription_payments', ['id', 'profile_id', 'plan', 'amount', 'gross_amount', 'payment_status', 'created_at'])
  await checkColumns('orders', ['id', 'order_number', 'business_id', 'payment_status', 'payment_method', 'order_status', 'total', 'gross_amount', 'created_at'])
}

audit().catch(console.error)
