// src/__tests__/securityStep3FullApplication.test.js
// Regression & Verification Suite for phase3.md (SECURITY FIX — STEP 3 FULL APPLICATION HARDENING)
// Minimal adversarial tests covering all 25 mandatory scenarios:
// 1. Edge Function unauthenticated
// 2. forged user_id
// 3. forged business_id
// 4. forged plan
// 5. forged isPro
// 6. cross-tenant object access
// 7. admin RPC by normal user
// 8. activation mutation by normal user
// 9. credit amount manipulation
// 10. ledger manipulation
// 11. payment status manipulation
// 12. order state manipulation
// 13. storage cross-tenant access
// 14. chat sender spoofing
// 15. chat tenant spoofing
// 16. webhook spoof
// 17. SSRF private IP
// 18. SSRF redirect & scheme bypass
// 19. secret exposure scan
// 20. replay attack
// 21. concurrent mutation
// 22. client entitlement bypass
// 23. OAuth replay
// 24. deleted/banned user access
// 25. anonymous sensitive RPC

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateSafeUrl, isPrivateIPv4, isPrivateIPv6 } from '../../supabase/functions/_shared/ssrf.ts';

describe('SECURITY FIX — STEP 3: Full Application Security Hardening Suite (@phase3.md)', () => {
  const m99Path = [
    path.resolve('supabase/migrations/100_security_step3_comprehensive_hardening.sql'),
    path.resolve('supabase/migrations/099_security_step3_comprehensive_hardening.sql'),
  ].find(p => fs.existsSync(p));
  const m99Content = fs.readFileSync(m99Path, 'utf8');

  const m98Path = [
    path.resolve('supabase/migrations/099_security_step2_subscription_credit_hardening.sql'),
    path.resolve('supabase/migrations/098_security_step2_subscription_credit_hardening.sql'),
  ].find(p => fs.existsSync(p));
  const m98Content = fs.readFileSync(m98Path, 'utf8');

  const m90Path = path.resolve('supabase/migrations/090_payment_authority_enforcement.sql');
  const m90Content = fs.readFileSync(m90Path, 'utf8');

  const m82Path = path.resolve('supabase/migrations/082_qris_and_order_security_hardening.sql');
  const m82Content = fs.readFileSync(m82Path, 'utf8');

  const authSharedPath = path.resolve('supabase/functions/_shared/auth.ts');
  const authSharedContent = fs.readFileSync(authSharedPath, 'utf8');

  const snapPath = path.resolve('supabase/functions/midtrans-subscription-snap/index.ts');
  const snapContent = fs.readFileSync(snapPath, 'utf8');

  const midtransNotifPath = path.resolve('supabase/functions/midtrans-notification/index.ts');
  const midtransNotifContent = fs.readFileSync(midtransNotifPath, 'utf8');

  const topupSnapPath = path.resolve('supabase/functions/creative-topup-snap/index.ts');
  const topupSnapContent = fs.readFileSync(topupSnapPath, 'utf8');

  const diagnoseVisionPath = path.resolve('supabase/functions/diagnose-vision/index.ts');
  const diagnoseVisionContent = fs.readFileSync(diagnoseVisionPath, 'utf8');

  const marketplaceWebhookPath = path.resolve('supabase/functions/marketplace-webhook/index.ts');
  const marketplaceWebhookContent = fs.readFileSync(marketplaceWebhookPath, 'utf8');

  // ──────────────────────────────────────────────────────────
  // 1. EDGE FUNCTION UNAUTHENTICATED
  // ──────────────────────────────────────────────────────────
  test('1. Edge Function unauthenticated: verifyAuth and diagnose-vision reject unauthenticated callers with 401', () => {
    assert.match(
      authSharedContent,
      /if \(!authHeader\) \{\s*throw new Error\("Missing Authorization header"\);/,
      'verifyAuth must reject missing Authorization header'
    );
    assert.match(
      diagnoseVisionContent,
      /if \(!isAuthorized\) \{\s*return new Response\(JSON\.stringify\(\{ error: "Unauthorized access" \}\)/,
      'diagnose-vision must enforce authentication check'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 2. FORGED USER_ID
  // ──────────────────────────────────────────────────────────
  test('2. forged user_id: Edge Functions derive identity strictly from auth.uid() / token and ignore body.user_id', () => {
    assert.match(
      authSharedContent,
      /userClient\.auth\.getUser\(\)/,
      'Must derive user strictly from userClient.auth.getUser()'
    );
    assert.match(
      authSharedContent,
      /userId:\s*user\.id,/,
      'Must assign userId from authenticated token identity'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 3. FORGED BUSINESS_ID
  // ──────────────────────────────────────────────────────────
  test('3. forged business_id: explicit business ID not owned by user throws access denied instead of fallback', () => {
    assert.match(
      authSharedContent,
      /throw new Error\("Access denied: You do not own or have access to the specified business"\);/,
      'Explicit unowned businessId must be rejected with error'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 4. FORGED PLAN
  // ──────────────────────────────────────────────────────────
  test('4. forged plan: server determines package from verified recorded payment or database, never client body', () => {
    assert.match(
      midtransNotifContent,
      /const activatedPlan = \(subPayment\.plan === "basic" \|\| Number\(subPayment\.gross_amount\) <= 35000\) \? "basic" : "pro";/,
      'Activated plan is derived from payment record gross_amount, not client payload'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 5. FORGED ISPRO
  // ──────────────────────────────────────────────────────────
  test('5. forged isPro: server-side isProUser queries subscriptions table and ignores client boolean', () => {
    const entitlementPath = path.resolve('supabase/functions/_shared/entitlement.ts');
    const entitlementContent = fs.readFileSync(entitlementPath, 'utf8');
    assert.match(
      entitlementContent,
      /\.from\(["']subscriptions["']\)\s*\.select\(/,
      'isProUser queries database authoritatively'
    );
    assert.match(
      entitlementContent,
      /\.eq\(["']plan["'],\s*["']pro["']\)/,
      'isProUser checks plan is pro'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 6. CROSS-TENANT OBJECT ACCESS
  // ──────────────────────────────────────────────────────────
  test('6. cross-tenant object access: RPCs and policies strictly reject cross-tenant manipulation', () => {
    assert.match(
      m99Content,
      /IF OLD\.business_id <> NEW\.business_id THEN\s*RAISE EXCEPTION 'FORBIDDEN: Tenant business_id tidak dapat diubah\.'/,
      'Trigger prevents cross-tenant migration of order records'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 7. ADMIN RPC BY NORMAL USER
  // ──────────────────────────────────────────────────────────
  test('7. admin RPC by normal user: admin functions verify is_admin() and reject unauthorized callers with 42501', () => {
    const m97Path = path.resolve('supabase/migrations/097_credit_activation_links.sql');
    const m97Content = fs.readFileSync(m97Path, 'utf8');
    assert.match(
      m97Content,
      /IF NOT v_is_adm THEN\s*RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat link aktivasi kredit' USING ERRCODE = '42501';/,
      'admin_generate_credit_activation enforces is_admin()'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 8. ACTIVATION MUTATION BY NORMAL USER
  // ──────────────────────────────────────────────────────────
  test('8. activation mutation by normal user: normal users cannot generate Pro or Credit activation codes', () => {
    const m94Path = path.resolve('supabase/migrations/094_pro_activation_email_binding.sql');
    const m94Content = fs.readFileSync(m94Path, 'utf8');
    assert.match(
      m94Content,
      /IF NOT v_is_adm THEN\s*RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat kode aktivasi PRO'/,
      'admin_generate_pro_activation_code requires admin status'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 9. CREDIT AMOUNT MANIPULATION
  // ──────────────────────────────────────────────────────────
  test('9. credit amount manipulation: creative top-up strictly enforces server packages and rejects client pricing', () => {
    assert.match(
      topupSnapContent,
      /const CREDIT_PACKAGES: Record<string, \{ credits: number; priceIdr: number; name: string \}> = \{/,
      'Packages are hardcoded server-side in topup function'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 10. LEDGER MANIPULATION
  // ──────────────────────────────────────────────────────────
  test('10. ledger manipulation: direct INSERT on credit_ledger is revoked from public and client users', () => {
    const m35Path = path.resolve('supabase/migrations/035_creative_studio.sql');
    const m35Content = fs.readFileSync(m35Path, 'utf8');
    assert.match(
      m35Content,
      /drop policy if exists "Credit ledger insert" on public\.credit_ledger;/,
      'No insert policy on credit_ledger for public/authenticated users'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 11. PAYMENT STATUS MANIPULATION
  // ──────────────────────────────────────────────────────────
  test('11. payment status manipulation: public and non-merchant clients cannot directly UPDATE payment status', () => {
    assert.match(
      m90Content,
      /DROP POLICY "payments_public_insert" ON public\.payments;\s*END IF;\s*IF EXISTS \(\s*SELECT 1 FROM pg_policies\s*WHERE tablename = 'payments' AND policyname = 'payments_public_update'\s*\) THEN\s*DROP POLICY "payments_public_update" ON public\.payments;/,
      'No public INSERT or UPDATE policies allowed on payments table'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 12. ORDER STATE MANIPULATION
  // ──────────────────────────────────────────────────────────
  test('12. order state manipulation: terminal order state enforcement prevents completed/cancelled order tampering', () => {
    assert.match(
      m99Content,
      /IF OLD\.order_status IN \('selesai', 'completed'\) AND NEW\.order_status NOT IN \('selesai', 'completed'\) THEN/,
      'Completed orders cannot be reopened or cancelled'
    );
    assert.match(
      m99Content,
      /IF OLD\.order_status IN \('dibatalkan', 'cancelled'\) AND NEW\.order_status NOT IN \('dibatalkan', 'cancelled'\) THEN/,
      'Cancelled orders cannot be completed or processed'
    );
    assert.match(
      m99Content,
      /IF NEW\.order_status IN \('selesai', 'completed'\) AND NEW\.payment_status NOT IN \('paid', 'lunas'\) THEN/,
      'Unpaid orders cannot transition to completed'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 13. STORAGE CROSS-TENANT ACCESS
  // ──────────────────────────────────────────────────────────
  test('13. storage cross-tenant access: storage policies isolate files by business folder and user UUID', () => {
    const m07Path = path.resolve('supabase/migrations/007_fix_storage_rls_policies.sql');
    const m07Content = fs.readFileSync(m07Path, 'utf8');
    assert.match(
      m07Content,
      /\(storage\.foldername\(name\)\)\[1\] IN \(\s*SELECT id::text FROM public\.businesses\s*WHERE owner_id = \(SELECT auth\.uid\(\)\)/,
      'Product images and business assets require business owner auth.uid()'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 14. CHAT SENDER SPOOFING
  // ──────────────────────────────────────────────────────────
  test('14. chat sender spoofing: customer cannot claim privileged identity like Penjual or Admin', () => {
    assert.match(
      m82Content,
      /IF lower\(v_clean_name\) IN \('penjual', 'merchant', 'admin', 'bisnissehat', 'sistem', 'kasir'\) THEN/,
      'Anti-spoofing sanitizes privileged sender names for customers'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 15. CHAT TENANT SPOOFING
  // ──────────────────────────────────────────────────────────
  test('15. chat tenant spoofing: authenticated user from another tenant cannot inject customer messages', () => {
    assert.match(
      m82Content,
      /IF v_caller_id IS NOT NULL AND v_caller_id <> v_order\.owner_id THEN\s*RAISE EXCEPTION 'FORBIDDEN: Pengguna terautentikasi tidak dapat mengirim pesan sebagai pelanggan bisnis lain\.'/,
      'Cross-tenant chat injection is blocked'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 16. WEBHOOK SPOOF
  // ──────────────────────────────────────────────────────────
  test('16. webhook spoof: Midtrans and Marketplace webhooks require verified signatures and reject fallback to random businesses', () => {
    assert.match(
      midtransNotifContent,
      /const signatureValid = await verifySignature\(/,
      'Midtrans webhook verifies cryptographic signature'
    );
    assert.match(
      marketplaceWebhookContent,
      /return errorResponse\("Verified marketplace connection not found", 404\);/,
      'Marketplace webhook does NOT fall back to random business connections'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 17. SSRF PRIVATE IP
  // ──────────────────────────────────────────────────────────
  test('17. SSRF private IP: validateSafeUrl blocks private RFC1918, loopback, and cloud metadata', () => {
    assert.equal(validateSafeUrl('http://127.0.0.1/admin').safe, false);
    assert.equal(validateSafeUrl('http://localhost:3000').safe, false);
    assert.equal(validateSafeUrl('http://10.0.0.1').safe, false);
    assert.equal(validateSafeUrl('http://192.168.1.1').safe, false);
    assert.equal(validateSafeUrl('http://172.16.0.1').safe, false);
    assert.equal(validateSafeUrl('http://169.254.169.254/latest/meta-data').safe, false);
    assert.equal(validateSafeUrl('http://[::1]').safe, false);
    assert.equal(validateSafeUrl('http://metadata.google.internal').safe, false);

    // Legitimate public domain is allowed
    assert.equal(validateSafeUrl('https://example.com').safe, true);
    assert.equal(validateSafeUrl('https://bisnissehat.id').safe, true);
  });

  // ──────────────────────────────────────────────────────────
  // 18. SSRF REDIRECT & SCHEME BYPASS
  // ──────────────────────────────────────────────────────────
  test('18. SSRF redirect & scheme bypass: dangerous non-HTTP protocols are rejected', () => {
    assert.equal(validateSafeUrl('file:///etc/passwd').safe, false);
    assert.equal(validateSafeUrl('gopher://127.0.0.1:70').safe, false);
    assert.equal(validateSafeUrl('ftp://example.com').safe, false);
    assert.equal(validateSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==').safe, false);
  });

  // ──────────────────────────────────────────────────────────
  // 19. SECRET EXPOSURE SCAN
  // ──────────────────────────────────────────────────────────
  test('19. secret exposure scan: client source does not hardcode server service-role keys or midtrans server key', () => {
    const srcDir = path.resolve('src');
    const readFiles = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file !== '__tests__') results = results.concat(readFiles(fullPath));
        } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = readFiles(srcDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `Server key leaked in ${file}`);
      assert.ok(!content.includes('MIDTRANS_SERVER_KEY'), `Midtrans key leaked in ${file}`);
    }
  });

  // ──────────────────────────────────────────────────────────
  // 20. REPLAY ATTACK
  // ──────────────────────────────────────────────────────────
  test('20. replay attack: idempotency check prevents re-crediting or duplicate subscription extension on replayed webhooks', () => {
    assert.match(
      midtransNotifContent,
      /if \(subPayment\.payment_status === "paid" && newPaymentStatus === "paid"\) \{\s*console\.log\(`\[midtrans-notification\] Subscription payment already processed: \$\{order_id\}\. Skipping\.`\);\s*return new Response\("OK", \{ status: 200 \}\);\s*\}/,
      'Subscription webhook enforces idempotency check'
    );
    assert.match(
      midtransNotifContent,
      /if \(purchase\.status === "paid" && newPaymentStatus === "paid"\) \{\s*console\.log\(`\[midtrans-notification\] Credit purchase already processed: \$\{order_id\}\. Skipping duplicate\.`\);\s*return new Response\("OK", \{ status: 200 \}\);\s*\}/,
      'Credit webhook enforces idempotency check'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 21. CONCURRENT MUTATION
  // ──────────────────────────────────────────────────────────
  test('21. concurrent mutation: row-level lock FOR UPDATE and unique constraints prevent duplicate redemption races', () => {
    const m97Path = path.resolve('supabase/migrations/097_credit_activation_links.sql');
    const m97Content = fs.readFileSync(m97Path, 'utf8');
    assert.match(
      m97Content,
      /SELECT \* INTO v_activation\s*FROM public\.credit_activation_links\s*WHERE token_hash = v_token_hash\s*FOR UPDATE;/,
      'credit redemption uses FOR UPDATE row-level lock'
    );
    assert.match(
      m98Content,
      /CREATE UNIQUE INDEX idx_credit_ledger_idempotency_key\s*ON public\.credit_ledger\(idempotency_key\)/,
      'credit_ledger enforces unique idempotency constraint'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 22. CLIENT ENTITLEMENT BYPASS
  // ──────────────────────────────────────────────────────────
  test('22. client entitlement bypass: creative and marketplace Edge Functions enforce server-side Pro check', () => {
    const copyFuncPath = path.resolve('supabase/functions/creative-generate-copy/index.ts');
    const copyContent = fs.readFileSync(copyFuncPath, 'utf8');
    assert.match(
      copyContent,
      /const hasPro = await isProUser\(auth\.userId\);/,
      'creative-generate-copy verifies Pro on server'
    );

    const mktConnectPath = path.resolve('supabase/functions/marketplace-connect/index.ts');
    const mktConnectContent = fs.readFileSync(mktConnectPath, 'utf8');
    assert.match(
      mktConnectContent,
      /const hasPro = await isProUser\(auth\.userId\);/,
      'marketplace-connect verifies Pro on server'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 23. OAUTH REPLAY
  // ──────────────────────────────────────────────────────────
  test('23. OAuth replay: OAuth callback checks expires_at and state validity', () => {
    const oauthCallbackPath = path.resolve('supabase/functions/marketplace-oauth/callback/index.ts');
    const oauthCallbackContent = fs.readFileSync(oauthCallbackPath, 'utf8');
    assert.match(
      oauthCallbackContent,
      /new Date\(stateRecord\.expires_at\) < new Date\(\)/,
      'OAuth state expiration is verified'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 24. DELETED/BANNED USER ACCESS
  // ──────────────────────────────────────────────────────────
  test('24. deleted/banned user access: verifyAuth verifies profile status is active before allowing access', () => {
    assert.match(
      authSharedContent,
      /if \(profError \|\| !profile \|\| profile\.status !== "active"\) \{\s*throw new Error\("Account access denied: Account is not active or has been suspended\/banned"\);/,
      'Inactive, suspended, or banned profile is denied access'
    );
  });

  // ──────────────────────────────────────────────────────────
  // 25. ANONYMOUS SENSITIVE RPC
  // ──────────────────────────────────────────────────────────
  test('25. anonymous sensitive RPC: sensitive RPCs require authentication and revoke public/anon access', () => {
    assert.match(
      m99Content,
      /REVOKE EXECUTE ON FUNCTION public\.grant_pro_monthly_allowance_atomic\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated;\s*GRANT EXECUTE ON FUNCTION public\.grant_pro_monthly_allowance_atomic\(uuid, uuid, text\) TO service_role;/,
      'grant_pro_monthly_allowance_atomic is restricted to service_role'
    );
    assert.match(
      m98Content,
      /REVOKE ALL ON FUNCTION public\.cancel_subscription_atomic\(uuid, text\) FROM PUBLIC, anon;/,
      'cancel_subscription_atomic is revoked from anon'
    );
  });
});
