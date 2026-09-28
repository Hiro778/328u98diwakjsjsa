/**
 * adminSubscriptionService.js
 * Service for Admin Control Center — Stage 5: Subscription Management
 * Conforms strictly to @qr.md Stage 5 & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Every sensitive action records audit logs.
 * - Robust error normalization and table query fallbacks.
 */

import { supabase } from '../lib/supabase.js'

/**
 * Validates whether a given string is a valid UUIDv4.
 */
export function isValidUuid(str) {
  if (!str || typeof str !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim())
}

/**
 * Normalizes raw PostgreSQL / PostgREST errors into clean, safe user messages.
 */
export function normalizeDatabaseError(err, defaultMessage = 'Terjadi kesalahan saat memproses data langganan') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk langganan ini.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('SUBSCRIPTION_NOT_FOUND')) {
    return new Error('Langganan tidak ditemukan dalam sistem.')
  }
  if (message.includes('22023') || message.includes('wajib diisi') || message.includes('INVALID_REASON')) {
    return new Error('Alasan pembatalan langganan wajib diisi.')
  }
  return new Error(defaultMessage)
}

/**
 * Fetch paginated, filtered, sorted subscriptions for Admin Subscription Table.
 *
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.planFilter] - 'all' | 'free' | 'pro'
 * @param {string} [params.statusFilter] - 'all' | 'active' | 'expired' | 'cancelled' | 'inactive'
 * @param {string} [params.sortBy] - 'newest' | 'oldest' | 'expires_soon' | 'expires_late'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminSubscriptions({
  search = '',
  planFilter = 'all',
  statusFilter = 'all',
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_subscriptions', {
      p_search: search.trim() || null,
      p_plan_filter: planFilter,
      p_status_filter: statusFilter,
      p_sort_by: sortBy,
      p_limit: limit,
      p_offset: offset,
    })

    if (!error && data?.subscriptions) {
      return {
        subscriptions: data.subscriptions,
        totalCount: Number(data.total_count || 0),
        error: null,
      }
    }

    // Fallback: Direct table query if RPC is not registered
    console.warn('[adminSubscriptionService] RPC get_admin_subscriptions unavailable, querying tables directly:', error?.message)
    let query = supabase.from('subscriptions').select('*', { count: 'exact' })

    if (planFilter !== 'all') {
      query = query.eq('plan', planFilter)
    }

    if (statusFilter !== 'all' && statusFilter !== 'expired') {
      query = query.eq('status', statusFilter)
    }

    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else if (sortBy === 'expires_soon') {
      query = query.order('expires_at', { ascending: true, nullsFirst: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: rawSubs, count, error: sErr } = await query
    if (sErr) throw sErr

    const profileIds = (rawSubs || []).map((s) => s.profile_id).filter(Boolean)
    const bizIds = (rawSubs || []).map((s) => s.business_id).filter(Boolean)

    const [profilesRes, businessesRes, paymentsRes] = await Promise.all([
      profileIds.length > 0 ? supabase.from('profiles').select('id, email, full_name, avatar_url, status').in('id', profileIds) : { data: [] },
      bizIds.length > 0 ? supabase.from('businesses').select('id, name').in('id', bizIds) : { data: [] },
      profileIds.length > 0 ? supabase.from('subscription_payments').select('subscription_id, profile_id, gross_amount, payment_method, payment_status, paid_at').in('profile_id', profileIds) : { data: [] },
    ])

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]))
    const bizMap = new Map((businessesRes.data || []).map((b) => [b.id, b]))

    const now = Date.now()
    const enriched = (rawSubs || []).map((sub) => {
      const p = profileMap.get(sub.profile_id)
      const b = bizMap.get(sub.business_id)

      let computedStatus = sub.status
      if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at).getTime() <= now) {
        computedStatus = 'expired'
      }

      const payments = (paymentsRes.data || []).filter((pay) => pay.subscription_id === sub.id || pay.profile_id === sub.profile_id)
      const lastPayment = payments.length > 0 ? payments[0] : null

      return {
        ...sub,
        status: computedStatus,
        raw_status: sub.status,
        user: p ? {
          id: p.id,
          email: p.email,
          name: p.full_name || p.email,
          avatar_url: p.avatar_url,
          status: p.status,
        } : null,
        business_name: b ? b.name : '—',
        last_payment: lastPayment ? {
          amount: lastPayment.gross_amount,
          method: lastPayment.payment_method,
          status: lastPayment.payment_status,
          paid_at: lastPayment.paid_at,
        } : null,
      }
    })

    return {
      subscriptions: enriched,
      totalCount: Number(count || 0),
      error: null,
    }
  } catch (err) {
    return {
      subscriptions: [],
      totalCount: 0,
      error: normalizeDatabaseError(err, 'Gagal memuat daftar langganan'),
    }
  }
}

/**
 * Fetch complete subscription detail for Admin Control Center.
 *
 * @param {string} subscriptionId
 */
