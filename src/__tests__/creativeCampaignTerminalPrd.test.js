// src/__tests__/creativeCampaignTerminalPrd.test.js
// Test suite for fix.md:
// AI Creative Studio — Campaign Creation, Tenant Isolation, and Terminal PRD Workflow

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('fix.md AI Creative Studio — Campaign Flow & Terminal PRD Suite', () => {
  const creativeStudioJsxPath = path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx');
  const creativeServicePath = path.resolve('src/services/creativeStudioService.js');
  const creativeCreditServicePath = path.resolve('src/services/creativeCreditService.js');

  const studioJsx = fs.readFileSync(creativeStudioJsxPath, 'utf8');
  const serviceJs = fs.readFileSync(creativeServicePath, 'utf8');
  const creditServiceJs = fs.readFileSync(creativeCreditServicePath, 'utf8');

  // ============================================================
  // 1. Audit & Fix of createCampaign & resolveBusinessId (PHASE 1)
  // ============================================================
  describe('Phase 1: Campaign Creation & Business Resolution', () => {
    it('1. resolveBusinessId in creativeStudioService does not use fragile .single() that throws PGRST116 on multi-business accounts', () => {
      assert.doesNotMatch(
        serviceJs,
        /from\(['"]businesses['"]\)\s*\.select\(['"]id['"]\)\s*\.eq\(['"]owner_id['"],\s*user\.id\)\s*\.single\(\)/,
        'Must not call .single() on businesses table without fallback or ordering'
      );
      assert.match(
        serviceJs,
        /maybeSingle\(\)/,
        'Must use maybeSingle() when resolving business'
      );
    });

    it('2. resolveBusinessId supports explicit businessId override from active tenant session', () => {
      assert.match(
        serviceJs,
        /resolveBusinessId\s*\(\s*explicitBusinessId\s*=\s*null\s*\)/,
        'resolveBusinessId must accept explicitBusinessId parameter'
      );
      assert.match(
        serviceJs,
        /if\s*\(\s*explicitBusinessId\s*\)\s*return\s*explicitBusinessId/,
        'Must immediately return explicitBusinessId if provided'
      );
    });

    it('3. createCampaign accepts businessId and inserts campaign tenant-scoped', () => {
      assert.match(
        serviceJs,
        /export\s+async\s+function\s+createCampaign\s*\(\s*name,\s*businessId\s*=\s*null\s*\)/,
        'createCampaign must accept name and optional businessId'
      );
      assert.match(
        serviceJs,
        /business_id:\s*resolvedBusinessId/,
        'Must insert business_id into campaigns table'
      );
    });

    it('4. listCampaigns accepts businessId and scopes queries to business_id', () => {
      assert.match(
        serviceJs,
        /export\s+async\s+function\s+listCampaigns\s*\(\s*businessId\s*=\s*null\s*\)/,
        'listCampaigns must accept businessId'
      );
      assert.match(
        serviceJs,
        /\.eq\(['"]business_id['"],\s*resolvedBusinessId\)/,
        'listCampaigns must filter by business_id'
      );
    });

    it('5. CreativeStudioPage passes active business.id to createCampaign and listCampaigns', () => {
      assert.match(
        studioJsx,
        /createCampaign\(briefForm\.campaign_name[^,]*,\s*business\?\.id\)/,
        'CreativeStudioPage must pass business?.id to createCampaign'
      );
      assert.match(
        studioJsx,
        /listCampaigns\(business\?\.id\)/,
        'CreativeStudioPage must pass business?.id to listCampaigns'
      );
    });
  });

  // ============================================================
  // 2. Stepper & Terminal PRD Workflow (PHASE 2 & 3)
  // ============================================================
  describe('Phase 2 & 3: Workflow Stops at PRD (Terminal Step)', () => {
    it('6. Stepper strictly defines ONLY 3 steps: Campaign -> Brief -> PRD', () => {
      assert.match(
        studioJsx,
        /\['campaign',\s*'brief',\s*'prd'\]/,
        'Progress steps must only contain campaign, brief, and prd'
      );
      assert.doesNotMatch(
        studioJsx,
        /\['campaign',\s*'brief',\s*'prd',\s*'approve'/,
        'Stepper must NOT contain approve'
      );
    });

    it('7. Approve step is completely removed from UI and state machine', () => {
      assert.doesNotMatch(
        studioJsx,
        /step\s*===\s*['"]approve['"]/,
        'UI must not render step === "approve"'
      );
      assert.doesNotMatch(
        studioJsx,
        /setStep\(['"]approve['"]\)/,
        'State transitions must not set step to "approve"'
      );
    });

    it('8. Copy step is completely removed from UI and state machine', () => {
      assert.doesNotMatch(
        studioJsx,
        /step\s*===\s*['"]copy['"]/,
        'UI must not render step === "copy"'
      );
      assert.doesNotMatch(
        studioJsx,
        /setStep\(['"]copy['"]\)/,
        'State transitions must not set step to "copy"'
      );
    });

    it('9. Assets step is completely removed from UI and state machine', () => {
      assert.doesNotMatch(
        studioJsx,
        /step\s*===\s*['"]assets['"]/,
        'UI must not render step === "assets"'
      );
      assert.doesNotMatch(
        studioJsx,
        /setStep\(['"]assets['"]\)/,
        'State transitions must not set step to "assets"'
      );
    });

    it('10. handleGeneratePRD keeps user on PRD step as terminal state', () => {
      // PRD generation sets step to 'prd' or does not advance to step 4
      assert.match(
        studioJsx,
        /setStep\(['"]prd['"]\)/,
        'handleGeneratePRD must remain on prd step'
      );
      assert.doesNotMatch(
        studioJsx,
        /handleGeneratePRD[\s\S]*?setStep\(['"]approve['"]\)/,
        'handleGeneratePRD must NOT redirect to approve'
      );
    });

    it('11. Terminal PRD view provides actions to start new campaign or return to brief', () => {
      assert.match(
        studioJsx,
        /Buat Campaign Baru/,
        'Terminal PRD view must provide action to start new campaign'
      );
      assert.match(
        studioJsx,
        /Kembali ke Brief/,
        'Terminal PRD view must provide action to navigate back to brief'
      );
    });
  });

  // ============================================================
  // 3. Security & Tenant Isolation (PHASE 4)
  // ============================================================
  describe('Phase 4: Tenant Isolation & Frontend Security', () => {
    it('12. No service-role key is exposed in frontend files', () => {
      assert.doesNotMatch(
        studioJsx,
        /SUPABASE_SERVICE_ROLE_KEY|service_role/,
        'CreativeStudioPage must not contain service_role keys'
      );
      assert.doesNotMatch(
        serviceJs,
        /SUPABASE_SERVICE_ROLE_KEY|service_role/,
        'creativeStudioService must not contain service_role keys'
      );
      assert.doesNotMatch(
        creditServiceJs,
        /SUPABASE_SERVICE_ROLE_KEY|service_role/,
        'creativeCreditService must not contain service_role keys'
      );
    });

    it('13. Migration 035 enforces row-level security on public.campaigns by business_id & owner_id', () => {
      const migration035 = fs.readFileSync('supabase/migrations/035_creative_studio.sql', 'utf8');
      assert.match(
        migration035,
        /create table if not exists public\.campaigns/,
        'public.campaigns must be created in migration 035'
      );
      assert.match(
        migration035,
        /alter table public\.campaigns enable row level security/,
        'RLS must be enabled on public.campaigns'
      );
      assert.match(
        migration035,
        /create policy "Campaigns owner all" on public\.campaigns/,
        'Campaigns owner all policy must exist'
      );
    });
  });
});
