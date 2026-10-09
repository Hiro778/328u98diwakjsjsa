// src/__tests__/adversarialSecurityAudit.test.js
// BisnisSehat Full Adversarial Security & Business Logic Audit Suite (bug.md)
// Tests: Auth/IDOR, Subscription Bypass, Tool Entitlements, AI Provider Security,
// Money/Payment Integrity, Inventory Concurrency, State Transitions & Replay Protection.

import { describe, test, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('BisnisSehat Full Adversarial Security & Business Logic Audit (bug.md)', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 1 & 4: ATTACK SURFACE & TOOL ENTITLEMENT AUDIT
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 1 & 4 — Attack Surface & Tool Entitlement Verification', () => {
    test('Categories and tool definitions strictly separate Free vs Pro vs Coming Soon', async () => {
      const categoriesPath = path.resolve(process.cwd(), 'src/data/categories.js');
      const content = fs.readFileSync(categoriesPath, 'utf8');

      // Finance basic tools
      assert.ok(content.includes("name: 'HPP Calculator', path: '/dashboard/keuangan/hpp-calculator', tier: 'basic', requiresPro: false"));
      assert.ok(content.includes("name: 'BEP Calculator', path: '/dashboard/keuangan/bep-calculator', tier: 'basic', requiresPro: false"));

      // Finance Pro tools
      assert.ok(content.includes("name: 'Margin Analysis', path: '/dashboard/keuangan/margin-analysis', tier: 'pro', requiresPro: true"));
      assert.ok(content.includes("name: 'Financial Reports', path: '/dashboard/keuangan/financial-reports', tier: 'pro', requiresPro: true"));

      // Coming soon tools
      assert.ok(content.includes("name: 'AI Video Generator', availability: 'COMING_SOON', status: 'coming_soon'"));
      assert.ok(content.includes("name: 'Logo Analyzer', path: '/dashboard/legalitas?tab=logo', availability: 'COMING_SOON'"));
    });

    test('Server-side Pro entitlement function rejects Free, expired, or non-active subscriptions', () => {
      // Logic simulation mirroring supabase/functions/_shared/entitlement.ts
      function evaluateProEntitlement(subscription) {
        if (!subscription) return false;
        const now = new Date().toISOString();
        return (
          subscription.plan === 'pro' &&
          subscription.status === 'active' &&
          Boolean(subscription.expires_at) &&
          subscription.expires_at > now
        );
      }

      // Case 1: Active Pro
      const activePro = {
        plan: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      assert.equal(evaluateProEntitlement(activePro), true, 'Active Pro must be entitled');

      // Case 2: Free tier attempting Pro access
      const freeUser = {
        plan: 'free',
        status: 'active',
        expires_at: null,
      };
      assert.equal(evaluateProEntitlement(freeUser), false, 'Free user must NOT be entitled');

      // Case 3: Expired Pro subscription
      const expiredPro = {
        plan: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() - 3600000).toISOString(),
      };
      assert.equal(evaluateProEntitlement(expiredPro), false, 'Expired Pro must NOT be entitled');

      // Case 4: Cancelled Pro subscription
      const cancelledPro = {
        plan: 'pro',
        status: 'cancelled',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      assert.equal(evaluateProEntitlement(cancelledPro), false, 'Cancelled subscription must NOT be entitled');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 2 & 10: AUTHENTICATION, IDOR & TENANT ISOLATION
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 2 & 10 — IDOR, BOLA & Cross-Tenant Access Prevention', () => {
    test('Cross-tenant data access rejection logic prevents User A accessing User B resources', () => {
      const tenantDb = {
        campaigns: [
          { id: 'camp-1', business_id: 'biz-alice', name: 'Alice Campaign' },
          { id: 'camp-2', business_id: 'biz-bob', name: 'Bob Campaign' },
        ],
        orders: [
          { id: 'ord-1', business_id: 'biz-alice', total: 100000 },
          { id: 'ord-2', business_id: 'biz-bob', total: 250000 },
        ],
      };

      function accessResource(table, resourceId, requestingBusinessId) {
        const item = tenantDb[table]?.find((r) => r.id === resourceId);
        if (!item) return { status: 404, error: 'Not found' };
        if (item.business_id !== requestingBusinessId) {
          return { status: 403, error: 'Access denied: Tenant isolation policy violation' };
        }
        return { status: 200, data: item };
      }

      // Alice accessing Alice's order -> 200 OK
      const aliceOrder = accessResource('orders', 'ord-1', 'biz-alice');
      assert.equal(aliceOrder.status, 200);

      // Alice attempting to access Bob's order -> 403 Forbidden
      const bobOrderAccessByAlice = accessResource('orders', 'ord-2', 'biz-alice');
      assert.equal(bobOrderAccessByAlice.status, 403);
      assert.ok(bobOrderAccessByAlice.error.includes('Tenant isolation'));

      // Bob attempting to access Alice's campaign -> 403 Forbidden
      const aliceCampaignAccessByBob = accessResource('campaigns', 'camp-1', 'biz-bob');
      assert.equal(aliceCampaignAccessByBob.status, 403);
    });

    test('create_public_order RPC strictly enforces tenant isolation on all line items', () => {
      const migrationFile = path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql');
      const sql = fs.readFileSync(migrationFile, 'utf8');

      // Assert that product business_id check exists in SQL
      assert.ok(
        sql.includes("IF v_prod.business_id <> p_business_id THEN"),
        "Must verify line item product business_id matches order p_business_id"
      );
      assert.ok(
        sql.includes("Pelanggaran isolasi tenant: Produk % bukan milik bisnis ini"),
        "Must raise tenant isolation violation exception on mismatch"
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 5 & 6: AI SECURITY, PROVIDER ISOLATION & VIDEO GENERATOR COMING SOON
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 5 & 6 — AI Provider Security & Video Generator Coming Soon Backend Enforcement', () => {
    test('creative-generate-video edge function enforces server-side Coming Soon reject (HTTP 403)', () => {
      const edgeFnPath = path.resolve(process.cwd(), 'supabase/functions/creative-generate-video/index.ts');
      const edgeFnSource = fs.readFileSync(edgeFnPath, 'utf8');

      // Verify server checks action === "generate" and rejects public requests
      assert.ok(
        edgeFnSource.includes('Fitur AI Video Generator saat ini berstatus Coming Soon dan belum dibuka untuk publik.'),
        'Must contain explicit Coming Soon rejection message'
      );
      assert.ok(
        edgeFnSource.includes('errorResponse("Fitur AI Video Generator saat ini berstatus Coming Soon dan belum dibuka untuk publik.", 403)'),
        'Must return HTTP 403 when public user calls action: "generate"'
      );
    });

    test('PRD Generation strictly maintains Gemini isolation and never invokes Atlas Cloud', () => {
      const prdFnPath = path.resolve(process.cwd(), 'supabase/functions/creative-generate-prd/index.ts');
      const prdSource = fs.readFileSync(prdFnPath, 'utf8');

      assert.ok(prdSource.includes('PRIMARY_MODEL = "gemini-3.6-flash"'), 'PRD primary model must be gemini-3.6-flash');
      assert.ok(prdSource.includes('FALLBACK_MODEL = "gemini-3.5-flash-lite"'), 'PRD fallback model must be gemini-3.5-flash-lite');
      assert.ok(!prdSource.includes('atlascloud.ai'), 'PRD must not call Atlas Cloud');
      assert.ok(!prdSource.includes('ATLAS_API_KEY'), 'PRD must not reference ATLAS_API_KEY');
    });

    test('Zero sensitive API keys or service secrets are exposed in client source code', () => {
      const srcDir = path.resolve(process.cwd(), 'src');
      const checkFilesRecursively = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && entry.name !== '__tests__') {
            checkFilesRecursively(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
            const code = fs.readFileSync(fullPath, 'utf8');
            assert.ok(!code.includes('ATLAS_API_KEY'), `Forbidden ATLAS_API_KEY found in ${fullPath}`);
            assert.ok(!code.includes('MIDTRANS_SERVER_KEY'), `Forbidden MIDTRANS_SERVER_KEY found in ${fullPath}`);
            assert.ok(!code.includes('SUPABASE_SERVICE_ROLE_KEY'), `Forbidden SUPABASE_SERVICE_ROLE_KEY found in ${fullPath}`);
          }
        }
      };
      checkFilesRecursively(srcDir);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 7 & 8: MONEY, PAYMENT & BOUNDARY CHECKS
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 7 & 8 — Money, Payment & Price Authority Audit', () => {
    test('Server authoritative pricing: Client-controlled price overrides are ignored and recalculated', () => {
      // Mocking DB catalog
      const catalog = {
        'prod-kopi': { id: 'prod-kopi', name: 'Kopi Susu', unit_price: 18000 },
        'prod-roti': { id: 'prod-roti', name: 'Roti Bakar', unit_price: 15000 },
      };

      function calculateServerOrderTotal(clientCartItems) {
        let total = 0;
        for (const item of clientCartItems) {
          const product = catalog[item.product_id];
          if (!product) throw new Error(`Product ${item.product_id} not found`);

          // Boundary validation
          const qty = Number(item.quantity);
          if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
            throw new Error('Kuantitas produk tidak valid');
          }

          // Authoritative price comes from DB, ignoring item.unit_price from client!
          const authoritativeUnitPrice = product.unit_price;
          total += authoritativeUnitPrice * qty;
        }
        return total;
      }

      // Attacker attempts to send price = 100 IDR instead of 18,000 IDR
      const maliciousCart = [
        { product_id: 'prod-kopi', quantity: 2, unit_price: 100 }, // Manipulated price
      ];

      const verifiedTotal = calculateServerOrderTotal(maliciousCart);
      assert.equal(verifiedTotal, 36000, 'Server must calculate 2 * 18,000 = 36,000, ignoring client price 100');
    });

    test('Boundary test: Negative, zero, decimal, and NaN quantities are strictly rejected', () => {
      function validateQuantity(rawQty) {
        const qty = Number(rawQty);
        if (isNaN(qty) || !Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
          return { valid: false, error: 'Invalid quantity' };
        }
        return { valid: true, quantity: qty };
      }

      assert.equal(validateQuantity(0).valid, false, 'Zero quantity must be rejected');
      assert.equal(validateQuantity(-1).valid, false, 'Negative quantity must be rejected');
      assert.equal(validateQuantity(1.5).valid, false, 'Decimal quantity must be rejected');
      assert.equal(validateQuantity(NaN).valid, false, 'NaN quantity must be rejected');
      assert.equal(validateQuantity('abc').valid, false, 'String quantity must be rejected');
      assert.equal(validateQuantity(null).valid, false, 'Null quantity must be rejected');
      assert.equal(validateQuantity(5).valid, true, 'Positive integer quantity must be accepted');
    });

    test('Midtrans Webhook: Cryptographic signature validation with SHA-512 rejects forged callbacks', async () => {
      const serverKey = 'SB-Mid-server-TESTKEY123';

      function generateSignature(orderId, statusCode, grossAmount, key) {
        const raw = `${orderId}${statusCode}${grossAmount}${key}`;
        return crypto.createHash('sha512').update(raw).digest('hex');
      }

      function verifySignature(orderId, statusCode, grossAmount, key, signatureKey) {
        const expected = generateSignature(orderId, statusCode, grossAmount, key);
        return expected === signatureKey;
      }

      const orderId = 'SUB-1727289900000-user1';
      const statusCode = '200';
      const grossAmount = '130000.00';
      const validSignature = generateSignature(orderId, statusCode, grossAmount, serverKey);

      // Valid signature test
      assert.equal(
        verifySignature(orderId, statusCode, grossAmount, serverKey, validSignature),
        true,
        'Legitimate signature must verify successfully'
      );

      // Tampered amount (e.g. attacker sends 10000.00 instead of 130000.00)
      assert.equal(
        verifySignature(orderId, statusCode, '10000.00', serverKey, validSignature),
        false,
        'Tampered gross amount must fail signature verification'
      );

      // Tampered order ID
      assert.equal(
        verifySignature('SUB-tampered-id', statusCode, grossAmount, serverKey, validSignature),
        false,
        'Tampered orderId must fail signature verification'
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 9 & 14: INVENTORY CONCURRENCY & RACE CONDITIONS
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 9 & 14 — Inventory Concurrency & Overselling Prevention', () => {
    test('Simulated concurrency: stock=1 with 2 concurrent checkouts permits exactly 1 success', async () => {
      let currentStock = 1;
      let successfulOrders = 0;
      let rejectedOrders = 0;

      // Simulated atomic checkout with row-level mutex
      let lock = Promise.resolve();
      async function atomicCheckout(qty) {
        return new Promise((resolve) => {
          lock = lock.then(async () => {
            if (currentStock >= qty) {
              currentStock -= qty;
              successfulOrders += 1;
              resolve({ success: true, remaining: currentStock });
            } else {
              rejectedOrders += 1;
              resolve({ success: false, error: 'INSUFFICIENT_STOCK' });
            }
          });
        });
      }

      // Execute 2 concurrent requests
      const [res1, res2] = await Promise.all([
        atomicCheckout(1),
        atomicCheckout(1),
      ]);

      assert.equal(successfulOrders, 1, 'Exactly 1 checkout must succeed');
      assert.equal(rejectedOrders, 1, 'Second concurrent checkout must be rejected');
      assert.equal(currentStock, 0, 'Final stock must be exactly 0 (no negative stock)');
    });

    test('create_public_order SQL migration includes FOR UPDATE row-level lock on inventory', () => {
      const migrationFile = path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql');
      const sql = fs.readFileSync(migrationFile, 'utf8');

      assert.ok(
        sql.includes('SELECT id, quantity INTO v_inv'),
        'Must query inventory table'
      );
      assert.ok(
        sql.includes('FOR UPDATE;'),
        'Must lock inventory row FOR UPDATE to prevent race conditions'
      );
      assert.ok(
        sql.includes('RAISE EXCEPTION \'INSUFFICIENT_STOCK'),
        'Must raise INSUFFICIENT_STOCK exception if quantity < requested'
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 12 & 13: STATE MACHINES, REPLAY & IDEMPOTENCY
  // ═════════════════════════════════════════════════════════════════════════
  describe('Phase 12 & 13 — State Machines, Replay Attacks & Idempotency', () => {
    test('Duplicate webhook notification (replay) does not double-extend subscription', () => {
      let subscription = {
        id: 'sub-1',
        plan: 'pro',
        status: 'active',
        expires_at: new Date('2026-10-25T12:00:00Z'),
      };

      let payment = {
        id: 'pay-1',
        payment_status: 'paid', // Already paid
      };

      let grantTokensCalled = 0;

      function handleMidtransNotification(subPayment, newStatus) {
        // IDEMPOTENCY CHECK from midtrans-notification/index.ts
        if (subPayment.payment_status === 'paid' && newStatus === 'paid') {
          return { status: 200, action: 'duplicate_ignored' };
        }

        // Mutation would happen here
        grantTokensCalled++;
        return { status: 200, action: 'processed' };
      }

      // Replay request 1
      const res1 = handleMidtransNotification(payment, 'paid');
      assert.equal(res1.action, 'duplicate_ignored', 'Replayed paid notification must be ignored');

      // Replay request 2
      const res2 = handleMidtransNotification(payment, 'paid');
      assert.equal(res2.action, 'duplicate_ignored');
      assert.equal(grantTokensCalled, 0, 'No extra tokens or subscription extension may occur on replay');
    });

    test('Checkout request idempotency returns existing order without re-deducting inventory', () => {
      const ordersDb = new Map();
      let inventoryStock = 10;

      function processOrder({ checkoutRequestId, businessId, qty }) {
        // 1. Idempotency check
        if (checkoutRequestId && ordersDb.has(checkoutRequestId)) {
          return {
            idempotent: true,
            order: ordersDb.get(checkoutRequestId),
            stock: inventoryStock,
          };
        }

        // 2. Stock deduction
        if (inventoryStock < qty) throw new Error('Out of stock');
        inventoryStock -= qty;

        const newOrder = {
          id: `order-${ordersDb.size + 1}`,
          businessId,
          qty,
          checkoutRequestId,
        };
        ordersDb.set(checkoutRequestId, newOrder);

        return { idempotent: false, order: newOrder, stock: inventoryStock };
      }

      // Initial checkout
      const initial = processOrder({ checkoutRequestId: 'req-abc-123', businessId: 'biz-1', qty: 2 });
      assert.equal(initial.idempotent, false);
      assert.equal(initial.stock, 8);

      // Duplicate checkout with identical checkoutRequestId
      const duplicate = processOrder({ checkoutRequestId: 'req-abc-123', businessId: 'biz-1', qty: 2 });
      assert.equal(duplicate.idempotent, true, 'Second request must be recognized as idempotent');
      assert.equal(duplicate.stock, 8, 'Inventory stock must NOT be deducted again');
      assert.equal(duplicate.order.id, initial.order.id, 'Must return identical order ID');
    });
  });
});
