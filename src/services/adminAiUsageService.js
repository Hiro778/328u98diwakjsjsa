/**
 * adminAiUsageService.js
 * Service for Admin Control Center — Stage 6: AI Usage Management
 * Conforms strictly to @6.md & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Robust error normalization and PostgREST table query fallbacks.
 * - Read-only monitoring without changing entitlements or billing.
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
export function normalizeAiUsageError(err, defaultMessage = 'Terjadi kesalahan saat memproses data AI usage') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk monitoring AI usage.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('AI_USAGE_NOT_FOUND')) {
    return new Error('Catatan AI usage tidak ditemukan dalam sistem.')
  }
  if (message.includes('INVALID_UUID') || message.includes('invalid input syntax for type uuid')) {
    return new Error('Format ID AI usage tidak valid.')
  }
  return new Error(defaultMessage)
}

/**
 * Fetch paginated, filtered, sorted AI usage records for Admin AI Usage Table.
 *
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.timeRange='all'] - 'today' | '7d' | '30d' | 'all'
 * @param {string} [params.operationFilter='all']
 * @param {string} [params.modelFilter='all']
 * @param {string} [params.statusFilter='all']
 * @param {string} [params.sortBy='newest'] - 'newest' | 'oldest' | 'highest_tokens' | 'highest_credits' | 'highest_cost'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminAiUsage({
  search = '',
  timeRange = 'all',
  operationFilter = 'all',
  modelFilter = 'all',
  statusFilter = 'all',
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_ai_usage', {
      p_search: search.trim() || null,
      p_time_range: timeRange,
      p_operation_filter: operationFilter,
      p_model_filter: modelFilter,
      p_status_filter: statusFilter,
      p_sort_by: sortBy,
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

    // Fallback: Direct table query if RPC is not registered
    console.warn('[adminAiUsageService] RPC get_admin_ai_usage unavailable, querying tables directly:', error?.message)
    let query = supabase.from('ai_usage').select(
      'id, business_id, profile_id, operation, model, input_tokens, output_tokens, total_tokens, credits_charged, provider_cost_usd, is_estimated, status, request_id, metadata, created_at, profiles:profile_id(id, email, full_name), businesses:business_id(id, name)',
      { count: 'exact' }
    )

    // Time filter
    if (timeRange === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      query = query.gte('created_at', today.toISOString())
    } else if (timeRange === '7d') {
      const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      query = query.gte('created_at', d7.toISOString())
    } else if (timeRange === '30d') {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      query = query.gte('created_at', d30.toISOString())
    }

    if (operationFilter !== 'all') {
      query = query.eq('operation', operationFilter)
    }

    if (modelFilter !== 'all') {
      query = query.eq('model', modelFilter)
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (search.trim()) {
      const term = search.trim()
      query = query.or(`request_id.ilike.%${term}%,model.ilike.%${term}%,operation.ilike.%${term}%`)
    }

    // Sorting
    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else if (sortBy === 'highest_tokens') {
      query = query.order('total_tokens', { ascending: false })
    } else if (sortBy === 'highest_credits') {
      query = query.order('credits_charged', { ascending: false })
    } else if (sortBy === 'highest_cost') {
      query = query.order('provider_cost_usd', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: rows, count, error: queryErr } = await query
    if (queryErr) throw queryErr

    const records = (rows || []).map((row) => ({
      ...row,
      user: row.profiles || null,
      business: row.businesses || null,
    }))

    return {
      records,
      totalCount: count || 0,
      error: null,
    }
  } catch (err) {
    return {
      records: [],
      totalCount: 0,
      error: normalizeAiUsageError(err),
    }
  }
}

/**
 * Fetch summary statistics for Admin AI Usage Cards.
 *
 * @param {Object} params
 * @param {string} [params.timeRange='all']
 */
export async function fetchAdminAiUsageStats({ timeRange = 'all' } = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_ai_usage_stats', {
      p_time_range: timeRange,
    })

    if (!error && data) {
      return {
        stats: data,
        error: null,
      }
    }

    // Fallback: Compute stats from direct table query
    console.warn('[adminAiUsageService] RPC get_admin_ai_usage_stats unavailable, aggregating directly:', error?.message)
    let query = supabase.from('ai_usage').select('id, credits_charged, total_tokens, input_tokens, output_tokens, provider_cost_usd, profile_id, business_id, status, created_at')

    if (timeRange === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      query = query.gte('created_at', today.toISOString())
    } else if (timeRange === '7d') {
      const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      query = query.gte('created_at', d7.toISOString())
    } else if (timeRange === '30d') {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      query = query.gte('created_at', d30.toISOString())
    }

    const { data: rows, error: qErr } = await query
    if (qErr) throw qErr

    const safeRows = rows || []
    const totalRequests = safeRows.length
    const totalCredits = safeRows.reduce((acc, r) => acc + (Number(r.credits_charged) || 0), 0)
    const totalTokens = safeRows.reduce((acc, r) => acc + (Number(r.total_tokens) || 0), 0)
    const inputTokens = safeRows.reduce((acc, r) => acc + (Number(r.input_tokens) || 0), 0)
    const outputTokens = safeRows.reduce((acc, r) => acc + (Number(r.output_tokens) || 0), 0)
    const totalCostUsd = safeRows.reduce((acc, r) => acc + (Number(r.provider_cost_usd) || 0), 0)
    const uniqueUsers = new Set(safeRows.map((r) => r.profile_id).filter(Boolean)).size
    const uniqueBusinesses = new Set(safeRows.map((r) => r.business_id).filter(Boolean)).size
    const successRequests = safeRows.filter((r) => r.status === 'success').length
    const failedRequests = safeRows.filter((r) => r.status === 'failed').length

    return {
      stats: {
        total_requests: totalRequests,
        total_credits: totalCredits,
        total_tokens: totalTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_cost_usd: Number(totalCostUsd.toFixed(6)),
        active_users: uniqueUsers,
        active_businesses: uniqueBusinesses,
        success_requests: successRequests,
        failed_requests: failedRequests,
      },
      error: null,
    }
  } catch (err) {
    return {
      stats: null,
      error: normalizeAiUsageError(err),
    }
  }
}

/**
 * Fetch detailed AI usage record by ID for Admin Detail Modal.
 *
 * @param {string} id - AI Usage UUID
 */
export async function fetchAdminAiUsageDetail(id) {
  if (!isValidUuid(id)) {
    return {
      detail: null,
      error: new Error('Format ID AI usage tidak valid.'),
    }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_ai_usage_detail', {
      p_id: id,
    })

    if (!error && data) {
      return {
        detail: data,
        error: null,
      }
    }

    // Fallback: Direct table query
    console.warn('[adminAiUsageService] RPC get_admin_ai_usage_detail unavailable, querying directly:', error?.message)
    const { data: row, error: qErr } = await supabase
      .from('ai_usage')
      .select('id, business_id, profile_id, operation, model, input_tokens, output_tokens, total_tokens, credits_charged, provider_cost_usd, is_estimated, status, request_id, metadata, created_at, profiles:profile_id(id, email, full_name), businesses:business_id(id, name)')
      .eq('id', id)
      .single()

    if (qErr) throw qErr
    if (!row) {
      return {
        detail: null,
        error: new Error('Catatan AI usage tidak ditemukan dalam sistem.'),
      }
    }

    return {
      detail: {
        ...row,
        user: row.profiles || null,
        business: row.businesses || null,
      },
      error: null,
    }
  } catch (err) {
    return {
      detail: null,
      error: normalizeAiUsageError(err),
    }
  }
}
