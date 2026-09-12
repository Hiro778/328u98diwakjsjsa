/**
 * Supplier Database utility functions.
 *
 * Handles: validation, sanitization, search, filter, sort, pagination,
 * summary metrics, restock calculations.
 * All pure functions — no side effects, no Supabase calls.
 */

// ── Constants ──

export const SUPPLIER_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Tidak Aktif' },
]

export const SUPPLIER_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nama A-Z' },
  { value: 'name_desc', label: 'Nama Z-A' },
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'products_desc', label: 'Produk Terbanyak' },
]

export const PAGE_SIZE = 12

// ── Validation ──

/**
 * Validate supplier form fields.
 * @param {Object} form - form data
 * @param {Array} existingSuppliers - list of existing suppliers (for code uniqueness)
 * @param {string|null} editingId - id of supplier being edited (null for new)
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateSupplier(form, existingSuppliers = [], editingId = null) {
  const errors = {}

  // Name: required
  const name = (form.name || '').trim()
  if (!name) {
    errors.name = 'Nama supplier wajib diisi'
  } else if (name.length > 200) {
    errors.name = 'Nama supplier maksimal 200 karakter'
  }

  // Email: valid format if provided
  if (form.email && form.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) {
      errors.email = 'Format email tidak valid'
    }
  }

  // Phone: reasonable format if provided
  if (form.phone && form.phone.trim()) {
    if (!/^[+\d\s\-()]{7,20}$/.test(form.phone.trim())) {
      errors.phone = 'Nomor telepon tidak valid'
    }
  }

  // Supplier code: unique per business if provided
  if (form.supplier_code && form.supplier_code.trim()) {
    const code = form.supplier_code.trim().toUpperCase()
    const duplicate = existingSuppliers.find(
      (s) =>
        s.supplier_code &&
        s.supplier_code.toUpperCase() === code &&
        s.id !== editingId
    )
    if (duplicate) {
      errors.supplier_code = 'Kode supplier sudah digunakan'
    }
  }

  // Contact person: max length
  if (form.contact_person && form.contact_person.trim().length > 200) {
    errors.contact_person = 'Nama kontak person maksimal 200 karakter'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ── Sanitization ──

/**
 * Sanitize supplier form input: trim whitespace.
 */
export function sanitizeSupplierInput(form) {
  return {
    ...form,
    name: (form.name || '').trim(),
    supplier_code: (form.supplier_code || '').trim(),
    contact_person: (form.contact_person || '').trim(),
    phone: (form.phone || '').trim(),
    email: (form.email || '').trim(),
    address: (form.address || '').trim(),
    notes: (form.notes || '').trim(),
    is_active: form.is_active !== false,
  }
}

// ── Supplier Code Generation ──

/**
 * Generate a supplier code from name.
 * e.g. "PT Maju Jaya" → "PTMAJUJAYA"
 */
export function generateSupplierCode(name) {
  if (!name) return ''
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20)
}

// ── Search ──

/**
 * Client-side search across supplier name, code, contact_person, phone, email.
 * Case-insensitive.
 */
export function searchSuppliers(suppliers, query) {
  if (!query || !query.trim()) return suppliers
  const q = query.toLowerCase().trim()
  return suppliers.filter((s) => {
    const name = (s.name || '').toLowerCase()
    const code = (s.supplier_code || '').toLowerCase()
    const contact = (s.contact_person || '').toLowerCase()
    const phone = (s.phone || '').toLowerCase()
    const email = (s.email || '').toLowerCase()
    return (
      name.includes(q) ||
      code.includes(q) ||
      contact.includes(q) ||
      phone.includes(q) ||
      email.includes(q)
    )
  })
}

// ── Filter ──

/**
 * Filter suppliers by active status.
 */
export function filterSuppliers(suppliers, filter) {
  if (!filter || filter === 'all') return suppliers
  return suppliers.filter((s) => {
    if (filter === 'active') return s.is_active !== false
    if (filter === 'inactive') return s.is_active === false
    return true
  })
}

// ── Sort ──

/**
 * Sort suppliers by the given sort option.
 * @param {Array} suppliers - supplier list with _productCount attached
 * @param {string} sortBy - sort option value
 */
