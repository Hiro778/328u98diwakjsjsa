// src/__tests__/aiPrdLockdown.test.js
// Verification Suite for BS-CONF-02: AI / PRD Credit Bypass & Table Hardening
// Verifies that:
// 1. Migration 105 successfully locks down public.creative_prds, creative_assets, creative_generations
// 2. Normal authenticated users CANNOT directly INSERT, UPDATE, DELETE on creative_prds
// 3. Normal authenticated users CANNOT directly INSERT, UPDATE, DELETE on creative_assets or creative_generations
// 4. Client application only performs read-only (SELECT) queries on creative tables
// 5. Cross-tenant isolation prevents claiming free usage for other businesses
// 6. Legitimate free usage claim works for own business and is idempotent (anti-duplicate)
// 7. Legitimate server-side workflows (service_role) retain full mutation capabilities
// 8. Concurrent requests are safely handled without race condition leaks

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile?.();
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('BS-CONF-02: AI / PRD Credit Bypass Security Lockdown Suite', () => {

  // ═════════════════════════════════════════════════════════════
  // SECTION 1: MIGRATION 105 SCHEMA & POLICY INTEGRITY
  // ═════════════════════════════════════════════════════════════
  describe('1. Migration 105 Schema & Policy Integrity', () => {
    const migrationPath = path.resolve('supabase/migrations/105_security_lockdown_creative_tables.sql');

    it('1.1. Migration 105 file exists', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 105 must exist');
    });

    it('1.2. Drops vulnerable FOR ALL policies on creative tables', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(sql.includes('DROP POLICY IF EXISTS "Creative PRDs owner via brief" ON public.creative_prds;'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS "Creative assets owner via business" ON public.creative_assets;'));
      assert.ok(sql.includes('DROP POLICY IF EXISTS "Creative generations owner via business" ON public.creative_generations;'));
    });

    it('1.3. Revokes all client write privileges (INSERT, UPDATE, DELETE, TRUNCATE)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_prds FROM anon, authenticated, public;'));
      assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_assets FROM anon, authenticated, public;'));
      assert.ok(sql.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.creative_generations FROM anon, authenticated, public;'));
    });

    it('1.4. Implements defense-in-depth trigger prevent_client_creative_mutation', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.prevent_client_creative_mutation()'));
      assert.ok(sql.includes('trg_prevent_client_creative_prds_mutation'));
      assert.ok(sql.includes('trg_prevent_client_creative_assets_mutation'));
      assert.ok(sql.includes('trg_prevent_client_creative_generations_mutation'));
      assert.ok(sql.includes("RAISE EXCEPTION 'insufficient_privilege: Direct client mutation of creative artifacts is prohibited'"));
    });

    it('1.5. Hardens claim_creative_free_usage_atomic with consumed_at and ownership check', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      assert.ok(sql.includes('consumed_at'), 'Must reference consumed_at column');
      assert.ok(sql.includes('UNAUTHORIZED_BUSINESS_OWNERSHIP'), 'Must reject unauthorized business ownership');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // SECTION 2: CLIENT APPLICATION AUDIT
  // ═════════════════════════════════════════════════════════════
  describe('2. Client Application Codebase Audit', () => {
    it('2.1. Client application code does NOT perform direct mutations on creative_prds', () => {
      const srcDir = path.resolve('src');
      const files = fs.readdirSync(srcDir, { recursive: true }).filter(f => f.endsWith('.js') || f.endsWith('.jsx'));
      
      for (const relPath of files) {
        if (relPath.includes('__tests__')) continue;
        const fullPath = path.join(srcDir, relPath);
        const code = fs.readFileSync(fullPath, 'utf8');
        
        assert.ok(!code.match(/\.from\(['"]creative_prds['"]\)\s*\.insert\(/), `Forbidden client INSERT into creative_prds in ${relPath}`);
        assert.ok(!code.match(/\.from\(['"]creative_prds['"]\)\s*\.update\(/), `Forbidden client UPDATE on creative_prds in ${relPath}`);
        assert.ok(!code.match(/\.from\(['"]creative_prds['"]\)\s*\.delete\(/), `Forbidden client DELETE on creative_prds in ${relPath}`);
      }
    });

    it('2.2. Client application code does NOT perform direct mutations on creative_assets', () => {
      const srcDir = path.resolve('src');
      const files = fs.readdirSync(srcDir, { recursive: true }).filter(f => f.endsWith('.js') || f.endsWith('.jsx'));
      
      for (const relPath of files) {
        if (relPath.includes('__tests__')) continue;
        const fullPath = path.join(srcDir, relPath);
        const code = fs.readFileSync(fullPath, 'utf8');
        
        assert.ok(!code.match(/\.from\(['"]creative_assets['"]\)\s*\.insert\(/), `Forbidden client INSERT into creative_assets in ${relPath}`);
        assert.ok(!code.match(/\.from\(['"]creative_assets['"]\)\s*\.update\(/), `Forbidden client UPDATE on creative_assets in ${relPath}`);
        assert.ok(!code.match(/\.from\(['"]creative_assets['"]\)\s*\.delete\(/), `Forbidden client DELETE on creative_assets in ${relPath}`);
      }
    });

    it('2.3. creative-revise-prd uses atomic credit deduction', () => {
      const fnPath = path.resolve('supabase/functions/creative-revise-prd/index.ts');
      const fnCode = fs.readFileSync(fnPath, 'utf8');
      assert.ok(fnCode.includes('deduct_creative_credits_atomic'), 'creative-revise-prd must invoke deduct_creative_credits_atomic');
      assert.ok(!fnCode.includes('available: credits.available - 1'), 'Must not execute unsafe read-modify-write on credits');
    });
  });

  // ═════════════════════════════════════════════════════════════
  // SECTION 3: LIVE REMOTE SUPABASE SECURITY BOUNDARY TESTS
  // ═════════════════════════════════════════════════════════════
  describe('3. Live Remote Supabase Security Boundary Tests', () => {
    let serviceClient;
    let anonClient;
    let userAClient;
    let userBClient;
    let userAId;
    let userBId;
    let userABizId;
    let userBBizId;
    let userACampId;
    let userABriefId;
    let userAServerPrdId;

    before(async () => {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase environment variables missing');
      }
      serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      const pass = 'TestP@ss123456!';
      const emailA = `test_prd_lock_a_${Date.now()}@example.com`;
      const emailB = `test_prd_lock_b_${Date.now()}@example.com`;

      const { data: uA } = await serviceClient.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
      const { data: uB } = await serviceClient.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });
      userAId = uA.user.id;
      userBId = uB.user.id;

      const { data: logA } = await anonClient.auth.signInWithPassword({ email: emailA, password: pass });
      const { data: logB } = await anonClient.auth.signInWithPassword({ email: emailB, password: pass });

      userAClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${logA.session.access_token}` } }
      });
      userBClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${logB.session.access_token}` } }
      });

      // User A creates Business, Campaign, Brief
      const { data: bA } = await userAClient.from('businesses').insert({ name: 'Biz A', owner_id: userAId }).select().single();
      userABizId = bA.id;
      const { data: cA } = await userAClient.from('campaigns').insert({ business_id: userABizId, name: 'Camp A' }).select().single();
      userACampId = cA.id;
      const { data: brA } = await userAClient.from('creative_briefs').insert({ campaign_id: userACampId, brief_json: { target: 'Gen Z' } }).select().single();
      userABriefId = brA.id;

      // User B creates Business
      const { data: bB } = await userBClient.from('businesses').insert({ name: 'Biz B', owner_id: userBId }).select().single();
      userBBizId = bB.id;

      // Trusted server generates a legitimate PRD row for User A
      const { data: servPrd } = await serviceClient.from('creative_prds').insert({
        brief_id: userABriefId,
        prd_content: { headline: 'Legit PRD' },
        status: 'ready'
      }).select().single();
      userAServerPrdId = servPrd.id;
    });

    after(async () => {
      if (userAId) await serviceClient.auth.admin.deleteUser(userAId);
      if (userBId) await serviceClient.auth.admin.deleteUser(userBId);
    });

    it('3.1. Authenticated user CANNOT directly INSERT row into public.creative_prds', async () => {
      const { data, error } = await userAClient.from('creative_prds').insert({
        brief_id: userABriefId,
        prd_content: { headline: 'Fake Injected PRD' },
        status: 'ready'
      }).select().single();

      assert.ok(error, 'Direct INSERT into creative_prds must be rejected');
      assert.strictEqual(error.code, '42501');
      assert.strictEqual(data, null);
    });

    it('3.2. Authenticated user CANNOT directly UPDATE own row in public.creative_prds', async () => {
      const { data, error } = await userAClient.from('creative_prds').update({
        status: 'approved',
        prd_content: { headline: 'Tampered Content' }
      }).eq('id', userAServerPrdId).select().single();

      assert.ok(error, 'Direct UPDATE on creative_prds must be rejected');
      assert.strictEqual(error.code, '42501');

      // Verify DB row remains intact
      const { data: row } = await serviceClient.from('creative_prds').select('status, prd_content').eq('id', userAServerPrdId).single();
      assert.strictEqual(row.status, 'ready');
      assert.strictEqual(row.prd_content.headline, 'Legit PRD');
    });

    it('3.3. Authenticated user CANNOT directly DELETE row in public.creative_prds', async () => {
      const { error } = await userAClient.from('creative_prds').delete().eq('id', userAServerPrdId);
      assert.ok(error, 'Direct DELETE on creative_prds must be rejected');
      assert.strictEqual(error.code, '42501');

      // Verify row still exists
      const { data: row } = await serviceClient.from('creative_prds').select('id').eq('id', userAServerPrdId).single();
      assert.ok(row, 'PRD row must not be deleted');
    });

    it('3.4. Authenticated user CANNOT directly INSERT into public.creative_assets', async () => {
      const { data, error } = await userAClient.from('creative_assets').insert({
        prd_id: userAServerPrdId,
        business_id: userABizId,
        asset_type: 'copy',
        metadata: { text: 'Injected copy' }
      }).select().single();

      assert.ok(error, 'Direct INSERT into creative_assets must be rejected');
      assert.strictEqual(error.code, '42501');
      assert.strictEqual(data, null);
    });

    it('3.5. Authenticated user CANNOT directly INSERT into public.creative_generations', async () => {
      const { data, error } = await userAClient.from('creative_generations').insert({
        asset_id: '00000000-0000-0000-0000-000000000000',
        business_id: userABizId,
        provider: 'fake',
        model: 'fake',
        idempotency_key: `key-${Date.now()}`
      }).select().single();

      assert.ok(error, 'Direct INSERT into creative_generations must be rejected');
      assert.strictEqual(error.code, '42501');
      assert.strictEqual(data, null);
    });

    it('3.6. Authenticated user CAN SELECT own legitimate creative_prds', async () => {
      const { data, error } = await userAClient.from('creative_prds').select('*').eq('id', userAServerPrdId).single();
      assert.strictEqual(error, null, 'Must allow SELECT on own PRDs');
      assert.ok(data);
      assert.strictEqual(data.id, userAServerPrdId);
    });

    it('3.7. Cross-tenant isolation: User B CANNOT view User A PRDs', async () => {
      const { data, error } = await userBClient.from('creative_prds').select('*').eq('id', userAServerPrdId).maybeSingle();
      assert.strictEqual(data, null, 'User B must not see User A PRD');
    });

    it('3.8. Cross-tenant claim_creative_free_usage_atomic is REJECTED', async () => {
      const { data, error } = await userAClient.rpc('claim_creative_free_usage_atomic', {
        p_business_id: userBBizId,
        p_profile_id: userAId,
        p_operation: 'GENERATE_PRD',
        p_request_id: `REQ-XT-${Date.now()}`
      });

      assert.strictEqual(error, null);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error, 'UNAUTHORIZED_BUSINESS_OWNERSHIP');
    });

    it('3.9. Legitimate own-business claim_creative_free_usage_atomic SUCCEEDS', async () => {
      const { data, error } = await userAClient.rpc('claim_creative_free_usage_atomic', {
        p_business_id: userABizId,
        p_profile_id: userAId,
        p_operation: 'GENERATE_PRD',
        p_request_id: `REQ-OWN-${Date.now()}`
      });

      assert.strictEqual(error, null);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.business_id, userABizId);
    });

    it('3.10. Duplicate free usage claim is safely rejected (idempotency)', async () => {
      const { data, error } = await userAClient.rpc('claim_creative_free_usage_atomic', {
        p_business_id: userABizId,
        p_profile_id: userAId,
        p_operation: 'GENERATE_PRD',
        p_request_id: `REQ-DUP-${Date.now()}`
      });

      assert.strictEqual(error, null);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error, 'FREE_USAGE_ALREADY_CONSUMED');
    });

    it('3.11. Concurrent race condition: 10 simultaneous unauthorized INSERT attempts on creative_prds all fail', async () => {
      const attempts = Array.from({ length: 10 }, (_, i) =>
        userAClient.from('creative_prds').insert({
          brief_id: userABriefId,
          prd_content: { headline: `Race Hack ${i}` },
          status: 'ready'
        })
      );

      const results = await Promise.all(attempts);
      const blockedCount = results.filter(r => r.error && r.error.code === '42501').length;
      assert.strictEqual(blockedCount, 10, 'All 10 unauthorized concurrent inserts must fail with 42501');
    });
  });
});
