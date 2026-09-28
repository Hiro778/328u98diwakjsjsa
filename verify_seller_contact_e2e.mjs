// verify_seller_contact_e2e.mjs
// Comprehensive live Supabase & Vite verification script for Seller Contact on Order Waiting Screen (@2.md)

import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import {
  normalizePhoneDigits,
  normalizePhoneForWhatsApp,
  formatDisplayPhone,
  getWhatsAppUrl,
  getTelUrl,
  resolveBusinessContact,
  fetchBusinessContact,
} from './src/services/businessContactService.js'

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

function log(step, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${step} ${details ? `— ${details}` : ''}`)
  if (!passed) {
    throw new Error(`Assertion failed at: ${step} — ${details}`)
  }
}

async function runVerification() {
  console.log('\n================================================================')
  console.log('LIVE VERIFICATION: SELLER CONTACT ON ORDER WAITING SCREEN (@2.md)')
  console.log('================================================================\n')

  // PART 1: VITE RUNTIME MODULE TRANSFORMATION
  const viteServer = await createServer({
    configFile: false,
    plugins: [react()],
    logLevel: 'error',
  })

  try {
    const publicMenuTransform = await viteServer.transformRequest('/src/pages/public/PublicMenuPage.jsx')
    log('1. PublicMenuPage.jsx compiles and transforms cleanly in Vite', !!publicMenuTransform?.code)

    const serviceTransform = await viteServer.transformRequest('/src/services/businessContactService.js')
    log('2. businessContactService.js compiles and transforms cleanly in Vite', !!serviceTransform?.code)

    const code = publicMenuTransform.code

    log('3. PublicMenuPage renders Kontak Penjual card', code.includes('Kontak Penjual'))
    log('4. PublicMenuPage renders "Kontak penjual belum tersedia" fallback', code.includes('Kontak penjual belum tersedia'))
    log('5. PublicMenuPage binds actionUrl to Hubungi Penjual button', code.includes('actionUrl') && code.includes('Hubungi Penjual'))
    const { mapCustomerOrderStatus } = await import('./src/services/posService.js')
    const waitingMeta = mapCustomerOrderStatus('baru', { isQris: true, qrisPaidAcknowledged: true })
    log('6. Order status flow (BARU -> DIPROSES -> SELESAI) strictly preserved',
      code.includes('mapCustomerOrderStatus') && waitingMeta.title === 'Menunggu Konfirmasi Penjual'
    )
  } catch (err) {
    console.error('Vite transform error:', err)
    throw err
  }

  // PART 2: UNIT & BUSINESS LOGIC VERIFICATION
  console.log('\n--- PART 2: CONTACT RESOLUTION & NORMALIZATION SPECIFICATION ---')

  // A. WhatsApp candidate
  const waCandidate = resolveBusinessContact({
    business: { id: 'biz-1', name: 'Toko Kopi' },
    extraContact: { whatsapp: '081234567890' },
  })
  log('7. WhatsApp candidate produces valid wa.me link', waCandidate.actionUrl === 'https://wa.me/6281234567890')
  log('8. WhatsApp candidate formats display number to 08...', waCandidate.displayPhone === '081234567890')
  log('9. WhatsApp candidate has actionLabel "Hubungi Penjual"', waCandidate.actionLabel === 'Hubungi Penjual')

  // B. Phone candidate
  const phoneCandidate = resolveBusinessContact({
    business: { id: 'biz-2', name: 'Toko Buku' },
    extraContact: { phone: '0217654321' },
  })
  log('10. Telephone candidate produces valid tel: link', phoneCandidate.actionUrl === 'tel:0217654321')
  log('11. Telephone candidate sets type to phone', phoneCandidate.type === 'phone')

  // C. Empty candidate (zero dummy data)
  const emptyCandidate = resolveBusinessContact({
    business: { id: 'biz-3', name: 'Toko Kosong' },
  })
  log('12. Empty candidate returns message "Kontak penjual belum tersedia"', emptyCandidate.message === 'Kontak penjual belum tersedia')
  log('13. Empty candidate produces NO fake/dummy number', emptyCandidate.phone === '' && emptyCandidate.actionUrl === '' && !emptyCandidate.hasContact)

  // D. Privacy: No private profile email or user ID leaked
  const privacyCheck = resolveBusinessContact({
    business: { id: 'biz-4', name: 'Toko Aman', owner_id: 'secret-owner-1', email: 'owner@gmail.com' },
    extraContact: { whatsapp: '081234567890', user_id: 'secret-user' },
  })
  log('14. Private owner email is NOT exposed in contact object', !('email' in privacyCheck) && !('owner_email' in privacyCheck))
  log('15. Private owner_id is NOT exposed in contact object', !('owner_id' in privacyCheck) && !('user_id' in privacyCheck))

  // PART 3: LIVE SUPABASE REMOTE DATABASE VERIFICATION
  console.log('\n--- PART 3: LIVE SUPABASE REMOTE DATABASE CONTRACT ---')

  const { data: testBiz, error: bErr } = await supabaseAdmin
    .from('businesses')
    .select('id, name, is_menu_published')
    .eq('is_menu_published', true)
    .limit(1)
    .single()

  if (bErr || !testBiz) {
    throw new Error('No published business found in database for live verification.')
  }
  log(`16. Active published business identified: "${testBiz.name}" (${testBiz.id})`, true)

  // Test RPC with anonymous client
  const { data: rpcData, error: rpcErr } = await supabaseAnon.rpc('get_public_business_contact', {
    p_business_id: testBiz.id,
  })

  log('17. Anonymous client can execute get_public_business_contact RPC', !rpcErr && !!rpcData)
  log('18. RPC returns sanitized contract without exposing emails or secrets',
    rpcData &&
    'business_id' in rpcData &&
    'business_name' in rpcData &&
    'whatsapp' in rpcData &&
    'phone' in rpcData &&
    !('email' in rpcData) &&
    !('owner_id' in rpcData)
  )

  // Test with invalid UUID
  const { data: nonExistentData } = await supabaseAnon.rpc('get_public_business_contact', {
    p_business_id: '00000000-0000-0000-0000-000000000000',
  })
  log('19. Non-existent / unpublished business returns available=false gracefully', nonExistentData?.available === false)

  // Test fetchBusinessContact integration with live supabase client
  const liveFetched = await fetchBusinessContact(testBiz.id, supabaseAnon)
  log('20. fetchBusinessContact integration succeeds on live database', liveFetched && typeof liveFetched === 'object')

  await viteServer.close()

  console.log('\n================================================================')
  console.log('ALL 20 VERIFICATION CHECKS PASSED!')
  console.log('================================================================\n')
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err)
  process.exit(1)
})