export function sortSuppliers(suppliers, sortBy) {
  const sorted = [...suppliers]
  switch (sortBy) {
    case 'name_asc':
      return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    case 'name_desc':
      return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    case 'newest':
      return sorted.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      )
    case 'oldest':
      return sorted.sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      )
    case 'products_desc':
      return sorted.sort(
        (a, b) => (b._productCount || 0) - (a._productCount || 0)
      )
    default:
      return sorted
  }
}

// ── Pagination ──

/**
 * Paginate an array.
 * @returns {{ items: Array, totalPages: number, currentPage: number, total: number }}
 */
export function paginate(items, page = 1, perPage = PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const start = (currentPage - 1) * perPage
  const end = start + perPage

  return {
    items: items.slice(start, end),
    totalPages,
    currentPage,
    total,
  }
}

// ── Summary ──

/**
 * Calculate supplier dashboard summary metrics.
 * @param {Array} suppliers - supplier list with _productCount attached
 * @returns {Object} summary metrics
 */
export function calculateSupplierSummary(suppliers) {
  const total = suppliers.length
  const active = suppliers.filter((s) => s.is_active !== false).length
  const inactive = total - active

  // Supplier with most products
  let topSupplier = null
  let maxProducts = 0
  for (const s of suppliers) {
    const count = s._productCount || 0
    if (count > maxProducts) {
      maxProducts = count
      topSupplier = s
    }
  }

  // Last used supplier (most recent updated_at)
  const lastUsed = [...suppliers].sort(
    (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
  )[0] || null

  // Recent activity: suppliers updated in last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentActivity = suppliers
    .filter((s) => s.updated_at && new Date(s.updated_at) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))

  return {
    total,
    active,
    inactive,
    topSupplier,
    topSupplierProductCount: maxProducts,
    lastUsed,
    recentActivity,
  }
}

// ── Restock Calculations ──

/**
 * Calculate recommended restock quantity.
 * Returns null if maximum_stock is not set or is 0.
 * @param {number} currentStock
 * @param {number} maximumStock
 * @returns {number|null}
 */
export function calculateRecommendedRestock(currentStock, maximumStock) {
  const max = Number(maximumStock) || 0
  const current = Number(currentStock) || 0
  if (max <= 0) return null
  return Math.max(0, max - current)
}

/**
 * Get stock status from inventory data.
 */
function getStockStatus(currentStock, minStock) {
  const stock = Number(currentStock) || 0
  const min = Number(minStock) || 0
  if (stock <= 0) return 'out_of_stock'
  if (stock <= min) return 'low_stock'
  return 'in_stock'
}

/**
 * Filter products that need restock (out of stock or low stock).
 * Products come from inventory join query.
 * @param {Array} products - inventory products with inventory data
 * @returns {Array} restock products with computed fields
 */
export function getRestockProducts(products) {
  if (!products || !Array.isArray(products)) return []

  return products
    .filter((p) => {
      const stock = Number(p.inventory?.quantity) || 0
      const maxStock = Number(p.inventory?.maximum_stock) || 0
      const minStock = Number(p.inventory?.min_stock) || 0
      const status = getStockStatus(stock, minStock)
      if (status === 'out_of_stock' || status === 'low_stock') {
        return true
      }
      if (maxStock > 0 && stock < maxStock) {
        return true
      }
      return false
    })
    .map((p) => {
      const stock = Number(p.inventory?.quantity) || 0
      const maxStock = Number(p.inventory?.maximum_stock) || 0
      const minStock = Number(p.inventory?.min_stock) || 0
      const status = getStockStatus(stock, minStock)
      const recommended = calculateRecommendedRestock(stock, maxStock)

      return {
        ...p,
        _currentStock: stock,
        _minStock: minStock,
        _maxStock: maxStock,
        _stockStatus: status,
        _recommendedRestock: recommended,
      }
    })
    .sort((a, b) => {
      // Out of stock first, then low stock
      const order = { out_of_stock: 0, low_stock: 1, in_stock: 2 }
      const aOrder = order[a._stockStatus] ?? 2
      const bOrder = order[b._stockStatus] ?? 2
      if (aOrder !== bOrder) return aOrder - bOrder
      return a._currentStock - b._currentStock
    })
}
