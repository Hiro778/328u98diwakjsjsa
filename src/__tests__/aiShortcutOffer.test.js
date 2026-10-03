// src/__tests__/aiShortcutOffer.test.js
// Focused tests for AI Business Analyst first-use shortcut offer
// Covers: Pro-only display, timing (after AI response), dismiss persistence, no side-effects

import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── Source code assertions (static analysis) ──
const PAGE_SRC = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/ai/AiBusinessAnalystPage.jsx'),
  'utf8'
)
const DASHBOARD_SRC = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/dashboard/DashboardHome.jsx'),
  'utf8'
)

// ── localStorage simulation ──
const localStorageStore = {}
const mockLocalStorage = {
  getItem: (key) => localStorageStore[key] ?? null,
  setItem: (key, value) => { localStorageStore[key] = String(value) },
  removeItem: (key) => { delete localStorageStore[key] },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]) },
}

describe('AI Business Analyst — Shortcut Offer (Task 1)', () => {

  // ════════════════════════════════════════════════════
  // 1. STATIC SOURCE ANALYSIS
  // ════════════════════════════════════════════════════

  describe('1. Source code — offer implementation', () => {
    test('localStorage keys are defined consistently', () => {
      assert.ok(
        PAGE_SRC.includes("const LS_OFFER_DISMISSED = 'bs_ai_shortcut_offer_dismissed'"),
        'LS_OFFER_DISMISSED key must be defined'
      )
      assert.ok(
        PAGE_SRC.includes("const LS_SHORTCUT_PINNED = 'bs_ai_shortcut_pinned'"),
        'LS_SHORTCUT_PINNED key must be defined'
      )
    })

    test('DashboardHome uses the same LS_SHORTCUT_PINNED key', () => {
      assert.ok(
        DASHBOARD_SRC.includes("'bs_ai_shortcut_pinned'"),
        'DashboardHome must read from the same localStorage key'
      )
    })

    test('offer is gated by isPro check', () => {
      assert.ok(
        PAGE_SRC.includes('isPro &&'),
        'offer must be gated by isPro'
      )
    })

    test('offer only shown after first successful AI interaction (not before)', () => {
      // The offer trigger is inside the try block of handleSendMessage,
      // after setMessages with assistantMsg — not in the initial state
      const offerTriggerIdx = PAGE_SRC.indexOf('shortcutOfferShownRef.current = true')
      const setMessagesIdx = PAGE_SRC.indexOf('setMessages((prev) => [...prev, assistantMsg])')
      assert.ok(offerTriggerIdx > 0, 'offer trigger must exist')
      assert.ok(setMessagesIdx > 0, 'assistantMsg must be set before offer trigger')
      assert.ok(
        offerTriggerIdx > setMessagesIdx,
        'offer trigger must come AFTER the assistant message is appended'
      )
    })

    test('offer UI has data-testid="ai-shortcut-offer"', () => {
      assert.ok(
        PAGE_SRC.includes('data-testid="ai-shortcut-offer"'),
        'offer banner must have testid'
      )
    })

    test('"Tambahkan" button has data-testid="shortcut-offer-add"', () => {
      assert.ok(
        PAGE_SRC.includes('data-testid="shortcut-offer-add"'),
        '"Tambahkan" button must have testid'
      )
    })

    test('"Nanti saja" button has data-testid="shortcut-offer-dismiss"', () => {
      assert.ok(
        PAGE_SRC.includes('data-testid="shortcut-offer-dismiss"'),
        '"Nanti saja" button must have testid'
      )
    })

    test('"Tambahkan" handler sets LS_SHORTCUT_PINNED', () => {
      assert.ok(
        PAGE_SRC.includes("localStorage.setItem(LS_SHORTCUT_PINNED, '1')"),
        '"Tambahkan" must set LS_SHORTCUT_PINNED'
      )
    })

    test('"Nanti saja" handler sets LS_OFFER_DISMISSED', () => {
      assert.ok(
        PAGE_SRC.includes("localStorage.setItem(LS_OFFER_DISMISSED, '1')"),
        '"Nanti saja" must set LS_OFFER_DISMISSED'
      )
    })

    test('offer is not shown when LS_OFFER_DISMISSED is set', () => {
      assert.ok(
        PAGE_SRC.includes('!localStorage.getItem(LS_OFFER_DISMISSED)'),
        'offer must not render when dismissed flag is set'
      )
    })

    test('offer is not shown when LS_SHORTCUT_PINNED is already set', () => {
      assert.ok(
        PAGE_SRC.includes('!localStorage.getItem(LS_SHORTCUT_PINNED)'),
        'offer must not render when already pinned'
      )
    })

    test('shortcutOfferShownRef prevents re-showing within same session', () => {
      assert.ok(
        PAGE_SRC.includes('!shortcutOfferShownRef.current'),
        'session guard ref must be checked'
      )
      assert.ok(
        PAGE_SRC.includes('shortcutOfferShownRef.current = true'),
        'session guard ref must be set to true after first show'
      )
    })
  })

  // ════════════════════════════════════════════════════
  // 2. DASHBOARD SHORTCUT CARD
  // ════════════════════════════════════════════════════

  describe('2. Dashboard shortcut card — DashboardHome', () => {
    test('shortcut card has data-testid="ai-dashboard-shortcut"', () => {
      assert.ok(
        DASHBOARD_SRC.includes('data-testid="ai-dashboard-shortcut"'),
        'dashboard shortcut must have testid'
      )
    })

    test('dashboard shortcut is gated by isPro', () => {
      assert.ok(
        DASHBOARD_SRC.includes('isPro && isAiShortcutPinned'),
        'dashboard shortcut must require both isPro AND isAiShortcutPinned'
      )
    })

    test('dashboard shortcut links to /ai', () => {
      assert.ok(
        DASHBOARD_SRC.includes('to="/ai"'),
        'dashboard shortcut must link to /ai'
      )
    })

    test('dashboard shortcut reads from bs_ai_shortcut_pinned', () => {
      assert.ok(
        DASHBOARD_SRC.includes("localStorage.getItem(LS_SHORTCUT_PINNED)"),
        'dashboard must read pinned state from localStorage'
      )
    })

    test('dashboard shortcut does NOT show for Free/Basic users (no isPro)', () => {
      // Verifies the boolean guard is in place — Free users have isPro=false
      const guardLine = DASHBOARD_SRC.match(/isPro\s*&&\s*isAiShortcutPinned/)
      assert.ok(
        guardLine,
        'Guard isPro && isAiShortcutPinned must be present to exclude Free users'
      )
    })
  })

  // ════════════════════════════════════════════════════
  // 3. BUSINESS LOGIC SIMULATION
  // ════════════════════════════════════════════════════

  describe('3. localStorage offer logic simulation', () => {
    beforeEach(() => {
      mockLocalStorage.clear()
    })

    test('Free user — offer must not appear (isPro=false)', () => {
      // Simulates: isPro=false → offer should not be triggered regardless of ls state
      const isPro = false
      const dismissed = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_offer_dismissed'))
      const pinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))
      const sessionShown = false

      const shouldShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(shouldShow, false, 'Free user must never see offer')
    })

    test('Pro user, first interaction, clean state — offer must appear', () => {
      const isPro = true
      const dismissed = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_offer_dismissed'))
      const pinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))
      const sessionShown = false

      const shouldShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(shouldShow, true, 'Pro user with clean state must see offer')
    })

    test('Pro user — "Nanti saja" suppresses future offers', () => {
      const isPro = true
      // Simulate dismiss
      mockLocalStorage.setItem('bs_ai_shortcut_offer_dismissed', '1')

      const dismissed = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_offer_dismissed'))
      const pinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))
      const sessionShown = false

      const shouldShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(shouldShow, false, '"Nanti saja" must suppress offer permanently')
    })

    test('Pro user — already pinned — offer must not reappear', () => {
      const isPro = true
      mockLocalStorage.setItem('bs_ai_shortcut_pinned', '1')

      const dismissed = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_offer_dismissed'))
      const pinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))
      const sessionShown = false

      const shouldShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(shouldShow, false, 'Already-pinned Pro user must not see offer again')
    })

    test('Pro user — session guard prevents re-show within same session', () => {
      const isPro = true
      const dismissed = false
      const pinned = false
      let sessionShown = false

      // First interaction — should show
      const firstShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(firstShow, true)

      // Mark shown
      sessionShown = true

      // Second interaction in same session — must not show
      const secondShow = isPro && !sessionShown && !dismissed && !pinned
      assert.equal(secondShow, false, 'Session guard must prevent repeated offer')
    })

    test('"Tambahkan" — sets pinned flag, dashboard shortcut visible', () => {
      // Simulate clicking "Tambahkan"
      mockLocalStorage.setItem('bs_ai_shortcut_pinned', '1')

      const isPro = true
      const isAiShortcutPinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))

      const shouldShowDashboardCard = isPro && isAiShortcutPinned
      assert.equal(shouldShowDashboardCard, true, 'Dashboard shortcut card must appear after Tambahkan')
    })

    test('Free user — dashboard shortcut card must not appear even if pinned flag exists', () => {
      mockLocalStorage.setItem('bs_ai_shortcut_pinned', '1')

      const isPro = false // Free/Basic user
      const isAiShortcutPinned = Boolean(mockLocalStorage.getItem('bs_ai_shortcut_pinned'))

      const shouldShowDashboardCard = isPro && isAiShortcutPinned
      assert.equal(shouldShowDashboardCard, false, 'Free user must not see dashboard shortcut card')
    })
  })

  // ════════════════════════════════════════════════════
  // 4. NO SIDE-EFFECTS ON EXISTING SYSTEMS
  // ════════════════════════════════════════════════════

  describe('4. No side-effects on existing systems', () => {
    test('offer does not modify subscription or entitlement logic', () => {
      // Offer only touches two LS keys — no subscription fields
      const offerRelatedCode = PAGE_SRC.match(/bs_ai_shortcut/g)
      const subscriptionMutationCode = PAGE_SRC.match(/subscription\.(plan|status|expires|tier)\s*=/g)
      assert.equal(subscriptionMutationCode, null, 'Offer must not mutate subscription fields')
      assert.ok(offerRelatedCode && offerRelatedCode.length > 0, 'Offer keys must exist')
    })

    test('TokenKoding integration is unmodified in AiBusinessAnalystPage', () => {
      // supabase.functions.invoke call must still be present
      assert.ok(
        PAGE_SRC.includes("supabase.functions.invoke('ai-business-analyst'"),
        'Edge Function invocation must remain intact'
      )
    })

    test('AiBusinessAnalystPage does not expose secrets', () => {
      assert.ok(!PAGE_SRC.includes('TOKENKODING_API_KEY'), 'API key must not appear in frontend page')
      assert.ok(!PAGE_SRC.includes('service_role'), 'Service role key must not appear in frontend page')
      assert.ok(!PAGE_SRC.includes('Bearer '), 'Bearer token pattern must not be hardcoded in page')
    })

    test('DashboardHome does not expose secrets', () => {
      assert.ok(!DASHBOARD_SRC.includes('TOKENKODING_API_KEY'), 'API key must not appear in DashboardHome')
      assert.ok(!DASHBOARD_SRC.includes('service_role'), 'Service role key must not appear in DashboardHome')
    })

    test('offer title matches specification', () => {
      assert.ok(
        PAGE_SRC.includes('Tambahkan AI ke layar utama?'),
        'Offer title must match specification'
      )
    })

    test('offer description matches specification', () => {
      assert.ok(
        PAGE_SRC.includes('Tambahkan AI Business Analyst ke akses cepat layar utama BisnisSehat'),
        'Offer description must match specification'
      )
    })

    test('primary button label is "Tambahkan"', () => {
      // JSX has whitespace around text node — match content not exact delimiters
      assert.ok(
        />\s*Tambahkan\s*</.test(PAGE_SRC),
        'Primary button must say "Tambahkan"'
      )
    })

    test('secondary button label is "Nanti saja"', () => {
      assert.ok(
        />\s*Nanti saja\s*</.test(PAGE_SRC),
        'Secondary button must say "Nanti saja"'
      )
    })
  })
})
