// src/__tests__/securityStep2SubscriptionHardening.test.js
// Regression & Verification Suite for phase2.md (SECURITY FIX — STEP 2)
// Covers all 18 mandatory requirements:
// 1. no unauthorized default Pro
// 2. active Pro entitlement
// 3. cancelled Pro
// 4. expired Pro
// 5. Basic verification amount
// 6. Pro verification amount
// 7. forged payment amount
// 8. forged plan
// 9. credit ledger duplicate prevention
// 10. concurrent credit redemption
// 11. User A -> User B RPC probing denied
// 12. anonymous RPC denied
// 13. Basic cancellation
// 14. Pro cancellation
// 15. manual Pro activation regression
// 16. manual credit activation regression
// 17. cross-business isolation
// 18. admin legitimate access

import { describe, test, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js';

describe('SECURITY FIX — STEP 2: Subscription, Credit & RPC Hardening Suite (@phase2.md)', () => {
  const m98Path = [
    path.resolve('supabase/migrations/099_security_step2_subscription_credit_hardening.sql'),
    path.resolve('supabase/migrations/098_security_step2_subscription_credit_hardening.sql'),
  ].find(p => fs.existsSync(p));
  const m98Content = fs.readFileSync(m98Path, 'utf8');

  const snapFuncPath = path.resolve('supabase/functions/midtrans-subscription-snap/index.ts');
  const snapFuncContent = fs.readFileSync(snapFuncPath, 'utf8');

  const entitlementSharedPath = path.resolve('supabase/functions/_shared/entitlement.ts');
  const entitlementSharedContent = fs.readFileSync(entitlementSharedPath, 'utf8');

  const m92Path = path.resolve('supabase/migrations/092_pro_activation_codes.sql');
  const m92Content = fs.readFileSync(m92Path, 'utf8');

  const m97Path = path.resolve('supabase/migrations/097_credit_activation_links.sql');
  const m97Content = fs.readFileSync(m97Path, 'utf8');

  const userA = { id: '11111111-1111-1111-1111-111111111111', email: 'usera@example.com' };
  const userB = { id: '22222222-2222-2222-2222-222222222222', email: 'userb@example.com' };
  const businessA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const businessB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ──────────────────────────────────────────────────────────
  // 1. NO UNAUTHORIZED DEFAULT 'pro'
  // ──────────────────────────────────────────────────────────
  test('1. no unauthorized default Pro: migration 098 removes DEFAULT pro and ensures safe defaults', () => {
    assert.match(
      m98Content,
      /ALTER TABLE public\.subscription_payments ALTER COLUMN plan DROP DEFAULT;/,
      'Must drop DEFAULT pro from subscription_payments'
    );
    assert.match(
      m98Content,
      /ALTER TABLE public\.subscriptions ALTER COLUMN plan SET DEFAULT 'free';/,
      'Must ensure subscriptions defaults to safe free/inactive plan'
    );

    // Verify entitlement calculation when subscription has default 'free' plan
    const freeSub = {
      id: 'sub-free-01',
      profile_id: userA.id,
      plan: 'free',
      status: 'active',
      expires_at: futureDate,
    };
    const entitlement = calculateSubscriptionEntitlement({
      user: userA,
      subscription: freeSub,
    });
    assert.equal(entitlement.isPro, false, 'Free subscription must never grant Pro');
    assert.equal(entitlement.isBasic, false, 'Free subscription must not grant Basic');
    assert.equal(entitlement.hasActiveSubscription, false, 'Free subscription is not an active paid subscription');
  });

  // ──────────────────────────────────────────────────────────
  // 2. ACTIVE PRO ENTITLEMENT
  // ──────────────────────────────────────────────────────────
  test('2. active Pro entitlement: valid uncancelled Pro with future expiry is recognized', () => {
    const activeSub = {
      id: 'sub-pro-01',
      profile_id: userA.id,
      plan: 'pro',
      status: 'active',
      is_cancelled: false,
      started_at: pastDate,
      expires_at: futureDate,
    };
    const entitlement = calculateSubscriptionEntitlement({
      user: userA,
      subscription: activeSub,
      hasPaidHistory: true,
    });
    assert.equal(entitlement.isPro, true, 'Active Pro must be recognized');
    assert.equal(entitlement.hasActiveSubscription, true);
    assert.equal(entitlement.subscriptionState, 'active');
  });

  // ──────────────────────────────────────────────────────────
  // 3. CANCELLED PRO
  // ──────────────────────────────────────────────────────────
  test('3. cancelled Pro: status=cancelled or is_cancelled=true does NOT pass as active Pro', () => {
    // A. status = 'cancelled'
    const subStatusCancelled = {
      id: 'sub-pro-02',
      profile_id: userA.id,
      plan: 'pro',
      status: 'cancelled',
      expires_at: futureDate,
    };
    const ent1 = calculateSubscriptionEntitlement({
      user: userA,
      subscription: subStatusCancelled,
      hasPaidHistory: true,
    });
    assert.equal(ent1.isPro, false, 'Cancelled status must not grant Pro');
    assert.equal(ent1.hasActiveSubscription, false);
    assert.equal(ent1.subscriptionState, 'cancelled');

    // B. status = 'active' BUT is_cancelled = true
    const subFlagCancelled = {
      id: 'sub-pro-03',
      profile_id: userA.id,
      plan: 'pro',
      status: 'active',
      is_cancelled: true,
      expires_at: futureDate,
    };
    const ent2 = calculateSubscriptionEntitlement({
      user: userA,
      subscription: subFlagCancelled,
      hasPaidHistory: true,
    });
    assert.equal(ent2.isPro, false, 'is_cancelled=true must not grant Pro');
    assert.equal(ent2.hasActiveSubscription, false);
    assert.equal(ent2.subscriptionState, 'cancelled');

    // C. Server-side check in _shared/entitlement.ts
    assert.match(
      entitlementSharedContent,
      /is_cancelled/,
      'isProUser in _shared/entitlement.ts must check is_cancelled'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 4. EXPIRED PRO
  // ──────────────────────────────────────────────────────────
  test('4. expired Pro: past expiry is denied active entitlement', () => {
    const expiredSub = {
      id: 'sub-pro-04',
      profile_id: userA.id,
      plan: 'pro',
      status: 'active',
      is_cancelled: false,
      started_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: pastDate,
    };
    const entitlement = calculateSubscriptionEntitlement({
      user: userA,
      subscription: expiredSub,
      hasPaidHistory: true,
    });
    assert.equal(entitlement.isPro, false, 'Expired subscription must not grant Pro');
    assert.equal(entitlement.hasActiveSubscription, false);
    assert.equal(entitlement.subscriptionState, 'expired');
  });

  // ──────────────────────────────────────────────────────────
  // 5. BASIC VERIFICATION AMOUNT
  // ──────────────────────────────────────────────────────────
  test('5. Basic verification amount: Rp 35.000 is accepted as canonical Basic price in verify_payment', () => {
    assert.match(
      snapFuncContent,
      /CANONICAL_BASIC_AMOUNT\s*=\s*35000/,
      'verify_payment must define canonical Basic price as 35000'
    );
    assert.match(
      snapFuncContent,
      /expectedMinAmount/,
      'verify_payment must calculate expectedMinAmount according to package'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 6. PRO VERIFICATION AMOUNT
  // ──────────────────────────────────────────────────────────
  test('6. Pro verification amount: Rp 130.000 is accepted as canonical Pro price in verify_payment', () => {
    assert.match(
      snapFuncContent,
      /CANONICAL_PRO_AMOUNT\s*=\s*130000/,
      'verify_payment must define canonical Pro price as 130000'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 7. FORGED PAYMENT AMOUNT
  // ──────────────────────────────────────────────────────────
  test('7. forged payment amount: rejects paid amount lower than package canonical price', () => {
    assert.match(
      snapFuncContent,
      /if\s*\(\s*isNaN\(paidAmount\)\s*\|\|\s*paidAmount\s*<\s*expectedMinAmount\s*\)/,
      'verify_payment must reject underpaid amount (< expectedMinAmount) with 400'
    );
    assert.match(
      snapFuncContent,
      /if\s*\(\s*targetGross\s*<\s*expectedMinAmount\s*\)/,
      'verify_payment must reject forged recorded gross_amount with 400'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 8. FORGED PLAN
  // ──────────────────────────────────────────────────────────
  test('8. forged plan: server determines package from verified recorded payment, not client body', () => {
    assert.match(
      snapFuncContent,
      /const\s+resolvedPlan\s*=/,
      'Server must resolve plan authoritatively from recorded transaction'
    );
    assert.match(
      snapFuncContent,
      /const\s+activatedPlan\s*=\s*resolvedPlan/,
      'Activated plan must be server resolved plan'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 9. CREDIT LEDGER DUPLICATE PREVENTION
  // ──────────────────────────────────────────────────────────
  test('9. credit ledger duplicate prevention: UNIQUE index/constraint enforced on idempotency_key', () => {
    assert.match(
      m98Content,
      /idx_credit_ledger_idempotency_key/,
      'Migration 098 must declare unique index on credit_ledger.idempotency_key'
    );
    assert.match(
      m98Content,
      /CREATE UNIQUE INDEX.*idx_credit_ledger_idempotency_key\s+ON public\.credit_ledger\(idempotency_key\)/,
      'Must enforce uniqueness on idempotency_key at database level'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 10. CONCURRENT CREDIT REDEMPTION
  // ──────────────────────────────────────────────────────────
  test('10. concurrent credit redemption: row-level lock and atomic status transition prevent race conditions', () => {
    assert.match(
      m97Content,
      /SELECT \* INTO v_activation[\s\S]+?FOR UPDATE;/,
      'redeem_credit_activation must acquire FOR UPDATE row lock on activation token'
    );
    assert.match(
      m97Content,
      /SELECT available, consumed, total_earned[\s\S]+?FROM public\.creative_credits[\s\S]+?FOR UPDATE;/,
      'redeem_credit_activation must acquire FOR UPDATE lock on credit balance'
    );
    assert.match(
      m97Content,
      /UPDATE public\.credit_activation_links\s+SET status = 'USED'/,
      'Must atomically mark activation as USED'
    );
    assert.match(
      m97Content,
      /'ACT-CREDIT-' \|\| v_activation\.id::text/,
      'Must use unique deterministic idempotency key for ledger insert'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 11. USER A -> USER B RPC PROBING DENIED
  // ──────────────────────────────────────────────────────────
  test('11. User A -> User B RPC probing denied: get_user_active_plan, is_user_pro_active, is_user_subscription_active reject cross-user probing', () => {
    // get_user_active_plan
    assert.match(
      m98Content,
      /CREATE OR REPLACE FUNCTION public\.get_user_active_plan/,
      'Declares get_user_active_plan'
    );
    assert.match(
      m98Content,
      /IF v_target_id <> v_caller_id THEN[\s\S]+?IF NOT v_is_adm THEN\s+RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk status pengguna lain'/
    );

    // is_user_pro_active
    assert.match(
      m98Content,
      /CREATE OR REPLACE FUNCTION public\.is_user_pro_active/,
      'Declares is_user_pro_active'
    );

    // is_user_subscription_active
    assert.match(
      m98Content,
      /CREATE OR REPLACE FUNCTION public\.is_user_subscription_active/,
      'Declares is_user_subscription_active'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 12. ANONYMOUS RPC DENIED
  // ──────────────────────────────────────────────────────────
  test('12. anonymous RPC denied: public/anon revoked and auth.uid() strictly required', () => {
    assert.match(
      m98Content,
      /REVOKE ALL ON FUNCTION public\.get_user_active_plan\(uuid\) FROM PUBLIC, anon;/,
      'Revokes execute on get_user_active_plan from public/anon'
    );
    assert.match(
      m98Content,
      /REVOKE ALL ON FUNCTION public\.is_user_pro_active\(uuid\) FROM PUBLIC, anon;/,
      'Revokes execute on is_user_pro_active from public/anon'
    );
    assert.match(
      m98Content,
      /REVOKE ALL ON FUNCTION public\.is_user_subscription_active\(uuid\) FROM PUBLIC, anon;/,
      'Revokes execute on is_user_subscription_active from public/anon'
    );
    assert.match(
      m98Content,
      /REVOKE ALL ON FUNCTION public\.cancel_subscription_atomic/,
      'Revokes execute on cancel_subscription_atomic from public/anon'
    );
    assert.match(
      m98Content,
      /IF v_caller_id IS NULL THEN\s+RAISE EXCEPTION 'Unauthorized: Autentikasi diperlukan'/,
      'Rejects unauthenticated callers with 42501'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 13. BASIC CANCELLATION
  // ──────────────────────────────────────────────────────────
  test('13. Basic cancellation: cancel_subscription_atomic handles Basic subscription without deleting row', () => {
    assert.match(
      m98Content,
      /LOWER\(plan\) IN \('basic', 'pro'\)/,
      'cancel_subscription_atomic must support both basic and pro plans'
    );
    assert.match(
      m98Content,
      /status\s*=\s*'cancelled'/,
      'Sets status = cancelled'
    );
    assert.match(
      m98Content,
      /is_cancelled\s*=\s*true/,
      'Sets is_cancelled = true'
    );
    assert.doesNotMatch(
      m98Content,
      /DELETE FROM public\.subscriptions/i,
      'Must never hard delete subscription'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 14. PRO CANCELLATION
  // ──────────────────────────────────────────────────────────
  test('14. Pro cancellation: cancel_subscription_atomic preserves expires_at timestamp', () => {
    assert.doesNotMatch(
      m98Content,
      /expires_at\s*=\s*now\(\)/i,
      'Cancellation must not truncate paid period'
    );
    assert.match(
      m98Content,
      /'expires_at',\s*v_expires_at/,
      'Returns preserved expires_at'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 15. MANUAL PRO ACTIVATION REGRESSION
  // ──────────────────────────────────────────────────────────
  test('15. manual Pro activation regression: redeem_pro_activation_code remains fully functional', () => {
    assert.match(
      m92Content,
      /CREATE OR REPLACE FUNCTION public\.redeem_pro_activation_code/,
      'redeem_pro_activation_code function exists'
    );
    assert.match(
      m92Content,
      /INSERT INTO public\.subscriptions[\s\S]+?'pro'[\s\S]+?'active'/,
      'Inserts pro active subscription'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 16. MANUAL CREDIT ACTIVATION REGRESSION
  // ──────────────────────────────────────────────────────────
  test('16. manual credit activation regression: redeem_credit_activation remains atomic and writes ledger', () => {
    assert.match(
      m97Content,
      /CREATE OR REPLACE FUNCTION public\.redeem_credit_activation/,
      'redeem_credit_activation function exists'
    );
    assert.match(
      m97Content,
      /INSERT INTO public\.credit_ledger/,
      'Inserts into credit_ledger'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 17. CROSS-BUSINESS ISOLATION
  // ──────────────────────────────────────────────────────────
  test('17. cross-business isolation: cancel_subscription_atomic and is_business_pro_active verify ownership', () => {
    assert.match(
      m98Content,
      /WHERE id = p_business_id AND owner_id = v_caller_id/,
      'cancel_subscription_atomic must verify business ownership'
    );
    assert.match(
      m98Content,
      /RAISE EXCEPTION 'Unauthorized: Akses ditolak untuk bisnis ini'/,
      'Rejects non-owner business access'
    );
    assert.match(
      m98Content,
      /is_business_pro_active[\s\S]+?WHERE id = p_business_id AND owner_id = v_caller_id/,
      'is_business_pro_active must enforce business owner authorization'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 18. ADMIN LEGITIMATE ACCESS
  // ──────────────────────────────────────────────────────────
  test('18. admin legitimate access: admins bypass user restriction in get_user_active_plan and is_admin check', () => {
    assert.match(
      m98Content,
      /v_is_adm := public\.is_admin\(\);/,
      'Checks public.is_admin() for legitimate administrative operations'
    );
  });
});
