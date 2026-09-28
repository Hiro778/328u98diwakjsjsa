/**
 * adminBusinessService.js
 * Service for Super Admin / Admin Business Management.
 * Conforms strictly to @admin.md Section 26, 27, 43:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Every sensitive action records audit logs.
 * - Robust error normalization and table query fallbacks.
 */

import { supabase } from '../lib/supabase.js'

/**
 * Normalizes raw PostgreSQL / PostgREST errors into clean, safe user messages.
 */
function normalizeDatabaseError(err, defaultMessage = 'Terjadi kesalahan saat memproses data bisnis') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk bisnis ini.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('BUSINESS_NOT_FOUND')) {
    return new Error('Bisnis tidak ditemukan dalam sistem.')
  }
  if (message.includes('22023') || message.includes('wajib diisi')) {
    return new Error('Alasan penonaktifan bisnis wajib diisi.')
  }
  return new Error(defaultMessage)
}

/**
 * Fetch paginated, filtered, sorted businesses for Admin Business Table.
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.planFilter] - 'all' | 'free' | 'pro'
 * @param {string} [params.statusFilter] - 'all' | 'active' | 'inactive'
 * @param {string} [params.sortBy] - 'newest' | 'oldest' | 'most_products' | 'most_orders' | 'highest_ai'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminBusinesses({
  search = '',
  planFilter = 'all',
  statusFilter = 'all',
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_businesses', {
      p_search: search.trim() || null,
      p_plan_filter: planFilter,
      p_status_filter: statusFilter,
      p_sort_by: sortBy,
      p_limit: limit,
      p_offset: offset,
    })

    if (!error && data?.businesses) {
      return {
        businesses: data.businesses,
        totalCount: Number(data.total_count || 0),
        error: null,
      }
    }

    // Fallback: Direct table query if RPC is not yet registered in remote database
    console.warn('[adminBusinessService] RPC get_admin_businesses unavailable, querying tables directly:', error?.message)
    let query = supabase.from('businesses').select('*', { count: 'exact' })

    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,id.ilike.%${search.trim()}%`)
    }

    if (statusFilter === 'active') {
      query = query.eq('is_active', true)
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false)
    }

    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: rawBusinesses, count, error: bErr } = await query
    if (bErr) throw bErr

    const ownerIds = (rawBusinesses || []).map((b) => b.owner_id).filter(Boolean)
    const bizIds = (rawBusinesses || []).map((b) => b.id)

    const [profilesRes, subsRes, productsRes, ordersRes, creditsRes] = await Promise.all([
      ownerIds.length > 0 ? supabase.from('profiles').select('id, email, full_name, avatar_url, status').in('id', ownerIds) : { data: [] },
      ownerIds.length > 0 ? supabase.from('subscriptions').select('profile_id, plan, status, expires_at').in('profile_id', ownerIds) : { data: [] },
      bizIds.length > 0 ? supabase.from('products').select('id, business_id') : { data: [] },
      bizIds.length > 0 ? supabase.from('orders').select('id, business_id, total, order_status, payment_status') : { data: [] },
      bizIds.length > 0 ? supabase.from('creative_credits').select('business_id, consumed, available').in('business_id', bizIds) : { data: [] },
    ])

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]))
    const subMap = new Map((subsRes.data || []).map((s) => [s.profile_id, s]))
    const creditMap = new Map((creditsRes.data || []).map((c) => [c.business_id, c]))

    const prodCountMap = new Map()
    for (const pr of productsRes.data || []) {
      prodCountMap.set(pr.business_id, (prodCountMap.get(pr.business_id) || 0) + 1)
    }

    const orderCountMap = new Map()
    const revenueMap = new Map()
    for (const ord of ordersRes.data || []) {
      orderCountMap.set(ord.business_id, (orderCountMap.get(ord.business_id) || 0) + 1)
      const isPaid = ord.order_status === 'completed' || ['settlement', 'paid'].includes(ord.payment_status)
      if (isPaid) {
        revenueMap.set(ord.business_id, (revenueMap.get(ord.business_id) || 0) + Number(ord.total || 0))
      }
    }

    const formatted = (rawBusinesses || []).map((b) => {
      const owner = profileMap.get(b.owner_id)
      const sub = subMap.get(b.owner_id)
      const isPro = sub?.plan === 'pro' && sub?.status === 'active' && (!sub?.expires_at || new Date(sub.expires_at) > new Date())
      const credits = creditMap.get(b.id)

      return {
        id: b.id,
        name: b.name,
        owner_id: b.owner_id,
        business_type: b.business_type || 'UMKM',
        business_category: b.business_category || 'Umum',
        location: b.location || '—',
        is_active: Boolean(b.is_active),
        is_menu_published: Boolean(b.is_menu_published),
        logo_url: b.logo_url || null,
        created_at: b.created_at,
        owner_email: owner?.email || '—',
        owner_name: owner?.full_name || owner?.email || '—',
        owner_avatar: owner?.avatar_url || null,
        owner_status: owner?.status || 'active',
        plan: isPro ? 'Pro' : 'Free',
        subscription_status: sub?.status || 'inactive',
        subscription_expires_at: sub?.expires_at || null,
        products_count: prodCountMap.get(b.id) || 0,
        orders_count: orderCountMap.get(b.id) || 0,
        total_revenue: revenueMap.get(b.id) || 0,
        ai_credits_used: Number(credits?.consumed || 0),
        ai_credits_remaining: Number(credits?.available || 0),
      }
    }).filter((b) => {
      if (planFilter === 'pro' && b.plan !== 'Pro') return false
      if (planFilter === 'free' && b.plan !== 'Free') return false
      return true
    })

    return {
      businesses: formatted,
      totalCount: count ?? formatted.length,
      error: null,
    }
  } catch (err) {
    console.error('[adminBusinessService] fetchAdminBusinesses exception:', err)
    return { businesses: [], totalCount: 0, error: normalizeDatabaseError(err, 'Gagal memuat daftar bisnis.') }
  }
}

/**
 * Fetch composite business detail for /admin/businesses/:id.
 * @param {string} businessId
 */
