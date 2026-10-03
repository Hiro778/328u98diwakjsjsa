// src/__tests__/toolEntitlementUi.test.js
// Focused verification of Tool Entitlement UI (Basic Rp 35.000 vs Pro Rp 130.000)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CATEGORIES, PLANS, PLAN_CONFIG } from '../data/categories.js'

describe('Tool Entitlement UI — Basic 35K vs Pro 130K Verification', () => {
  const toolCardSrc = fs.readFileSync(path.resolve('src/components/ToolCard.jsx'), 'utf8')
  const subscriptionGateSrc = fs.readFileSync(path.resolve('src/components/SubscriptionGate.jsx'), 'utf8')
  const allToolsSrc = fs.readFileSync(path.resolve('src/pages/dashboard/AllToolsPage.jsx'), 'utf8')

  // 1. ToolCard Badge labels & pricing display
  describe('1. ToolCard Badge & Lock Presentation', () => {
    it('ToolCard defines distinct Basic • Rp35K and Pro • Rp130K badges', () => {
      assert.ok(
        toolCardSrc.includes("label: 'Basic • Rp35K'"),
        'ToolCard must have badge label "Basic • Rp35K"'
      )
      assert.ok(
        toolCardSrc.includes("label: 'Pro • Rp130K'"),
        'ToolCard must have badge label "Pro • Rp130K"'
      )
    })

    it('ToolCard defines distinct lock tooltips for Basic and Pro', () => {
      assert.ok(
        toolCardSrc.includes("lockTooltip = 'Langganan Basic (Rp35.000/bln)'"),
        'ToolCard must set lockTooltip to "Langganan Basic (Rp35.000/bln)" for Basic tier'
      )
      assert.ok(
        toolCardSrc.includes("lockTooltip = 'Upgrade ke Pro (Rp130.000/bln)'"),
        'ToolCard must set lockTooltip to "Upgrade ke Pro (Rp130.000/bln)" for Pro tier'
      )
    })

    it('ToolCard defines distinct action button texts: Upgrade Basic vs Upgrade Pro', () => {
      assert.ok(
        toolCardSrc.includes("lockActionText = 'Upgrade Basic'"),
        'ToolCard must set lockActionText to "Upgrade Basic" for Basic tier'
      )
      assert.ok(
        toolCardSrc.includes("lockActionText = 'Upgrade Pro'"),
        'ToolCard must set lockActionText to "Upgrade Pro" for Pro tier'
      )
    })

    it('ToolCard differentiates lock styling between Basic (blue) and Pro (amber)', () => {
      assert.ok(
        toolCardSrc.includes('border-blue-500/20') && toolCardSrc.includes('border-amber-500/20'),
        'ToolCard must differentiate border colors between Basic (blue) and Pro (amber)'
      )
      assert.ok(
        toolCardSrc.includes('text-blue-400') && toolCardSrc.includes('text-amber-400'),
        'ToolCard must differentiate text accents between Basic and Pro'
      )
    })

    it('ToolCard navigates to respective pricing plans on click when locked', () => {
      assert.ok(
        toolCardSrc.includes("const targetPlan = isBasicTier ? 'basic' : 'pro'"),
        'ToolCard must determine target plan as basic or pro'
      )
      assert.ok(
        toolCardSrc.includes('navigate(`/pricing?plan=${targetPlan}`)'),
        'ToolCard must navigate to /pricing?plan=basic or /pricing?plan=pro'
      )
    })
  })

  // 2. SubscriptionGate presentation
  describe('2. SubscriptionGate In-place Paywall Presentation', () => {
    it('SubscriptionGate provides checkout links for basic and pro plans', () => {
      assert.ok(
        subscriptionGateSrc.includes("isBasicReq ? '/pricing?plan=basic' : '/pricing?plan=pro'"),
        'SubscriptionGate must link to /pricing?plan=basic or /pricing?plan=pro'
      )
    })

    it('SubscriptionGate mentions Rp35.000 / bulan for Basic standalone tools', () => {
      assert.ok(
        subscriptionGateSrc.includes('Rp35.000/bulan') || subscriptionGateSrc.includes('Rp35.000 / bln'),
        'SubscriptionGate must state Basic price Rp35.000'
      )
    })

    it('SubscriptionGate mentions Rp130.000 / bulan for Pro full suite', () => {
      assert.ok(
        subscriptionGateSrc.includes('Rp130.000 / bulan') || subscriptionGateSrc.includes('Rp130.000/bln'),
        'SubscriptionGate must state Pro price Rp130.000'
      )
    })
  })

  // 3. AllToolsPage tier presentation & filters
  describe('3. AllToolsPage Tier Presentation & Filter Controls', () => {
    it('AllToolsPage contains tier filter pills: Semua, Basic • Rp35K, and Pro • Rp130K', () => {
      assert.ok(
        allToolsSrc.includes('Basic • Rp35K'),
        'AllToolsPage must feature Basic • Rp35K filter pill'
      )
      assert.ok(
        allToolsSrc.includes('Pro • Rp130K'),
        'AllToolsPage must feature Pro • Rp130K filter pill'
      )
    })

    it('AllToolsPage filtering respects tierFilter state', () => {
      assert.ok(
        allToolsSrc.includes("tierFilter === 'basic'"),
        'AllToolsPage must filter for basic tier'
      )
      assert.ok(
        allToolsSrc.includes("tierFilter === 'pro'"),
        'AllToolsPage must filter for pro tier'
      )
    })
  })

  // 4. Categories registry consistency
  describe('4. Categories Registry Tier Consistency', () => {
    it('POS / Kasir is explicitly declared with tier: "pro" and requiresPro: true', () => {
      const pos = CATEGORIES.operations.tools.find((t) => t.name === 'POS / Kasir')
      assert.ok(pos, 'POS / Kasir must exist in operations category')
      assert.equal(pos.tier, 'pro', 'POS / Kasir must have tier pro')
      assert.equal(pos.requiresPro, true, 'POS / Kasir must have requiresPro: true')
    })

    it('All active tools have explicit tier declared matching gas.md', () => {
      const allTools = Object.values(CATEGORIES).flatMap((c) => c.tools)
      const liveTools = allTools.filter((t) => t.availability !== 'COMING_SOON' && t.status !== 'coming_soon')

      for (const tool of liveTools) {
        assert.ok(
          tool.tier === 'basic' || tool.tier === 'pro',
          `Tool "${tool.name}" must have explicit tier "basic" or "pro", got: ${tool.tier}`
        )
      }
    })

    it('PLAN_CONFIG defines accurate prices: Basic 35K & Pro 130K', () => {
      assert.equal(PLAN_CONFIG[PLANS.BASIC].price, 35000)
      assert.equal(PLAN_CONFIG[PLANS.BASIC].priceLabel, 'Rp35K / bulan')
      assert.equal(PLAN_CONFIG[PLANS.PRO].price, 130000)
      assert.equal(PLAN_CONFIG[PLANS.PRO].priceLabel, 'Rp130K / bulan')
    })
  })
})
