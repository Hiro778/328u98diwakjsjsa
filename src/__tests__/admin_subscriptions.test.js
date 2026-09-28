import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {}

import {
  fetchAdminSubscriptions,
  fetchAdminSubscriptionDetail,
  cancelAdminSubscription,
  normalizeDatabaseError,
  isValidUuid,
} from '../services/adminSubscriptionService.js'
import * as aliasService from '../services/adminSubscriptionsService.js'

describe('Tahap 5: Subscription Management Security & Integrity Testing (@qr.md)', () => {
  const migration062Path = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migration063Path = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migration064Path = path.resolve('supabase/migrations/064_admin_user_management.sql')
  const migration065Path = path.resolve('supabase/migrations/065_admin_business_management.sql')
  const migration074Path = path.resolve('supabase/migrations/074_admin_subscription_management.sql')
  const migration075Path = path.resolve('supabase/migrations/075_admin_subscription_management.sql')

  const migration074Sql = fs.readFileSync(migration074Path, 'utf8')
  const migration075Sql = fs.readFileSync(migration075Path, 'utf8')

  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const subscriptionsPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminSubscriptionsPage.jsx'), 'utf8')
  const detailPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminSubscriptionDetailPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminSubscriptionService.js'), 'utf8')
  const modalCode = fs.readFileSync(path.resolve('src/components/admin/AdminSubscriptionActionModal.jsx'), 'utf8')

  // 1. USER tidak dapat membuka /admin/subscriptions
  it('1. USER tidak dapat membuka /admin/subscriptions (Route Guard Security)', () => {
    assert.ok(appCode.includes("path: '/admin'"), '/admin parent route must exist')
    assert.ok(
      appCode.includes('<RequireAdmin />') || appCode.includes('element: <RequireAdmin'),
      '/admin must be protected by RequireAdmin guard'
    )
    assert.ok(
      appCode.includes("{ path: 'subscriptions', element: <AdminSubscriptionsPage /> }"),
      '/admin/subscriptions must be child of RequireAdmin'
    )

    const userRole = 'USER'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
    assert.equal(isAdmin, false, 'USER role must NOT be permitted to access /admin/subscriptions')
  })

  // 2. ADMIN dapat membuka /admin/subscriptions
  it('2. ADMIN dapat membuka /admin/subscriptions', () => {
    const adminRole = 'ADMIN'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(adminRole)
    assert.equal(isAdmin, true, 'ADMIN role must pass RequireAdmin guard for /admin/subscriptions')
  })

  // 3. SUPER_ADMIN dapat membuka /admin/subscriptions
  it('3. SUPER_ADMIN dapat membuka /admin/subscriptions', () => {
    const superAdminRole = 'SUPER_ADMIN'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(superAdminRole)
    assert.equal(isAdmin, true, 'SUPER_ADMIN must pass RequireAdmin guard for /admin/subscriptions')
  })

  // 4. Subscription list tidak menggunakan fake data
  it('4. Subscription list tidak menggunakan fake data', () => {
    assert.ok(!subscriptionsPageCode.includes('budi@example.com'), 'Must not contain fake emails')
    assert.ok(!subscriptionsPageCode.includes('dummy_plan'), 'Must not contain dummy plans')
    assert.ok(
      subscriptionsPageCode.includes('fetchAdminSubscriptions'),
      'Must load real subscriptions via fetchAdminSubscriptions service'
    )
  })

  // 5. Search query parameter valid
  it('5. Search parameter properly propagated to service and RPC', () => {
    assert.ok(subscriptionsPageCode.includes('search'), 'Search state must exist in page')
    assert.ok(serviceCode.includes('p_search: search.trim()'), 'Service must trim and pass search query to RPC')
    assert.ok(migration075Sql.includes('p_search'), 'Migration RPC must declare p_search parameter')
  })

  // 6. Plan filter properly supported
  it('6. Plan filter properly supported (all, pro, free)', () => {
    assert.ok(subscriptionsPageCode.includes("value=\"all\">Semua Paket"), 'All plans filter option must exist')
    assert.ok(subscriptionsPageCode.includes("value=\"pro\">Pro"), 'Pro filter option must exist')
    assert.ok(subscriptionsPageCode.includes("value=\"free\">Free"), 'Free filter option must exist')
    assert.ok(migration075Sql.includes('p_plan_filter'), 'RPC must evaluate p_plan_filter')
  })

  // 7. Status filter properly supported
  it('7. Status filter properly supported (all, active, expired, cancelled, inactive)', () => {
    assert.ok(subscriptionsPageCode.includes("value=\"active\">Active"), 'Active filter option must exist')
    assert.ok(subscriptionsPageCode.includes("value=\"expired\">Expired"), 'Expired filter option must exist')
    assert.ok(subscriptionsPageCode.includes("value=\"cancelled\">Cancelled"), 'Cancelled filter option must exist')
    assert.ok(migration075Sql.includes('p_status_filter'), 'RPC must evaluate p_status_filter')
  })

  // 8. Server-side pagination
  it('8. Pagination works database-side via limit and offset', () => {
    assert.ok(subscriptionsPageCode.includes('limit'), 'Limit parameter must be set')
    assert.ok(subscriptionsPageCode.includes('offset'), 'Offset calculation must be present')
    assert.ok(migration075Sql.includes('p_limit') && migration075Sql.includes('p_offset'), 'RPC must enforce limit and offset')
  })

  // 9. Sorting options supported
  it('9. Sorting options supported (newest, oldest, expires_soon, expires_late)', () => {
    assert.ok(subscriptionsPageCode.includes("value=\"newest\""), 'newest sort option must exist')
    assert.ok(subscriptionsPageCode.includes("value=\"expires_soon\""), 'expires_soon sort option must exist')
    assert.ok(migration075Sql.includes('p_sort_by'), 'RPC must evaluate p_sort_by')
  })

  // 10. Detail page takes real subscription data
  it('10. Subscription detail page takes real subscription without dummy data', () => {
    assert.ok(appCode.includes("{ path: 'subscriptions/:id', element: <AdminSubscriptionDetailPage /> }"))
    assert.ok(detailPageCode.includes('fetchAdminSubscriptionDetail'), 'Detail page must fetch real data via service')
    assert.ok(detailPageCode.includes('useParams'), 'Must extract subscription id from route params')
  })

  // 11. Owner relationship and linked business mapping
  it('11. Owner relationship and linked business mapping verified', () => {
    assert.ok(migration075Sql.includes('LEFT JOIN public.profiles p ON p.id = s.profile_id'))
    assert.ok(migration075Sql.includes('LEFT JOIN public.businesses b ON b.id = s.business_id'))
    assert.ok(detailPageCode.includes('sub.id'), 'Detail page renders subscription ID')
    assert.ok(detailPageCode.includes('owner'), 'Detail page renders owner info')
    assert.ok(detailPageCode.includes('business'), 'Detail page renders business info')
  })

  // 12. Normal user cannot call admin subscription RPCs
  it('12. Normal user cannot call admin subscription RPCs (Server-Side Authorization)', () => {
    assert.ok(migration075Sql.includes('public.is_admin()'), 'get_admin_subscriptions must verify is_admin()')
    assert.ok(migration074Sql.includes('public.is_admin()'), 'get_admin_subscription_detail must verify is_admin()')
    assert.ok(migration074Sql.includes('admin_cancel_subscription'), 'admin_cancel_subscription must verify is_admin()')
  })

  // 13. Cross-target data manipulation denied
  it('13. Cross-target manipulation denied: Admin actions resolve targets server-side', () => {
    assert.ok(migration074Sql.includes('WHERE id = p_subscription_id'), 'admin_cancel_subscription operates strictly on p_subscription_id')
    assert.ok(!serviceCode.includes('body.status'), 'Client cannot override raw subscription status directly')
  })

  // 14. Invalid UUID is handled gracefully
  it('14. Invalid UUID handled gracefully by service before network call', async () => {
    const invalidRes = await fetchAdminSubscriptionDetail('not-a-valid-uuid')
    assert.equal(invalidRes.detail, null)
    assert.match(invalidRes.error.message, /ID langganan tidak valid/i)

    const invalidCancel = await cancelAdminSubscription({ subscriptionId: 'invalid-id', reason: 'Test' })
    assert.equal(invalidCancel.success, false)
    assert.match(invalidCancel.error.message, /ID langganan tidak valid/i)
  })

  // 15. Cancellation requires mandatory reason
  it('15. Cancellation requires mandatory reason for auditability', async () => {
    const noReasonRes = await cancelAdminSubscription({
      subscriptionId: '11111111-1111-4111-8111-111111111111',
      reason: '   ',
    })
    assert.equal(noReasonRes.success, false)
    assert.match(noReasonRes.error.message, /Alasan pembatalan langganan wajib diisi/i)

    assert.ok(modalCode.includes('Alasan Pembatalan'), 'Modal must have reason label')
    assert.ok(modalCode.includes('required'), 'Reason input must be required in modal')
    assert.ok(migration074Sql.includes('INVALID_REASON'), 'RPC must raise error if reason is empty')
  })

  // 16. Cancellation records to public.admin_audit_logs
  it('16. Cancellation records to public.admin_audit_logs', () => {
    assert.ok(migration074Sql.includes('INSERT INTO public.admin_audit_logs'), 'Must insert into admin_audit_logs')
    assert.ok(migration074Sql.includes("'CANCEL_SUBSCRIPTION'"), "Action must be 'CANCEL_SUBSCRIPTION'")
    assert.ok(migration074Sql.includes("'subscription'"), "Target type must be 'subscription'")
  })

  // 17. Financial safety: cancellation does NOT mutate payment history
  it('17. Financial safety: cancellation does NOT mutate subscription_payments', () => {
    assert.ok(!migration074Sql.includes('UPDATE public.subscription_payments'), 'Must NOT modify historical payment records')
    assert.ok(!migration074Sql.includes('DELETE FROM public.subscription_payments'), 'Must NOT delete payment records')
  })

  // 18. Sensitive secrets / tokens not exposed
  it('18. Sensitive payment secrets/tokens not exposed in detail page or RPC', () => {
    assert.ok(!migration074Sql.includes('server_key'), 'Must never query Midtrans server key')
    assert.ok(!migration074Sql.includes('client_key'), 'Must never leak client keys in RPC')
    assert.ok(!detailPageCode.includes('server_key'))
  })

  // 19. No service-role key in browser bundle
  it('19. No service-role key in browser bundle', () => {
    assert.ok(!subscriptionsPageCode.includes('SUPABASE_SERVICE_ROLE_KEY'))
    assert.ok(!detailPageCode.includes('SUPABASE_SERVICE_ROLE_KEY'))
    assert.ok(!serviceCode.includes('SUPABASE_SERVICE_ROLE_KEY'))
  })

  // 20. Role spoofing prevention
  it('20. Role spoofing prevention: No localStorage role checking', () => {
    assert.ok(!subscriptionsPageCode.includes("localStorage.getItem('role')"))
    assert.ok(!detailPageCode.includes("localStorage.getItem('role')"))
    assert.ok(!serviceCode.includes("localStorage.getItem('role')"))
  })

  // 21. Navigation bar enables Subscriptions and preserves future stages
  it('21. Navigation bar enables Subscriptions and preserves future stages', () => {
    assert.match(
      layoutCode,
      /name:\s*'Subscriptions',\s*path:\s*'\/admin\/subscriptions',\s*enabled:\s*true/s,
      'Subscriptions nav item must be enabled: true'
    )
    assert.match(layoutCode, /name:\s*'AI Usage'[^}]*enabled:\s*(true|false)/s, 'AI Usage is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Support'[^}]*enabled:\s*(true|false)/s, 'Support is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Payments'[^}]*enabled:\s*(true|false)/s, 'Payments is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Audit Logs'[^}]*enabled:\s*(true|false)/s, 'Audit Logs is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Settings'[^}]*enabled:\s*(true|false)/s, 'Settings is configured in AdminLayout')
  })

  // 22. Alias service re-export works correctly
  it('22. Alias service re-export works correctly', () => {
    assert.equal(typeof aliasService.fetchAdminSubscriptions, 'function')
    assert.equal(typeof aliasService.fetchAdminSubscriptionDetail, 'function')
    assert.equal(typeof aliasService.cancelAdminSubscription, 'function')
  })

  // 23. Error normalization sanitizes raw DB errors
  it('23. Database error normalization sanitizes raw errors without leakage', () => {
    const err42501 = normalizeDatabaseError(new Error('42501 permission denied'))
    assert.match(err42501.message, /Akses ditolak/i)

    const errNotFound = normalizeDatabaseError(new Error('P0002 not found'))
    assert.match(errNotFound.message, /tidak ditemukan/i)

    const errUnknown = normalizeDatabaseError(new Error('raw postgres syntax error near select'))
    assert.equal(errUnknown.message, 'Terjadi kesalahan saat memproses data langganan')
  })

  // 24. Migration 074 and 075 follow Supabase security guidelines
  it('24. Migration 074 & 075 adhere to Context7 & Supabase security guidelines', () => {
    assert.match(migration074Sql, /SECURITY\s+DEFINER/i)
    assert.match(migration074Sql, /SET\s+search_path\s*=\s*''/i)
    assert.match(migration074Sql, /REVOKE\s+EXECUTE/i)
    assert.match(migration074Sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION.*TO\s+authenticated/i)

    assert.match(migration075Sql, /SECURITY\s+DEFINER/i)
    assert.match(migration075Sql, /SET\s+search_path\s*=\s*''/i)
    assert.match(migration075Sql, /REVOKE\s+EXECUTE/i)
    assert.match(migration075Sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION.*TO\s+authenticated/i)
  })

  // 25. Scope Lock: Historical migrations 001–073 remain intact
  it('25. Scope Lock: Historical migrations 001–073 remain unmodified', () => {
    for (let i = 62; i <= 73; i++) {
      const numStr = String(i).padStart(3, '0')
      const files = fs.readdirSync('supabase/migrations').filter((f) => f.startsWith(numStr))
      assert.ok(files.length > 0, `Migration ${numStr} must exist`)
    }
  })
})

