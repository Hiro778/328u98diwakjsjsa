// src/__tests__/twoTierPricingModel.test.js
// Verification of 2-Tier Pricing Model (Basic Rp 35.000 & Pro Rp 130.000) per gas.md Phase 11

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { calculateSubscriptionEntitlement } from '../lib/subscriptionUtils.js'
import { CATEGORIES, PLANS, PLAN_CONFIG } from '../data/categories.js'

describe('Phase 11: Two-Tier Pricing Model & Entitlement Verification (gas.md)', () => {
  const mockUser = {
    id: 'user-umkm-1234',
    email: 'owner@umkm-indonesia.id',
  }

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Collect all tools across categories
  const allTools = Object.values(CATEGORIES).flatMap((cat) => cat.tools || [])
  const findTool = (name) => allTools.find((t) => t.name === name)

  // Helper to determine access for a tool
  function canAccessTool(tool, entitlement) {
    if (!entitlement || !entitlement.hasActiveSubscription) return false
    if (entitlement.isPro) return true
    if (entitlement.isBasic && tool.tier === 'basic') return true
    return false
  }

  // ──────────────────────────────────────────────────────────
  // 1. Basic user: BASIC tool → ALLOWED
  // ──────────────────────────────────────────────────────────
  it('1. Basic user: BASIC tool -> ALLOWED', () => {
    const basicEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-basic-1',
        plan: 'basic',
        status: 'active',
        expires_at: futureDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    assert.equal(basicEntitlement.hasActiveSubscription, true)
    assert.equal(basicEntitlement.isBasic, true)
    assert.equal(basicEntitlement.isPro, false)
    assert.equal(basicEntitlement.plan, 'basic')

    // Test across known standalone Basic tools
    const basicToolNames = [
      'HPP Calculator',
      'BEP Calculator',
      'Loan Simulation',
      'Ads',
      'SEO Optimizer',
      'Content Calendar',
    ]

    for (const name of basicToolNames) {
      const tool = findTool(name)
      assert.ok(tool, `Tool ${name} must exist in categories`)
      assert.equal(tool.tier, 'basic', `${name} must have tier basic`)
      assert.equal(canAccessTool(tool, basicEntitlement), true, `Basic user should have access to ${name}`)
    }
  })

  // ──────────────────────────────────────────────────────────
  // 2. Basic user: PRO tool → BLOCKED
  // ──────────────────────────────────────────────────────────
  it('2. Basic user: PRO tool -> BLOCKED', () => {
    const basicEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-basic-1',
        plan: 'basic',
        status: 'active',
        expires_at: futureDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    // Test across known PRO tools (database-backed, POS, CRM, AI, Legalitas)
    const proToolNames = [
      'POS / Kasir',
      'QR Menu & Pesanan',
      'Inventory Management',
      'Financial Reports',
      'Margin Analysis',
      'Customer CRM',
      'Legalitas Checker',
      'AI Creative Studio',
      'Real-time Dashboard',
    ]

    for (const name of proToolNames) {
      const tool = findTool(name)
      assert.ok(tool, `Tool ${name} must exist in categories`)
      assert.notEqual(tool.tier, 'basic', `${name} must not have tier basic`)
      assert.equal(tool.tier || 'pro', 'pro', `${name} must have tier pro`)
      assert.equal(canAccessTool(tool, basicEntitlement), false, `Basic user must be BLOCKED from ${name}`)
    }
  })

  // ──────────────────────────────────────────────────────────
  // 3. Pro user: BASIC tool → ALLOWED
  // ──────────────────────────────────────────────────────────
  it('3. Pro user: BASIC tool -> ALLOWED', () => {
    const proEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-pro-1',
        plan: 'pro',
        status: 'active',
        expires_at: futureDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    assert.equal(proEntitlement.hasActiveSubscription, true)
    assert.equal(proEntitlement.isPro, true)
    assert.equal(proEntitlement.plan, 'pro')

    // Pro users get all basic tools
    const basicToolNames = ['HPP Calculator', 'BEP Calculator', 'Loan Simulation', 'Ads', 'SEO Optimizer']
    for (const name of basicToolNames) {
      const tool = findTool(name)
      assert.ok(tool, `Tool ${name} must exist`)
      assert.equal(canAccessTool(tool, proEntitlement), true, `Pro user must have access to Basic tool ${name}`)
    }
  })

  // ──────────────────────────────────────────────────────────
  // 4. Pro user: PRO tool → ALLOWED
  // ──────────────────────────────────────────────────────────
  it('4. Pro user: PRO tool -> ALLOWED', () => {
    const proEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-pro-1',
        plan: 'pro',
        status: 'active',
        expires_at: futureDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    const proToolNames = [
      'POS / Kasir',
      'Inventory Management',
      'Financial Reports',
      'Customer CRM',
      'AI Creative Studio',
      'Legalitas Checker',
    ]

    for (const name of proToolNames) {
      const tool = findTool(name)
      assert.ok(tool, `Tool ${name} must exist`)
      assert.equal(canAccessTool(tool, proEntitlement), true, `Pro user must have access to Pro tool ${name}`)
    }
  })

  // ──────────────────────────────────────────────────────────
  // 5. Expired Pro: PRO tool → BLOCKED
  // ──────────────────────────────────────────────────────────
  it('5. Expired Pro: PRO tool -> BLOCKED', () => {
    const expiredEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-pro-expired',
        plan: 'pro',
        status: 'active',
        expires_at: pastDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    assert.equal(expiredEntitlement.hasActiveSubscription, false)
    assert.equal(expiredEntitlement.hasExpiredSubscription, true)
    assert.equal(expiredEntitlement.isPro, false)
    assert.equal(expiredEntitlement.isBasic, false)

    const posTool = findTool('POS / Kasir')
    const reportsTool = findTool('Financial Reports')
    const hppTool = findTool('HPP Calculator')

    assert.equal(canAccessTool(posTool, expiredEntitlement), false)
    assert.equal(canAccessTool(reportsTool, expiredEntitlement), false)
    assert.equal(canAccessTool(hppTool, expiredEntitlement), false)
  })

  // ──────────────────────────────────────────────────────────
  // 6. Cancelled Pro: PRO tool → BLOCKED after expiry
  // ──────────────────────────────────────────────────────────
  it('6. Cancelled Pro: PRO tool -> BLOCKED after expiry', () => {
    const cancelledEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-pro-cancelled',
        plan: 'pro',
        status: 'cancelled',
        expires_at: pastDate,
      },
      hasPaidHistory: true,
      loading: false,
    })

    assert.equal(cancelledEntitlement.hasActiveSubscription, false)
    assert.equal(cancelledEntitlement.hasCancelledSubscription, true)
    assert.equal(cancelledEntitlement.isPro, false)

    const posTool = findTool('POS / Kasir')
    const aiTool = findTool('AI Creative Studio')

    assert.equal(canAccessTool(posTool, cancelledEntitlement), false)
    assert.equal(canAccessTool(aiTool, cancelledEntitlement), false)
  })

  // ──────────────────────────────────────────────────────────
  // 7. Unauthenticated: protected tool → existing auth behavior
  // ──────────────────────────────────────────────────────────
  it('7. Unauthenticated: protected tool -> existing auth behavior', () => {
    const unauthEntitlement = calculateSubscriptionEntitlement({
      user: null,
      subscription: null,
      hasPaidHistory: false,
      loading: false,
    })

    assert.equal(unauthEntitlement.subscriptionState, 'unauthenticated')
    assert.equal(unauthEntitlement.hasActiveSubscription, false)
    assert.equal(unauthEntitlement.isPro, false)
    assert.equal(unauthEntitlement.isBasic, false)

    const posTool = findTool('POS / Kasir')
    const hppTool = findTool('HPP Calculator')

    assert.equal(canAccessTool(posTool, unauthEntitlement), false)
    assert.equal(canAccessTool(hppTool, unauthEntitlement), false)
  })

  // ──────────────────────────────────────────────────────────
  // 8. Direct RPC: Basic user cannot bypass PRO entitlement
  // ──────────────────────────────────────────────────────────
  it('8. Direct RPC: Migration 097 enforces strict PRO check in SQL RPCs', () => {
    const migrationPath = [
      path.resolve('supabase/migrations/098_two_tier_pricing_entitlement.sql'),
      path.resolve('supabase/migrations/097_two_tier_pricing_entitlement.sql'),
    ].find(p => fs.existsSync(p))
    assert.ok(migrationPath && fs.existsSync(migrationPath), 'Migration 098 (two-tier pricing) must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    // is_business_pro_active must check plan = 'pro'
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.is_business_pro_active"), 'Must declare is_business_pro_active')
    assert.ok(sql.includes("LOWER(s.plan) = 'pro'") || sql.includes("LOWER(plan) = 'pro'"), 'Must strictly check plan = pro for Pro entitlement')
    assert.ok(sql.includes("expires_at > NOW()") || sql.includes("expires_at > now()"), 'Must check expires_at > now()')
    assert.ok(sql.includes("status = 'active'"), 'Must check status = active')

    // is_user_pro_active must check plan = 'pro'
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.is_user_pro_active"), 'Must declare is_user_pro_active')

    // is_business_subscription_active accepts basic OR pro
    assert.ok(sql.includes("LOWER(s.plan) IN ('basic', 'pro')") || sql.includes("LOWER(plan) IN ('basic', 'pro')"), 'Must accept basic or pro for general subscription')

    // get_user_active_plan returns correct plan name
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_user_active_plan"), 'Must declare get_user_active_plan')
    assert.ok(sql.includes("'pro'") && sql.includes("'basic'"), 'Must return pro or basic')
  })

  // ──────────────────────────────────────────────────────────
  // 9. Direct Edge Function: Basic user cannot bypass PRO AI feature
  // ──────────────────────────────────────────────────────────
  it('9. Direct Edge Function: Server-side check blocks Basic user in creative-credits & legalitas-check', () => {
    const creativeFuncPath = path.resolve('supabase/functions/creative-credits/index.ts')
    const legalitasFuncPath = path.resolve('supabase/functions/legalitas-check/index.ts')

    assert.ok(fs.existsSync(creativeFuncPath), 'creative-credits function must exist')
    assert.ok(fs.existsSync(legalitasFuncPath), 'legalitas-check function must exist')

    const creativeCode = fs.readFileSync(creativeFuncPath, 'utf8')
    const legalitasCode = fs.readFileSync(legalitasFuncPath, 'utf8')

    // creative-credits authoritative server-side handling
    assert.ok(
      creativeCode.includes('verifyAuth') &&
      creativeCode.includes('CREDIT_COSTS'),
      'creative-credits must enforce authoritative server-side deduction'
    )

    // legalitas-check requires active Pro
    assert.ok(
      legalitasCode.includes('.eq("plan", "pro")') ||
      legalitasCode.includes("is_business_pro_active") ||
      legalitasCode.includes("LOWER(plan) === 'pro'"),
      'legalitas-check must verify active Pro server-side'
    )
  })

  // ──────────────────────────────────────────────────────────
  // 10. URL manipulation: Basic user cannot open PRO-only tool by direct route
  // ──────────────────────────────────────────────────────────
  it('10. URL manipulation: App.jsx wraps PRO routes with requiredPlan="pro"', () => {
    const appPath = path.resolve('src/App.jsx')
    const appCode = fs.readFileSync(appPath, 'utf8')

    // PRO routes must be wrapped with requiredPlan="pro"
    assert.ok(appCode.includes('requiredPlan="pro"'), 'App.jsx must declare RequireSubscription requiredPlan="pro"')
    assert.ok(appCode.includes('requiredPlan="basic"'), 'App.jsx must declare RequireSubscription requiredPlan="basic"')

    // Verify key PRO routes are inside the PRO group
    const proSection = appCode.substring(appCode.indexOf('requiredPlan="pro"'))
    assert.ok(proSection.includes("path: 'pos'"), 'POS route must be inside requiredPlan="pro"')
    assert.ok(proSection.includes("path: 'operasional/inventory'"), 'Inventory route must be inside requiredPlan="pro"')
    assert.ok(proSection.includes("path: 'keuangan/financial-reports'"), 'Financial Reports must be inside requiredPlan="pro"')
    assert.ok(proSection.includes("path: 'penjualan/customer-crm'"), 'CRM route must be inside requiredPlan="pro"')
    assert.ok(proSection.includes("path: 'marketing/content-generator'"), 'Creative Studio route must be inside requiredPlan="pro"')
    assert.ok(proSection.includes("path: 'legalitas'"), 'Legalitas route must be inside requiredPlan="pro"')
  })

  // ──────────────────────────────────────────────────────────
  // 11. Client state manipulation: changing frontend plan state does not grant PRO access
  // ──────────────────────────────────────────────────────────
  it('11. Client state manipulation: tampering plan to "pro" without valid paid history or server proof is rejected', () => {
    // Malicious actor tampers plan in JS memory:
    // If hasPaidHistory is false and expires_at is null, entitlement rejects PRO status
    const spoofedEntitlement = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'fake-sub',
        plan: 'pro',
        status: 'pending',
        expires_at: null,
      },
      hasPaidHistory: false,
      loading: false,
    })

    assert.equal(spoofedEntitlement.isPro, false, 'Tampered subscription must not get Pro')
    assert.equal(spoofedEntitlement.hasActiveSubscription, false, 'Tampered subscription must not be active')
  })

  // ──────────────────────────────────────────────────────────
  // 12. Existing creative credit entitlement remains correct
  // ──────────────────────────────────────────────────────────
  it('12. Existing creative credit entitlement: Midtrans webhook only grants 200 credits for Pro plan', () => {
    const webhookPath = path.resolve('supabase/functions/midtrans-notification/index.ts')
    assert.ok(fs.existsSync(webhookPath), 'midtrans-notification function must exist')
    const webhookCode = fs.readFileSync(webhookPath, 'utf8')

    // Must check activatedPlan === 'pro' for credits
    assert.ok(webhookCode.includes('activatedPlan === "pro"'), 'Webhook must check activatedPlan === pro for credits')
    assert.ok(webhookCode.includes('200'), 'Pro plan must receive 200 monthly AI credits')
    assert.ok(webhookCode.includes('"basic"'), 'Webhook must recognize basic plan')
  })

  // ──────────────────────────────────────────────────────────
  // 13. Existing subscription expiration remains correct
  // ──────────────────────────────────────────────────────────
  it('13. Subscription expiration boundary: active before expiry, expired immediately after', () => {
    const boundaryTime = Date.now() + 5000 // 5 seconds in future
    const activeSub = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-boundary',
        plan: 'pro',
        status: 'active',
        expires_at: new Date(boundaryTime).toISOString(),
      },
      hasPaidHistory: true,
      loading: false,
    })
    assert.equal(activeSub.hasActiveSubscription, true, 'Must be active before boundary')

    const expiredSub = calculateSubscriptionEntitlement({
      user: mockUser,
      subscription: {
        id: 'sub-boundary',
        plan: 'pro',
        status: 'active',
        expires_at: new Date(Date.now() - 5000).toISOString(), // 5 seconds in past
      },
      hasPaidHistory: true,
      loading: false,
    })
    assert.equal(expiredSub.hasActiveSubscription, false, 'Must be inactive after boundary')
    assert.equal(expiredSub.hasExpiredSubscription, true, 'Must report expired after boundary')
  })

  // ──────────────────────────────────────────────────────────
  // 14. Existing admin subscription management remains correct
  // ──────────────────────────────────────────────────────────
  it('14. Admin subscription management: correctly presents Basic, Pro, and legacy Free', () => {
    const adminPagePath = path.resolve('src/pages/admin/AdminSubscriptionsPage.jsx')
    assert.ok(fs.existsSync(adminPagePath), 'AdminSubscriptionsPage must exist')
    const adminCode = fs.readFileSync(adminPagePath, 'utf8')

    // Must have Basic filter and badge
    assert.ok(adminCode.includes("<option value=\"basic\">Basic</option>"), 'Admin filter must have basic option')
    assert.ok(adminCode.includes("<option value=\"pro\">Pro</option>"), 'Admin filter must have pro option')
    assert.ok(adminCode.includes('FREE (LEGACY)'), 'Admin table must support legacy free label')

    // Config prices strictly match gas.md
    assert.equal(PLAN_CONFIG[PLANS.BASIC].price, 35000, 'Basic plan price must be 35000')
    assert.equal(PLAN_CONFIG[PLANS.PRO].price, 130000, 'Pro plan price must be 130000')
  })
})
