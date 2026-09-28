/**
 * adminSupportService.js
 * Service for Admin Control Center — Stage 7: Support Management
 * Conforms strictly to @7.md & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs.
 * - Robust error normalization and PostgREST table query fallbacks.
 * - Internal support ticket monitoring and status management.
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
export function normalizeSupportError(err, defaultMessage = 'Terjadi kesalahan saat memproses data tiket support') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk tiket support.')
  }
  if (message.includes('P0002') || message.includes('not found') || message.includes('SUPPORT_TICKET_NOT_FOUND')) {
    return new Error('Tiket support tidak ditemukan dalam sistem.')
  }
  if (message.includes('INVALID_UUID') || message.includes('invalid input syntax for type uuid')) {
    return new Error('Format ID tiket support tidak valid.')
  }
  if (message.includes('INVALID_STATUS')) {
    return new Error('Status tiket tidak valid. Diperbolehkan: new, in_progress, waiting_user, resolved, closed.')
  }
  if (message.includes('INVALID_PRIORITY')) {
    return new Error('Prioritas tiket tidak valid. Diperbolehkan: low, medium, high, urgent.')
  }
  return new Error(defaultMessage)
}

/**
 * Fetch paginated, filtered, sorted support tickets for Admin Support Table.
 *
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.statusFilter='all'] - 'all' | 'new' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'
 * @param {string} [params.priorityFilter='all'] - 'all' | 'low' | 'medium' | 'high' | 'urgent'
 * @param {string} [params.categoryFilter='all']
 * @param {string} [params.sortBy='newest'] - 'newest' | 'oldest' | 'priority' | 'status'
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 */
export async function fetchAdminSupportTickets({
  search = '',
  statusFilter = 'all',
  priorityFilter = 'all',
  categoryFilter = 'all',
  sortBy = 'newest',
  limit = 20,
  offset = 0,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('get_admin_support_tickets', {
      p_search: search.trim() || null,
      p_status_filter: statusFilter,
      p_priority_filter: priorityFilter,
      p_category_filter: categoryFilter,
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
    console.warn('[adminSupportService] RPC get_admin_support_tickets unavailable, querying tables directly:', error?.message)
    let query = supabase.from('support_tickets').select(
      'id, business_id, user_id, category, subject, description, page_url, priority, status, screenshot_url, admin_note, created_at, updated_at',
      { count: 'exact' }
    )

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }
    if (priorityFilter && priorityFilter !== 'all') {
      query = query.eq('priority', priorityFilter)
    }
    if (categoryFilter && categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter)
    }
    if (search && search.trim()) {
      const q = search.trim()
      if (isValidUuid(q)) {
        query = query.eq('id', q)
      } else {
        query = query.or(`subject.ilike.%${q}%,description.ilike.%${q}%`)
      }
    }

    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    query = query.range(offset, offset + limit - 1)

    const { data: rows, count, error: tableErr } = await query

    if (tableErr) {
      return { records: [], totalCount: 0, error: normalizeSupportError(tableErr) }
    }

    // Augment with profiles and businesses in batch if any
    const records = rows || []
    if (records.length > 0) {
      const userIds = [...new Set(records.map((r) => r.user_id).filter(Boolean))]
      const businessIds = [...new Set(records.map((r) => r.business_id).filter(Boolean))]

      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, email, full_name').in('id', userIds)
        if (profs) {
          profileMap = Object.fromEntries(profs.map((p) => [p.id, p]))
        }
      }

      let bizMap = {}
      if (businessIds.length > 0) {
        const { data: bizes } = await supabase.from('businesses').select('id, name').in('id', businessIds)
        if (bizes) {
          bizMap = Object.fromEntries(bizes.map((b) => [b.id, b]))
        }
      }

      for (const rec of records) {
        rec.user = profileMap[rec.user_id] || { id: rec.user_id, email: '', full_name: '' }
        rec.business = bizMap[rec.business_id] || (rec.business_id ? { id: rec.business_id, name: '' } : null)
      }
    }

    return {
      records,
      totalCount: count || 0,
      error: null,
    }
  } catch (err) {
    return {
      records: [],
      totalCount: 0,
      error: normalizeSupportError(err),
    }
  }
}

/**
 * Fetch aggregate statistics for Support tickets.
 */
