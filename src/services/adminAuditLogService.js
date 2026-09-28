/**
 * adminAuditLogService.js
 * Service for Admin Control Center — Stage 9: Audit Logs Management
 * Conforms strictly to @9.md & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Centralized read-only audit monitoring layer.
 * - Robust error normalization and table query fallbacks.
 * - Zero secrets exposed: sensitive keys (passwords, tokens, api keys) sanitized.
 * - Read-only enforcement: no create/update/delete operations exposed.
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
export function normalizeAuditError(err, defaultMessage = 'Terjadi kesalahan saat memproses data audit logs') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk melihat audit logs.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('AUDIT_LOG_NOT_FOUND')) {
    return new Error('Data audit log tidak ditemukan dalam sistem.')
  }
  if (message.includes('INVALID_UUID') || message.includes('invalid input syntax for type uuid')) {
    return new Error('Format ID audit log tidak valid.')
  }
  return new Error(defaultMessage)
}

/**
 * Strips sensitive keys (tokens, server keys, authorization headers, passwords) from metadata payload.
 */
export function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const sanitized = { ...metadata }
  const sensitiveKeys = [
    'password',
    'pass',
    'token',
    'access_token',
    'refresh_token',
    'secret',
    'server_key',
    'client_key',
    'authorization',
    'apiKey',
    'api_key',
    'signature_key',
    'cookie',
    'auth_header',
  ]

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some((s) => lowerKey.includes(s.toLowerCase()))) {
      delete sanitized[key]
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeAuditMetadata(sanitized[key])
    }
  }

  return sanitized
}

/**
 * Formats ISO timestamp to Indonesian localized datetime string.
 */
export function formatAuditDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d)
  } catch {
    return '-'
  }
}

/**
 * Returns semantic badge color classes for specific audit actions.
 */
