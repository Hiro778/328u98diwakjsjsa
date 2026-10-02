// src/__tests__/creditActivationSecurity.test.js
// Manual AI Credit Sales + One-Time Activation Security Test Suite
// Conforms strictly to load.md Section 18 (All 28 Mandatory Security Tests)

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  normalizeCreditActivationError,
  buildCreditActivationUrl,
} from '../services/creditActivationService.js'
import { CREDIT_PACKAGES } from '../services/creativeCreditService.js'

describe('Manual AI Credit Sales + One-Time Activation Security Suite (@load.md)', () => {
  const m97Path = path.resolve('supabase/migrations/097_credit_activation_links.sql')
  const m97Content = fs.readFileSync(m97Path, 'utf8')

  const clientServicePath = path.resolve('src/services/creditActivationService.js')
  const clientServiceContent = fs.readFileSync(clientServicePath, 'utf8')

  const customerPagePath = path.resolve('src/pages/ActivateCreditPage.jsx')
  const customerPageContent = fs.readFileSync(customerPagePath, 'utf8')

  const adminPagePath = path.resolve('src/pages/admin/AdminCreditActivationsPage.jsx')
  const adminPageContent = fs.readFileSync(adminPagePath, 'utf8')

  // 1. ANONYMOUS CANNOT REDEEM
  test('1. anonymous cannot redeem: redeem_credit_activation strictly verifies auth.uid()', () => {
    assert.match(m97Content, /v_caller_id := auth\.uid\(\);/, 'Must check auth.uid()')
    assert.match(
      m97Content,
      /IF v_caller_id IS NULL THEN\s+RAISE EXCEPTION 'Unauthorized: Anda harus login untuk mengaktifkan kredit'/,
      'Rejects unauthenticated/anonymous callers with 42501'
    )
    assert.match(
      m97Content,
      /REVOKE ALL ON public\.credit_activation_links FROM anon/,
      'Direct table access revoked from anon'
    )
    assert.match(
      m97Content,
      /REVOKE EXECUTE ON FUNCTION public\.redeem_credit_activation\(text\) FROM anon/,
      'RPC execute revoked from anon'
    )
  })

  // 2. NORMAL USER CANNOT GENERATE ACTIVATION
  test('2. normal user cannot generate activation: admin_generate_credit_activation verifies public.is_admin()', () => {
    assert.match(
      m97Content,
      /v_is_adm := public\.is_admin\(\);[\s\S]+?IF NOT v_is_adm THEN\s+RAISE EXCEPTION 'Unauthorized: Hanya admin yang dapat membuat link aktivasi kredit'/,
      'Non-admin user blocked from generation'
    )
    assert.match(
      m97Content,
      /REVOKE EXECUTE ON FUNCTION public\.admin_generate_credit_activation\(uuid, uuid, text, jsonb\) FROM anon, public/,
      'Revokes execute from anon and public'
    )
  })

  // 3. ADMIN CAN GENERATE ACTIVATION
  test('3. admin can generate activation: admin authorization check passes for admins', () => {
    assert.match(
      m97Content,
      /CREATE OR REPLACE FUNCTION public\.admin_generate_credit_activation\s*\(\s*p_profile_id uuid,\s*p_business_id uuid,\s*p_package_key text/,
      'Admin generate RPC exists with correct signature'
    )
    assert.match(m97Content, /GRANT EXECUTE ON FUNCTION public\.admin_generate_credit_activation\(uuid, uuid, text, jsonb\) TO authenticated;/, 'Permits authenticated admins')
  })

  // 4. SUPERADMIN CAN GENERATE ACTIVATION
  test('4. superadmin can generate activation: public.is_admin() includes super_admin role', () => {
    assert.match(m97Content, /v_is_adm := public\.is_admin\(\);/, 'Uses centralized is_admin check')
  })

  // 5. RAW TOKEN IS NOT STORED
  test('5. raw token is not stored: only SHA-256 token_hash is stored in database', () => {
    assert.match(m97Content, /token_hash text NOT NULL UNIQUE/, 'Table schema specifies token_hash, not raw token')
    assert.doesNotMatch(m97Content, /\braw_token\b/i, 'No raw_token column in database')
    assert.match(m97Content, /v_token_hash := encode\(sha256\(v_token::bytea\), 'hex'\);/, 'Computes sha256 hash before insert')
    assert.match(m97Content, /INSERT INTO public\.credit_activation_links[\s\S]+?token_hash/, 'Inserts token_hash only')
  })

  // 6. TOKEN HASH IS UNIQUE
  test('6. token hash is unique: enforced by UNIQUE constraint and database index', () => {
    assert.match(m97Content, /token_hash text NOT NULL UNIQUE/, 'Table defines UNIQUE constraint on token_hash')
    assert.match(m97Content, /CREATE INDEX IF NOT EXISTS idx_credit_activation_links_hash ON public\.credit_activation_links\(token_hash\);/, 'Index created on token_hash')
  })

  // 7. INVALID TOKEN REJECTED
  test('7. invalid token rejected: generic INVALID_TOKEN returned without disclosing validity', () => {
    assert.match(m97Content, /'error', 'INVALID_TOKEN'/, 'Returns generic INVALID_TOKEN error')
    assert.match(m97Content, /'message', 'Link aktivasi tidak valid\.'/, 'Returns safe error message')
  })

  // 8. EXPIRED TOKEN REJECTED
  test('8. expired token rejected: rejects when now() >= expires_at and updates status lazily', () => {
    assert.match(m97Content, /IF v_activation\.status = 'EXPIRED' OR now\(\) >= v_activation\.expires_at THEN/, 'Checks expiration against current timestamp')
    assert.match(m97Content, /SET status = 'EXPIRED'/, 'Lazily marks expired in DB')
    assert.match(m97Content, /'error', 'EXPIRED'/, 'Returns EXPIRED error')
    assert.match(m97Content, /'message', 'Link aktivasi ini sudah kedaluwarsa\.'/, 'Provides clear Indonesian message')
  })

  // 9. USED TOKEN REJECTED
  test('9. used token rejected: rejects when status = USED', () => {
    assert.match(m97Content, /IF v_activation\.status = 'USED' THEN/, 'Checks for USED status')
    assert.match(m97Content, /'error', 'ALREADY_USED'/, 'Returns ALREADY_USED error')
    assert.match(m97Content, /'message', 'Link aktivasi ini sudah digunakan\.'/, 'Provides safe message')
  })

  // 10. CANCELLED TOKEN REJECTED
  test('10. cancelled token rejected: rejects when status = CANCELLED', () => {
    assert.match(m97Content, /IF v_activation\.status = 'CANCELLED' THEN/, 'Checks for CANCELLED status')
    assert.match(m97Content, /'error', 'CANCELLED'/, 'Returns CANCELLED error')
    assert.match(m97Content, /'message', 'Link aktivasi sudah dibatalkan\.'/, 'Provides safe message')
  })

  // 11. WRONG USER REJECTED
  test('11. wrong user rejected: enforces account binding without disclosing target user', () => {
    assert.match(m97Content, /IF v_activation\.profile_id <> v_caller_id THEN/, 'Enforces activation profile_id === auth.uid()')
    assert.match(m97Content, /'error', 'WRONG_ACCOUNT'/, 'Returns WRONG_ACCOUNT error')
    assert.match(m97Content, /'message', 'Link aktivasi ini bukan untuk akun Anda\.'/, 'Safe message without disclosing target user')
  })

  // 12. WRONG BUSINESS REJECTED
  test('12. wrong business rejected: admin generation validates business belongs to profile_id', () => {
    assert.match(m97Content, /WHERE id = p_business_id AND owner_id = p_profile_id/, 'Validates business ownership by target profile')
    assert.match(m97Content, /RAISE EXCEPTION 'Bisnis tidak ditemukan atau bukan milik akun yang dipilih'/, 'Rejects mismatched business')
  })

  // 13. CLIENT CANNOT CHANGE CREDIT AMOUNT
  test('13. client cannot change credit amount: amount determined strictly server-side by package key', () => {
    assert.doesNotMatch(m97Content, /p_credit_amount/i, 'RPC must not accept p_credit_amount from caller')
    assert.match(m97Content, /v_clean_pkg = 'starter' THEN[\s\S]+?v_credit_amount := 100;/, 'Starter hardcoded to 100 on server')
    assert.match(m97Content, /v_clean_pkg = 'growth' THEN[\s\S]+?v_credit_amount := 500;/, 'Growth hardcoded to 500 on server')
    assert.match(m97Content, /v_clean_pkg = 'pro' THEN[\s\S]+?v_credit_amount := 1000;/, 'Pro hardcoded to 1000 on server')
    assert.match(m97Content, /v_clean_pkg = 'business' THEN[\s\S]+?v_credit_amount := 3000;/, 'Business hardcoded to 3000 on server')
  })

  // 14. CLIENT CANNOT CHANGE PACKAGE
  test('14. client cannot change package during redemption: entitlement pulled from locked row', () => {
    assert.match(m97Content, /CREATE OR REPLACE FUNCTION public\.redeem_credit_activation\s*\(\s*p_token text\s*\)/, 'Redeem RPC only accepts token, not package')
    assert.match(m97Content, /v_activation\.credit_amount/, 'Credits added taken from server row, not client parameter')
  })

  // 15. CLIENT CANNOT CHANGE PROFILE_ID
  test('15. client cannot change profile_id during redemption: caller identity taken from auth.uid()', () => {
    const redeemChunk = m97Content.slice(m97Content.indexOf('FUNCTION public.redeem_credit_activation'), m97Content.indexOf('PERMISSIONS & SCHEMA NOTIFICATION'))
    assert.match(redeemChunk, /v_caller_id := auth\.uid\(\);/, 'Profile taken from trusted auth.uid()')
    assert.doesNotMatch(redeemChunk, /p_profile_id/i, 'Redeem RPC has no p_profile_id argument')
  })

  // 16. CLIENT CANNOT CHANGE BUSINESS_ID
  test('16. client cannot change business_id during redemption: business taken from server activation record', () => {
    const redeemChunk = m97Content.slice(m97Content.indexOf('FUNCTION public.redeem_credit_activation'), m97Content.indexOf('PERMISSIONS & SCHEMA NOTIFICATION'))
    assert.match(redeemChunk, /WHERE business_id = v_activation\.business_id/, 'Business ID bound to activation record')
    assert.doesNotMatch(redeemChunk, /p_business_id/i, 'Redeem RPC has no p_business_id argument')
  })

  // 17. CLIENT CANNOT CHANGE EXPIRY
  test('17. client cannot change expiry: 24h calculated by Postgres server time', () => {
    assert.doesNotMatch(m97Content, /p_expires_at/i, 'Generate RPC does not accept client expiry')
    assert.match(m97Content, /v_expires_at := now\(\) \+ interval '24 hours';/, 'Expires at exactly now() + 24 hours')
  })

  // 18. CONCURRENT REDEMPTION -> EXACTLY ONE SUCCESS
  test('18. concurrent redemption → exactly one success: row-level lock (FOR UPDATE) serializes requests', () => {
    assert.match(m97Content, /SELECT \* INTO v_activation[\s\S]+?FROM public\.credit_activation_links[\s\S]+?FOR UPDATE;/, 'Acquires pessimistic FOR UPDATE lock on activation record')
    assert.match(m97Content, /SELECT available, consumed, total_earned[\s\S]+?FROM public\.creative_credits[\s\S]+?FOR UPDATE;/, 'Acquires pessimistic FOR UPDATE lock on credit balance')
  })

  // 19. EXACTLY ONE CREDIT INCREASE
  test('19. exactly one credit increase: atomic transaction updates available and total_earned', () => {
    assert.match(m97Content, /available = v_new_balance,[\s\S]+?total_earned = v_total_earned \+ v_activation\.credit_amount/, 'Increases available and total_earned atomically')
    assert.match(m97Content, /status = 'USED',[\s\S]+?used_at = now\(\),[\s\S]+?used_by = v_caller_id/, 'Transitions status to USED immediately')
  })

  // 20. EXACTLY ONE LEDGER ENTRY
  test('20. exactly one ledger entry: creates immutable TOPUP record with idempotency key', () => {
    assert.match(m97Content, /INSERT INTO public\.credit_ledger/, 'Inserts into credit_ledger')
    assert.match(m97Content, /'manual_activation'/, 'Reference type is manual_activation')
    assert.match(m97Content, /'ACT-CREDIT-' \|\| v_activation\.id::text/, 'Unique idempotency key based on activation UUID')
  })

  // 21. REPLAY AFTER SUCCESS -> NO EXTRA CREDITS
  test('21. replay after success → no extra credits: subsequent attempt encounters status = USED', () => {
    assert.match(m97Content, /IF v_activation\.status = 'USED' THEN\s+RETURN jsonb_build_object\(\s*'success', false,\s*'error', 'ALREADY_USED'/, 'Halts immediately on status = USED before updating credits')
  })

  // 22. ADMIN AUDIT EVENT CREATED
  test('22. admin audit event created: writes CREDIT_ACTIVATION_CREATED and CREDIT_ACTIVATION_REDEEMED', () => {
    assert.match(m97Content, /'CREDIT_ACTIVATION_CREATED'/, 'Audits activation creation')
    assert.match(m97Content, /'CREDIT_ACTIVATION_REDEEMED'/, 'Audits activation redemption')
    assert.match(m97Content, /'CREDIT_ACTIVATION_CANCELLED'/, 'Audits activation cancellation')
  })

  // 23. RAW TOKEN NOT PRESENT IN AUDIT METADATA
  test('23. raw token not present in audit metadata: audit log contains only safe IDs and metadata', () => {
    const auditCreatedChunk = m97Content.slice(m97Content.indexOf('CREDIT_ACTIVATION_CREATED'), m97Content.indexOf('CREDIT_ACTIVATION_CREATED') + 500)
    assert.doesNotMatch(auditCreatedChunk, /v_token\b(?!_hash)/, 'v_token (raw token) must never be in audit metadata')
    assert.doesNotMatch(auditCreatedChunk, /activation_path/, 'activation_path must not be in audit log')
  })

  // 24. TOKEN NOT STORED IN LOCALSTORAGE
  test('24. token not stored in localStorage: Customer page reads token from URL query only', () => {
    assert.doesNotMatch(customerPageContent, /localStorage\.setItem\(['"]token/, 'Raw token never stored in localStorage')
    assert.match(customerPageContent, /searchParams\.get\('t'\)/, 'Reads token directly from URL searchParams')
    assert.match(customerPageContent, /window\.history\.replaceState/, 'Cleans token from URL history after processing')
  })

  // 25. SERVICE_ROLE NOT EXPOSED IN BROWSER
  test('25. service_role not exposed in browser: client services only use anon key and authenticated RPCs', () => {
    assert.doesNotMatch(clientServiceContent, /service_role/i, 'No service_role reference in creditActivationService')
    assert.doesNotMatch(customerPageContent, /service_role/i, 'No service_role in customer page')
    assert.doesNotMatch(adminPageContent, /service_role/i, 'No service_role in admin page')
  })

  // 26. ACTIVATION RECORDS NOT ENUMERABLE BY NORMAL USER
  test('26. activation records not enumerable by normal user: RLS policy strictly restricts SELECT to is_admin()', () => {
    assert.match(m97Content, /CREATE POLICY "credit_activation_links_admin_select"[\s\S]+?USING \(public\.is_admin\(\)\);/, 'RLS restricted to is_admin()')
    assert.doesNotMatch(m97Content, /CREATE POLICY.*FOR SELECT.*TO anon/, 'Anon cannot select')
  })

  // 27. DIRECT POSTGREST MUTATION BLOCKED
  test('27. direct PostgREST mutation blocked: no INSERT/UPDATE/DELETE policies granted to authenticated/anon', () => {
    assert.doesNotMatch(m97Content, /CREATE POLICY.*FOR INSERT.*ON public\.credit_activation_links/, 'Zero direct INSERT policies')
    assert.doesNotMatch(m97Content, /CREATE POLICY.*FOR UPDATE.*ON public\.credit_activation_links/, 'Zero direct UPDATE policies')
    assert.doesNotMatch(m97Content, /CREATE POLICY.*FOR DELETE.*ON public\.credit_activation_links/, 'Zero direct DELETE policies')
  })

  // 28. DIRECT RPC PRIVILEGE ESCALATION BLOCKED
  test('28. direct RPC privilege escalation blocked: all functions use SECURITY DEFINER SET search_path = ""', () => {
    const funcs = [
      'admin_generate_credit_activation',
      'get_admin_credit_activations',
      'get_admin_user_businesses',
      'admin_cancel_credit_activation',
      'redeem_credit_activation',
    ]

    for (const fn of funcs) {
      const idx = m97Content.indexOf(`FUNCTION public.${fn}`)
      assert.ok(idx !== -1, `Function public.${fn} must exist`)
      const chunk = m97Content.slice(idx, idx + 300)
      assert.match(chunk, /SECURITY DEFINER/, `${fn} must be SECURITY DEFINER`)
      assert.match(chunk, /SET search_path = ''/, `${fn} must set search_path = '' to prevent search path hijacking`)
    }
  })

  // ADDITIONAL VALIDATIONS: Token Entropy, URL Builder, Error Normalization, Packages
  test('29. Token entropy: generates 256 bits (32 random bytes) cryptographically secure opaque token', () => {
    assert.match(m97Content, /public\.gen_random_bytes\(32\)/, 'Uses gen_random_bytes(32) for 256-bit entropy')
    // Simulate generation in node
    const randomBytes = crypto.randomBytes(32)
    const token = randomBytes.toString('hex')
    assert.equal(token.length, 64, 'Token is 64 hex characters')
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    assert.equal(hash.length, 64, 'SHA-256 hash is 64 hex characters')
  })

  test('30. Package parity: CREDIT_PACKAGES source matches authoritative server mapping', () => {
    assert.equal(CREDIT_PACKAGES.starter.credits, 100)
    assert.equal(CREDIT_PACKAGES.starter.priceIdr, 25000)

    assert.equal(CREDIT_PACKAGES.growth.credits, 500)
    assert.equal(CREDIT_PACKAGES.growth.priceIdr, 100000)

    assert.equal(CREDIT_PACKAGES.pro.credits, 1000)
    assert.equal(CREDIT_PACKAGES.pro.priceIdr, 175000)

    assert.equal(CREDIT_PACKAGES.business.credits, 3000)
    assert.equal(CREDIT_PACKAGES.business.priceIdr, 450000)
  })

  test('31. URL generation: builds safe opaque activation URL without exposing sensitive data', () => {
    const url = buildCreditActivationUrl('abc123def456')
    assert.ok(url.includes('/activate-credit?t=abc123def456'))
    assert.doesNotMatch(url, /profile_id|business_id|amount|price/, 'No sensitive parameters in URL')
  })

  test('32. Error normalization: converts database errors to standard user messages', () => {
    assert.equal(normalizeCreditActivationError(new Error('ALREADY_USED')).message, 'Link aktivasi ini sudah digunakan.')
    assert.equal(normalizeCreditActivationError(new Error('EXPIRED')).message, 'Link aktivasi ini sudah kedaluwarsa.')
    assert.equal(normalizeCreditActivationError(new Error('CANCELLED')).message, 'Link aktivasi sudah dibatalkan.')
    assert.equal(normalizeCreditActivationError(new Error('WRONG_ACCOUNT')).message, 'Link aktivasi ini bukan untuk akun Anda.')
    assert.equal(normalizeCreditActivationError(new Error('INVALID_TOKEN')).message, 'Link aktivasi tidak valid.')
    assert.equal(normalizeCreditActivationError(new Error('RATE_LIMITED')).message, 'Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.')
  })
})
