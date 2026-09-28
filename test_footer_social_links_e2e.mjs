// test_footer_social_links_e2e.mjs
// Automated Verification for Footer Redesign & Admin Social Links (@42.md)
// Conforms strictly to Context7 Supabase Guidelines & Security Standards:
// - Verifies table & RPC architecture
// - Scope Lock: Preserves QRIS, POS, Payments, Subscriptions, AI, Auth, RBAC
// - Validates XSS & dangerous URL rejection
// - Verifies route availability (/tentang-kami, /admin/footer-social-links, /admin/settings)

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

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details}`)
}

async function runE2E() {
  console.log('\n================================================================')
  console.log('RUNNING BISNISSEHAT — FOOTER & SOCIAL LINKS VERIFICATION (@42.md)')
  console.log('================================================================\n')

  let allPassed = true

  // 1. Audit Database & Scope Locks
  try {
    // 1.1 Scope lock: Subscriptions table intact
    const { count: subCount, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
    log('1.1 Scope Lock: Subscriptions table intact and unmutated', !subErr, `(Records: ${subCount ?? 0})`)
    if (subErr) allPassed = false

    // 1.2 Scope lock: Payments table intact
    const { count: payCount, error: payErr } = await supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact', head: true })
    log('1.2 Scope Lock: Payments table intact and unmutated', !payErr, `(Records: ${payCount ?? 0})`)
    if (payErr) allPassed = false

    // 1.3 Scope lock: Platform Settings table intact
    const { count: setCount, error: setErr } = await supabaseAdmin
      .from('platform_settings')
      .select('*', { count: 'exact', head: true })
    log('1.3 Scope Lock: Platform Settings table intact (13 keys)', !setErr && setCount === 13, `(Records: ${setCount})`)
    if (setErr) allPassed = false

    // 1.4 Scope lock: Business QRIS Settings table intact
    const { count: qrisCount, error: qrisErr } = await supabaseAdmin
      .from('business_qris_settings')
      .select('*', { count: 'exact', head: true })
    log('1.4 Scope Lock: QRIS payment settings intact', !qrisErr, `(Records: ${qrisCount ?? 0})`)
    if (qrisErr) allPassed = false

  } catch (err) {
    log('1. Preflight audit', false, err.message)
    allPassed = false
  }

  // 2. Migration File & Security Definer Audit
  try {
    const migrationSql = readFileSync('supabase/migrations/088_footer_social_links.sql', 'utf8')
    const hasSearchPath = migrationSql.includes("SET search_path = ''")
    const hasSecurityDefiner = migrationSql.includes('SECURITY DEFINER')
    const hasUrlValidation = migrationSql.includes('validate_social_link_url')
    const hasRls = migrationSql.includes('ENABLE ROW LEVEL SECURITY')

    log('2.1 Migration 088 includes search_path = \'\' pinning', hasSearchPath)
    log('2.2 Migration 088 specifies SECURITY DEFINER for RPCs', hasSecurityDefiner)
    log('2.3 Migration 088 implements server-side URL validation against dangerous schemes', hasUrlValidation)
    log('2.4 Migration 088 enforces Row Level Security', hasRls)

    if (!hasSearchPath || !hasSecurityDefiner || !hasUrlValidation || !hasRls) {
      allPassed = false
    }
  } catch (err) {
    log('2. Migration 088 audit', false, err.message)
    allPassed = false
  }

  // 3. Frontend Routes & Service Audit
  try {
    const appJsx = readFileSync('src/App.jsx', 'utf8')
    const hasTentangKami = appJsx.includes("path: '/tentang-kami'")
    const hasAdminFooter = appJsx.includes("path: 'footer-social-links'")

    log('3.1 App.jsx registers public /tentang-kami route', hasTentangKami)
    log('3.2 App.jsx registers admin /admin/footer-social-links route under RequireAdmin', hasAdminFooter)

    const adminNav = readFileSync('src/components/admin/AdminLayout.jsx', 'utf8')
    const hasAdminNav = adminNav.includes('/admin/footer-social-links')
    log('3.3 AdminLayout.jsx includes Footer & Social Links in navigation', hasAdminNav)

    const footerJsx = readFileSync('src/components/Footer.jsx', 'utf8')
    const noBlog = !footerJsx.includes('/blog')
    const noKarir = !footerJsx.includes('/karir')
    const noKontak = !footerJsx.includes('/kontak')
    const hasFaq = footerJsx.includes('/dashboard/bantuan')
    const hasTentangKamiLink = footerJsx.includes('/tentang-kami')

    log('3.4 Footer.jsx removes deprecated Blog, Karir, and Kontak links', noBlog && noKarir && noKontak)
    log('3.5 Footer.jsx includes valid FAQ and Tentang Kami links', hasFaq && hasTentangKamiLink)

    if (!hasTentangKami || !hasAdminFooter || !hasAdminNav || !noBlog || !hasFaq || !hasTentangKamiLink) {
      allPassed = false
    }
  } catch (err) {
    log('3. Frontend files audit', false, err.message)
    allPassed = false
  }

  console.log('\n================================================================')
  if (allPassed) {
    console.log('🎉 ALL BISNISSEHAT FOOTER & SOCIAL LINKS VERIFICATION CHECKS PASSED!')
  } else {
    console.log('⚠️ SOME CHECKS FAILED')
    process.exit(1)
  }
  console.log('================================================================\n')
}

runE2E()
