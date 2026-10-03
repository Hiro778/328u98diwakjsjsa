// src/__tests__/removeMidtransSubscriptionFlow.test.js
// Verification suite for removing Midtrans from customer subscription purchase flow (@mid.md)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'
import { PLANS, PLAN_CONFIG } from '../data/categories.js'

describe('Remove Midtrans from Subscription Purchase Flow (@mid.md)', () => {
  const pricingPagePath = path.resolve('src/pages/PricingPage.jsx')
  const pricingPageContent = fs.readFileSync(pricingPagePath, 'utf8')
  const subscriptionGatePath = path.resolve('src/components/SubscriptionGate.jsx')
  const subscriptionGateContent = fs.readFileSync(subscriptionGatePath, 'utf8')
  const m94Path = path.resolve('supabase/migrations/094_pro_activation_email_binding.sql')
  const m94Content = fs.readFileSync(m94Path, 'utf8')
  const m99Path = path.resolve('supabase/migrations/099_security_step2_subscription_credit_hardening.sql')
  const m99Content = fs.readFileSync(m99Path, 'utf8')

  // =========================================================================
  // SECTION A: CUSTOMER PRICING UI & PRO / BASIC CARDS
  // =========================================================================
  describe('A. Pricing Page UI & Copy', () => {
    it('1. Pro plan price is canonical Rp 130.000 / bulan', () => {
      assert.equal(PLAN_CONFIG[PLANS.PRO].price, 130000)
      assert.match(PLAN_CONFIG[PLANS.PRO].priceDetail, /130\.000/)
      assert.ok(pricingPageContent.includes('PLAN_CONFIG[PLANS.PRO].priceDetail'))
    })

    it('2. Basic plan price is canonical Rp 35.000 / bulan', () => {
      assert.equal(PLAN_CONFIG[PLANS.BASIC].price, 35000)
      assert.match(PLAN_CONFIG[PLANS.BASIC].priceDetail, /35\.000/)
      assert.ok(pricingPageContent.includes('PLAN_CONFIG[PLANS.BASIC].priceDetail'))
    })

    it('3. PricingPage does NOT display any customer-facing Midtrans messaging or buttons', () => {
      const lowerPricing = pricingPageContent.toLowerCase()
      assert.ok(!lowerPricing.includes('midtrans'), 'PricingPage.jsx must have zero occurrences of "midtrans"')
      assert.ok(!lowerPricing.includes('menghubungkan midtrans'), 'Must not contain "Menghubungkan Midtrans..."')
      assert.ok(!lowerPricing.includes('bayar via midtrans'), 'Must not contain "Bayar via Midtrans"')
      assert.ok(!lowerPricing.includes('snap checkout'), 'Must not contain "Snap checkout"')
    })

    it('4. Pro card clearly explains manual admin verification and activation code flow', () => {
      assert.ok(
        pricingPageContent.includes('Pembayaran diverifikasi manual oleh admin'),
        'Pro card must explain that payment is manually verified by admin'
      )
      assert.ok(
        pricingPageContent.includes('Kode aktivasi resmi diberikan setelah pembayaran diverifikasi'),
        'Pro card must explain official activation code flow'
      )
    })

    it('5. Pro card action button directs user to activation code input', () => {
      assert.ok(
        pricingPageContent.includes("pro-activation-input") &&
        pricingPageContent.includes("pro-activation-section"),
        'Pro CTA must link or scroll to activation code section'
      )
      assert.ok(
        pricingPageContent.includes('Masukkan Kode Aktivasi'),
        'Pro CTA button must have "Masukkan Kode Aktivasi" text'
      )
    })

    it('6. SubscriptionGate component does not mention Midtrans', () => {
      const lowerGate = subscriptionGateContent.toLowerCase()
      assert.ok(!lowerGate.includes('via midtrans'), 'SubscriptionGate must not say "via Midtrans"')
    })
  })

  // =========================================================================
  // SECTION B: MIDTRANS CALL ELIMINATION IN CLIENT
  // =========================================================================
  describe('B. Customer-Side Midtrans Elimination', () => {
    it('1. PricingPage does NOT import or call createSubscriptionSnap or openSnapPaymentModal', () => {
      assert.ok(!pricingPageContent.includes('createSubscriptionSnap'), 'PricingPage must not import createSubscriptionSnap')
      assert.ok(!pricingPageContent.includes('openSnapPaymentModal'), 'PricingPage must not import openSnapPaymentModal')
      assert.ok(!pricingPageContent.includes('handlePayOnline'), 'PricingPage must not define handlePayOnline')
    })

    it('2. PricingPage does NOT invoke midtrans-subscription-snap Edge Function', () => {
      assert.ok(!pricingPageContent.includes('midtrans-subscription-snap'), 'PricingPage must not call midtrans-subscription-snap')
    })

    it('3. No active customer checkout path invokes Midtrans', () => {
      assert.ok(!pricingPageContent.includes('window.snap'), 'No customer-side Snap invocation in PricingPage')
    })
  })

  // =========================================================================
  // SECTION C: SERVER-SIDE ACTIVATION SECURITY
  // =========================================================================
  describe('C. Server-Side Activation Code Security Enforcements', () => {
    it('1. redeem_pro_activation_code requires authenticated user and rejects anon', () => {
      assert.match(m94Content, /v_caller_id := auth\.uid\(\);/, 'Must resolve caller from auth.uid()')
      assert.match(m94Content, /IF v_caller_id IS NULL THEN/, 'Must reject unauthenticated calls')
      assert.match(m94Content, /RAISE EXCEPTION 'Unauthorized/, 'Raises 42501 Unauthorized')
    })

    it('2. redeem_pro_activation_code enforces row-level lock (FOR UPDATE) for atomic single use', () => {
      assert.match(
        m94Content,
        /SELECT \*[\s\S]+?FROM public\.pro_activation_codes[\s\S]+?FOR UPDATE;/,
        'Row lock FOR UPDATE prevents race conditions and concurrent double-redemption'
      )
    })

    it('3. redeem_pro_activation_code strictly validates status = unused and expiration', () => {
      assert.match(
        m94Content,
        /v_code_row\.status <> 'unused' OR \(v_code_row\.expires_at IS NOT NULL AND v_code_row\.expires_at < now\(\)\)/,
        'Rejects non-unused or expired activation codes'
      )
    })

    it('4. redeem_pro_activation_code enforces email binding server-side', () => {
      assert.match(
        m94Content,
        /IF v_code_row\.target_email IS NOT NULL AND lower\(trim\(v_code_row\.target_email\)\) <> v_user_email THEN/,
        'Strictly checks recipient email against auth.users email'
      )
    })

    it('5. Entitlement remains strictly server-side (user cannot self-grant Pro via client)', () => {
      const spoofed = calculateSubscriptionEntitlement({
        user: { id: 'spoof-user', email: 'spoof@attacker.com' },
        subscription: { id: 'fake-sub', plan: 'pro', status: 'fake', expires_at: null },
        hasPaidHistory: false,
        loading: false,
      })
      assert.equal(spoofed.isPro, false, 'Client-manipulated subscription cannot grant active Pro')
    })
  })
})
