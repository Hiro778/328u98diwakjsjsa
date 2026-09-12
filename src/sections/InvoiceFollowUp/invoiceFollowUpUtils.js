// ============================================================
// invoiceFollowUpUtils.js
// Invoice Follow-up utility functions: status, calculation, search, filter, sort
// ============================================================

// --- Safe Number Helpers ---

/**
 * Parse a value to a safe number. Returns 0 for NaN, Infinity, null, undefined.
 */
export function safeNumber(val) {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  if (!Number.isFinite(n)) return 0
  return n
}

// --- Date Helpers ---

/**
 * Get today's date as YYYY-MM-DD string (local timezone).
 */
export function getToday() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a date string to Date object (date-only, no time).
 * Returns null if invalid.
 */
function parseDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return Number.isFinite(d.getTime()) ? d : null
}

// --- Outstanding Calculation ---

/**
 * Calculate outstanding amount from invoice amount and paid_amount.
 * Returns 0 if outstanding <= 0 or invalid.
 */
export function calculateOutstanding(invoice) {
  const amount = safeNumber(invoice?.amount)
  const paid = safeNumber(invoice?.paid_amount)
  const outstanding = amount - paid
  return outstanding > 0 ? outstanding : 0
}

// --- Days Overdue ---

/**
 * Calculate days overdue for an invoice.
 * Returns 0 if not overdue or paid.
 * Positive number = days past due date.
 */
export function calculateDaysOverdue(invoice) {
  if (calculateOutstanding(invoice) <= 0) return 0
  const dueDate = parseDate(invoice?.due_date)
  if (!dueDate) return 0
  const today = new Date(getToday() + 'T00:00:00')
  const diff = today.getTime() - dueDate.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// --- Invoice Status ---

export const INVOICE_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  DUE_TODAY: 'due_today',
  PENDING: 'pending',
}

export const INVOICE_STATUS_LABELS = {
  [INVOICE_STATUS.PAID]: 'Lunas',
  [INVOICE_STATUS.PARTIAL]: 'Sebagian Dibayar',
  [INVOICE_STATUS.OVERDUE]: 'Terlambat',
  [INVOICE_STATUS.DUE_TODAY]: 'Jatuh Tempo',
  [INVOICE_STATUS.PENDING]: 'Belum Jatuh Tempo',
}

export const INVOICE_STATUS_COLORS = {
  [INVOICE_STATUS.PAID]: 'bg-profit-50 text-profit-600 border-profit-200',
  [INVOICE_STATUS.PARTIAL]: 'bg-purple-50 text-purple-600 border-purple-200',
  [INVOICE_STATUS.OVERDUE]: 'bg-red-50 text-red-600 border-red-200',
  [INVOICE_STATUS.DUE_TODAY]: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  [INVOICE_STATUS.PENDING]: 'bg-blue-50 text-blue-600 border-blue-200',
}

/**
 * Determine invoice status based on amount, paid_amount, and due_date.
 */
export function getInvoiceStatus(invoice) {
  const outstanding = calculateOutstanding(invoice)
  const paid = safeNumber(invoice?.paid_amount)

  if (outstanding <= 0) return INVOICE_STATUS.PAID
  if (paid > 0 && outstanding > 0) return INVOICE_STATUS.PARTIAL

  const today = getToday()
  const dueDate = invoice?.due_date

  if (!dueDate) return INVOICE_STATUS.PENDING
  if (dueDate === today) return INVOICE_STATUS.DUE_TODAY
  if (dueDate < today) return INVOICE_STATUS.OVERDUE
  return INVOICE_STATUS.PENDING
}

// --- Priority ---

export const PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

export const PRIORITY_LABELS = {
  [PRIORITY.HIGH]: 'Tinggi',
  [PRIORITY.MEDIUM]: 'Sedang',
  [PRIORITY.LOW]: 'Rendah',
}

export const PRIORITY_COLORS = {
  [PRIORITY.HIGH]: 'text-red-600',
  [PRIORITY.MEDIUM]: 'text-yellow-600',
  [PRIORITY.LOW]: 'text-blue-600',
}

/**
 * Determine follow-up priority based on status and days overdue.
 */
export function getInvoicePriority(invoice) {
  const status = getInvoiceStatus(invoice)
  if (status === INVOICE_STATUS.OVERDUE) return PRIORITY.HIGH
  if (status === INVOICE_STATUS.DUE_TODAY) return PRIORITY.MEDIUM
  return PRIORITY.LOW
}

// --- Normalize Invoice ---

/**
 * Normalize an invoice from DB row, joining customer data if available.
 * Returns a safe, consistent object.
 */
