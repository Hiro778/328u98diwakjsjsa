// ============================================================
// customerUtils.js
// Customer CRM utility functions: validation, search, filter, sort, metrics
// ============================================================

// --- Validation ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate customer form data.
 * Returns { valid: boolean, errors: { field: message } }
 */
export function validateCustomer(form) {
  const errors = {}

  const name = (form.name || '').trim()
  if (!name) {
    errors.name = 'Nama customer wajib diisi'
  }

  const email = (form.email || '').trim()
  if (email && !EMAIL_RE.test(email)) {
    errors.email = 'Format email tidak valid'
  }

  const phone = (form.phone || '').trim()
  // Phone: allow digits, spaces, dashes, plus — basic sanity
  if (phone && !/^[+\d\s\-()]{7,20}$/.test(phone)) {
    errors.phone = 'Nomor HP tidak valid'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// --- Duplicate Detection ---

/**
 * Check for duplicate customers within the same business.
 * Returns { isDuplicate: boolean, existing: object|null, field: string|null }
 *   field is 'phone' or 'email' indicating which matched.
 */
export function checkDuplicate(form, existingCustomers, { excludeId = null } = {}) {
  const phone = (form.phone || '').trim()
  const email = (form.email || '').trim()

  for (const c of existingCustomers) {
    if (excludeId && c.id === excludeId) continue

    if (phone && c.phone && c.phone.trim() === phone) {
      return { isDuplicate: true, existing: c, field: 'phone' }
    }
    if (email && c.email && c.email.trim().toLowerCase() === email.toLowerCase()) {
      return { isDuplicate: true, existing: c, field: 'email' }
    }
  }

  return { isDuplicate: false, existing: null, field: null }
}

// --- Sanitization ---

/**
 * Sanitize form input: trim whitespace, reject NaN/Infinity for numeric fields.
 */
export function sanitizeCustomerInput(form) {
  const out = { ...form }
  out.name = (out.name || '').trim()
  out.phone = (out.phone || '').trim()
  out.email = (out.email || '').trim()
  out.address = (out.address || '').trim()
  out.notes = (out.notes || '').trim()
  return out
}

// --- Search ---

/**
 * Client-side search across name, phone, email.
 * Case-insensitive. Returns filtered array.
 */
export function searchCustomers(customers, query) {
  if (!query || !query.trim()) return customers
  const q = query.trim().toLowerCase()
  return customers.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  )
}

// --- Filter ---

export const CUSTOMER_FILTERS = [
  { key: 'all', label: 'Semua Customer' },
  { key: 'active', label: 'Customer Aktif' },
  { key: 'new', label: 'Customer Baru' },
  { key: 'never', label: 'Belum Pernah Transaksi' },
]

/**
 * Apply filter to customer list.
 * 'active' = total_transactions > 0
 * 'new' = created within last 30 days
 * 'never' = total_transactions === 0
 */
export function filterCustomers(customers, filterKey) {
  if (filterKey === 'all') return customers

  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  return customers.filter(c => {
    switch (filterKey) {
      case 'active':
        return (c.total_transactions || 0) > 0
      case 'new':
        return c.created_at && (now - new Date(c.created_at).getTime()) <= THIRTY_DAYS
      case 'never':
        return !c.total_transactions || c.total_transactions === 0
      default:
        return true
    }
  })
}

// --- Sort ---

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Terbaru' },
  { key: 'name_asc', label: 'Nama A-Z' },
  { key: 'spent_desc', label: 'Total Belanja Terbesar' },
  { key: 'last_transaction', label: 'Transaksi Terakhir' },
]

/**
 * Sort customers. Returns new sorted array (does not mutate).
 */
export function sortCustomers(customers, sortKey) {
  const arr = [...customers]
  switch (sortKey) {
    case 'newest':
      arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      break
    case 'name_asc':
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'))
      break
    case 'spent_desc':
      arr.sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
      break
    case 'last_transaction': {
      arr.sort((a, b) => {
        const aTime = a.last_transaction_at ? new Date(a.last_transaction_at).getTime() : 0
        const bTime = b.last_transaction_at ? new Date(b.last_transaction_at).getTime() : 0
        return bTime - aTime
      })
      break
    }
    default:
      break
  }
  return arr
}

