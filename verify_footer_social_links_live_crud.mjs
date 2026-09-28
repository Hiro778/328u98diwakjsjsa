// verify_footer_social_links_live_crud.mjs
// Live CRUD Verification for Footer Social Links against remote Supabase (@42.md)
// Tests:
// 1. Admin create social link -> row persisted
// 2. Public read -> enabled=true visible, enabled=false hidden
// 3. Admin update -> URL/label/platform changed and persisted across fresh client
// 4. Admin disable -> public RPC excludes disabled link
// 5. Admin reorder -> sort_order persisted and public ordering matches
// 6. Admin delete -> row completely removed
// 7. Security:
//    - anon mutation -> DENIED
//    - normal user mutation -> DENIED
//    - admin mutation -> PASS
//    - dangerous protocols (javascript:, data:, vbscript:) -> DENIED
//    - public reads enabled only
// 8. No duplicate links left behind
// 9. Cleanup all test data

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

function log(step, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${step} ${details ? `— ${details}` : ''}`)
  if (!passed) {
    throw new Error(`Assertion failed: ${step} — ${details}`)
  }
}

async function runLiveVerification() {
  console.log('\n================================================================')
  console.log('STARTING LIVE SUPABASE VERIFICATION: FOOTER SOCIAL LINKS (@42.md)')
  console.log('================================================================\n')

  let testAdminUser = null
  let testAdminClient = null
  let testNormalUser = null
  let testNormalClient = null

  const createdLinkIds = []

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision isolated Admin and Normal Authenticated Users
    // -----------------------------------------------------------------
    const stamp = Date.now()
    const adminEmail = `e2e_admin_social_${stamp}@bisnissehat.id`
    const normalEmail = `e2e_normal_social_${stamp}@bisnissehat.id`
    const password = `T3st#Pass!${stamp}`

    // 1. Create Admin User
    const { data: adminAuth, error: adminAuthErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Social Links Admin' },
    })
    if (adminAuthErr || !adminAuth?.user) throw new Error(`Failed to create admin user: ${adminAuthErr?.message}`)
    testAdminUser = adminAuth.user

    await supabaseAdmin.from('profiles').upsert({
      id: testAdminUser.id,
      email: adminEmail,
      full_name: 'E2E Social Links Admin',
      status: 'active',
    })

    const { error: rbacErr } = await supabaseAdmin.from('admin_users').insert({
      user_id: testAdminUser.id,
      role: 'ADMIN',
    })
    if (rbacErr) throw new Error(`Failed to grant admin role: ${rbacErr.message}`)

    testAdminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    const { error: adminSignErr } = await testAdminClient.auth.signInWithPassword({
      email: adminEmail,
      password,
    })
    if (adminSignErr) throw new Error(`Failed to sign in as admin: ${adminSignErr.message}`)

    // 2. Create Normal User (non-admin)
    const { data: normalAuth, error: normalAuthErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Normal User' },
    })
    if (normalAuthErr || !normalAuth?.user) throw new Error(`Failed to create normal user: ${normalAuthErr?.message}`)
    testNormalUser = normalAuth.user

    await supabaseAdmin.from('profiles').upsert({
      id: testNormalUser.id,
      email: normalEmail,
      full_name: 'E2E Normal User',
      status: 'active',
    })

    testNormalClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    const { error: normalSignErr } = await testNormalClient.auth.signInWithPassword({
      email: normalEmail,
      password,
    })
    if (normalSignErr) throw new Error(`Failed to sign in as normal user: ${normalSignErr.message}`)

    console.log('✅ Setup: Created isolated Admin and Normal test sessions successfully.\n')

    // -----------------------------------------------------------------
    // TEST 1: Admin Create Social Link -> Row Persisted
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Admin Create Social Link ---')
    const { data: createId1, error: createErr1 } = await testAdminClient.rpc('admin_create_footer_social_link', {
      p_platform: 'instagram',
      p_label: 'Instagram BisnisSehat Test',
      p_url: 'https://instagram.com/bisnissehat_test',
      p_enabled: true,
      p_sort_order: 1,
    })
    log('1.1 Admin create footer social link RPC succeeds', !createErr1 && !!createId1, `Created ID: ${createId1}`)
    createdLinkIds.push(createId1)

    // Direct check in DB
    const { data: checkRow1, error: checkErr1 } = await supabaseAdmin
      .from('footer_social_links')
      .select('*')
      .eq('id', createId1)
      .single()

    log('1.2 Row is actually persisted in database with correct fields',
      !checkErr1 &&
      checkRow1?.platform === 'instagram' &&
      checkRow1?.label === 'Instagram BisnisSehat Test' &&
      checkRow1?.url === 'https://instagram.com/bisnissehat_test' &&
      checkRow1?.enabled === true &&
      checkRow1?.sort_order === 1
    )

    // -----------------------------------------------------------------
    // TEST 2: Public Read -> enabled=true Visible, enabled=false Hidden
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Public Read (enabled=true vs enabled=false) ---')
    // Create a disabled link
    const { data: createId2, error: createErr2 } = await testAdminClient.rpc('admin_create_footer_social_link', {
      p_platform: 'tiktok',
      p_label: 'TikTok Disabled Test',
      p_url: 'https://tiktok.com/@bisnissehat_disabled',
      p_enabled: false,
      p_sort_order: 2,
    })
    log('2.1 Admin creates disabled social link', !createErr2 && !!createId2, `Created ID: ${createId2}`)
    createdLinkIds.push(createId2)

    // Public RPC read
    const { data: publicLinks, error: pubErr } = await supabaseAnon.rpc('get_footer_social_links')
    log('2.2 Public RPC get_footer_social_links() succeeds', !pubErr && Array.isArray(publicLinks))

    const publicHasLink1 = publicLinks?.some((l) => l.id === createId1)
    const publicHasLink2 = publicLinks?.some((l) => l.id === createId2)
    log('2.3 Public read returns enabled=true link', publicHasLink1, `Link 1 found: ${publicHasLink1}`)
    log('2.4 Public read HIDES enabled=false link', !publicHasLink2, `Link 2 hidden: ${!publicHasLink2}`)

    // Public direct table SELECT via anon RLS
    const { data: anonDirectRows, error: anonDirectErr } = await supabaseAnon
      .from('footer_social_links')
      .select('*')
      .in('id', [createId1, createId2])

    const anonSeesEnabledOnly = !anonDirectErr &&
      anonDirectRows.some((r) => r.id === createId1) &&
      !anonDirectRows.some((r) => r.id === createId2)
    log('2.5 Public table SELECT via RLS returns enabled=true only', anonSeesEnabledOnly)

    // -----------------------------------------------------------------
    // TEST 3: Admin Update -> URL, Label, Platform Changed & Persisted across Fresh Client
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Admin Update & Fresh Client Persistence ---')
    const { error: updateErr } = await testAdminClient.rpc('admin_update_footer_social_link', {
      p_id: createId1,
      p_platform: 'youtube',
      p_label: 'YouTube BisnisSehat Updated',
      p_url: 'https://youtube.com/@bisnissehat_updated',
      p_enabled: true,
      p_sort_order: 5,
    })
    log('3.1 Admin update RPC executed without error', !updateErr, updateErr ? updateErr.message : '')

    // Fresh client instance directly to Supabase to verify persistence
    const freshClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: freshRow, error: freshErr } = await freshClient
      .from('footer_social_links')
      .select('*')
      .eq('id', createId1)
      .single()

    const updatePersisted = !freshErr &&
      freshRow?.platform === 'youtube' &&
      freshRow?.label === 'YouTube BisnisSehat Updated' &&
      freshRow?.url === 'https://youtube.com/@bisnissehat_updated' &&
      freshRow?.sort_order === 5
    log('3.2 Fresh client confirms URL, label, platform, sort_order persisted in DB', updatePersisted, JSON.stringify({
      platform: freshRow?.platform,
      label: freshRow?.label,
      url: freshRow?.url,
      sort_order: freshRow?.sort_order,
    }))

    // -----------------------------------------------------------------
    // TEST 4: Admin Disable -> Public RPC no longer returns it
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Admin Disable ---')
    const { error: toggleErr } = await testAdminClient.rpc('admin_toggle_footer_social_link', {
      p_id: createId1,
      p_enabled: false,
    })
    log('4.1 Admin toggle disable executed without error', !toggleErr)

    const { data: publicAfterDisable } = await supabaseAnon.rpc('get_footer_social_links')
    const isNowHidden = !(publicAfterDisable || []).some((l) => l.id === createId1)
    log('4.2 Public RPC get_footer_social_links() no longer returns disabled link', isNowHidden)

    // Re-enable for subsequent ordering test
    await testAdminClient.rpc('admin_toggle_footer_social_link', {
      p_id: createId1,
      p_enabled: true,
    })

    // -----------------------------------------------------------------
    // TEST 5: Admin Reorder -> sort_order persisted and public ordering matches
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Admin Reorder ---')
    // Create link 3
    const { data: createId3, error: createErr3 } = await testAdminClient.rpc('admin_create_footer_social_link', {
      p_platform: 'whatsapp',
      p_label: 'WhatsApp Priority 1',
      p_url: 'https://wa.me/6281234567899',
      p_enabled: true,
      p_sort_order: 1, // smaller sort_order should come first
    })
    createdLinkIds.push(createId3)

    // Set link 1 to sort_order 10
    await testAdminClient.rpc('admin_update_footer_social_link', {
      p_id: createId1,
      p_platform: 'youtube',
      p_label: 'YouTube BisnisSehat Updated',
      p_url: 'https://youtube.com/@bisnissehat_updated',
      p_enabled: true,
      p_sort_order: 10,
    })

    // Fetch public list
    const { data: orderedPublicLinks, error: orderErr } = await supabaseAnon.rpc('get_footer_social_links')
    log('5.1 Public RPC returned ordered list', !orderErr && Array.isArray(orderedPublicLinks))

    const index3 = orderedPublicLinks.findIndex((l) => l.id === createId3)
    const index1 = orderedPublicLinks.findIndex((l) => l.id === createId1)
    const orderingCorrect = index3 !== -1 && index1 !== -1 && index3 < index1
    log('5.2 Link with sort_order 1 appears BEFORE sort_order 10 in public output', orderingCorrect, `Index 3: ${index3}, Index 1: ${index1}`)

    // -----------------------------------------------------------------
    // TEST 6: Admin Delete -> Row completely removed
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Admin Delete ---')
    const { error: delErr } = await testAdminClient.rpc('admin_delete_footer_social_link', {
      p_id: createId2,
    })
    log('6.1 Admin delete RPC executed without error', !delErr)

    const { data: deletedRowCheck, error: delCheckErr } = await supabaseAdmin
      .from('footer_social_links')
      .select('id')
      .eq('id', createId2)
      .maybeSingle()

    log('6.2 Row is completely removed from database', !deletedRowCheck, `Result: ${JSON.stringify(deletedRowCheck)}`)
    // Remove from tracking array since already deleted
    const id2Index = createdLinkIds.indexOf(createId2)
    if (id2Index > -1) createdLinkIds.splice(id2Index, 1)

    // -----------------------------------------------------------------
    // TEST 7: Security: Zero Trust & Scheme Validation
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Security & Adversarial Hardening ---')

    // 7.1 Anon mutation: direct INSERT denied
    const { error: anonInsertErr } = await supabaseAnon
      .from('footer_social_links')
      .insert({
        platform: 'custom',
        label: 'Anon Hacked Link',
        url: 'https://evil.com',
        enabled: true,
      })
    const anonInsertDenied = Boolean(anonInsertErr && (anonInsertErr.code === '42501' || anonInsertErr.message.includes('violates row-level security policy') || anonInsertErr.message.includes('permission denied')))
    log('7.1 Anon direct INSERT to footer_social_links DENIED via RLS', anonInsertDenied, anonInsertErr?.message)

    // 7.2 Anon RPC call denied
    const { error: anonRpcErr } = await supabaseAnon.rpc('admin_create_footer_social_link', {
      p_platform: 'custom',
      p_label: 'Anon RPC Hack',
      p_url: 'https://evil.com',
    })
    const anonRpcDenied = Boolean(anonRpcErr && (anonRpcErr.code === '42501' || anonRpcErr.message.includes('Akses ditolak') || anonRpcErr.message.includes('ADMIN_REQUIRED')))
    log('7.2 Anon admin_create_footer_social_link RPC DENIED', anonRpcDenied, anonRpcErr?.message)

    // 7.3 Normal authenticated user direct INSERT denied
    const { error: normalInsertErr } = await testNormalClient
      .from('footer_social_links')
      .insert({
        platform: 'custom',
        label: 'Normal User Hacked Link',
        url: 'https://evil.com',
        enabled: true,
      })
    const normalInsertDenied = Boolean(normalInsertErr && (normalInsertErr.code === '42501' || normalInsertErr.message.includes('violates row-level security policy') || normalInsertErr.message.includes('permission denied')))
    log('7.3 Normal authenticated user direct INSERT DENIED via RLS', normalInsertDenied, normalInsertErr?.message)

    // 7.4 Normal authenticated user RPC call denied
    const { error: normalRpcErr } = await testNormalClient.rpc('admin_create_footer_social_link', {
      p_platform: 'custom',
      p_label: 'Normal RPC Hack',
      p_url: 'https://evil.com',
    })
    const normalRpcDenied = Boolean(normalRpcErr && (normalRpcErr.code === '42501' || normalRpcErr.message.includes('Akses ditolak') || normalRpcErr.message.includes('ADMIN_REQUIRED')))
    log('7.4 Normal authenticated user admin_create_footer_social_link RPC DENIED', normalRpcDenied, normalRpcErr?.message)

    // 7.5 Normal authenticated user delete denied
    const { error: normalDelErr } = await testNormalClient.rpc('admin_delete_footer_social_link', {
      p_id: createId1,
    })
    const normalDelDenied = Boolean(normalDelErr && (normalDelErr.code === '42501' || normalDelErr.message.includes('Akses ditolak') || normalDelErr.message.includes('ADMIN_REQUIRED')))
    log('7.5 Normal authenticated user admin_delete_footer_social_link RPC DENIED', normalDelDenied, normalDelErr?.message)

    // 7.6 Dangerous URL schemes strictly DENIED by database validation
    const dangerousUrls = [
      'javascript:alert("XSS")',
      'javascript:void(0)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox("pwnd")',
      'file:///etc/passwd',
    ]

    for (const badUrl of dangerousUrls) {
      const { error: badErr } = await testAdminClient.rpc('admin_create_footer_social_link', {
        p_platform: 'custom',
        p_label: 'Dangerous Link Test',
        p_url: badUrl,
      })
      const isBlocked = Boolean(badErr && (badErr.message.includes('INVALID_URL') || badErr.message.includes('skema berbahaya')))
      log(`7.6 Dangerous URL blocked [${badUrl.slice(0, 20)}...]`, isBlocked, badErr?.message)
    }

    // -----------------------------------------------------------------
    // TEST 8: Check for Duplicates resulting from tests
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: Duplicate Check ---')
    const { data: allAdminLinks, error: allErr } = await testAdminClient.rpc('admin_get_all_footer_social_links')
    log('8.1 Admin get all links succeeded', !allErr && Array.isArray(allAdminLinks))

    const testCreatedInAdmin = allAdminLinks.filter((l) => createdLinkIds.includes(l.id))
    const idsSet = new Set(testCreatedInAdmin.map((l) => l.id))
    const noDuplicates = idsSet.size === testCreatedInAdmin.length
    log('8.2 No duplicate social links detected in test scope', noDuplicates, `Active test records: ${testCreatedInAdmin.length}`)

  } finally {
    // -----------------------------------------------------------------
    // TEST 9: Cleanup Test Data
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: Cleanup Test Data ---')
    for (const linkId of createdLinkIds) {
      try {
        await supabaseAdmin.from('footer_social_links').delete().eq('id', linkId)
      } catch (e) {
        console.error(`Failed to cleanup link ${linkId}:`, e.message)
      }
    }
    log('9.1 Cleaned up all created test social links from footer_social_links', true)

    if (testAdminUser) {
      try {
        await supabaseAdmin.from('admin_users').delete().eq('user_id', testAdminUser.id)
        await supabaseAdmin.from('profiles').delete().eq('id', testAdminUser.id)
        await supabaseAdmin.auth.admin.deleteUser(testAdminUser.id)
        log('9.2 Cleaned up test admin user & auth session', true)
      } catch (e) {
        console.error('Failed to cleanup admin user:', e.message)
      }
    }

    if (testNormalUser) {
      try {
        await supabaseAdmin.from('profiles').delete().eq('id', testNormalUser.id)
        await supabaseAdmin.auth.admin.deleteUser(testNormalUser.id)
        log('9.3 Cleaned up test normal user & auth session', true)
      } catch (e) {
        console.error('Failed to cleanup normal user:', e.message)
      }
    }

    // Final verification that test items are zero
    const { count: finalCount } = await supabaseAdmin
      .from('footer_social_links')
      .select('*', { count: 'exact', head: true })
      .in('id', createdLinkIds)

    log('9.4 Verified test records count in DB is exactly 0', finalCount === 0, `Remaining: ${finalCount}`)
  }

  console.log('\n================================================================')
  console.log('🎉 ALL LIVE SUPABASE FOOTER SOCIAL LINKS VERIFICATION CHECKS PASSED!')
  console.log('================================================================\n')
}

runLiveVerification().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err)
  process.exit(1)
})
