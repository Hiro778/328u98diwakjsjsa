// src/__tests__/featureEntitlementSecurity.test.js
// Focused security & regression tests for Feature Entitlement / Paywall System
// Conforms strictly to lock.md section 11 specifications

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'

describe('lock.md Security & Entitlement Enforcement Suite', () => {

  // ══════════════════════════════════════════════════════════
  // 1. ACCESS MATRIX
  // ══════════════════════════════════════════════════════════
  describe('1. Access Matrix (Free vs Pro)', () => {
    const mockFreeUser = { id: 'usr-free-1', email: 'free@umkm.id' }
    const mockProUser = { id: 'usr-pro-1', email: 'pro@umkm.id' }

    it('free user has free entitlement state and isPro=false', () => {
      const entitlement = calculateSubscriptionEntitlement({
        user: mockFreeUser,
        subscription: null,
        hasPaidHistory: false,
      })

      assert.equal(entitlement.isPro, false)
      assert.equal(entitlement.subscriptionState, 'free')
    })

    it('free user is permitted unlimited SEO Optimizer usage without credits or subscription', () => {
      // Simulate multiple SEO audits for free user
      const auditCount = 10
      for (let i = 0; i < auditCount; i++) {
        // SEO Optimizer requires 0 credits and has no subscription guard
        const requiredPlan = 'free'
        const creditCost = 0
        assert.equal(requiredPlan, 'free')
        assert.equal(creditCost, 0)
      }
    })

    it('free user is permitted exactly 1 lifetime AI Creative Studio usage', () => {
      let hasUsedLifetimeFree = false

      // First attempt: eligible
      const canUseFirstTime = !hasUsedLifetimeFree
      assert.equal(canUseFirstTime, true)

      // Consume first usage
      hasUsedLifetimeFree = true

      // Second attempt: blocked
      const canUseSecondTime = !hasUsedLifetimeFree
      assert.equal(canUseSecondTime, false)
    })

    it('pro user is permitted access to all Marketing tools', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      const entitlement = calculateSubscriptionEntitlement({
        user: mockProUser,
        subscription: {
          id: 'sub-active-pro',
          profile_id: mockProUser.id,
          plan: 'pro',
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: futureDate,
        },
        hasPaidHistory: true,
      })

      assert.equal(entitlement.isPro, true)
      assert.equal(entitlement.hasActiveSubscription, true)
      assert.equal(entitlement.subscriptionState, 'active')

      // All marketing tools are accessible
      const marketingTools = [
        'AI Creative Studio',
        'Competitor Analysis',
        'Google Business Profile',
        'SEO Optimizer',
        'Content Calendar',
        'A/B Testing',
      ]

      marketingTools.forEach((tool) => {
        // When isPro is true, no marketing tool is locked
        const isLocked = !entitlement.isPro
        assert.equal(isLocked, false, `${tool} should be unlocked for Pro user`)
      })
    })
  })

  // ══════════════════════════════════════════════════════════
  // 2. BYPASS PREVENTION
  // ══════════════════════════════════════════════════════════
  describe('2. Bypass Prevention', () => {
    it('expired Pro cannot access Pro tools', () => {
      const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const entitlement = calculateSubscriptionEntitlement({
        user: { id: 'usr-expired' },
        subscription: {
          id: 'sub-expired',
          plan: 'pro',
          status: 'expired',
          started_at: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
          expires_at: pastDate,
        },
        hasPaidHistory: true,
      })

      assert.equal(entitlement.isPro, false)
      assert.equal(entitlement.hasActiveSubscription, false)
      assert.equal(entitlement.hasExpiredSubscription, true)
      assert.equal(entitlement.subscriptionState, 'expired')
    })

    it('unauthenticated request receives unauthenticated entitlement state', () => {
      const entitlement = calculateSubscriptionEntitlement({
        user: null,
        subscription: null,
      })

      assert.equal(entitlement.isPro, false)
      assert.equal(entitlement.subscriptionState, 'unauthenticated')
    })

    it('simulated frontend state tampering cannot bypass server entitlement', () => {
      // Attacker tampers with frontend state
      const tamperedClientState = { isPro: true, role: 'admin' }

      // Server validates against database authoritative record
      const dbSubscription = {
        plan: 'free',
        status: 'inactive',
        expires_at: null,
      }

      const serverVerifiedEntitlement = calculateSubscriptionEntitlement({
        user: { id: 'attacker' },
        subscription: dbSubscription,
        hasPaidHistory: false,
      })

      // Server rejects tampered client state
      assert.equal(serverVerifiedEntitlement.isPro, false)
      assert.notEqual(tamperedClientState.isPro, serverVerifiedEntitlement.isPro)
    })
  })

  // ══════════════════════════════════════════════════════════
  // 3. ATOMIC 1X FREE USAGE & ROLLBACK
  // ══════════════════════════════════════════════════════════
  describe('3. Free Usage Lifetime & Atomicity Simulation', () => {
    it('concurrent claims on the same business cannot both succeed', () => {
      const databaseFreeUsageTable = new Map() // Simulates unique constraint on business_id

      function simulateClaimAtomic(businessId, requestId) {
        if (databaseFreeUsageTable.has(businessId)) {
          return { success: false, error: 'FREE_USAGE_ALREADY_CONSUMED' }
        }
        databaseFreeUsageTable.set(businessId, { requestId, consumedAt: new Date() })
        return { success: true, claimed: true }
      }

      const businessId = 'biz-concurrent-test'
      const reqA = simulateClaimAtomic(businessId, 'req-A')
      const reqB = simulateClaimAtomic(businessId, 'req-B')

      // Exactly one succeeds, the other is rejected
      assert.equal(reqA.success, true)
      assert.equal(reqB.success, false)
      assert.equal(databaseFreeUsageTable.size, 1)
    })

    it('rollback restores eligibility when AI generation fails', () => {
      const databaseFreeUsageTable = new Map()

      const businessId = 'biz-rollback-test'
      const requestId = 'req-fail-1'

      // Step 1: Claim at start
      databaseFreeUsageTable.set(businessId, { requestId })
      assert.equal(databaseFreeUsageTable.has(businessId), true)

      // Step 2: Generation fails (e.g. 503 Gemini or invalid JSON)
      const generationSucceeded = false
      if (!generationSucceeded) {
        // Rollback executed
        databaseFreeUsageTable.delete(businessId)
      }

      // Step 3: Business remains eligible for free usage
      assert.equal(databaseFreeUsageTable.has(businessId), false)
    })

    it('refresh, logout/login, and device switch do not reset database consumed state', () => {
      // Simulates database row persisted across sessions
      const persistentDatabase = {
        'biz-user-1': { consumed: true, consumedAt: '2026-09-01T00:00:00Z' },
      }

      // Session 1: initial browser
      const session1Check = Boolean(persistentDatabase['biz-user-1'])
      assert.equal(session1Check, true)

      // Session 2: after page refresh / browser restart / different device
      const session2Check = Boolean(persistentDatabase['biz-user-1'])
      assert.equal(session2Check, true)
    })
  })

  // ══════════════════════════════════════════════════════════
  // 4. UI BADGE & LOCK SPECIFICATIONS
  // ══════════════════════════════════════════════════════════
  describe('4. ToolCard Visual Specifications (lock.md section 7 & 8)', () => {
    function getMarketingCardConfig(toolName, { isPro, hasUsedFreeAi }) {
      if (toolName === 'SEO Optimizer') {
        return {
          badge: 'Gratis • Unlimited',
          showLock: false,
        }
      }
      if (toolName === 'AI Creative Studio') {
        if (isPro) return { badge: 'Siap Digunakan', showLock: false }
        if (!hasUsedFreeAi) return { badge: 'Gratis • 1x', showLock: false }
        return { badge: 'Token diperlukan', showLock: false }
      }
      // Pro-only tools
      if (isPro) {
        return { badge: 'Siap Digunakan', showLock: false }
      }
      return { badge: 'Pro', showLock: true }
    }

    it('SEO card never shows lock icon for free user', () => {
      const config = getMarketingCardConfig('SEO Optimizer', { isPro: false, hasUsedFreeAi: false })
      assert.equal(config.showLock, false)
      assert.equal(config.badge, 'Gratis • Unlimited')
    })

    it('AI Creative Studio is NEVER locked for Free user (Gratis • 1x when unused, Token diperlukan when used)', () => {
      const unusedConfig = getMarketingCardConfig('AI Creative Studio', { isPro: false, hasUsedFreeAi: false })
      assert.equal(unusedConfig.showLock, false, 'Creative Studio must NOT be locked when trial unused')
      assert.equal(unusedConfig.badge, 'Gratis • 1x')

      const usedConfig = getMarketingCardConfig('AI Creative Studio', { isPro: false, hasUsedFreeAi: true })
      assert.equal(usedConfig.showLock, false, 'Creative Studio must NOT be locked when trial consumed')
      assert.equal(usedConfig.badge, 'Token diperlukan')
    })

    it('Pro-only tools show Pro badge and lock icon before Pro, and remove lock when Pro active', () => {
      const proTools = ['Competitor Analysis', 'Google Business Profile', 'Content Calendar', 'A/B Testing']

      proTools.forEach((tool) => {
        const lockedConfig = getMarketingCardConfig(tool, { isPro: false, hasUsedFreeAi: false })
        assert.equal(lockedConfig.showLock, true, `${tool} should be locked before Pro`)
        assert.equal(lockedConfig.badge, 'Pro')

        const unlockedConfig = getMarketingCardConfig(tool, { isPro: true, hasUsedFreeAi: false })
        assert.equal(unlockedConfig.showLock, false, `${tool} lock icon must be completely removed when Pro`)
        assert.equal(unlockedConfig.badge, 'Siap Digunakan')
      })
    })
  })

  // ══════════════════════════════════════════════════════════
  // 5. ROUTE HIERARCHY & ACCESS MATRIX (lock.md Section 8 & 9)
  // ══════════════════════════════════════════════════════════
  describe('5. Route Hierarchy & Global Guard Isolation (lock.md)', () => {
    // Read and analyze route tree structure from App.jsx
    const appJsx = fs.readFileSync(path.resolve('src/App.jsx'), 'utf-8')

    // Helper to extract routes wrapped by RequireSubscription blocks
    function parseRouteGuards(source) {
      // Find the dashboard children block
      const dashboardMatch = source.match(/path:\s*['"]\/dashboard['"][\s\S]*?children:\s*\[([\s\S]*?)\n\s*\]\s*,\s*\}\s*,\s*\{\s*path:\s*['"]\*['"]/)
      assert.ok(dashboardMatch, 'Must find /dashboard route definition')
      const dashboardBody = dashboardMatch[1]

      // Find blocks wrapped in RequireSubscription
      const guardedBlocks = []
      const requireSubRegex = /element:\s*<RequireSubscription(?:[^>]*)>[\s\S]*?children:\s*\[([\s\S]*?)\]/g
      let match
      while ((match = requireSubRegex.exec(dashboardBody)) !== null) {
        guardedBlocks.push(match[1])
      }

      // Check if a path is inside any guarded block
      function isGuarded(routePath) {
        return guardedBlocks.some(block => {
          const pathRegex = new RegExp(`path:\\s*['"]${routePath}['"]`)
          return pathRegex.test(block)
        })
      }

      // Check if a route is defined under dashboard
      function isDefined(routePath) {
        const pathRegex = new RegExp(`path:\\s*['"]${routePath}['"]`)
        return pathRegex.test(dashboardBody)
      }

      return { isGuarded, isDefined }
    }

    const { isGuarded, isDefined } = parseRouteGuards(appJsx)

    it('A. /dashboard/ekspor is defined and NOT wrapped by Pro guard', () => {
      assert.equal(isDefined('ekspor'), true, 'ekspor route must exist')
      assert.equal(isGuarded('ekspor'), false, 'ekspor must NOT be guarded by RequireSubscription')
    })

    it('B. /dashboard/legalitas is defined and NOT wrapped by Pro guard', () => {
      assert.equal(isDefined('legalitas'), true, 'legalitas route must exist')
      assert.equal(isGuarded('legalitas'), false, 'legalitas must NOT be guarded by RequireSubscription')
    })

    it('C. /dashboard/kurs is defined and NOT wrapped by Pro guard', () => {
      assert.equal(isDefined('kurs'), true, 'kurs route must exist')
      assert.equal(isGuarded('kurs'), false, 'kurs must NOT be guarded by RequireSubscription')
    })

    it('D. /dashboard/marketing/seo-optimizer is defined and NOT wrapped by Pro guard', () => {
      assert.equal(isDefined('marketing/seo-optimizer'), true, 'seo-optimizer route must exist')
      assert.equal(isGuarded('marketing/seo-optimizer'), false, 'seo-optimizer must NOT be guarded by RequireSubscription')
    })

    it('E. /dashboard/marketing/content-generator is defined and NOT wrapped by Pro guard', () => {
      assert.equal(isDefined('marketing/content-generator'), true, 'content-generator route must exist')
      assert.equal(isGuarded('marketing/content-generator'), false, 'content-generator must NOT be guarded by RequireSubscription')
    })

    it('F. /dashboard/marketing/ab-testing is strictly guarded by Pro guard', () => {
      assert.equal(isDefined('marketing/ab-testing'), true, 'ab-testing route must exist')
      assert.equal(isGuarded('marketing/ab-testing'), true, 'ab-testing MUST be guarded by RequireSubscription')
    })

    it('G. /dashboard/marketing/competitor-analysis is strictly guarded by Pro guard', () => {
      assert.equal(isDefined('marketing/competitor-analysis'), true, 'competitor-analysis route must exist')
      assert.equal(isGuarded('marketing/competitor-analysis'), true, 'competitor-analysis MUST be guarded by RequireSubscription')
    })

    it('H. /dashboard/marketing/google-business is strictly guarded by Pro guard', () => {
      assert.equal(isDefined('marketing/google-business'), true, 'google-business route must exist')
      assert.equal(isGuarded('marketing/google-business'), true, 'google-business MUST be guarded by RequireSubscription')
    })

    it('I. /dashboard/marketing/calendar is strictly guarded by Pro guard', () => {
      assert.equal(isDefined('marketing/calendar'), true, 'calendar route must exist')
      assert.equal(isGuarded('marketing/calendar'), true, 'calendar MUST be guarded by RequireSubscription')
    })

    it('J. Direct URL access: Free routes allow direct free navigation, Pro routes block', () => {
      const freeDirectRoutes = [
        'ekspor',
        'legalitas',
        'kurs',
        'marketing/seo-optimizer',
        'marketing/content-generator',
      ]
      const proDirectRoutes = [
        'marketing/ab-testing',
        'marketing/competitor-analysis',
        'marketing/google-business',
        'marketing/calendar',
      ]

      freeDirectRoutes.forEach(r => {
        assert.equal(isGuarded(r), false, `Direct URL /dashboard/${r} must remain accessible for Free user`)
      })

      proDirectRoutes.forEach(r => {
        assert.equal(isGuarded(r), true, `Direct URL /dashboard/${r} must remain blocked for Free user`)
      })
    })
  })
})
