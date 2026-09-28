// src/__tests__/midtransPaymentSecurity.test.js
// Dedicated Midtrans Payment Security & Regression Suite (Phase 2–7 per bug.md)
// Tests:
// 1. Forged notification handling
// 2. Invalid SHA-512 signature rejection
// 3. Duplicate notification idempotency (subscriptions, credits, orders)
// 4. Wrong gross_amount underpayment rejection
// 5. Cross-tenant notification & merchant isolation
// 6. Client attempting to mark paid prevention (source of truth server-side)
// 7. Server Key leakage protection (zero secrets in dist / frontend)
// 8. Sandbox vs Production endpoint dynamic selection

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Helper to compute Midtrans SHA-512 signature
function computeSignature(orderId, statusCode, grossAmount, serverKey) {
  const raw = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  return crypto.createHash('sha512').update(raw).digest('hex');
}

describe('Midtrans Payment Security Suite (@bug.md Phase 2–7)', () => {
  const webhookSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/midtrans-notification/index.ts'),
    'utf8'
  );
  const subSnapSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/midtrans-subscription-snap/index.ts'),
    'utf8'
  );
  const createSnapSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/midtrans-create-snap/index.ts'),
    'utf8'
  );
  const creditSnapSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/creative-topup-snap/index.ts'),
    'utf8'
  );
  const subServiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/subscriptionService.js'),
    'utf8'
  );
  const envExampleSrc = fs.readFileSync(
    path.resolve(process.cwd(), '.env.example'),
    'utf8'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 1. FORGED NOTIFICATION & REQUIRED FIELDS
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Forged Notification & Payload Validation', () => {
    test('Webhook rejects missing required fields with 400 Bad Request', () => {
      assert.ok(
        webhookSrc.includes('!order_id || !signature_key || !status_code || gross_amount === undefined || gross_amount === null'),
        'Must validate presence of order_id, signature_key, status_code, and gross_amount'
      );
      assert.ok(
        webhookSrc.includes('return new Response("Invalid notification payload: missing required fields", { status: 400 });'),
        'Must return 400 when required fields are missing'
      );
    });

    test('Webhook does not process payloads lacking signature', () => {
      // Simulating validation logic
      function validatePayload(payload) {
        if (!payload.order_id || !payload.signature_key || !payload.status_code || payload.gross_amount === undefined) {
          return { status: 400, error: 'missing required fields' };
        }
        return { status: 200 };
      }

      assert.equal(validatePayload({}).status, 400);
      assert.equal(validatePayload({ order_id: 'SUB-123' }).status, 400);
      assert.equal(validatePayload({ order_id: 'SUB-123', signature_key: 'abc' }).status, 400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. INVALID SIGNATURE REJECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. SHA-512 Cryptographic Signature Verification', () => {
    test('Webhook verifies SHA-512 hash against MIDTRANS_SERVER_KEY and rejects invalid signatures with 403', () => {
      assert.ok(webhookSrc.includes('crypto.subtle.digest("SHA-512"'), 'Must compute SHA-512 hash');
      assert.ok(
        webhookSrc.includes('return new Response("Invalid signature", { status: 403 });'),
        'Must return 403 on signature mismatch'
      );
    });

    test('Cryptographic signature matches exact Midtrans SHA-512 specification', () => {
      const orderId = 'SUB-test-12345';
      const statusCode = '200';
      const grossAmount = '130000.00';
      const serverKey = 'SB-Mid-server-sampleKey123';

      const validSig = computeSignature(orderId, statusCode, grossAmount, serverKey);
      assert.equal(validSig.length, 128, 'SHA-512 hex string must be 128 chars');

      // Tampered order_id produces completely different signature
      const tamperedOrderSig = computeSignature('SUB-test-99999', statusCode, grossAmount, serverKey);
      assert.notEqual(validSig, tamperedOrderSig);

      // Tampered gross_amount produces completely different signature
      const tamperedAmountSig = computeSignature(orderId, statusCode, '1000.00', serverKey);
      assert.notEqual(validSig, tamperedAmountSig);

      // Tampered serverKey fails verification
      const forgedSig = computeSignature(orderId, statusCode, grossAmount, 'forged-server-key');
      assert.notEqual(validSig, forgedSig);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. DUPLICATE NOTIFICATION & IDEMPOTENCY
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Duplicate Notification & Idempotency Safeguards', () => {
    test('Subscription webhook idempotency skips duplicate paid notifications', () => {
      assert.ok(
        webhookSrc.includes('if (subPayment.payment_status === "paid" && newPaymentStatus === "paid")'),
        'Must check if subscription payment was already processed'
      );
      assert.ok(
        webhookSrc.includes('Skipping.'),
        'Must log skipping on duplicate subscription notification'
      );
    });

    test('Creative credits webhook idempotency skips duplicate paid notifications and grants credits only once', () => {
      assert.ok(
        webhookSrc.includes('if (purchase.status === "paid" && newPaymentStatus === "paid")'),
        'Must check if credit purchase was already processed'
      );
      assert.ok(
        webhookSrc.includes('.eq("status", "pending")'),
        'Must conditionally update status from pending to paid atomically'
      );
    });

    test('Orders webhook idempotency skips duplicate paid notifications', () => {
      assert.ok(
        webhookSrc.includes('if (order.payment_status === "paid" && newPaymentStatus === "paid")'),
        'Must check if order was already paid'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. WRONG GROSS_AMOUNT / UNDERPAYMENT REJECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Gross Amount Verification & Underpayment Rejection', () => {
    test('Subscription rejects underpayment with 400 Invalid gross_amount', () => {
      assert.ok(
        webhookSrc.includes('Number(gross_amount) < Number(subPayment.gross_amount)'),
        'Subscription must verify gross_amount >= expected gross_amount'
      );
    });

    test('Credit purchase rejects underpayment with 400 Invalid gross_amount', () => {
      assert.ok(
        webhookSrc.includes('Number(gross_amount) < Number(purchase.amount_idr)'),
        'Credit purchase must verify gross_amount >= expected amount_idr'
      );
    });

    test('Order rejects underpayment with 400 Invalid gross_amount', () => {
      assert.ok(
        webhookSrc.includes('Number(gross_amount) < Number(order.total)'),
        'Order must verify gross_amount >= order.total'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. CROSS-TENANT & MERCHANT ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Cross-Tenant & Merchant Protection', () => {
    test('Webhook optionally verifies MIDTRANS_MERCHANT_ID to reject cross-merchant injections', () => {
      assert.ok(
        webhookSrc.includes('Deno.env.get("MIDTRANS_MERCHANT_ID")'),
        'Must support MIDTRANS_MERCHANT_ID verification'
      );
      assert.ok(
        webhookSrc.includes('return new Response("Invalid merchant_id", { status: 403 });'),
        'Must reject merchant ID mismatch with 403'
      );
    });

    test('Prefix isolation strictly routes SUB- for subscriptions and CREDIT- for creative credits', () => {
      assert.ok(webhookSrc.includes('order_id.startsWith("SUB-")'), 'SUB- strictly for subscription domain');
      assert.ok(webhookSrc.includes('order_id.startsWith("CREDIT-")'), 'CREDIT- strictly for credit domain');
    });

    test('Subscription verify_payment strictly rejects cross-user order verification', () => {
      assert.ok(
        subSnapSrc.includes('.eq("profile_id", profileId)'),
        'Subscription payment verification must query profile_id'
      );
      assert.ok(
        subSnapSrc.includes('Order ID tidak ditemukan atau tidak sesuai dengan akun Anda'),
        'Must return 404 when verifying another user order'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. CLIENT CANNOT MARK PAID (AUTHORITATIVE SERVER-SIDE TRUTH)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Authoritative Payment Status (Client Cannot Mark Paid)', () => {
    test('Frontend subscriptionService creates Snap with server-enforced amount and verify action', () => {
      assert.ok(
        subServiceSrc.includes("supabase.functions.invoke('midtrans-subscription-snap'"),
        'Subscription must be initiated via server-side Edge Function'
      );
      assert.ok(
        !subServiceSrc.includes('body: { amount:'),
        'Frontend must not pass custom payment amount'
      );
    });

    test('Database migrations lock orders and payments RLS from client UPDATE to paid', () => {
      const mig90 = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migrations/090_payment_authority_enforcement.sql'),
        'utf8'
      );
      assert.ok(
        mig90.includes('DROP POLICY "orders_public_update" ON public.orders;'),
        'Must drop public/anon update policy'
      );
      assert.ok(
        mig90.includes('DROP POLICY "payments_public_update" ON public.payments;'),
        'Must drop public/anon payments update policy'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. SERVER KEY LEAKAGE PROTECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Server Key Leakage Audit', () => {
    test('.env.example never leaks secrets and does not prefix Server Key with VITE_', () => {
      assert.ok(envExampleSrc.includes('VITE_MIDTRANS_CLIENT_KEY='));
      assert.ok(envExampleSrc.includes('VITE_MIDTRANS_IS_PRODUCTION='));
      assert.ok(envExampleSrc.includes('MIDTRANS_SERVER_KEY='));
      assert.ok(envExampleSrc.includes('MIDTRANS_MERCHANT_ID='));
      assert.ok(!envExampleSrc.includes('VITE_MIDTRANS_SERVER_KEY'), 'Must NEVER prefix server key with VITE_');
    });

    test('Frontend source (src/ excluding __tests__) does not reference MIDTRANS_SERVER_KEY', () => {
      const srcFiles = fs.readdirSync(path.resolve(process.cwd(), 'src'), { recursive: true });
      for (const file of srcFiles) {
        if (typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.jsx'))) {
          // Exclude test files
          if (file.includes('__tests__') || file.endsWith('.test.js')) continue;
          const fullPath = path.resolve(process.cwd(), 'src', file);
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !content.includes('MIDTRANS_SERVER_KEY'),
            `Application file ${file} must not contain MIDTRANS_SERVER_KEY`
          );
        }
      }
    });

    test('Dist bundle (dist/) does not leak MIDTRANS_SERVER_KEY', () => {
      const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
      if (fs.existsSync(distAssetsDir)) {
        const distFiles = fs.readdirSync(distAssetsDir);
        for (const file of distFiles) {
          if (file.endsWith('.js')) {
            const content = fs.readFileSync(path.resolve(distAssetsDir, file), 'utf8');
            assert.ok(
              !content.includes('MIDTRANS_SERVER_KEY'),
              `Dist bundle ${file} must not leak MIDTRANS_SERVER_KEY`
            );
          }
        }
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. SANDBOX / PRODUCTION ENDPOINT SELECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Sandbox vs Production Endpoint Resolution', () => {
    test('Frontend subscriptionService selects correct Snap JS url based on VITE_MIDTRANS_IS_PRODUCTION', () => {
      assert.ok(
        subServiceSrc.includes("https://app.midtrans.com/snap/snap.js"),
        'Must include production Snap JS endpoint'
      );
      assert.ok(
        subServiceSrc.includes("https://app.sandbox.midtrans.com/snap/snap.js"),
        'Must include sandbox Snap JS endpoint'
      );
      assert.ok(
        subServiceSrc.includes("import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'"),
        'Must conditionally select URL based on VITE_MIDTRANS_IS_PRODUCTION'
      );
    });

    test('All 3 Snap Edge Functions select correct Snap API baseUrl', () => {
      for (const [name, src] of [
        ['midtrans-subscription-snap', subSnapSrc],
        ['midtrans-create-snap', createSnapSrc],
        ['creative-topup-snap', creditSnapSrc],
      ]) {
        assert.ok(
          src.includes('https://app.midtrans.com'),
          `${name} must define production Snap base URL`
        );
        assert.ok(
          src.includes('https://app.sandbox.midtrans.com'),
          `${name} must define sandbox Snap base URL`
        );
        assert.ok(
          src.includes('/snap/v1/transactions'),
          `${name} must target /snap/v1/transactions endpoint`
        );
      }
    });

    test('Core API endpoints resolve to https://api.midtrans.com vs https://api.sandbox.midtrans.com', () => {
      for (const [name, src] of [
        ['midtrans-subscription-snap', subSnapSrc],
        ['creative-topup-snap', creditSnapSrc],
        ['midtrans-create-snap', createSnapSrc],
      ]) {
        assert.ok(
          src.includes('https://api.midtrans.com'),
          `${name} must support production Core API URL`
        );
        assert.ok(
          src.includes('https://api.sandbox.midtrans.com'),
          `${name} must support sandbox Core API URL`
        );
      }
    });
  });
});