export function normalizeInvoice(row, customers = []) {
  if (!row) return null
  const customer = customers.find(c => c.id === row.customer_id) || null
  const outstanding = calculateOutstanding(row)

  return {
    ...row,
    subtotal: safeNumber(row.subtotal),
    discount: safeNumber(row.discount),
    tax: safeNumber(row.tax),
    amount: safeNumber(row.amount),
    paid_amount: safeNumber(row.paid_amount),
    outstanding,
    status: getInvoiceStatus(row),
    priority: getInvoicePriority(row),
    customer_name: customer?.name || row.customer_name || 'Tanpa Customer',
    customer_phone: customer?.phone || '',
    customer_email: customer?.email || '',
  }
}

// --- Search ---

/**
 * Client-side search across invoice_number, customer name, phone.
 * Case-insensitive, null-safe.
 */
export function searchInvoices(invoices, query) {
  if (!query || !query.trim()) return invoices
  const q = query.trim().toLowerCase()
  return invoices.filter(inv =>
    (inv.invoice_number || '').toLowerCase().includes(q) ||
    (inv.customer_name || '').toLowerCase().includes(q) ||
    (inv.customer_phone || '').toLowerCase().includes(q)
  )
}

// --- Filter ---

export const INVOICE_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Belum Dibayar' },
  { key: 'partial', label: 'Sebagian' },
  { key: 'due_today', label: 'Jatuh Tempo' },
  { key: 'overdue', label: 'Terlambat' },
  { key: 'paid', label: 'Lunas' },
]

export const PERIOD_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: '7', label: '7 Hari' },
  { key: '30', label: '30 Hari' },
  { key: '90', label: '90 Hari' },
]

/**
 * Apply status and period filters to invoices.
 */
export function filterInvoices(invoices, statusFilter, periodFilter) {
  let result = invoices

  // Status filter
  if (statusFilter && statusFilter !== 'all') {
    result = result.filter(inv => inv.status === statusFilter)
  }

  // Period filter (based on issue_date)
  if (periodFilter && periodFilter !== 'all') {
    const days = parseInt(periodFilter, 10)
    if (Number.isFinite(days) && days > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      result = result.filter(inv => inv.issue_date >= cutoffStr)
    }
  }

  return result
}

// --- Sort ---

export const SORT_OPTIONS = [
  { key: 'due_date_asc', label: 'Jatuh Tempo Terdekat' },
  { key: 'due_date_desc', label: 'Jatuh Tempo Terlama' },
  { key: 'amount_desc', label: 'Nilai Terbesar' },
  { key: 'amount_asc', label: 'Nilai Terkecil' },
  { key: 'newest', label: 'Terbaru' },
  { key: 'customer_name_asc', label: 'Customer A-Z' },
]

/**
 * Sort invoices. Returns new sorted array (does not mutate).
 */
export function sortInvoices(invoices, sortKey) {
  const arr = [...invoices]
  switch (sortKey) {
    case 'due_date_asc':
      arr.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      })
      break
    case 'due_date_desc':
      arr.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return b.due_date.localeCompare(a.due_date)
      })
      break
    case 'amount_desc':
      arr.sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))
      break
    case 'amount_asc':
      arr.sort((a, b) => (a.outstanding || 0) - (b.outstanding || 0))
      break
    case 'newest':
      arr.sort((a, b) => {
        const aD = a.created_at || ''
        const bD = b.created_at || ''
        return bD.localeCompare(aD)
      })
      break
    case 'customer_name_asc':
      arr.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '', 'id'))
      break
    default:
      break
  }
  return arr
}

// --- Summary ---

/**
 * Calculate summary stats from a list of normalized invoices.
 */
export function calculateSummary(invoices) {
  let totalReceivable = 0
  let overdueCount = 0
  let overdueAmount = 0
  let dueTodayCount = 0
  let paidCount = 0

  for (const inv of invoices) {
    const outstanding = safeNumber(inv.outstanding)
    const status = inv.status || getInvoiceStatus(inv)

    if (status === INVOICE_STATUS.PAID) {
      paidCount++
    } else if (status === INVOICE_STATUS.OVERDUE) {
      overdueCount++
      overdueAmount += outstanding
      totalReceivable += outstanding
    } else if (status === INVOICE_STATUS.DUE_TODAY) {
      dueTodayCount++
      totalReceivable += outstanding
    } else {
      totalReceivable += outstanding
    }
  }

  return {
    totalReceivable,
    overdueCount,
    overdueAmount,
    dueTodayCount,
    paidCount,
  }
}

// --- Follow-up Helpers ---

export const FOLLOWUP_METHODS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'phone', label: 'Telepon' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'other', label: 'Lainnya' },
]

export const FOLLOWUP_RESULTS = [
  { key: 'berhasil', label: 'Berhasil' },
  { key: 'menunggu', label: 'Menunggu' },
  { key: 'tidak_terhubung', label: 'Tidak Terhubung' },
]

/**
 * Get latest follow-up from a list of follow-ups for an invoice.
 */