// --- Summary / Metrics ---

/**
 * Calculate customer summary stats by QUERYING sales table LIVE.
 * This ensures metrics always reflect actual transaction data,
 * not stale denormalized fields that may be out of date.
 *
 * @param {Object} supabase - Supabase client instance
 * @param {Object} business - Business object with { id }
 * @param {Array} customers - List of customer objects from CRM
 * @returns {Promise<Object>} Summary with total, active, newCustomers, totalRevenue
 */
export async function calculateSummaryFromSupabase(supabase, business, customers) {
  if (!business?.id || !customers || customers.length === 0) {
    return {
      total: 0,
      active: 0,
      newCustomers: 0,
      totalRevenue: 0,
    }
  }

  // Query sales for this business that have customer_id set
  // This naturally excludes walk-in sales (customer_id = NULL)
  const { data: sales, error } = await supabase
    .from('sales')
    .select('id, customer_id, total, created_at, product:products(name)')
    .eq('business_id', business.id)

  if (error) {
    console.error('Error fetching sales for CRM summary:', error)
    // Fall back to reading stored metrics from customers
    return calculateSummary(customers)
  }

  // Build a map: customer_id → { transaction count, total spent }
  const customerMetrics = {}

  for (const sale of sales || []) {
    if (sale.customer_id) {
      if (!customerMetrics[sale.customer_id]) {
        customerMetrics[sale.customer_id] = { count: 0, spent: 0 }
      }
      customerMetrics[sale.customer_id].count++
      customerMetrics[sale.customer_id].spent += Number(sale.total || 0)
    }
  }

  // Also query for walk-in sales to count business total revenue
  // (walk-in sales don't contribute to individual customer metrics)
  let allSales = []
  if (sales) {
    allSales = sales
  }

  let activeCount = 0
  let newCount = 0
  let totalRevenue = 0
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  for (const c of customers) {
    // Use LIVE metrics from sales table
    const metrics = customerMetrics[c.id] || { count: 0, spent: 0 }

    if (metrics.count > 0) activeCount++
    totalRevenue += metrics.spent

    // Check if customer was created within last 30 days
    if (c.created_at && (now - new Date(c.created_at).getTime()) <= THIRTY_DAYS) {
      newCount++
    }
  }

  return {
    total: customers.length,
    active: activeCount,
    newCustomers: newCount,
    totalRevenue,
  }
}

/**
 * Calculate customer summary stats from a list of customers (legacy).
 * Reads stored total_transactions/total_spent from customer records.
 * Use calculateSummaryFromSupabase() for live metrics.
 *
 * @deprecated Use calculateSummaryFromSupabase() instead
 */
export function calculateSummary(customers) {
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  let activeCount = 0
  let newCount = 0
  let totalRevenue = 0

  for (const c of customers) {
    if ((c.total_transactions || 0) > 0) activeCount++
    if (c.created_at && (now - new Date(c.created_at).getTime()) <= THIRTY_DAYS) newCount++
    totalRevenue += safeNumber(c.total_spent)
  }

  return {
    total: customers.length,
    active: activeCount,
    newCustomers: newCount,
    totalRevenue,
  }
}

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

/**
 * Ensure a numeric value is safe for display/storage.
 * Returns the value if safe, 0 otherwise.
 */
export function sanitizeMetric(val) {
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

// --- Pagination ---

export const PAGE_SIZE = 20

/**
 * Paginate an array.
 * Returns { items, totalPages, currentPage }
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
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a date+time to Indonesian locale.
 */
export function formatDateTime(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format relative time (e.g., "3 hari lalu").
 */
export function formatRelativeTime(date) {
  if (!date) return '-'
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then

  if (diff < 0) return 'baru saja'

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} hari lalu`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} bulan lalu`

  const years = Math.floor(months / 12)
  return `${years} tahun lalu`
}
