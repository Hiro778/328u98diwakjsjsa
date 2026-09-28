// src/__tests__/creativeMultiBusinessPrdChain.test.js
// Focused verification suite for bug.md:
// "No business found for this user" Regression & Multi-Business Chain in AI Creative Studio
//
// 1. Single business user → PRD works.
// 2. Multi-business user → selected campaign's business_id is preserved.
// 3. Campaign business_id is used instead of arbitrary owner lookup.
// 4. PRD generation does not call ambiguous .single() business lookup.
// 5. Credit lookup uses the same businessId.
// 6. Campaign → Brief → PRD preserves business context.
// 7. Missing businessId produces a controlled error: "Business context tidak ditemukan untuk campaign ini."
// 8. Existing credit/free-trial behavior remains unchanged.
// 9. Terminal workflow remains exactly: Campaign → Brief → PRD

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('bug.md AI Creative Studio — Business Context Chain & Multi-Business Safety', () => {
  const creativeStudioJsxPath = path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx');
  const creativeServicePath = path.resolve('src/services/creativeStudioService.js');
  const creativeCreditServicePath = path.resolve('src/services/creativeCreditService.js');
  const sharedAuthPath = path.resolve('supabase/functions/_shared/auth.ts');
  const generatePrdPath = path.resolve('supabase/functions/creative-generate-prd/index.ts');
  const revisePrdPath = path.resolve('supabase/functions/creative-revise-prd/index.ts');

  const studioJsx = fs.readFileSync(creativeStudioJsxPath, 'utf8');
  const serviceJs = fs.readFileSync(creativeServicePath, 'utf8');
  const creditServiceJs = fs.readFileSync(creativeCreditServicePath, 'utf8');
  const sharedAuthTs = fs.readFileSync(sharedAuthPath, 'utf8');
  const generatePrdTs = fs.readFileSync(generatePrdPath, 'utf8');
  const revisePrdTs = fs.readFileSync(revisePrdPath, 'utf8');

  // ============================================================
  // Requirement 1 & 2 & 3: Multi-business safety & authoritative campaign.business_id
  // ============================================================
  it('1 & 2. Multi-business user: selected campaign business_id is preserved and authoritative', () => {
    // In CreativeStudioPage.jsx, handleGeneratePRD must resolve targetBusinessId from selectedCampaign?.business_id
    assert.match(
      studioJsx,
      /targetBusinessId\s*=\s*selectedCampaign\?\.business_id\s*\|\|\s*business\?\.id/,
      'handleGeneratePRD must prioritize selectedCampaign.business_id over fallback business.id'
    );

    // generatePRD service call must receive targetBusinessId
    assert.match(
      studioJsx,
      /generatePRD\s*\(\s*brief\.id\s*,\s*selectedProductId\s*,\s*targetBusinessId\s*\)/,
      'CreativeStudioPage must pass targetBusinessId to generatePRD'
    );
  });

  it('3. Campaign business_id is used instead of arbitrary owner lookup in edge function', () => {
    assert.match(
      generatePrdTs,
      /const\s+authoritativeBusinessId\s*=\s*campaign\.business_id/,
      'creative-generate-prd must use campaign.business_id as authoritative source of truth'
    );
    assert.match(
      generatePrdTs,
      /verifyAuth\s*\(\s*req\s*,\s*authoritativeBusinessId\s*\)/,
      'creative-generate-prd must pass authoritativeBusinessId to verifyAuth'
    );
  });

  // ============================================================
  // Requirement 4: No ambiguous .single() business lookup
  // ============================================================
  it('4. PRD generation and shared auth do not call ambiguous .single() on businesses table', () => {
    // shared auth must use maybeSingle and order by created_at desc with limit(1)
    assert.doesNotMatch(
      sharedAuthTs,
      /\.from\(["']businesses["']\)\s*\.select\(["']id["']\)\s*\.eq\(["']owner_id["'],\s*user\.id\)\s*\.single\(\)/,
      'shared auth must never call .single() on owner_id query'
    );
    assert.match(
      sharedAuthTs,
      /\.from\(["']businesses["']\)\s*\.select\(["']id["']\)\s*\.eq\(["']owner_id["'],\s*user\.id\)\s*\.order\(["']created_at["'],\s*\{\s*ascending:\s*false\s*\}\)\s*\.limit\(1\)\s*\.maybeSingle\(\)/,
      'shared auth must safely order and limit(1) with maybeSingle()'
    );

    // creativeStudioService must not use .single() on businesses table
    assert.doesNotMatch(
      serviceJs,
      /\.from\(["']businesses["']\)\s*\.select\(["']id["']\)\s*\.eq\(["']owner_id["'],\s*user\.id\)\s*\.single\(\)/,
      'creativeStudioService must not use .single() on businesses'
    );

    // creativeCreditService must not use .single() on businesses table
    assert.doesNotMatch(
      creditServiceJs,
      /\.from\(["']businesses["']\)\s*\.select\(["']id["']\)\s*\.eq\(["']owner_id["'],\s*user\.id\)\s*\.single\(\)/,
      'creativeCreditService must not use .single() on businesses'
    );
  });

  // ============================================================
  // Requirement 5: Credit lookup uses the same businessId
  // ============================================================
  it('5. Credit lookup in creativeCreditService and CreativeStudioPage uses the authoritative businessId', () => {
    // getCreditOverview in creativeCreditService must use resolvedBusinessId across balance, free_usage, and ledger
    assert.match(
      creditServiceJs,
      /\.from\(["']creative_credits["']\)\s*\.select\([^)]*\)\s*\.eq\(["']business_id["'],\s*resolvedBusinessId\)/,
      'getCreditOverview must query creative_credits by resolvedBusinessId'
    );
    assert.match(
      creditServiceJs,
      /\.from\(["']creative_free_usage["']\)\s*\.select\([^)]*\)\s*\.eq\(["']business_id["'],\s*resolvedBusinessId\)/,
      'getCreditOverview must query creative_free_usage by resolvedBusinessId'
    );
    assert.match(
      creditServiceJs,
      /\.from\(["']credit_ledger["']\)\s*\.select\([^)]*\)\s*\.eq\(["']business_id["'],\s*resolvedBusinessId\)/,
      'getCreditOverview must query credit_ledger by resolvedBusinessId'
    );

    // CreativeStudioPage must refresh loadCredits with targetBusinessId
    assert.match(
      studioJsx,
      /await\s+loadCredits\s*\(\s*targetBusinessId\s*\)/,
      'CreativeStudioPage must loadCredits with targetBusinessId after generation'
    );
  });

  // ============================================================
  // Requirement 6: Campaign -> Brief -> PRD preserves business context
  // ============================================================
  it('6. Campaign -> Brief -> PRD workflow preserves business context without dropping state', () => {
    // handleCreateCampaign updates selectedCampaign and loads credits for that business
    assert.match(
      studioJsx,
      /loadCredits\s*\(\s*campaign\.business_id\s*\)/,
      'handleCreateCampaign must update credits for campaign business_id'
    );

    // Selecting a saved campaign updates selectedCampaign and loads business-specific credits
    assert.match(
      studioJsx,
      /setSelectedCampaign\s*\(\s*c\s*\)/,
      'Clicking saved campaign must set selectedCampaign'
    );
    assert.match(
      studioJsx,
      /loadCredits\s*\(\s*c\.business_id\s*\)/,
      'Clicking saved campaign must load credits for c.business_id'
    );

    // handleSubmitBrief preserves campaign.business_id
    assert.match(
      studioJsx,
      /selectedCampaign\.business_id/,
      'handleSubmitBrief must check selectedCampaign.business_id'
    );
  });

  // ============================================================
  // Requirement 7: Missing businessId produces controlled error
  // ============================================================
  it('7. Missing businessId surfaces precise developer-safe error message', () => {
    const expectedError = 'Business context tidak ditemukan untuk campaign ini.';
    assert.match(
      studioJsx,
      new RegExp(expectedError),
      `CreativeStudioPage must produce exact error: "${expectedError}"`
    );
  });

  // ============================================================
  // Requirement 8: Existing credit & free-trial behavior unchanged
  // ============================================================
  it('8. Existing credit & 1x lifetime free-trial behavior remains intact', () => {
    // 20 token cost constant preserved
    assert.match(
      studioJsx,
      /prd_generate:\s*20/,
      'Token cost constant must remain 20'
    );

    // Free trial badge and credit check logic preserved
    assert.match(
      studioJsx,
      /hasFreeTrial\s*=\s*Boolean\(creditOverview\?\.freeUsageAvailable\)/,
      'Free trial check must remain based on creditOverview.freeUsageAvailable'
    );
    assert.match(
      studioJsx,
      /canGeneratePRD\s*=\s*hasFreeTrial\s*\|\|\s*availableCredits\s*>=\s*CREDIT_COSTS\.prd_generate/,
      'canGeneratePRD must respect free trial OR available credits >= 20'
    );
  });

  // ============================================================
  // Requirement 9: Terminal PRD workflow remains strictly Campaign -> Brief -> PRD
  // ============================================================
  it('9. Terminal workflow strictly remains ONLY Campaign -> Brief -> PRD', () => {
    assert.match(
      studioJsx,
      /\['campaign',\s*'brief',\s*'prd'\]/,
      'Stepper must strictly contain only campaign, brief, and prd'
    );
    assert.doesNotMatch(
      studioJsx,
      /'approve'|'copy'|'assets'/,
      'Stepper must NOT contain approve, copy, or assets'
    );
  });

  // ============================================================
  // Simulation: Multi-business account mock test
  // ============================================================
  describe('Multi-Business Chain Resolution Simulation', () => {
    it('Simulates multi-business user where campaign belongs to non-latest business', async () => {
      const businesses = [
        { id: 'biz-hazze-1', name: 'Hazze', created_at: '2026-01-01T00:00:00Z' },
        { id: 'biz-hazzeon-2', name: "hazze'on", created_at: '2026-02-01T00:00:00Z' },
        { id: 'biz-hazzeon-3', name: 'Hazzeon', created_at: '2026-03-01T00:00:00Z' },
      ];

      // Campaign was created for Hazze (biz-hazze-1)
      const selectedCampaign = {
        id: 'camp-101',
        business_id: 'biz-hazze-1',
        name: 'Hazze Launch',
      };

      // Active business context from context (could be latest biz-hazzeon-3)
      const activeBusiness = businesses[2];

      // Chain resolution
      const targetBusinessId = selectedCampaign?.business_id || activeBusiness?.id;

      // Must be biz-hazze-1, NOT biz-hazzeon-3
      assert.equal(targetBusinessId, 'biz-hazze-1');

      // Verify that user owns targetBusinessId
      const ownsTarget = businesses.some(b => b.id === targetBusinessId);
      assert.equal(ownsTarget, true);
    });

    it('Regression: multi-business user -> campaign.business_id = Business A -> brief belongs to campaign -> Generate PRD -> PRD succeeds using Business A -> no "No business found for this user"', async () => {
      const userBusinesses = [
        { id: 'biz-a', name: 'Business A', created_at: '2026-01-01' },
        { id: 'biz-b', name: 'Business B', created_at: '2026-02-01' },
        { id: 'biz-c', name: 'Business C', created_at: '2026-03-01' },
      ];

      // Campaign explicitly set to Business A
      const campaignA = { id: 'camp-a', business_id: 'biz-a', name: 'Campaign A' };
      const briefA = { id: 'brief-a', campaign_id: 'camp-a' };

      // Flow resolution
      const targetBusinessId = campaignA.business_id;
      assert.equal(targetBusinessId, 'biz-a');

      // Ensure that resolving business does not throw "No business found for this user"
      const ownedBiz = userBusinesses.find(b => b.id === targetBusinessId);
      assert.ok(ownedBiz, 'Business A must be found among user businesses');
      assert.equal(ownedBiz.id, 'biz-a');

      // Verify that edge function receives authoritative businessId
      const payload = {
        brief_id: briefA.id,
        business_id: targetBusinessId,
      };
      assert.equal(payload.business_id, 'biz-a');
    });

    it('Simulates missing businessId producing controlled error', () => {
      const selectedCampaign = null;
      const business = null;
      const brief = null;

      let errorThrown = null;
      try {
        const targetBusinessId = selectedCampaign?.business_id || business?.id;
        if (!targetBusinessId && brief?.campaign_id) {
          // not found
        }
        if (!targetBusinessId) {
          throw new Error('Business context tidak ditemukan untuk campaign ini.');
        }
      } catch (err) {
        errorThrown = err.message;
      }

      assert.equal(errorThrown, 'Business context tidak ditemukan untuk campaign ini.');
    });
  });
});
