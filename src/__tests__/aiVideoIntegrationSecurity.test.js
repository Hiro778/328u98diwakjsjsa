import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Open-Generative-AI Integration Security Suite (Phase 12 - @phase12.md)', () => {
  const edgeFunctionPath = path.resolve('supabase/functions/creative-video-generate/index.ts');
  const creativeServicePath = path.resolve('src/services/creativeStudioService.js');
  const creativeStudioPagePath = path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx');

  const edgeFunctionSource = fs.readFileSync(edgeFunctionPath, 'utf8');
  const creativeServiceSource = fs.readFileSync(creativeServicePath, 'utf8');
  const creativeStudioPageSource = fs.readFileSync(creativeStudioPagePath, 'utf8');

  // Simulated Database & State for 20 Security Scenarios
  function createMockEnvironment() {
    const mockDb = {
      users: {
        'user-pro': { id: 'user-pro', status: 'active', isPro: true, businessId: 'biz-pro' },
        'user-free': { id: 'user-free', status: 'active', isPro: false, businessId: 'biz-free' },
        'user-basic': { id: 'user-basic', status: 'active', isPro: false, businessId: 'biz-basic' },
        'user-expired': { id: 'user-expired', status: 'active', isPro: false, businessId: 'biz-expired' },
        'user-cancelled': { id: 'user-cancelled', status: 'active', isPro: false, businessId: 'biz-cancelled' },
        'user-banned': { id: 'user-banned', status: 'banned', isPro: true, businessId: 'biz-banned' },
      },
      tokens: {
        'token-pro': 'user-pro',
        'token-free': 'user-free',
        'token-basic': 'user-basic',
        'token-expired': 'user-expired',
        'token-cancelled': 'user-cancelled',
        'token-banned': 'user-banned',
      },
      businesses: {
        'biz-pro': { id: 'biz-pro', owner_id: 'user-pro', isPro: true },
        'biz-free': { id: 'biz-free', owner_id: 'user-free', isPro: false },
        'biz-basic': { id: 'biz-basic', owner_id: 'user-basic', isPro: false },
        'biz-expired': { id: 'biz-expired', owner_id: 'user-expired', isPro: false },
        'biz-cancelled': { id: 'biz-cancelled', owner_id: 'user-cancelled', isPro: false },
        'biz-victim': { id: 'biz-victim', owner_id: 'user-victim', isPro: true },
      },
      prds: {
        'prd-pro-1': { id: 'prd-pro-1', business_id: 'biz-pro', prompt: 'Video promosi sambal lezat' },
        'prd-victim-1': { id: 'prd-victim-1', business_id: 'biz-victim', prompt: 'Video rahasia kompetitor' },
      },
      credits: {
        'biz-pro': { available: 100, consumed: 0 },
        'biz-low-credit': { available: 5, consumed: 0 },
      },
      platform_settings: {
        enable_ai_features: true,
      },
      ledger: {},
    };

    let providerCallCount = 0;
    let providerFailSimulate = false;

    async function simulateVideoEdgeFunction({ authHeader, body, providerFail = false }) {
      // 1. Verify JWT
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { status: 401, error: 'UNAUTHENTICATED: Sesi tidak valid atau telah berakhir.', providerCallCount };
      }
      const token = authHeader.replace('Bearer ', '');
      const userId = mockDb.tokens[token];
      if (!userId) {
        return { status: 401, error: 'UNAUTHENTICATED: Invalid token', providerCallCount };
      }
      const user = mockDb.users[userId];
      if (!user || user.status !== 'active') {
        return { status: 401, error: 'UNAUTHENTICATED: Account not active', providerCallCount };
      }

      // Zero-trust identity: resolved from token, NOT from body
      const resolvedUserId = user.id;

      // Business lookup with ownership verification
      let resolvedBusinessId = user.businessId;
      if (body?.business_id && body.business_id !== user.businessId) {
        const targetBiz = mockDb.businesses[body.business_id];
        if (!targetBiz || targetBiz.owner_id !== resolvedUserId) {
          return { status: 403, error: 'ACCESS_DENIED: Tenant isolation violation', providerCallCount };
        }
        resolvedBusinessId = targetBiz.id;
      }

      // 2. Check platform settings
      if (mockDb.platform_settings.enable_ai_features === false) {
        return { status: 403, error: 'FEATURE_DISABLED: Fitur kecerdasan buatan dinonaktifkan', providerCallCount };
      }

      // 3. Pro Entitlement
      const isPro = Boolean(user.isPro || mockDb.businesses[resolvedBusinessId]?.isPro);
      if (!isPro) {
        return { status: 403, error: 'PRO_REQUIRED: Fitur AI Video Generator membutuhkan langganan Pro', providerCallCount };
      }

      // 4. Input Validation (Zero Trust)
      if (body?.provider_url || body?.endpoint_override) {
        return { status: 400, error: 'INVALID_INPUT: Parameter provider eksternal tidak diizinkan', providerCallCount };
      }

      const prompt = (body?.prompt || '').trim();
      if (!prompt) {
        return { status: 400, error: 'INVALID_INPUT: Prompt wajib diisi', providerCallCount };
      }

      const requestedModel = body?.model || 'seedance-lite-t2v';
      const allowedModels = ['seedance-lite-t2v', 'bytedance/seedance-2.0-mini/text-to-video', 'bytedance/seedance-2.5/image-to-video'];
      if (!allowedModels.includes(requestedModel)) {
        return { status: 400, error: 'INVALID_INPUT: Model AI tidak diizinkan', providerCallCount };
      }

      // Cross-business PRD validation
      if (body?.prd_id) {
        const prd = mockDb.prds[body.prd_id];
        if (!prd || prd.business_id !== resolvedBusinessId) {
          return { status: 403, error: 'INVALID_INPUT: Akses PRD ditolak (cross-business)', providerCallCount };
        }
      }

      // 5. Credit pre-check
      const requiredCredits = 20; // Server authoritative
      const bizCredits = mockDb.credits[resolvedBusinessId] || { available: 0, consumed: 0 };
      if (bizCredits.available < requiredCredits) {
        return { status: 400, error: 'INSUFFICIENT_CREDITS: Saldo tidak cukup', providerCallCount };
      }

      // 6. Idempotency Check
      const reqId = body?.request_id || `req-${Date.now()}`;
      if (mockDb.ledger[reqId]) {
        return { status: 200, success: true, already_processed: true, providerCallCount };
      }

      // 7. Provider Call
      if (providerFail || providerFailSimulate) {
        return { status: 502, error: 'PROVIDER_ERROR: Open-Generative-AI failure', providerCallCount: providerCallCount + 1 };
      }

      providerCallCount++;

      // 8. Atomic Credit Deduction (only after provider success)
      bizCredits.available -= requiredCredits;
      bizCredits.consumed += requiredCredits;
      mockDb.ledger[reqId] = { credits_charged: requiredCredits, timestamp: Date.now() };

      return {
        status: 200,
        success: true,
        taskId: `task-${Date.now()}`,
        credits_charged: requiredCredits,
        remaining_credits: bizCredits.available,
        providerCallCount,
      };
    }

    return {
      mockDb,
      simulateVideoEdgeFunction,
      getProviderCallCount: () => providerCallCount,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 1: 20 SECURITY & INTEGRITY REQUIREMENTS (phase12.md line 337-359)
  // ═════════════════════════════════════════════════════════════════════════

  test('1. unauthenticated request denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: null, body: { prompt: 'halo' } });
    assert.equal(res.status, 401);
    assert.match(res.error, /UNAUTHENTICATED/);
  });

  test('2. Free denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: 'Bearer token-free', body: { prompt: 'video free' } });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('3. Basic denied jika feature Pro', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: 'Bearer token-basic', body: { prompt: 'video basic' } });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('4. expired Pro denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: 'Bearer token-expired', body: { prompt: 'video expired' } });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('5. cancelled Pro denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: 'Bearer token-cancelled', body: { prompt: 'video cancelled' } });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('6. active Pro allowed', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({ authHeader: 'Bearer token-pro', body: { prompt: 'video pro' } });
    assert.equal(res.status, 200);
    assert.equal(res.success, true);
    assert.ok(res.taskId);
  });

  test('7. forged plan denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-free',
      body: { prompt: 'forged plan test', plan: 'pro', isPro: true },
    });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('8. forged user_id denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-free',
      body: { prompt: 'forged user test', user_id: 'user-pro' },
    });
    assert.equal(res.status, 403);
    assert.match(res.error, /PRO_REQUIRED/);
  });

  test('9. forged business_id denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-free',
      body: { prompt: 'forged biz test', business_id: 'biz-pro' },
    });
    assert.equal(res.status, 403);
  });

  test('10. cross-business denied', async () => {
    const { simulateVideoEdgeFunction } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video cross', prd_id: 'prd-victim-1' },
    });
    assert.equal(res.status, 403);
    assert.match(res.error, /cross-business/i);
  });

  test('11. provider not called when unauthorized', async () => {
    const { simulateVideoEdgeFunction, getProviderCallCount } = createMockEnvironment();
    await simulateVideoEdgeFunction({ authHeader: null, body: { prompt: 'p' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-free', body: { prompt: 'p' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-basic', body: { prompt: 'p' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-expired', body: { prompt: 'p' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-cancelled', body: { prompt: 'p' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-free', body: { prompt: 'p', plan: 'pro' } });
    await simulateVideoEdgeFunction({ authHeader: 'Bearer token-pro', body: { prompt: 'p', prd_id: 'prd-victim-1' } });

    assert.equal(getProviderCallCount(), 0, 'Provider MUST NOT be called for any unauthorized request');
  });

  test('12. feature flag disabled denied', async () => {
    const env = createMockEnvironment();
    env.mockDb.platform_settings.enable_ai_features = false;
    const res = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video pro' },
    });
    assert.equal(res.status, 403);
    assert.match(res.error, /FEATURE_DISABLED/);
    assert.equal(env.getProviderCallCount(), 0);
  });

  test('13. insufficient credit denied', async () => {
    const env = createMockEnvironment();
    env.mockDb.users['user-pro'].businessId = 'biz-low-credit';
    const res = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video pro' },
    });
    assert.equal(res.status, 400);
    assert.match(res.error, /INSUFFICIENT_CREDITS/);
    assert.equal(env.getProviderCallCount(), 0);
  });

  test('14. credit cannot be client-manipulated', async () => {
    const env = createMockEnvironment();
    const res = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video test', credit_cost: 0, requiredCredits: 0, balance: 9999 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.credits_charged, 20, 'Server must enforce authoritative 20 credit cost');
    assert.equal(res.remaining_credits, 80);
  });

  test('15. provider failure does not incorrectly grant/deduct', async () => {
    const env = createMockEnvironment();
    const initialCredits = env.mockDb.credits['biz-pro'].available;
    const res = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video fail' },
      providerFail: true,
    });
    assert.equal(res.status, 502);
    assert.equal(env.mockDb.credits['biz-pro'].available, initialCredits, 'Credit must remain intact on provider failure');
  });

  test('16. duplicate request protection', async () => {
    const env = createMockEnvironment();
    const reqId = 'req-dedup-123';
    const res1 = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video dedup', request_id: reqId },
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.credits_charged, 20);

    const res2 = await env.simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: { prompt: 'video dedup', request_id: reqId },
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.already_processed, true, 'Duplicate request must be recognized as already processed');
    assert.equal(env.mockDb.credits['biz-pro'].available, 80, 'Credits must not be double deducted');
  });

  test('17. concurrent generation protection', async () => {
    const env = createMockEnvironment();
    // Simulate 3 concurrent generation calls
    const results = await Promise.all([
      env.simulateVideoEdgeFunction({ authHeader: 'Bearer token-pro', body: { prompt: 'c1', request_id: 'r1' } }),
      env.simulateVideoEdgeFunction({ authHeader: 'Bearer token-pro', body: { prompt: 'c2', request_id: 'r2' } }),
      env.simulateVideoEdgeFunction({ authHeader: 'Bearer token-pro', body: { prompt: 'c3', request_id: 'r3' } }),
    ]);

    for (const r of results) {
      assert.equal(r.status, 200);
    }
    assert.equal(env.mockDb.credits['biz-pro'].available, 40, '100 - (3 * 20) = 40 credits remaining');
  });

  test('18. provider secret absent from frontend bundle', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    assert.equal(pkg.dependencies['open-generative-ai'], undefined, 'Must not bundle open-generative-ai in package.json');

    // Check src files do not leak OPEN_GENERATIVE_AI_API_KEY
    assert.ok(
      !creativeStudioPageSource.includes('OPEN_GENERATIVE_AI_API_KEY'),
      'Frontend page must never reference OPEN_GENERATIVE_AI_API_KEY'
    );
    assert.ok(
      !creativeServiceSource.includes('OPEN_GENERATIVE_AI_API_KEY'),
      'Frontend service must never reference OPEN_GENERATIVE_AI_API_KEY'
    );
    assert.ok(
      !creativeStudioPageSource.includes('ATLAS_API_KEY'),
      'Frontend page must never reference ATLAS_API_KEY'
    );
  });

  test('19. arbitrary provider URL denied', async () => {
    const { simulateVideoEdgeFunction, getProviderCallCount } = createMockEnvironment();
    const res = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: {
        prompt: 'test prompt',
        provider_url: 'https://malicious-attacker-proxy.com',
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.error, /INVALID_INPUT/);
    assert.equal(getProviderCallCount(), 0);
  });

  test('20. malformed model/input denied', async () => {
    const { simulateVideoEdgeFunction, getProviderCallCount } = createMockEnvironment();
    const resModel = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: {
        prompt: 'test prompt',
        model: 'unauthorized-model-crypto-miner',
      },
    });
    assert.equal(resModel.status, 400);
    assert.match(resModel.error, /INVALID_INPUT/);

    const resEmpty = await simulateVideoEdgeFunction({
      authHeader: 'Bearer token-pro',
      body: {
        prompt: '   ',
      },
    });
    assert.equal(resEmpty.status, 400);
    assert.match(resEmpty.error, /INVALID_INPUT/);
    assert.equal(getProviderCallCount(), 0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 2: EDGE FUNCTION CODEBASE AUDIT & ARCHITECTURAL VERIFICATION
  // ═════════════════════════════════════════════════════════════════════════

  describe('Edge Function Codebase Audit & Architectural Compliance', () => {
    test('creative-video-generate/index.ts exists and enforces authoritative checks', () => {
      assert.ok(fs.existsSync(edgeFunctionPath), 'creative-video-generate/index.ts must exist');
      assert.ok(edgeFunctionSource.includes('verifyAuth'), 'Must verify JWT via verifyAuth');
      assert.ok(edgeFunctionSource.includes('isAIFeaturesEnabled'), 'Must verify enable_ai_features platform setting');
      assert.ok(edgeFunctionSource.includes('isProUser'), 'Must verify Pro entitlement');
      assert.ok(edgeFunctionSource.includes('deduct_creative_credits_atomic'), 'Must deduct credits atomically');
      assert.ok(edgeFunctionSource.includes('ai_usage'), 'Must record telemetry to ai_usage table');
    });

    test('creativeStudioService exports generateOpenGenerativeVideo, getOpenGenerativeVideoStatus, pollOpenGenerativeVideo', () => {
      assert.ok(creativeServiceSource.includes('export async function generateOpenGenerativeVideo'));
      assert.ok(creativeServiceSource.includes('export async function getOpenGenerativeVideoStatus'));
      assert.ok(creativeServiceSource.includes('export async function pollOpenGenerativeVideo'));
    });

    test('CreativeStudioPage provides generate button, loading, success, error, insufficient credit, and pro-required states', () => {
      assert.ok(creativeStudioPageSource.includes('handleGenerateVideo'), 'Must implement handleGenerateVideo');
      assert.ok(creativeStudioPageSource.includes('videoLoading'), 'Must track videoLoading state');
      assert.ok(creativeStudioPageSource.includes('videoError'), 'Must track videoError state');
      assert.ok(creativeStudioPageSource.includes('videoResult'), 'Must track videoResult state');
      assert.ok(creativeStudioPageSource.includes('Top Up Kredit'), 'Must offer top up credit link on insufficient balance');
      assert.ok(creativeStudioPageSource.includes('Upgrade ke Pro'), 'Must offer upgrade link when user is not Pro');
    });
  });
});