export async function fetchAdminSupportStats() {
  try {
    const { data, error } = await supabase.rpc('get_admin_support_stats')
    if (!error && data) {
      return { stats: data, error: null }
    }

    // Fallback: Calculate directly via count queries
    console.warn('[adminSupportService] RPC get_admin_support_stats unavailable, querying counts directly:', error?.message)
    const { count: total } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true })
    const { count: newCount } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'new')
    const { count: inProgress } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress')
    const { count: waitingUser } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'waiting_user')
    const { count: resolved } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved')
    const { count: closed } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'closed')
    const { count: urgent } = await supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('priority', 'urgent')

    return {
      stats: {
        total_tickets: total || 0,
        new_tickets: newCount || 0,
        in_progress: inProgress || 0,
        waiting_user: waitingUser || 0,
        resolved: resolved || 0,
        closed: closed || 0,
        urgent_tickets: urgent || 0,
      },
      error: null,
    }
  } catch (err) {
    return { stats: null, error: normalizeSupportError(err) }
  }
}

/**
 * Fetch detail of a single support ticket.
 *
 * @param {string} ticketId
 */
export async function fetchAdminSupportTicketDetail(ticketId) {
  if (!isValidUuid(ticketId)) {
    return { detail: null, error: new Error('ID tiket support tidak valid.') }
  }

  try {
    const { data, error } = await supabase.rpc('get_admin_support_ticket_detail', {
      p_ticket_id: ticketId,
    })

    if (!error && data?.ticket) {
      return { detail: data, error: null }
    }

    // Fallback: Direct table queries
    console.warn('[adminSupportService] RPC get_admin_support_ticket_detail unavailable, fallback query:', error?.message)
    const { data: ticket, error: tErr } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle()

    if (tErr) return { detail: null, error: normalizeSupportError(tErr) }
    if (!ticket) return { detail: null, error: new Error('Tiket support tidak ditemukan dalam sistem.') }

    let user = null
    if (ticket.user_id) {
      const { data: prof } = await supabase.from('profiles').select('id, email, full_name').eq('id', ticket.user_id).maybeSingle()
      user = prof
    }

    let business = null
    if (ticket.business_id) {
      const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', ticket.business_id).maybeSingle()
      business = biz
    }

    let auditLogs = []
    const { data: logs } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .eq('target_type', 'support_ticket')
      .eq('target_id', ticketId)
      .order('created_at', { ascending: false })

    if (logs) auditLogs = logs

    return {
      detail: {
        ticket,
        user,
        business,
        audit_logs: auditLogs,
      },
      error: null,
    }
  } catch (err) {
    return { detail: null, error: normalizeSupportError(err) }
  }
}

/**
 * Update support ticket status, priority, and admin notes.
 *
 * @param {Object} params
 * @param {string} params.ticketId
 * @param {string} [params.status]
 * @param {string} [params.adminNote]
 * @param {string} [params.priority]
 * @param {string} [params.reason]
 */
export async function updateAdminSupportTicket({
  ticketId,
  status,
  adminNote,
  priority,
  reason,
}) {
  if (!isValidUuid(ticketId)) {
    return { success: false, error: new Error('ID tiket support tidak valid.') }
  }

  try {
    const { data, error } = await supabase.rpc('admin_update_support_ticket', {
      p_ticket_id: ticketId,
      p_status: status || null,
      p_admin_note: adminNote !== undefined ? adminNote : null,
      p_priority: priority || null,
      p_reason: reason || null,
    })

    if (!error && data) {
      return { success: true, ticket: data, error: null }
    }

    // Fallback: Direct table update if RPC is missing
    console.warn('[adminSupportService] RPC admin_update_support_ticket unavailable, fallback update:', error?.message)
    const updatePayload = { updated_at: new Date().toISOString() }
    if (status) updatePayload.status = status
    if (priority) updatePayload.priority = priority
    if (adminNote !== undefined) updatePayload.admin_note = adminNote

    const { data: updated, error: uErr } = await supabase
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', ticketId)
      .select()
      .single()

    if (uErr) {
      return { success: false, error: normalizeSupportError(uErr) }
    }

    // Optional audit log insert
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user?.id) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: userData.user.id,
          action: 'support_ticket_update',
          target_type: 'support_ticket',
          target_id: ticketId,
          reason: reason || adminNote || 'Pembaruan tiket oleh admin',
          metadata: updatePayload,
        })
      }
    } catch {}

    return { success: true, ticket: updated, error: null }
  } catch (err) {
    return { success: false, error: normalizeSupportError(err) }
  }
}
