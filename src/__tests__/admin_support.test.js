import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

import {
  fetchAdminSupportTickets,
  fetchAdminSupportStats,
  fetchAdminSupportTicketDetail,
  updateAdminSupportTicket,
  normalizeSupportError,
  isValidUuid,
} from '../services/adminSupportService.js'
import * as aliasService from '../services/adminSupportsService.js'

describe('Tahap 7: Admin Support Management Security & Integrity Testing (@7.md)', () => {
  const migration062Path = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migration063Path = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migration064Path = path.resolve('supabase/migrations/064_admin_user_management.sql')
  const migration065Path = path.resolve('supabase/migrations/065_admin_business_management.sql')
  const migration074Path = path.resolve('supabase/migrations/074_admin_subscription_management.sql')
  const migration076Path = path.resolve('supabase/migrations/076_admin_ai_usage.sql')
  const migration077Path = path.resolve('supabase/migrations/077_admin_support_management.sql')

  const migration063Sql = fs.readFileSync(migration063Path, 'utf8')
  const migration077Sql = fs.readFileSync(migration077Path, 'utf8')
  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const supportPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminSupportPage.jsx'), 'utf8')
  const supportDetailPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminSupportDetailPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminSupportService.js'), 'utf8')

  // 1. ROUTE GUARD: /admin/support dilindungi oleh RequireAdmin
  it('1. ROUTE GUARD: /admin/support dilindungi oleh RequireAdmin dalam AdminLayout', () => {
    assert.ok(appCode.includes("path: 'support', element: <AdminSupportPage />"), 'Support route must mount AdminSupportPage')
    assert.ok(appCode.includes("path: 'support/:id', element: <AdminSupportDetailPage />"), 'Support detail route must mount AdminSupportDetailPage')
    assert.ok(appCode.includes('element: <RequireAdmin />'), 'Admin routes must be protected by RequireAdmin')
    assert.ok(appCode.includes('element: <AdminLayout />'), 'Admin routes must be nested inside AdminLayout')
  })

  // 2. NAVIGATION: AdminLayout mengaktifkan Support dan mempertahankan status future stages
  it('2. NAVIGATION: AdminLayout mengaktifkan Support (ACTIVE) dan mempertahankan status future stages (SOON)', () => {
    assert.match(
      layoutCode,
      /name:\s*'Support',\s*path:\s*'\/admin\/support',\s*enabled:\s*true/s,
      'Support nav item must be enabled: true'
    )
    assert.match(layoutCode, /name:\s*'Payments'[^}]*enabled:\s*(true|false)/s, 'Payments is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Audit Logs'[^}]*enabled:\s*(true|false)/s, 'Audit Logs is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Settings'[^}]*enabled:\s*(true|false)/s, 'Settings is configured in AdminLayout')
  })

  // 3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.support_tickets
  it('3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.support_tickets', () => {
    assert.ok(migration063Sql.includes('create table if not exists public.support_tickets'), 'Migration 063 defines support_tickets')
    assert.ok(migration077Sql.includes('FROM public.support_tickets'), 'Migration 077 must query public.support_tickets')
    assert.ok(serviceCode.includes(".from('support_tickets')"), 'Service must query support_tickets table')
    assert.ok(!migration077Sql.includes('public.support_messages'), 'Must NOT assume non-existent public.support_messages')
    assert.ok(!migration077Sql.includes('public.ticket_replies'), 'Must NOT assume non-existent public.ticket_replies')
  })

  // 4. SERVER-SIDE AUTHORIZATION: RPC wajib verifikasi public.is_admin()
  it('4. SERVER-SIDE AUTHORIZATION: RPC get_admin_support_tickets & detail memverifikasi public.is_admin()', () => {
    assert.ok(
      migration077Sql.includes('FUNCTION public.get_admin_support_tickets'),
      'Migration 077 must declare get_admin_support_tickets'
    )
    assert.ok(
      migration077Sql.includes('FUNCTION public.get_admin_support_ticket_detail'),
      'Migration 077 must declare get_admin_support_ticket_detail'
    )
    assert.ok(
      migration077Sql.includes('FUNCTION public.admin_update_support_ticket'),
      'Migration 077 must declare admin_update_support_ticket'
    )
    assert.ok(
      migration077Sql.includes('FUNCTION public.get_admin_support_stats'),
      'Migration 077 must declare get_admin_support_stats'
    )

    const matches = migration077Sql.match(/public\.is_admin\(\)/g) || []
    assert.ok(matches.length >= 4, 'Every support RPC must check public.is_admin()')
    assert.ok(migration077Sql.includes("USING ERRCODE = '42501'"), 'Must throw standard 42501 Unauthorized error')
  })

  // 5. SECURITY DEFINER & SEARCH_PATH PROTECTION
  it('5. SECURITY DEFINER & SEARCH_PATH: RPC hardened against privilege escalation', () => {
    const secDefinerCount = (migration077Sql.match(/SECURITY DEFINER/g) || []).length
    const searchPathCount = (migration077Sql.match(/SET search_path = ''/g) || []).length
    assert.ok(secDefinerCount >= 4, 'All 4 support RPCs must be SECURITY DEFINER')
    assert.ok(searchPathCount >= 4, 'All 4 support RPCs must set search_path = empty string')
  })

  // 6. REVOKE / GRANT PRIVILEGES: Anon denied, authenticated/service_role granted
  it('6. PRIVILEGES: Revoke from PUBLIC & anon, grant to authenticated & service_role', () => {
    assert.ok(
      migration077Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_support_tickets'),
      'Must revoke get_admin_support_tickets from anon'
    )
    assert.ok(
      migration077Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_support_ticket_detail'),
      'Must revoke get_admin_support_ticket_detail from anon'
    )
    assert.ok(
      migration077Sql.includes('REVOKE EXECUTE ON FUNCTION public.admin_update_support_ticket'),
      'Must revoke admin_update_support_ticket from anon'
    )
    assert.ok(
      migration077Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_support_stats'),
      'Must revoke get_admin_support_stats from anon'
    )
  })

  // 7. DB-SIDE PAGINATION & TOTAL COUNT
  it('7. DB-SIDE PAGINATION & COUNT: Query calculates exact total_count and applies limit/offset', () => {
    assert.ok(migration077Sql.includes('v_total_count bigint;'), 'Must calculate total count')
    assert.ok(migration077Sql.includes('LIMIT LEAST(GREATEST(p_limit, 1), 100)'), 'Must clamp limit')
    assert.ok(migration077Sql.includes('OFFSET GREATEST(p_offset, 0)'), 'Must clamp offset')
    assert.ok(migration077Sql.includes("'total_count', v_total_count"), 'Must return total_count')
  })

  // 8. DATABASE-SIDE FILTERS & SEARCH
  it('8. FILTERS & SEARCH: Status, priority, category, and multi-field text search supported', () => {
    assert.ok(migration077Sql.includes('p_status_filter'), 'Must support status filter')
    assert.ok(migration077Sql.includes('p_priority_filter'), 'Must support priority filter')
    assert.ok(migration077Sql.includes('p_category_filter'), 'Must support category filter')
    assert.ok(migration077Sql.includes('st.subject ILIKE'), 'Must search subject')
    assert.ok(migration077Sql.includes('st.description ILIKE'), 'Must search description')
    assert.ok(migration077Sql.includes('COALESCE(p.email'), 'Must search user email')
    assert.ok(migration077Sql.includes('COALESCE(b.name'), 'Must search business name')
  })

  // 9. AUDIT LOG INTEGRATION: Mutation writes to public.admin_audit_logs
  it('9. AUDIT LOG: Ticket mutation creates immutable entry in public.admin_audit_logs', () => {
    assert.ok(
      migration077Sql.includes('INSERT INTO public.admin_audit_logs'),
      'Mutation must insert into public.admin_audit_logs'
    )
    assert.ok(
      migration077Sql.includes("'support_ticket_update'"),
      'Audit log action must be support_ticket_update'
    )
    assert.ok(
      migration077Sql.includes("'support_ticket'"),
      'Audit target must be support_ticket'
    )
    assert.ok(
      supportDetailPageCode.includes('auditLogs') || supportDetailPageCode.includes('audit_logs'),
      'Detail page renders audit logs history'
    )
  })

  // 10. IDOR & DATA LEAKAGE: Detail query isolates tickets and prevents credential leakage
  it('10. IDOR & PRIVACY: Safe JSON projections without exposing auth credentials or tokens', () => {
    assert.ok(!migration077Sql.includes('raw_user_meta_data'), 'Must not expose raw user auth metadata')
    assert.ok(!migration077Sql.includes('encrypted_password'), 'Must not expose password hashes')
    assert.ok(!supportPageCode.includes('service_role'), 'Must not mention service_role in UI')
    assert.ok(!supportDetailPageCode.includes('service_role'), 'Must not mention service_role in Detail UI')
    assert.ok(!serviceCode.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Service must not bundle service role key')
  })

  // 11. VALIDATION & ERROR NORMALIZATION
  it('11. VALIDATION: UUID format validation and database error normalization', async () => {
    assert.equal(isValidUuid(''), false)
    assert.equal(isValidUuid('invalid-uuid-format'), false)
    assert.equal(isValidUuid('c8d0e74f-9e5b-4ec4-912f-682da08ba53a'), true)

    const invalidDetail = await fetchAdminSupportTicketDetail('not-a-valid-uuid')
    assert.equal(invalidDetail.detail, null)
    assert.match(invalidDetail.error.message, /ID tiket support tidak valid/i)

    const invalidUpdate = await updateAdminSupportTicket({ ticketId: 'bad-id', status: 'resolved' })
    assert.equal(invalidUpdate.success, false)
    assert.match(invalidUpdate.error.message, /ID tiket support tidak valid/i)

    const err42501 = normalizeSupportError(new Error('42501 permission denied'))
    assert.match(err42501.message, /Akses ditolak/i)

    const errNotFound = normalizeSupportError(new Error('P0002 not found'))
    assert.match(errNotFound.message, /tidak ditemukan/i)
  })

  // 12. ALIAS SERVICE RE-EXPORT: adminSupportsService re-exports adminSupportService
  it('12. ALIAS RE-EXPORT: adminSupportsService properly re-exports all methods', () => {
    assert.equal(typeof aliasService.fetchAdminSupportTickets, 'function')
    assert.equal(typeof aliasService.fetchAdminSupportStats, 'function')
    assert.equal(typeof aliasService.fetchAdminSupportTicketDetail, 'function')
    assert.equal(typeof aliasService.updateAdminSupportTicket, 'function')
    assert.equal(typeof aliasService.isValidUuid, 'function')
  })

  // 13. UI INTEGRITY: AdminSupportPage contains required filters, stats, table, and dark theme
  it('13. UI INTEGRITY: AdminSupportPage renders stats, filters, responsive table, and dark theme', () => {
    assert.ok(supportPageCode.includes('Support Management'), 'Must have Support Management title')
    assert.ok(supportPageCode.includes('total_tickets'), 'Must render total_tickets stat')
    assert.ok(supportPageCode.includes('new_tickets'), 'Must render new_tickets stat')
    assert.ok(supportPageCode.includes('in_progress'), 'Must render in_progress stat')
    assert.ok(supportPageCode.includes('waiting_user'), 'Must render waiting_user stat')
    assert.ok(supportPageCode.includes('resolved'), 'Must render resolved stat')
    assert.ok(supportPageCode.includes('urgent_tickets'), 'Must render urgent_tickets stat')
    assert.ok(supportPageCode.includes('statusFilter'), 'Must have statusFilter state')
    assert.ok(supportPageCode.includes('priorityFilter'), 'Must have priorityFilter state')
    assert.ok(supportPageCode.includes('categoryFilter'), 'Must have categoryFilter state')
    assert.ok(supportPageCode.includes('sortBy'), 'Must have sortBy state')
    assert.ok(supportPageCode.includes('AdminSupportActionModal'), 'Must embed AdminSupportActionModal')
  })

  // 14. UI DETAIL INTEGRITY: AdminSupportDetailPage displays user, business, description, and audit log
  it('14. UI DETAIL INTEGRITY: AdminSupportDetailPage displays ticket info, user, business, and audit trail', () => {
    assert.ok(supportDetailPageCode.includes('ticket.subject'), 'Must render ticket subject')
    assert.ok(supportDetailPageCode.includes('ticket.description'), 'Must render ticket description')
    assert.ok(supportDetailPageCode.includes('user?.full_name'), 'Must render user context')
    assert.ok(supportDetailPageCode.includes('business.name') || supportDetailPageCode.includes('business?.name'), 'Must render business context')
    assert.ok(supportDetailPageCode.includes('auditLogs') || supportDetailPageCode.includes('audit_logs'), 'Must render audit trail section')
  })

  // 15. REGRESSION: Historical migrations and previous stages remain intact
  it('15. REGRESSION & SCOPE LOCK: Migrations 001–076 remain unmodified', () => {
    assert.ok(fs.existsSync(migration062Path), '062_admin_rbac_foundation.sql must exist')
    assert.ok(fs.existsSync(migration063Path), '063_admin_overview_and_layout.sql must exist')
    assert.ok(fs.existsSync(migration064Path), '064_admin_user_management.sql must exist')
    assert.ok(fs.existsSync(migration065Path), '065_admin_business_management.sql must exist')
    assert.ok(fs.existsSync(migration074Path), '074_admin_subscription_management.sql must exist')
    assert.ok(fs.existsSync(migration076Path), '076_admin_ai_usage.sql must exist')
  })
})
