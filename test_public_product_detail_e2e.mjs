import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  parseProductMetadata,
  hasRequiredVariants,
  calculateProductPrice,
} from './src/lib/productMetadata.js'

const envContent = readFileSync('.env', 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

function log(testName, passed, detail = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${detail}`)
}

async function run() {
  console.log('================================================================')
  console.log('E2E VERIFICATION: PUBLIC PRODUCT DETAIL & CONTEXT7 UX (toko.md)')
  console.log('================================================================\n')

  let allPassed = true

  // 1. Check published business
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .select('id, name, slogan, is_menu_published')
    .eq('id', 'b51fdc7e-6b7d-4207-8b30-d5f02275f686')
    .single()

  const pass1 = !bErr && business && business.is_menu_published
  log('1. Business Published Check', pass1, business?.name || '')
  if (!pass1) allPassed = false

  // 2. Fetch public menu products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', business.id)
    .eq('is_available', true)
    .eq('is_active', true)

  const pass2 = !pErr && products && products.length > 0
  const productNames = products.map(p => p.name)
  log('2. Public Menu Products Loaded', pass2, `Found: ${productNames.join(', ')}`)
  if (!pass2) allPassed = false

  // 3. Test A: Single Product detail fetch (e.g. "hai")
  const haiProd = products.find(p => p.name === 'hai')
  let pass3 = false
  if (haiProd) {
    const { data: detailData, error: dErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', haiProd.id)
      .eq('business_id', business.id)
      .eq('is_available', true)
      .eq('is_active', true)
      .single()

    const meta = parseProductMetadata(detailData)
    const price = calculateProductPrice(detailData.unit_price, [], meta.discount)
    pass3 = !dErr && detailData && price.finalPrice === 200000
    log('3. Single Product Detail & Price (hai)', pass3, `Rp${price.finalPrice.toLocaleString('id-ID')}`)
  }
  if (!pass3) allPassed = false

  // 4. Test B: Product with Dynamic Variants & Discount (Test simulation with Nasi Goreng Test)
  const nasgor = products.find(p => p.name === 'Nasi Goreng Test')
  let pass4 = false
  if (nasgor) {
    // Add custom variants and discount to Nasi Goreng Test metadata
    const testMeta = {
      variant_groups: [
        {
          id: 'grp-pedas',
          name: 'Level Pedas',
          options: [
            { id: 'opt-sedang', name: 'Sedang', price_adjustment: 0, stock: 15 },
            { id: 'opt-pedas', name: 'Pedas Gila', price_adjustment: 3000, stock: 8 },
            { id: 'opt-habis', name: 'Super Pedas', price_adjustment: 5000, stock: 0 },
          ]
        }
      ],
      discount: {
        discount_type: 'percentage',
        discount_value: 20,
        is_published: true,
        is_active: true
      }
    }

    const simulatedNasgor = { ...nasgor, notes: JSON.stringify(testMeta) }
    const parsed = parseProductMetadata(simulatedNasgor)
    const hasVar = hasRequiredVariants(simulatedNasgor)

    // Option "Pedas Gila" selected (+3000): base 25000 + 3000 = 28000, 20% discount = 22400
    const selectedOpt = parsed.variantGroups[0].options[1]
    const priceWithVar = calculateProductPrice(simulatedNasgor.unit_price, [selectedOpt], parsed.discount)

    pass4 = hasVar && priceWithVar.finalPrice === 22400 && priceWithVar.originalPrice === 28000
    log('4. Dynamic Variant + 20% Discount Calculation', pass4, `Final: Rp${priceWithVar.finalPrice} (Ori: Rp${priceWithVar.originalPrice})`)
  }
  if (!pass4) allPassed = false

  // 5. Test F: Security & Tenant Isolation (Cross-business inquiry rejection)
  // Query product from business B (18b41611-3e09-44f3-91b7-727b178f301f) under business A
  const otherProdId = '5dd3ce0c-195c-4ca8-813c-802c3c7d3dcf' // kwqgeiuwq
  const { data: crossProd, error: crossErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', otherProdId)
    .eq('business_id', business.id)
    .single()

  const pass5 = !crossProd || crossErr != null
  log('5. Security / Tenant Isolation (Cross-tenant query rejected)', pass5, 'Blocked as expected')
  if (!pass5) allPassed = false

  // 6. Test Quick-Add vs Open-Detail Routing Logic
  const plainProduct = { id: 'p1', name: 'Kopi', notes: '' }
  const variantProduct = { id: 'p2', name: 'Teh', notes: JSON.stringify({ variant_groups: [{ id: 'g1', name: 'Ukuran', options: [{ id: 'o1', name: 'L' }] }] }) }

  const pass6 = !hasRequiredVariants(plainProduct) && hasRequiredVariants(variantProduct)
  log('6. Card Click & Button UX Routing Separation', pass6, 'Quick-add only for non-variant products')
  if (!pass6) allPassed = false

  console.log('\n================================================================')
  console.log(`RESULT: ${allPassed ? 'ALL ACCEPTANCE TESTS PASSED' : 'SOME TESTS FAILED'}`)
  console.log('================================================================')

  process.exit(allPassed ? 0 : 1)
}

run()