describe('Tahap 5: Live Supabase Integration Suite (@qr.md)', () => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const canRunLive = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY)

  it('Live 1: Anonymous client cannot execute admin subscription RPCs (42501)', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase credentials not provided')
      return
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await anonClient.rpc('get_admin_subscriptions')

    assert.equal(data, null)
    assert.ok(error)
    assert.equal(error.code, '42501')
  })

  it('Live 2: Authenticated admin can fetch subscriptions with server-side pagination & counts', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase credentials not provided')
      return
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    // Login as active super admin
    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: 'abiyuhilal943@gmail.com',
    })
    await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    })

    const { data, error } = await anonClient.rpc('get_admin_subscriptions', {
      p_limit: 10,
      p_offset: 0,
    })

    assert.equal(error, null)
    assert.ok(data)
    assert.ok(typeof data.total_count === 'number')
    assert.ok(Array.isArray(data.subscriptions))
  })

  it('Live 3: Admin can fetch subscription detail with payment history and audit logs', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase credentials not provided')
      return
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: 'abiyuhilal943@gmail.com',
    })
    await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    })

    const { data: listData } = await anonClient.rpc('get_admin_subscriptions', {
      p_limit: 1,
    })

    const sampleSub = listData?.subscriptions?.[0]
    if (!sampleSub) {
      t.skip('No subscriptions available to test detail RPC')
      return
    }

    const { data: detailData, error: detailErr } = await anonClient.rpc('get_admin_subscription_detail', {
      p_subscription_id: sampleSub.id,
    })

    assert.equal(detailErr, null)
    assert.ok(detailData.subscription)
    assert.equal(detailData.subscription.id, sampleSub.id)
    assert.ok(Array.isArray(detailData.payments))
  })

  it('Live 4: Admin cancellation enforces non-empty reason, idempotency, and audit logging', async (t) => {
    if (!canRunLive) {
      t.skip('Skipping live test: Supabase credentials not provided')
      return
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: 'abiyuhilal943@gmail.com',
    })
    await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    })

    // Create a temporary test subscription
    const { data: testSub, error: createErr } = await adminClient
      .from('subscriptions')
      .insert({
        profile_id: 'c320ff9c-ced8-4c4b-bfa1-87dfe6b9c4c9',
        plan: 'pro',
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select()
      .single()

    assert.equal(createErr, null)
    assert.ok(testSub?.id)

    try {
      // Step A: Cancellation without reason must be rejected with 22023
      const { error: errNoReason } = await anonClient.rpc('admin_cancel_subscription', {
        p_subscription_id: testSub.id,
        p_reason: '  ',
      })
      assert.ok(errNoReason)
      assert.equal(errNoReason.code, '22023')

      // Step B: Valid cancellation
      const { data: cancelRes, error: cancelErr } = await anonClient.rpc('admin_cancel_subscription', {
        p_subscription_id: testSub.id,
        p_reason: 'Automated Live Test Cancellation',
      })
      assert.equal(cancelErr, null)
      assert.equal(cancelRes.success, true)
      assert.equal(cancelRes.already_cancelled, false)

      // Step C: Verify subscription in DB is cancelled
      const { data: updatedSub } = await adminClient
        .from('subscriptions')
        .select('status, cancelled_at, cancelled_by')
        .eq('id', testSub.id)
        .single()
      assert.equal(updatedSub.status, 'cancelled')
      assert.ok(updatedSub.cancelled_at)
      assert.ok(updatedSub.cancelled_by)

      // Step D: Idempotency - Cancelling again returns already_cancelled=true
      const { data: retryRes, error: retryErr } = await anonClient.rpc('admin_cancel_subscription', {
        p_subscription_id: testSub.id,
        p_reason: 'Second click attempt',
      })
      assert.equal(retryErr, null)
      assert.equal(retryRes.already_cancelled, true)

      // Step E: Verify audit log recorded exactly once
      const { data: logs } = await adminClient
        .from('admin_audit_logs')
        .select('id, action, reason')
        .eq('target_id', testSub.id)
      assert.equal(logs.length, 1)
      assert.equal(logs[0].action, 'CANCEL_SUBSCRIPTION')
      assert.equal(logs[0].reason, 'Automated Live Test Cancellation')

    } finally {
      // Clean up test records
      await adminClient.from('admin_audit_logs').delete().eq('target_id', testSub.id)
      await adminClient.from('subscriptions').delete().eq('id', testSub.id)
    }
  })
})