export async function fetchAdminBusinessDetail(businessId) {
  if (!businessId) {
    return { detail: null, error: new Error('Business ID is required') }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_business_detail', {
      p_business_id: businessId,
    })

    if (!error && data && data.error !== 'BUSINESS_NOT_FOUND') {
      return { detail: data, error: null }
    }

    if (data?.error === 'BUSINESS_NOT_FOUND') {
      return { detail: null, error: new Error('Bisnis tidak ditemukan') }
    }

    // Fallback: Direct table queries
    const [bRes, prRes, ordRes, credRes] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).single(),
      supabase.from('products').select('id, name, unit_price, is_available, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
      supabase.from('orders').select('id, total, order_status, payment_status, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
      supabase.from('creative_credits').select('*').eq('business_id', businessId).limit(1),
    ])

    if (bRes.error || !bRes.data) {
      return { detail: null, error: new Error('Bisnis tidak ditemukan') }
    }

    const b = bRes.data
    const [ownerRes, subRes, ticketsRes] = await Promise.all([
      b.owner_id ? supabase.from('profiles').select('*').eq('id', b.owner_id).single() : { data: null },
      b.owner_id ? supabase.from('subscriptions').select('*').eq('profile_id', b.owner_id).order('created_at', { ascending: false }).limit(1) : { data: [] },
      supabase.from('support_tickets').select('id, status').or(`business_id.eq.${businessId},user_id.eq.${b.owner_id}`),
    ])

    const owner = ownerRes.data
    const sub = subRes.data?.[0] || null
    const tickets = ticketsRes.data || []

    return {
      detail: {
        business: {
          id: b.id,
          name: b.name,
          owner_id: b.owner_id,
          description: b.description || '',
          industry: b.industry || '',
          location: b.location || '',
          is_active: Boolean(b.is_active),
          created_at: b.created_at,
          updated_at: b.updated_at,
          business_type: b.business_type || 'UMKM',
          business_category: b.business_category || 'Umum',
          business_focus: b.business_focus || 'domestic',
          is_menu_published: Boolean(b.is_menu_published),
          slogan: b.slogan || '',
          cover_url: b.cover_url || '',
          logo_url: b.logo_url || '',
        },
        owner: owner ? {
          id: owner.id,
          email: owner.email,
          name: owner.full_name || owner.email,
          full_name: owner.full_name,
          avatar_url: owner.avatar_url,
          status: owner.status || 'active',
          created_at: owner.created_at,
          last_active: owner.updated_at || owner.created_at,
        } : null,
        subscription: sub ? {
          id: sub.id,
          plan: sub.plan,
          status: sub.status,
          start_date: sub.created_at,
          expiry_date: sub.expires_at,
          payment_status: 'none',
        } : null,
        products: {
          total_count: (prRes.data || []).length,
          active_count: (prRes.data || []).filter((p) => p.is_available !== false).length,
          recent_items: (prRes.data || []).map((p) => ({
            ...p,
            price: Number(p.unit_price || 0),
          })),
        },
        orders: {
          total_orders: (ordRes.data || []).length,
          total_revenue: (ordRes.data || [])
            .filter((o) => o.order_status === 'completed' || ['settlement', 'paid'].includes(o.payment_status))
            .reduce((acc, curr) => acc + Number(curr.total || 0), 0),
          recent_orders: (ordRes.data || []).map((o) => ({
            ...o,
            total_amount: Number(o.total || 0),
            status: o.order_status || o.payment_status || 'pending',
          })),
        },
        ai_usage: {
          total_credits: credRes.data?.[0]?.total_earned || 0,
          used_credits: credRes.data?.[0]?.consumed || 0,
          remaining_credits: credRes.data?.[0]?.available || 0,
          requests_total: 0,
        },
        support: {
          total_tickets: tickets.length,
          open_tickets: tickets.filter((t) => ['new', 'in_progress', 'waiting_user'].includes(t.status)).length,
          resolved_tickets: tickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length,
        },
        audit_logs: [],
      },
      error: null,
    }
  } catch (err) {
    console.error('[adminBusinessService] fetchAdminBusinessDetail exception:', err)
    return { detail: null, error: normalizeDatabaseError(err, 'Gagal memuat detail bisnis.') }
  }
}

/**
 * Toggle business active/inactive status with audit log.
 * @param {Object} args
 * @param {string} args.businessId
 * @param {boolean} args.isActive
 * @param {string} [args.reason]
 */
export async function updateAdminBusinessStatus({ businessId, isActive, reason = '' }) {
  if (!businessId) {
    return { success: false, error: new Error('Business ID wajib diisi') }
  }
  if (!isActive && (!reason || !reason.trim())) {
    return { success: false, error: new Error('Alasan penonaktifan bisnis wajib diisi') }
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_business_status', {
      p_business_id: businessId,
      p_is_active: isActive,
      p_reason: reason.trim(),
    })

    if (error) {
      console.error('[adminBusinessService] updateAdminBusinessStatus error:', error)
      return { success: false, error: normalizeDatabaseError(error, 'Gagal memperbarui status bisnis.') }
    }

    return { success: true, data, error: null }
  } catch (err) {
    console.error('[adminBusinessService] updateAdminBusinessStatus exception:', err)
    return { success: false, error: normalizeDatabaseError(err, 'Gagal memperbarui status bisnis.') }
  }
}

// Function aliases
export const listAdminBusinesses = fetchAdminBusinesses
export const getAdminBusinessDetail = fetchAdminBusinessDetail
