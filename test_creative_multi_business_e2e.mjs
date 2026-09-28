// test_creative_multi_business_e2e.mjs
// MANDATORY LIVE E2E: Creative Studio Multi-Business PRD Generation Chain
// Satisfies all requirements of bug.md:
// 1. Authenticate existing test user.
// 2. Confirm user has multiple businesses.
// 3. Create temporary campaign with explicit business_id.
// 4. Create temporary brief for that campaign.
// 5. Call the SAME function/path used by the UI's "Generate PRD".
// 6. Verify PRD generation succeeds.
// 7. Verify creative_prds record is created/persisted.
// 8. Verify the resulting PRD can be loaded after fresh client/reload.
// 9. Cleanup temporary campaign/brief/PRD records.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details}`);
}

async function runLiveE2E() {
  console.log('================================================================');
  console.log('LIVE E2E: CREATIVE STUDIO MULTI-BUSINESS PRD GENERATION AUDIT');
  console.log('================================================================\n');

  let allPassed = true;
  let testCampaignId = null;
  let testBriefId = null;
  let testPrdId = null;

  try {
    // 1. Authenticate existing test user
    console.log('--- Step 1: Authenticate existing multi-business test user ---');
    const targetEmail = 'raalby702@gmail.com';
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(`Failed to generate magic link for ${targetEmail}: ${linkErr?.message}`);
    }

    const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });
    if (verifyErr || !verifyData?.session?.access_token) {
      throw new Error(`Failed to verify OTP session for ${targetEmail}: ${verifyErr?.message}`);
    }

    const userToken = verifyData.session.access_token;
    const userId = verifyData.session.user.id;
    log('1. Authenticate existing test user', true, `(UID: ${userId}, Email: ${targetEmail})`);

    // 2. Confirm user has multiple businesses (specifically 3 businesses)
    console.log('\n--- Step 2: Confirm user has multiple businesses ---');
    const { data: businesses, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('id, name, created_at, owner_id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true }); // Ascending: index 0 is oldest, last is newest

    if (bizErr || !businesses) {
      throw new Error(`Failed to query businesses for user: ${bizErr?.message}`);
    }

    console.log(`Found ${businesses.length} businesses for test user:`);
    businesses.forEach((b, idx) => console.log(`  [${idx + 1}] ID: ${b.id} | Name: "${b.name}" | Created: ${b.created_at}`));

    const hasMultiple = businesses.length >= 2;
    log('2. Confirm user has multiple businesses', hasMultiple, `Total businesses: ${businesses.length}`);
    if (!hasMultiple) {
      throw new Error('User does not have multiple businesses. Test requirement not met.');
    }

    // Select Business A (explicitly choosing an older business, NOT newest, to prove no arbitrary newest selection)
    const businessA = businesses[0];
    console.log(`Selected target Business A (Oldest): [${businessA.id}] "${businessA.name}"`);

    // 3. Create temporary campaign with explicit business_id = Business A
    console.log('\n--- Step 3: Create temporary campaign with explicit business_id (Business A) ---');
    const campaignName = `E2E PRD Live Campaign - ${Date.now()}`;
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .insert({
        business_id: businessA.id,
        name: campaignName,
        status: 'draft',
      })
      .select()
      .single();

    if (campErr || !campaign) {
      throw new Error(`Failed to create test campaign: ${campErr?.message}`);
    }
    testCampaignId = campaign.id;
    const campCorrectBiz = campaign.business_id === businessA.id;
    log('3. Create temporary campaign with explicit business_id', campCorrectBiz, `(Campaign ID: ${campaign.id}, Business ID: ${campaign.business_id})`);

    // 4. Create temporary brief for that campaign
    console.log('\n--- Step 4: Create temporary brief for that campaign ---');
    const { data: brief, error: briefErr } = await supabaseAdmin
      .from('creative_briefs')
      .insert({
        campaign_id: campaign.id,
        brief_json: {
          objective: 'Brand Awareness & Penjualan',
          target_audience: 'Pemilik UMKM dan Pelaku Usaha Mikro',
          vibe_style: 'Modern, Profesional, Terpercaya',
          platform: 'Instagram',
          cta: 'Coba Gratis Sekarang',
          offer_promo: 'Diskon 50% Bulan Pertama',
          language: 'id',
        },
      })
      .select()
      .single();

    if (briefErr || !brief) {
      throw new Error(`Failed to create test brief: ${briefErr?.message}`);
    }
    testBriefId = brief.id;
    const briefLinked = brief.campaign_id === campaign.id;
    log('4. Create temporary brief linked to campaign', briefLinked, `(Brief ID: ${brief.id})`);

    // 5. Call the SAME function/path used by UI's "Generate PRD"
    console.log('\n--- Step 5: Call the SAME function/path used by UI "Generate PRD" ---');
    console.log(`Calling Edge Function creative-generate-prd with authoritative business_id: ${businessA.id}`);

    const prdResponse = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/creative-generate-prd`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
        apikey: env.VITE_SUPABASE_ANON_KEY,
        'x-business-id': businessA.id,
      },
      body: JSON.stringify({
        brief_id: brief.id,
        product_id: null,
        business_id: businessA.id,
      }),
    });

    const prdHttpStatus = prdResponse.status;
    const prdResult = await prdResponse.json();

    console.log('HTTP Status:', prdHttpStatus);
    console.log('Result payload:', JSON.stringify(prdResult, null, 2));

    const edgeFunctionPassed = prdHttpStatus === 200 && prdResult?.status === 'ok' && !!prdResult?.prdId;
    log('5. Call SAME function/path used by UI "Generate PRD"', edgeFunctionPassed, `(Status: ${prdHttpStatus}, PRD ID: ${prdResult?.prdId})`);

    if (!edgeFunctionPassed) {
      throw new Error(`PRD generation failed with status ${prdHttpStatus}: ${JSON.stringify(prdResult)}`);
    }

    testPrdId = prdResult.prdId;

    // 6. Verify PRD generation succeeds & structure is complete
    console.log('\n--- Step 6: Verify PRD generation succeeds & structure is valid ---');
    const content = prdResult.prdContent;
    const hasRequiredFields =
      content &&
      typeof content.headline === 'string' &&
      content.headline.length > 0 &&
      typeof content.body_copy === 'string' &&
      content.body_copy.length > 0 &&
      !!content.product_snapshot;

    log('6. Verify PRD generation content and structure', hasRequiredFields, `(Headline: "${content?.headline?.substring(0, 40)}...")`);
    if (!hasRequiredFields) {
      throw new Error('PRD response missing required content fields');
    }

    // 7. Verify creative_prds record is created/persisted in Supabase DB
    console.log('\n--- Step 7: Verify creative_prds record is created/persisted ---');
    const { data: dbPrd, error: dbPrdErr } = await supabaseAdmin
      .from('creative_prds')
      .select('*')
      .eq('id', testPrdId)
      .single();

    const prdPersisted = !dbPrdErr && dbPrd && dbPrd.id === testPrdId && dbPrd.status === 'ready';
    log('7. Verify creative_prds record is created/persisted', prdPersisted, `(DB Status: ${dbPrd?.status}, Version: ${dbPrd?.version})`);
    if (!prdPersisted) {
      throw new Error(`PRD record not persisted properly in DB: ${dbPrdErr?.message}`);
    }

    // 8. Verify the resulting PRD can be loaded after fresh client/reload
    console.log('\n--- Step 8: Verify resulting PRD can be loaded after fresh client/reload ---');
    // Instantiate a brand new client with fresh session state (simulating browser reload for the authenticated user)
    const freshUserClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    const { data: freshPrd, error: freshErr } = await freshUserClient
      .from('creative_prds')
      .select('*')
      .eq('id', testPrdId)
      .single();

    const freshReadSucceeded = !freshErr && freshPrd && freshPrd.id === testPrdId;
    log('8. Verify resulting PRD loaded via fresh client reload', freshReadSucceeded, `(Loaded ID: ${freshPrd?.id}, Version: ${freshPrd?.version})`);
    if (!freshReadSucceeded) {
      throw new Error(`Fresh client read failed: ${freshErr?.message}`);
    }

    // Additional check: Verify credit balance lookup for Business A
    const { data: creditBalance, error: creditBalErr } = await supabaseAdmin
      .from('creative_credits')
      .select('available, reserved, consumed')
      .eq('business_id', businessA.id)
      .maybeSingle();

    log('8b. Verify creativeCreditService lookup for Business A', !creditBalErr, `(Credits: ${JSON.stringify(creditBalance || { available: 0 })})`);

  } catch (err) {
    console.error('\n❌ E2E Execution Error:', err.message || err);
    allPassed = false;
  } finally {
    // 9. Cleanup temporary campaign/brief/PRD records
    console.log('\n--- Step 9: Cleanup temporary campaign/brief/PRD records ---');
    if (testPrdId) {
      const { error: delPrdErr } = await supabaseAdmin.from('creative_prds').delete().eq('id', testPrdId);
      console.log(`Cleaned up test PRD ${testPrdId} (Error: ${delPrdErr?.message || 'none'})`);
    }
    if (testBriefId) {
      const { error: delBriefErr } = await supabaseAdmin.from('creative_briefs').delete().eq('id', testBriefId);
      console.log(`Cleaned up test brief ${testBriefId} (Error: ${delBriefErr?.message || 'none'})`);
    }
    if (testCampaignId) {
      const { error: delCampErr } = await supabaseAdmin.from('campaigns').delete().eq('id', testCampaignId);
      console.log(`Cleaned up test campaign ${testCampaignId} (Error: ${delCampErr?.message || 'none'})`);
    }
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('🎉 ALL 9 MANDATORY LIVE E2E REQUIREMENTS PASSED WITH SUCCESS');
  } else {
    console.log('❌ LIVE E2E TEST FAILED');
    process.exit(1);
  }
  console.log('================================================================\n');
}

runLiveE2E();
