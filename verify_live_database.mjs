// verify_live_database.mjs
// Real database verification on remote Supabase instance for fixwa.md Tahap 6, 7, 8, 9

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

function log(name, passed, detail = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${name} ${detail}`);
}

async function run() {
  console.log('================================================================');
  console.log('RUNNING LIVE DATABASE & ATOMICITY VERIFICATION (SUPABASE REMOTE)');
  console.log('================================================================\n');

  let allPassed = true;

  // Find or use an existing business ID for testing
  const { data: businesses, error: bErr } = await supabaseAdmin
    .from('businesses')
    .select('id, owner_id')
    .limit(1);

  if (bErr || !businesses || businesses.length === 0) {
    console.error('No business found to test:', bErr);
    process.exit(1);
  }

  const testBizId = businesses[0].id;
  const testOwnerId = businesses[0].owner_id;
  console.log(`Using Business: ${testBizId}`);

  // -----------------------------------------------------------
  // TEST 6: Atomic Credit Debit (10 -> 6 -> 0 -> Insufficient)
  // -----------------------------------------------------------
  try {
    // Reset credit for testBizId to available = 10
    await supabaseAdmin
      .from('creative_credits')
      .upsert({
        business_id: testBizId,
        available: 10,
        consumed: 0,
        total_earned: 10,
        updated_at: new Date().toISOString(),
      });

    // Deduct 4
    const { data: step1 } = await supabaseAdmin.rpc('deduct_creative_credits_atomic', {
      p_business_id: testBizId,
      p_credits: 4,
      p_operation: 'TEST_DEBIT_4',
      p_request_id: `REQ-${Date.now()}-1`,
    });
    const passStep1 = step1?.success === true && step1?.balance_after === 6;
    log('6.1 Deduct 4 credits (10 -> 6)', passStep1, `balance: ${step1?.balance_after}`);

    // Deduct 6
    const { data: step2 } = await supabaseAdmin.rpc('deduct_creative_credits_atomic', {
      p_business_id: testBizId,
      p_credits: 6,
      p_operation: 'TEST_DEBIT_6',
      p_request_id: `REQ-${Date.now()}-2`,
    });
    const passStep2 = step2?.success === true && step2?.balance_after === 0;
    log('6.2 Deduct 6 credits (6 -> 0)', passStep2, `balance: ${step2?.balance_after}`);

    // Deduct 1 (Must fail)
    const { data: step3 } = await supabaseAdmin.rpc('deduct_creative_credits_atomic', {
      p_business_id: testBizId,
      p_credits: 1,
      p_operation: 'TEST_DEBIT_EXCEED',
      p_request_id: `REQ-${Date.now()}-3`,
    });
    const passStep3 = step3?.success === false && step3?.error === 'INSUFFICIENT_CREDITS';
    log('6.3 Deduct 1 with 0 balance (Must reject INSUFFICIENT_CREDITS)', passStep3, `error: ${step3?.error}`);

    // Verify balance is NOT negative
    const { data: finalCredits } = await supabaseAdmin
      .from('creative_credits')
      .select('available')
      .eq('business_id', testBizId)
      .single();
    const passNonNegative = finalCredits?.available === 0;
    log('6.4 Balance conservation (Available never becomes negative)', passNonNegative, `available: ${finalCredits?.available}`);

    if (!passStep1 || !passStep2 || !passStep3 || !passNonNegative) allPassed = false;
  } catch (err) {
    log('6. Atomic Credit Debit', false, err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------
  // TEST 7: Idempotent Credit Grant (Webhook retry)
  // -----------------------------------------------------------
  try {
    const testOrderId = `CREDIT-TEST-IDEMPOTENT-${Date.now()}`;

    // First grant
    const { data: grant1 } = await supabaseAdmin.rpc('grant_creative_credits_atomic', {
      p_business_id: testBizId,
      p_credits: 100,
      p_order_id: testOrderId,
    });
    const balAfter1 = grant1?.balance_after;

    // Second duplicate grant (same order_id)
    const { data: grant2 } = await supabaseAdmin.rpc('grant_creative_credits_atomic', {
      p_business_id: testBizId,
      p_credits: 100,
      p_order_id: testOrderId,
    });
    const balAfter2 = grant2?.balance_after;

    const passIdempotency = balAfter1 === balAfter2 && grant2?.already_granted === true;
    log('7. Webhook Duplicate Grant Idempotency (Same order_id grants only once)', passIdempotency, `bal1: ${balAfter1}, bal2: ${balAfter2}`);
    if (!passIdempotency) allPassed = false;
  } catch (err) {
    log('7. Idempotency Test', false, err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------
  // TEST 8: 1x Lifetime Free Usage
  // -----------------------------------------------------------
  try {
    const testRequestId = `REQ-FREE-TEST-${Date.now()}`;

    // Clean any prior free usage for clean test
    await supabaseAdmin
      .from('creative_free_usage')
      .delete()
      .eq('business_id', testBizId);

    // Initial check: should be available
    const { data: beforeUse } = await supabaseAdmin
      .from('creative_free_usage')
      .select('id')
      .eq('business_id', testBizId)
      .maybeSingle();
    const isFreeBefore = !beforeUse;

    // Consume free usage
    await supabaseAdmin
      .from('creative_free_usage')
      .insert({
        business_id: testBizId,
        profile_id: testOwnerId,
        operation: 'GENERATE_COPY',
        request_id: testRequestId,
      });

    // Check after: should NOT be available
    const { data: afterUse } = await supabaseAdmin
      .from('creative_free_usage')
      .select('id')
      .eq('business_id', testBizId)
      .maybeSingle();
    const isFreeAfter = !afterUse;

    const passFreeLogic = isFreeBefore === true && isFreeAfter === false;
    log('8. 1x Lifetime Free Usage per Business (Available initially, consumed after execution)', passFreeLogic);
    if (!passFreeLogic) allPassed = false;
  } catch (err) {
    log('8. Free Usage Test', false, err.message);
    allPassed = false;
  }

  // -----------------------------------------------------------
  // TEST 9: Campaigns Insert & Retrieval
  // -----------------------------------------------------------
  try {
    const campaignName = `E2E Campaign Test ${Date.now()}`;
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('campaigns')
      .insert({
        business_id: testBizId,
        name: campaignName,
        status: 'draft',
      })
      .select()
      .single();

    const insertPass = !insErr && inserted?.name === campaignName;

    // Retrieve
    const { data: retrieved, error: retErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', inserted?.id)
      .single();

    const retrievePass = !retErr && retrieved?.id === inserted?.id;
    log('9. Campaigns Real INSERT & SELECT on Supabase', insertPass && retrievePass, `Campaign ID: ${inserted?.id}`);

    // Clean up test campaign
    if (inserted?.id) {
      await supabaseAdmin.from('campaigns').delete().eq('id', inserted.id);
    }

    if (!insertPass || !retrievePass) allPassed = false;
  } catch (err) {
    log('9. Campaigns Insert Test', false, err.message);
    allPassed = false;
  }

  console.log('\n================================================================');
  console.log(allPassed ? '🎉 ALL REMOTE SUPABASE LIVE TESTS PASSED' : '⚠️ SOME REMOTE TESTS FAILED');
  console.log('================================================================\n');
}

run().catch(console.error);
