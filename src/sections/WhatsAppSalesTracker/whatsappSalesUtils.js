// ============================================================
// whatsappSalesUtils.js
// WhatsApp Sales Tracker utility functions: validation, search, filter, sort, summary
// ============================================================

// --- Safe Number Helper ---

export function safeNumber(val) {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  if (!Number.isFinite(n)) return 0
  return n
}

// --- Date Helpers ---

export function getToday() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysBetween(date1, date2) {
  if (!date1 || !date2) return 0
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  if (!Number.isFinite(d1.getTime()) || !Number.isFinite(d2.getTime())) return 0
  const diff = d2.getTime() - d1.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// --- Phone Normalization ---

export function normalizePhoneForWhatsApp(phone) {
  if (!phone) return ''
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1)
  }
  if (!digits.startsWith('62')) {
    digits = '62' + digits
  }
  return digits
}

export function normalizePhoneForTel(phone) {
  if (!phone) return ''
  return String(phone).replace(/\D/g, '')
}

// --- Input Sanitization ---

export function sanitizeLeadInput(form) {
  return {
    ...form,
    name: (form.name || '').trim(),
    phone: (form.phone || '').trim(),
    email: (form.email || '').trim(),
    product_interest: (form.product_interest || '').trim(),
    notes: (form.notes || '').trim(),
  }
}

// --- Validation ---

export function validateLead(form) {
  const errors = {}

  const name = (form.name || '').trim()
  if (!name) errors.name = 'Nama lead wajib diisi'

  if (form.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) {
      errors.email = 'Email tidak valid'
    }
  }

  if (form.phone) {
    const phoneStr = String(form.phone).trim()
    if (phoneStr && !/^[\d\s\-+()]+$/.test(phoneStr)) {
      errors.phone = 'Nomor telepon tidak valid'
    }
  }

  const estVal = safeNumber(form.estimated_value)
  if (estVal < 0) {
    errors.estimated_value = 'Estimasi nilai tidak boleh negatif'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateFollowup(form) {
  const errors = {}
  if (!form.method) errors.method = 'Metode wajib diisi'
  if (!form.date) errors.date = 'Tanggal wajib diisi'
  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Duplicate Detection ---

export function checkDuplicateLead(form, existingLeads, { excludeId } = {}) {
  const phone = (form.phone || '').trim().replace(/\s/g, '')
  const email = (form.email || '').trim().toLowerCase()

  for (const lead of existingLeads) {
    if (excludeId && lead.id === excludeId) continue
    if (phone && lead.phone && lead.phone.replace(/\s/g, '') === phone) {
      return { isDuplicate: true, existing: lead, field: 'phone' }
    }
    if (email && lead.email && lead.email.toLowerCase() === email) {
      return { isDuplicate: true, existing: lead, field: 'email' }
    }
  }
  return { isDuplicate: false }
}

// --- Constants ---

export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  FOLLOWUP: 'followup',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
}

export const LEAD_STATUS_LABELS = {
  new: 'Baru',
  contacted: 'Dihubungi',
  followup: 'Follow-up',
  negotiation: 'Negosiasi',
  won: 'Won',
  lost: 'Lost',
}

export const LEAD_STATUS_COLORS = {
  new: 'bg-blue-50 text-blue-600 border-blue-200',
  contacted: 'bg-purple-50 text-purple-600 border-purple-200',
  followup: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  negotiation: 'bg-orange-50 text-orange-600 border-orange-200',
  won: 'bg-profit-50 text-profit-600 border-profit-200',
  lost: 'bg-red-50 text-red-600 border-red-200',
}

export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

export const PRIORITY_LABELS = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
}

export const PRIORITY_COLORS = {
  low: 'text-blue-600',
  medium: 'text-yellow-600',
  high: 'text-red-600',
}

export const FOLLOWUP_METHODS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'phone', label: 'Telepon' },
  { key: 'email', label: 'Email' },
  { key: 'other', label: 'Lainnya' },
]

export const FOLLOWUP_RESULTS = [
  { key: 'berhasil', label: 'Berhasil' },
  { key: 'menunggu', label: 'Menunggu' },
  { key: 'tidak_terhubung', label: 'Tidak Terhubung' },
]

export const LEAD_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'new', label: 'Leads Baru' },
  { key: 'contacted', label: 'Dihubungi' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'negotiation', label: 'Negosiasi' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'today_followup', label: 'Follow-up Hari Ini' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'high_priority', label: 'High Priority' },
]

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Terbaru' },
  { key: 'followup_nearest', label: 'Follow-up Terdekat' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'value_desc', label: 'Nilai Terbesar' },
  { key: 'name_asc', label: 'Nama A-Z' },
  { key: 'last_contacted', label: 'Last Contacted' },
]

export const PAGE_SIZE = 20

// --- Normalize ---

export function normalizeLead(row, customers = []) {
  if (!row) return null
  const customer = row.customer_id
    ? customers.find(c => c.id === row.customer_id) || null
    : null
  return {
    ...row,
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || null,
  }
}

