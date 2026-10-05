// src/__tests__/deductCreativeCreditsLockdown.test.js
// Verification Suite for BS-CONF-03: deduct_creative_credits_atomic Authorization Hardening
// Covers:
// A. Anonymous caller (rejected, 42501, no balance change, no ledger entry)
// B. Authenticated User A -> Business B (rejected, UNAUTHORIZED_BUSINESS_OWNERSHIP, no balance change, no ledger entry)
// C. Authenticated Business Owner -> Own Business (succeeds, balance deducted, ledger entry recorded)
// D. service_role -> Valid Business (succeeds, backend AI flows functional)
// E. Insufficient credits (returns INSUFFICIENT_CREDITS, balance unchanged, no ledger entry)
// F. Idempotency / replay (returns already_processed: true, no duplicate debit)
// G. Concurrent requests (atomic row lock, no negative balance, ledger integrity preserved)

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ttdevvrzmdquvaewxzhh.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

describe('BS-CONF-03: deduct_creative_credits_atomic RPC Security Lockdown', () => {
  const migrationPath = path.resolve('supabase/migrations/109_harden_deduct_creative_credits_atomic.sql')

  describe('1. Static Code & Migration Analysis', () => {
    it('1.1. Migration 109 exists and defines hardened deduct_creative_credits_atomic', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 109 must exist')
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.deduct_creative_credits_atomic'), 'Must define deduct_creative_credits_atomic')
      assert.ok(sql.includes("SET search_path = ''"), 'Must pin search_path to empty string')
      assert.ok(sql.includes('SECURITY DEFINER'), 'Must be SECURITY DEFINER')
    })

    it('1.2. Rejects unauthenticated callers when not running under service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('v_is_service_role'), 'Must identify service_role context')
      assert.ok(sql.includes('IF NOT v_is_service_role THEN'), 'Must branch on service_role')
      assert.ok(sql.includes('IF v_caller_id IS NULL THEN'), 'Must check for null caller_id')
      assert.ok(sql.includes('42501'), 'Must use ERRCODE 42501 for unauthorized calls')
    })

    it('1.3. Enforces business ownership for authenticated non-admin callers', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('owner_id = v_caller_id'), 'Must check business ownership')
      assert.ok(sql.includes('UNAUTHORIZED_BUSINESS_OWNERSHIP'), 'Must return UNAUTHORIZED_BUSINESS_OWNERSHIP on mismatch')
    })

    it('1.4. Revokes EXECUTE from PUBLIC and anon, granting only to authenticated and service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(
        sql.includes('REVOKE ALL ON FUNCTION public.deduct_creative_credits_atomic'),
        'Must revoke execution from PUBLIC and anon'
      )
      assert.ok(
        sql.includes('GRANT EXECUTE ON FUNCTION public.deduct_creative_credits_atomic') &&
        sql.includes('authenticated, service_role'),
        'Must grant only to authenticated and service_role'
      )
    })

    it('1.5. Validates input boundaries and prevents negative or zero deductions', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('p_credits <= 0'), 'Must reject credits <= 0')
      assert.ok(sql.includes('INVALID_CREDIT_AMOUNT'), 'Must return INVALID_CREDIT_AMOUNT')
    })
  })

  describe('2. Live Remote Database Verification (A - G Matrix)', () => {
    let serviceClient
    let anonClient
    let userAClient
    let userBClient
    let userAId
    let userBId
    let userABizId
    let userBBizId

    before(async () => {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase environment variables missing')
      }

      serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      const pass = 'TestP@ss123456!'
      const emailA = `test_deduct_a_${Date.now()}@example.com`
      const emailB = `test_deduct_b_${Date.now()}@example.com`

      const authHelperClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      const { data: uA, error: errA } = await serviceClient.auth.admin.createUser({
        email: emailA,
        password: pass,
        email_confirm: true,
      })
      if (errA) throw new Error(`Failed to create User A: ${errA.message}`)
      userAId = uA.user.id

      const { data: uB, error: errB } = await serviceClient.auth.admin.createUser({
        email: emailB,
        password: pass,
        email_confirm: true,
      })
      if (errB) throw new Error(`Failed to create User B: ${errB.message}`)
      userBId = uB.user.id

      const { data: logA } = await authHelperClient.auth.signInWithPassword({ email: emailA, password: pass })
      const { data: logB } = await authHelperClient.auth.signInWithPassword({ email: emailB, password: pass })

      userAClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logA.session.access_token}` } },
      })
      userBClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logB.session.access_token}` } },
      })

      // User A creates Business A
      const { data: bA, error: errBA } = await userAClient
        .from('businesses')
        .insert({ name: 'Biz A Deduct Test', owner_id: userAId })
        .select()
        .single()
      if (errBA) throw new Error(`Failed to create Business A: ${errBA.message}`)
      userABizId = bA.id

      // User B creates Business B
      const { data: bB, error: errBB } = await userBClient
        .from('businesses')
        .insert({ name: 'Biz B Deduct Test', owner_id: userBId })
        .select()
        .single()
      if (errBB) throw new Error(`Failed to create Business B: ${errBB.message}`)
      userBBizId = bB.id

      // Seed credits for Business A (10 credits) and Business B (10 credits)
      await serviceClient.from('creative_credits').upsert({
        business_id: userABizId,
        available: 10,
        consumed: 0,
        total_earned: 10,
      })

      await serviceClient.from('creative_credits').upsert({
        business_id: userBBizId,
        available: 10,
        consumed: 0,
        total_earned: 10,
      })
    })

    after(async () => {
      // Clean up test businesses, ledger, credits, and auth accounts
      if (userABizId) {
        await serviceClient.from('credit_ledger').delete().eq('business_id', userABizId)
        await serviceClient.from('creative_credits').delete().eq('business_id', userABizId)
        await serviceClient.from('businesses').delete().eq('id', userABizId)
      }
      if (userBBizId) {
        await serviceClient.from('credit_ledger').delete().eq('business_id', userBBizId)
        await serviceClient.from('creative_credits').delete().eq('business_id', userBBizId)
        await serviceClient.from('businesses').delete().eq('id', userBBizId)
      }
      if (userAId) await serviceClient.auth.admin.deleteUser(userAId)
      if (userBId) await serviceClient.auth.admin.deleteUser(userBId)
    })

    it('A. Anonymous caller: REJECTED, SQLSTATE 42501, no balance change, no ledger row created', async () => {
      // Record initial balance & ledger count
      const { data: initialCredits } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userABizId)
        .single()

      const { count: initialLedgerCount } = await serviceClient
        .from('credit_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', userABizId)

      // Attempt anonymous invocation
      const { data, error } = await anonClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 5,
        p_operation: 'anon_exploit_attempt',
        p_request_id: `anon_req_${Date.now()}`,
      })

      assert.equal(data, null)
      assert.ok(error, 'Anonymous invocation must be rejected')
      assert.equal(error.code, '42501', 'Must fail with SQLSTATE 42501 permission denied')

      // Verify database state is untouched
      const { data: afterCredits } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userABizId)
        .single()
      assert.equal(afterCredits.available, initialCredits.available, 'Credit balance must not change')
      assert.equal(afterCredits.consumed, initialCredits.consumed, 'Consumed credits must not change')

      const { count: afterLedgerCount } = await serviceClient
        .from('credit_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', userABizId)
      assert.equal(afterLedgerCount, initialLedgerCount, 'No credit ledger record must be created')
    })

    it('B. Authenticated User A -> Business B: REJECTED, no balance change, no ledger mutation', async () => {
      const { data: initialCreditsB } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userBBizId)
        .single()

      const { count: initialLedgerB } = await serviceClient
        .from('credit_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', userBBizId)

      // User A attempts to deduct credits from User B's business
      const { data, error } = await userAClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userBBizId,
        p_credits: 3,
        p_operation: 'cross_tenant_drain_attempt',
        p_request_id: `cross_req_${Date.now()}`,
      })

      assert.equal(error, null, 'RPC executed through authorized role')
      assert.equal(data?.success, false, 'Operation must fail')
      assert.equal(data?.error, 'UNAUTHORIZED_BUSINESS_OWNERSHIP', 'Must return UNAUTHORIZED_BUSINESS_OWNERSHIP')

      // Verify Business B balance and ledger are unchanged
      const { data: afterCreditsB } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userBBizId)
        .single()
      assert.equal(afterCreditsB.available, initialCreditsB.available, 'Business B credits must not be deducted')

      const { count: afterLedgerB } = await serviceClient
        .from('credit_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', userBBizId)
      assert.equal(afterLedgerB, initialLedgerB, 'No ledger entry should be created for unauthorized deduction')
    })

    it('C. Authenticated Business Owner -> Own Business: SUCCEEDS, balance deducted, ledger entry recorded', async () => {
      const reqId = `owner_req_${Date.now()}`
      const { data, error } = await userAClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 2,
        p_operation: 'legit_owner_deduction',
        p_request_id: reqId,
      })

      assert.equal(error, null)
      assert.equal(data?.success, true)
      assert.equal(data?.credits_deducted, 2)
      assert.equal(data?.balance_after, 8)

      // Verify database state: balance is 8, consumed is 2
      const { data: creditsRow } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userABizId)
        .single()
      assert.equal(creditsRow.available, 8)
      assert.equal(creditsRow.consumed, 2)

      // Verify ledger row exists
      const { data: ledgerRow } = await serviceClient
        .from('credit_ledger')
        .select('*')
        .eq('business_id', userABizId)
        .eq('idempotency_key', reqId)
        .single()
      assert.ok(ledgerRow, 'Ledger entry must exist')
      assert.equal(ledgerRow.credits, -2)
      assert.equal(ledgerRow.balance_after, 8)
      assert.equal(ledgerRow.description, 'legit_owner_deduction')
    })

    it('D. service_role -> Valid Business: SUCCEEDS, backend AI Edge Functions continue working', async () => {
      const reqId = `service_req_${Date.now()}`
      const { data, error } = await serviceClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 1,
        p_operation: 'backend_edge_function_call',
        p_request_id: reqId,
      })

      assert.equal(error, null)
      assert.equal(data?.success, true)
      assert.equal(data?.credits_deducted, 1)
      assert.equal(data?.balance_after, 7)

      const { data: creditsRow } = await serviceClient
        .from('creative_credits')
        .select('available')
        .eq('business_id', userABizId)
        .single()
      assert.equal(creditsRow.available, 7)
    })

    it('E. Insufficient credits: REJECTED, balance unchanged, no ledger entry', async () => {
      // Current balance is 7. Requesting 50 credits must fail.
      const reqId = `insufficient_req_${Date.now()}`
      const { data, error } = await userAClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 50,
        p_operation: 'overdraw_attempt',
        p_request_id: reqId,
      })

      assert.equal(error, null)
      assert.equal(data?.success, false)
      assert.equal(data?.error, 'INSUFFICIENT_CREDITS')
      assert.equal(data?.available, 7)
      assert.equal(data?.required, 50)

      // Balance unchanged
      const { data: creditsRow } = await serviceClient
        .from('creative_credits')
        .select('available')
        .eq('business_id', userABizId)
        .single()
      assert.equal(creditsRow.available, 7)

      // No ledger row created
      const { data: ledgerRow } = await serviceClient
        .from('credit_ledger')
        .select('*')
        .eq('idempotency_key', reqId)
        .maybeSingle()
      assert.equal(ledgerRow, null, 'Must not create ledger row on insufficient credits')
    })

    it('F. Idempotency / replay: Repeated deduction with same request_id returns already_processed: true', async () => {
      const idempotentReqId = `idem_req_${Date.now()}`

      // First call (deduct 2 credits from 7 -> 5)
      const res1 = await userAClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 2,
        p_operation: 'idempotent_operation',
        p_request_id: idempotentReqId,
      })
      assert.equal(res1.data?.success, true)
      assert.equal(res1.data?.credits_deducted, 2)
      assert.equal(res1.data?.balance_after, 5)

      // Replay identical call
      const res2 = await userAClient.rpc('deduct_creative_credits_atomic', {
        p_business_id: userABizId,
        p_credits: 2,
        p_operation: 'idempotent_operation',
        p_request_id: idempotentReqId,
      })

      assert.equal(res2.data?.success, true)
      assert.equal(res2.data?.already_processed, true, 'Must indicate already_processed')
      assert.equal(res2.data?.credits_deducted, 0, 'No additional credits deducted')
      assert.equal(res2.data?.balance_after, 5, 'Balance must remain 5')

      // Ensure only 1 ledger entry exists for this request_id
      const { data: ledgerEntries } = await serviceClient
        .from('credit_ledger')
        .select('*')
        .eq('business_id', userABizId)
        .eq('idempotency_key', idempotentReqId)
      assert.equal(ledgerEntries.length, 1, 'Only one ledger row must exist for idempotent request')
    })

    it('G. Concurrent requests: atomic row-lock prevents race conditions and negative balance', async () => {
      // Balance is currently 5. Concurrently fire three requests of 3 credits each.
      // Total requested = 9, available = 5.
      // Exactly ONE request must succeed (5 - 3 = 2), and the other two must be rejected due to INSUFFICIENT_CREDITS.
      const promises = [1, 2, 3].map((i) =>
        userAClient.rpc('deduct_creative_credits_atomic', {
          p_business_id: userABizId,
          p_credits: 3,
          p_operation: `concurrent_attempt_${i}`,
          p_request_id: `concur_req_${i}_${Date.now()}`,
        })
      )

      const results = await Promise.all(promises)
      const successes = results.filter((r) => r.data?.success === true)
      const failures = results.filter((r) => r.data?.success === false && r.data?.error === 'INSUFFICIENT_CREDITS')

      assert.equal(successes.length, 1, 'Exactly one concurrent request must succeed')
      assert.equal(failures.length, 2, 'Two concurrent requests must fail with INSUFFICIENT_CREDITS')

      // Final balance must be 2, never negative
      const { data: finalCredits } = await serviceClient
        .from('creative_credits')
        .select('available, consumed')
        .eq('business_id', userABizId)
        .single()
      assert.equal(finalCredits.available, 2, 'Final balance must be exactly 2')
      assert.ok(finalCredits.available >= 0, 'Balance must never be negative')
    })
  })
})
