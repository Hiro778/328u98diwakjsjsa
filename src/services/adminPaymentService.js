/**
 * adminPaymentService.js
 * Service for Admin Control Center — Stage 8: Payments Management
 * Conforms strictly to @8.md & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Centralized read-only payment monitoring across order and subscription payments.
 * - Robust error normalization and table query fallbacks.
 * - Zero secrets exposed: raw responses sanitized.
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
export function normalizePaymentError(err, defaultMessage = 'Terjadi kesalahan saat memproses data pembayaran') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk manajemen pembayaran.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('PAYMENT_NOT_FOUND')) {
    return new Error('Data pembayaran tidak ditemukan dalam sistem.')
  }
  if (message.includes('INVALID_UUID') || message.includes('invalid input syntax for type uuid')) {
    return new Error('Format ID pembayaran tidak valid.')
  }
  if (message.includes('INVALID_PAYMENT_TYPE')) {
    return new Error('Tipe pembayaran tidak valid. Gunakan order atau subscription.')
  }
  return new Error(defaultMessage)
}

/**
 * Strips sensitive keys (tokens, server keys, authorization headers) from raw provider payload.
 */
export function sanitizeRawResponse(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const sanitized = { ...raw }
  const sensitiveKeys = [
    'server_key',
    'client_key',
    'authorization',
    'secret',
    'password',
    'token',
    'access_token',
    'apiKey',
    'api_key',
    'signature_key',
  ]
  for (const key of sensitiveKeys) {
    delete sanitized[key]
  }
  return sanitized
}

/**
 * Formats numeric amount to Indonesian Rupiah string (e.g. Rp 150.000).
 */
