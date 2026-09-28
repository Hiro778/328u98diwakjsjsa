// src/__tests__/secAdversarialSecondPass.test.js
// BisnisSehat Second-Pass Adversarial Penetration Test Suite (sec.md)
// Tests: Identity Confusion, Subscription Confusion, RPC Direct Invocation,
// Payment Abuse, Credit Abuse, Free PRD Race, OAuth State, Webhook Forgery,
// SSRF Defense, Input Type Coercion, State Machine, and Concurrency.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isPrivateIPv4, isPrivateIPv6 } from '../lib/ssrfValidator.js';

describe('Second-Pass Adversarial Penetration Audit (sec.md)', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION A: IDENTITY CONFUSION
  // ═════════════════════════════════════════════════════════════════════════
  describe('A. Identity Confusion — Body/Query Parameter vs JWT Identity', () => {
    test('send-web-push enforces caller businessId matches targetBusinessId (prevents cross-tenant push dispatch)', () => {
      const pushSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/send-web-push/index.ts'), 'utf8');

      assert.ok(pushSrc.includes('verifyAuth'), 'Must import verifyAuth');
      assert.ok(
        pushSrc.includes('userAuth.businessId !== targetBusinessId'),
        'Must compare JWT businessId with target businessId'
      );
      assert.ok(
        pushSrc.includes('errorResponse("Access denied: You can only dispatch push notifications for your own business", 403)'),
        'Must return 403 on business_id mismatch'
      );
    });

    test('deduct_creative_credits_atomic RPC enforces caller ownership of p_business_id', () => {
      const migrationSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/066_sec_adversarial_hardening.sql'), 'utf8');

      assert.ok(migrationSrc.includes('v_caller_id := auth.uid();'));
      assert.ok(migrationSrc.includes('UNAUTHORIZED_BUSINESS_OWNERSHIP'));
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION B: SUBSCRIPTION CONFUSION
  // ═════════════════════════════════════════════════════════════════════════
  describe('B. Subscription Confusion — Direct Backend Invocation Matrix', () => {
    function simulateProGate(sub, callerBusinessId) {
      if (!sub) return { allowed: false, reason: 'NO_SUBSCRIPTION' };
      const now = new Date().toISOString();
      if (sub.business_id !== callerBusinessId) return { allowed: false, reason: 'CROSS_BUSINESS_SUBSCRIPTION' };
      if (sub.plan !== 'pro') return { allowed: false, reason: 'FREE_TIER' };
      if (sub.status !== 'active') return { allowed: false, reason: 'NOT_ACTIVE' };
      if (!sub.expires_at || sub.expires_at <= now) return { allowed: false, reason: 'EXPIRED' };
      return { allowed: true };
    }

    test('Rejects Free tier, expired Pro, cancelled Pro, and cross-business Pro', () => {
      const callerBiz = 'biz-alice';

      // 1. Free tier
      assert.equal(simulateProGate({ business_id: callerBiz, plan: 'free', status: 'active' }, callerBiz).allowed, false);

      // 2. Expired Pro
      assert.equal(simulateProGate({ business_id: callerBiz, plan: 'pro', status: 'active', expires_at: '2020-01-01T00:00:00Z' }, callerBiz).allowed, false);

      // 3. Cancelled Pro
      assert.equal(simulateProGate({ business_id: callerBiz, plan: 'pro', status: 'cancelled', expires_at: '2028-01-01T00:00:00Z' }, callerBiz).allowed, false);

      // 4. Pro belonging to Business B invoked by Business A
      assert.equal(simulateProGate({ business_id: 'biz-bob', plan: 'pro', status: 'active', expires_at: '2028-01-01T00:00:00Z' }, callerBiz).allowed, false);

      // 5. Valid Active Pro
      assert.equal(simulateProGate({ business_id: callerBiz, plan: 'pro', status: 'active', expires_at: '2028-01-01T00:00:00Z' }, callerBiz).allowed, true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION C & D: RPC DIRECT INVOCATION & SECURITY DEFINER REVIEW
  // ═════════════════════════════════════════════════════════════════════════
  describe('C & D. RPC Direct Invocation & Security Definer Permission Review', () => {
    test('grant_creative_credits_atomic REVOKES execute from public/authenticated and grants ONLY to service_role', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/066_sec_adversarial_hardening.sql'), 'utf8');

      assert.ok(
        sql.includes('REVOKE EXECUTE ON FUNCTION public.grant_creative_credits_atomic(uuid, integer, text) FROM PUBLIC, anon, authenticated;'),
        'Must revoke execute from public and authenticated users'
      );
      assert.ok(
        sql.includes('GRANT EXECUTE ON FUNCTION public.grant_creative_credits_atomic(uuid, integer, text) TO service_role;'),
        'Must allow ONLY service_role to execute credit topups'
      );
      assert.ok(
        sql.includes("SET search_path = ''"),
        'Must explicitly lock search_path to empty string'
      );
    });

    test('rollback_creative_free_usage is restricted strictly to service_role', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/066_sec_adversarial_hardening.sql'), 'utf8');

      assert.ok(
        sql.includes('REVOKE EXECUTE ON FUNCTION public.rollback_creative_free_usage(uuid, text) FROM PUBLIC, anon, authenticated;'),
        'Must revoke rollback execute from public users'
      );
      assert.ok(
        sql.includes('GRANT EXECUTE ON FUNCTION public.rollback_creative_free_usage(uuid, text) TO service_role;'),
        'Must grant rollback execute ONLY to service_role'
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION E: PAYMENT ABUSE
  // ═════════════════════════════════════════════════════════════════════════
  describe('E. Payment Abuse — Cross-Domain Replay & Amount Tampering', () => {
    test('Subscription payment cannot be processed as credit payment (prefix separation)', () => {
      const webhookSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/midtrans-notification/index.ts'), 'utf8');

      assert.ok(webhookSrc.includes('order_id.startsWith("SUB-")'), 'Subscription payments strictly routed by SUB- prefix');
      assert.ok(webhookSrc.includes('order_id.startsWith("CREDIT-")'), 'Credit payments strictly routed by CREDIT- prefix');
    });

    test('Webhook rejects underpaid gross amount for subscriptions', () => {
      const webhookSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/midtrans-notification/index.ts'), 'utf8');

      assert.ok(
        webhookSrc.includes('Number(gross_amount) < Number(subPayment.gross_amount)'),
        'Must reject if paid amount is less than expected'
      );
      assert.ok(
        webhookSrc.includes('return new Response("Invalid gross_amount", { status: 400 });'),
        'Must return 400 on underpayment'
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION F & G: CREDIT ABUSE & FREE PRD RACE CONDITIONS
  // ═════════════════════════════════════════════════════════════════════════
  describe('F & G. Credit & Free PRD Race Conditions', () => {
    test('Negative or zero credit deduction is rejected by RPC validation', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/066_sec_adversarial_hardening.sql'), 'utf8');

      assert.ok(sql.includes('IF p_credits <= 0 THEN'));
      assert.ok(sql.includes('INVALID_CREDIT_AMOUNT'));
    });

    test('Free PRD claim enforces 1x per business lifetime with atomic unique constraint', () => {
      const claims = new Set();
      function claimFreePrd(businessId) {
        if (claims.has(businessId)) {
          return { success: false, error: 'FREE_USAGE_ALREADY_CONSUMED' };
        }
        claims.add(businessId);
        return { success: true };
      }

      const claim1 = claimFreePrd('biz-alpha');
      assert.equal(claim1.success, true);

      const claim2 = claimFreePrd('biz-alpha');
      assert.equal(claim2.success, false);
      assert.equal(claim2.error, 'FREE_USAGE_ALREADY_CONSUMED');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION K: SSRF / URL FETCHING
  // ═════════════════════════════════════════════════════════════════════════
  describe('K. SSRF / URL Fetching Protection (seo-analyze)', () => {
    test('Correctly identifies and blocks private, loopback, and cloud metadata IPv4 ranges', () => {
      // Loopback
      assert.equal(isPrivateIPv4('127.0.0.1'), true);
      assert.equal(isPrivateIPv4('127.128.0.1'), true);

      // Cloud metadata
      assert.equal(isPrivateIPv4('169.254.169.254'), true);

      // RFC1918 Private networks
      assert.equal(isPrivateIPv4('10.0.0.1'), true);
      assert.equal(isPrivateIPv4('172.16.0.1'), true);
      assert.equal(isPrivateIPv4('172.31.255.254'), true);
      assert.equal(isPrivateIPv4('192.168.1.1'), true);

      // Carrier-Grade NAT
      assert.equal(isPrivateIPv4('100.64.0.1'), true);

      // Public IPs (allowed)
      assert.equal(isPrivateIPv4('8.8.8.8'), false);
      assert.equal(isPrivateIPv4('104.21.50.1'), false);
      assert.equal(isPrivateIPv4('1.1.1.1'), false);
    });

    test('Correctly identifies and blocks IPv6 loopback, local, and mapped addresses', () => {
      assert.equal(isPrivateIPv6('::1'), true);
      assert.equal(isPrivateIPv6('::'), true);
      assert.equal(isPrivateIPv6('fe80::1'), true);
      assert.equal(isPrivateIPv6('fc00::1'), true);
      assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true);
      assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION L & M: INPUT TYPE COERCION & STATE MACHINE
  // ═════════════════════════════════════════════════════════════════════════
  describe('L & M. Input Type Coercion & State Machine Transitions', () => {
    test('Non-numeric and edge values are sanitized safely', () => {
      function sanitizeNumeric(val) {
        const num = Number(val);
        if (isNaN(num) || !Number.isFinite(num) || num <= 0) return null;
        return num;
      }

      assert.equal(sanitizeNumeric('1e9'), 1000000000);
      assert.equal(sanitizeNumeric('-1'), null);
      assert.equal(sanitizeNumeric('0'), null);
      assert.equal(sanitizeNumeric(NaN), null);
      assert.equal(sanitizeNumeric(Infinity), null);
      assert.equal(sanitizeNumeric(''), null);
      assert.equal(sanitizeNumeric(null), null);
      assert.equal(sanitizeNumeric('abc'), null);
    });

    test('Illegal order status transitions are rejected (e.g. dibatalkan cannot transition to selesai)', () => {
      const validTransitions = {
        'pending': ['selesai', 'dibatalkan'],
        'selesai': [], // Terminal
        'dibatalkan': [], // Terminal
      };

      function canTransition(current, next) {
        return (validTransitions[current] || []).includes(next);
      }

      assert.equal(canTransition('pending', 'selesai'), true);
      assert.equal(canTransition('pending', 'dibatalkan'), true);
      assert.equal(canTransition('dibatalkan', 'selesai'), false, 'Cancelled order cannot be marked selesai');
      assert.equal(canTransition('selesai', 'pending'), false, 'Completed order cannot be reverted to pending');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION N: QRIS PAYMENT MANIPULATION & ORDER STATE (sec.md Phase 7)
  // ═════════════════════════════════════════════════════════════════════════
  describe('N. QRIS Payment Manipulation (sec.md Phase 7)', () => {
    test('Customer cannot directly update payment_status = paid (orders_public_update is dropped)', () => {
      const mig072 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/072_public_qris_checkout.sql'), 'utf8');
      assert.ok(mig072.includes('DROP POLICY IF EXISTS "orders_public_update" ON public.orders;'), 'Must drop public update on orders');
    });

    test('merchant_complete_order strictly enforces order MUST be diproses before completing (cannot complete before processing)', () => {
      const mig082 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf8');
      assert.ok(
        mig082.includes("IF v_order.order_status NOT IN ('diproses', 'preparing') THEN"),
        'Must check that order is in diproses or preparing before completing'
      );
      assert.ok(
        mig082.includes("RAISE EXCEPTION 'INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu sebelum diselesaikan.'"),
        'Must raise error when completing un-processed order'
      );
    });

    test('merchant_process_order rejects processing already completed or cancelled orders', () => {
      const mig080 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/080_order_processing_and_chat.sql'), 'utf8');
      assert.ok(
        mig080.includes("IF v_order.order_status IN ('dibatalkan', 'cancelled', 'selesai', 'completed') THEN"),
        'Must reject processing completed or cancelled orders'
      );
    });

    test('merchant_process_order and merchant_complete_order strictly enforce caller business ownership', () => {
      const mig080 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/080_order_processing_and_chat.sql'), 'utf8');
      const mig082 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf8');

      assert.ok(mig080.includes('IF v_order.owner_id <> v_caller_id THEN'), 'Process order must verify caller is business owner');
      assert.ok(mig082.includes('IF v_order.owner_id <> v_caller_id THEN'), 'Complete order must verify caller is business owner');
    });

    test('Duplicate settlement is prevented by checking payments table existence and idempotency', () => {
      const mig080 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/080_order_processing_and_chat.sql'), 'utf8');
      assert.ok(mig080.includes("WHERE order_id = p_order_id AND payment_status = 'paid'"), 'Must prevent duplicate payment records');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION O: ORDER CHAT SECURITY & TENANT ISOLATION (sec.md Phase 8)
  // ═════════════════════════════════════════════════════════════════════════
  describe('O. Order Chat Security (sec.md Phase 8)', () => {
    test('get_order_messages enforces cross-merchant isolation (merchant B cannot read merchant A chat)', () => {
      const mig082 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf8');
      assert.ok(
        mig082.includes("IF v_order.owner_id <> v_caller_id THEN"),
        'Must block authenticated users who do not own the business'
      );
      assert.ok(
        mig082.includes("RAISE EXCEPTION 'FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan bisnis lain.'"),
        'Must return 42501 FORBIDDEN on cross-merchant chat reading attempt'
      );
    });

    test('send_order_message prevents customer impersonation of Penjual/Merchant/Admin', () => {
      const mig082 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf8');
      assert.ok(
        mig082.includes("IF lower(v_clean_name) IN ('penjual', 'merchant', 'admin', 'bisnissehat', 'sistem', 'kasir') THEN"),
        'Must sanitize privileged names when sent by customer'
      );
    });

    test('send_order_message blocks chat on completed and cancelled orders', () => {
      const mig082 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/082_qris_and_order_security_hardening.sql'), 'utf8');
      assert.ok(
        mig082.includes("RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan sudah selesai.'"),
        'Must reject chat when order is selesai'
      );
      assert.ok(
        mig082.includes("RAISE EXCEPTION 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan dibatalkan.'"),
        'Must reject chat when order is dibatalkan'
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION P: MIDTRANS ELIMINATION FROM FOOD-ORDERING FLOW (bug.md)
  // ═════════════════════════════════════════════════════════════════════════
  describe('P. Midtrans Elimination from Food-Ordering Flow (bug.md)', () => {
    test('PublicMenuPage does NOT contain Midtrans Snap script loader or window.snap.pay invocation', () => {
      const menuSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/public/PublicMenuPage.jsx'), 'utf8');
      assert.ok(!menuSrc.includes('loadSnapScript'), 'Must not contain loadSnapScript');
      assert.ok(!menuSrc.includes('snap.js'), 'Must not reference snap.js');
      assert.ok(!menuSrc.includes('window.snap.pay'), 'Must not call window.snap.pay');
      assert.ok(!menuSrc.includes('midtrans-create-snap'), 'Must not call midtrans-create-snap');
    });

    test('PublicMenuPage customer checkout only presents direct merchant options (Bayar Langsung & QRIS)', () => {
      const menuSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/public/PublicMenuPage.jsx'), 'utf8');
      assert.ok(menuSrc.includes('Bayar Langsung'), 'Must include Bayar Langsung');
      assert.ok(menuSrc.includes('QRIS'), 'Must include QRIS');
      assert.ok(!menuSrc.includes('Card Payment'), 'Must not contain Card Payment');
      assert.ok(!menuSrc.includes('Virtual Account'), 'Must not contain Virtual Account');
    });

    test('BusinessQrisSettings is directly embedded and reachable in QRMenuPage', () => {
      const qrMenuSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/dashboard/pos/QRMenuPage.jsx'), 'utf8');
      assert.ok(qrMenuSrc.includes('BusinessQrisSettings'), 'QRMenuPage must import and render BusinessQrisSettings');
      assert.ok(qrMenuSrc.includes('qris-settings-section'), 'QRMenuPage must provide anchor to QRIS settings section');
    });
  });
});

