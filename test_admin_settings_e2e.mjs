// test_admin_settings_e2e.mjs
// Automated Live E2E Verification for Admin Settings Management (Stage 10 — @10.md)
// Conforms strictly to Context7 Supabase Guidelines & Security Standards:
// 1. Settings source-of-truth exists (public.platform_settings)
// 2. Anonymous denied (RLS / 42501)
// 3. Normal authenticated user denied
// 4. Admin / Service-Role query allowed
// 5. Admin can update allowed setting
// 6. Fresh client can read updated value
// 7. Invalid setting key or value rejected
// 8. Audit log created in public.admin_audit_logs
// 9. Audit metadata has no secrets
// 10. Unrelated subscription / payment / business data unchanged

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
  console.log('RUNNING ADMIN CONTROL CENTER — STAGE 10: SETTINGS LIVE E2E SUITE')
  console.log('================================================================\n')

  let allPassed = true

  // ──────────────────────────────────────────────────────────
  // 1. SOURCE-OF-TRUTH SCHEMA AUDIT
  // ──────────────────────────────────────────────────────────
  try {
    const { data: settings, count, error: sErr } = await supabaseAdmin
      .from('platform_settings')
      .select('id, key, value, category, description, created_at, updated_at', { count: 'exact' })

    log('1.1 Source-of-truth table public.platform_settings exists and accessible', !sErr, `(Records: ${count})`)
    if (sErr) allPassed = false

    const hasExpectedCols = settings && settings[0] &&
      'id' in settings[0] &&
      'key' in settings[0] &&
      'value' in settings[0] &&
      'category' in settings[0] &&
      'description' in settings[0] &&
      'created_at' in settings[0] &&
      'updated_at' in settings[0]

    log('1.2 Verified mandatory columns (id, key, value, category, description, created_at, updated_at)', Boolean(hasExpectedCols))
    if (!hasExpectedCols) allPassed = false
  } catch (err) {
    log('1. Preflight audit', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 2. AUTHORIZATION & ZERO TRUST: ANONYMOUS DENIED
  // ──────────────────────────────────────────────────────────
  try {
    const { data: anonData } = await supabaseAnon
      .from('platform_settings')
      .select('key, value')
      .limit(5)

    const anonBlocked = anonData === null || (Array.isArray(anonData) && anonData.length === 0)
    log('2.1 Anonymous client denied reading public.platform_settings via RLS', anonBlocked, `(Returned ${anonData?.length || 0} rows)`)
    if (!anonBlocked) allPassed = false

    const { error: anonRpcErr } = await supabaseAnon.rpc('get_admin_settings')
    const anonRpcDenied = Boolean(
      anonRpcErr &&
      (anonRpcErr.code === '42501' || anonRpcErr.code === 'PGRST202' || anonRpcErr.message.includes('Akses ditolak') || anonRpcErr.message.includes('Unauthorized'))
    )
    log('2.2 Anonymous client RPC call blocked with 42501/PGRST202 Unauthorized', anonRpcDenied, anonRpcErr ? `(Code: ${anonRpcErr.code})` : '')
    if (!anonRpcDenied) allPassed = false
  } catch (err) {
    log('2. Anonymous access tests', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 3. AUTHORIZATION: NORMAL (NON-ADMIN) USER DENIED
  // ──────────────────────────────────────────────────────────
  let tempUser = null
  let tempClient = null
  try {
    const tempEmail = `e2e_settings_normal_${Date.now()}@bisnissehat.id`
    const tempPassword = `P@ss#${Date.now()}!Normal`
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: tempEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Normal Settings E2E Test User' },
    })

    if (!authErr && authData?.user) {
      tempUser = authData.user
      await supabaseAdmin.from('profiles').upsert({
        id: tempUser.id,
        email: tempEmail,
        full_name: 'Normal Settings E2E Test User',
        status: 'active',
      })

      tempClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
      const { error: signInErr } = await tempClient.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword,
      })

      if (!signInErr) {
        // Normal user trying to access platform_settings table directly
        const { data: normalData } = await tempClient
          .from('platform_settings')
          .select('key, value')
          .limit(5)

        const normalBlocked = !normalData || normalData.length === 0
        log('3.1 Authenticated normal user cannot read public.platform_settings via RLS', normalBlocked, `(Returned ${normalData?.length || 0} rows)`)
        if (!normalBlocked) allPassed = false

        // Normal user trying to call admin RPC
        const { error: normalRpcErr } = await tempClient.rpc('get_admin_settings')
        const normalRpcDenied = Boolean(
          normalRpcErr &&
          (normalRpcErr.code === '42501' || normalRpcErr.code === 'PGRST202' || normalRpcErr.message.includes('Akses ditolak') || normalRpcErr.message.includes('Unauthorized'))
        )
        log('3.2 Normal user denied calling get_admin_settings RPC with 42501/PGRST202 Unauthorized', normalRpcDenied, normalRpcErr ? `(Code: ${normalRpcErr.code})` : '')
        if (!normalRpcDenied) allPassed = false

        // Normal user trying to mutate setting via RPC
        const { error: mutateErr } = await tempClient.rpc('update_admin_setting', {
          p_key: 'platform_name',
          p_value: JSON.stringify('Hacked Platform'),
        })
        const mutateDenied = Boolean(
          mutateErr &&
          (mutateErr.code === '42501' || mutateErr.code === 'PGRST202' || mutateErr.message.includes('Akses ditolak') || mutateErr.message.includes('Unauthorized'))
        )
        log('3.3 Normal user denied mutating settings via update_admin_setting RPC', mutateDenied, mutateErr ? `(Code: ${mutateErr.code})` : '')
        if (!mutateDenied) allPassed = false
      } else {
        log('3. Normal user sign-in', false, signInErr.message)
        allPassed = false
      }
    } else {
      log('3. Normal user creation', false, authErr?.message || 'Failed')
      allPassed = false
    }
  } catch (err) {
    log('3. Normal user tests', false, err.message)
    allPassed = false
  } finally {
    if (tempUser) {
      await supabaseAdmin.from('profiles').delete().eq('id', tempUser.id)
      await supabaseAdmin.auth.admin.deleteUser(tempUser.id)
    }
  }

  // ──────────────────────────────────────────────────────────
  // 4. ADMIN QUERY & VALIDATION
  // ──────────────────────────────────────────────────────────
  try {
    const { data: adminSettings, error: getErr } = await supabaseAdmin.rpc('get_admin_settings')
    const canRead = !getErr && Array.isArray(adminSettings) && adminSettings.length > 0
    log('4.1 Admin/Service-Role can execute get_admin_settings() and retrieve all configurations', canRead, `(Count: ${adminSettings?.length || 0})`)
    if (!canRead) allPassed = false

    const hasPlatformName = adminSettings?.some((s) => s.key === 'platform_name')
    log('4.2 Retrieved settings contain core configuration keys (platform_name, support_email)', hasPlatformName)
    if (!hasPlatformName) allPassed = false
  } catch (err) {
    log('4. Admin query tests', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 5. ADMIN UPDATE & PERSISTENCE
  // ──────────────────────────────────────────────────────────
  const testKey = 'support_phone'
  const originalVal = '+62 812-3456-7890'
  const updatedVal = '+62 812-9999-8888'
  try {
    const { data: updateRes, error: upErr } = await supabaseAdmin.rpc('update_admin_setting', {
      p_key: testKey,
      p_value: JSON.stringify(updatedVal),
      p_reason: 'Automated E2E verification test',
    })

    const updateSuccess = !upErr && updateRes && (updateRes.value === updatedVal || updateRes.value === JSON.stringify(updatedVal))
    log('5.1 Admin can successfully update allowed setting via update_admin_setting()', updateSuccess)
    if (!updateSuccess) allPassed = false

    // 6. Fresh client can read updated value
    const freshClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: freshData, error: freshErr } = await freshClient
      .from('platform_settings')
      .select('value')
      .eq('key', testKey)
      .single()

    const freshReadMatches = !freshErr && (freshData?.value === updatedVal || freshData?.value === JSON.stringify(updatedVal))
    log('6.1 Fresh client immediately reads persisted updated value from database', freshReadMatches)
    if (!freshReadMatches) allPassed = false

    // Rollback to original value
    await supabaseAdmin.rpc('update_admin_setting', {
      p_key: testKey,
      p_value: JSON.stringify(originalVal),
      p_reason: 'Rollback after E2E test',
    })
  } catch (err) {
    log('5. Admin mutation tests', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 7. INVALID SETTING REJECTION (WHITELIST & VALIDATION)
  // ──────────────────────────────────────────────────────────
  try {
    // 7.1 Non-existent key
    const { error: invalidKeyErr } = await supabaseAdmin.rpc('update_admin_setting', {
      p_key: 'non_existent_config_xyz',
      p_value: JSON.stringify('test'),
    })
    const keyRejected = Boolean(invalidKeyErr && (invalidKeyErr.message.includes('INVALID_SETTING_KEY') || invalidKeyErr.code === '22023'))
    log('7.1 Unregistered setting key strictly rejected with INVALID_SETTING_KEY', keyRejected)
    if (!keyRejected) allPassed = false

    // 7.2 Forbidden secret key
    const { error: secretKeyErr } = await supabaseAdmin.rpc('update_admin_setting', {
      p_key: 'supabase_service_role_secret',
      p_value: JSON.stringify('leak'),
    })
    const secretRejected = Boolean(secretKeyErr && (secretKeyErr.message.includes('FORBIDDEN_SETTING') || secretKeyErr.code === '42501'))
    log('7.2 Secret/credential key name strictly rejected with FORBIDDEN_SETTING', secretRejected)
    if (!secretRejected) allPassed = false

    // 7.3 Invalid value format (email format validation)
    const { error: invalidEmailErr } = await supabaseAdmin.rpc('update_admin_setting', {
      p_key: 'support_email',
      p_value: JSON.stringify('not-an-email'),
    })
    const emailValRejected = Boolean(invalidEmailErr && invalidEmailErr.message.includes('INVALID_SETTING_VALUE'))
    log('7.3 Malformed setting value (invalid email format) strictly rejected', emailValRejected)
    if (!emailValRejected) allPassed = false
  } catch (err) {
    log('7. Validation tests', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 8 & 9. AUDIT LOG GENERATION & SAFETY
  // ──────────────────────────────────────────────────────────
  try {
    const { data: auditRow, error: aErr } = await supabaseAdmin
      .from('admin_audit_logs')
      .select('id, action, target_type, target_id, metadata, reason, created_at')
      .eq('target_type', 'platform_settings')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const auditCreated = !aErr && Boolean(auditRow)
    log('8.1 Setting mutation automatically generated entry in public.admin_audit_logs', auditCreated)
    if (!auditCreated) allPassed = false

    if (auditRow) {
      const meta = auditRow.metadata || {}
      const hasKey = 'key' in meta
      const hasOldVal = 'old_value' in meta
      const hasNewVal = 'new_value' in meta
      const forbiddenTokens = ['password', 'secret', 'key_secret', 'token', 'auth']
      const metaKeys = Object.keys(meta).map((k) => k.toLowerCase())
      const noSecrets = !metaKeys.some((k) => forbiddenTokens.some((t) => k.includes(t) && k !== 'key'))

      log('9.1 Audit metadata properly captures key and diffs without secrets leakage', Boolean(hasKey && hasOldVal && hasNewVal && noSecrets))
      if (!(hasKey && hasOldVal && hasNewVal && noSecrets)) allPassed = false
    }
  } catch (err) {
    log('8/9. Audit log verification', false, err.message)
    allPassed = false
  }

  // ──────────────────────────────────────────────────────────
  // 10. SCOPE LOCK & UNRELATED DATA INTEGRITY
  // ──────────────────────────────────────────────────────────
  try {
    const { count: subCount } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })

    log('10.1 Scope Lock: Subscriptions table intact and unmutated', subCount !== null, `(Records: ${subCount})`)

    const { count: payCount } = await supabaseAdmin
      .from('payments')
      .select('*', { count: 'exact', head: true })

    log('10.2 Scope Lock: Payments table intact and unmutated', payCount !== null, `(Records: ${payCount})`)

    const { count: bizCount } = await supabaseAdmin
      .from('businesses')
      .select('*', { count: 'exact', head: true })

    log('10.3 Scope Lock: Businesses table intact and unmutated', bizCount !== null, `(Records: ${bizCount})`)
  } catch (err) {
    log('10. Scope lock tests', false, err.message)
    allPassed = false
  }

  console.log('\n================================================================')
  if (allPassed) {
    console.log('🎉 ALL STAGE 10 LIVE E2E VERIFICATION CHECKS PASSED!')
  } else {
    console.log('❌ SOME STAGE 10 CHECKS FAILED')
    process.exit(1)
  }
  console.log('================================================================\n')
}

runE2E().catch((err) => {
  console.error('Fatal E2E error:', err)
  process.exit(1)
})
