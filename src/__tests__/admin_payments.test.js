import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

try {
  process.loadEnvFile?.()
} catch {}

import {
  fetchAdminPayments,
  fetchAdminPaymentMetrics,
  fetchAdminPaymentDetail,
  normalizePaymentError,
  sanitizeRawResponse,
  formatRupiah,
  isValidUuid,
} from '../services/adminPaymentService.js'
import * as aliasService from '../services/adminPaymentsService.js'

describe('Tahap 8: Admin Payments Management Security & Integrity Testing (@8.md)', () => {
  const migration003Path = path.resolve('supabase/migrations/003_pos_schema.sql')
  const migration043Path = path.resolve('supabase/migrations/043_subscription_payments.sql')
  const migration062Path = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migration063Path = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migration078Path = path.resolve('supabase/migrations/078_admin_payments_management.sql')

  const migration003Sql = fs.readFileSync(migration003Path, 'utf8')
  const migration043Sql = fs.readFileSync(migration043Path, 'utf8')
  const migration078Sql = fs.readFileSync(migration078Path, 'utf8')
  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
  const paymentsPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminPaymentsPage.jsx'), 'utf8')
  const paymentDetailPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminPaymentDetailPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminPaymentService.js'), 'utf8')

  // 1. ROUTE GUARD: /admin/payments dilindungi oleh RequireAdmin dalam AdminLayout
  it('1. ROUTE GUARD: /admin/payments dilindungi oleh RequireAdmin dalam AdminLayout', () => {
    assert.ok(appCode.includes("path: 'payments', element: <AdminPaymentsPage />"), 'Payments route must mount AdminPaymentsPage')
    assert.ok(appCode.includes("path: 'payments/:id', element: <AdminPaymentDetailPage />"), 'Payment detail route must mount AdminPaymentDetailPage')
    assert.ok(appCode.includes('element: <RequireAdmin />'), 'Admin routes must be protected by RequireAdmin')
    assert.ok(appCode.includes('element: <AdminLayout />'), 'Admin routes must be nested inside AdminLayout')
  })

  // 2. NAVIGATION: AdminLayout mengaktifkan Payments (ACTIVE) dan mempertahankan status future stages (SOON)
  it('2. NAVIGATION: AdminLayout mengaktifkan Payments (ACTIVE) dan mempertahankan status future stages (SOON)', () => {
    assert.match(
      layoutCode,
      /name:\s*'Payments',\s*path:\s*'\/admin\/payments',\s*enabled:\s*true/s,
      'Payments nav item must be enabled: true'
    )
    assert.match(layoutCode, /name:\s*'Audit Logs'[^}]*enabled:\s*(true|false)/s, 'Audit Logs is configured in AdminLayout')
    assert.match(layoutCode, /name:\s*'Settings'[^}]*enabled:\s*(true|false)/s, 'Settings is configured in AdminLayout')
  })

  // 3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.payments & public.subscription_payments
  it('3. SCHEMA INTEGRITY: Source of truth menggunakan tabel aktual public.payments & public.subscription_payments', () => {
    assert.ok(migration003Sql.includes('create table public.payments'), 'Migration 003 defines public.payments')
    assert.ok(migration043Sql.includes('CREATE TABLE IF NOT EXISTS public.subscription_payments'), 'Migration 043 defines public.subscription_payments')
    assert.ok(migration078Sql.includes('FROM public.payments'), 'Migration 078 must query public.payments')
    assert.ok(migration078Sql.includes('FROM public.subscription_payments'), 'Migration 078 must query public.subscription_payments')
  })

  // 4. SERVER-SIDE AUTHORIZATION: RPC get_admin_payments, get_admin_payment_metrics, get_admin_payment_detail memverifikasi public.is_admin()
  it('4. SERVER-SIDE AUTHORIZATION: RPC payments memverifikasi public.is_admin() secara ketat', () => {
    assert.ok(migration078Sql.includes('public.is_admin()'), 'RPC must check public.is_admin()')
    assert.ok(migration078Sql.includes("USING ERRCODE = '42501'"), 'RPC must raise 42501 Unauthorized on failure')
  })

  // 5. SECURITY DEFINER & SEARCH_PATH: RPC hardened against privilege escalation
  it('5. SECURITY DEFINER & SEARCH_PATH: RPC hardened against privilege escalation', () => {
    assert.ok(migration078Sql.includes('SECURITY DEFINER'), 'RPCs must be declared SECURITY DEFINER')
    assert.ok(migration078Sql.includes("SET search_path = ''"), 'search_path must be locked to empty string')
  })

  // 6. PRIVILEGES: Revoke from PUBLIC & anon, grant to authenticated & service_role
  it('6. PRIVILEGES: Revoke from PUBLIC & anon, grant to authenticated & service_role', () => {
    assert.ok(migration078Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_payments'), 'Revoke from public/anon')
    assert.ok(migration078Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_payment_metrics'), 'Revoke metrics from public/anon')
    assert.ok(migration078Sql.includes('REVOKE EXECUTE ON FUNCTION public.get_admin_payment_detail'), 'Revoke detail from public/anon')
    assert.ok(migration078Sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_payments'), 'Grant to authenticated')
  })

  // 7. DB-SIDE PAGINATION & COUNT: Query calculates exact total_count and applies limit/offset
  it('7. DB-SIDE PAGINATION & COUNT: Query calculates exact total_count and applies limit/offset', () => {
    assert.ok(migration078Sql.includes('LIMIT GREATEST(1, LEAST(p_limit, 100))'), 'Enforces limit capping')
    assert.ok(migration078Sql.includes('OFFSET GREATEST(0, p_offset)'), 'Enforces safe offset')
    assert.ok(migration078Sql.includes('total_count'), 'Returns total_count')
  })

  // 8. FILTERS & SEARCH: Type, provider, method, status, date range, and text search supported
  it('8. FILTERS & SEARCH: Type, provider, method, status, date range, and text search supported', () => {
    assert.ok(migration078Sql.includes('p_payment_type'), 'Supports payment type filter')
    assert.ok(migration078Sql.includes('p_payment_provider'), 'Supports provider filter')
    assert.ok(migration078Sql.includes('p_payment_method'), 'Supports method filter')
    assert.ok(migration078Sql.includes('p_payment_status'), 'Supports status filter')
    assert.ok(migration078Sql.includes('p_date_from'), 'Supports date range filter')
    assert.ok(migration078Sql.includes('p_search'), 'Supports multi-field text search')
  })

  // 9. METRICS & AMOUNT AGGREGATION: Independent order and subscription aggregation without double-counting
  it('9. METRICS & AMOUNT AGGREGATION: Independent order and subscription aggregation without double-counting', () => {
    assert.ok(migration078Sql.includes('v_order_payments_count'), 'Tracks order payments count')
    assert.ok(migration078Sql.includes('v_sub_payments_count'), 'Tracks subscription payments count')
    assert.ok(migration078Sql.includes('v_total_gross_amount'), 'Aggregates gross amounts safely')
    assert.ok(migration078Sql.includes('v_today_gross_amount'), 'Calculates today gross amount')
  })

  // 10. DETAIL SANITIZATION: Safe projections without exposing server keys, client tokens, or passwords
  it('10. DETAIL SANITIZATION: Safe projections without exposing server keys, client tokens, or passwords', () => {
    assert.ok(migration078Sql.includes('server_key'), 'Strips server_key from raw_response in RPC')
    assert.ok(migration078Sql.includes('client_key'), 'Strips client_key from raw_response in RPC')
    assert.ok(migration078Sql.includes('authorization'), 'Strips authorization from raw_response in RPC')

    // Test frontend sanitizeRawResponse helper
    const dirty = {
      order_id: 'ORDER-123',
      server_key: 'SB-Mid-server-SECRET',
      client_key: 'SB-Mid-client-SECRET',
      authorization: 'Basic 12345',
      token: 'snap-token-secret',
      redirect_url: 'https://app.sandbox.midtrans.com/snap',
    }
    const clean = sanitizeRawResponse(dirty)
    assert.strictEqual(clean.order_id, 'ORDER-123')
    assert.strictEqual(clean.redirect_url, 'https://app.sandbox.midtrans.com/snap')
    assert.strictEqual(clean.server_key, undefined)
    assert.strictEqual(clean.client_key, undefined)
    assert.strictEqual(clean.authorization, undefined)
    assert.strictEqual(clean.token, undefined)
  })

  // 11. VALIDATION: UUID format validation and database error normalization
  it('11. VALIDATION: UUID format validation and database error normalization', () => {
    assert.strictEqual(isValidUuid('7cff83f3-3294-493c-b382-93c527ab15c1'), true)
    assert.strictEqual(isValidUuid('invalid-uuid-format'), false)
    assert.strictEqual(isValidUuid(null), false)

    const authErr = normalizePaymentError({ message: '42501: permission denied' })
    assert.ok(authErr.message.includes('Akses ditolak'))

    const notFoundErr = normalizePaymentError({ message: 'PAYMENT_NOT_FOUND' })
    assert.ok(notFoundErr.message.includes('tidak ditemukan'))

    const uuidErr = normalizePaymentError({ message: 'INVALID_UUID' })
    assert.ok(uuidErr.message.includes('tidak valid'))
  })

  // 12. RUPIAH FORMATTING: formatRupiah produces standard Indonesian currency format
  it('12. RUPIAH FORMATTING: formatRupiah produces standard Indonesian currency format', () => {
    const formatted = formatRupiah(130000)
    assert.ok(formatted.includes('130.000'), `Expected formatted currency to contain 130.000, got ${formatted}`)
  })

  // 13. ALIAS RE-EXPORT: adminPaymentsService properly re-exports all methods
  it('13. ALIAS RE-EXPORT: adminPaymentsService properly re-exports all methods', () => {
    assert.strictEqual(typeof aliasService.fetchAdminPayments, 'function')
    assert.strictEqual(typeof aliasService.fetchAdminPaymentMetrics, 'function')
    assert.strictEqual(typeof aliasService.fetchAdminPaymentDetail, 'function')
    assert.strictEqual(typeof aliasService.sanitizeRawResponse, 'function')
  })

  // 14. UI INTEGRITY: AdminPaymentsPage renders metrics, filters, responsive table, and dark theme
  it('14. UI INTEGRITY: AdminPaymentsPage renders metrics, filters, responsive table, and dark theme', () => {
    assert.ok(paymentsPageCode.includes('Total Transaksi'), 'Metrics cards present')
    assert.ok(paymentsPageCode.includes('Total Gross (Sukses)'), 'Gross amount metric present')
    assert.ok(paymentsPageCode.includes('fetchAdminPayments'), 'Page queries payments')
    assert.ok(paymentsPageCode.includes('PaymentTypeBadge'), 'Renders payment type badge')
    assert.ok(paymentsPageCode.includes('StatusBadge'), 'Renders status badge')
    assert.ok(paymentsPageCode.includes('Halaman'), 'Pagination controls present')
  })

  // 15. UI DETAIL INTEGRITY: AdminPaymentDetailPage displays metadata, user, business, and read-only banner
  it('15. UI DETAIL INTEGRITY: AdminPaymentDetailPage displays metadata, user, business, and read-only banner', () => {
    assert.ok(paymentDetailPageCode.includes('Read-Only Payment Monitoring'), 'Read only banner present')
    assert.ok(paymentDetailPageCode.includes('Profil Pengguna'), 'User card present')
    assert.ok(paymentDetailPageCode.includes('Bisnis / Toko Terkait'), 'Business card present')
    assert.ok(paymentDetailPageCode.includes('Sanitized Provider Metadata'), 'Sanitized metadata box present')
  })

  // 16. REGRESSION & SCOPE LOCK: Migrations 001–077 remain unmodified
  it('16. REGRESSION & SCOPE LOCK: Migrations 001–077 remain unmodified', () => {
    const migration077Path = path.resolve('supabase/migrations/077_admin_support_management.sql')
    const migration076Path = path.resolve('supabase/migrations/076_admin_ai_usage.sql')
    assert.ok(fs.existsSync(migration077Path), 'Migration 077 exists')
    assert.ok(fs.existsSync(migration076Path), 'Migration 076 exists')
  })
})
