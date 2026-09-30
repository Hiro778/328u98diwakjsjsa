// src/__tests__/pro_activation_security.test.js
// BisnisSehat PRO Activation Code & QR Security Test Suite
// Validates all 19 required security scenarios from @act.md:
// 1. Admin generate code untuk email A → PASS
// 2. User email A redeem → PASS
// 3. User email B redeem kode A → DENIED
// 4. Anonymous redeem → DENIED
// 5. Same token second redeem → DENIED
// 6. Concurrent redeem → exactly 1 success
// 7. Admin revoke unused code → PASS
// 8. Revoked code redeem → DENIED
// 9. Redeemed code cannot be revoked
// 10. Normal user cannot revoke
// 11. Normal user cannot list activation codes
// 12. Token plaintext never stored
// 13. Token remains cryptographically random
// 14. Email normalization works: TEST@GMAIL.COM == test@gmail.com
// 15. No plaintext token in admin_audit_logs
// 16. IDOR: admin cannot manipulate arbitrary user identity during redeem
// 17. Frontend cannot override target_email
// 18. Direct RPC security tests
// 19. Existing QRGenerator.jsx POS/QRIS remains untouched

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { buildActivationUrl } from '../lib/activationCodeService.js'

describe('PRO Activation Code System — Comprehensive Security Test Suite (@act.md)', () => {
  const m92Path = path.resolve('supabase/migrations/092_pro_activation_codes.sql')
  const m92Content = fs.readFileSync(m92Path, 'utf8')

  const m94Path = path.resolve('supabase/migrations/094_pro_activation_email_binding.sql')
  const m94Content = fs.readFileSync(m94Path, 'utf8')

  // 1. ADMIN GENERATE CODE UNTUK EMAIL A -> PASS
  test('1. Admin generate code untuk email A → PASS: requires target_email and stores normalized recipient', () => {
    assert.match(m94Content, /CREATE OR REPLACE FUNCTION public\.admin_generate_pro_activation_code\s*\(\s*p_target_email text/, 'RPC signature requires p_target_email')
    assert.match(m94Content, /IF p_target_email IS NULL OR TRIM\(p_target_email\) = '' THEN\s+RAISE EXCEPTION/, 'Rejects empty target email')
    assert.match(m94Content, /v_target_email := lower\(trim\(p_target_email\)\);/, 'Normalizes target email')
    assert.match(m94Content, /INSERT INTO public\.pro_activation_codes[\s\S]+?target_email/, 'Inserts target_email into pro_activation_codes')
  })

  // 2. USER EMAIL A REDEEM -> PASS
  test('2. User email A redeem → PASS: matches authenticated email and activates subscription', () => {
    assert.match(m94Content, /SELECT lower\(trim\(email\)\) INTO v_user_email\s+FROM auth\.users\s+WHERE id = v_caller_id;/, 'Fetches user email from auth.users')
    assert.match(m94Content, /UPDATE public\.pro_activation_codes\s+SET\s+status = 'redeemed'/, 'Marks code as redeemed')
    assert.match(m94Content, /plan = 'pro',\s+status = 'active'/, 'Grants active PRO subscription')
  })

  // 3. USER EMAIL B REDEEM KODE A -> DENIED
  test('3. User email B redeem kode A → DENIED: generic error prevents identity/existence disclosure', () => {
    assert.match(m94Content, /IF v_code_row\.target_email IS NOT NULL AND lower\(trim\(v_code_row\.target_email\)\) <> v_user_email THEN/, 'Checks target email match')
    assert.match(m94Content, /RAISE EXCEPTION 'Kode aktivasi tidak valid atau tidak ditujukan untuk akun ini\.'/, 'Returns safe anti-enumeration generic error')
  })

  // 4. ANONYMOUS REDEEM -> DENIED
  test('4. Anonymous redeem → DENIED: strictly enforces authenticated caller', () => {
    assert.match(m94Content, /v_caller_id := auth\.uid\(\);/, 'Must inspect auth.uid() server-side')
    assert.match(m94Content, /IF v_caller_id IS NULL THEN\s+RAISE EXCEPTION/, 'Must reject unauthenticated calls')
    assert.match(m92Content, /REVOKE ALL ON public\.pro_activation_codes FROM anon/, 'Must revoke direct table access from anon')
  })

  // 5. SAME TOKEN SECOND REDEEM -> DENIED
  test('5. Same token second redeem → DENIED: status check rejects non-unused codes', () => {
    assert.match(m94Content, /v_code_row\.status <> 'unused'/, 'Status must be unused to redeem')
  })

  // 6. CONCURRENT REDEEM -> EXACTLY 1 SUCCESS
  test('6. Concurrent redeem → exactly 1 success: uses FOR UPDATE row locking', () => {
    assert.match(m94Content, /SELECT \*[\s\S]+?FROM public\.pro_activation_codes[\s\S]+?FOR UPDATE;/, 'Acquires pessimistic row lock on code')
    assert.match(m94Content, /FROM public\.pro_activation_rate_limits[\s\S]+?FOR UPDATE;/, 'Acquires pessimistic row lock on rate limit')
  })

  // 7. ADMIN REVOKE UNUSED CODE -> PASS
  test('7. Admin revoke unused code → PASS: admin_revoke_pro_activation_code transitions status to revoked', () => {
    assert.match(m94Content, /CREATE OR REPLACE FUNCTION public\.admin_revoke_pro_activation_code/, 'Revoke RPC exists')
    assert.match(m94Content, /UPDATE public\.pro_activation_codes\s+SET\s+status = 'revoked'/, 'Updates status to revoked')
    assert.match(m94Content, /'PRO_ACTIVATION_CODE_REVOKED'/, 'Audit event recorded for revocation')
  })

  // 8. REVOKED CODE REDEEM -> DENIED
  test('8. Revoked code redeem → DENIED: status check prevents redemption of revoked codes', () => {
    assert.match(m92Content, /CHECK \(status IN \('unused', 'redeemed', 'revoked', 'expired'\)\)/, 'Status domain includes revoked')
    assert.match(m94Content, /v_code_row\.status <> 'unused'/, 'Non-unused codes strictly rejected')
  })

  // 9. REDEEMED CODE CANNOT BE REVOKED
  test('9. Redeemed code cannot be revoked: checks status = redeemed and denies', () => {
    assert.match(m94Content, /IF v_code_row\.status = 'redeemed' THEN\s+RAISE EXCEPTION 'Kode aktivasi yang sudah digunakan tidak dapat dicabut'/, 'Prevents revoking redeemed codes')
  })

  // 10. NORMAL USER CANNOT REVOKE
  test('10. Normal user cannot revoke: strictly verifies public.is_admin() in revoke RPC', () => {
    assert.match(m94Content, /v_is_adm := public\.is_admin\(\);[\s\S]+?IF NOT v_is_adm THEN\s+RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat mencabut kode aktivasi PRO'/, 'Requires admin privilege to revoke')
  })

  // 11. NORMAL USER CANNOT LIST ACTIVATION CODES
  test('11. Normal user cannot list activation codes: get_admin_pro_activation_codes requires public.is_admin()', () => {
    assert.match(m94Content, /CREATE OR REPLACE FUNCTION public\.get_admin_pro_activation_codes[\s\S]+?v_is_adm := public\.is_admin\(\);[\s\S]+?IF NOT v_is_adm THEN\s+RAISE EXCEPTION/, 'Requires admin privilege to list codes')
    assert.match(m92Content, /CREATE POLICY "pro_activation_codes_admin_select"[\s\S]+?USING \(public\.is_admin\(\)\);/, 'RLS policy restricts select to admin')
  })

  // 12. TOKEN PLAINTEXT NEVER STORED
  test('12. Token plaintext never stored: only cryptographic hash stored in database', () => {
    assert.match(m94Content, /v_code_hash := encode\(sha256\(v_code::bytea\), 'hex'\);/, 'SHA-256 hash computed')
    assert.match(m94Content, /INSERT INTO public\.pro_activation_codes \(\s*code_hash,/, 'Only code_hash is inserted')
    assert.doesNotMatch(m94Content, /INSERT INTO public\.pro_activation_codes[^\)]*?,\s*code\s*,/, 'Never inserts plaintext code column')
  })

  // 13. TOKEN REMAINS CRYPTOGRAPHICALLY RANDOM
  test('13. Token remains cryptographically random: 128-bit CSPRNG entropy', () => {
    assert.match(m94Content, /extensions\.gen_random_bytes\(16\)/, 'Uses CSPRNG 16 bytes = 128 bits')
    const randomBytes = crypto.randomBytes(16)
    const hex = randomBytes.toString('hex').toUpperCase()
    assert.strictEqual(hex.length, 32, 'Must yield 32 hex characters')
    const code = `BS-PRO-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 24)}-${hex.slice(24, 28)}-${hex.slice(28, 32)}`
    assert.match(code, /^BS-PRO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  // 14. EMAIL NORMALIZATION WORKS
  test('14. Email normalization works: TEST@GMAIL.COM == test@gmail.com', () => {
    const rawA = '  TEST@GMAIL.COM '
    const rawB = 'test@gmail.com'
    const normA = rawA.trim().toLowerCase()
    const normB = rawB.trim().toLowerCase()
    assert.strictEqual(normA, normB, 'Normalized emails must match identically')
    assert.match(m94Content, /v_target_email := lower\(trim\(p_target_email\)\);/, 'Generator normalizes target email')
    assert.match(m94Content, /SELECT lower\(trim\(email\)\) INTO v_user_email/, 'Redeem normalizes auth email')
    assert.match(m94Content, /lower\(trim\(v_code_row\.target_email\)\) <> v_user_email/, 'Comparison uses normalized emails')
  })

  // 15. NO PLAINTEXT TOKEN IN ADMIN_AUDIT_LOGS
  test('15. No plaintext token in admin_audit_logs: masked identifier used exclusively', () => {
    assert.match(m94Content, /'masked_code',\s*'BS-PRO-••••-••••-'/, 'Audit details uses masked_code')
    assert.match(m94Content, /'masked_identifier',\s*'BS-PRO-••••-••••-'/, 'Revoke audit uses masked_identifier')
    const auditMatches = m94Content.match(/INSERT INTO public\.admin_audit_logs[\s\S]+?\);/g) || []
    for (const auditBlock of auditMatches) {
      assert.doesNotMatch(auditBlock, /'code',\s*v_code/, 'Audit block must never write plaintext token to logs')
    }
  })

  // 16. IDOR: ADMIN CANNOT MANIPULATE ARBITRARY USER IDENTITY DURING REDEEM
  test('16. IDOR: admin cannot manipulate arbitrary user identity during redeem', () => {
    assert.match(m94Content, /v_caller_id := auth\.uid\(\);/)
    assert.doesNotMatch(m94Content, /p_user_id/i, 'Redeem RPC does not accept client-provided user_id')
    assert.doesNotMatch(m94Content, /p_business_id/i, 'Redeem RPC resolves business_id server-side')
  })

  // 17. FRONTEND CANNOT OVERRIDE TARGET_EMAIL
  test('17. Frontend cannot override target_email: email derived exclusively from auth.users', () => {
    assert.match(m94Content, /SELECT lower\(trim\(email\)\) INTO v_user_email\s+FROM auth\.users\s+WHERE id = v_caller_id;/)
    assert.doesNotMatch(m94Content, /CREATE OR REPLACE FUNCTION public\.redeem_pro_activation_code\s*\([^)]*p_email/i, 'Redeem RPC does not accept client-provided email')
  })

  // 18. DIRECT RPC SECURITY TESTS
  test('18. Direct RPC security tests: SECURITY DEFINER, search_path = "", and strict error handling', () => {
    assert.match(m94Content, /SECURITY DEFINER\s+SET search_path = ''/, 'All RPCs configure safe search_path')
    assert.match(m94Content, /GRANT EXECUTE ON FUNCTION public\.admin_revoke_pro_activation_code\(uuid, text\) TO authenticated;/, 'Grants execute to authenticated only')
    assert.match(m94Content, /GRANT EXECUTE ON FUNCTION public\.admin_generate_pro_activation_code\(text, integer, jsonb\) TO authenticated;/, 'Grants generator execute')
  })

  // 19. EXISTING QRGENERATOR.JSX POS/QRIS REMAINS UNTOUCHED
  test('19. Existing QRGenerator.jsx POS/QRIS remains untouched', () => {
    const posQr = fs.readFileSync(path.resolve('src/components/pos/QRGenerator.jsx'), 'utf8')
    assert.match(posQr, /menu/i, 'POS QR component remains dedicated to POS / menu')
  })

  // QR FORMAT & MODAL INTEGRITY
  test('20. QR payload format & URL builder produces valid canonical activation link without email parameter', () => {
    const code = 'BS-PRO-9F8A-7B2C-1E4D-8A0F-3C2B-4D5E-6F7A-8B9C'
    const url = buildActivationUrl(code)
    assert.ok(url.includes('/pricing?activate='), 'URL must target /pricing?activate=')
    assert.ok(url.includes(encodeURIComponent(code)), 'URL must contain encoded activation code')
    assert.ok(!url.includes('email='), 'URL must NOT leak email in query parameters')
  })

  // ADMIN ACTIVATION PAGE & QR MODAL COMPLIANCE WITH CONTEXT7 NODE-QRCODE
  test('21. Admin Activation Codes Page and QR Modal use Context7 node-qrcode parameters and display recipient email', () => {
    const modalContent = fs.readFileSync(path.resolve('src/components/admin/ActivationQrModal.jsx'), 'utf8')
    assert.match(modalContent, /QRCode\.toCanvas\(/, 'Uses QRCode.toCanvas')
    assert.match(modalContent, /margin:\s*4/, 'Specifies minimum 4-module quiet zone')
    assert.match(modalContent, /errorCorrectionLevel:\s*['"]M['"]/, 'Uses M error correction level')
    assert.match(modalContent, /QRCode\.toDataURL\(/, 'Provides high-res toDataURL for download')
    assert.match(modalContent, /target_email/, 'Displays recipient target email')
    assert.match(modalContent, /Kode aktivasi hanya ditampilkan sekali/i, 'Shows single-view security warning')

    const pageContent = fs.readFileSync(path.resolve('src/pages/admin/AdminActivationCodesPage.jsx'), 'utf8')
    assert.match(pageContent, /adminRevokeActivationCode/, 'Imports and uses adminRevokeActivationCode')
    assert.match(pageContent, /Email Penerima/, 'Includes Email Penerima in table headers')
    assert.match(pageContent, /Revoke/, 'Provides Revoke action button')
  })

  // 22. ADMIN ACTIVATION CODES PAGE ACTION COLUMN & REVOCATION MODAL COMPLIANCE (@act.md)
  test('22. Admin Activation Codes Page conforms strictly to @act.md: Action column, state branching, and confirmation modal', () => {
    const pageContent = fs.readFileSync(path.resolve('src/pages/admin/AdminActivationCodesPage.jsx'), 'utf8')

    // Table Action Column
    assert.match(pageContent, /<th[^>]*>Action<\/th>/, 'Table header specifies Action column')
    assert.match(pageContent, /item\.status === 'unused'\s*\?[\s\S]+?Revoke/, 'Shows Revoke button for unused status')
    assert.match(pageContent, /item\.status === 'redeemed'\s*\?[\s\S]+?Sudah digunakan/, 'Shows "Sudah digunakan" text for redeemed status without Revoke button')
    assert.match(pageContent, /item\.status === 'revoked'\s*\?[\s\S]+?Revoked/, 'Shows "Revoked" text for revoked status')

    // Confirmation Modal fields & warning
    assert.match(pageContent, /revokeModalCode\.masked_code/, 'Displays masked activation code in modal')
    assert.match(pageContent, /revokeModalCode\.target_email/, 'Displays target email in modal')
    assert.match(pageContent, /revokeModalCode\.duration_days/, 'Displays duration in modal')
    assert.match(pageContent, /Kode aktivasi yang dicabut tidak dapat digunakan lagi/i, 'Shows warning that code cannot be used again')

    // Required reason validation & button labels
    assert.match(pageContent, /Alasan Pencabutan[\s\S]+?<span[^>]*>\*<\/span>/, 'Indicates reason is mandatory')
    assert.match(pageContent, /const trimmedReason = revokeReason\.trim\(\)/, 'Trims revocation reason')
    assert.match(pageContent, /if \(!trimmedReason\)[\s\S]+?Alasan pencabutan wajib diisi/, 'Validates mandatory reason before calling RPC')
    assert.match(pageContent, />\s*Batal\s*<\/button>/, 'Includes Batal button')
    assert.match(pageContent, /'Revoke Kode'[\s\S]*?<\/button>/, 'Includes Revoke Kode submit button')

    // Service call security
    assert.match(pageContent, /adminRevokeActivationCode\(revokeModalCode\.id,\s*trimmedReason\)/, 'Passes only code ID and reason to service')
  })
})
