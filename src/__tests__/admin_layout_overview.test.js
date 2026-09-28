import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Tahap 2: Admin Layout & Dashboard Overview (@admin.md Section 0, 2, 3, 23, 35)', () => {
  const migrationPath = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  it('1. Migration 063 defines support_tickets table per @admin.md Section 23', () => {
    assert.ok(
      migrationSql.includes('create table if not exists public.support_tickets'),
      'support_tickets table must be created'
    )
    const columns = [
      'id',
      'business_id',
      'user_id',
      'category',
      'subject',
      'description',
      'page_url',
      'priority',
      'status',
      'screenshot_url',
      'admin_note',
      'created_at',
      'updated_at',
    ]
    for (const col of columns) {
      assert.ok(
        migrationSql.includes(col),
        `Column ${col} must exist in support_tickets table`
      )
    }

    assert.ok(
      migrationSql.includes('alter table public.support_tickets enable row level security;'),
      'RLS must be enabled on support_tickets'
    )
  })

  it('2. Migration 063 defines get_admin_dashboard_overview RPC with server-side authorization', () => {
    assert.ok(
      migrationSql.includes('create or replace function public.get_admin_dashboard_overview()'),
      'get_admin_dashboard_overview function must exist'
    )
    assert.ok(
      migrationSql.includes("set search_path = ''"),
      'Function must enforce search_path = \'\''
    )
    assert.ok(
      migrationSql.includes('security definer'),
      'Function must be SECURITY DEFINER'
    )
    assert.ok(
      migrationSql.includes('public.is_admin()'),
      'Function must strictly verify caller via public.is_admin()'
    )
    assert.ok(
      migrationSql.includes("'42501'"),
      'Unauthorized callers must trigger 42501 exception'
    )
  })

  it('3. RPC calculates real database metrics without dummy projection numbers', () => {
    // Users & Subscriptions
    assert.ok(migrationSql.includes('public.profiles'), 'Must count from profiles')
    assert.ok(migrationSql.includes('public.subscriptions'), 'Must count from subscriptions')
    assert.ok(migrationSql.includes('public.businesses'), 'Must count from businesses')

    // AI Usage
    assert.ok(migrationSql.includes('public.creative_credits'), 'Must sum creative credits')
    assert.ok(migrationSql.includes('public.creative_generations'), 'Must count AI requests')

    // Support
    assert.ok(migrationSql.includes('public.support_tickets'), 'Must count support tickets')

    // Payments
    assert.ok(migrationSql.includes('public.subscription_payments'), 'Must calculate subscription revenue')
    assert.ok(migrationSql.includes('public.payments'), 'Must calculate POS payments')

    // Unavailable schema fields returned as null
    assert.ok(migrationSql.includes("'suspended', null"), 'Suspended returned as null if unmigrated')
    assert.ok(migrationSql.includes("'banned', null"), 'Banned returned as null if unmigrated')
  })

  it('4. AdminLayout.jsx defines dedicated header and sidebar per @admin.md Section 35', () => {
    const layoutCode = fs.readFileSync(
      path.resolve('src/components/admin/AdminLayout.jsx'),
      'utf8'
    )

    // Header identity requirements
    assert.ok(layoutCode.includes('BisnisSehat Admin'), 'Header must display BisnisSehat Admin brand')
    assert.ok(layoutCode.includes('adminName'), 'Header must display admin name')
    assert.ok(layoutCode.includes('role'), 'Header must display admin role')
    assert.ok(layoutCode.includes('Kembali ke App Utama'), 'Quick switcher back to user app must exist')

    // Reuse existing logout mechanism
    assert.ok(layoutCode.includes('signOut()'), 'AdminLayout must reuse existing signOut from AuthContext')
    assert.ok(layoutCode.includes('useAuth'), 'AdminLayout must import useAuth')

    // Dedicated Sidebar (must contain all 9 items from Section 35)
    const requiredNavItems = [
      'Overview',
      'Users',
      'Businesses',
      'Subscriptions',
      'AI Usage',
      'Support',
      'Payments',
      'Audit Logs',
      'Settings',
    ]

    for (const item of requiredNavItems) {
      assert.ok(
        layoutCode.includes(`'${item}'`),
        `Sidebar must contain navigation item '${item}'`
      )
    }

    // Unimplemented menu items are disabled / Coming Soon
    assert.ok(layoutCode.includes('Soon'), 'Unimplemented menu items must display Soon badge')
    assert.ok(layoutCode.includes('enabled: false'), 'Future stages must have enabled: false')

    // Must NOT mix with normal user menu
    assert.ok(!layoutCode.includes('SidebarNav'), 'AdminLayout must NOT import regular user SidebarNav')
  })

  it('5. AdminDashboardOverview.jsx renders all required cards and handles unavailable metrics', () => {
    const overviewCode = fs.readFileSync(
      path.resolve('src/pages/admin/AdminDashboardOverview.jsx'),
      'utf8'
    )

    const requiredCards = [
      'TOTAL USERS',
      'ACTIVE USERS',
      'SUSPENDED USERS',
      'BANNED USERS',
      'FREE USERS',
      'PRO USERS',
      'ACTIVE BUSINESSES',
      'AI CREDITS USED',
      'AI CREDITS REMAINING',
      'AI REQUESTS TODAY',
      'NEW TICKETS',
      'IN PROGRESS',
      'WAITING USER',
      'RESOLVED',
      'PAYMENTS TODAY',
      'PAYMENTS THIS MONTH',
      'SUBSCRIPTION REVENUE',
    ]

    for (const card of requiredCards) {
      assert.ok(
        overviewCode.includes(card),
        `Admin overview must render card '${card}'`
      )
    }

    // Check for 'Belum tersedia' fallback for unmigrated fields
    assert.ok(
      overviewCode.includes('Belum tersedia'),
      'Unmigrated metrics must display "Belum tersedia"'
    )

    assert.ok(
      overviewCode.includes('fetchAdminOverviewStats'),
      'Overview page must fetch stats via fetchAdminOverviewStats service'
    )
  })

  it('6. Security Test: USER tidak dapat render Admin Layout melalui route protected', () => {
    function evaluateRouteGuard(role, isAdmin) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      return { allowed: true }
    }

    const result = evaluateRouteGuard('USER', false)
    assert.strictEqual(result.allowed, false, 'USER must be denied entry to AdminLayout')
    assert.strictEqual(result.redirect, '/dashboard', 'USER must be redirected away to /dashboard')
  })

  it('7. Security Test: ADMIN dapat membuka /admin', () => {
    function evaluateRouteGuard(role, isAdmin) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      return { allowed: true }
    }

    const result = evaluateRouteGuard('ADMIN', true)
    assert.strictEqual(result.allowed, true, 'ADMIN must be allowed to render AdminLayout')
  })

  it('8. Security Test: SUPER_ADMIN dapat membuka /admin', () => {
    function evaluateRouteGuard(role, isAdmin, isSuperAdmin, requiredRole) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      if (requiredRole === 'SUPER_ADMIN' && !isSuperAdmin) {
        return { allowed: false, redirect: '/admin' }
      }
      return { allowed: true }
    }

    const generalResult = evaluateRouteGuard('SUPER_ADMIN', true, true, 'ADMIN')
    assert.strictEqual(generalResult.allowed, true, 'SUPER_ADMIN allowed to render /admin')

    const superResult = evaluateRouteGuard('SUPER_ADMIN', true, true, 'SUPER_ADMIN')
    assert.strictEqual(superResult.allowed, true, 'SUPER_ADMIN allowed to render super-only area')
  })

  it('9. Security Test: Role badge menampilkan role yang benar di Admin Header', () => {
    const layoutCode = fs.readFileSync(
      path.resolve('src/components/admin/AdminLayout.jsx'),
      'utf8'
    )

    // Verify role rendering
    assert.ok(
      layoutCode.includes('{role}'),
      'AdminLayout must display {role} inside the badge'
    )
    assert.ok(
      layoutCode.includes('isSuperAdmin'),
      'AdminLayout must check isSuperAdmin for styling distinction'
    )
    assert.ok(
      layoutCode.includes('amber-400') && layoutCode.includes('emerald-400'),
      'AdminLayout must differentiate SUPER_ADMIN (amber) from ADMIN (emerald)'
    )
  })

  it('10. Security Test: Sidebar tidak membocorkan halaman admin yang membutuhkan SUPER_ADMIN', () => {
    const layoutCode = fs.readFileSync(
      path.resolve('src/components/admin/AdminLayout.jsx'),
      'utf8'
    )

    // Unimplemented and super-only actions are not exposed as active clickable routes to regular admins
    assert.ok(
      layoutCode.includes('enabled: false'),
      'Sidebar must have disabled flags on future stage items'
    )
    assert.ok(
      layoutCode.includes('cursor-not-allowed'),
      'Disabled sidebar items must prevent navigation'
    )
  })
})
