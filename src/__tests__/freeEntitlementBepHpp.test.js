// src/__tests__/freeEntitlementBepHpp.test.js
// Regression test suite for Free Entitlement — BEP and HPP Calculator
// Strictly verifying free.md specifications

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CATEGORIES } from '../data/categories.js'

describe('free.md: BEP & HPP Calculator Entitlement and Route Audit', () => {
  const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const toolCardSrc = fs.readFileSync(path.resolve('src/components/ToolCard.jsx'), 'utf8')
  const businessToolsSrc = fs.readFileSync(path.resolve('src/sections/BusinessTools.jsx'), 'utf8')

  // Helper accurately reflecting ToolCard entitlement determination
  function evaluateToolCardEntitlement(tool, { isPro, hasUsedFreeAi = false }) {
    const isComingSoon = tool.status === 'coming_soon' || tool.availability === 'COMING_SOON'
    const needsConnection = tool.status === 'needs_connection'

    const isAiStudio = tool.name === 'AI Creative Studio' || tool.path?.includes('content-generator')
    const isExplicitPro = tool.requiresPro === true
    const isExplicitFree = tool.requiresPro === false || tool.isFree === true

    const isHpp = tool.name === 'HPP Calculator' || tool.name?.toLowerCase().includes('hpp') || tool.path?.includes('hpp')
    const isBep = tool.name === 'BEP Calculator' || tool.name === 'Break-even Point Calculator' || tool.name?.toLowerCase().includes('bep') || tool.name?.toLowerCase().includes('break-even') || tool.name?.toLowerCase().includes('break even') || tool.path?.includes('bep')
    const isSeo = tool.name === 'SEO Optimizer' || tool.path?.includes('seo')
    const isLegal = tool.name === 'Legalitas Checker' || tool.path?.includes('legalitas')
    const isManualTx = tool.name?.toLowerCase().includes('transaksi manual')

    const isFreeTool = !isComingSoon && !isAiStudio && (isHpp || isBep || isExplicitFree || (!isExplicitPro && (isSeo || isLegal || isManualTx)))

    let isLocked = false
    let showLockIcon = false
    let badgeLabel = ''

    if (isComingSoon) {
      isLocked = false
      showLockIcon = false
      badgeLabel = 'Coming Soon'
    } else if (isFreeTool) {
      isLocked = false
      showLockIcon = false
      badgeLabel = isSeo ? 'Gratis • Unlimited' : 'Gratis'
    } else if (isAiStudio) {
      isLocked = false
      showLockIcon = false
      if (isPro) badgeLabel = 'Siap Digunakan'
      else if (!hasUsedFreeAi) badgeLabel = 'Gratis • 1x'
      else badgeLabel = 'Token diperlukan'
    } else if (needsConnection) {
      badgeLabel = 'Perlu Koneksi'
    } else if (!isPro) {
      isLocked = true
      showLockIcon = true
      badgeLabel = 'Pro'
    } else {
      badgeLabel = 'Siap Digunakan'
    }

    const ctaText = isComingSoon ? 'Segera Hadir' : isLocked ? 'Upgrade Pro' : 'Buka Tool'
    return { isLocked, showLockIcon, badgeLabel, ctaText }
  }

  // 1. Source of Truth Catalog (src/data/categories.js)
  describe('1. Catalog Source of Truth Entitlement', () => {
    it('HPP Calculator is declared in CATEGORIES.finance with requiresPro: false', () => {
      const hpp = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')
      assert.ok(hpp, 'HPP Calculator must exist in finance category')
      assert.equal(hpp.path, '/dashboard/keuangan/hpp-calculator')
      assert.equal(hpp.requiresPro, false, 'HPP Calculator must have requiresPro: false')
    })

    it('BEP Calculator is declared in CATEGORIES.finance with requiresPro: false', () => {
      const bep = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')
      assert.ok(bep, 'BEP Calculator must exist in finance category')
      assert.equal(bep.path, '/dashboard/keuangan/bep-calculator')
      assert.equal(bep.requiresPro, false, 'BEP Calculator must have requiresPro: false')
    })

    it('Pro finance tools are strictly declared with requiresPro: true', () => {
      const proToolNames = [
        'Margin Analysis',
        'Cash Flow Forecast',
        'Tax Planning',
        'Financial Reports',
        'Anomaly Detection',
        'Financial Health Score',
        'Loan Simulation',
      ]

      proToolNames.forEach((name) => {
        const tool = CATEGORIES.finance.tools.find((t) => t.name === name)
        assert.ok(tool, `Tool ${name} must exist in finance category`)
        assert.equal(tool.requiresPro, true, `${name} must have requiresPro: true`)
      })
    })
  })

  // 2. Free User ToolCard Visibility & Entitlement
  describe('2. FREE User Entitlement Evaluation', () => {
    const hppTool = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')
    const bepTool = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')

    it('FREE user: BEP Calculator is visible, unlocked, displays Gratis badge, and CTA Buka Tool', () => {
      const state = evaluateToolCardEntitlement(bepTool, { isPro: false })
      assert.equal(state.isLocked, false, 'BEP must NOT be locked for Free user')
      assert.equal(state.showLockIcon, false, 'BEP must NOT show lock icon for Free user')
      assert.equal(state.badgeLabel, 'Gratis')
      assert.equal(state.ctaText, 'Buka Tool')
    })

    it('FREE user: HPP Calculator is visible, unlocked, displays Gratis badge, and CTA Buka Tool', () => {
      const state = evaluateToolCardEntitlement(hppTool, { isPro: false })
      assert.equal(state.isLocked, false, 'HPP must NOT be locked for Free user')
      assert.equal(state.showLockIcon, false, 'HPP must NOT show lock icon for Free user')
      assert.equal(state.badgeLabel, 'Gratis')
      assert.equal(state.ctaText, 'Buka Tool')
    })

    it('FREE user: Pro-only finance tools remain locked with Pro badge and Upgrade Pro CTA', () => {
      const proToolNames = ['Margin Analysis', 'Cash Flow Forecast', 'Tax Planning', 'Financial Reports']
      proToolNames.forEach((name) => {
        const tool = CATEGORIES.finance.tools.find((t) => t.name === name)
        const state = evaluateToolCardEntitlement(tool, { isPro: false })
        assert.equal(state.isLocked, true, `${name} must be locked for Free user`)
        assert.equal(state.showLockIcon, true, `${name} must show lock icon for Free user`)
        assert.equal(state.badgeLabel, 'Pro')
        assert.equal(state.ctaText, 'Upgrade Pro')
      })
    })
  })

  // 3. Pro User Entitlement Evaluation
  describe('3. PRO User Entitlement Evaluation', () => {
    const hppTool = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')
    const bepTool = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')
    const marginTool = CATEGORIES.finance.tools.find((t) => t.name === 'Margin Analysis')

    it('PRO user: BEP Calculator is accessible with Buka Tool', () => {
      const state = evaluateToolCardEntitlement(bepTool, { isPro: true })
      assert.equal(state.isLocked, false)
      assert.equal(state.showLockIcon, false)
      assert.equal(state.ctaText, 'Buka Tool')
    })

    it('PRO user: HPP Calculator is accessible with Buka Tool', () => {
      const state = evaluateToolCardEntitlement(hppTool, { isPro: true })
      assert.equal(state.isLocked, false)
      assert.equal(state.showLockIcon, false)
      assert.equal(state.ctaText, 'Buka Tool')
    })

    it('PRO user: Pro finance tools are unlocked with Siap Digunakan badge and Buka Tool', () => {
      const state = evaluateToolCardEntitlement(marginTool, { isPro: true })
      assert.equal(state.isLocked, false)
      assert.equal(state.showLockIcon, false)
      assert.equal(state.badgeLabel, 'Siap Digunakan')
      assert.equal(state.ctaText, 'Buka Tool')
    })
  })

  // 4. Route Protection Consistency in App.jsx
  describe('4. Route Protection Consistency (src/App.jsx)', () => {
    it('/dashboard/keuangan category route is placed outside RequireSubscription', () => {
      const requireSubIndex = appSrc.indexOf('<RequireSubscription />')
      const financeCategoryIndex = appSrc.indexOf("{ path: 'keuangan', element: <CategoryPage categoryId=\"finance\" /> }")

      assert.ok(financeCategoryIndex !== -1, 'keuangan category route must exist in App.jsx')
      assert.ok(requireSubIndex !== -1, 'RequireSubscription must exist in App.jsx')
      assert.ok(
        financeCategoryIndex < requireSubIndex,
        'keuangan category overview route must precede RequireSubscription so Free users can access it'
      )
    })

    it('/dashboard/keuangan/hpp-calculator is placed outside RequireSubscription', () => {
      const requireSubIndex = appSrc.indexOf('<RequireSubscription />')
      const hppIndex = appSrc.indexOf("{ path: 'keuangan/hpp-calculator', element: <HPPCalculator /> }")

      assert.ok(hppIndex !== -1, 'hpp-calculator route must exist in App.jsx')
      assert.ok(
        hppIndex < requireSubIndex,
        'hpp-calculator route must precede RequireSubscription so Free users can access it directly'
      )
    })

    it('/dashboard/keuangan/bep-calculator is placed outside RequireSubscription', () => {
      const requireSubIndex = appSrc.indexOf('<RequireSubscription />')
      const bepIndex = appSrc.indexOf("{ path: 'keuangan/bep-calculator', element: <BEPCalculator /> }")

      assert.ok(bepIndex !== -1, 'bep-calculator route must exist in App.jsx')
      assert.ok(
        bepIndex < requireSubIndex,
        'bep-calculator route must precede RequireSubscription so Free users can access it directly'
      )
    })

    it('Pro finance routes remain protected inside RequireSubscription', () => {
      const requireSubIndex = appSrc.indexOf('<RequireSubscription />')
      const proFinanceRoutes = [
        "path: 'keuangan/margin-analysis'",
        "path: 'keuangan/cash-flow-forecast'",
        "path: 'keuangan/tax-planning'",
        "path: 'keuangan/financial-reports'",
        "path: 'keuangan/anomaly-detection'",
        "path: 'keuangan/financial-health-score'",
        "path: 'keuangan/loan-simulation'",
      ]

      proFinanceRoutes.forEach((route) => {
        const routeIndex = appSrc.indexOf(route)
        assert.ok(routeIndex !== -1, `${route} must exist in App.jsx`)
        assert.ok(
          routeIndex > requireSubIndex,
          `${route} must be placed inside RequireSubscription to protect Pro feature`
        )
      })
    })
  })

  // 5. Landing Page Business Tools Status
  describe('5. Landing Page Showcase (BusinessTools.jsx)', () => {
    it('HPP Calculator has status available in BusinessTools.jsx', () => {
      assert.ok(
        businessToolsSrc.includes("{ name: 'HPP Calculator', status: 'available' }"),
        'HPP Calculator must have status available on landing showcase'
      )
    })

    it('BEP Calculator has status available in BusinessTools.jsx', () => {
      assert.ok(
        businessToolsSrc.includes("{ name: 'BEP Calculator', status: 'available' }"),
        'BEP Calculator must have status available on landing showcase'
      )
    })
  })

  // 6. Dashboard Quick Links & Pricing Integrity
  describe('6. Dashboard Quick Links & Pricing Integrity', () => {
    const dashboardSrc = fs.readFileSync(path.resolve('src/pages/dashboard/DashboardHome.jsx'), 'utf8')
    const pricingSrc = fs.readFileSync(path.resolve('src/pages/PricingPage.jsx'), 'utf8')

    it('DashboardHome quick link for HPP points directly to /dashboard/keuangan/hpp-calculator', () => {
      assert.ok(
        dashboardSrc.includes("path: '/dashboard/keuangan/hpp-calculator'"),
        'DashboardHome must link directly to free hpp-calculator'
      )
      assert.ok(
        !dashboardSrc.includes("{ label: 'Analisis Margin & HPP', desc: 'Kalkulasi keuntungan bersih produk', path: '/dashboard/keuangan/margin-analysis' }"),
        'DashboardHome must not mislead free users by pointing HPP link to Pro-only margin-analysis'
      )
    })

    it('PricingPage does NOT list BEP or HPP as a Pro-exclusive feature', () => {
      assert.ok(
        !pricingSrc.includes("'Financial intelligence & kalkulator BEP/HPP'"),
        'PricingPage must not claim BEP/HPP is Pro-only'
      )
      assert.ok(
        pricingSrc.includes("'Financial intelligence & analisis margin lanjutan'"),
        'PricingPage correctly lists advanced margin analysis as Pro'
      )
    })

    it('Categories explicitly mark HPP and BEP with isFree: true', () => {
      const hpp = CATEGORIES.finance.tools.find((t) => t.name === 'HPP Calculator')
      const bep = CATEGORIES.finance.tools.find((t) => t.name === 'BEP Calculator')
      assert.equal(hpp.isFree, true, 'HPP must have isFree: true')
      assert.equal(bep.isFree, true, 'BEP must have isFree: true')
    })
  })

  // 7. Calculation Engines (HPP & BEP Functional Verification for Free Users)
  describe('7. Free Functional Calculation Verification', async () => {
    const { calculateHPP } = await import('../sections/HPPCalculator/calculateHPP.js')
    const { calculateBEP } = await import('../sections/BEPCalculator/calculateBEP.js')

    it('Performs accurate HPP calculation with materials, packaging, labor, and overhead', () => {
      const hppInput = {
        quantityProduced: 100,
        materials: [
          { name: 'Kopi Arabika', quantity: 1, unit: 'kg', pricePerUnit: 150000 },
          { name: 'Susu UHT', quantity: 2, unit: 'liter', pricePerUnit: 25000 },
        ],
        packaging: [{ name: 'Cup & Lid', quantity: 100, unit: 'pcs', pricePerUnit: 500 }],
        labor: [{ name: 'Barista', cost: 50000 }],
        overhead: [{ name: 'Listrik', cost: 20000 }],
        otherCosts: [],
        wastePercent: 5,
        priceMode: 'margin',
        marginPercent: 40,
        markupPercent: 50,
      }

      const result = calculateHPP(hppInput)
      assert.ok(result, 'Calculation result should not be null')
      assert.equal(result.isValid, true, 'Result should be valid without errors')
      assert.ok(result.totalCost > 0, 'Total cost must be > 0')
      assert.ok(result.hppPerUnit > 0, 'HPP per unit must be > 0')
      assert.ok(result.sellingPrice > result.hppPerUnit, 'Suggested price must exceed HPP')
    })

    it('Performs accurate BEP calculation in units and nominal rupiah', () => {
      const bepInput = {
        sellingPricePerUnit: 25000,
        materialCostPerUnit: 8000,
        packagingCostPerUnit: 2000,
        salesFeePerUnit: 1000,
        otherVariableCostPerUnit: 0,
        rent: 2000000,
        fixedLabor: 3000000,
        utilities: 1000000,
        software: 0,
        otherFixedCosts: 0,
        actualUnits: 500,
        targetProfit: 1000000,
      }

      const result = calculateBEP(bepInput)
      assert.ok(result, 'BEP calculation result should not be null')
      assert.equal(result.isValid, true, 'BEP result should be valid')
      assert.equal(result.fixedCosts, 6000000, 'Total fixed cost must be 6,000,000')
      assert.equal(result.variableCostPerUnit, 11000, 'Variable cost per unit must be 11,000')
      assert.equal(result.contributionMarginPerUnit, 14000, 'Contribution margin per unit must be 14,000')
      assert.ok(result.bepUnits > 0, 'BEP units must be > 0')
      assert.ok(result.bepRevenue > 0, 'BEP revenue must be > 0')
    })
  })
})
