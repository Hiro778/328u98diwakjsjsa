/**
 * adminRbacService.js
 * Service for Super Admin / Admin Role & Permission Verification.
 * Conforms strictly to @admin.md Section 1, 30, 31:
 * - NEVER trusts client-side storage, React state, or URL parameters for admin roles.
 * - Always verifies privileges via server-side Postgres RPCs (is_admin, is_super_admin, has_admin_permission).
 */

import { supabase } from '../lib/supabase.js'

export const ADMIN_ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
}

export const ADMIN_PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_SUSPEND: 'users.suspend',
  USERS_BAN: 'users.ban',
  USERS_DELETE: 'users.delete',
  SUBSCRIPTIONS_READ: 'subscriptions.read',
  SUBSCRIPTIONS_MODIFY: 'subscriptions.modify',
  SUBSCRIPTIONS_CANCEL: 'subscriptions.cancel',
  AI_USAGE_READ: 'ai_usage.read',
  AI_CREDITS_ADJUST: 'ai_credits.adjust',
  SUPPORT_READ: 'support.read',
  SUPPORT_MANAGE: 'support.manage',
  PAYMENTS_READ: 'payments.read',
  AUDIT_LOGS_READ: 'audit_logs.read',
  SETTINGS_MANAGE: 'settings.manage',
  SUPER_ADMIN_ALL: 'super_admin.*',
}

/**
 * Checks if current authenticated session has ADMIN or SUPER_ADMIN role via server RPC.
 * @returns {Promise<{ isAdmin: boolean, error: any }>}
 */
export async function verifyServerAdmin() {
  try {
    const { data, error } = await supabase.rpc('is_admin')
    if (error) {
      return { isAdmin: false, error }
    }
    return { isAdmin: Boolean(data), error: null }
  } catch (err) {
    return { isAdmin: false, error: err }
  }
}

/**
 * Checks if current authenticated session has SUPER_ADMIN role via server RPC.
 * @returns {Promise<{ isSuperAdmin: boolean, error: any }>}
 */
export async function verifyServerSuperAdmin() {
  try {
    const { data, error } = await supabase.rpc('is_super_admin')
    if (error) {
      return { isSuperAdmin: false, error }
    }
    return { isSuperAdmin: Boolean(data), error: null }
  } catch (err) {
    return { isSuperAdmin: false, error: err }
  }
}

/**
 * Gets current admin role ('USER' | 'ADMIN' | 'SUPER_ADMIN') via server RPC.
 * @returns {Promise<{ role: string, error: any }>}
 */
export async function getServerAdminRole() {
  try {
    const { data, error } = await supabase.rpc('get_admin_role')
    if (error) {
      return { role: ADMIN_ROLES.USER, error }
    }
    return { role: data || ADMIN_ROLES.USER, error: null }
  } catch (err) {
    return { role: ADMIN_ROLES.USER, error: err }
  }
}

/**
 * Checks if current user has a specific granular admin permission via server RPC.
 * @param {string} permission
 * @returns {Promise<{ hasPermission: boolean, error: any }>}
 */
export async function verifyServerPermission(permission) {
  if (!permission || typeof permission !== 'string') {
    return { hasPermission: false, error: new Error('Permission string is required') }
  }

  try {
    const { data, error } = await supabase.rpc('has_admin_permission', {
      p_permission: permission,
    })
    if (error) {
      return { hasPermission: false, error }
    }
    return { hasPermission: Boolean(data), error: null }
  } catch (err) {
    return { hasPermission: false, error: err }
  }
}
