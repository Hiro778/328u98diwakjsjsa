// verify_production_competitor_analysis.mjs
// Production verification script for Competitor Analysis
// Conforming strictly to verif.md and final.md

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { isValidGoogleMapsUrl, normalizeGoogleMapsUrl, UNAVAILABLE_MAPS_SOURCE_TEXT, INSUFFICIENT_EVIDENCE_TEXT } from './src/lib/googleMapsUtils.js';
import { buildGroundedComparativeAnalysis } from './src/services/competitorAnalysisService.js';

const envContent = readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const supabaseAdmin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details}`);
}

async function run() {
  console.log('\n================================================================');
  console.log('STARTING PRODUCTION VERIFICATION — COMPETITOR ANALYSIS ONLY');
  console.log('Remote Supabase URL:', env.VITE_SUPABASE_URL);
  console.log('================================================================\n');

  let allPassed = true;
  const testUsersToClean = [];
  const testBusinessesToClean = [];

  try {
    // ──────────────────────────────────────────────────────────────────
    // STEP 1: VERIFY MIGRATIONS & SCHEMA IN PRODUCTION SUPABASE
    // ──────────────────────────────────────────────────────────────────
    console.log('--- STEP 1: Database Schema & Migration Verification ---');
    
    // 1.1 competitor_analyses table exists and accessible via service_role
    const { data: caData, error: caErr } = await supabaseAdmin
      .from('competitor_analyses')
      .select('id')
      .limit(1);
    const pass1_1 = !caErr;
    log('1.1 Table public.competitor_analyses exists in production', pass1_1, caErr ? caErr.message : '');
    if (!pass1_1) allPassed = false;

    // 1.2 competitor_research_tasks exists
    const { data: crtData, error: crtErr } = await supabaseAdmin
      .from('competitor_research_tasks')
      .select('id')
      .limit(1);
    const pass1_2 = !crtErr;
    log('1.2 Table public.competitor_research_tasks exists in production', pass1_2, crtErr ? crtErr.message : '');
    if (!pass1_2) allPassed = false;

    // 1.3 competitor_research_cache exists
    const { data: crcData, error: crcErr } = await supabaseAdmin
      .from('competitor_research_cache')
      .select('id')
      .limit(1);
    const pass1_3 = !crcErr;
    log('1.3 Table public.competitor_research_cache exists in production', pass1_3, crcErr ? crcErr.message : '');
    if (!pass1_3) allPassed = false;

    // 1.4 Helper functions exist
    const { data: rpcPro, error: rpcProErr } = await supabaseAdmin.rpc('is_business_pro_active', {
      p_business_id: '00000000-0000-0000-0000-000000000000'
    });
    const pass1_4 = !rpcProErr && typeof rpcPro === 'boolean';
    log('1.4 RPC function is_business_pro_active exists in production', pass1_4, rpcProErr ? rpcProErr.message : `(returns: ${rpcPro})`);
    if (!pass1_4) allPassed = false;

    // 1.5 Cache functions exist
    const { data: rpcCache, error: rpcCacheErr } = await supabaseAdmin.rpc('competitor_cache_exists', {
      p_business_id: '00000000-0000-0000-0000-000000000000',
      p_competitor_name: 'NonExistent'
    });
    const pass1_5 = !rpcCacheErr && typeof rpcCache === 'boolean';
    log('1.5 RPC function competitor_cache_exists exists in production', pass1_5, rpcCacheErr ? rpcCacheErr.message : `(returns: ${rpcCache})`);
    if (!pass1_5) allPassed = false;

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: VERIFY EDGE FUNCTIONS DEPLOYMENT & AUTH ENFORCEMENT
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 2: Edge Functions Deployment & Auth Enforcement ---');

    // 2.1 competitor-research unauthenticated check (Must return 401)
    const resResUnauth = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/competitor-research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ competitor_name: 'Test' })
    });
    const pass2_1 = resResUnauth.status === 401;
    log('2.1 Edge Function competitor-research rejects unauthenticated with 401', pass2_1, `(HTTP ${resResUnauth.status})`);
    if (!pass2_1) allPassed = false;

    // 2.2 competitor-analyze unauthenticated check (Must return 401)
    const resAnaUnauth = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/competitor-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ analysis_id: '00000000-0000-0000-0000-000000000000' })
    });
    const pass2_2 = resAnaUnauth.status === 401;
    log('2.2 Edge Function competitor-analyze rejects unauthenticated with 401', pass2_2, `(HTTP ${resAnaUnauth.status})`);
    if (!pass2_2) allPassed = false;

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: CREATE AUTHENTICATED PRODUCTION TEST ACCOUNTS (FREE & PRO)
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 3: Setup Production Accounts (Free vs Pro) ---');

    // Setup User A (Pro User)
    const emailA = `verif_pro_${Date.now()}_a@bisnissehat.id`;
    const passA = `SecretPass#${Date.now()}A!`;
    const { data: userAData, error: errA } = await supabaseAdmin.auth.admin.createUser({
      email: emailA,
      password: passA,
      email_confirm: true,
      user_metadata: { full_name: 'Verif Pro User A' }
    });
    if (errA) throw errA;
    const userA = userAData.user;
    testUsersToClean.push(userA.id);

    await supabaseAdmin.from('profiles').upsert({ id: userA.id, email: emailA, full_name: 'Verif Pro User A' });
    const { data: bizA } = await supabaseAdmin.from('businesses').insert({
      owner_id: userA.id,
      name: 'Business Pro A',
      industry: 'F&B'
    }).select().single();
    testBusinessesToClean.push(bizA.id);

    // Give User A active Pro subscription
    await supabaseAdmin.from('subscriptions').upsert({
      profile_id: userA.id,
      plan: 'pro',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Setup User B (Free User)
    const emailB = `verif_free_${Date.now()}_b@bisnissehat.id`;
    const passB = `SecretPass#${Date.now()}B!`;
    const { data: userBData, error: errB } = await supabaseAdmin.auth.admin.createUser({
      email: emailB,
      password: passB,
      email_confirm: true,
      user_metadata: { full_name: 'Verif Free User B' }
    });
    if (errB) throw errB;
    const userB = userBData.user;
    testUsersToClean.push(userB.id);

    await supabaseAdmin.from('profiles').upsert({ id: userB.id, email: emailB, full_name: 'Verif Free User B' });
    const { data: bizB } = await supabaseAdmin.from('businesses').insert({
      owner_id: userB.id,
      name: 'Business Free B',
      industry: 'Retail'
    }).select().single();
    testBusinessesToClean.push(bizB.id);

    // Free User B has 'free' plan
    await supabaseAdmin.from('subscriptions').upsert({
      profile_id: userB.id,
      plan: 'free',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: null
    });

    // Setup User C (Pro User for Tenant Isolation check)
    const emailC = `verif_pro_${Date.now()}_c@bisnissehat.id`;
    const passC = `SecretPass#${Date.now()}C!`;
    const { data: userCData, error: errC } = await supabaseAdmin.auth.admin.createUser({
      email: emailC,
      password: passC,
      email_confirm: true,
      user_metadata: { full_name: 'Verif Pro User C' }
    });
    if (errC) throw errC;
    const userC = userCData.user;
    testUsersToClean.push(userC.id);

    await supabaseAdmin.from('profiles').upsert({ id: userC.id, email: emailC, full_name: 'Verif Pro User C' });
    const { data: bizC } = await supabaseAdmin.from('businesses').insert({
      owner_id: userC.id,
      name: 'Business Pro C',
      industry: 'Services'
    }).select().single();
    testBusinessesToClean.push(bizC.id);

    await supabaseAdmin.from('subscriptions').upsert({
      profile_id: userC.id,
      plan: 'pro',
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    log('3.1 Created test accounts with clean isolation', true, `Pro A: ${userA.id}, Free B: ${userB.id}, Pro C: ${userC.id}`);

    // Authenticate clients
    const clientA = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const { data: sessionA } = await clientA.auth.signInWithPassword({ email: emailA, password: passA });

    const clientB = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const { data: sessionB } = await clientB.auth.signInWithPassword({ email: emailB, password: passB });

    const clientC = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const { data: sessionC } = await clientC.auth.signInWithPassword({ email: emailC, password: passC });

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: PRO ENTITLEMENT & FREE USER LOCKOUT IN PRODUCTION
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 4: Free User Lockout & Pro Entitlement Enforcement ---');

    // 4.1 Edge function rejection for Free user
    const resResFree = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/competitor-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionB.session.access_token}`,
        'apikey': env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        analysis_id: '00000000-0000-0000-0000-000000000000',
        competitor_id: '00000000-0000-0000-0000-000000000000',
        competitor_name: 'Test Competitor'
      })
    });
    const freeResJson = await resResFree.json().catch(() => ({}));
    const pass4_1 = resResFree.status === 403 && freeResJson.error?.includes('BisnisSehat Pro');
    log('4.1 Free user calling competitor-research receives 403 Forbidden with Pro requirement', pass4_1, `(status: ${resResFree.status}, error: "${freeResJson.error}")`);
    if (!pass4_1) allPassed = false;

    // 4.2 Free user client direct INSERT via RLS
    const { data: freeInsert, error: freeInsertErr } = await clientB
      .from('competitor_analyses')
      .insert({
        business_id: bizB.id,
        title: 'Bypass Attempt Analysis',
        status: 'draft',
        input_data: { competitors: [] }
      })
      .select();
    const pass4_2 = !!freeInsertErr || !freeInsert || freeInsert.length === 0;
    log('4.2 Free user cannot insert into competitor_analyses via direct client (RLS locked)', pass4_2, freeInsertErr ? freeInsertErr.message : '(0 rows inserted)');
    if (!pass4_2) allPassed = false;

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: PRO USER CAN RUN ANALYSIS & TENANT ISOLATION
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 5: Pro User Access & Cross-Tenant Isolation ---');

    // 5.1 Pro User A inserts analysis via RLS
    const { data: proAnalysisA, error: proInsertErr } = await clientA
      .from('competitor_analyses')
      .insert({
        business_id: bizA.id,
        title: 'Analisis Kompetitor Kopi Pro A',
        status: 'draft',
        input_data: {
          competitors: [
            {
              id: 'c1',
              name: 'Kopi Kenangan Senopati',
              mapsUrl: 'https://maps.app.goo.gl/9yB7Q47V88226sza7',
              notes: 'Pesaing area Senopati'
            }
          ]
        }
      })
      .select()
      .single();

    const pass5_1 = !proInsertErr && !!proAnalysisA?.id;
    log('5.1 Pro User A creates competitor analysis successfully', pass5_1, proInsertErr ? proInsertErr.message : `(ID: ${proAnalysisA?.id})`);
    if (!pass5_1) allPassed = false;

    // 5.2 Pro User C (different tenant) CANNOT see Pro User A's analysis
    const { data: crossTenantCheck, error: crossErr } = await clientC
      .from('competitor_analyses')
      .select('*')
      .eq('id', proAnalysisA.id);

    const pass5_2 = !crossErr && (!crossTenantCheck || crossTenantCheck.length === 0);
    log('5.2 Cross-Tenant Isolation: Pro User C cannot view Pro User A analysis (0 rows returned)', pass5_2);
    if (!pass5_2) allPassed = false;

    // 5.3 Pro User C CANNOT update or delete Pro User A's analysis
    const { data: crossUpdate, error: crossUpErr } = await clientC
      .from('competitor_analyses')
      .update({ title: 'Hacked Title' })
      .eq('id', proAnalysisA.id)
      .select();

    const pass5_3 = !crossUpdate || crossUpdate.length === 0;
    log('5.3 Cross-Tenant Isolation: Pro User C cannot update Pro User A analysis', pass5_3);
    if (!pass5_3) allPassed = false;

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: REAL GOOGLE MAPS URL & STRICT ZERO-FABRICATION VERIFICATION
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 6: Real Google Maps URL Grounding & Zero-Fabrication ---');

    const testCompetitors = [
      {
        id: 'comp_real_maps',
        name: 'Kopi Kenangan Senopati',
        mapsUrl: 'https://maps.app.goo.gl/9yB7Q47V88226sza7',
        website: '',
        notes: 'Pesaing terdekat'
      }
    ];

    // Check Maps URL validation
    const isValid = isValidGoogleMapsUrl(testCompetitors[0].mapsUrl);
    const cleanUrl = normalizeGoogleMapsUrl(testCompetitors[0].mapsUrl);
    const pass6_1 = isValid && cleanUrl.includes('maps.app.goo.gl');
    log('6.1 Real Google Maps short URL recognized as valid without API call', pass6_1, `(clean URL: ${cleanUrl})`);
    if (!pass6_1) allPassed = false;

    // Run grounded comparative analysis
    const groundedResult = buildGroundedComparativeAnalysis(testCompetitors);
    const comparisonRow = groundedResult.competitor_comparison?.rows?.[0];

    // Verify all 8 fields match exact UNAVAILABLE_MAPS_SOURCE_TEXT
    const targetUnavailable = "Tidak tersedia dari sumber yang terhubung.";
    const mapsData = comparisonRow?.google_maps_data || {};
    const checkedFields = [
      { name: 'rating', val: mapsData.rating },
      { name: 'review_count', val: mapsData.review_count },
      { name: 'address', val: mapsData.address },
      { name: 'phone', val: mapsData.phone },
      { name: 'website', val: comparisonRow?.website },
      { name: 'category', val: mapsData.category },
      { name: 'opening_hours', val: mapsData.opening_hours },
      { name: 'pricing', val: mapsData.pricing },
      { name: 'location', val: mapsData.location }
    ];

    let allFieldsMatchUnavailable = true;
    for (const f of checkedFields) {
      if (f.val !== targetUnavailable) {
        allFieldsMatchUnavailable = false;
        console.error(`Field ${f.name} mismatch: expected "${targetUnavailable}", got "${f.val}"`);
      }
    }

    log('6.2 All 8 structured Maps fields strictly display "Tidak tersedia dari sumber yang terhubung."', allFieldsMatchUnavailable);
    if (!allFieldsMatchUnavailable) allPassed = false;

    // Verify zero inference from name (name has 'Kopi' and 'Senopati' -> category/address must NOT infer 'Coffee' or 'Senopati')
    const pass6_3 = mapsData.category === targetUnavailable && mapsData.address === targetUnavailable;
    log('6.3 Zero inference from name: "Kopi Kenangan Senopati" did not infer category or location', pass6_3);
    if (!pass6_3) allPassed = false;

    // Verify evidence grounding message when evidence is insufficient
    const hasGroundedRecs = Array.isArray(groundedResult.strategic_recommendations) &&
      groundedResult.strategic_recommendations.every(r => !r.recommendation.includes('sebaiknya') && !r.recommendation.includes('lebih bagus'));
    const pass6_4 = hasGroundedRecs && groundedResult.executive_summary.overview.includes('Data tidak cukup untuk menarik kesimpulan');
    log('6.4 Analysis failure/insufficient evidence does not manufacture fallback facts', pass6_4, `(overview: "${groundedResult.executive_summary.overview}")`);
    if (!pass6_4) allPassed = false;

    // ──────────────────────────────────────────────────────────────────
    // STEP 7: UPDATE PRO ANALYSIS TO COMPLETED WITH GROUNDED DATA
    // ──────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 7: Real End-to-End Persistence for Pro User ---');

    const { data: updatedAnalysis, error: upErr } = await clientA
      .from('competitor_analyses')
      .update({
        status: 'completed',
        analysis_data: groundedResult,
        completed_at: new Date().toISOString()
      })
      .eq('id', proAnalysisA.id)
      .select()
      .single();

    const pass7_1 = !upErr && updatedAnalysis?.status === 'completed';
    log('7.1 Pro User A analysis completed and persisted with verified grounded data', pass7_1);
    if (!pass7_1) allPassed = false;

  } catch (globalErr) {
    console.error('Fatal error during production verification:', globalErr);
    allPassed = false;
  } finally {
    // Cleanup test data
    console.log('\n--- Cleanup Test Records ---');
    for (const bizId of testBusinessesToClean) {
      await supabaseAdmin.from('competitor_analyses').delete().eq('business_id', bizId);
      await supabaseAdmin.from('businesses').delete().eq('id', bizId);
    }
    for (const userId of testUsersToClean) {
      await supabaseAdmin.from('subscriptions').delete().eq('profile_id', userId);
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
    console.log('Cleaned up temporary production verification test accounts.');
  }

  console.log('\n================================================================');
  console.log(allPassed ? '🎉 ALL PRODUCTION VERIFICATION TESTS PASSED' : '⚠️ SOME PRODUCTION VERIFICATION TESTS FAILED');
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

run();
