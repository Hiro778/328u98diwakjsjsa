// src/__tests__/subscriptionLockdown.test.js
// Verification Suite for BS-CONF-01: Subscriptions Table Entitlement Lockdown
// Ensures that normal authenticated users CANNOT directly insert, update, or delete
// rows in public.subscriptions or public.subscription_payments.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {}

describe('BS-CONF-01: Subscriptions Entitlement Security Lockdown Suite', () => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  const hasRemoteKeys = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY)

  // ═════════════════════════════════════════════════════════════════════════
  // PART 1: MIGRATION & STATIC SCHEMA AUDIT
  // ═════════════════════════════════════════════════════════════════════════
  describe('1. Migration 104 Schema & Policy Integrity', () => {
    const migration104Path = path.resolve(process.cwd(), 'supabase/migrations/104_security_lockdown_subscriptions_table.sql')

    it('1.1. Migration 104 file exists', () => {
      assert.ok(fs.existsSync(migration104Path), 'Migration 104 must exist')
    })

    it('1.2. Drops vulnerable client write policies from migration 069', () => {
      const content = fs.readFileSync(migration104Path, 'utf8')
      assert.ok(
        content.includes('DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions'),
        'Must drop "Users can insert own subscription"'
      )
      assert.ok(
        content.includes('DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions'),
        'Must drop "Users can update own subscription"'
      )
      assert.ok(
        content.includes('DROP POLICY IF EXISTS "Users can delete own subscription" ON public.subscriptions'),
        'Must drop "Users can delete own subscription"'
      )
    })

    it('1.3. Revokes all client write privileges (INSERT, UPDATE, DELETE, TRUNCATE)', () => {
      const content = fs.readFileSync(migration104Path, 'utf8')
      assert.ok(
        content.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM anon, authenticated, public'),
        'Must revoke write privileges from anon, authenticated, public on subscriptions'
      )
      assert.ok(
        content.includes('REVOKE ALL ON public.subscriptions FROM anon'),
        'Must revoke all privileges on subscriptions from anon'
      )
      assert.ok(
        content.includes('GRANT SELECT ON public.subscriptions TO authenticated'),
        'Must grant SELECT only to authenticated'
      )
    })

    it('1.4. Hardens subscription_payments against direct client mutations', () => {
      const content = fs.readFileSync(migration104Path, 'utf8')
      assert.ok(
        content.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_payments FROM anon, authenticated, public'),
        'Must revoke write privileges on subscription_payments'
      )
      assert.ok(
        content.includes('GRANT SELECT ON public.subscription_payments TO authenticated'),
        'Must grant SELECT only on subscription_payments'
      )
    })

    it('1.5. Implements defense-in-depth trigger prevent_client_subscription_mutation', () => {
      const content = fs.readFileSync(migration104Path, 'utf8')
      assert.ok(
        content.includes('CREATE OR REPLACE FUNCTION public.prevent_client_subscription_mutation'),
        'Must define defense-in-depth trigger function'
      )
      assert.ok(
        content.includes("IF current_user IN ('anon', 'authenticated') THEN"),
        'Trigger must explicitly trap anon and authenticated roles'
      )
      assert.ok(
        content.includes('CREATE TRIGGER trg_prevent_client_subscription_mutation'),
        'Trigger must be attached to subscriptions'
      )
      assert.ok(
        content.includes('CREATE TRIGGER trg_prevent_client_subscription_payments_mutation'),
        'Trigger must be attached to subscription_payments'
      )
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PART 2: APPLICATION CODEBASE AUDIT (LEAST PRIVILEGE)
  // ═════════════════════════════════════════════════════════════════════════
  describe('2. Client Application Codebase Audit', () => {
    it('2.1. Client application code does NOT perform direct mutations on subscriptions', () => {
      const srcDir = path.resolve(process.cwd(), 'src')
      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__') {
              scanDir(fullPath)
            }
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
            const content = fs.readFileSync(fullPath, 'utf8')
            const directMutationPattern = /\.from\(['"]subscriptions['"]\)\s*\.(insert|update|upsert|delete)/g
            const matches = content.match(directMutationPattern)
            assert.equal(
              matches,
              null,
              `File ${fullPath} must not perform direct mutation on subscriptions table`
            )
          }
        }
      }
      scanDir(srcDir)
    })

    it('2.2. AuthContext only performs read-only queries on subscriptions', () => {
      const authContextPath = path.resolve(process.cwd(), 'src/context/AuthContext.jsx')
      const content = fs.readFileSync(authContextPath, 'utf8')
      assert.ok(
        content.includes(".from('subscriptions')\n        .select('*')"),
        'AuthContext must only query subscriptions with select'
      )
      assert.ok(!content.includes(".from('subscriptions').update"), 'AuthContext must not update subscriptions')
      assert.ok(!content.includes(".from('subscriptions').insert"), 'AuthContext must not insert subscriptions')
      assert.ok(!content.includes(".from('subscriptions').delete"), 'AuthContext must not delete subscriptions')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PART 3: LIVE REMOTE SUPABASE PENETRATION & INTEGRATION TESTS
  // ═════════════════════════════════════════════════════════════════════════
  describe('3. Live Remote Supabase Security Boundary Tests', () => {
    let adminClient
    let testUserId
    let testUserClient
    let testUserEmail
    const testPassword = 'Password123!@#Secure'

    before(async (t) => {
      if (!hasRemoteKeys) {
        t.skip('Skipping live remote tests: credentials not provided')
        return
      }

      adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      testUserEmail = `pentest_lockdown_${Date.now()}@example.com`

      const { data: userRes, error: userErr } = await adminClient.auth.admin.createUser({
        email: testUserEmail,
        password: testPassword,
        email_confirm: true,
      })

      if (userErr || !userRes.user) {
        throw new Error(`Failed to create test user: ${userErr?.message}`)
      }
      testUserId = userRes.user.id

      testUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { error: signInErr } = await testUserClient.auth.signInWithPassword({
        email: testUserEmail,
        password: testPassword,
      })
      if (signInErr) {
        throw new Error(`Failed to sign in test user: ${signInErr.message}`)
      }
    })

    after(async () => {
      if (adminClient && testUserId) {
        await adminClient.from('subscription_payments').delete().eq('profile_id', testUserId)
        await adminClient.from('subscriptions').delete().eq('profile_id', testUserId)
        await adminClient.auth.admin.deleteUser(testUserId)
      }
    })

    it('3.1. Free user CANNOT directly INSERT row into public.subscriptions', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const { data, error } = await testUserClient.from('subscriptions').insert({
        profile_id: testUserId,
        plan: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      }).select()

      assert.equal(data, null, 'Must not return inserted data')
      assert.ok(error, 'Must return error on direct insert')
      assert.equal(error.code, '42501', 'Must be error code 42501 (permission denied)')
    })

    it('3.2. Free user CANNOT directly UPDATE own row in public.subscriptions (BS-CONF-01 exploit)', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      // Seed free row via admin
      await adminClient.from('subscriptions').insert({
        profile_id: testUserId,
        plan: 'free',
        status: 'inactive',
      })

      // Exploit attempt: authenticated user calls PATCH /rest/v1/subscriptions
      const { data, error } = await testUserClient.from('subscriptions').update({
        plan: 'pro',
        status: 'active',
        expires_at: '2099-12-31T23:59:59Z',
        is_cancelled: false,
      }).eq('profile_id', testUserId).select()

      assert.equal(data, null, 'Exploit must not return updated data')
      assert.ok(error, 'Must return error on direct update')
      assert.equal(error.code, '42501', 'Must be error code 42501 (permission denied)')

      // Verify row remains free/inactive in DB
      const { data: dbRow } = await adminClient.from('subscriptions').select('plan, status').eq('profile_id', testUserId).single()
      assert.equal(dbRow.plan, 'free', 'Plan must remain free in database')
      assert.equal(dbRow.status, 'inactive', 'Status must remain inactive in database')
    })

    it('3.3. Free user CANNOT directly DELETE row in public.subscriptions', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const { data, error } = await testUserClient.from('subscriptions').delete().eq('profile_id', testUserId).select()
      assert.equal(data, null, 'Must not return deleted data')
      assert.ok(error, 'Must return error on direct delete')
      assert.equal(error.code, '42501', 'Must be error code 42501 (permission denied)')
    })

    it('3.4. Free user CANNOT directly INSERT into public.subscription_payments', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const { data, error } = await testUserClient.from('subscription_payments').insert({
        profile_id: testUserId,
        subscription_id: '00000000-0000-0000-0000-000000000000',
        midtrans_order_id: `FAKE-SUB-${Date.now()}`,
        gross_amount: 130000,
        payment_status: 'paid',
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + 86400000).toISOString(),
      }).select()

      assert.equal(data, null, 'Must not return fake payment')
      assert.ok(error, 'Must return error on payment insertion')
      assert.equal(error.code, '42501', 'Must be error code 42501 (permission denied)')
    })

    it('3.5. Authenticated user CAN SELECT own subscription row', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const { data, error } = await testUserClient.from('subscriptions').select('*').eq('profile_id', testUserId)
      assert.equal(error, null, 'SELECT own subscription must succeed without error')
      assert.equal(data.length, 1, 'Must return exactly 1 subscription row')
      assert.equal(data[0].profile_id, testUserId, 'Profile ID must match')
      assert.equal(data[0].plan, 'free', 'Plan must be free')
    })

    it('3.6. Cross-tenant isolation: User A CANNOT view User B subscription', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const foreignProfileId = '00000000-0000-0000-0000-000000000001'
      const { data, error } = await testUserClient.from('subscriptions').select('*').eq('profile_id', foreignProfileId)
      assert.equal(error, null)
      assert.deepEqual(data, [], 'User A must see 0 rows for User B')
    })

    it('3.7. Concurrent race condition: 10 simultaneous unauthorized UPDATE requests all fail', async (t) => {
      if (!hasRemoteKeys) return t.skip('No live env')

      const attempts = Array.from({ length: 10 }).map(() =>
        testUserClient.from('subscriptions').update({
          plan: 'pro',
          status: 'active',
          expires_at: '2099-12-31T23:59:59Z',
        }).eq('profile_id', testUserId).select()
      )

      const results = await Promise.all(attempts)
      const successCount = results.filter((r) => !r.error && r.data?.length > 0).length
      const deniedCount = results.filter((r) => r.error && r.error.code === '42501').length

      assert.equal(successCount, 0, 'Zero race attempts must succeed')
      assert.equal(deniedCount, 10, 'All 10 race attempts must be denied with 42501')

      // Verify row state in DB
      const { data: dbRow } = await adminClient.from('subscriptions').select('plan, status').eq('profile_id', testUserId).single()
      assert.equal(dbRow.plan, 'free', 'Plan must remain free')
      assert.equal(dbRow.status, 'inactive', 'Status must remain inactive')
    })
  })
})
