// src/__tests__/ban_settings_runtime.test.js
// Regression tests for @ban.md — Admin Settings Runtime Enforcement
// Tests items that were NOT previously covered in admin_settings.test.js:
//   - enable_ai_features edge function enforcement (item 6)
//   - platform_settings enforcement in shared utility (platform-settings.ts)
//   - Direct code audit: AI Edge Functions must import enforceAiFeatureFlag

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

// ─── File paths ───────────────────────────────────────────────────────────────
const SHARED_PLATFORM_SETTINGS_PATH = path.resolve(
  'supabase/functions/_shared/platform-settings.ts'
)
const AI_FUNCTIONS = [
  'supabase/functions/competitor-analyze/index.ts',
  'supabase/functions/creative-generate-copy/index.ts',
  'supabase/functions/creative-generate-prd/index.ts',
  'supabase/functions/creative-revise-prd/index.ts',
]
const MIGRATION_084_PATH = path.resolve(
  'supabase/migrations/084_platform_settings_runtime_enforcement.sql'
)

const sharedPlatformSettings = fs.readFileSync(SHARED_PLATFORM_SETTINGS_PATH, 'utf8')
const migration084Sql = fs.readFileSync(MIGRATION_084_PATH, 'utf8')

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('@ban.md — Admin Settings Runtime Enforcement Regression Suite', () => {

  // ── Item 6: enable_ai_features ─────────────────────────────────────────────

  it('6a. AI_FLAG_SHARED_UTILITY: _shared/platform-settings.ts exists and exports enforceAiFeatureFlag', () => {
    assert.ok(
      fs.existsSync(SHARED_PLATFORM_SETTINGS_PATH),
      'platform-settings.ts must exist in _shared/'
    )
    assert.ok(
      sharedPlatformSettings.includes('export async function enforceAiFeatureFlag'),
      'Must export enforceAiFeatureFlag()'
    )
    assert.ok(
      sharedPlatformSettings.includes("'enable_ai_features'") ||
        sharedPlatformSettings.includes('"enable_ai_features"'),
      'Must query enable_ai_features key from platform_settings'
    )
    assert.ok(
      sharedPlatformSettings.includes('supabaseAdmin'),
      'Must use server-side supabaseAdmin client, not anon client'
    )
  })

  it('6b. AI_FLAG_RETURN_CONTRACT: enforceAiFeatureFlag returns null when enabled, string when disabled', () => {
    // Structural code analysis — checks the logic contract
    assert.ok(
      sharedPlatformSettings.includes('return null'),
      'Must return null when AI features are allowed'
    )
    assert.ok(
      sharedPlatformSettings.includes('AI_FEATURES_DISABLED'),
      'Must return AI_FEATURES_DISABLED error message when blocked'
    )
    assert.ok(
      !sharedPlatformSettings.includes('GEMINI_API_KEY'),
      'Shared utility must NOT expose GEMINI_API_KEY'
    )
  })

  for (const fnPath of AI_FUNCTIONS) {
    it(`6c. AI_FUNCTION_ENFORCEMENT [${path.basename(path.dirname(fnPath))}]: imports and enforces enable_ai_features before AI provider`, () => {
      const code = fs.readFileSync(path.resolve(fnPath), 'utf8')

      assert.ok(
        code.includes("from '../_shared/platform-settings.ts'") ||
          code.includes('from "../_shared/platform-settings.ts"'),
        `${fnPath} must import from _shared/platform-settings.ts`
      )

      assert.ok(
        code.includes('enforceAiFeatureFlag'),
        `${fnPath} must call enforceAiFeatureFlag()`
      )

      // Ensure the check happens BEFORE the Gemini API URL or API key usage
      const flagIdx = code.indexOf('enforceAiFeatureFlag')
      const geminiIdx = code.indexOf('generativelanguage.googleapis.com')
      const keyCallIdx = code.indexOf('GEMINI_API_KEY')

      assert.ok(
        flagIdx > -1,
        `${fnPath}: enforceAiFeatureFlag call must exist`
      )

      // The call to the Gemini API URL must come AFTER the flag enforcement
      if (geminiIdx > -1) {
        assert.ok(
          flagIdx < geminiIdx,
          `${fnPath}: enforceAiFeatureFlag must be called before Gemini API URL usage`
        )
      }
    })
  }

  it('6d. AI_FLAG_ADVERSARIAL: Utility must reject (return error string) when enable_ai_features value is boolean false', () => {
    // Logic analysis: if enabled === false → return string error
    assert.ok(
      sharedPlatformSettings.includes('enabled === false'),
      'Must explicitly check: enabled === false to reject'
    )
    assert.ok(
      sharedPlatformSettings.includes('503'),
      'Consumer must return HTTP 503 when AI features are disabled'
    )
  })

  // ── Items 1–5: QRIS, POS, maintenance, registration (verify migration 084) ─

  it('1. QRIS_SERVER_ENFORCEMENT: create_public_order rejects payment_method=qris when enable_qris_checkout=false', () => {
    assert.ok(
      migration084Sql.includes('QRIS_DISABLED'),
      'create_public_order must raise QRIS_DISABLED when flag is false'
    )
    assert.ok(
      migration084Sql.includes("key = 'enable_qris_checkout'"),
      'Must read enable_qris_checkout from platform_settings server-side'
    )
  })

  it('2. POS_SERVER_ENFORCEMENT: create_pos_order rejects when enable_pos_module=false', () => {
    assert.ok(
      migration084Sql.includes('POS_DISABLED'),
      'Must raise POS_DISABLED when enable_pos_module is false'
    )
    assert.ok(
      migration084Sql.includes("key = 'enable_pos_module'"),
      'Must read enable_pos_module from platform_settings'
    )
  })

  it('3. POS_MAX_ITEMS_SERVER_ENFORCEMENT: create_public_order validates pos_max_items_per_order', () => {
    assert.ok(
      migration084Sql.includes('pos_max_items_per_order'),
      'Must enforce pos_max_items_per_order on server-side'
    )
    assert.ok(
      migration084Sql.includes('v_total_qty > v_max_items'),
      'Must reject when total quantity exceeds configured max'
    )
  })

  it('4. MAINTENANCE_SERVER_ENFORCEMENT: maintenance_mode=true blocks anonymous/user create_public_order', () => {
    assert.ok(
      migration084Sql.includes('MAINTENANCE_MODE'),
      'Must raise MAINTENANCE_MODE exception when maintenance_mode=true'
    )
    assert.ok(
      migration084Sql.includes('NOT public.is_admin()'),
      'Must allow admins to bypass maintenance mode'
    )
  })

  it('5. REGISTRATION_SERVER_ENFORCEMENT: enable_user_registration=false blocks handle_new_user trigger', () => {
    assert.ok(
      migration084Sql.includes('REGISTRATION_DISABLED'),
      'handle_new_user trigger must raise REGISTRATION_DISABLED when flag is false'
    )
    assert.ok(
      migration084Sql.includes("key = 'enable_user_registration'"),
      'Must read enable_user_registration from platform_settings'
    )
  })

  it('7. TRIGGER_BYPASS_PROTECTION: Direct REST insert on orders is protected by trigger', () => {
    assert.ok(
      migration084Sql.includes('check_order_platform_settings_allowed'),
      'Must have a BEFORE INSERT trigger function on orders'
    )
    assert.ok(
      migration084Sql.includes('trg_enforce_order_platform_settings'),
      'Trigger must be named and attached to orders table'
    )
    assert.ok(
      migration084Sql.includes('BEFORE INSERT ON public.orders'),
      'Trigger must fire BEFORE INSERT on orders'
    )
  })

  it('9. PUBLIC_SETTINGS_RPC: get_public_platform_settings() exposes safe settings to anon client', () => {
    assert.ok(
      migration084Sql.includes('get_public_platform_settings'),
      'Must define get_public_platform_settings() RPC'
    )
    assert.ok(
      migration084Sql.includes("'enable_ai_features'"),
      'Must include enable_ai_features in public whitelist'
    )
    assert.ok(
      !migration084Sql.includes("'gemini_api_key'"),
      'Must NOT expose gemini_api_key to public clients'
    )
  })

  it('10. SECURITY_DEFINER_SEARCH_PATH: All enforcement functions use SECURITY DEFINER SET search_path', () => {
    const sds = (migration084Sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) || []).length
    assert.ok(sds >= 4, `At least 4 enforcement functions must use SECURITY DEFINER SET search_path = '' (found ${sds})`)
  })

})