export function formatRupiah(amount) {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * Fetch unified payment metrics for Admin Payments Dashboard.
 */
export async function fetchAdminPaymentMetrics() {
  try {
    const { data, error } = await supabase.rpc('get_admin_payment_metrics')
    if (!error && data) {
      return {
        metrics: data,
        error: null,
      }
    }

    // Fallback: Direct table aggregation if RPC is unavailable
    console.warn('[adminPaymentService] RPC get_admin_payment_metrics unavailable, calculating via table queries:', error?.message)
    const [ordersRes, subsRes] = await Promise.all([
      supabase.from('payments').select('gross_amount, payment_status, created_at'),
      supabase.from('subscription_payments').select('gross_amount, payment_status, created_at'),
    ])

    const orderRows = ordersRes.data || []
    const subRows = subsRes.data || []

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    let paidCount = 0
    let pendingCount = 0
    let failedCount = 0
    let refundedCount = 0
    let totalGross = 0
    let todayGross = 0
    let monthGross = 0

    const processRow = (row) => {
      const status = (row.payment_status || '').toLowerCase()
      const amt = Number(row.gross_amount) || 0
      const createdAt = new Date(row.created_at).getTime()

      if (['paid', 'settlement', 'capture'].includes(status)) {
        paidCount++
        totalGross += amt
        if (createdAt >= todayStart) todayGross += amt
        if (createdAt >= monthStart) monthGross += amt
      } else if (status === 'pending') {
        pendingCount++
      } else if (['failed', 'cancel', 'expire', 'deny', 'dibatalkan'].includes(status)) {
        failedCount++
      } else if (['refund', 'refunded'].includes(status)) {
        refundedCount++
      }
    }

    orderRows.forEach(processRow)
    subRows.forEach(processRow)

    return {
      metrics: {
        total_payments: orderRows.length + subRows.length,
        order_payments_count: orderRows.length,
        subscription_payments_count: subRows.length,
        paid_count: paidCount,
        pending_count: pendingCount,
        failed_count: failedCount,
        refunded_count: refundedCount,
        total_gross_amount: totalGross,
        today_gross_amount: todayGross,
        month_gross_amount: monthGross,
      },
      error: null,
    }
  } catch (err) {
    console.error('[adminPaymentService.fetchAdminPaymentMetrics] Error:', err)
    return { metrics: null, error: normalizePaymentError(err) }
  }
}

/**
 * Fetch paginated, filtered, sorted payments for Admin Payment Table.
 *
 * @param {Object} params
 * @param {string} [params.paymentType='all'] - 'all' | 'order' | 'subscription'
 * @param {string} [params.search='']
 * @param {string} [params.paymentProvider='all']
 * @param {string} [params.paymentMethod='all']
 * @param {string} [params.paymentStatus='all']
 * @param {string} [params.transactionStatus='all']
 * @param {string|null} [params.dateFrom=null]
 * @param {string|null} [params.dateTo=null]
 * @param {string} [params.sortBy='newest'] - 'newest' | 'oldest' | 'amount_desc' | 'amount_asc'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminPayments({
  paymentType = 'all',
  search = '',
  paymentProvider = 'all',
  paymentMethod = 'all',
  paymentStatus = 'all',
  transactionStatus = 'all',
  dateFrom = null,
  dateTo = null,
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_payments', {
      p_payment_type: paymentType,
      p_search: search.trim() || null,
      p_payment_provider: paymentProvider,
      p_payment_method: paymentMethod,
      p_payment_status: paymentStatus,
      p_transaction_status: transactionStatus,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_sort: sortBy,
      p_limit: limit,
      p_offset: offset,
    })

    if (!error && data?.records) {
      return {
        records: data.records,
        totalCount: Number(data.total_count || 0),
        error: null,
      }
    }

    // Fallback: Query tables directly if RPC is not installed
    console.warn('[adminPaymentService] RPC get_admin_payments unavailable, querying tables directly:', error?.message)

    const promises = []

    if (paymentType === 'all' || paymentType === 'order') {
      let qOrders = supabase
        .from('payments')
        .select(`
          id,
          order_id,
          business_id,
          payment_provider,
          transaction_id,
          payment_method,
          gross_amount,
          transaction_status,
          payment_status,
          paid_at,
          created_at,
          updated_at,
          orders ( order_number, customer_name ),
          businesses ( name, owner_id )
        `)
      promises.push(
        qOrders.then((res) => {
          if (res.error) throw res.error
          return (res.data || []).map((p) => ({
            payment_id: p.id,
            payment_type: 'order',
            order_id: p.order_id,
            order_number: p.orders?.order_number || null,
            subscription_id: null,
            subscription_plan: null,
            user_id: p.businesses?.owner_id || null,
            user_name: '—',
            user_email: '—',
            business_id: p.business_id,
            business_name: p.businesses?.name || '—',
            payment_provider: p.payment_provider || 'manual',
            payment_method: p.payment_method || '—',
            transaction_id: p.transaction_id || '',
            midtrans_order_id: p.payment_provider === 'midtrans' ? p.transaction_id : null,
            gross_amount: Number(p.gross_amount) || 0,
            payment_status: p.payment_status,
            transaction_status: p.transaction_status || '',
            paid_at: p.paid_at,
            created_at: p.created_at,
            updated_at: p.updated_at,
          }))
        })
      )
    }

    if (paymentType === 'all' || paymentType === 'subscription') {
      let qSubs = supabase
        .from('subscription_payments')
        .select(`
          id,
          subscription_id,
          profile_id,
          midtrans_order_id,
          gross_amount,
          payment_method,
          transaction_status,
          payment_status,
          paid_at,
          created_at,
          updated_at,
          subscriptions ( plan, business_id ),
          profiles ( full_name, email )
        `)
      promises.push(
        qSubs.then((res) => {
          if (res.error) throw res.error
          return (res.data || []).map((sp) => ({
            payment_id: sp.id,
            payment_type: 'subscription',
            order_id: null,
            order_number: null,
            subscription_id: sp.subscription_id,
            subscription_plan: sp.subscriptions?.plan || 'pro',
            user_id: sp.profile_id,
            user_name: sp.profiles?.full_name || '—',
            user_email: sp.profiles?.email || '—',
            business_id: sp.subscriptions?.business_id || null,
            business_name: '—',
            payment_provider: 'midtrans',
            payment_method: sp.payment_method || 'snap',
            transaction_id: sp.midtrans_order_id,
            midtrans_order_id: sp.midtrans_order_id,
            gross_amount: Number(sp.gross_amount) || 0,
            payment_status: sp.payment_status,
            transaction_status: sp.transaction_status || '',
            paid_at: sp.paid_at,
            created_at: sp.created_at,
            updated_at: sp.updated_at,
          }))
        })
      )
    }

    const results = await Promise.all(promises)
    let combined = results.flat()

    // Client-side filtering fallback
    if (paymentProvider !== 'all') {
      combined = combined.filter((r) => r.payment_provider.toLowerCase() === paymentProvider.toLowerCase())
    }
    if (paymentMethod !== 'all') {
      combined = combined.filter((r) => r.payment_method.toLowerCase() === paymentMethod.toLowerCase())
    }
    if (paymentStatus !== 'all') {
      combined = combined.filter((r) => {
        if (paymentStatus === 'paid') return ['paid', 'settlement', 'capture'].includes(r.payment_status.toLowerCase())
        if (paymentStatus === 'pending') return r.payment_status.toLowerCase() === 'pending'
        if (paymentStatus === 'failed') return ['failed', 'cancel', 'expire', 'deny', 'dibatalkan'].includes(r.payment_status.toLowerCase())
        if (paymentStatus === 'refunded') return ['refund', 'refunded'].includes(r.payment_status.toLowerCase())
        return r.payment_status.toLowerCase() === paymentStatus.toLowerCase()
      })
    }
    if (transactionStatus !== 'all') {
      combined = combined.filter((r) => r.transaction_status.toLowerCase() === transactionStatus.toLowerCase())
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      combined = combined.filter(
        (r) =>
          r.payment_id.toLowerCase().includes(q) ||
          (r.order_id && r.order_id.toLowerCase().includes(q)) ||
          (r.transaction_id && r.transaction_id.toLowerCase().includes(q)) ||
          (r.midtrans_order_id && r.midtrans_order_id.toLowerCase().includes(q)) ||
          r.user_name.toLowerCase().includes(q) ||
          r.user_email.toLowerCase().includes(q) ||
          r.business_name.toLowerCase().includes(q)
      )
    }
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime()
      combined = combined.filter((r) => new Date(r.created_at).getTime() >= fromTime)
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime()
      combined = combined.filter((r) => new Date(r.created_at).getTime() <= toTime)
    }

    // Client-side sorting fallback
    if (sortBy === 'oldest') {
      combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    } else if (sortBy === 'amount_desc') {
      combined.sort((a, b) => b.gross_amount - a.gross_amount)
    } else if (sortBy === 'amount_asc') {
      combined.sort((a, b) => a.gross_amount - b.gross_amount)
    } else {
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    const totalCount = combined.length
    const paginated = combined.slice(offset, offset + limit)

    return {
      records: paginated,
      totalCount,
      error: null,
    }
  } catch (err) {
    console.error('[adminPaymentService.fetchAdminPayments] Error:', err)
    return { records: [], totalCount: 0, error: normalizePaymentError(err) }
  }
}

/**
 * Fetch detailed payment record by ID with sanitized response.
 *
 * @param {string} paymentId
 * @param {string} [paymentType='auto'] - 'auto' | 'order' | 'subscription'
 */
export async function fetchAdminPaymentDetail(paymentId, paymentType = 'auto') {
  if (!isValidUuid(paymentId)) {
    return { payment: null, error: new Error('Format ID pembayaran tidak valid.') }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_payment_detail', {
      p_payment_id: paymentId,
      p_payment_type: paymentType,
    })

    if (!error && data) {
      return {
        payment: data,
        error: null,
      }
    }

    // Fallback: Direct table lookup if RPC is not registered
    console.warn('[adminPaymentService] RPC get_admin_payment_detail unavailable, querying table fallback:', error?.message)

    // Try public.payments first
    if (paymentType === 'auto' || paymentType === 'order') {
      const { data: pData, error: pErr } = await supabase
        .from('payments')
        .select(`
          *,
          orders ( order_number, customer_name, order_status, order_source ),
          businesses ( name, owner_id )
        `)
        .eq('id', paymentId)
        .maybeSingle()

      if (!pErr && pData) {
        let userProfile = null
        if (pData.businesses?.owner_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', pData.businesses.owner_id)
            .maybeSingle()
          userProfile = prof
        }

        return {
          payment: {
            id: pData.id,
            payment_type: 'order',
            order_id: pData.order_id,
            order_number: pData.orders?.order_number || null,
            order_status: pData.orders?.order_status || '—',
            customer_name: pData.orders?.customer_name || '—',
            order_source: pData.orders?.order_source || 'pos',
            business_id: pData.business_id,
            business_name: pData.businesses?.name || '—',
            user_id: pData.businesses?.owner_id || null,
            user_name: userProfile?.full_name || '—',
            user_email: userProfile?.email || '—',
            payment_provider: pData.payment_provider || 'manual',
            payment_method: pData.payment_method || '—',
            transaction_id: pData.transaction_id || '',
            gross_amount: Number(pData.gross_amount) || 0,
            payment_status: pData.payment_status,
            transaction_status: pData.transaction_status || '',
            paid_at: pData.paid_at,
            created_at: pData.created_at,
            updated_at: pData.updated_at,
            safe_metadata: sanitizeRawResponse(pData.raw_response),
          },
          error: null,
        }
      }
    }

    // Try public.subscription_payments
    if (paymentType === 'auto' || paymentType === 'subscription') {
      const { data: spData, error: spErr } = await supabase
        .from('subscription_payments')
        .select(`
          *,
          subscriptions ( plan, status, business_id ),
          profiles ( full_name, email )
        `)
        .eq('id', paymentId)
        .maybeSingle()

      if (!spErr && spData) {
        let bizName = '—'
        if (spData.subscriptions?.business_id) {
          const { data: bz } = await supabase
            .from('businesses')
            .select('name')
            .eq('id', spData.subscriptions.business_id)
            .maybeSingle()
          if (bz) bizName = bz.name
        }

        return {
          payment: {
            id: spData.id,
            payment_type: 'subscription',
            subscription_id: spData.subscription_id,
            subscription_plan: spData.subscriptions?.plan || 'pro',
            subscription_status: spData.subscriptions?.status || 'active',
            profile_id: spData.profile_id,
            user_id: spData.profile_id,
            user_name: spData.profiles?.full_name || '—',
            user_email: spData.profiles?.email || '—',
            business_id: spData.subscriptions?.business_id || null,
            business_name: bizName,
            payment_provider: 'midtrans',
            payment_method: spData.payment_method || 'snap',
            transaction_id: spData.midtrans_order_id,
            midtrans_order_id: spData.midtrans_order_id,
            gross_amount: Number(spData.gross_amount) || 0,
            payment_status: spData.payment_status,
            transaction_status: spData.transaction_status || '',
            period_start: spData.period_start,
            period_end: spData.period_end,
            paid_at: spData.paid_at,
            created_at: spData.created_at,
            updated_at: spData.updated_at,
            safe_metadata: sanitizeRawResponse(spData.raw_response),
          },
          error: null,
        }
      }
    }

    return { payment: null, error: new Error('Pembayaran tidak ditemukan dalam sistem.') }
  } catch (err) {
    console.error('[adminPaymentService.fetchAdminPaymentDetail] Error:', err)
    return { payment: null, error: normalizePaymentError(err) }
  }
}
