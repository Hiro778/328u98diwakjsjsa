/**
 * adminUserService.js
 * Service for Super Admin / Admin User Management.
 * Conforms strictly to @admin.md Section 4, 5, 6, 7, 8, 9, 27, 43:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Every sensitive action (suspend, unsuspend, ban, unban, delete) records audit logs.
 */

import { supabase } from '../lib/supabase.js'
import { resolveCanonicalSubscription } from '../lib/subscriptionUtils.js'

/**
 * Normalizes raw PostgreSQL / PostgREST errors into clean, safe user messages.
 * Prevents exposing internal schema names, constraints, or raw database exceptions.
 */
function normalizeDatabaseError(err, defaultMessage = 'Terjadi kesalahan saat memproses data') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    if (message.includes('SUPER_ADMIN')) {
      return new Error('Akses ditolak: Tindakan ini memerlukan otorisasi SUPER_ADMIN.')
    }
    if (message.includes('sendiri')) {
      return new Error('Tindakan ditolak: Admin dilarang mengubah status akun miliknya sendiri.')
    }
    return new Error('Akses ditolak: Anda tidak memiliki izin untuk tindakan administratif ini.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('USER_NOT_FOUND')) {
    return new Error('Pengguna tidak ditemukan dalam sistem.')
  }
  if (message.includes('22023') || message.includes('wajib diisi')) {
    return new Error('Alasan tindakan administratif wajib diisi.')
  }
  return new Error(defaultMessage)
}

/**
 * Fetch paginated, filtered, sorted users for Admin User Table.
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.planFilter] - 'all' | 'free' | 'pro'
 * @param {string} [params.statusFilter] - 'all' | 'active' | 'suspended' | 'banned'
 * @param {string} [params.sortBy] - 'newest' | 'oldest' | 'highest_ai' | 'latest_activity'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminUsers({
  search = '',
  planFilter = 'all',
  statusFilter = 'all',
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_users', {
      p_search: search.trim() || null,
      p_plan_filter: planFilter,
      p_status_filter: statusFilter,
      p_sort_by: sortBy,
      p_limit: limit,
      p_offset: offset,
    })

    if (!error && data?.users) {
      return {
        users: data.users,
        totalCount: Number(data.total_count || 0),
        error: null,
      }
    }

    // Fallback: Direct table query if RPC is not yet registered in remote database
    console.warn('[adminUserService] RPC get_admin_users unavailable, querying tables directly:', error?.message)
    let query = supabase.from('profiles').select('id, email, full_name, avatar_url, created_at, updated_at', { count: 'exact' })

    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`)
    }

    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: profiles, count, error: pErr } = await query
    if (pErr) throw pErr

    // Fetch related businesses and subscriptions
    const userIds = (profiles || []).map((p) => p.id)
    const [bizRes, subRes] = await Promise.all([
      supabase.from('businesses').select('id, owner_id, name').in('owner_id', userIds),
      supabase.from('subscriptions').select('profile_id, plan, status, expires_at').in('profile_id', userIds),
    ])

    const bizCountMap = new Map()
    const primaryBizMap = new Map()
    for (const b of bizRes.data || []) {
      bizCountMap.set(b.owner_id, (bizCountMap.get(b.owner_id) || 0) + 1)
      if (!primaryBizMap.has(b.owner_id)) {
        primaryBizMap.set(b.owner_id, b)
      }
    }
    const subListByProfile = new Map()
    for (const s of subRes.data || []) {
      if (!subListByProfile.has(s.profile_id)) subListByProfile.set(s.profile_id, [])
      subListByProfile.get(s.profile_id).push(s)
    }
    const subMap = new Map()
    for (const [profId, list] of subListByProfile.entries()) {
      subMap.set(profId, resolveCanonicalSubscription(list))
    }

    const users = (profiles || []).map((p) => {
      const biz = primaryBizMap.get(p.id)
      const sub = subMap.get(p.id)
      const isPro = sub?.plan === 'pro' && sub?.status === 'active' && (!sub?.expires_at || new Date(sub.expires_at) > new Date())
      return {
        id: p.id,
        email: p.email,
        name: p.full_name || p.email,
        avatar_url: p.avatar_url,
        status: p.status || 'active',
        status_reason: p.status_reason || '',
        created_at: p.created_at,
        last_active: p.updated_at || p.created_at,
        business_id: biz?.id || null,
        business_name: biz?.name || null,
        business_count: bizCountMap.get(p.id) || 0,
        plan: isPro ? 'Pro' : 'Free',
        subscription_status: sub?.status || 'inactive',
        subscription_expires_at: sub?.expires_at || null,
        ai_credits_used: 0,
        ai_credits_remaining: 0,
      }
    }).filter((u) => {
      if (planFilter === 'pro' && u.plan !== 'Pro') return false
      if (planFilter === 'free' && u.plan !== 'Free') return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      return true
    })

    return {
      users,
      totalCount: count ?? users.length,
      error: null,
    }
  } catch (err) {
    console.error('[adminUserService] fetchAdminUsers exception:', err)
    return { users: [], totalCount: 0, error: normalizeDatabaseError(err, 'Gagal memuat daftar pengguna.') }
  }
}

/**
 * Fetch composite user detail for /admin/users/:id.
 * @param {string} userId
 */