export async function fetchAdminSubscriptionDetail(subscriptionId) {
  if (!isValidUuid(subscriptionId)) {
    return {
      detail: null,
      error: new Error('ID langganan tidak valid'),
    }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_subscription_detail', {
      p_subscription_id: subscriptionId,
    })

    if (!error && data?.subscription) {
      return {
        detail: data,
        error: null,
      }
    }

    // Fallback: Direct table query
    console.warn('[adminSubscriptionService] RPC get_admin_subscription_detail unavailable, fallback:', error?.message)
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single()

    if (subErr || !sub) {
      throw subErr || new Error('SUBSCRIPTION_NOT_FOUND')
    }

    const [profileRes, bizRes, paymentsRes, auditRes] = await Promise.all([
      sub.profile_id ? supabase.from('profiles').select('*').eq('id', sub.profile_id).single() : { data: null },
      sub.business_id ? supabase.from('businesses').select('*').eq('id', sub.business_id).single() : { data: null },
      supabase.from('subscription_payments').select('*').eq('subscription_id', subscriptionId).order('created_at', { ascending: false }),
      supabase.from('admin_audit_logs').select('*').eq('target_type', 'subscription').eq('target_id', subscriptionId).order('created_at', { ascending: false }),
    ])

    let computedStatus = sub.status
    if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at).getTime() <= Date.now()) {
      computedStatus = 'expired'
    }

    return {
      detail: {
        subscription: {
          ...sub,
          status: computedStatus,
          raw_status: sub.status,
        },
        owner: profileRes.data ? {
          id: profileRes.data.id,
          email: profileRes.data.email,
          name: profileRes.data.full_name || profileRes.data.email,
          avatar_url: profileRes.data.avatar_url,
          status: profileRes.data.status,
          created_at: profileRes.data.created_at,
        } : null,
        business: bizRes.data,
        payments: paymentsRes.data || [],
        audit_logs: auditRes.data || [],
      },
      error: null,
    }
  } catch (err) {
    return {
      detail: null,
      error: normalizeDatabaseError(err, 'Gagal memuat detail langganan'),
    }
  }
}

/**
 * Cancel a subscription as an administrator with mandatory reason and audit log.
 *
 * @param {Object} params
 * @param {string} params.subscriptionId - UUID of subscription
 * @param {string} params.reason - Mandatory audit explanation
 */
export async function cancelAdminSubscription({ subscriptionId, reason }) {
  if (!isValidUuid(subscriptionId)) {
    return {
      success: false,
      error: new Error('ID langganan tidak valid'),
    }
  }

  if (!reason || !reason.trim()) {
    return {
      success: false,
      error: new Error('Alasan pembatalan langganan wajib diisi.'),
    }
  }

  try {
    const { data, error } = await supabase.rpc('admin_cancel_subscription', {
      p_subscription_id: subscriptionId,
      p_reason: reason.trim(),
    })

    if (error) throw error

    return {
      success: true,
      data,
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      error: normalizeDatabaseError(err, 'Gagal membatalkan langganan'),
    }
  }
}
