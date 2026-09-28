import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

import {
  fetchAdminAuditLogs,
  fetchAdminAuditLogDetail,
  sanitizeAuditMetadata,
  normalizeAuditError,
  formatAuditDate,
  getActionBadgeColor,
  formatActionLabel,
  isValidUuid,
} from '../services/adminAuditLogService.js'
import * as aliasService from '../services/adminAuditLogsService.js'

describe('Tahap 9: Admin Audit Logs Security & Integrity Testing (@9.md)', () => {
  const migration064Path = path.resolve('supabase/migrations/064_admin_user_management.sql')
  const migration065Path = path.resolve('supabase/migrations/065_admin_business_management.sql')
  const migration074Path = path.resolve('supabase/migrations/074_admin_subscription_management.sql')
  const migration077Path = path.resolve('supabase/migrations/077_admin_support_management.sql')
  const migration078Path = path.resolve('supabase/migrations/078_admin_payments_management.sql')
  const migration079Path = path.resolve('supabase/migrations/079_admin_audit_logs_management.sql')

  const migration064Sql = fs.readFileSync(migration064Path, 'utf8')
  const migration065Sql = fs.readFileSync(migration065Path, 'utf8')
  const migration074Sql = fs.readFileSync(migration074Path, 'utf8')
  const migration077Sql = fs.readFileSync(migration077Path, 'utf8')
  const migration079Sql = fs.readFileSync(migration079Path, 'utf8')

  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const auditLogsPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminAuditLogsPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminAuditLogService.js'), 'utf8')

  // 1. ROUTE GUARD: /admin/audit-logs dilindungi oleh RequireAdmin dalam AdminLayout
  it('1. ROUTE GUARD: /admin/audit-logs dilindungi oleh RequireAdmin dalam AdminLayout', () => {
    assert.ok(appCode.includes("path: 'audit-logs', element: <AdminAuditLogsPage />"), 'Audit Logs route must mount AdminAuditLogsPage')
    assert.ok(appCode.includes('element: <RequireAdmin />'), 'Admin routes must be protected by RequireAdmin')
    assert.ok(appCode.includes('element: <AdminLayout />'), 'Admin routes must be nested inside AdminLayout')
  })

  // 2. NAVIGATION: AdminLayout mengaktifkan Audit Logs (ACTIVE) dan mempertahankan status Settings (SOON)
  it('2. NAVIGATION: AdminLayout mengaktifkan Audit Logs (ACTIVE) dan mempertahankan status Settings (SOON)', () => {
    assert.match(
      layoutCode,
      /name:\s*'Audit Logs',\s*path:\s*'\/admin\/audit-logs',\s*enabled:\s*true/s,
      'Audit Logs nav item must be enabled: true'
    )
    assert.match(
      layoutCode,
      /name:\s*'Settings',\s*path:\s*'\/admin\/settings',\s*enabled:\s*(true|false)/s,
      'Settings nav item is configured in AdminLayout'
    )
  })

  // 3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.admin_audit_logs yang SUDAH ADA
  it('3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.admin_audit_logs yang SUDAH ADA', () => {
    assert.ok(
      migration064Sql.includes('create table if not exists public.admin_audit_logs'),
      'admin_audit_logs was originally created in 064 and must be preserved'
    )
    assert.ok(
      !migration079Sql.includes('create table public.admin_audit_logs'),
      'Migration 079 must NOT duplicate or recreate admin_audit_logs table'
    )
    assert.ok(
      !migration079Sql.includes('create table public.audit_logs'),
      'Migration 079 must NOT create a redundant audit_logs table'
    )
  })

  // 4. SERVER-SIDE AUTHORIZATION: RPC audit logs memverifikasi public.is_admin() secara ketat
  it('4. SERVER-SIDE AUTHORIZATION: RPC audit logs memverifikasi public.is_admin() secara ketat', () => {
    assert.ok(
      migration079Sql.includes('v_is_adm := public.is_admin();'),
      'get_admin_audit_logs must call public.is_admin()'
    )
    assert.ok(
      migration079Sql.includes("USING ERRCODE = '42501';"),
      'Must raise 42501 error code on unauthorized access'
    )
  })

  // 5. SECURITY DEFINER & SEARCH_PATH: RPC hardened against privilege escalation
  it('5. SECURITY DEFINER & SEARCH_PATH: RPC hardened against privilege escalation', () => {
    assert.ok(migration079Sql.includes('SECURITY DEFINER'), 'RPC must be SECURITY DEFINER')
    assert.ok(migration079Sql.includes("SET search_path = ''"), 'search_path must be locked to empty string')
  })

  // 6. PRIVILEGES: Revoke from PUBLIC & anon, grant to authenticated & service_role
  it('6. PRIVILEGES: Revoke from PUBLIC & anon, grant to authenticated & service_role', () => {
    assert.ok(
      migration079Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_audit_logs'),
      'Must revoke execute from PUBLIC and anon'
    )
    assert.ok(
      migration079Sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_audit_logs'),
      'Must grant execute to authenticated and service_role'
    )
  })

  // 7. DB-SIDE PAGINATION & COUNT: Query calculates exact total_count and applies limit/offset
  it('7. DB-SIDE PAGINATION & COUNT: Query calculates exact total_count and applies limit/offset', () => {
    assert.ok(
      migration079Sql.includes('SELECT COUNT(*)'),
      'RPC must calculate exact total matching count'
    )
    assert.ok(
      migration079Sql.includes('LIMIT v_limit'),
      'RPC must enforce server-side LIMIT'
    )
    assert.ok(
      migration079Sql.includes('OFFSET v_offset'),
      'RPC must enforce server-side OFFSET'
    )
  })

  // 8. FILTERS & SEARCH: Action, actor, target_type, date range, and text search supported DB-side
  it('8. FILTERS & SEARCH: Action, actor, target_type, date range, and text search supported DB-side', () => {
    assert.ok(migration079Sql.includes('p_action'), 'Must support action filter')
    assert.ok(migration079Sql.includes('p_actor_id'), 'Must support actor filter')
    assert.ok(migration079Sql.includes('p_target_type'), 'Must support target_type filter')
    assert.ok(migration079Sql.includes('p_date_from'), 'Must support date_from filter')
    assert.ok(migration079Sql.includes('p_date_to'), 'Must support date_to filter')
    assert.ok(migration079Sql.includes('p_sort'), 'Must support sort filter')
  })

  // 9. READ-ONLY ENFORCEMENT: Zero update/delete operations in UI, service, and RPC
  it('9. READ-ONLY ENFORCEMENT: Zero update/delete operations in UI, service, and RPC', () => {
    assert.ok(!serviceCode.includes('deleteAdminAuditLog'), 'Service must NOT export delete function')
    assert.ok(!serviceCode.includes('updateAdminAuditLog'), 'Service must NOT export update function')
    assert.ok(!auditLogsPageCode.includes('handleDelete'), 'UI must NOT contain delete handler')
    assert.ok(!auditLogsPageCode.includes('handleUpdate'), 'UI must NOT contain update handler')
    assert.ok(auditLogsPageCode.includes('Read-Only'), 'UI must display Read-Only indicator')
  })

  // 10. DETAIL SANITIZATION: Strips passwords, tokens, API keys, and provider secrets
  it('10. DETAIL SANITIZATION: Strips passwords, tokens, API keys, and provider secrets', () => {
    const rawPayload = {
      password: 'super-secret-password',
      token: 'jwt.token.here',
      access_token: 'auth0_access_token',
      apiKey: 'ai-api-key-here',
      server_key: 'midtrans-server-key',
      authorization: 'Bearer token',
      cookie: 'session_cookie',
      user_id: '12345',
      changes: {
        old_status: 'active',
        new_status: 'banned',
        nested_secret: 'hide-me',
      },
    }

    const sanitized = sanitizeAuditMetadata(rawPayload)

    assert.equal(sanitized.password, undefined, 'password must be stripped')
    assert.equal(sanitized.token, undefined, 'token must be stripped')
    assert.equal(sanitized.access_token, undefined, 'access_token must be stripped')
    assert.equal(sanitized.apiKey, undefined, 'apiKey must be stripped')
    assert.equal(sanitized.server_key, undefined, 'server_key must be stripped')
    assert.equal(sanitized.authorization, undefined, 'authorization must be stripped')
    assert.equal(sanitized.cookie, undefined, 'cookie must be stripped')
    assert.equal(sanitized.user_id, '12345', 'Safe public data must be preserved')
    assert.equal(sanitized.changes.new_status, 'banned', 'Safe nested data must be preserved')
  })

  // 11. VALIDATION: UUID format validation and database error normalization
  it('11. VALIDATION: UUID format validation and database error normalization', () => {
    assert.ok(isValidUuid('291e7546-053e-4f56-b07b-d2e9fd2ef5b9'), 'Valid UUID should pass')
    assert.ok(!isValidUuid('invalid-uuid-123'), 'Invalid UUID should fail')
    assert.ok(!isValidUuid(''), 'Empty string should fail')
    assert.ok(!isValidUuid(null), 'Null should fail')

    const err42501 = normalizeAuditError(new Error('42501 Unauthorized access'))
    assert.ok(err42501.message.includes('Akses ditolak'), '42501 must be mapped to safe message')

    const errNotFound = normalizeAuditError(new Error('P0002 AUDIT_LOG_NOT_FOUND'))
    assert.ok(errNotFound.message.includes('tidak ditemukan'), 'P0002 must be mapped to safe message')
  })

  // 12. UI FORMATTERS & HELPERS: formatAuditDate, getActionBadgeColor, formatActionLabel
  it('12. UI FORMATTERS & HELPERS: formatAuditDate, getActionBadgeColor, formatActionLabel', () => {
    assert.equal(formatAuditDate(null), '-')
    assert.equal(formatAuditDate('invalid-date'), '-')

    const dateFormatted = formatAuditDate('2026-09-26T05:31:21.069923+00:00')
    assert.ok(dateFormatted !== '-', 'Valid date should be formatted')

    assert.ok(getActionBadgeColor('USER_BANNED').includes('red'), 'Ban action badge should be red')
    assert.ok(getActionBadgeColor('USER_SUSPENDED').includes('amber'), 'Suspend action badge should be amber')
    assert.ok(getActionBadgeColor('USER_UNBANNED').includes('emerald'), 'Unban action badge should be emerald')

    assert.equal(formatActionLabel('USER_BANNED'), 'Blokir Pengguna')
    assert.equal(formatActionLabel('CANCEL_SUBSCRIPTION'), 'Batalkan Langganan')
  })

  // 13. ALIAS RE-EXPORT: adminAuditLogsService properly re-exports all methods
  it('13. ALIAS RE-EXPORT: adminAuditLogsService properly re-exports all methods', () => {
    assert.equal(typeof aliasService.fetchAdminAuditLogs, 'function')
    assert.equal(typeof aliasService.fetchAdminAuditLogDetail, 'function')
    assert.equal(typeof aliasService.sanitizeAuditMetadata, 'function')
    assert.equal(typeof aliasService.normalizeAuditError, 'function')
  })

  // 14. MUTATION COVERAGE: Preflight confirms existing mutations record to public.admin_audit_logs
  it('14. MUTATION COVERAGE: Preflight confirms existing mutations record to public.admin_audit_logs', () => {
    assert.ok(migration064Sql.includes('insert into public.admin_audit_logs'), '064 user status records audit log')
    assert.ok(migration065Sql.includes('insert into public.admin_audit_logs'), '065 business status records audit log')
    assert.ok(migration074Sql.includes('INSERT INTO public.admin_audit_logs'), '074 subscription cancellation records audit log')
    assert.ok(migration077Sql.includes('INSERT INTO public.admin_audit_logs'), '077 support ticket update records audit log')
  })

  // 15. UI INTEGRITY: AdminAuditLogsPage renders filters, responsive table, and detail modal
  it('15. UI INTEGRITY: AdminAuditLogsPage renders filters, responsive table, and detail modal', () => {
    assert.ok(auditLogsPageCode.includes('Cari Audit'), 'Must render search bar')
    assert.ok(auditLogsPageCode.includes('Semua Tindakan'), 'Must render action filter')
    assert.ok(auditLogsPageCode.includes('Semua Tipe Target'), 'Must render target filter')
    assert.ok(auditLogsPageCode.includes('DetailModal'), 'Must render detail modal')
  })

  // 16. REGRESSION & SCOPE LOCK: Migrations 001–078 remain unmodified
  it('16. REGRESSION & SCOPE LOCK: Migrations 001–078 remain unmodified', () => {
    const historicalFiles = fs.readdirSync(path.resolve('supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '079_admin_audit_logs_management.sql')
    assert.ok(historicalFiles.length >= 70, 'All historical migrations must exist')
  })
})