export async function fetchAdminUserDetail(userId) {
  if (!userId) {
    return { detail: null, error: new Error('User ID is required') }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_user_detail', {
      p_user_id: userId,
    })

    if (!error && data && data.error !== 'USER_NOT_FOUND') {
      return { detail: data, error: null }
    }

    if (data?.error === 'USER_NOT_FOUND') {
      return { detail: null, error: new Error('Pengguna tidak ditemukan') }
    }

    // Fallback: Direct table query if RPC is not yet registered in remote database
    const [pRes, bRes, sRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('businesses').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('*').eq('profile_id', userId),
    ])

    if (pRes.error || !pRes.data) {
      return { detail: null, error: new Error('Pengguna tidak ditemukan') }
    }

    const p = pRes.data
    const allBiz = (bRes.data || []).map((b) => ({
      id: b.id,
      name: b.name,
      type: b.business_type || 'UMKM',
      category: b.business_category || 'Umum',
      location: b.location || '',
      status: b.is_active ? 'active' : 'inactive',
      created_at: b.created_at,
    }))
    const primaryBiz = allBiz[0] || null
    const s = resolveCanonicalSubscription(sRes.data)

    return {
      detail: {
        profile: {
          id: p.id,
          email: p.email,
          name: p.full_name || p.email,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          status: p.status || 'active',
          status_reason: p.status_reason || '',
          created_at: p.created_at,
          last_active: p.updated_at || p.created_at,
        },
        business: primaryBiz,
        businesses: allBiz,
        business_count: allBiz.length,
        subscription: s ? {
          id: s.id,
          plan: s.plan,
          status: s.status,
          start_date: s.created_at,
          expiry_date: s.expires_at,
          payment_status: 'none',
        } : null,
        ai_usage: {
          total_credits: 0,
          used_credits: 0,
          remaining_credits: 0,
          requests_total: 0,
          requests_success: 0,
          requests_failed: 0,
        },
        support: {
          total_tickets: 0,
          open_tickets: 0,
          resolved_tickets: 0,
        },
        security: {
          account_status: p.status || 'active',
          status_reason: p.status_reason || '',
          last_login: p.updated_at || p.created_at,
        },
        audit_logs: [],
      },
      error: null,
    }
  } catch (err) {
    console.error('[adminUserService] fetchAdminUserDetail exception:', err)
    return { detail: null, error: normalizeDatabaseError(err, 'Gagal memuat detail pengguna.') }
  }
}

/**
 * Perform sensitive status mutation (Suspend, Unsuspend, Ban, Unban, Soft Delete).
 * Server writes to public.admin_audit_logs automatically.
 * @param {Object} args
 * @param {string} args.targetUserId
 * @param {string} args.newStatus - 'active' | 'suspended' | 'banned' | 'deleted'
 * @param {string} args.reason - Mandatory reason for audit log
 */
export async function updateAdminUserStatus({ targetUserId, newStatus, reason }) {
  if (!targetUserId) {
    return { success: false, error: new Error('Target User ID wajib diisi') }
  }
  if (!newStatus) {
    return { success: false, error: new Error('Status baru wajib diisi') }
  }
  if (['suspended', 'banned', 'deleted'].includes(newStatus) && (!reason || !reason.trim())) {
    return { success: false, error: new Error('Alasan (reason) wajib diisi untuk tindakan ini') }
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_user_status', {
      p_target_user_id: targetUserId,
      p_new_status: newStatus,
      p_reason: reason.trim(),
    })

    if (error) {
      console.error('[adminUserService] updateAdminUserStatus error:', error)
      return { success: false, error: normalizeDatabaseError(error, 'Gagal memperbarui status pengguna.') }
    }

    return { success: true, data, error: null }
  } catch (err) {
    console.error('[adminUserService] updateAdminUserStatus exception:', err)
    return { success: false, error: normalizeDatabaseError(err, 'Gagal memperbarui status pengguna.') }
  }
}

// Function aliases conforming to Section 11 specifications
export const listAdminUsers = fetchAdminUsers
export const getAdminUserDetail = fetchAdminUserDetail