export function getLatestFollowup(followups) {
  if (!followups || followups.length === 0) return null
  return followups.reduce((latest, f) =>
    new Date(f.follow_up_date) > new Date(latest.follow_up_date) ? f : latest
  )
}

/**
 * Calculate days since last follow-up.
 * Returns null if no follow-up exists.
 */
export function daysSinceFollowup(followups) {
  const latest = getLatestFollowup(followups)
  if (!latest) return null
  const followUpDate = new Date(latest.follow_up_date + 'T00:00:00')
  const today = new Date(getToday() + 'T00:00:00')
  const diff = today.getTime() - followUpDate.getTime()
  if (diff < 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// --- Follow-up Validation ---

/**
 * Validate follow-up form data.
 */
export function validateFollowup(form) {
  const errors = {}
  const validMethods = FOLLOWUP_METHODS.map(m => m.key)

  if (!form.method || !validMethods.includes(form.method)) {
    errors.method = 'Metode wajib dipilih'
  }
  if (!form.follow_up_date) {
    errors.follow_up_date = 'Tanggal wajib diisi'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Invoice Validation ---

/**
 * Validate invoice form data.
 * Returns { valid, errors }
 */
export function validateInvoice(form) {
  const errors = {}

  const invoiceNumber = (form.invoice_number || '').trim()
  if (!invoiceNumber) {
    errors.invoice_number = 'Nomor invoice wajib diisi'
  }

  if (!form.issue_date) {
    errors.issue_date = 'Tanggal invoice wajib diisi'
  }

  if (!form.due_date) {
    errors.due_date = 'Tanggal jatuh tempo wajib diisi'
  }

  // Due date should not be before issue date
  if (form.issue_date && form.due_date && form.due_date < form.issue_date) {
    errors.due_date = 'Jatuh tempo tidak boleh sebelum tanggal invoice'
  }

  const amount = safeNumber(form.amount)
  if (amount <= 0) {
    errors.amount = 'Total harus lebih dari 0'
  }

  const subtotal = safeNumber(form.subtotal)
  const discount = safeNumber(form.discount)
  const tax = safeNumber(form.tax)

  if (subtotal < 0 || discount < 0 || tax < 0) {
    errors.amount = 'Nilai tidak boleh negatif'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Validate payment form data.
 */
export function validatePayment(form) {
  const errors = {}

  const amount = safeNumber(form.amount)
  if (amount <= 0) {
    errors.amount = 'Jumlah pembayaran harus lebih dari 0'
  }
  if (!Number.isFinite(amount)) {
    errors.amount = 'Jumlah pembayaran tidak valid'
  }

  if (!form.payment_date) {
    errors.payment_date = 'Tanggal pembayaran wajib diisi'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Calculate total from subtotal, discount, tax.
 */
export function calculateTotal(subtotal, discount, tax) {
  const sub = safeNumber(subtotal)
  const disc = safeNumber(discount)
  const t = safeNumber(tax)
  const total = sub - disc + t
  return total > 0 ? total : 0
}

/**
 * Check if payment would exceed outstanding.
 * Returns { allowed, excess }
 */
export function checkPaymentLimit(invoice, paymentAmount) {
  const outstanding = calculateOutstanding(invoice)
  const amount = safeNumber(paymentAmount)
  if (amount > outstanding) {
    return { allowed: false, excess: amount - outstanding }
  }
  return { allowed: true, excess: 0 }
}

/**
 * Check for duplicate invoice number within business.
 */
export function checkDuplicateInvoiceNumber(invoiceNumber, existingInvoices, { excludeId = null } = {}) {
  const num = (invoiceNumber || '').trim().toLowerCase()
  if (!num) return false
  return existingInvoices.some(inv => {
    if (excludeId && inv.id === excludeId) return false
    return (inv.invoice_number || '').trim().toLowerCase() === num
  })
}

// --- Pagination ---

export const PAGE_SIZE = 20

/**
 * Paginate an array.
 */
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

// --- Formatting ---

/**
 * Format currency in Indonesian Rupiah.
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(amount))
}

/**
 * Format a date to Indonesian locale.
 */
export function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format due date with overdue indicator.
 */
export function formatDueDate(dueDate, status) {
  if (!dueDate) return '-'
  const formatted = formatDate(dueDate)
  if (status === INVOICE_STATUS.OVERDUE) {
    const days = calculateDaysOverdue({ due_date: dueDate, amount: 1, paid_amount: 0 })
    return `${formatted} (${days} hari)`
  }
  return formatted
}

/**
 * Format relative time for follow-up reminder.
 */
export function formatFollowupReminder(followups) {
  const days = daysSinceFollowup(followups)
  if (days === null) return 'Belum pernah di-follow-up'
  if (days === 0) return 'Hari ini'
  if (days === 1) return 'Kemarin'
  return `Terakhir di-follow-up ${days} hari lalu`
}
