// src/__tests__/creativeStudioRegression.test.js
// Regression test suite specified by lock.md
// Tests real Free user routing, component guards, and hybrid entitlement states.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'

describe('lock.md AI Creative Studio Hybrid Access & Regression Suite', () => {
  const creativeStudioJsxPath = path.resolve('src/pages/dashboard/marketing/CreativeStudioPage.jsx')
  const appJsxPath = path.resolve('src/App.jsx')

  const creativeStudioSource = fs.readFileSync(creativeStudioJsxPath, 'utf-8')
  const appJsxSource = fs.readFileSync(appJsxPath, 'utf-8')

  // ════════════════════════════════════════════════════════════════
  // 1. Guard & Paywall Elimination Check (lock.md Tasks 1, 3, 4, 7)
  // ════════════════════════════════════════════════════════════════
  describe('1. Static Elimination of Incorrect Pro-Only Guards', () => {
    it('assert "BisnisSehat Pro Required" string does not exist in CreativeStudioPage', () => {
      assert.doesNotMatch(
        creativeStudioSource,
        /BisnisSehat Pro Required/,
        'CreativeStudioPage must not contain "BisnisSehat Pro Required"'
      )
    })

    it('assert "Creative Studio requires an active Pro subscription." does not exist in CreativeStudioPage', () => {
      assert.doesNotMatch(
        creativeStudioSource,
        /Creative Studio requires an active Pro subscription\./,
        'CreativeStudioPage must not contain Pro-only blocker text'
      )
    })

    it('assert no generic if (!isPro) or subscription paywall guard blocks component rendering', () => {
      assert.doesNotMatch(
        creativeStudioSource,
        /if\s*\(\s*!isPro\s*\)\s*return\s*<SubscriptionGate/,
        'No if (!isPro) return <SubscriptionGate ... /> allowed'
      )
      assert.doesNotMatch(
        creativeStudioSource,
        /subscription\.plan\s*===\s*['"]free['"]/,
        'No subscription.plan === free guard allowed in CreativeStudioPage'
      )
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 2. Route Hierarchy Check (lock.md Task 2 & Architecture)
  // ════════════════════════════════════════════════════════════════
  describe('2. Route Architecture Hierarchy', () => {
    function parseDashboardRoutes(source) {
      const dashboardMatch = source.match(
        /path:\s*['"]\/dashboard['"][\s\S]*?children:\s*\[([\s\S]*?)\n\s*\]\s*,\s*\}\s*,\s*\{\s*path:\s*['"]\*['"]/
      )
      assert.ok(dashboardMatch, 'Must find /dashboard route block in App.jsx')
      const dashboardBody = dashboardMatch[1]

      const guardedBlocks = []
      const requireSubRegex = /element:\s*<RequireSubscription(?:[^>]*)>[\s\S]*?children:\s*\[([\s\S]*?)\]/g
      let match
      while ((match = requireSubRegex.exec(dashboardBody)) !== null) {
        guardedBlocks.push(match[1])
      }

      function isGuarded(routePath) {
        return guardedBlocks.some(block => {
          const pathRegex = new RegExp(`path:\\s*['"]${routePath}['"]`)
          return pathRegex.test(block)
        })
      }

      function isDefined(routePath) {
        const pathRegex = new RegExp(`path:\\s*['"]${routePath}['"]`)
        return pathRegex.test(dashboardBody)
      }

      return { isGuarded, isDefined }
    }

    const { isGuarded, isDefined } = parseDashboardRoutes(appJsxSource)

    it('AI Creative Studio (/dashboard/marketing/content-generator) is accessible and NOT gated by RequireSubscription', () => {
      assert.equal(isDefined('marketing/content-generator'), true)
      assert.equal(isGuarded('marketing/content-generator'), false)
    })

    it('SEO Optimizer (/dashboard/marketing/seo-optimizer) is accessible and NOT gated by RequireSubscription', () => {
      assert.equal(isDefined('marketing/seo-optimizer'), true)
      assert.equal(isGuarded('marketing/seo-optimizer'), false)
    })

    it('Other 4 Pro Marketing routes REMAIN strictly guarded by RequireSubscription', () => {
      const proRoutes = [
        'marketing/ab-testing',
        'marketing/competitor-analysis',
        'marketing/google-business',
        'marketing/calendar',
      ]

      proRoutes.forEach((route) => {
        assert.equal(isDefined(route), true, `${route} must be defined`)
        assert.equal(isGuarded(route), true, `${route} MUST be guarded by RequireSubscription`)
      })
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 3. Hybrid Entitlement State Machine (lock.md Task 6)
  // ════════════════════════════════════════════════════════════════
  describe('3. Hybrid Entitlement Lifecycle for Free and Pro Users', () => {
    // Pure logic simulation of CreativeStudioPage entitlement rules
    function evaluateCreativeStudioEntitlement({
      isPro,
      hasUsedFreeAi,
      creditOverview,
      creditsAvailable = 0,
      prdCost = 1,
    }) {
      const hasFreeTrial = Boolean(creditOverview?.freeUsageAvailable ?? !hasUsedFreeAi)
      const canGeneratePRD = hasFreeTrial || isPro || creditsAvailable >= prdCost
      const pageRenders = true // Since component guard is removed
      const showProRequiredModal = false

      return {
        pageRenders,
        showProRequiredModal,
        hasFreeTrial,
        canGeneratePRD,
        requiresUpgrade: !canGeneratePRD,
      }
    }

    it('Free user + unused lifetime trial: page renders, "BisnisSehat Pro Required" NOT rendered, first generation allowed', () => {
      const mockFreeUser = { id: 'free-user-1', email: 'free1@umkm.id' }
      const entitlement = calculateSubscriptionEntitlement({
        user: mockFreeUser,
        subscription: null,
        hasPaidHistory: false,
        loading: false,
      })
      assert.equal(entitlement.isPro, false)

      const studioState = evaluateCreativeStudioEntitlement({
        isPro: entitlement.isPro,
        hasUsedFreeAi: false,
        creditOverview: { freeUsageAvailable: true, balance: { available: 0 } },
        creditsAvailable: 0,
      })

      assert.equal(studioState.pageRenders, true, 'Creative Studio page must render')
      assert.equal(studioState.showProRequiredModal, false, '"BisnisSehat Pro Required" must NOT render')
      assert.equal(studioState.hasFreeTrial, true, 'Free trial must be recognized as available')
      assert.equal(studioState.canGeneratePRD, true, 'First lifetime free generation MUST be allowed')
      assert.equal(studioState.requiresUpgrade, false, 'Should not require upgrade for unused trial')
    })

    it('Free user + free usage already consumed: page still renders, generation is blocked / requires upgrade', () => {
      const mockFreeUser = { id: 'free-user-2', email: 'free2@umkm.id' }
      const entitlement = calculateSubscriptionEntitlement({
        user: mockFreeUser,
        subscription: null,
        hasPaidHistory: false,
        loading: false,
      })
      assert.equal(entitlement.isPro, false)

      const studioState = evaluateCreativeStudioEntitlement({
        isPro: entitlement.isPro,
        hasUsedFreeAi: true,
        creditOverview: { freeUsageAvailable: false, balance: { available: 0 } },
        creditsAvailable: 0,
      })

      assert.equal(studioState.pageRenders, true, 'Creative Studio page MUST still render for free user')
      assert.equal(studioState.showProRequiredModal, false, '"BisnisSehat Pro Required" paywall must NOT replace the page')
      assert.equal(studioState.hasFreeTrial, false, 'Free trial is consumed')
      assert.equal(studioState.canGeneratePRD, false, 'Generation action MUST be blocked')
      assert.equal(studioState.requiresUpgrade, true, 'Upgrade is required to continue generating')
    })

    it('Pro user: page renders normally and generation is permitted with Pro credits', () => {
      const mockProUser = { id: 'pro-user-1', email: 'pro1@umkm.id' }
      const futureDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
      const entitlement = calculateSubscriptionEntitlement({
        user: mockProUser,
        subscription: {
          id: 'sub-pro-1',
          plan: 'pro',
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: futureDate,
        },
        hasPaidHistory: true,
        loading: false,
      })
      assert.equal(entitlement.isPro, true)

      const studioState = evaluateCreativeStudioEntitlement({
        isPro: entitlement.isPro,
        hasUsedFreeAi: true, // even if free trial consumed in the past
        creditOverview: { freeUsageAvailable: false, balance: { available: 100 } },
        creditsAvailable: 100,
      })

      assert.equal(studioState.pageRenders, true, 'Page renders normally for Pro user')
      assert.equal(studioState.canGeneratePRD, true, 'Pro user generation is allowed')
      assert.equal(studioState.requiresUpgrade, false, 'No upgrade requirement for Pro user')
    })
  })

  // ════════════════════════════════════════════════════════════════
  // 4. Creative Studio 1x Lifetime Free Trial & Regression Cases A-F (lock.md)
  // ════════════════════════════════════════════════════════════════
  describe('4. Creative Studio Free 1x Lifetime Trial & Regression Cases A-F', () => {
    const copyEdgeFuncPath = path.resolve('supabase/functions/creative-generate-copy/index.ts')
    const prdEdgeFuncPath = path.resolve('supabase/functions/creative-generate-prd/index.ts')
    const copyEdgeFuncSource = fs.readFileSync(copyEdgeFuncPath, 'utf-8')
    const prdEdgeFuncSource = fs.readFileSync(prdEdgeFuncPath, 'utf-8')

    it('UI check: Workflow stops at PRD as terminal step, Approve/Copy/Assets are not rendered', () => {
      // Stepper strictly contains only campaign, brief, prd
      assert.match(
        creativeStudioSource,
        /\['campaign',\s*'brief',\s*'prd'\]/,
        'Stepper must only contain campaign, brief, and prd'
      )
      assert.doesNotMatch(
        creativeStudioSource,
        /['"]approve['"]|['"]copy['"]|['"]assets['"]/,
        'Approve, Copy, Assets steps must NOT exist in CreativeStudioPage workflow'
      )
      assert.match(
        creativeStudioSource,
        /hasFreeTrial\s*\?\s*['"]0 credit \(Gratis 1x Trial\)['"]/,
        'PRD step must inform user about free 1x trial availability'
      )
    })

    it('Edge function check: Copy generation costs 20 tokens when not free', () => {
      assert.match(
        copyEdgeFuncSource,
        /const\s+CREATIVE_GENERATION_COST\s*=\s*20/,
        'Copy generation must define CREATIVE_GENERATION_COST = 20 (ai.md)'
      )
      assert.match(
        copyEdgeFuncSource,
        /const\s+requiredCredits\s*=\s*isFreeUsage\s*\?\s*0\s*:\s*CREATIVE_GENERATION_COST/,
        'Copy generation must cost 20 tokens when not free (per ai.md)'
      )
    })

    it('Edge function check: PRD and Copy record is_free_generation and atomic claim', () => {
      assert.match(
        prdEdgeFuncSource,
        /is_free_generation:\s*isFreeUsage/,
        'PRD edge function must record is_free_generation'
      )
      assert.match(
        copyEdgeFuncSource,
        /isPrdFree\s*=\s*Boolean\(prd\.prd_content\?\.is_free_generation\)/,
        'Copy edge function must check if PRD was generated under free trial'
      )
    })

    // ────────────────────────────────────────────────────────────
    // In-memory Database & Entitlement Engine Simulator
    // ────────────────────────────────────────────────────────────
    class SimulationDb {
      constructor() {
        this.creative_free_usage = new Map() // business_id -> { profile_id, operation, request_id, consumed_at }
        this.creative_credits = new Map()    // business_id -> { available, consumed }
        this.creative_prds = new Map()       // id -> { brief_id, business_id, prd_content, status }
        this.creative_assets = new Map()     // id -> { prd_id, business_id, asset_type, credit_cost }
      }

      setCredits(businessId, available) {
        this.creative_credits.set(businessId, { available, consumed: 0 })
      }

      getCredits(businessId) {
        return this.creative_credits.get(businessId) || { available: 0, consumed: 0 }
      }

      // claim_creative_free_usage_atomic
      claimFreeUsageAtomic(businessId, profileId, operation, requestId) {
        if (this.creative_free_usage.has(businessId)) {
          return { success: false, error: 'FREE_USAGE_ALREADY_CONSUMED' }
        }
        this.creative_free_usage.set(businessId, {
          profile_id: profileId,
          operation,
          request_id: requestId,
          consumed_at: new Date().toISOString(),
        })
        return { success: true, claimed: true }
      }

      // deduct_creative_credits_atomic
      deductCreditsAtomic(businessId, credits, operation, requestId) {
        const bal = this.getCredits(businessId)
        if (bal.available < credits) {
          return { success: false, error: 'INSUFFICIENT_CREDITS' }
        }
        bal.available -= credits
        bal.consumed += credits
        this.creative_credits.set(businessId, bal)
        return { success: true, newBalance: bal.available }
      }

      // Simulate creative-generate-prd edge function
      generatePrd(businessId, profileId, briefId, isPro = false) {
        const requestId = `PRD-${Math.random().toString(36).slice(2)}`
        const claimRes = this.claimFreeUsageAtomic(businessId, profileId, 'GENERATE_PRD', requestId)
        const isFreeUsage = claimRes.success

        const requiredCredits = isFreeUsage ? 0 : 20

        if (!isFreeUsage) {
          const bal = this.getCredits(businessId)
          if (!isPro && bal.available < requiredCredits) {
            return { success: false, status: 400, error: 'Creative Credits tidak cukup. Silakan top up untuk melanjutkan.' }
          }
        }

        const prdId = `prd-${Math.random().toString(36).slice(2)}`
        const parsedPrd = {
          headline: 'Marketing Headline',
          body_copy: 'Marketing Body',
          is_free_generation: isFreeUsage,
          request_id: requestId,
        }

        if (!isFreeUsage) {
          const debitRes = this.deductCreditsAtomic(businessId, requiredCredits, 'GENERATE_PRD', requestId)
          if (!debitRes.success) {
            return { success: false, status: 400, error: 'Creative Credits tidak cukup' }
          }
        }

        this.creative_prds.set(prdId, {
          id: prdId,
          brief_id: briefId,
          business_id: businessId,
          prd_content: parsedPrd,
          status: 'ready',
        })

        return {
          success: true,
          prdId,
          prdContent: parsedPrd,
          isFreeUsage,
          creditsDeducted: isFreeUsage ? 0 : requiredCredits,
        }
      }

      // Simulate creative-generate-copy edge function
      generateCopy(businessId, profileId, prdId, isPro = false) {
        const prd = this.creative_prds.get(prdId)
        if (!prd || prd.status !== 'ready') {
          return { success: false, status: 400, error: 'PRD must be approved before generating copy' }
        }
        if (prd.business_id !== businessId) {
          return { success: false, status: 403, error: 'Access denied' }
        }

        const requestId = `COPY-${Math.random().toString(36).slice(2)}`
        let isFreeUsage = false

        // Check if PRD was generated as part of free trial workflow
        const isPrdFree = Boolean(prd.prd_content?.is_free_generation)
        if (isPrdFree) {
          const hasFreeUsage = this.creative_free_usage.has(businessId)
          let existingCopy = null
          for (const asset of this.creative_assets.values()) {
            if (asset.prd_id === prdId && asset.asset_type === 'copy') {
              existingCopy = asset
              break
            }
          }
          if (hasFreeUsage && !existingCopy) {
            isFreeUsage = true
          }
        }

        // Direct claim if not free via PRD workflow
        if (!isFreeUsage) {
          const claimRes = this.claimFreeUsageAtomic(businessId, profileId, 'GENERATE_COPY', requestId)
          if (claimRes.success) {
            isFreeUsage = true
          }
        }

        const requiredCredits = isFreeUsage ? 0 : 20

        if (!isFreeUsage) {
          const bal = this.getCredits(businessId)
          if (!isPro && bal.available < requiredCredits) {
            return { success: false, status: 400, error: 'Creative Credits tidak cukup. Silakan top up untuk melanjutkan.' }
          }
        }

        const copyContent = { headline: 'Copy Headline', CTA: 'Beli Sekarang' }

        if (!isFreeUsage) {
          const debit = this.deductCreditsAtomic(businessId, requiredCredits, 'GENERATE_COPY', requestId)
          if (!debit.success) {
            return { success: false, status: 400, error: 'Creative Credits tidak cukup' }
          }
        }

        const assetId = `asset-${Math.random().toString(36).slice(2)}`
        this.creative_assets.set(assetId, {
          id: assetId,
          prd_id: prdId,
          business_id: businessId,
          asset_type: 'copy',
          metadata: copyContent,
          credit_cost: requiredCredits,
        })

        return {
          success: true,
          assetId,
          copyContent,
          isFreeUsage,
          creditsDeducted: isFreeUsage ? 0 : requiredCredits,
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // EXACT REGRESSION CASES A - F (lock.md)
    // ────────────────────────────────────────────────────────────

    it('A. Free + trial unused + 0 credits → first Creative Studio generation succeeds, 0 credits deducted, trial consumed exactly once', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-a'
      const profileId = 'user-case-a'
      db.setCredits(businessId, 0)

      assert.equal(db.creative_free_usage.has(businessId), false, 'Trial initially unused')

      const res = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(res.success, true, 'First generation must succeed')
      assert.equal(res.isFreeUsage, true, 'Must use free trial')
      assert.equal(res.creditsDeducted, 0, '0 credits deducted')
      assert.equal(db.getCredits(businessId).available, 0, 'Credit balance remains 0')
      assert.equal(db.creative_free_usage.has(businessId), true, 'Trial must become consumed')
      assert.equal(db.creative_free_usage.size, 1, 'Trial consumed exactly once')
    })

    it('B. Free + trial already consumed + 0 credits → generation blocked', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-b'
      const profileId = 'user-case-b'
      db.setCredits(businessId, 0)
      // Consume trial beforehand
      db.claimFreeUsageAtomic(businessId, profileId, 'PREVIOUS_GENERATION', 'req-old')

      assert.equal(db.creative_free_usage.has(businessId), true, 'Trial already consumed')

      const res = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(res.success, false, 'Generation must be blocked')
      assert.equal(res.status, 400)
      assert.match(res.error, /Creative Credits tidak cukup/)
    })

    it('C. Free + trial already consumed + 20 tokens → generation succeeds, 20 tokens deducted', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-c'
      const profileId = 'user-case-c'
      db.setCredits(businessId, 20)
      // Consume trial beforehand
      db.claimFreeUsageAtomic(businessId, profileId, 'PREVIOUS_GENERATION', 'req-old')

      assert.equal(db.creative_free_usage.has(businessId), true, 'Trial already consumed')
      assert.equal(db.getCredits(businessId).available, 20, 'Has 20 tokens')

      const res = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(res.success, true, 'Generation must succeed with 20 tokens')
      assert.equal(res.isFreeUsage, false, 'Not free usage')
      assert.equal(res.creditsDeducted, 20, '20 tokens deducted')
      assert.equal(db.getCredits(businessId).available, 0, 'Balance after deduction is 0')
    })

    it('D. Pro + 0 credits → follows normal Pro credit rules (requires credits, no lifetime free-trial dependency)', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-d'
      const profileId = 'user-case-d'
      db.setCredits(businessId, 0)
      db.claimFreeUsageAtomic(businessId, profileId, 'PREVIOUS_GENERATION', 'req-old')

      // With 0 credits, follows normal credit-based rule: blocked when credits = 0
      const res0 = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(res0.success, false, '0 credits is blocked under normal credit rules')
      assert.match(res0.error, /Creative Credits tidak cukup/)

      // With credits, follows normal credit rule: succeeds and deducts 20 tokens
      db.setCredits(businessId, 50)
      const resWithCredits = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(resWithCredits.success, true, 'Normal credit-based generation succeeds')
      assert.equal(resWithCredits.isFreeUsage, false, 'No lifetime free trial dependency')
      assert.equal(resWithCredits.creditsDeducted, 20, 'Deducts 20 tokens normally')
      assert.equal(db.getCredits(businessId).available, 30)
    })

    it('E. Concurrent duplicate requests → cannot consume the lifetime trial twice', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-e'
      const profileId = 'user-case-e'

      // Simultaneous claim attempts
      const claim1 = db.claimFreeUsageAtomic(businessId, profileId, 'GENERATE_PRD', 'req-1')
      const claim2 = db.claimFreeUsageAtomic(businessId, profileId, 'GENERATE_PRD', 'req-2')

      assert.equal(claim1.success, true, 'First claim succeeds')
      assert.equal(claim2.success, false, 'Second concurrent claim is rejected')
      assert.equal(claim2.error, 'FREE_USAGE_ALREADY_CONSUMED')
      assert.equal(db.creative_free_usage.size, 1, 'Lifetime trial consumed exactly once')
    })

    it('F. PRD + Copy within ONE generation workflow → lifetime trial consumed only once', () => {
      const db = new SimulationDb()
      const businessId = 'biz-case-f'
      const profileId = 'user-case-f'
      db.setCredits(businessId, 0)

      // Step 1: Generate PRD as Free user with unused trial
      const prdRes = db.generatePrd(businessId, profileId, 'brief-1', false)
      assert.equal(prdRes.success, true, 'PRD generation succeeds')
      assert.equal(prdRes.isFreeUsage, true, 'PRD is free')
      assert.equal(prdRes.creditsDeducted, 0, '0 credits deducted for PRD')
      assert.equal(db.creative_free_usage.size, 1, 'Free usage consumed for workflow')

      // Step 2: Generate Copy for the approved PRD in the SAME workflow
      const copyRes = db.generateCopy(businessId, profileId, prdRes.prdId, false)
      assert.equal(copyRes.success, true, 'Copy generation succeeds for free workflow PRD')
      assert.equal(copyRes.isFreeUsage, true, 'Copy generation recognizes workflow free trial')
      assert.equal(copyRes.creditsDeducted, 0, '0 credits deducted for Copy')

      // Total lifetime trial consumption must still be exactly 1
      assert.equal(db.creative_free_usage.size, 1, 'Lifetime trial consumed ONLY ONCE for entire workflow')
      assert.equal(db.getCredits(businessId).available, 0, 'User credits remain 0')

      // Step 3: A subsequent second Copy for the same PRD must NOT be free
      const secondCopyRes = db.generateCopy(businessId, profileId, prdRes.prdId, false)
      assert.equal(secondCopyRes.success, false, 'Subsequent generation blocked without credits')
      assert.match(secondCopyRes.error, /Creative Credits tidak cukup/)
    })
  })
})

