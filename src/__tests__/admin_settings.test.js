import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

import {
  getSettings,
  getSetting,
  updateSetting,
  updateSettings,
  validateSettingInput,
  sanitizeSettingRow,
  normalizeSettingsError,
  ALLOWED_SETTING_KEYS,
} from '../services/adminSettingsService.js'

describe('Tahap 10: Admin Settings Security & Integrity Testing (@10.md)', () => {
  const migration081Path = path.resolve('supabase/migrations/081_admin_settings_management.sql')
  const migration081Sql = fs.readFileSync(migration081Path, 'utf8')

  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const settingsPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminSettingsPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminSettingsService.js'), 'utf8')

  // 1. /admin/settings protected by RequireAdmin
  it('1. ROUTE GUARD: /admin/settings protected by RequireAdmin and nested in AdminLayout', () => {
    assert.ok(appCode.includes("path: 'settings', element: <AdminSettingsPage />"), 'Settings route must mount AdminSettingsPage')
    assert.ok(appCode.includes('element: <RequireAdmin />'), 'Admin routes must be protected by RequireAdmin')
    assert.ok(appCode.includes('element: <AdminLayout />'), 'Admin routes must be nested inside AdminLayout')
  })

  // 2. non-admin cannot read settings (RLS policy & RPC check)
  it('2. ACCESS CONTROL: Non-admin users cannot read platform settings in RLS and RPC', () => {
    assert.ok(migration081Sql.includes('CREATE POLICY "Admins can view platform settings"'), 'Must have RLS select policy for admins')
    assert.ok(migration081Sql.includes('USING (public.is_admin())'), 'RLS select must verify public.is_admin()')
    assert.ok(migration081Sql.includes("IF NOT (\n    public.is_admin()"), 'RPC get_admin_settings must verify public.is_admin()')
  })

  // 3. anonymous cannot read settings
  it('3. ZERO TRUST: Anonymous client denied reading platform_settings and calling RPC', () => {
    assert.ok(migration081Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_settings() FROM PUBLIC, anon;'), 'Must revoke execute from anon')
    assert.ok(migration081Sql.includes('TO authenticated, service_role;'), 'Must grant execute only to authenticated and service_role')
  })

  // 4. non-admin cannot mutate settings
  it('4. MUTATION RESTRICTION: Non-admin users cannot mutate platform settings', () => {
    assert.ok(migration081Sql.includes('CREATE POLICY "Admins can update platform settings"'), 'Must have update RLS policy')
    assert.ok(migration081Sql.includes('WITH CHECK (public.is_admin())'), 'RLS update must enforce public.is_admin()')
    assert.ok(migration081Sql.includes("IF NOT public.is_admin() THEN"), 'RPC update_admin_setting must check public.is_admin()')
  })

  // 5. admin can read settings
  it('5. ADMIN ACCESS: Admin is granted SELECT on platform_settings and get_admin_settings RPC', () => {
    assert.ok(migration081Sql.includes('public.is_admin()'), 'Admins have access via public.is_admin() helper')
    assert.ok(migration081Sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_settings()'), 'Admins have execute grant')
  })

  // 6. authorized admin can mutate allowed settings
  it('6. ADMIN MUTATION: Authorized admin can update allowed setting keys', () => {
    assert.ok(migration081Sql.includes('CREATE OR REPLACE FUNCTION public.update_admin_setting'), 'update_admin_setting RPC exists')
    assert.ok(ALLOWED_SETTING_KEYS.includes('platform_name'), 'platform_name is allowed')
    assert.ok(ALLOWED_SETTING_KEYS.includes('maintenance_mode'), 'maintenance_mode is allowed')
    assert.ok(ALLOWED_SETTING_KEYS.includes('support_email'), 'support_email is allowed')
    assert.ok(ALLOWED_SETTING_KEYS.includes('enable_user_registration'), 'enable_user_registration is allowed')
  })

  // 7. invalid setting key rejected
  it('7. WHITELIST ENFORCEMENT: Invalid setting key is rejected on client and database', () => {
    assert.throws(
      () => validateSettingInput('invalid_random_key', 'some_value'),
      /tidak diizinkan atau tidak terdaftar/,
      'Client validation must reject non-whitelisted keys'
    )
    assert.ok(migration081Sql.includes('INVALID_SETTING_KEY'), 'Database RPC must reject non-whitelisted keys')
  })

  // 8. invalid value rejected
  it('8. TYPE INTEGRITY: Invalid setting values are rejected', () => {
    assert.throws(
      () => validateSettingInput('maintenance_mode', 'not-a-boolean'),
      /harus bertipe boolean/,
      'maintenance_mode must be boolean'
    )
    assert.throws(
      () => validateSettingInput('support_email', 'not-an-email'),
      /Format email customer support tidak valid/,
      'support_email must have valid email format'
    )
    assert.throws(
      () => validateSettingInput('pos_max_items_per_order', -5),
      /harus berupa angka positif/,
      'pos_max_items_per_order must be a positive number'
    )
    assert.ok(migration081Sql.includes('INVALID_SETTING_VALUE'), 'Database RPC enforces typed constraints')
  })

  // 9. secret-like setting rejected / not exposed
  it('9. ZERO SECRETS: Secret keys (tokens, passwords, api keys) strictly rejected and never exposed', () => {
    assert.throws(
      () => validateSettingInput('gemini_api_key', 'secret-val'),
      /rahasia tidak boleh dimodifikasi/,
      'Secret-like keys must be blocked on client'
    )
    assert.ok(migration081Sql.includes('FORBIDDEN_SETTING'), 'Database RPC must block secret-like keys')

    const sanitizedRow = sanitizeSettingRow({ key: 'jwt_secret_token', value: 'secret' })
    assert.equal(sanitizedRow, null, 'Secret-like rows must be dropped during sanitization')

    const validRow = sanitizeSettingRow({ key: 'platform_name', value: 'BisnisSehat' })
    assert.deepEqual(validRow, { key: 'platform_name', value: 'BisnisSehat' }, 'Safe settings must pass sanitization')
  })

  // 10. IDOR protection
  it('10. IDOR PROTECTION: Settings are platform-wide singleton keys, impossible to mutate foreign tenant data', () => {
    assert.ok(migration081Sql.includes('key text NOT NULL UNIQUE'), 'Settings table uses unique global keys')
    assert.ok(migration081Sql.includes('WHERE key = p_key'), 'Updates occur strictly by key lookup in platform_settings')
  })

  // 11. audit log generated after mutation
  it('11. AUDIT INTEGRATION: Every mutation creates an entry in public.admin_audit_logs', () => {
    assert.ok(migration081Sql.includes('INSERT INTO public.admin_audit_logs'), 'RPC must write to admin_audit_logs')
    assert.ok(migration081Sql.includes('SETTINGS_UPDATED'), 'Generates SETTINGS_UPDATED action')
    assert.ok(migration081Sql.includes('FEATURE_FLAG_CHANGED'), 'Generates FEATURE_FLAG_CHANGED action')
    assert.ok(migration081Sql.includes('MAINTENANCE_MODE_CHANGED'), 'Generates MAINTENANCE_MODE_CHANGED action')
  })

  // 12. audit metadata contains no secrets
  it('12. AUDIT SAFETY: Audit metadata contains only key, old_value, new_value, category (no secrets)', () => {
    assert.ok(
      migration081Sql.includes("jsonb_build_object(\n        'key', p_key,\n        'old_value', v_old_setting.value,\n        'new_value', p_value,\n        'category', v_updated_setting.category\n      )"),
      'Audit metadata strictly structured without credentials or secrets'
    )
  })

  // 13. Settings navigation enabled
  it('13. NAVIGATION: Settings link in AdminLayout is now enabled (ACTIVE)', () => {
    assert.match(
      layoutCode,
      /name:\s*'Settings',\s*path:\s*'\/admin\/settings',\s*enabled:\s*true/s,
      'Settings nav item must be enabled: true'
    )
  })

  // 14. Stage 1–9 routes remain intact
  it('14. STAGE 1–9 INTEGRITY: All previous Admin routes remain intact and protected', () => {
    assert.ok(appCode.includes("path: 'users', element: <AdminUsersPage />"), 'Stage 3 Users intact')
    assert.ok(appCode.includes("path: 'businesses', element: <AdminBusinessesPage />"), 'Stage 4 Businesses intact')
    assert.ok(appCode.includes("path: 'subscriptions', element: <AdminSubscriptionsPage />"), 'Stage 5 Subscriptions intact')
    assert.ok(appCode.includes("path: 'ai-usage', element: <AdminAIUsagePage />"), 'Stage 6 AI Usage intact')
    assert.ok(appCode.includes("path: 'support', element: <AdminSupportPage />"), 'Stage 7 Support intact')
    assert.ok(appCode.includes("path: 'payments', element: <AdminPaymentsPage />"), 'Stage 8 Payments intact')
    assert.ok(appCode.includes("path: 'audit-logs', element: <AdminAuditLogsPage />"), 'Stage 9 Audit Logs intact')
  })

  // 15. Settings does not mutate subscriptions/payments/users/businesses
  it('15. DOMAIN ISOLATION: Settings service and migration exclusively touch platform_settings', () => {
    assert.ok(!migration081Sql.includes('UPDATE public.users'), 'Never updates users')
    assert.ok(!migration081Sql.includes('UPDATE public.subscriptions'), 'Never updates subscriptions')
    assert.ok(!migration081Sql.includes('UPDATE public.subscription_payments'), 'Never updates payments')
    assert.ok(!migration081Sql.includes('UPDATE public.businesses'), 'Never updates businesses')
  })

  // 16. UI and Error Normalization
  it('16. UX & ERROR HANDLING: UI provides confirmation modal, loading, and safe error normalization', () => {
    assert.ok(settingsPageCode.includes('confirmModal'), 'UI includes confirmation modal for high-impact actions')
    assert.ok(settingsPageCode.includes('unsavedKeys'), 'UI tracks unsaved changes')
    assert.ok(settingsPageCode.includes('activeTab'), 'UI categorizes settings into tabs')

    const normAuth = normalizeSettingsError(new Error('42501 Akses ditolak'))
    assert.ok(normAuth.message.includes('Akses ditolak'), 'Normalizes 42501 permission error')

    const normKey = normalizeSettingsError(new Error('INVALID_SETTING_KEY'))
    assert.ok(normKey.message.includes('tidak valid atau tidak terdaftar'), 'Normalizes invalid setting key error')
  })
})
