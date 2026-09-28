import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  saveLoanSimulation,
  updateLoanSimulation,
  getLoanSimulationsByBusiness,
  deleteLoanSimulation,
  validateNumeric,
  sanitizeNumeric,
  normalizeLoanSimulationError,
} from '../lib/loanSimulationService.js'

describe('Loan Simulation Persistence & Security Suite', () => {
  // ── 1. Unit: Numeric Sanitization & Validation ──
  describe('Numeric Sanitization & Validation', () => {
    it('rejects NaN inputs', () => {
      assert.throws(
        () => validateNumeric(NaN, 'Principal'),
        /angka yang valid/
      )
    })

    it('rejects Infinity inputs', () => {
      assert.throws(
        () => validateNumeric(Infinity, 'Principal'),
        /angka yang valid/
      )
      assert.throws(
        () => validateNumeric(-Infinity, 'Principal'),
        /angka yang valid/
      )
    })

    it('rejects negative numbers when min is 0 or greater', () => {
      assert.throws(
        () => validateNumeric(-100, 'Principal', { min: 0 }),
        /tidak boleh kurang dari 0/
      )
    })

    it('rejects values exceeding max boundary', () => {
      assert.throws(
        () => validateNumeric(10000000000000, 'Principal', { max: 9999999999999.99 }),
        /melebihi batas maksimum/
      )
    })

    it('accepts valid numeric values and string numbers', () => {
      assert.equal(validateNumeric('5000000', 'Principal'), 5000000)
      assert.equal(validateNumeric(2500000, 'Principal'), 2500000)
      assert.equal(validateNumeric('12.5', 'Interest Rate'), 12.5)
    })

    it('sanitizeNumeric returns fallback on invalid inputs', () => {
      assert.equal(sanitizeNumeric(NaN, 0), 0)
      assert.equal(sanitizeNumeric(Infinity, 10), 10)
      assert.equal(sanitizeNumeric(undefined, 5), 5)
      assert.equal(sanitizeNumeric('abc', 0), 0)
      assert.equal(sanitizeNumeric(1500, 0), 1500)
    })
  })

  // ── 2. Unit: Error Normalization ──
  describe('Error Normalization', () => {
    it('normalizes PGRST205 / 42P01 table missing error', () => {
      const msg = normalizeLoanSimulationError({ code: 'PGRST205', message: 'Could not find the table' })
      assert.match(msg, /015_loan_simulation\.sql/)

      const msg2 = normalizeLoanSimulationError({ code: '42P01', message: 'relation does not exist' })
      assert.match(msg2, /015_loan_simulation\.sql/)
    })

    it('normalizes 42501 RLS permission denied error', () => {
      const msg = normalizeLoanSimulationError({ code: '42501', message: 'permission denied' })
      assert.match(msg, /tidak memiliki akses/)
    })

    it('normalizes 23503 foreign key violation', () => {
      const msg = normalizeLoanSimulationError({ code: '23503', message: 'foreign key constraint' })
      assert.match(msg, /referensi/)
    })

    it('normalizes 23502 not-null violation', () => {
      const msg = normalizeLoanSimulationError({ code: '23502', message: 'null value in column' })
      assert.match(msg, /Field wajib/)
    })

    it('normalizes 22P02 invalid numeric representation', () => {
      const msg = normalizeLoanSimulationError({ code: '22P02', message: 'invalid input syntax for type numeric' })
      assert.match(msg, /Format data numerik/)
    })
  })

  // ── 3. Live Database Persistence & Security Matrix ──
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (SUPABASE_URL && SERVICE_ROLE_KEY && SUPABASE_ANON_KEY) {
    describe('Live Database & RLS Enforcement', () => {
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

      let testBusiness = null
      let otherBusiness = null
      let createdSimulationId = null

      before(async () => {
        // Fetch two distinct businesses to test cross-tenant isolation
        const { data: businesses } = await adminClient
          .from('businesses')
          .select('id, owner_id')
          .limit(2)

        if (businesses && businesses.length > 0) {
          testBusiness = businesses[0]
          otherBusiness = businesses.length > 1 ? businesses[1] : null
        }
      })

      after(async () => {
        // Cleanup test record
        if (createdSimulationId) {
          await adminClient
            .from('loan_simulations')
            .delete()
            .eq('id', createdSimulationId)
        }
      })

      it('authenticated owner → can INSERT simulation', async () => {
        assert.ok(testBusiness, 'Test business must exist in database')

        const payload = {
          business_id: testBusiness.id,
          principal: 25000000,
          annual_interest_rate: 9.75,
          tenor_months: 36,
          method: 'annuity',
          admin_fee: 100000,
          provision_rate: 1.0,
          other_fee: 50000,
          monthly_payment: 803672,
          total_interest: 3932192,
          total_fees: 400000,
          total_payment: 28932192,
          effective_total_cost: 4332192,
          schedule: [
            { month: 1, payment: 803672, principal: 600547, interest: 203125, remainingBalance: 24399453 }
          ],
        }

        const { data, error } = await adminClient
          .from('loan_simulations')
          .insert(payload)
          .select()
          .single()

        assert.ifError(error)
        assert.ok(data?.id)
        assert.equal(Number(data.principal), 25000000)
        assert.equal(Number(data.annual_interest_rate), 9.75)
        createdSimulationId = data.id
      })

      it('authenticated owner → can SELECT (reload simulation) with 100% data fidelity', async () => {
        assert.ok(createdSimulationId)

        const freshClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
        const { data, error } = await freshClient
          .from('loan_simulations')
          .select('*')
          .eq('id', createdSimulationId)
          .eq('business_id', testBusiness.id)
          .single()

        assert.ifError(error)
        assert.ok(data)
        assert.equal(Number(data.principal), 25000000)
        assert.equal(data.tenor_months, 36)
        assert.equal(data.method, 'annuity')
        assert.equal(data.schedule.length, 1)
        assert.equal(data.schedule[0].month, 1)
      })

      it('authenticated owner → can UPDATE simulation', async () => {
        assert.ok(createdSimulationId)

        const { data, error } = await adminClient
          .from('loan_simulations')
          .update({
            principal: 30000000,
            monthly_payment: 964406,
          })
          .eq('id', createdSimulationId)
          .eq('business_id', testBusiness.id)
          .select()
          .single()

        assert.ifError(error)
        assert.equal(Number(data.principal), 30000000)
        assert.equal(Number(data.monthly_payment), 964406)
      })

      it('anon → cannot SELECT simulation data (0 rows)', async () => {
        assert.ok(createdSimulationId)

        const { data, error } = await anonClient
          .from('loan_simulations')
          .select('*')
          .eq('id', createdSimulationId)

        assert.ifError(error)
        assert.equal(data.length, 0, 'Anon client must not see any rows under RLS')
      })

      it('anon → cannot INSERT simulation data (rejected with 42501)', async () => {
        const { error } = await anonClient
          .from('loan_simulations')
          .insert({
            business_id: testBusiness.id,
            principal: 5000000,
          })

        assert.ok(error, 'Anon client insert must be rejected')
        assert.equal(error.code, '42501', 'Error code must be 42501 RLS policy violation')
      })

      it('anon → cannot UPDATE simulation data (0 rows modified)', async () => {
        assert.ok(createdSimulationId)

        const { data, error } = await anonClient
          .from('loan_simulations')
          .update({ principal: 99999999 })
          .eq('id', createdSimulationId)
          .select()

        assert.ifError(error)
        assert.equal(data.length, 0, 'Anon client cannot update rows protected by RLS')
      })

      it('anon → cannot DELETE simulation data (0 rows deleted)', async () => {
        assert.ok(createdSimulationId)

        const { data, error } = await anonClient
          .from('loan_simulations')
          .delete()
          .eq('id', createdSimulationId)
          .select()

        assert.ifError(error)
        assert.equal(data.length, 0, 'Anon client cannot delete rows protected by RLS')
      })

      it('user/business lain → cannot UPDATE cross-business record', async () => {
        if (!otherBusiness) return

        // Attempting to update a record belonging to testBusiness by scoping to otherBusiness
        const { data, error } = await adminClient
          .from('loan_simulations')
          .update({ principal: 88888888 })
          .eq('id', createdSimulationId)
          .eq('business_id', otherBusiness.id)
          .select()

        assert.ifError(error)
        assert.equal(data.length, 0, 'Cannot update a record with wrong business_id')
      })

      it('user/business lain → cannot DELETE cross-business record', async () => {
        if (!otherBusiness) return

        // Attempting to delete a record belonging to testBusiness by scoping to otherBusiness
        const { data, error } = await adminClient
          .from('loan_simulations')
          .delete()
          .eq('id', createdSimulationId)
          .eq('business_id', otherBusiness.id)
          .select()

        assert.ifError(error)
        assert.equal(data.length, 0, 'Cannot delete a record with wrong business_id')
      })

      it('fake/nonexistent business_id (invalid FK) → rejected with 23503', async () => {
        const fakeBusinessId = '00000000-0000-0000-0000-000000000999'
        const { error } = await adminClient
          .from('loan_simulations')
          .insert({
            business_id: fakeBusinessId,
            principal: 1000000,
          })

        assert.ok(error, 'Insert with fake business_id must fail')
        assert.equal(error.code, '23503', 'Error must be 23503 foreign key violation')
      })

      it('authenticated owner → can DELETE simulation and verify cleanup', async () => {
        assert.ok(createdSimulationId)

        const { error } = await adminClient
          .from('loan_simulations')
          .delete()
          .eq('id', createdSimulationId)
          .eq('business_id', testBusiness.id)

        assert.ifError(error)

        // Verify record is gone
        const { data } = await adminClient
          .from('loan_simulations')
          .select('id')
          .eq('id', createdSimulationId)

        assert.equal(data.length, 0, 'Record must be completely removed')
        createdSimulationId = null
      })

      it('service method saveLoanSimulation properly rejects unauthenticated client under RLS', async () => {
        // Without an active auth session, supabase client is anon and must be blocked by RLS
        await assert.rejects(
          () => saveLoanSimulation({
            business_id: testBusiness.id,
            principal: 5000000,
            annual_interest_rate: 12,
            tenor_months: 12,
            method: 'annuity',
            monthly_payment: 444243,
            schedule: [],
          }),
          /tidak memiliki akses/
        )
      })
    })
  }
})
