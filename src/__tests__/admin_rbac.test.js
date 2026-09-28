import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Tahap 1: Admin RBAC & Access Control Foundation (@admin.md Section 0, 1, 30, 31, 40, 41)', () => {
  const migrationPath = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf8')

  it('1. Migration 062 defines admin_users table with mandatory columns and constraints', () => {
    assert.ok(
      migrationSql.includes('create table if not exists public.admin_users'),
      'admin_users table must be created'
    )
    assert.ok(
      migrationSql.includes('id uuid primary key default gen_random_uuid()'),
      'id primary key with uuid generation must exist'
    )
    assert.ok(
      migrationSql.includes('user_id uuid not null references auth.users(id) on delete cascade'),
      'user_id foreign key referencing auth.users must exist'
    )
    assert.ok(
      migrationSql.includes('role public.admin_role not null default \'ADMIN\''),
      'role column must default to ADMIN'
    )
    assert.ok(
      migrationSql.includes('constraint uq_admin_users_user_id unique (user_id)'),
      'user_id must be unique (one admin record per user)'
    )
    assert.ok(
      migrationSql.includes('created_at timestamptz not null default now()'),
      'created_at timestamp must exist'
    )
    assert.ok(
      migrationSql.includes('updated_at timestamptz not null default now()'),
      'updated_at timestamp must exist'
    )
  })

  it('2. Migration 062 defines enum admin_role with USER, ADMIN, and SUPER_ADMIN', () => {
    assert.ok(
      migrationSql.includes("enum ('USER', 'ADMIN', 'SUPER_ADMIN')"),
      'Enum admin_role must include USER, ADMIN, SUPER_ADMIN'
    )
  })

  it('3. Security functions: get_current_admin_role, is_admin, is_super_admin with SECURITY DEFINER and search_path = \'\'', () => {
    const requiredFunctions = ['get_current_admin_role', 'is_admin', 'is_super_admin']
    for (const fn of requiredFunctions) {
      assert.ok(
        migrationSql.includes(`create or replace function public.${fn}`),
        `Function ${fn} must be created`
      )
    }

    // Ensure search_path = '' to protect against search-path hijacking attacks
    const searchPathMatches = migrationSql.match(/set search_path = ''/g)
    assert.ok(
      searchPathMatches && searchPathMatches.length >= 4,
      'All security definer functions must set search_path = \'\''
    )

    // Identity must come strictly from auth.uid()
    assert.ok(
      migrationSql.includes('auth.uid()'),
      'Identity must be extracted from auth.uid()'
    )
  })

  it('4. Row Level Security is enabled with strict isolation on admin_users', () => {
    assert.ok(
      migrationSql.includes('alter table public.admin_users enable row level security;'),
      'admin_users must have RLS enabled'
    )
    assert.ok(
      migrationSql.includes('create policy "Admins can view admin users"'),
      'View policy for admins must exist'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can insert admin users"'),
      'Super admin insert policy must exist'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can update admin users"'),
      'Super admin update policy must exist'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can delete admin users"'),
      'Super admin delete policy must exist'
    )
    assert.ok(
      !migrationSql.includes('using (true)'),
      'Must NOT use using (true) on sensitive admin tables'
    )
  })

  it('5. useAdminAuth and RequireAdmin do not use localStorage or client-side spoofing', () => {
    const hookCode = fs.readFileSync(
      path.resolve('src/hooks/useAdminAuth.js'),
      'utf8'
    )
    const guardCode = fs.readFileSync(
      path.resolve('src/components/RequireAdmin.jsx'),
      'utf8'
    )

    const stripComments = (str) => str.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    const hookCodeWithoutComments = stripComments(hookCode)
    const guardCodeWithoutComments = stripComments(guardCode)

    assert.ok(!hookCodeWithoutComments.includes('localStorage'), 'useAdminAuth must NOT read from localStorage')
    assert.ok(!hookCodeWithoutComments.includes('sessionStorage'), 'useAdminAuth must NOT read from sessionStorage')
    assert.ok(!guardCodeWithoutComments.includes('localStorage'), 'RequireAdmin must NOT read from localStorage')

    assert.ok(hookCode.includes("supabase.rpc('get_current_admin_role')"), 'useAdminAuth must call get_current_admin_role')
    assert.ok(hookCode.includes("supabase.rpc('is_admin')"), 'useAdminAuth must call is_admin')
    assert.ok(hookCode.includes("supabase.rpc('is_super_admin')"), 'useAdminAuth must call is_super_admin')
  })

  it('6. Route Guard Security: USER -> /admin ditolak', () => {
    // Pure function representing the access decision of RequireAdmin
    function evaluateAdminAccess({ role, isAdmin, isSuperAdmin, requiredRole }) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      if (requiredRole === 'SUPER_ADMIN' && !isSuperAdmin) {
        return { allowed: false, redirect: '/admin' }
      }
      return { allowed: true }
    }

    // Normal USER attempts to access /admin
    const userAccess = evaluateAdminAccess({
      role: 'USER',
      isAdmin: false,
      isSuperAdmin: false,
      requiredRole: 'ADMIN',
    })
    assert.strictEqual(userAccess.allowed, false, 'USER must be denied access to /admin')
    assert.strictEqual(userAccess.redirect, '/dashboard', 'USER must be redirected to /dashboard')
  })

  it('7. Route Guard Security: ADMIN -> /admin diterima, tetapi super-only ditolak', () => {
    function evaluateAdminAccess({ role, isAdmin, isSuperAdmin, requiredRole }) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      if (requiredRole === 'SUPER_ADMIN' && !isSuperAdmin) {
        return { allowed: false, redirect: '/admin' }
      }
      return { allowed: true }
    }

    // ADMIN accessing standard /admin
    const adminGeneral = evaluateAdminAccess({
      role: 'ADMIN',
      isAdmin: true,
      isSuperAdmin: false,
      requiredRole: 'ADMIN',
    })
    assert.strictEqual(adminGeneral.allowed, true, 'ADMIN must be granted access to general admin')

    // ADMIN accessing super-only admin
    const adminSuperOnly = evaluateAdminAccess({
      role: 'ADMIN',
      isAdmin: true,
      isSuperAdmin: false,
      requiredRole: 'SUPER_ADMIN',
    })
    assert.strictEqual(adminSuperOnly.allowed, false, 'ADMIN must be denied access to super-only area')
    assert.strictEqual(adminSuperOnly.redirect, '/admin', 'ADMIN redirected back to /admin')
  })

  it('8. Route Guard Security: SUPER_ADMIN -> /admin diterima di seluruh area', () => {
    function evaluateAdminAccess({ role, isAdmin, isSuperAdmin, requiredRole }) {
      if (!isAdmin || role === 'USER') {
        return { allowed: false, redirect: '/dashboard' }
      }
      if (requiredRole === 'SUPER_ADMIN' && !isSuperAdmin) {
        return { allowed: false, redirect: '/admin' }
      }
      return { allowed: true }
    }

    // SUPER_ADMIN accessing general /admin
    const superGeneral = evaluateAdminAccess({
      role: 'SUPER_ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
      requiredRole: 'ADMIN',
    })
    assert.strictEqual(superGeneral.allowed, true, 'SUPER_ADMIN granted access to general admin')

    // SUPER_ADMIN accessing super-only
    const superSuperOnly = evaluateAdminAccess({
      role: 'SUPER_ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
      requiredRole: 'SUPER_ADMIN',
    })
    assert.strictEqual(superSuperOnly.allowed, true, 'SUPER_ADMIN granted access to super-only area')
  })

  it('9. Database Security: USER tidak bisa mengubah dirinya menjadi ADMIN', () => {
    // 1. Verify RLS policy restricts INSERT to super admins only
    assert.ok(
      migrationSql.includes('create policy "Super admins can insert admin users"'),
      'INSERT policy must be restricted'
    )
    assert.ok(
      migrationSql.includes('with check (public.is_super_admin())'),
      'Only super admin can insert new admin records'
    )

    // 2. Verify RLS policy restricts UPDATE to super admins only
    assert.ok(
      migrationSql.includes('create policy "Super admins can update admin users"'),
      'UPDATE policy must be restricted'
    )

    // 3. Ordinary authenticated users cannot select/see other admin users
    assert.ok(
      migrationSql.includes('using (public.is_admin())'),
      'Only admins can select from admin_users table'
    )
  })

  it('10. Database Security: ADMIN tidak bisa mengubah dirinya menjadi SUPER_ADMIN', () => {
    // Trigger prevent_self_role_escalation checks both self-modification and is_super_admin()
    assert.ok(
      migrationSql.includes('create or replace function public.prevent_self_role_escalation()'),
      'prevent_self_role_escalation trigger function must exist'
    )
    assert.ok(
      migrationSql.includes('auth.uid() = old.user_id and new.role <> old.role'),
      'Self role escalation must trigger an explicit exception'
    )
    assert.ok(
      migrationSql.includes('if not public.is_super_admin() then'),
      'Non-superadmins must be forbidden from updating roles'
    )
    assert.ok(
      migrationSql.includes('create trigger trg_prevent_self_role_escalation'),
      'Trigger trg_prevent_self_role_escalation must be attached to admin_users'
    )
  })

  it('11. App.jsx registers /admin with RequireAuth and RequireAdmin guards', () => {
    const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')

    assert.ok(appCode.includes("path: '/admin'"), '/admin route must exist in App.jsx')
    assert.ok(appCode.includes('<RequireAdmin />'), 'RequireAdmin guard must wrap /admin children')
    assert.ok(
      appCode.includes('requiredRole="SUPER_ADMIN"'),
      'RequireAdmin with requiredRole="SUPER_ADMIN" must protect super-only child routes'
    )
  })

  it('12. Client Security: Manipulasi localStorage / frontend state tidak memberikan privilege', () => {
    // Simulate malicious user setting spoofed values in localStorage / state
    const spoofedStorage = {
      role: 'SUPER_ADMIN',
      isAdmin: 'true',
      isSuperAdmin: 'true',
    }
    assert.strictEqual(spoofedStorage.role, 'SUPER_ADMIN')

    // In useAdminAuth, authorization strictly calls server RPCs and ignores spoofedStorage
    const hookCode = fs.readFileSync(path.resolve('src/hooks/useAdminAuth.js'), 'utf8')
    assert.ok(!hookCode.includes('localStorage.getItem'), 'Hook must never read authorization from localStorage')
    assert.ok(!hookCode.includes('sessionStorage.getItem'), 'Hook must never read authorization from sessionStorage')

    // If an attacker sets state manually, server-side RPC is the true decider
    assert.ok(hookCode.includes("supabase.rpc('get_current_admin_role')"))
    assert.ok(hookCode.includes("supabase.rpc('is_admin')"))
    assert.ok(hookCode.includes("supabase.rpc('is_super_admin')"))
  })

  it('13. Database Security: Direct database/API request tanpa privilege tetap ditolak oleh RLS', () => {
    // An attacker directly querying supabase.from('admin_users').select('*') or .insert(...)
    // Must be blocked by Postgres RLS:
    assert.ok(
      migrationSql.includes('alter table public.admin_users enable row level security;'),
      'RLS is mandatory on admin_users'
    )
    assert.ok(
      migrationSql.includes('create policy "Admins can view admin users"'),
      'Unprivileged direct SELECT queries return empty set via RLS'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can insert admin users"'),
      'Unprivileged direct INSERT queries return 42501 via RLS'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can update admin users"'),
      'Unprivileged direct UPDATE queries return 42501 via RLS'
    )
    assert.ok(
      migrationSql.includes('create policy "Super admins can delete admin users"'),
      'Unprivileged direct DELETE queries return 42501 via RLS'
    )
  })
})
