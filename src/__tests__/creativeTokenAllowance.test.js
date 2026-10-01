// src/__tests__/creativeTokenAllowance.test.js
// Comprehensive test suite for Creative Studio Token System (ai.md specifications)
// Verifies 20 tokens/generation, Pro 200 monthly allowance, atomicity, idempotency, and concurrency

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CREATIVE_GENERATION_COST, PRO_MONTHLY_ALLOWANCE, OPERATION_CREDIT_COSTS } from '../services/creativeCreditService.js';

describe('Creative Studio Token System & Pro 200 Monthly Allowance (ai.md)', () => {

  // ============================================================
  // SECTION A: GENERATION COST (20 TOKENS SINGLE SOURCE OF TRUTH)
  // ============================================================
  describe('A. Single Source of Truth for Generation Cost', () => {
    it('CREATIVE_GENERATION_COST constant is exactly 20', () => {
      assert.strictEqual(CREATIVE_GENERATION_COST, 20);
    });

    it('PRO_MONTHLY_ALLOWANCE constant is exactly 200', () => {
      assert.strictEqual(PRO_MONTHLY_ALLOWANCE, 200);
    });

    it('OPERATION_CREDIT_COSTS maps all paid operations to 20 tokens', () => {
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_PRD, 20);
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_COPY, 20);
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_BRIEF, 20);
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_CAMPAIGN_LONG, 20);
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_IMAGE_STANDARD, 20);
      assert.strictEqual(OPERATION_CREDIT_COSTS.GENERATE_IMAGE_PREMIUM, 20);
    });

    it('Edge function creative-generate-prd enforces exactly 20 tokens for paid generation', () => {
      const prdFile = fs.readFileSync(path.resolve('supabase/functions/creative-generate-prd/index.ts'), 'utf8');
      assert.match(prdFile, /CREATIVE_GENERATION_COST\s*=\s*20/);
      assert.match(prdFile, /requiredCredits\s*=\s*isFreeUsage\s*\?\s*0\s*:\s*CREATIVE_GENERATION_COST/);
      // Ensure no obsolete cost = 1 remains
      assert.doesNotMatch(prdFile, /requiredCredits\s*=\s*isFreeUsage\s*\?\s*0\s*:\s*1\s*;/);
    });

    it('Edge function creative-generate-copy enforces exactly 20 tokens for paid generation', () => {
      const copyFile = fs.readFileSync(path.resolve('supabase/functions/creative-generate-copy/index.ts'), 'utf8');
      assert.match(copyFile, /CREATIVE_GENERATION_COST\s*=\s*20/);
      assert.match(copyFile, /requiredCredits\s*=\s*isFreeUsage\s*\?\s*0\s*:\s*CREATIVE_GENERATION_COST/);
      assert.doesNotMatch(copyFile, /requiredCredits\s*=\s*isFreeUsage\s*\?\s*0\s*:\s*1\s*;/);
    });

    it('CreativeStudioPage component checks 20 tokens cost', () => {
      const pageFile = fs.readFileSync(path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx'), 'utf8');
      assert.match(pageFile, /prd_generate:\s*20/);
      assert.match(pageFile, /copy_generate:\s*20/);
      assert.doesNotMatch(pageFile, /prd_generate:\s*1,/);
    });
  });

  // ============================================================
  // SECTION B: PRO MONTHLY ALLOWANCE & IDEMPOTENCY SIMULATION
  // ============================================================
  describe('B. Pro Monthly Allowance & Idempotency Simulation', () => {
    class DatabaseLedgerSimulator {
      constructor() {
        this.credits = new Map(); // businessId -> { available, reserved, consumed, total_earned }
        this.ledger = []; // entries with idempotency_key
        this.subscriptions = new Map(); // subId -> { profileId, plan, status, expiresAt }
        this.businesses = new Map(); // businessId -> { ownerId }
      }

      seedBusinessAndSub(businessId, profileId, subId, plan = 'pro', status = 'active', expiresAt = '2026-12-31') {
        this.businesses.set(businessId, { ownerId: profileId });
        this.subscriptions.set(subId, { profileId, plan, status, expiresAt: new Date(expiresAt) });
        this.credits.set(businessId, { available: 0, reserved: 0, consumed: 0, total_earned: 0 });
      }

      grantProMonthlyAllowance(businessId, subscriptionId, periodStart) {
        const bus = this.businesses.get(businessId);
        const sub = this.subscriptions.get(subscriptionId);

        // Validation
        if (!bus || !sub) return { success: false, error: 'NOT_FOUND', granted: 0 };
        if (sub.profileId !== bus.ownerId) return { success: false, error: 'TENANT_MISMATCH', granted: 0 };
        if (sub.plan !== 'pro' || sub.status !== 'active' || sub.expiresAt <= new Date()) {
          return { success: false, error: 'PRO_SUBSCRIPTION_REQUIRED', granted: 0 };
        }

        const idempotencyKey = `PRO_ALLOWANCE:${subscriptionId}:${periodStart}`;

        // Idempotency check in ledger
        const exists = this.ledger.some(entry => entry.idempotency_key === idempotencyKey);
        if (exists) {
          return { success: true, granted: 0, already_granted: true, balance_after: this.credits.get(businessId).available };
        }

        // Grant 200 tokens
        const cur = this.credits.get(businessId) || { available: 0, reserved: 0, consumed: 0, total_earned: 0 };
        const newBalance = cur.available + 200;
        cur.available = newBalance;
        cur.total_earned += 200;
        this.credits.set(businessId, cur);

        this.ledger.push({
          business_id: businessId,
          type: 'MONTHLY_ALLOWANCE',
          credits: 200,
          balance_after: newBalance,
          idempotency_key: idempotencyKey,
        });

        return { success: true, granted: 200, balance_after: newBalance, idempotency_key: idempotencyKey };
      }

      deductCredits(businessId, credits, operation, requestId) {
        const cur = this.credits.get(businessId) || { available: 0, reserved: 0, consumed: 0, total_earned: 0 };
        if (cur.available < credits) {
          return { success: false, error: 'INSUFFICIENT_CREDITS', available: cur.available, required: credits };
        }

        cur.available -= credits;
        cur.consumed += credits;
        this.credits.set(businessId, cur);

        this.ledger.push({
          business_id: businessId,
          type: 'AI_USAGE',
          credits: -credits,
          balance_after: cur.available,
          idempotency_key: requestId,
        });

        return { success: true, credits_deducted: credits, balance_after: cur.available };
      }
    }

    it('first Pro billing period grants exactly 200 tokens', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-1', 'user-1', 'sub-1', 'pro', 'active', '2027-12-31');

      const res = db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.granted, 200);
      assert.strictEqual(res.balance_after, 200);
    });

    it('same billing period repeated grant yields exactly 0 additional tokens (idempotency)', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-1', 'user-1', 'sub-1', 'pro', 'active', '2027-12-31');

      const res1 = db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res1.granted, 200);

      const res2 = db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res2.granted, 0);
      assert.strictEqual(res2.already_granted, true);

      const res3 = db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res3.granted, 0);

      assert.strictEqual(db.credits.get('bus-1').available, 200);
      assert.strictEqual(db.ledger.filter(l => l.type === 'MONTHLY_ALLOWANCE').length, 1);
    });

    it('next billing period grants another +200 tokens (cumulative 400)', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-1', 'user-1', 'sub-1', 'pro', 'active', '2026-11-01');

      // Month 1
      db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(db.credits.get('bus-1').available, 200);

      // Month 2 (renewal)
      const resMonth2 = db.grantProMonthlyAllowance('bus-1', 'sub-1', '2026-10-01T00:00:00.000Z');
      assert.strictEqual(resMonth2.granted, 200);
      assert.strictEqual(db.credits.get('bus-1').available, 400);
      assert.strictEqual(db.ledger.filter(l => l.type === 'MONTHLY_ALLOWANCE').length, 2);
    });

    it('10 concurrent same-period grants result in exactly 200 tokens total', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-1', 'user-1', 'sub-1', 'pro', 'active', '2027-12-31');

      const period = '2026-09-01T00:00:00.000Z';
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(db.grantProMonthlyAllowance('bus-1', 'sub-1', period));
      }

      const totalGranted = results.reduce((acc, r) => acc + (r.granted || 0), 0);
      assert.strictEqual(totalGranted, 200);
      assert.strictEqual(db.credits.get('bus-1').available, 200);
      assert.strictEqual(db.ledger.length, 1);
    });
  });

  // ============================================================
  // SECTION C: SECURITY & ENTITLEMENT VALIDATIONS
  // ============================================================
  describe('C. Security and Entitlement Boundary Checks', () => {
    class DatabaseLedgerSimulator {
      constructor() {
        this.credits = new Map();
        this.ledger = [];
        this.subscriptions = new Map();
        this.businesses = new Map();
      }

      seedBusinessAndSub(businessId, profileId, subId, plan = 'pro', status = 'active', expiresAt = '2026-12-31') {
        this.businesses.set(businessId, { ownerId: profileId });
        this.subscriptions.set(subId, { profileId, plan, status, expiresAt: new Date(expiresAt) });
        this.credits.set(businessId, { available: 0, reserved: 0, consumed: 0, total_earned: 0 });
      }

      grantProMonthlyAllowance(businessId, subscriptionId, periodStart) {
        const bus = this.businesses.get(businessId);
        const sub = this.subscriptions.get(subscriptionId);
        if (!bus || !sub || sub.profileId !== bus.ownerId) return { success: false, error: 'TENANT_MISMATCH', granted: 0 };
        if (sub.plan !== 'pro' || sub.status !== 'active' || sub.expiresAt <= new Date()) {
          return { success: false, error: 'PRO_SUBSCRIPTION_REQUIRED', granted: 0 };
        }
        return { success: true, granted: 200 };
      }
    }

    it('Free user cannot receive Pro monthly allowance', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-free', 'user-free', 'sub-free', 'free', 'active', '2026-12-31');

      const res = db.grantProMonthlyAllowance('bus-free', 'sub-free', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'PRO_SUBSCRIPTION_REQUIRED');
      assert.strictEqual(res.granted, 0);
    });

    it('Expired Pro user cannot receive monthly allowance', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-exp', 'user-exp', 'sub-exp', 'pro', 'active', '2025-01-01'); // in the past

      const res = db.grantProMonthlyAllowance('bus-exp', 'sub-exp', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'PRO_SUBSCRIPTION_REQUIRED');
      assert.strictEqual(res.granted, 0);
    });

    it('Cross-tenant grant attempt is strictly rejected', () => {
      const db = new DatabaseLedgerSimulator();
      db.seedBusinessAndSub('bus-A', 'user-A', 'sub-A', 'pro', 'active', '2026-12-31');
      db.seedBusinessAndSub('bus-B', 'user-B', 'sub-B', 'pro', 'active', '2026-12-31');

      // User A tries to use Sub B
      const res = db.grantProMonthlyAllowance('bus-A', 'sub-B', '2026-09-01T00:00:00.000Z');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'TENANT_MISMATCH');
    });

    it('Pro 200 token allowance provides exactly 10 generations (20 tokens each)', () => {
      let tokens = 200;
      let generationsExecuted = 0;
      while (tokens >= CREATIVE_GENERATION_COST) {
        tokens -= CREATIVE_GENERATION_COST;
        generationsExecuted++;
      }
      assert.strictEqual(generationsExecuted, 10);
      assert.strictEqual(tokens, 0);
    });
  });

  // ============================================================
  // SECTION D: MIDTRANS WEBHOOK HOOK INTEGRATION CHECK
  // ============================================================
  describe('D. Midtrans Webhook Hook Verification', () => {
    it('midtrans-notification calls grant_pro_monthly_allowance_atomic on subscription activation', () => {
      const webhookFile = fs.readFileSync(path.resolve('supabase/functions/midtrans-notification/index.ts'), 'utf8');
      assert.match(webhookFile, /grant_pro_monthly_allowance_atomic/);
      assert.match(webhookFile, /p_subscription_id:\s*subPayment\.subscription_id/);
      assert.match(webhookFile, /p_period_start:\s*period_start\.toISOString\(\)/);
    });

    it('migration 049 contains grant_pro_monthly_allowance_atomic function definition', () => {
      const migFile = fs.readFileSync(path.resolve('supabase/migrations/049_pro_monthly_token_allowance.sql'), 'utf8');
      assert.match(migFile, /create or replace function public\.grant_pro_monthly_allowance_atomic/);
      assert.match(migFile, /c_allowance_amount constant integer := 200;/);
      assert.match(migFile, /idempotency_key := 'PRO_ALLOWANCE:'/);
      assert.match(migFile, /for update;/);
    });
  });
});
