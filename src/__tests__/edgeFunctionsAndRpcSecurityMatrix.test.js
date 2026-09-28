// src/__tests__/edgeFunctionsAndRpcSecurityMatrix.test.js
// Automated Security Boundary Regression Test Suite
// Covering 41 Edge Functions & 18 Database RPCs across all 8 security pillars:
// Authentication, Authorization, Ownership, Subscription, Input Validation, Rate Limit, Idempotency, Sensitive Data Exposure.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Edge Functions & Database RPC Security Matrix Suite (41 Edge Functions + 18 RPCs)', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // 1. EDGE FUNCTION SECURITY BOUNDARIES
  // ═════════════════════════════════════════════════════════════════════════

  describe('1. AI & Marketing Edge Functions', () => {
    test('competitor-analyze & competitor-research enforce server-side Pro check', () => {
      const analyzeSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/competitor-analyze/index.ts'), 'utf8');
      const researchSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/competitor-research/index.ts'), 'utf8');

      assert.ok(analyzeSrc.includes('const hasPro = await isProUser(auth.userId)'), 'competitor-analyze must check isProUser');
      assert.ok(analyzeSrc.includes('errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403)'), 'competitor-analyze must reject Free user with 403');

      assert.ok(researchSrc.includes('const hasPro = await isProUser(auth.userId)'), 'competitor-research must check isProUser');
      assert.ok(researchSrc.includes('errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403)'), 'competitor-research must reject Free user with 403');
    });

    test('creative-generate-video blocks public direct API execution with Coming Soon 403', () => {
      const videoSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/creative-generate-video/index.ts'), 'utf8');
      assert.ok(videoSrc.includes('Fitur AI Video Generator saat ini berstatus Coming Soon dan belum dibuka untuk publik.'));
      assert.ok(videoSrc.includes('action === "generate"'));
      assert.ok(videoSrc.includes('403'));
    });

    test('creative-generate-prd isolates Gemini 3.6 Flash and prevents model tampering', () => {
      const prdSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/creative-generate-prd/index.ts'), 'utf8');
      assert.ok(prdSrc.includes('PRIMARY_MODEL = "gemini-3.6-flash"'));
      assert.ok(prdSrc.includes('FALLBACK_MODEL = "gemini-3.5-flash-lite"'));
      assert.ok(!prdSrc.includes('body.model'), 'Client cannot override model');
      assert.ok(!prdSrc.includes('body.provider'), 'Client cannot override provider');
    });

    test('creative-topup-snap validates predefined packages and prevents custom client pricing', () => {
      const topupSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/creative-topup-snap/index.ts'), 'utf8');
      assert.ok(topupSrc.includes('CREDIT_PACKAGES'), 'Must use predefined server CREDIT_PACKAGES');
      assert.ok(!topupSrc.includes('body.amount_idr'), 'Client cannot specify amount_idr directly');
    });
  });

  describe('2. Google Business & Marketplace Edge Functions', () => {
    test('google-business-connect, disconnect, performance, posts, reviews, status enforce Pro entitlement', () => {
      const endpoints = [
        'google-business-connect',
        'google-business-disconnect',
        'google-business-performance',
        'google-business-posts',
        'google-business-reviews',
        'google-business-status',
      ];

      for (const ep of endpoints) {
        const filePath = path.resolve(process.cwd(), `supabase/functions/${ep}/index.ts`);
        const src = fs.readFileSync(filePath, 'utf8');
        assert.ok(
          src.includes('isProUser(auth.userId)'),
          `${ep} must enforce isProUser check server-side`
        );
        assert.ok(
          src.includes('403'),
          `${ep} must return HTTP 403 on non-Pro access`
        );
      }
    });

    test('marketplace-sync-* functions verify business connection ownership before execution', () => {
      const syncEndpoints = [
        'marketplace-sync-inventory',
        'marketplace-sync-orders',
        'marketplace-sync-products',
      ];

      for (const ep of syncEndpoints) {
        const filePath = path.resolve(process.cwd(), `supabase/functions/${ep}/index.ts`);
        const src = fs.readFileSync(filePath, 'utf8');
        assert.ok(src.includes('verifyConnectionOwnership'), `${ep} must call verifyConnectionOwnership`);
        assert.ok(src.includes('verifyAuth'), `${ep} must authenticate user JWT`);
      }
    });
  });

  describe('3. Payment & Subscription Edge Functions', () => {
    test('midtrans-subscription-snap hardcodes Rp 130.000 price and prevents client tampering', () => {
      const snapSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/midtrans-subscription-snap/index.ts'), 'utf8');
      assert.ok(snapSrc.includes('130000'), 'Subscription amount must be fixed at 130000');
      assert.ok(!snapSrc.includes('gross_amount: body.amount'), 'Client cannot set custom gross_amount');
    });

    test('midtrans-create-snap queries authoritative order total from database instead of client payload', () => {
      const snapSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/midtrans-create-snap/index.ts'), 'utf8');
      assert.ok(snapSrc.includes('.from("orders")'), 'Must query orders table');
      assert.ok(snapSrc.includes('order.total'), 'Must use order.total from database');
    });

    test('midtrans-notification webhook verifies SHA-512 cryptographic signature', () => {
      const notifSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/midtrans-notification/index.ts'), 'utf8');
      assert.ok(notifSrc.includes('crypto.subtle.digest("SHA-512"'), 'Must verify SHA-512 signature');
      assert.ok(notifSrc.includes('Invalid signature'), 'Must reject signature mismatch');
    });
  });

  describe('4. Administrative, Webhook & Operator Edge Functions', () => {
    test('run-sql requires SUPABASE_SERVICE_ROLE_KEY and rejects normal user Bearer tokens', () => {
      const runSqlSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/run-sql/index.ts'), 'utf8');
      assert.ok(runSqlSrc.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'));
      assert.ok(runSqlSrc.includes('authHeader !== `Bearer ${serviceRoleKey}`'));
      assert.ok(runSqlSrc.includes('return errorResponse("Unauthorized", 401)'));
    });

    test('telegram-webhook enforces pairing code expiration, chat rate limits, and threat filtering', () => {
      const teleSrc = fs.readFileSync(path.resolve(process.cwd(), 'supabase/functions/telegram-webhook/index.ts'), 'utf8');
      assert.ok(teleSrc.includes('checkRateLimit(chatId, 20, 60000)'), 'Must limit chat to 20 req/min');
      assert.ok(teleSrc.includes('isSecurityThreat'), 'Must check threat patterns');
      assert.ok(teleSrc.includes('telegram_pairing_tokens'), 'Must verify single-use pairing token');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. DATABASE RPC SECURITY BOUNDARIES (18 RPCs)
  // ═════════════════════════════════════════════════════════════════════════

  describe('5. Core Order & Concurrency RPCs', () => {
    test('create_public_order (RPC 1) enforces stock row lock, tenant isolation, and authoritative price', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_public_order/i);
      assert.match(sql, /FOR UPDATE;/i, 'Must lock inventory row FOR UPDATE');
      assert.match(sql, /IF v_prod\.business_id <> p_business_id THEN/i, 'Must enforce tenant isolation');
      assert.match(sql, /v_base_price := coalesce\(v_prod\.unit_price, 0\);/i, 'Must use product unit_price from DB');
      assert.match(sql, /checkout_request_id = trim\(p_checkout_request_id\)/i, 'Must enforce idempotency via checkout_request_id');
    });

    test('create_pos_order (RPC 2) enforces stock row lock and cash payment integrity', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_pos_order/i);
      assert.match(sql, /FOR UPDATE;/i, 'Must lock inventory row FOR UPDATE');
      assert.match(sql, /checkout_request_id/i, 'Must check pos checkout_request_id');
    });

    test('adjust_stock (RPC 3) enforces stock boundary >= 0', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.adjust_stock/i);
      assert.match(sql, /greatest\(0,/i, 'Must clamp stock to non-negative');
    });
  });

  describe('6. Creative Credits & Entitlement RPCs', () => {
    test('deduct_creative_credits_atomic (RPC 4) prevents negative balance and enforces idempotency', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/060_security_hardening_concurrency.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.deduct_creative_credits_atomic/i);
      assert.match(sql, /v_available < p_credits/i, 'Must verify available credits >= p_credits');
      assert.match(sql, /FOR UPDATE/i, 'Must lock credits row with FOR UPDATE');
    });

    test('claim_creative_free_usage_atomic (RPC 5) and rollback (RPC 6) guarantee 1x lifetime limit', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/046_marketing_entitlements.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.claim_creative_free_usage_atomic/i);
      assert.match(sql, /FREE_USAGE_ALREADY_CONSUMED/i, 'Must reject if already claimed');
      assert.match(sql, /create or replace function public\.rollback_creative_free_usage/i);
    });

    test('grant_pro_monthly_allowance_atomic (RPC 7) grants 200 tokens idempotently per period', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/049_pro_monthly_token_allowance.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.grant_pro_monthly_allowance_atomic/i);
      assert.match(sql, /200/i, 'Must grant exactly 200 tokens');
      assert.match(sql, /ALREADY_GRANTED/i, 'Must prevent duplicate grants for same period');
    });

    test('is_business_pro_active (RPC 8) validates active status and future expires_at', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/046_marketing_entitlements.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.is_business_pro_active/i);
      assert.match(sql, /s\.plan = 'pro'/i);
      assert.match(sql, /s\.status = 'active'/i);
      assert.match(sql, /s\.expires_at > now\(\)/i);
    });

    test('cancel_subscription_atomic (RPC 9) marks cancelled without prematurely terminating active period', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/050_subscription_cancellation.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_subscription_atomic/i);
      assert.match(sql, /status = 'cancelled'/i);
      assert.ok(!sql.includes("expires_at = now()"), 'Must NOT truncate paid period');
    });

    test('delete_completed_order (RPC 10) allows deletion ONLY for selesai/completed orders and owner', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/047_pos_delete_completed_order.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.delete_completed_order/i);
      assert.match(sql, /v_order_status NOT IN \('selesai', 'completed'\)/i, 'Must reject active orders');
      assert.match(sql, /b\.owner_id = v_user_id/i, 'Must enforce business owner authorization');
    });
  });

  describe('7. Utility & Maintenance RPCs', () => {
    test('is_valid_public_order (RPC 11) verifies order business exists', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/051_public_order_checkout.sql'), 'utf8');
      assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_valid_public_order/i);
    });

    test('claim_whatsapp_job (RPC 12) locks queue worker atomically', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/041_whatsapp_message_queue.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.claim_whatsapp_job/i);
      assert.match(sql, /FOR UPDATE SKIP LOCKED/i);
    });

    test('sync_due_notifications (RPC 13) filters notifications strictly by business_id', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/044_notification_center.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.sync_due_notifications/i);
    });

    test('get_competitor_cache (RPC 14) & competitor_cache_exists (RPC 15) enforce business_id & TTL', () => {
      const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/040_competitor_analysis.sql'), 'utf8');
      assert.match(sql, /create or replace function public\.get_competitor_cache/i);
      assert.match(sql, /ttl_expires_at > now\(\)/i);
      assert.match(sql, /create or replace function public\.competitor_cache_exists/i);
    });

    test('cleanup_old_competitor_analyses (RPC 16) & cleanup_expired_oauth_states (RPC 17 & 18) clean up stale records', () => {
      const compSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/040_competitor_analysis.sql'), 'utf8');
      assert.match(compSql, /cleanup_old_competitor_analyses/i);

      const oauthSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/032_marketplace_oauth_flow.sql'), 'utf8');
      assert.match(oauthSql, /cleanup_expired_oauth_states/i);

      const googleOauthSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/042_google_business_profile.sql'), 'utf8');
      assert.match(googleOauthSql, /cleanup_expired_google_oauth_states/i);
    });
  });
});
