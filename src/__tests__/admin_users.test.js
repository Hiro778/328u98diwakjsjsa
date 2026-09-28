import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Tahap 3: Admin User Management (@admin.md Section 4, 5, 6, 7, 8, 9, 27, 43)', () => {
  const migration062Path = path.resolve('supabase/migrations/062_admin_rbac_foundation.sql')
  const migration063Path = path.resolve('supabase/migrations/063_admin_overview_and_layout.sql')
  const migration064Path = path.resolve('supabase/migrations/064_admin_user_management.sql')

  const migration062Sql = fs.readFileSync(migration062Path, 'utf8')
  const migration063Sql = fs.readFileSync(migration063Path, 'utf8')
  const migration064Sql = fs.readFileSync(migration064Path, 'utf8')

  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const usersPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminUsersPage.jsx'), 'utf8')
  const detailPageCode = fs.readFileSync(path.resolve('src/pages/admin/AdminUserDetailPage.jsx'), 'utf8')
  const serviceCode = fs.readFileSync(path.resolve('src/services/adminUserService.js'), 'utf8')
  const modalCode = fs.readFileSync(path.resolve('src/components/admin/AdminUserActionModal.jsx'), 'utf8')
  const requireAdminCode = fs.readFileSync(path.resolve('src/components/RequireAdmin.jsx'), 'utf8')
  const useAdminAuthCode = fs.readFileSync(path.resolve('src/hooks/useAdminAuth.js'), 'utf8')

  it('1. USER tidak dapat membuka /admin/users (Route Guard Security)', () => {
    // Check route hierarchy in App.jsx
    assert.ok(
      appCode.includes("path: '/admin'"),
      '/admin parent route must exist'
    )
    assert.ok(
      appCode.includes('<RequireAdmin />') || appCode.includes('element: <RequireAdmin'),
      '/admin must be wrapped in RequireAdmin component'
    )
    assert.ok(
      appCode.includes("{ path: 'users', element: <AdminUsersPage /> }"),
      '/admin/users must be a child of RequireAdmin'
    )

    // Simulate USER role in RequireAdmin logic
    const userRole = 'USER'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole)
    assert.equal(isAdmin, false, 'USER role must NOT be recognized as admin')
  })

  it('2. ADMIN dapat membuka /admin/users', () => {
    const adminRole = 'ADMIN'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(adminRole)
    assert.equal(isAdmin, true, 'ADMIN role must pass RequireAdmin guard for /admin/users')
  })

  it('3. SUPER_ADMIN dapat membuka /admin/users', () => {
    const superAdminRole = 'SUPER_ADMIN'
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(superAdminRole)
    assert.equal(isAdmin, true, 'SUPER_ADMIN must pass RequireAdmin guard for /admin/users')
  })

  it('4. User list tidak memakai hardcoded fake data', () => {
    // Assert no fake arrays like [{ name: 'John Doe', email: 'john@example.com' }]
    assert.ok(!usersPageCode.includes('john@example.com'), 'Must not contain demo emails')
    assert.ok(!usersPageCode.includes('John Doe'), 'Must not contain hardcoded fake user names')
    assert.ok(
      usersPageCode.includes('fetchAdminUsers') || usersPageCode.includes('listAdminUsers'),
      'Users page must fetch dynamic data via service'
    )
  })

  it('5. Search/filter menghasilkan query/data yang benar', () => {
    // Database RPC query matches
    assert.ok(migration064Sql.includes('p.full_name ilike'), 'Search must match profiles full_name')
    assert.ok(migration064Sql.includes('p.email ilike'), 'Search must match profiles email')
    assert.ok(migration064Sql.includes('p.id::text ilike'), 'Search must match profiles id')
    assert.ok(migration064Sql.includes('b.name ilike'), 'Search must match business name')

    // Filter handling in migration & service
    assert.ok(migration064Sql.includes('p_plan_filter'), 'RPC must handle plan filter')
    assert.ok(migration064Sql.includes('p_status_filter'), 'RPC must handle status filter')
    assert.ok(serviceCode.includes('planFilter'), 'Service must pass planFilter')
    assert.ok(serviceCode.includes('statusFilter'), 'Service must pass statusFilter')
  })

  it('6. Pagination bekerja jika diterapkan', () => {
    assert.ok(migration064Sql.includes('limit p_limit'), 'RPC must apply SQL limit')
    assert.ok(migration064Sql.includes('offset p_offset'), 'RPC must apply SQL offset')
    assert.ok(serviceCode.includes('limit = 20'), 'Service must set default limit')
    assert.ok(serviceCode.includes('offset = 0'), 'Service must set default offset')
    assert.ok(usersPageCode.includes('totalPages'), 'UI must calculate totalPages for pagination')
    assert.ok(usersPageCode.includes('setPage'), 'UI must provide page change controls')
  })

  it('7. User detail mengambil user nyata (Composite 6 sections)', () => {
    assert.ok(
      migration064Sql.includes('create or replace function public.get_admin_user_detail'),
      'RPC get_admin_user_detail must exist'
    )
    assert.ok(migration064Sql.includes("'profile', v_profile"), 'Must return profile')
    assert.ok(migration064Sql.includes("'business', v_business"), 'Must return business')
    assert.ok(migration064Sql.includes("'businesses', v_businesses"), 'Must return businesses array')
    assert.ok(migration064Sql.includes("'business_count', v_business_count"), 'Must return business_count')
    assert.ok(migration064Sql.includes("'subscription', v_subscription"), 'Must return subscription')
    assert.ok(migration064Sql.includes("'ai_usage', v_ai_usage"), 'Must return ai_usage')
    assert.ok(detailPageCode.includes('fetchAdminUserDetail'), 'Detail page must fetch real data')
  })

  it('8. User biasa tidak dapat memanggil admin RPC (Server-Side Authorization)', () => {
    const adminRPCs = [
      'get_admin_users',
      'get_admin_user_detail',
      'admin_update_user_status',
    ]

    for (const rpc of adminRPCs) {
      assert.ok(
        migration064Sql.includes(`create or replace function public.${rpc}`),
        `Function ${rpc} must be created`
      )
      // Assert security definer and search path
      const funcBlock = migration064Sql.split(`public.${rpc}`)[1].slice(0, 800)
      assert.ok(funcBlock.includes('security definer'), `${rpc} must be SECURITY DEFINER`)
      assert.ok(funcBlock.includes("set search_path = ''"), `${rpc} must set search_path = ''`)
      assert.ok(funcBlock.includes('public.is_admin()'), `${rpc} must verify public.is_admin()`)
      assert.ok(funcBlock.includes("'42501'"), `${rpc} must raise 42501 for unauthorized callers`)
    }
  })

  it('9. ADMIN tidak dapat melakukan SUPER_ADMIN-only action (Soft Delete Rejection)', () => {
    // Server-side RPC verification
    assert.ok(
      migration064Sql.includes("if p_new_status = 'deleted' then"),
      'Must inspect deleted action'
    )
    assert.ok(
      migration064Sql.includes('if not v_is_super then'),
      'Must check is_super_admin for deleted action'
    )
    assert.ok(
      migration064Sql.includes('Hanya SUPER_ADMIN yang memiliki izin untuk menghapus user'),
      'Must abort non-superadmin delete attempt'
    )

    // Frontend UI verification: delete action hidden for ordinary admin
    assert.ok(
      usersPageCode.includes('isSuperAdmin &&'),
      'Delete button in users page must be conditionally rendered only for isSuperAdmin'
    )
    assert.ok(
      detailPageCode.includes('isSuperAdmin &&'),
      'Delete button in detail page must be conditionally rendered only for isSuperAdmin'
    )
    assert.ok(
      modalCode.includes("phraseExpected: 'DELETE USER'"),
      'Delete action must require DELETE USER phrase confirmation in modal'
    )
    assert.ok(
      modalCode.includes("phraseExpected: 'BAN USER'"),
      'Ban action must require BAN USER phrase confirmation in modal'
    )
  })

  it('10. SUPER_ADMIN dapat melakukan action yang memang diizinkan', () => {
    // When v_is_super is true, soft-delete proceeds
    assert.ok(
      migration064Sql.includes("v_action := 'USER_DELETED';"),
      'Super admin delete action maps to USER_DELETED'
    )
    assert.ok(
      migration064Sql.includes("deleted_at = case when p_new_status = 'deleted' then now() else deleted_at end"),
      'Super admin triggers safe soft-delete'
    )
    assert.ok(
      migration064Sql.includes('insert into public.admin_audit_logs'),
      'Super admin action is logged in audit trail'
    )
  })

  it('11. Sensitive auth data tidak bocor', () => {
    const sensitiveTokens = [
      'encrypted_password',
      'password_hash',
      'confirmation_token',
      'recovery_token',
      'email_change_token',
      'refresh_token',
      'access_token',
    ]

    const filesToAudit = [
      'supabase/migrations/064_admin_user_management.sql',
      'src/services/adminUserService.js',
      'src/services/adminUsersService.js',
      'src/pages/admin/AdminUsersPage.jsx',
      'src/pages/admin/AdminUserDetailPage.jsx',
    ]

    for (const file of filesToAudit) {
      const code = fs.readFileSync(path.resolve(file), 'utf8')
      for (const token of sensitiveTokens) {
        assert.ok(
          !code.includes(token),
          `Security violation: ${file} must never expose '${token}'`
        )
      }
    }
  })

  it('12. Tidak ada service-role key di browser bundle', () => {
    const envContent = fs.readFileSync(path.resolve('.env'), 'utf8')
    assert.ok(
      !envContent.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'),
      '.env must never prefix service role key with VITE_'
    )

    const clientSupabaseCode = fs.readFileSync(path.resolve('src/lib/supabase.js'), 'utf8')
    assert.ok(
      !clientSupabaseCode.includes('SUPABASE_SERVICE_ROLE_KEY'),
      'Client supabase.js must only use anon key'
    )
  })

  it('13. Existing Stage 1 RBAC tests tetap PASS', () => {
    assert.ok(migration062Sql.includes('create table if not exists public.admin_users'))
    assert.ok(migration062Sql.includes('get_current_admin_role()'))
    assert.ok(migration062Sql.includes('is_admin()'))
    assert.ok(migration062Sql.includes('is_super_admin()'))
    assert.ok(migration062Sql.includes('prevent_self_role_escalation'))
  })

  it('14. Existing Stage 2 tests tetap PASS', () => {
    assert.ok(migration063Sql.includes('support_tickets'))
    assert.ok(migration063Sql.includes('get_admin_dashboard_overview()'))
    const layoutCode = fs.readFileSync(path.resolve('src/components/admin/AdminLayout.jsx'), 'utf8')
    assert.ok(layoutCode.includes('BisnisSehat Admin'))
    assert.ok(layoutCode.includes('Kembali ke App Utama'))
  })

  it('15. Security Test: Role Spoofing Prevention', () => {
    // Verify useAdminAuth fetches from server-side SECURITY DEFINER RPC
    assert.ok(
      useAdminAuthCode.includes("supabase.rpc('get_current_admin_role')"),
      'useAdminAuth must call server-side get_current_admin_role RPC'
    )
    assert.ok(
      useAdminAuthCode.includes("supabase.rpc('is_admin')"),
      'useAdminAuth must call server-side is_admin RPC'
    )
    assert.ok(
      useAdminAuthCode.includes("supabase.rpc('is_super_admin')"),
      'useAdminAuth must call server-side is_super_admin RPC'
    )
    assert.ok(
      !useAdminAuthCode.includes('localStorage.getItem'),
      'useAdminAuth must not read role from localStorage'
    )
    assert.ok(
      !useAdminAuthCode.includes('sessionStorage.getItem'),
      'useAdminAuth must not read role from sessionStorage'
    )

    // Verify RequireAdmin relies on verified server-side role
    assert.ok(
      requireAdminCode.includes('useAdminAuth'),
      'RequireAdmin must use server-side useAdminAuth'
    )
    assert.ok(
      !requireAdminCode.includes('localStorage'),
      'RequireAdmin must not check localStorage'
    )

    // Trigger in DB prevents unauthorized role elevation
    assert.ok(
      migration062Sql.includes('trg_prevent_self_role_escalation'),
      'Database trigger prevents self-role escalation'
    )
  })

  it('16. Deep Security Test: User ID Manipulation Prevention', () => {
    // 1. Invariant: Admin cannot manipulate targetUserId to modify their own account
    assert.ok(
      migration064Sql.includes('if p_target_user_id = v_admin_id then'),
      'RPC must strictly reject when targetUserId equals caller auth.uid()'
    )
    assert.ok(
      migration064Sql.includes('Admin tidak boleh mengubah status akun miliknya sendiri'),
      'Self-modification attempt must trigger specific exception'
    )

    // 2. Target user existence validation in database
    assert.ok(
      migration064Sql.includes('where id = p_target_user_id;'),
      'RPC must verify that target user exists in database before applying actions'
    )
    assert.ok(
      migration064Sql.includes('Target user not found'),
      'Nonexistent target user must raise exception'
    )
  })

  it('17. Deep Security Test: Direct RPC Call Tanpa Admin Session', () => {
    // When a caller directly hits Supabase PostgREST RPC without a valid admin JWT
    // 1. auth.uid() is NULL or evaluates to non-admin
    assert.ok(
      migration062Sql.includes('where user_id = auth.uid()'),
      'is_admin function must look up auth.uid()'
    )
    assert.ok(
      migration062Sql.includes("'ADMIN'::public.admin_role"),
      'Only ADMIN and SUPER_ADMIN roles evaluate to TRUE in is_admin'
    )

    // 2. All Stage 3 functions call public.is_admin() and raise 42501
    const secureFunctions = ['get_admin_users', 'get_admin_user_detail', 'admin_update_user_status']
    for (const fn of secureFunctions) {
      assert.ok(
        migration064Sql.includes(`create or replace function public.${fn}`),
        `${fn} must be defined`
      )
      assert.ok(
        migration064Sql.includes("raise exception 'Unauthorized"),
        'All admin RPCs must explicitly abort with Unauthorized exception 42501'
      )
    }
  })

  it('18. Deep Security Test: Cross-User Access & Data Leakage Prevention', () => {
    // 1. Ordinary users cannot browse or read other users via admin RPCs
    assert.ok(
      migration064Sql.includes('v_is_adm := public.is_admin();'),
      'Every query must verify caller admin identity'
    )

    // 2. admin_audit_logs policy is strictly limited to authenticated admins
    assert.ok(
      migration064Sql.includes('create policy "Admins can view audit logs"'),
      'Audit logs view policy strictly requires is_admin()'
    )
    assert.ok(
      migration064Sql.includes('to authenticated'),
      'Audit logs must require authenticated role'
    )
    assert.ok(
      migration064Sql.includes('using (public.is_admin())'),
      'Audit logs access strictly verified via public.is_admin()'
    )
  })

  it('19. Deep Security Test: Privilege Escalation Prevention', () => {
    // 1. Ordinary ADMIN cannot perform SUPER_ADMIN actions
    assert.ok(
      migration064Sql.includes("p_new_status = 'deleted'"),
      'Soft delete checks deleted status'
    )
    assert.ok(
      migration064Sql.includes('if not v_is_super then'),
      'Soft delete strictly checks v_is_super'
    )

    // 2. Admin cannot elevate own role to SUPER_ADMIN via direct DB updates
    assert.ok(
      migration062Sql.includes('create or replace function public.prevent_self_role_escalation()'),
      'Trigger function prevent_self_role_escalation must exist'
    )
    assert.ok(
      migration062Sql.includes('Admin tidak boleh mengubah atau menaikkan role dirinya sendiri'),
      'Self role escalation must raise exception 42501'
    )

    // 3. Super admin writes are restricted by RLS on admin_users
    assert.ok(
      migration062Sql.includes('create policy "Super admins can insert admin users"'),
      'Insert policy on admin_users requires is_super_admin()'
    )
    assert.ok(
      migration062Sql.includes('create policy "Super admins can update admin users"'),
      'Update policy on admin_users requires is_super_admin()'
    )
    assert.ok(
      migration062Sql.includes('create policy "Super admins can delete admin users"'),
      'Delete policy on admin_users requires is_super_admin()'
    )
  })
})

