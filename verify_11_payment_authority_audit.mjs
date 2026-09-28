// verify_11_payment_authority_audit.mjs
// Live Supabase E2E Security & Payment Authority Audit (@11.md)

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

const adminClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function log(testName, passed, details = '') {
  console.log(`${passed ? '✅ [PASS]' : '❌ [FAIL]'} ${testName} ${details ? '— ' + details : ''}`);
  if (!passed) {
    throw new Error(`Audit check failed: ${testName} — ${details}`);
  }
}

async function getAuthenticatedClient(email) {
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`Failed to generate magic link for ${email}: ${linkErr?.message}`);
  }

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (authErr || !authData?.session?.access_token) {
    throw new Error(`Failed to verify session for ${email}: ${authErr?.message}`);
  }
  return { client, user: authData.user };
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('LIVE AUDIT: PAYMENT AUTHORITY QRIS + CASH (@11.md)');
  console.log('================================================================\n');

  // STEP 0: Discover Business A and Business B
  console.log('--- STEP 0: Discovering Test Tenants ---');
  const { data: bizList, error: bizErr } = await adminClient
    .from('businesses')
    .select('id, name, owner_id')
    .limit(10);
  if (bizErr || !bizList || bizList.length < 2) {
    throw new Error('Need at least 2 businesses for cross-tenant audit');
  }

  const bizA = bizList.find(b => b.owner_id === '7e89dbfe-fd96-4533-b4bf-4a18268f3bb8') || bizList[0];
  const bizB = bizList.find(b => b.owner_id !== bizA.owner_id);
  if (!bizA || !bizB) {
    throw new Error('Could not identify two distinct tenant businesses');
  }

  console.log(`Business A: "${bizA.name}" (${bizA.id}), Owner: ${bizA.owner_id}`);
  console.log(`Business B: "${bizB.name}" (${bizB.id}), Owner: ${bizB.owner_id}`);

  // Fetch email of ownerA, ownerB, and normalUser
  const { data: ownerAUser } = await adminClient.auth.admin.getUserById(bizA.owner_id);
  const { data: ownerBUser } = await adminClient.auth.admin.getUserById(bizB.owner_id);
  const { data: normalUserObj } = await adminClient.auth.admin.getUserById('726797e8-5d6d-4150-8589-557b16b046f6');

  const emailA = ownerAUser.user.email;
  const emailB = ownerBUser.user.email;
  const emailNormal = normalUserObj.user.email;

  console.log(`Authenticating Owner A: ${emailA}`);
  const { client: clientA } = await getAuthenticatedClient(emailA);
  console.log(`Authenticating Cross-tenant Owner B: ${emailB}`);
  const { client: clientB } = await getAuthenticatedClient(emailB);
  console.log(`Authenticating Normal User: ${emailNormal}`);
  const { client: clientNormal } = await getAuthenticatedClient(emailNormal);

  const cleanupOrders = [];

  try {
    // -------------------------------------------------------------
    // TEST 2.A: Authenticated Owner: merchant_process_order(QRIS order)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.A: Authenticated Owner -> merchant_process_order(QRIS order) ---');
    const { data: qrisOrder, error: qrisOrderErr } = await adminClient
      .from('orders')
      .insert({
        business_id: bizA.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
        subtotal: 35000,
        discount_amount: 0,
        total: 35000,
        customer_name: 'TEST QRIS 11.md',
        notes: '[AUDIT 11.MD]'
      })
      .select()
      .single();
    log('Create QRIS test order for Business A', !qrisOrderErr && !!qrisOrder, `Order ID: ${qrisOrder?.id}`);
    cleanupOrders.push(qrisOrder.id);

    // Call merchant_process_order as Owner A
    const { data: rpcAData, error: rpcAErr } = await clientA.rpc('merchant_process_order', {
      p_order_id: qrisOrder.id,
    });
    log('Owner A executes merchant_process_order(QRIS order) -> PASS', !rpcAErr && rpcAData?.success, JSON.stringify(rpcAData || rpcAErr));

    // Verify order state
    const { data: updatedQrisOrder } = await adminClient
      .from('orders')
      .select('order_status, payment_status, payment_method, total')
      .eq('id', qrisOrder.id)
      .single();
    log('QRIS order transitioned to order_status="diproses"', updatedQrisOrder.order_status === 'diproses', updatedQrisOrder.order_status);
    log('QRIS order transitioned to payment_status="paid"', updatedQrisOrder.payment_status === 'paid', updatedQrisOrder.payment_status);

    // Verify payment record
    const { data: qrisPayments } = await adminClient
      .from('payments')
      .select('*')
      .eq('order_id', qrisOrder.id);
    log('Payment record inserted in public.payments', qrisPayments?.length === 1, `count: ${qrisPayments?.length}`);
    log('Resulting payment: payment_method = "qris"', qrisPayments?.[0]?.payment_method === 'qris', qrisPayments?.[0]?.payment_method);
    log('Resulting payment: gross_amount = order.total (35000)', Number(qrisPayments?.[0]?.gross_amount) === 35000, String(qrisPayments?.[0]?.gross_amount));
    log('Resulting payment: payment_status = "paid"', qrisPayments?.[0]?.payment_status === 'paid', qrisPayments?.[0]?.payment_status);

    // Test Idempotency & Duplicate Settlement Protection
    console.log('\n--- Idempotency & Duplicate Settlement Verification (QRIS) ---');
    const { data: rpcAIdempData, error: rpcAIdempErr } = await clientA.rpc('merchant_process_order', {
      p_order_id: qrisOrder.id,
    });
    log('Second call to merchant_process_order is idempotent', !rpcAIdempErr && rpcAIdempData?.idempotent === true, JSON.stringify(rpcAIdempData));

    const { data: qrisPaymentsAfter } = await adminClient
      .from('payments')
      .select('*')
      .eq('order_id', qrisOrder.id);
    log('No duplicate payment inserted (count remains exactly 1)', qrisPaymentsAfter?.length === 1, `count: ${qrisPaymentsAfter?.length}`);

    // -------------------------------------------------------------
    // TEST 2.B: Authenticated Owner: merchant_process_order(CASH order)
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.B: Authenticated Owner -> merchant_process_order(CASH order) ---');
    const { data: cashOrder, error: cashOrderErr } = await adminClient
      .from('orders')
      .insert({
        business_id: bizA.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        subtotal: 50000,
        discount_amount: 0,
        total: 50000,
        customer_name: 'TEST CASH 11.md',
        notes: '[AUDIT 11.MD CASH]'
      })
      .select()
      .single();
    log('Create CASH test order for Business A', !cashOrderErr && !!cashOrder, `Order ID: ${cashOrder?.id}`);
    cleanupOrders.push(cashOrder.id);

    // Call merchant_process_order as Owner A
    const { data: rpcCashData, error: rpcCashErr } = await clientA.rpc('merchant_process_order', {
      p_order_id: cashOrder.id,
    });
    log('Owner A executes merchant_process_order(CASH order) -> PASS', !rpcCashErr && rpcCashData?.success, JSON.stringify(rpcCashData || rpcCashErr));

    // Verify order state
    const { data: updatedCashOrder } = await adminClient
      .from('orders')
      .select('order_status, payment_status, payment_method, total')
      .eq('id', cashOrder.id)
      .single();
    log('CASH order transitioned to order_status="diproses"', updatedCashOrder.order_status === 'diproses', updatedCashOrder.order_status);
    log('CASH order transitioned to payment_status="paid"', updatedCashOrder.payment_status === 'paid', updatedCashOrder.payment_status);

    // Verify payment record for CASH
    const { data: cashPayments } = await adminClient
      .from('payments')
      .select('*')
      .eq('order_id', cashOrder.id);
    log('Payment record inserted for CASH order', cashPayments?.length === 1, `count: ${cashPayments?.length}`);
    log('Resulting payment: payment_method = "cash" (NOT hardcoded to qris)', cashPayments?.[0]?.payment_method === 'cash', cashPayments?.[0]?.payment_method);
    log('Resulting payment: gross_amount = order.total (50000)', Number(cashPayments?.[0]?.gross_amount) === 50000, String(cashPayments?.[0]?.gross_amount));
    log('Resulting payment: payment_status = "paid"', cashPayments?.[0]?.payment_status === 'paid', cashPayments?.[0]?.payment_status);

    // -------------------------------------------------------------
    // TEST 2.C: Normal User direct REST UPDATE orders.payment_status -> DENIED
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.C: Normal User direct REST UPDATE orders.payment_status -> DENIED ---');
    const { data: attackOrder1, error: att1Err } = await adminClient
      .from('orders')
      .insert({
        business_id: bizA.id,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
        subtotal: 10000,
        total: 10000,
        customer_name: 'ATTACK TEST 1',
        notes: '[AUDIT 11.MD ATTACK]'
      })
      .select()
      .single();
    cleanupOrders.push(attackOrder1.id);

    // Normal user attempts to update payment_status to 'paid'
    const { data: updateRes, error: updateErr } = await clientNormal
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', attackOrder1.id)
      .select();

    const { data: checkAtt1 } = await adminClient
      .from('orders')
      .select('payment_status')
      .eq('id', attackOrder1.id)
      .single();

    const normalUserUpdateBlocked = (updateRes?.length === 0 || !!updateErr) && checkAtt1.payment_status === 'pending';
    log('Normal user direct REST UPDATE orders.payment_status -> DENIED (status stays pending)', normalUserUpdateBlocked, `rows updated: ${updateRes?.length || 0}`);

    // -------------------------------------------------------------
    // TEST 2.D: Normal User direct REST INSERT payments -> DENIED
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.D: Normal User direct REST INSERT payments -> DENIED ---');
    const { data: insertPayRes, error: insertPayErr } = await clientNormal
      .from('payments')
      .insert({
        order_id: attackOrder1.id,
        business_id: bizA.id,
        gross_amount: 10000,
        payment_method: 'qris',
        payment_status: 'paid',
        paid_at: new Date().toISOString()
      })
      .select();

    const normalUserInsertPayBlocked = !!insertPayErr || insertPayRes?.length === 0;
    log('Normal user direct REST INSERT payments -> DENIED', normalUserInsertPayBlocked, insertPayErr ? insertPayErr.message : '0 rows inserted');

    // -------------------------------------------------------------
    // TEST 2.E: Normal User direct REST UPDATE payments -> DENIED
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.E: Normal User direct REST UPDATE payments -> DENIED ---');
    // Attempt update on existing payment of bizA
    const { data: updatePayRes, error: updatePayErr } = await clientNormal
      .from('payments')
      .update({ payment_status: 'refunded' })
      .eq('order_id', qrisOrder.id)
      .select();

    const normalUserUpdatePayBlocked = !!updatePayErr || updatePayRes?.length === 0;
    log('Normal user direct REST UPDATE payments -> DENIED', normalUserUpdatePayBlocked, updatePayErr ? updatePayErr.message : '0 rows updated');

    // -------------------------------------------------------------
    // TEST 2.F: Anon User direct mutations -> DENIED
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.F: Anon direct mutations -> DENIED ---');
    const { data: anonUpdRes, error: anonUpdErr } = await anonClient
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', attackOrder1.id)
      .select();
    const anonOrderUpdateBlocked = (anonUpdRes?.length === 0 || !!anonUpdErr);
    log('Anon direct REST UPDATE orders.payment_status -> DENIED', anonOrderUpdateBlocked, anonUpdErr ? anonUpdErr.message : '0 rows updated');

    const { data: anonPayInsRes, error: anonPayInsErr } = await anonClient
      .from('payments')
      .insert({
        order_id: attackOrder1.id,
        business_id: bizA.id,
        gross_amount: 10000,
        payment_method: 'qris',
        payment_status: 'paid',
      })
      .select();
    const anonPayInsBlocked = !!anonPayInsErr || anonPayInsRes?.length === 0;
    log('Anon direct REST INSERT payments -> DENIED', anonPayInsBlocked, anonPayInsErr ? anonPayInsErr.message : '0 rows inserted');

    const { error: anonRpcErr } = await anonClient.rpc('merchant_process_order', {
      p_order_id: attackOrder1.id,
    });
    log('Anon execution of merchant_process_order RPC -> DENIED', !!anonRpcErr, anonRpcErr?.message);

    // -------------------------------------------------------------
    // TEST 2.G: Cross-tenant Owner: process order Business A using Business B -> DENIED
    // -------------------------------------------------------------
    console.log('\n--- TEST 2.G: Cross-tenant Owner -> merchant_process_order(Business A order) -> DENIED ---');
    const { data: crossData, error: crossErr } = await clientB.rpc('merchant_process_order', {
      p_order_id: attackOrder1.id,
    });
    const crossTenantBlocked = !!crossErr && (crossErr.message.includes('Akses ditolak') || crossErr.code === '42501');
    log('Cross-tenant Owner B calling merchant_process_order for Business A -> DENIED', crossTenantBlocked, crossErr?.message || JSON.stringify(crossData));

    // Confirm attackOrder1 status was never changed by unauthorized callers
    const { data: finalAtt1 } = await adminClient
      .from('orders')
      .select('order_status, payment_status')
      .eq('id', attackOrder1.id)
      .single();
    log('Integrity confirmed: attack order remained pending across all unauthorized attacks',
        finalAtt1.order_status === 'pending' && finalAtt1.payment_status === 'pending',
        `order_status=${finalAtt1.order_status}, payment_status=${finalAtt1.payment_status}`);

  } finally {
    console.log('\n--- CLEANUP: Removing test orders and payments ---');
    for (const orderId of cleanupOrders) {
      await adminClient.from('payments').delete().eq('order_id', orderId);
      await adminClient.from('order_items').delete().eq('order_id', orderId);
      await adminClient.from('orders').delete().eq('id', orderId);
    }
    console.log(`Cleaned up ${cleanupOrders.length} test order(s) and related payment records.`);
  }

  console.log('\n================================================================');
  console.log('✅ ALL LIVE PAYMENT AUTHORITY & SECURITY TESTS PASSED (@11.md)');
  console.log('================================================================\n');
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err.message);
  process.exit(1);
});
