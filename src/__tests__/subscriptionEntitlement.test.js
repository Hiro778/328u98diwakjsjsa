// src/__tests__/subscriptionEntitlement.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'

describe('Subscription Entitlement State Machine (fic1.md specification)', () => {
  const mockUser = {
    id: 'user-uuid-1234',
    email: 'testuser@example.com',
  }

  // ──────────────────────────────────────────────────────────
  // TEST A: Akun baru + belum pernah bayar
  // Pricing harus FREE / "Mulai Pro", BUKAN "Pro Sudah Berakhir"
  // ──────────────────────────────────────────────────────────
  describe('TEST A: New user with no payment history', () => {
    it('returns free when user has no subscription row in database', () => {
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: null,
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
      assert.equal(result.isPro, false)
    })

    it('returns free when user has default free subscription row', () => {
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-1',
          profile_id: mockUser.id,
          plan: 'free',
          status: 'inactive',
          started_at: null,
          expires_at: null,
        },
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
      assert.equal(result.isPro, false)
    })

    it('returns free for legacy pending subscription row with null expires_at (the hazzeonnn bug)', () => {
      // User registered, opened checkout earlier, resulting in plan: 'pro', status: 'pending', expires_at: null
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-legacy',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'pending',
          started_at: null,
          expires_at: null,
        },
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
      assert.equal(result.isPro, false)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST B: Akun baru klik Berlangganan
  // Subscription draft created on checkout open, remains free
  // ──────────────────────────────────────────────────────────
  describe('TEST B: New user initiates checkout', () => {
    it('remains free when midtrans-subscription-snap creates draft subscription', () => {
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-checkout-draft',
          profile_id: mockUser.id,
          plan: 'free',
          status: 'inactive',
          started_at: null,
          expires_at: null,
        },
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST C: Payment Pending
  // Jangan menjadi ACTIVE, jangan menjadi EXPIRED
  // ──────────────────────────────────────────────────────────
  describe('TEST C: Payment is pending', () => {
    it('remains free when payment is pending and subscription is inactive', () => {
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-pending',
          profile_id: mockUser.id,
          plan: 'free',
          status: 'inactive',
          started_at: null,
          expires_at: null,
        },
        hasPaidHistory: false, // only pending payment in DB, hasPaidHistory filter is paid/settlement
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
    })

    it('does not treat pending payment as proof of prior Pro even if plan says pro', () => {
      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-pending-2',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'pending',
          started_at: null,
          expires_at: null,
        },
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'free')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST D: Payment Settlement
  // Subscription becomes ACTIVE
  // ──────────────────────────────────────────────────────────
  describe('TEST D: Payment settlement', () => {
    it('becomes active when payment settles and expires_at is in the future', () => {
      const now = new Date('2026-09-12T10:00:00Z')
      const futureExpiry = '2026-10-12T10:00:00.000Z'

      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-active',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'active',
          started_at: '2026-09-12T10:00:00.000Z',
          expires_at: futureExpiry,
        },
        hasPaidHistory: true,
        loading: false,
        now,
      })

      assert.equal(result.subscriptionState, 'active')
      assert.equal(result.hasActiveSubscription, true)
      assert.equal(result.hasExpiredSubscription, false)
      assert.equal(result.isPro, true)
      assert.equal(result.expiresAt, futureExpiry)
    })

    it('becomes active for manual admin grant with valid future expiry', () => {
      const now = new Date('2026-09-12T10:00:00Z')
      const futureExpiry = '2026-09-27T13:58:45.434Z'

      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-manual-grant',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'active',
          started_at: '2026-08-27T13:58:45.434Z',
          expires_at: futureExpiry,
        },
        hasPaidHistory: false, // manual grant has no row in subscription_payments
        loading: false,
        now,
      })

      assert.equal(result.subscriptionState, 'active')
      assert.equal(result.hasActiveSubscription, true)
      assert.equal(result.hasExpiredSubscription, false)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST E: expires_at lewat setelah pernah paid
  // Subscription becomes EXPIRED
  // ──────────────────────────────────────────────────────────
  describe('TEST E: Past expires_at after legitimate paid subscription', () => {
    it('becomes expired when user had paid payment and expires_at has passed', () => {
      const now = new Date('2026-10-15T12:00:00Z')
      const pastExpiry = '2026-10-12T10:00:00.000Z'

      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-expired',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'active', // status may not have been updated by a worker, still 'active' in DB
          started_at: '2026-09-12T10:00:00.000Z',
          expires_at: pastExpiry,
        },
        hasPaidHistory: true, // proved by subscription_payments settlement
        loading: false,
        now,
      })

      assert.equal(result.subscriptionState, 'expired')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, true)
      assert.equal(result.isPro, false)
      assert.equal(result.expiresAt, pastExpiry)
    })

    it('becomes expired when manually granted subscription has passed its expiry', () => {
      const now = new Date('2026-10-01T00:00:00Z')
      const pastExpiry = '2026-09-27T13:58:45.434Z'

      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-manual-expired',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'active',
          started_at: '2026-08-27T13:58:45.434Z',
          expires_at: pastExpiry,
        },
        hasPaidHistory: false,
        loading: false,
        now,
      })

      assert.equal(result.subscriptionState, 'expired')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, true)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST F: Expired user pays renewal
  // Subscription becomes ACTIVE again
  // ──────────────────────────────────────────────────────────
  describe('TEST F: Expired user renews subscription', () => {
    it('returns to active when renewal extends expires_at into the future', () => {
      const now = new Date('2026-10-15T14:00:00Z')
      const renewedExpiry = '2026-11-15T14:00:00.000Z'

      const result = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-renewed',
          profile_id: mockUser.id,
          plan: 'pro',
          status: 'active',
          started_at: '2026-10-15T14:00:00.000Z',
          expires_at: renewedExpiry,
        },
        hasPaidHistory: true,
        loading: false,
        now,
      })

      assert.equal(result.subscriptionState, 'active')
      assert.equal(result.hasActiveSubscription, true)
      assert.equal(result.hasExpiredSubscription, false)
      assert.equal(result.isPro, true)
    })
  })

  // ──────────────────────────────────────────────────────────
  // TEST G: Logout / Login
  // State is purely driven by database and authentication
  // ──────────────────────────────────────────────────────────
  describe('TEST G: Logout and Login lifecycle', () => {
    it('returns unauthenticated when user is null (logged out)', () => {
      const result = calculateSubscriptionEntitlement({
        user: null,
        subscription: null,
        hasPaidHistory: false,
        loading: false,
      })

      assert.equal(result.subscriptionState, 'unauthenticated')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
    })

    it('returns loading when loading is true', () => {
      const result = calculateSubscriptionEntitlement({
        user: null,
        subscription: null,
        hasPaidHistory: false,
        loading: true,
      })

      assert.equal(result.subscriptionState, 'loading')
      assert.equal(result.hasActiveSubscription, false)
      assert.equal(result.hasExpiredSubscription, false)
    })

    it('faithfully reconstructs state from database upon re-login', () => {
      const now = new Date('2026-09-12T10:00:00Z')
      // Login with active Pro
      const activeLogin = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-db',
          plan: 'pro',
          status: 'active',
          started_at: '2026-09-01T00:00:00Z',
          expires_at: '2026-10-01T00:00:00Z',
        },
        hasPaidHistory: true,
        loading: false,
        now,
      })
      assert.equal(activeLogin.subscriptionState, 'active')

      // Logout
      const loggedOut = calculateSubscriptionEntitlement({
        user: null,
        subscription: null,
        hasPaidHistory: false,
        loading: false,
      })
      assert.equal(loggedOut.subscriptionState, 'unauthenticated')

      // Re-login with same DB row
      const reLogin = calculateSubscriptionEntitlement({
        user: mockUser,
        subscription: {
          id: 'sub-db',
          plan: 'pro',
          status: 'active',
          started_at: '2026-09-01T00:00:00Z',
          expires_at: '2026-10-01T00:00:00Z',
        },
        hasPaidHistory: true,
        loading: false,
        now,
      })
      assert.equal(reLogin.subscriptionState, 'active')
    })
  })
})
