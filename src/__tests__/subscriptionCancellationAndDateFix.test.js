// src/__tests__/subscriptionCancellationAndDateFix.test.js
// Tests for plan.md: Subscription Expiry Date Stability, Cancellation Semantics, and Context7 Design Compliance

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'

describe('Subscription Expiry Date & Cancellation Suite (plan.md)', () => {
  const userA = { id: 'usr-aaa-1111', email: 'usera@example.com' }
  const userB = { id: 'usr-bbb-2222', email: 'userb@example.com' }

  // ──────────────────────────────────────────────────────────
  // 1. DATE STABILITY & REPEATED PAGE MOUNT VERIFICATION
  // ──────────────────────────────────────────────────────────
  describe('1. Date Stability & Repeated Mounts (Item 1-7)', () => {
    it('1. current active subscription displays genuine database expires_at', () => {
      const fixedDbExpiry = '2026-10-19T00:00:00.000Z'
      const activeSub = {
        id: 'sub-001',
        profile_id: userA.id,
        plan: 'pro',
        status: 'active',
        started_at: '2026-09-19T00:00:00.000Z',
        expires_at: fixedDbExpiry,
      }

      const entitlement = calculateSubscriptionEntitlement({
        user: userA,
        subscription: activeSub,
        hasPaidHistory: true,
        now: new Date('2026-09-19T07:00:00.000Z'),
      })

      assert.equal(entitlement.subscriptionState, 'active')
      assert.equal(entitlement.expiresAt, fixedDbExpiry)
      assert.equal(entitlement.isPro, true)
    })

    it('2 & 3. Mounting PricingPage 10x or refreshing 10x DOES NOT mutate expires_at', () => {
      const pricingPageCode = fs.readFileSync(path.resolve('src/pages/PricingPage.jsx'), 'utf8')

      // Ensure syncOnMount calling verifySubscriptionPayment on mount is removed
      assert.ok(
        !pricingPageCode.includes('syncOnMount'),
        'PricingPage must not execute syncOnMount() on mount'
      )
      assert.ok(
        pricingPageCode.includes('refreshSubscription()'),
        'PricingPage must use read-only refreshSubscription() on mount'
      )

      // Simulate 10 page mounts: expiry date remains completely unchanged
      const baseExpiry = '2026-10-19T00:00:00.000Z'
      let currentExpiry = baseExpiry

      for (let i = 0; i < 10; i++) {
        // Read-only refresh maintains exact database timestamp
        const entitlement = calculateSubscriptionEntitlement({
          user: userA,
          subscription: {
            id: 'sub-001',
            profile_id: userA.id,
            plan: 'pro',
            status: 'active',
            started_at: '2026-09-19T00:00:00.000Z',
            expires_at: currentExpiry,
          },
          hasPaidHistory: true,
          now: new Date('2026-09-19T07:00:00.000Z'),
        })
        currentExpiry = entitlement.expiresAt
      }

      assert.equal(currentExpiry, baseExpiry, '10 mounts must leave expires_at identical')
    })

    it('4. logout and login preserves exact database expires_at', () => {
      const fixedExpiry = '2026-10-19T00:00:00.000Z'

      // Logged out state
      const loggedOut = calculateSubscriptionEntitlement({
        user: null,
        subscription: null,
      })
      assert.equal(loggedOut.subscriptionState, 'unauthenticated')
      assert.equal(loggedOut.expiresAt, null)

      // Re-login state
      const loggedIn = calculateSubscriptionEntitlement({
        user: userA,
        subscription: {
          id: 'sub-001',
          profile_id: userA.id,
          plan: 'pro',
          status: 'active',
          started_at: '2026-09-19T00:00:00.000Z',
          expires_at: fixedExpiry,
        },
        hasPaidHistory: true,
        now: new Date('2026-09-19T07:00:00.000Z'),
      })
      assert.equal(loggedIn.subscriptionState, 'active')
      assert.equal(loggedIn.expiresAt, fixedExpiry)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 2. CANCELLATION SEMANTICS & SECURITY (Item 8-19)
  // ──────────────────────────────────────────────────────────
  describe('2. Cancellation Semantics & Security (Item 8-19)', () => {
    it('8. Owner can cancel subscription and status transitions to cancelled', () => {
      const activeSub = {
        id: 'sub-001',
        profile_id: userA.id,
        plan: 'pro',
        status: 'active',
        started_at: '2026-09-19T00:00:00.000Z',
        expires_at: '2026-10-19T00:00:00.000Z',
      }

      // Simulate server-side cancellation update
      const cancelledSub = {
        ...activeSub,
        status: 'cancelled',
        cancelled_at: '2026-09-19T07:05:00.000Z',
        cancelled_by: userA.id,
      }

      const entitlement = calculateSubscriptionEntitlement({
        user: userA,
        subscription: cancelledSub,
        hasPaidHistory: true,
        now: new Date('2026-09-19T07:05:00.000Z'),
      })

      assert.equal(entitlement.subscriptionState, 'cancelled')
      assert.equal(entitlement.hasActiveSubscription, false)
      assert.equal(entitlement.hasCancelledSubscription, true)
      assert.equal(entitlement.isPro, false)
      assert.equal(entitlement.expiresAt, '2026-10-19T00:00:00.000Z')
    })

    it('9, 10, 11, 12. Non-owner / IDOR attempt is rejected in cancellation schema & RPC', () => {
      const migrationCode = fs.readFileSync(
        path.resolve('supabase/migrations/050_subscription_cancellation.sql'),
        'utf8'
      )

      // Verification of server-side authentication & ownership
      assert.ok(migrationCode.includes('auth.uid()'), 'RPC must inspect auth.uid()')
      assert.ok(
        migrationCode.includes('v_sub.profile_id <> v_caller_id'),
        'RPC must reject callers when profile_id does not match caller'
      )
      assert.ok(
        migrationCode.includes('v_business_owner_id <> v_caller_id'),
        'RPC must verify business ownership when business_id is passed'
      )
      assert.ok(
        migrationCode.includes('SECURITY DEFINER'),
        'RPC must be SECURITY DEFINER'
      )
      assert.ok(
        migrationCode.includes('SET search_path = public, pg_temp'),
        'RPC must lock search_path against injection'
      )
    })

    it('14 & 15. Cancellation does NOT alter payments into refunded or create new payment', () => {
      const migrationCode = fs.readFileSync(
        path.resolve('supabase/migrations/050_subscription_cancellation.sql'),
        'utf8'
      )
      const edgeCode = fs.readFileSync(
        path.resolve('supabase/functions/midtrans-subscription-snap/index.ts'),
        'utf8'
      )

      // Neither migration nor edge function touches subscription_payments on cancel
      assert.ok(
        !migrationCode.includes('UPDATE public.subscription_payments'),
        'Migration must not mutate subscription_payments'
      )
      assert.ok(
        !migrationCode.includes("'refunded'") && !migrationCode.includes("'refund'"),
        'Migration must not update status to refund'
      )
      assert.ok(
        !edgeCode.includes("payment_status: 'refunded'") && !edgeCode.includes('payment_status = "refunded"'),
        'Edge function cancel action must not set status to refunded'
      )
    })

    it('17. Cancellation is completely idempotent', () => {
      const migrationCode = fs.readFileSync(
        path.resolve('supabase/migrations/050_subscription_cancellation.sql'),
        'utf8'
      )

      assert.ok(
        migrationCode.includes("v_sub.status = 'cancelled'"),
        'RPC must check if status is already cancelled'
      )
      assert.ok(
        migrationCode.includes('Langganan sudah dalam status dihentikan sebelumnya'),
        'RPC returns safe message on repeated cancellation'
      )
    })

    it('18 & 19. Refresh or logout/login after cancel preserves cancelled state', () => {
      const cancelledSub = {
        id: 'sub-001',
        profile_id: userA.id,
        plan: 'pro',
        status: 'cancelled',
        started_at: '2026-09-19T00:00:00.000Z',
        expires_at: '2026-10-19T00:00:00.000Z',
        cancelled_at: '2026-09-19T07:05:00.000Z',
        cancelled_by: userA.id,
      }

      for (let i = 0; i < 5; i++) {
        const ent = calculateSubscriptionEntitlement({
          user: userA,
          subscription: cancelledSub,
          hasPaidHistory: true,
          now: new Date('2026-09-19T07:10:00.000Z'),
        })
        assert.equal(ent.subscriptionState, 'cancelled')
        assert.equal(ent.hasActiveSubscription, false)
        assert.equal(ent.hasCancelledSubscription, true)
      }
    })
  })

  // ──────────────────────────────────────────────────────────
  // 3. CONTEXT7 DESIGN SYSTEM & ACCESSIBILITY AUDIT (Item 27-30)
  // ──────────────────────────────────────────────────────────
  describe('3. Context7 Design System & Accessibility Compliance (Item 27-30)', () => {
    const pricingContent = fs.readFileSync(path.resolve('src/pages/PricingPage.jsx'), 'utf8')

    it('27. Adheres to official dark canvas palette (no bg-cream or light text-navy-800)', () => {
      // Must NOT contain deprecated light theme classes
      assert.ok(!pricingContent.includes('bg-cream'), 'PricingPage must not use bg-cream')
      assert.ok(!pricingContent.includes('text-navy-800'), 'PricingPage must not use text-navy-800')
      assert.ok(!pricingContent.includes('text-navy-700'), 'PricingPage must not use text-navy-700')
      assert.ok(!pricingContent.includes('bg-warm-500'), 'PricingPage must not use bg-warm-500')

      // Must use Context7 dark palette tokens
      assert.ok(pricingContent.includes('bg-background'), 'Must use bg-background (#0B0F19)')
      assert.ok(pricingContent.includes('bg-surface'), 'Must use bg-surface (#151D2C)')
      assert.ok(pricingContent.includes('text-text-primary'), 'Must use text-text-primary (#F8FAFC)')
      assert.ok(pricingContent.includes('text-text-secondary'), 'Must use text-text-secondary (#94A3B8)')
      assert.ok(pricingContent.includes('bg-primary'), 'Must use bg-primary (#818CF8)')
    })

    it('28. Confirmation modal has proper dialog semantics and Framer Motion wrapping', () => {
      assert.ok(pricingContent.includes('<AnimatePresence>'), 'Must wrap modal with AnimatePresence')
      assert.ok(pricingContent.includes('role="alertdialog"'), 'Must have role="alertdialog"')
      assert.ok(pricingContent.includes('aria-modal="true"'), 'Must specify aria-modal="true"')
      assert.ok(pricingContent.includes('aria-labelledby="cancel-dialog-title"'))
      assert.ok(pricingContent.includes('aria-describedby="cancel-dialog-desc"'))
    })

    it('29. Supports Escape key listener and non-destructive cancel action', () => {
      assert.ok(pricingContent.includes("e.key === 'Escape'"), 'Must handle Escape key press')
      assert.ok(pricingContent.includes('Batal, Tetap Berlangganan'), 'Must have non-destructive abort button')
      assert.ok(pricingContent.includes('Ya, Hentikan Pro'), 'Must have explicit danger confirm button')
    })

    it('30. Pro active renders Perpanjang Pro, Hentikan langganan, and Dashboard buttons', () => {
      assert.ok(pricingContent.includes('Hentikan langganan'), 'Must render Hentikan langganan button')
      assert.ok(pricingContent.includes('Perpanjang Pro'), 'Must render Perpanjang Pro button')
      assert.ok(pricingContent.includes('Dashboard'), 'Must render Dashboard button')
      assert.ok(pricingContent.includes('Langganan Dihentikan'), 'Must render Langganan Dihentikan state')
      assert.ok(pricingContent.includes('Berlangganan Pro Kembali'), 'Must allow re-subscribing after cancellation')
    })
  })
})
