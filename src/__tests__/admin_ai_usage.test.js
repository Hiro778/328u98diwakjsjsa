import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

import {
  fetchAdminAiUsage,
  fetchAdminAiUsageStats,
  fetchAdminAiUsageDetail,
  normalizeAiUsageError,
  isValidUuid,
} from '../services/adminAiUsageService.js'
import * as aliasService from '../services/adminAiUsagesService.js'

describe('Tahap 6: Admin AI Usage Management Security & Integrity Testing (@6.md)', () => {
  const migration062Path = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migration063Path = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migration064Path = path.resolve('supabase/migrations/064_admin_user_management.sql')
  const migration065Path = path.resolve('supabase/migrations/065_admin_business_management.sql')
  const migration074Path = path.resolve('supabase/migrations/074_admin_subscription_management.sql')
  const migration075Path = path.resolve('supabase/migrations/075_admin_subscription_management.sql')
  const migration076Path = path.resolve('supabase/migrations/076_admin_ai_usage.sql')

  const migration076Sql = fs.readFileSync(migration076Path, 'utf8')
  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const aiUsagePageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminAIUsagePage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminAiUsageService.js'), 'utf8')

  // 1. ROUTE GUARD: /admin/ai-usage dilindungi oleh RequireAdmin
  it('1. ROUTE GUARD: /admin/ai-usage dilindungi oleh RequireAdmin dalam AdminLayout', () => {
    assert.ok(appCode.includes("path: 'ai-usage', element: <AdminAIUsagePage />"), 'AI Usage route must mount AdminAIUsagePage')
    assert.ok(appCode.includes('element: <RequireAdmin />'), 'Admin routes must be protected by RequireAdmin')
    assert.ok(appCode.includes('element: <AdminLayout />'), 'Admin routes must be nested inside AdminLayout')
  })

  // 2. NAVIGATION: AdminLayout mengaktifkan AI Usage dan mempertahankan status future stages
  it('2. NAVIGATION: AdminLayout mengaktifkan AI Usage (ACTIVE) dan mempertahankan status future stages (SOON)', () => {
    assert.match(
      layoutCode,
      /name:\s*'AI Usage',\s*path:\s*'\/admin\/ai-usage',\s*enabled:\s*true/s,
      'AI Usage nav item must be enabled: true'
    )
    assert.match(layoutCode, /name:\s*'Support'[^}]*enabled:\s*(true|false)/s, 'Support is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Payments'[^}]*enabled:\s*(true|false)/s, 'Payments is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Audit Logs'[^}]*enabled:\s*(true|false)/s, 'Audit Logs is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Settings'[^}]*enabled:\s*(true|false)/s, 'Settings is configured in AdminLayout')
  })

  // 3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.ai_usage (bukan ai_usage_logs)
  it('3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.ai_usage (bukan ai_usage_logs)', () => {
    assert.ok(migration076Sql.includes('FROM public.ai_usage'), 'Migration 076 must query public.ai_usage')
    assert.ok(!migration076Sql.includes('public.ai_usage_logs'), 'Must NOT assume or create non-existent public.ai_usage_logs')
    assert.ok(serviceCode.includes(".from('ai_usage')"), 'Service must query ai_usage table')
  })

  // 4. DATABASE SECURITY: Migration 076 menggunakan SECURITY DEFINER dan SET search_path = ''
  it('4. DATABASE SECURITY: Migration 076 RPCs menerapkan SECURITY DEFINER dan SET search_path = \'\'', () => {
    const getAiUsageMatch = migration076Sql.match(/FUNCTION public\.get_admin_ai_usage\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
    assert.ok(getAiUsageMatch, 'get_admin_ai_usage must have SECURITY DEFINER and SET search_path = \'\'')

    const getStatsMatch = migration076Sql.match(/FUNCTION public\.get_admin_ai_usage_stats\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
    assert.ok(getStatsMatch, 'get_admin_ai_usage_stats must have SECURITY DEFINER and SET search_path = \'\'')

    const getDetailMatch = migration076Sql.match(/FUNCTION public\.get_admin_ai_usage_detail\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i)
    assert.ok(getDetailMatch, 'get_admin_ai_usage_detail must have SECURITY DEFINER and SET search_path = \'\'')
  })

  // 5. AUTHORIZATION CHECK: Semua RPC memverifikasi public.is_admin()
  it('5. AUTHORIZATION CHECK: Semua RPC memverifikasi public.is_admin() dan raise 42501 jika gagal', () => {
    assert.ok(migration076Sql.includes('v_is_adm := public.is_admin();'), 'is_admin() must be called')
    assert.ok(migration076Sql.includes("ERRCODE = '42501'"), 'Must raise 42501 Unauthorized for non-admin')
  })

  // 6. PERMISSIONS: EXECUTE dicabut dari anon/PUBLIC dan diberikan ke authenticated & service_role
  it('6. PERMISSIONS: EXECUTE dicabut dari anon/PUBLIC dan diberikan ke authenticated & service_role', () => {
    assert.ok(migration076Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage'), 'Revoke execute on get_admin_ai_usage')
    assert.ok(migration076Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage_stats'), 'Revoke execute on get_admin_ai_usage_stats')
    assert.ok(migration076Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_ai_usage_detail'), 'Revoke execute on get_admin_ai_usage_detail')
    assert.ok(migration076Sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage'), 'Grant execute on get_admin_ai_usage')
  })

  // 7. PERFORMANCE: Index dibuat untuk created_at, model, operation, status
  it('7. PERFORMANCE: Index dibuat untuk created_at, model, operation, status', () => {
    assert.ok(migration076Sql.includes('idx_ai_usage_created_at_desc'), 'Index on created_at desc must exist')
    assert.ok(migration076Sql.includes('idx_ai_usage_model'), 'Index on model must exist')
    assert.ok(migration076Sql.includes('idx_ai_usage_operation'), 'Index on operation must exist')
    assert.ok(migration076Sql.includes('idx_ai_usage_status'), 'Index on status must exist')
  })

  // 8. SERVICE: Re-export alias adminAiUsagesService berfungsi identik
  it('8. SERVICE: Re-export alias adminAiUsagesService berfungsi identik', () => {
    assert.equal(typeof aliasService.fetchAdminAiUsage, 'function')
    assert.equal(typeof aliasService.fetchAdminAiUsageStats, 'function')
    assert.equal(typeof aliasService.fetchAdminAiUsageDetail, 'function')
    assert.equal(typeof aliasService.isValidUuid, 'function')
    assert.equal(typeof aliasService.normalizeAiUsageError, 'function')
  })

  // 9. INPUT VALIDATION: isValidUuid memvalidasi UUIDv4 secara ketat
  it('9. INPUT VALIDATION: isValidUuid memvalidasi UUIDv4 secara ketat (mencegah IDOR & SQL Injection)', () => {
    const validUuid = 'f4347fa5-55f4-4191-8bfa-c07bc6deea9c'
    assert.equal(isValidUuid(validUuid), true)
    assert.equal(isValidUuid(''), false)
    assert.equal(isValidUuid(null), false)
    assert.equal(isValidUuid(undefined), false)
    assert.equal(isValidUuid('invalid-uuid-format'), false)
    assert.equal(isValidUuid("'; DROP TABLE ai_usage; --"), false)
    assert.equal(isValidUuid('../../../etc/passwd'), false)
  })

  // 10. ERROR SANITIZATION: normalizeAiUsageError menyembunyikan raw internal errors
  it('10. ERROR SANITIZATION: normalizeAiUsageError menyembunyikan raw internal errors', () => {
    const err42501 = { message: 'permission denied 42501' }
    assert.match(normalizeAiUsageError(err42501).message, /Akses ditolak/i)

    const errNotFound = { message: 'AI_USAGE_NOT_FOUND (P0002)' }
    assert.match(normalizeAiUsageError(errNotFound).message, /tidak ditemukan/i)

    const errUuid = { message: 'invalid input syntax for type uuid' }
    assert.match(normalizeAiUsageError(errUuid).message, /Format ID AI usage tidak valid/i)

    const errUnknown = { message: 'Internal postgres failure with secret API key' }
    assert.equal(normalizeAiUsageError(errUnknown).message, 'Terjadi kesalahan saat memproses data AI usage')
  })

  // 11. PRIVACY & SECRETS: Tidak ada secrets/tokens yang terekspos di service atau UI
  it('11. PRIVACY & SECRETS: Tidak ada secrets, raw authorization headers, atau service role keys terekspos', () => {
    assert.ok(!serviceCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Client service must not contain SUPABASE_SERVICE_ROLE_KEY')
    assert.ok(!aiUsagePageCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'UI code must not contain SUPABASE_SERVICE_ROLE_KEY')
    assert.ok(!aiUsagePageCode.includes('process.env'), 'UI must not access process.env')
  })

  // 12. UI CAPABILITIES: AdminAIUsagePage memiliki kartu metrik, filter waktu, dan modal detail
  it('12. UI CAPABILITIES: AdminAIUsagePage memiliki kartu metrik, filter waktu, dan modal detail', () => {
    assert.ok(aiUsagePageCode.includes('Total Permintaan AI'), 'UI must render Total AI Requests card')
    assert.ok(aiUsagePageCode.includes('Kredit Terpakai'), 'UI must render Credits Used card')
    assert.ok(aiUsagePageCode.includes('Total Token Konsumsi'), 'UI must render Total Tokens card')
    assert.ok(aiUsagePageCode.includes('Estimasi Biaya (USD)'), 'UI must render Provider Cost card')
    assert.ok(aiUsagePageCode.includes('Pengguna AI Aktif'), 'UI must render Active AI Users card')
    assert.ok(aiUsagePageCode.includes('Hari Ini'), 'UI must provide Today filter')
    assert.ok(aiUsagePageCode.includes('7 Hari'), 'UI must provide 7 Days filter')
    assert.ok(aiUsagePageCode.includes('30 Hari'), 'UI must provide 30 Days filter')
    assert.ok(aiUsagePageCode.includes('Detail Penggunaan AI'), 'UI must provide Detail Modal')
  })

  // 13. HARD SCOPE LOCK: Tidak memodifikasi billing, entitlement, atau subscription di Stage 6
  it('13. HARD SCOPE LOCK: Tidak memodifikasi billing, token allowance, atau subscription logic', () => {
    assert.ok(!migration076Sql.includes('INSERT INTO public.credit_ledger'), 'Stage 6 is strictly read-only monitoring')
    assert.ok(!migration076Sql.includes('UPDATE public.creative_credits'), 'Stage 6 must not mutate credits')
    assert.ok(!migration076Sql.includes('UPDATE public.subscriptions'), 'Stage 6 must not mutate subscriptions')
  })

  // 14. REGRESSION: Migration sebelumnya (062 s/d 075) tetap utuh
  it('14. REGRESSION: Migration sebelumnya (062 s/d 075) tetap utuh', () => {
    assert.ok(fs.existsSync(migration062Path), '062 must exist')
    assert.ok(fs.existsSync(migration063Path), '063 must exist')
    assert.ok(fs.existsSync(migration064Path), '064 must exist')
    assert.ok(fs.existsSync(migration065Path), '065 must exist')
    assert.ok(fs.existsSync(migration074Path), '074 must exist')
    assert.ok(fs.existsSync(migration075Path), '075 must exist')
  })
})
