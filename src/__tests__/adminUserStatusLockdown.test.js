// src/__tests__/adminUserStatusLockdown.test.js
// Verification Suite for BS-CONF-04: admin_update_user_status & admin_set_user_status Authorization Hardening
// Covers:
// 1. Static Code & Migration Analysis (Migration 110 schema, role parsing, RBAC, self-protection, revocations)
// 2. Live Remote Database Verification:
//    A. Anonymous caller (rejected with 401/42501, target profile unchanged)
//    B. Authenticated Non-Admin User (rejected with 42501 Only admins can modify user status)
//    C. Admin Self-Protection (rejected with 42501 Forbidden: Admin cannot modify own account)
//    D. Legitimate Admin Status Transitions (suspend, unsuspend, ban, unban with reason)
//    E. Mandatory Reason Validation (missing reason rejected with 22023)
//    F. Super Admin Deletion Enforcement (regular admin rejected 42501, super admin allowed)
//    G. service_role Authorization (backend automations proceed reliably)
//    H. Audit Log Verification (mutations audited in admin_audit_logs)

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ttdevvrzmdquvaewxzhh.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

describe('BS-CONF-04: admin_update_user_status & admin_set_user_status Authorization Hardening', () => {
  const migrationPath = path.resolve('supabase/migrations/110_harden_admin_user_status_authorization.sql')

  describe('1. Static Code & Migration 110 Analysis', () => {
    it('1.1. Migration 110 exists and defines hardened admin_update_user_status and alias', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 110 must exist')
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.admin_update_user_status'), 'Must define admin_update_user_status')
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.admin_set_user_status'), 'Must define admin_set_user_status')
      assert.ok(sql.includes("SET search_path = ''"), 'Must pin search_path to empty string')
      assert.ok(sql.includes('SECURITY DEFINER'), 'Must be SECURITY DEFINER')
    })

    it('1.2. Eliminates current_user IN (...) bypass from service_role check', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')
      const cleanSql = sql.replace(/--.*$/gm, '')

      assert.ok(
        !cleanSql.includes('current_user'),
        'Must remove vulnerable current_user check that caused SECURITY DEFINER bypass'
      )
      assert.ok(cleanSql.includes('v_is_service_role :='), 'Must calculate v_is_service_role')
      assert.ok(
        cleanSql.includes("request.jwt.claim.role") ||
        cleanSql.includes("auth.role() = 'service_role'"),
        'Must rely strictly on verified JWT claims or auth.role()'
      )
    })

    it('1.3. Enforces active authentication and public.is_admin() for non-service_role callers', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('IF NOT v_is_service_role THEN'), 'Must check non-service_role callers')
      assert.ok(sql.includes('v_admin_id IS NULL'), 'Must check for unauthenticated callers')
      assert.ok(sql.includes('NOT public.is_admin()'), 'Must verify is_admin()')
      assert.ok(sql.includes("'42501'"), 'Must return SQLSTATE 42501 on authorization failure')
    })

    it('1.4. Strictly enforces public.is_super_admin() for account deletion', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes("p_new_status = 'deleted'"), 'Must check for deleted status')
      assert.ok(sql.includes('NOT v_is_super'), 'Must verify super admin privilege')
      assert.ok(sql.includes('SUPER_ADMIN'), 'Must specify SUPER_ADMIN requirement')
    })

    it('1.5. Preserves self-protection invariant', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(sql.includes('p_target_user_id = v_admin_id'), 'Must check self target')
      assert.ok(sql.includes('Admin tidak boleh mengubah status akun miliknya sendiri'), 'Must reject self status modification')
    })

    it('1.6. Revokes EXECUTE from PUBLIC and anon, granting only to authenticated and service_role', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8')

      assert.ok(
        sql.includes('REVOKE ALL ON FUNCTION public.admin_update_user_status(uuid, text, text) FROM PUBLIC, anon;'),
        'Must revoke admin_update_user_status from PUBLIC and anon'
      )
      assert.ok(
        sql.includes('GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, text, text) TO authenticated, service_role;'),
        'Must grant admin_update_user_status only to authenticated and service_role'
      )
      assert.ok(
        sql.includes('REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM PUBLIC, anon;'),
        'Must revoke admin_set_user_status from PUBLIC and anon'
      )
      assert.ok(
        sql.includes('GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated, service_role;'),
        'Must grant admin_set_user_status only to authenticated and service_role'
      )
    })
  })

  describe('2. Live Remote Database Verification (A - H Matrix)', () => {
    let serviceClient
    let anonClient
    let userTargetClient
    let userAttackerClient
    let adminUserClient
    let superAdminClient

    let userTargetId
    let userAttackerId
    let adminUserId
    let superAdminId

    before(async () => {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase environment variables missing')
      }

      serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const pass = 'TestP@ss123456!'
      const ts = Date.now()

      const emailTarget = `test_target_${ts}@example.com`
      const emailAttacker = `test_attacker_${ts}@example.com`
      const emailAdmin = `test_admin_${ts}@example.com`
      const emailSuper = `test_super_${ts}@example.com`

      // 1. Create User Target (regular user)
      const { data: uTarget, error: errTarget } = await serviceClient.auth.admin.createUser({
        email: emailTarget,
        password: pass,
        email_confirm: true,
      })
      if (errTarget) throw new Error(`Failed to create Target user: ${errTarget.message}`)
      userTargetId = uTarget.user.id

      // 2. Create User Attacker (regular non-admin user)
      const { data: uAttacker, error: errAttacker } = await serviceClient.auth.admin.createUser({
        email: emailAttacker,
        password: pass,
        email_confirm: true,
      })
      if (errAttacker) throw new Error(`Failed to create Attacker user: ${errAttacker.message}`)
      userAttackerId = uAttacker.user.id

      // 3. Create Admin User (ADMIN role)
      const { data: uAdmin, error: errAdmin } = await serviceClient.auth.admin.createUser({
        email: emailAdmin,
        password: pass,
        email_confirm: true,
      })
      if (errAdmin) throw new Error(`Failed to create Admin user: ${errAdmin.message}`)
      adminUserId = uAdmin.user.id

      // Enrol adminUserId in public.admin_users as ADMIN
      const { error: errAdminRole } = await serviceClient.from('admin_users').insert({
        user_id: adminUserId,
        role: 'ADMIN',
      })
      if (errAdminRole) throw new Error(`Failed to enroll Admin in admin_users: ${errAdminRole.message}`)

      // 4. Create Super Admin User (SUPER_ADMIN role)
      const { data: uSuper, error: errSuper } = await serviceClient.auth.admin.createUser({
        email: emailSuper,
        password: pass,
        email_confirm: true,
      })
      if (errSuper) throw new Error(`Failed to create Super Admin user: ${errSuper.message}`)
      superAdminId = uSuper.user.id

      // Enrol superAdminId in public.admin_users as SUPER_ADMIN
      const { error: errSuperRole } = await serviceClient.from('admin_users').insert({
        user_id: superAdminId,
        role: 'SUPER_ADMIN',
      })
      if (errSuperRole) throw new Error(`Failed to enroll Super Admin in admin_users: ${errSuperRole.message}`)

      // Sign in clients to get access tokens
      const authHelper = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { data: logTarget } = await authHelper.auth.signInWithPassword({ email: emailTarget, password: pass })
      const { data: logAttacker } = await authHelper.auth.signInWithPassword({ email: emailAttacker, password: pass })
      const { data: logAdmin } = await authHelper.auth.signInWithPassword({ email: emailAdmin, password: pass })
      const { data: logSuper } = await authHelper.auth.signInWithPassword({ email: emailSuper, password: pass })

      userTargetClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logTarget.session.access_token}` } },
      })
      userAttackerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logAttacker.session.access_token}` } },
      })
      adminUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logAdmin.session.access_token}` } },
      })
      superAdminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${logSuper.session.access_token}` } },
      })
    })

    after(async () => {
      // Cleanup admin_audit_logs generated by tests
      if (userTargetId) {
        await serviceClient.from('admin_audit_logs').delete().eq('target_id', userTargetId)
      }
      if (adminUserId) {
        await serviceClient.from('admin_audit_logs').delete().eq('target_id', adminUserId)
        await serviceClient.from('admin_users').delete().eq('user_id', adminUserId)
        await serviceClient.auth.admin.deleteUser(adminUserId)
      }
      if (superAdminId) {
        await serviceClient.from('admin_audit_logs').delete().eq('target_id', superAdminId)
        await serviceClient.from('admin_users').delete().eq('user_id', superAdminId)
        await serviceClient.auth.admin.deleteUser(superAdminId)
      }
      if (userAttackerId) {
        await serviceClient.from('admin_audit_logs').delete().eq('target_id', userAttackerId)
        await serviceClient.auth.admin.deleteUser(userAttackerId)
      }
      if (userTargetId) {
        await serviceClient.auth.admin.deleteUser(userTargetId)
      }
    })

    it('2.1. (A1) Anonymous caller cannot call admin_update_user_status (HTTP 401 / 42501 permission denied)', async () => {
      const { data, error } = await anonClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'banned',
        p_reason: 'unauthorized_anon_exploit',
      })

      assert.equal(data, null, 'Data must be null')
      assert.ok(error, 'Must return error')
      assert.equal(error.code, '42501', 'Must return SQLSTATE 42501')

      // Verify target user remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active', 'Target user status must remain active')
    })

    it('2.2. (A2) Anonymous caller cannot call admin_set_user_status alias (HTTP 401 / 42501 permission denied)', async () => {
      const { data, error } = await anonClient.rpc('admin_set_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'suspended',
        p_reason: 'unauthorized_anon_alias_exploit',
      })

      assert.equal(data, null, 'Data must be null')
      assert.ok(error, 'Must return error')
      assert.equal(error.code, '42501', 'Must return SQLSTATE 42501')

      // Verify target user remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active', 'Target user status must remain active')
    })

    it('2.3. (B1) Authenticated non-admin cannot call admin_update_user_status (HTTP 403 / 42501 Unauthorized)', async () => {
      const { data, error } = await userAttackerClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'banned',
        p_reason: 'non_admin_attacker_exploit',
      })

      assert.equal(data, null, 'Data must be null')
      assert.ok(error, 'Must return error')
      assert.equal(error.code, '42501', 'Must return error code 42501')
      assert.ok(
        error.message.includes('Only admins can modify user status') || error.message.includes('permission denied'),
        `Error message must indicate admin authorization required: ${error.message}`
      )

      // Verify target user remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active', 'Target user status must remain active')
    })

    it('2.4. (B2) Authenticated non-admin cannot call admin_set_user_status alias (HTTP 403 / 42501 Unauthorized)', async () => {
      const { data, error } = await userAttackerClient.rpc('admin_set_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'suspended',
        p_reason: 'non_admin_attacker_alias_exploit',
      })

      assert.equal(data, null, 'Data must be null')
      assert.ok(error, 'Must return error')
      assert.equal(error.code, '42501', 'Must return error code 42501')

      // Verify target user remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active', 'Target user status must remain active')
    })

    it('2.5. (C) Admin self-protection: Admin cannot ban, suspend, or delete their own account', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: adminUserId,
        p_new_status: 'suspended',
        p_reason: 'admin_self_suspend_attempt',
      })

      assert.equal(data, null, 'Data must be null')
      assert.ok(error, 'Must return error')
      assert.equal(error.code, '42501', 'Must return error code 42501')
      assert.ok(
        error.message.includes('Admin tidak boleh mengubah status akun miliknya sendiri'),
        `Error must mention self-modification prevention: ${error.message}`
      )

      // Verify admin user status remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', adminUserId).single()
      assert.equal(p.status, 'active', 'Admin status must remain active')
    })

    it('2.6. (D1) Legitimate Admin can suspend target user with required reason', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'suspended',
        p_reason: 'Suspension for terms of service review',
      })

      assert.ifError(error)
      assert.ok(data?.success, 'Must succeed')
      assert.equal(data.action, 'USER_SUSPENDED')
      assert.equal(data.new_status, 'suspended')

      // Verify in DB
      const { data: p } = await serviceClient.from('profiles').select('status, status_reason').eq('id', userTargetId).single()
      assert.equal(p.status, 'suspended')
      assert.equal(p.status_reason, 'Suspension for terms of service review')
    })

    it('2.7. (D2) Legitimate Admin can unsuspend/restore target user to active', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'active',
        p_reason: 'Reactivation following review completion',
      })

      assert.ifError(error)
      assert.ok(data?.success, 'Must succeed')
      assert.equal(data.action, 'USER_UNSUSPENDED')
      assert.equal(data.new_status, 'active')

      // Verify in DB
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active')
    })

    it('2.8. (D3) Legitimate Admin can ban target user with required reason', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'banned',
        p_reason: 'Confirmed fraudulent transaction abuse',
      })

      assert.ifError(error)
      assert.ok(data?.success, 'Must succeed')
      assert.equal(data.action, 'USER_BANNED')
      assert.equal(data.new_status, 'banned')

      // Verify in DB & GoTrue auth.users
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'banned')

      const { data: u } = await serviceClient.auth.admin.getUserById(userTargetId)
      assert.ok(u?.user?.banned_until, 'GoTrue banned_until must be set')
    })

    it('2.9. (D4) Legitimate Admin can unban target user', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'active',
        p_reason: 'Account reinstated following appeal',
      })

      assert.ifError(error)
      assert.ok(data?.success, 'Must succeed')
      assert.equal(data.action, 'USER_UNBANNED')
      assert.equal(data.new_status, 'active')

      // Verify in DB & GoTrue auth.users
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active')

      const { data: u } = await serviceClient.auth.admin.getUserById(userTargetId)
      assert.ok(!u?.user?.banned_until || u.user.banned_until === 'none', 'GoTrue banned_until must be reset')
    })

    it('2.10. (E) Mandatory reason: Destructive/restrictive actions without reason are rejected (code 22023)', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'banned',
        p_reason: '', // Empty reason
      })

      assert.equal(data, null)
      assert.ok(error)
      assert.equal(error.code, '22023')
      assert.ok(error.message.includes('Alasan (reason) wajib diisi'))
    })

    it('2.11. (F1) Regular Admin CANNOT delete user (p_new_status = "deleted" rejected with 42501)', async () => {
      const { data, error } = await adminUserClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'deleted',
        p_reason: 'Attempted regular admin account deletion',
      })

      assert.equal(data, null)
      assert.ok(error)
      assert.equal(error.code, '42501')
      assert.ok(error.message.includes('Hanya SUPER_ADMIN yang memiliki izin untuk menghapus user'))

      // Verify target user remains active
      const { data: p } = await serviceClient.from('profiles').select('status').eq('id', userTargetId).single()
      assert.equal(p.status, 'active')
    })

    it('2.12. (F2) Super Admin CAN delete user (p_new_status = "deleted" succeeds)', async () => {
      const { data, error } = await superAdminClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'deleted',
        p_reason: 'Super admin confirmed account deletion',
      })

      assert.ifError(error)
      assert.ok(data?.success, 'Must succeed')
      assert.equal(data.action, 'USER_DELETED')
      assert.equal(data.new_status, 'deleted')

      // Verify profile is deleted in DB
      const { data: p } = await serviceClient.from('profiles').select('status, deleted_at').eq('id', userTargetId).single()
      assert.equal(p.status, 'deleted')
      assert.ok(p.deleted_at, 'deleted_at must be populated')
    })

    it('2.13. (G) service_role client can execute status updates reliably without rejection', async () => {
      // Re-activate target user via service_role to verify backend jobs work
      const { data, error } = await serviceClient.rpc('admin_update_user_status', {
        p_target_user_id: userTargetId,
        p_new_status: 'active',
        p_reason: 'Automated maintenance reset by service_role',
      })

      assert.ifError(error)
      assert.ok(data?.success)
      assert.equal(data.new_status, 'active')
    })

    it('2.14. (H) Audit log verification: Mutations are recorded in public.admin_audit_logs', async () => {
      const { data: logs, error } = await serviceClient
        .from('admin_audit_logs')
        .select('*')
        .eq('target_id', userTargetId)
        .order('created_at', { ascending: false })

      assert.ifError(error)
      assert.ok(logs.length > 0, 'Audit logs must exist for target user status changes')
      const actions = logs.map((l) => l.action)
      assert.ok(actions.includes('USER_SUSPENDED'), 'Must log USER_SUSPENDED')
      assert.ok(actions.includes('USER_UNSUSPENDED'), 'Must log USER_UNSUSPENDED')
      assert.ok(actions.includes('USER_BANNED'), 'Must log USER_BANNED')
      assert.ok(actions.includes('USER_DELETED'), 'Must log USER_DELETED')
    })
  })
})