export function getActionBadgeColor(action) {
  const act = String(action || '').toUpperCase()
  if (act.includes('UNBAN') || act.includes('UNSUSPEND') || act.includes('ACTIVATE') || act.includes('RESTORE')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  }
  if (act.includes('BAN') || act.includes('DELETE')) {
    return 'bg-red-500/10 text-red-400 border-red-500/20'
  }
  if (act.includes('SUSPEND') || act.includes('CANCEL')) {
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  }
  if (act.includes('UPDATE') || act.includes('NOTE')) {
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

/**
 * Maps raw action string to a human-readable Indonesian label.
 */
export function formatActionLabel(action) {
  const map = {
    USER_BANNED: 'Blokir Pengguna',
    USER_UNBANNED: 'Buka Blokir Pengguna',
    USER_SUSPENDED: 'Tangguhkan Pengguna',
    USER_UNSUSPENDED: 'Aktifkan Penangguhan',
    USER_ACTIVATED: 'Aktivasi Pengguna',
    USER_DELETED: 'Hapus Lunak Pengguna',
    BUSINESS_ACTIVATED: 'Aktivasi Bisnis',
    BUSINESS_DEACTIVATED: 'Nonaktifkan Bisnis',
    CANCEL_SUBSCRIPTION: 'Batalkan Langganan',
    support_ticket_update: 'Pembaruan Tiket Bantuan',
  }
  return map[action] || action
}

/**
 * Fetch paginated, filtered, sorted audit logs for Admin Audit Logs Table.
 *
 * @param {Object} params
 * @param {string} [params.search='']
 * @param {string} [params.action='all']
 * @param {string|null} [params.actorId=null]
 * @param {string} [params.targetType='all']
 * @param {string|null} [params.dateFrom=null]
 * @param {string|null} [params.dateTo=null]
 * @param {string} [params.sortBy='newest'] - 'newest' | 'oldest'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminAuditLogs({
  search = '',
  action = 'all',
  actorId = null,
  targetType = 'all',
  dateFrom = null,
  dateTo = null,
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    // Primary: Call centralized SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('get_admin_audit_logs', {
      p_search: search.trim() || null,
      p_action: action === 'all' ? null : action,
      p_actor_id: actorId || null,
      p_target_type: targetType === 'all' ? null : targetType,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_sort: sortBy,
      p_limit: limit,
      p_offset: offset,
    })

    if (!error && data?.records) {
      return {
        records: data.records.map((r) => ({
          ...r,
          metadata: sanitizeAuditMetadata(r.metadata),
        })),
        totalCount: Number(data.total_count || 0),
        availableActions: data.available_actions || [],
        availableTargetTypes: data.available_target_types || [],
        error: null,
      }
    }

    // Fallback: Direct table query if RPC is not yet registered
    console.warn('[adminAuditLogService] RPC get_admin_audit_logs unavailable, querying table directly:', error?.message)

    let query = supabase
      .from('admin_audit_logs')
      .select('id, admin_id, action, target_type, target_id, reason, metadata, created_at', { count: 'exact' })

    if (action && action !== 'all') {
      query = query.eq('action', action)
    }
    if (targetType && targetType !== 'all') {
      query = query.eq('target_type', targetType)
    }
    if (actorId) {
      query = query.eq('admin_id', actorId)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }
    if (search.trim()) {
      const term = search.trim()
      query = query.or(`action.ilike.%${term}%,target_id.ilike.%${term}%,reason.ilike.%${term}%`)
    }

    const isAsc = sortBy === 'oldest'
    query = query.order('created_at', { ascending: isAsc }).range(offset, offset + limit - 1)

    const { data: rows, count, error: qErr } = await query

    if (qErr) throw qErr

    // Collect admin IDs to hydrate admin profile info safely
    const adminIds = [...new Set((rows || []).map((r) => r.admin_id).filter(Boolean))]
    const profileMap = new Map()

    if (adminIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', adminIds)

      for (const p of profiles || []) {
        profileMap.set(p.id, p)
      }
    }

    const records = (rows || []).map((r) => {
      const prof = profileMap.get(r.admin_id) || {}
      return {
        id: r.id,
        admin_id: r.admin_id,
        admin_email: prof.email || '',
        admin_name: prof.full_name || prof.email || 'Admin',
        admin_avatar_url: prof.avatar_url || null,
        action: r.action,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason || '',
        metadata: sanitizeAuditMetadata(r.metadata),
        created_at: r.created_at,
      }
    })

    return {
      records,
      totalCount: count ?? records.length,
      availableActions: ['USER_BANNED', 'USER_UNBANNED', 'USER_SUSPENDED', 'USER_ACTIVATED', 'BUSINESS_ACTIVATED', 'BUSINESS_DEACTIVATED', 'CANCEL_SUBSCRIPTION', 'support_ticket_update'],
      availableTargetTypes: ['user', 'business', 'subscription', 'support_ticket'],
      error: null,
    }
  } catch (err) {
    console.error('[adminAuditLogService.fetchAdminAuditLogs] Error:', err)
    return {
      records: [],
      totalCount: 0,
      availableActions: [],
      availableTargetTypes: [],
      error: normalizeAuditError(err),
    }
  }
}

/**
 * Fetch detailed audit log information with contextual target entity info.
 *
 * @param {string} logId
 */
export async function fetchAdminAuditLogDetail(logId) {
  if (!logId || !isValidUuid(logId)) {
    return {
      detail: null,
      error: new Error('Format ID audit log tidak valid.'),
    }
  }

  try {
    // Primary: Call centralized SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('get_admin_audit_log_detail', {
      p_log_id: logId,
    })

    if (!error && data) {
      return {
        detail: {
          ...data,
          metadata: sanitizeAuditMetadata(data.metadata),
        },
        error: null,
      }
    }

    // Fallback: Query table directly
    console.warn('[adminAuditLogService] RPC get_admin_audit_log_detail unavailable, querying table directly:', error?.message)

    const { data: logRow, error: logErr } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .eq('id', logId)
      .maybeSingle()

    if (logErr) throw logErr
    if (!logRow) {
      return { detail: null, error: new Error('Data audit log tidak ditemukan dalam sistem.') }
    }

    // Hydrate admin profile
    let adminProf = {}
    if (logRow.admin_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .eq('id', logRow.admin_id)
        .maybeSingle()
      if (prof) adminProf = prof
    }

    // Contextual target information
    let targetInfo = {}
    if (logRow.target_type === 'user' && isValidUuid(logRow.target_id)) {
      const { data: u } = await supabase.from('profiles').select('id, email, full_name, status').eq('id', logRow.target_id).maybeSingle()
      if (u) targetInfo = { id: u.id, email: u.email, name: u.full_name, status: u.status }
    } else if (logRow.target_type === 'business' && isValidUuid(logRow.target_id)) {
      const { data: b } = await supabase.from('businesses').select('id, name, is_active').eq('id', logRow.target_id).maybeSingle()
      if (b) targetInfo = { id: b.id, name: b.name, is_active: b.is_active }
    } else if (logRow.target_type === 'subscription' && isValidUuid(logRow.target_id)) {
      const { data: s } = await supabase.from('subscriptions').select('id, plan, status, expires_at').eq('id', logRow.target_id).maybeSingle()
      if (s) targetInfo = { id: s.id, plan: s.plan, status: s.status, expires_at: s.expires_at }
    } else if (logRow.target_type === 'support_ticket' && isValidUuid(logRow.target_id)) {
      const { data: st } = await supabase.from('support_tickets').select('id, subject, category, status, priority').eq('id', logRow.target_id).maybeSingle()
      if (st) targetInfo = { id: st.id, subject: st.subject, category: st.category, status: st.status, priority: st.priority }
    }

    return {
      detail: {
        id: logRow.id,
        admin_id: logRow.admin_id,
        admin_email: adminProf.email || '',
        admin_name: adminProf.full_name || adminProf.email || 'Admin',
        admin_avatar_url: adminProf.avatar_url || null,
        action: logRow.action,
        target_type: logRow.target_type,
        target_id: logRow.target_id,
        reason: logRow.reason || '',
        metadata: sanitizeAuditMetadata(logRow.metadata),
        target_info: targetInfo,
        created_at: logRow.created_at,
      },
      error: null,
    }
  } catch (err) {
    console.error('[adminAuditLogService.fetchAdminAuditLogDetail] Error:', err)
    return {
      detail: null,
      error: normalizeAuditError(err),
    }
  }
}