// --- Search ---

export function searchLeads(leads, query) {
  if (!query || !query.trim()) return leads
  const q = query.trim().toLowerCase()
  return leads.filter(l =>
    (l.name || '').toLowerCase().includes(q) ||
    (l.phone || '').toLowerCase().includes(q) ||
    (l.email || '').toLowerCase().includes(q) ||
    (l.product_interest || '').toLowerCase().includes(q) ||
    (l.notes || '').toLowerCase().includes(q)
  )
}

// --- Filter ---

export function filterLeads(leads, filterKey) {
  if (filterKey === 'all') return leads

  return leads.filter(l => {
    switch (filterKey) {
      case 'new':
        return l.status === 'new'
      case 'contacted':
        return l.status === 'contacted'
      case 'followup':
        return l.status === 'followup'
      case 'negotiation':
        return l.status === 'negotiation'
      case 'won':
        return l.status === 'won'
      case 'lost':
        return l.status === 'lost'
      case 'today_followup':
        return isTodayFollowup(l)
      case 'overdue':
        return isOverdue(l)
      case 'high_priority':
        return l.priority === 'high'
      default:
        return true
    }
  })
}

// --- Sort ---

export function sortLeads(leads, sortKey) {
  const arr = [...leads]
  switch (sortKey) {
    case 'newest':
      arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      break
    case 'followup_nearest': {
      arr.sort((a, b) => {
        if (!a.next_follow_up_at) return 1
        if (!b.next_follow_up_at) return -1
        return a.next_follow_up_at.localeCompare(b.next_follow_up_at)
      })
      break
    }
    case 'overdue': {
      const now = new Date()
      arr.sort((a, b) => {
        const aOverdue = isOverdue(a) ? daysBetween(a.next_follow_up_at, now) : -1
        const bOverdue = isOverdue(b) ? daysBetween(b.next_follow_up_at, now) : -1
        return bOverdue - aOverdue
      })
      break
    }
    case 'value_desc':
      arr.sort((a, b) => safeNumber(b.estimated_value) - safeNumber(a.estimated_value))
      break
    case 'name_asc':
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'))
      break
    case 'last_contacted': {
      arr.sort((a, b) => {
        if (!a.last_contacted_at) return 1
        if (!b.last_contacted_at) return -1
        return b.last_contacted_at.localeCompare(a.last_contacted_at)
      })
      break
    }
    default:
      break
  }
  return arr
}

// --- Pagination ---

export function paginate(items, page = 1, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize
  return {
    items: items.slice(start, end),
    totalPages,
    currentPage,
    total: items.length,
  }
}

// --- Overdue / Today ---

export function isOverdue(lead) {
  if (!lead.next_follow_up_at) return false
  if (lead.status === 'won' || lead.status === 'lost') return false
  const now = new Date()
  const followUp = new Date(lead.next_follow_up_at)
  return followUp.getTime() < now.getTime()
}

export function isTodayFollowup(lead) {
  if (!lead.next_follow_up_at) return false
  const leadDate = lead.next_follow_up_at.slice(0, 10)
  return leadDate === getToday()
}

// --- Summary ---

export function calculateSummary(leads) {
  let total = 0
  let newCount = 0
  let todayFollowup = 0
  let overdueCount = 0
  let wonCount = 0
  let pipelineValue = 0

  for (const l of leads) {
    total++
    if (l.status === 'new') newCount++
    if (isTodayFollowup(l)) todayFollowup++
    if (isOverdue(l)) overdueCount++
    if (l.status === 'won') wonCount++
    if (l.status !== 'won' && l.status !== 'lost') {
      pipelineValue += safeNumber(l.estimated_value)
    }
  }

  const conversionRate = total > 0 ? Math.round((wonCount / total) * 100) : 0

  return {
    total,
    newCount,
    todayFollowup,
    overdueCount,
    wonCount,
    pipelineValue,
    conversionRate,
  }
}

// --- Pipeline ---

export function calculatePipeline(leads) {
  const stages = {}
  for (const l of leads) {
    if (!stages[l.status]) {
      stages[l.status] = { count: 0, value: 0 }
    }
    stages[l.status].count++
    stages[l.status].value += safeNumber(l.estimated_value)
  }
  return stages
}

// --- Formatting ---

export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(amount))
}

export function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date + (date.includes('T') ? '' : 'T00:00:00'))
  if (!Number.isFinite(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(date) {
  if (!date) return '-'
  const d = new Date(date)
  if (!Number.isFinite(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(date) {
  if (!date) return '-'
  const d = new Date(date)
  if (!Number.isFinite(d.getTime())) return '-'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'Baru saja'
  if (diffMin < 60) return `${diffMin} menit lalu`
  if (diffHour < 24) return `${diffHour} jam lalu`
  if (diffDay < 30) return `${diffDay} hari lalu`
  return formatDate(date)
}
