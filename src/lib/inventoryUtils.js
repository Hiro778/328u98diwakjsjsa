/**
 * Inventory Management utility functions.
 *
 * Handles: validation, stock status, search, filter, sort, pagination, summary metrics.
 * All pure functions — no side effects, no Supabase calls.
 */

// ── Constants ──

export const MOVEMENT_TYPES = {
  STOCK_IN: 'stock_in',
  STOCK_OUT: 'stock_out',
  ADJUSTMENT_INCREASE: 'adjustment_increase',
  ADJUSTMENT_DECREASE: 'adjustment_decrease',
}

export const MOVEMENT_LABELS = {
  [MOVEMENT_TYPES.STOCK_IN]: 'Barang Masuk',
  [MOVEMENT_TYPES.STOCK_OUT]: 'Barang Keluar',
  [MOVEMENT_TYPES.ADJUSTMENT_INCREASE]: 'Penyesuaian Naik',
  [MOVEMENT_TYPES.ADJUSTMENT_DECREASE]: 'Penyesuaian Turun',
}

export const MOVEMENT_ICONS = {
  [MOVEMENT_TYPES.STOCK_IN]: '↑',
  [MOVEMENT_TYPES.STOCK_OUT]: '↓',
  [MOVEMENT_TYPES.ADJUSTMENT_INCREASE]: '➚',
  [MOVEMENT_TYPES.ADJUSTMENT_DECREASE]: '➘',
}

export const STOCK_STATUS = {
  OUT_OF_STOCK: 'out_of_stock',       // current_stock <= 0
  LOW_STOCK: 'low_stock',             // 0 < current_stock <= minimum_stock
  IN_STOCK: 'in_stock',               // current_stock > minimum_stock
}

export const STOCK_STATUS_LABELS = {
  [STOCK_STATUS.OUT_OF_STOCK]: 'Habis',
  [STOCK_STATUS.LOW_STOCK]: 'Stok Menipis',
  [STOCK_STATUS.IN_STOCK]: 'Tersedia',
}

export const STOCK_STATUS_COLORS = {
  [STOCK_STATUS.OUT_OF_STOCK]: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  [STOCK_STATUS.LOW_STOCK]: { bg: 'bg-warm-50', text: 'text-warm-500', border: 'border-warm-200' },
  [STOCK_STATUS.IN_STOCK]: { bg: 'bg-profit-50', text: 'text-profit-600', border: 'border-profit-200' },
}

export const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'in_stock', label: 'Aman' },
  { value: 'low_stock', label: 'Menipis' },
  { value: 'out_of_stock', label: 'Habis' },
  { value: 'inactive', label: 'Nonaktif' },
]

export const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nama A-Z' },
  { value: 'name_desc', label: 'Nama Z-A' },
  { value: 'stock_asc', label: 'Stok Terendah' },
  { value: 'stock_desc', label: 'Stok Tertinggi' },
  { value: 'value_desc', label: 'Nilai Stok Terbesar' },
  { value: 'newest', label: 'Terbaru' },
]

export const ITEMS_PER_PAGE = 12

// ── Stock Status ──

/**
 * Determine stock status for a product.
 * @param {number} currentStock - current stock quantity
 * @param {number} minimumStock - minimum stock threshold
 * @returns {string} one of STOCK_STATUS values
 */
export function getStockStatus(currentStock, minimumStock = 0) {
  const stock = Number(currentStock) || 0
  const min = Number(minimumStock) || 0

  if (stock <= 0) return STOCK_STATUS.OUT_OF_STOCK
  if (stock <= min) return STOCK_STATUS.LOW_STOCK
  return STOCK_STATUS.IN_STOCK
}

/**
 * Get stock status label in Indonesian.
 */
export function getStockStatusLabel(currentStock, minimumStock = 0) {
  return STOCK_STATUS_LABELS[getStockStatus(currentStock, minimumStock)]
}

/**
 * Get stock status color classes.
 */
export function getStockStatusColors(currentStock, minimumStock = 0) {
  return STOCK_STATUS_COLORS[getStockStatus(currentStock, minimumStock)]
}

// ── Validation ──

/**
 * Validate product form fields.
 * Returns { valid, errors } where errors is an object keyed by field name.
 */
export function validateProduct(form) {
  const errors = {}

  // Name: required
  const name = (form.name || '').trim()
  if (!name) {
    errors.name = 'Nama barang/bahan wajib diisi'
  } else if (name.length > 200) {
    errors.name = 'Nama barang/bahan maksimal 200 karakter'
  }

  // Unit: required
  const unit = (form.unit || '').trim()
  if (!unit) {
    errors.unit = 'Satuan wajib diisi'
  }

  // SKU: optional but if provided, must be valid format
  const sku = (form.sku || '').trim()
  if (sku && sku.length > 50) {
    errors.sku = 'SKU maksimal 50 karakter'
  }

  // Prices: must not be negative
  if (form.unit_price !== undefined && form.unit_price !== '') {
    const price = Number(form.unit_price)
    if (!Number.isFinite(price) || price < 0) {
      errors.unit_price = 'Harga jual tidak boleh negatif'
    }
  }

  if (form.cost_price !== undefined && form.cost_price !== '') {
    const cost = Number(form.cost_price)
    if (!Number.isFinite(cost) || cost < 0) {
      errors.cost_price = 'Harga beli/HPP tidak boleh negatif'
    }
  }

  // Stock: must not be negative
  if (form.current_stock !== undefined && form.current_stock !== '') {
    const stock = Number(form.current_stock)
    if (!Number.isFinite(stock) || stock < 0) {
      errors.current_stock = 'Stok tidak boleh negatif'
    }
  }

  // Minimum stock: must not be negative
  if (form.minimum_stock !== undefined && form.minimum_stock !== '') {
    const min = Number(form.minimum_stock)
    if (!Number.isFinite(min) || min < 0) {
      errors.minimum_stock = 'Stok minimum tidak boleh negatif'
    }
  }

  // Maximum stock: must be >= minimum_stock if provided
  if (form.maximum_stock !== undefined && form.maximum_stock !== '') {
    const max = Number(form.maximum_stock)
    if (!Number.isFinite(max) || max < 0) {
      errors.maximum_stock = 'Stok maksimal tidak boleh negatif'
    } else if (form.minimum_stock !== undefined && form.minimum_stock !== '') {
      const min = Number(form.minimum_stock)
      if (Number.isFinite(min) && max > 0 && max < min) {
        errors.maximum_stock = 'Stok maksimal harus lebih besar atau sama dengan stok minimum'
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Validate stock adjustment form.
 */
export function validateStockAdjustment(form, currentStock) {
  const errors = {}

  if (!form.movement_type) {
    errors.movement_type = 'Tipe gerakan wajib dipilih'
  }

  const qty = Number(form.quantity)
  if (!form.quantity && form.quantity !== 0) {
    errors.quantity = 'Jumlah wajib diisi'
  } else if (!Number.isFinite(qty) || qty <= 0) {
    errors.quantity = 'Jumlah harus berupa angka positif'
  } else if (!Number.isInteger(qty)) {
    errors.quantity = 'Jumlah harus berupa bilangan bulat'
  }

  if (!form.reason || !form.reason.trim()) {
    errors.reason = 'Alasan wajib diisi'
  }

  // Check insufficient stock for decrease operations
  if (
    qty > 0 &&
    (form.movement_type === MOVEMENT_TYPES.STOCK_OUT || form.movement_type === MOVEMENT_TYPES.ADJUSTMENT_DECREASE)
  ) {
    if (qty > currentStock) {
      errors.quantity = `Stok tidak cukup. Stok saat ini: ${currentStock}`
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Validate supplier form.
 */
export function validateSupplier(form) {
  const errors = {}

  const name = (form.name || '').trim()
  if (!name) {
    errors.name = 'Nama supplier wajib diisi'
  } else if (name.length > 200) {
    errors.name = 'Nama supplier maksimal 200 karakter'
  }

  if (form.email && form.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email.trim())) {
      errors.email = 'Format email tidak valid'
    }
  }

  if (form.phone && form.phone.trim()) {
    if (!/^[+\d\s\-()]{7,20}$/.test(form.phone.trim())) {
      errors.phone = 'Nomor telepon tidak valid'
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ── Sanitization ──

/**
 * Safe number parse: returns 0 for empty, NaN, Infinity.
 */
function safeNum(value) {
  if (value === '' || value === undefined || value === null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Sanitize product form input: trim whitespace, normalize numbers.
 */
export function sanitizeProductInput(form) {
  return {
    ...form,
    name: (form.name || '').trim(),
    sku: (form.sku || '').trim(),
    description: (form.description || '').trim(),
    category: (form.category || '').trim(),
    unit: (form.unit || '').trim(),
    unit_price: safeNum(form.unit_price),
    cost_price: safeNum(form.cost_price),
    current_stock: safeNum(form.current_stock),
    minimum_stock: safeNum(form.minimum_stock),
    maximum_stock: safeNum(form.maximum_stock),
    location: (form.location || '').trim(),
    notes: (form.notes || '').trim(),
    is_active: form.is_active !== false,
  }
}

/**
 * Sanitize supplier form input.
 */
export function sanitizeSupplierInput(form) {
  return {
    ...form,
    name: (form.name || '').trim(),
    contact: (form.contact || '').trim(),
    phone: (form.phone || '').trim(),
    email: (form.email || '').trim(),
    address: (form.address || '').trim(),
    notes: (form.notes || '').trim(),
  }
}

// ── Stock Calculations ──

/**
 * Calculate recommended restock quantity.
 * Returns null if maximum_stock is not set or is 0.
 */
export function calculateRecommendedRestock(currentStock, maximumStock) {
  const max = Number(maximumStock) || 0
  const current = Number(currentStock) || 0
  if (max <= 0) return null
  return Math.max(0, max - current)
}

/**
 * Calculate inventory value for a product.
 */
export function calcInventoryValue(unitCostPrice, quantity) {
  const cost = Number(unitCostPrice) || 0
  const qty = Number(quantity) || 0
  return Math.round(cost * qty * 100) / 100
}

// ── Search ──

/**
 * Client-side search across product name, SKU, category.
 * Case-insensitive.
 */
export function searchProducts(products, query) {
  if (!query || !query.trim()) return products
  const q = query.toLowerCase().trim()
  return products.filter((p) => {
    const name = (p.name || '').toLowerCase()
    const sku = (p.sku || '').toLowerCase()
    const category = (p.category || '').toLowerCase()
    return name.includes(q) || sku.includes(q) || category.includes(q)
  })
}

// ── Filter ──

/**
 * Filter products by stock status.
 */
export function filterProducts(products, filter) {
  if (!filter || filter === 'all') return products
  if (filter === 'inactive') {
    return products.filter((p) => p.is_active === false)
  }
  return products.filter((p) => {
    if (p.is_active === false) return false
    const status = getStockStatus(
      getEffectiveStock(p),
      getEffectiveMinStock(p)
    )
    return status === filter
  })
}

// ── Sort ──

/**
 * Sort products by the given sort option.
 */
export function sortProducts(products, sortBy) {
  const sorted = [...products]
  switch (sortBy) {
    case 'name_asc':
      return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    case 'name_desc':
      return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''))
    case 'stock_desc':
      return sorted.sort((a, b) => getEffectiveStock(b) - getEffectiveStock(a))
    case 'stock_asc':
      return sorted.sort((a, b) => getEffectiveStock(a) - getEffectiveStock(b))
    case 'value_desc':
      return sorted.sort((a, b) =>
        calcInventoryValue(b.cost_price, getEffectiveStock(b)) -
        calcInventoryValue(a.cost_price, getEffectiveStock(a))
      )
    case 'newest':
      return sorted.sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
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
export function paginate(items, page = 1, perPage = ITEMS_PER_PAGE) {
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

// ── Summary Metrics ──

/**
 * Calculate inventory dashboard summary metrics.
 * @param {Array} products - products with inventory data
 * @returns {Object} summary metrics
 */
export function calculateInventorySummary(products) {
  const totalProducts = products.length
  const activeProducts = products.filter((p) => p.is_active !== false).length

  let totalStock = 0
  let lowStockCount = 0
  let outOfStockCount = 0
  let inventoryValue = 0
  let restockNeeded = 0

  for (const p of products) {
    const stock = getEffectiveStock(p)
    const minStock = getEffectiveMinStock(p)
    const maxStock = getEffectiveMaxStock(p)
    const status = getStockStatus(stock, minStock)

    totalStock += stock
    inventoryValue += calcInventoryValue(p.cost_price, stock)

    if (status === STOCK_STATUS.LOW_STOCK) lowStockCount++
    if (status === STOCK_STATUS.OUT_OF_STOCK) outOfStockCount++

    const restock = calculateRecommendedRestock(stock, maxStock)
    if (restock !== null && restock > 0) restockNeeded++
  }

  return {
    totalProducts,
    activeProducts,
    totalStock,
    lowStockCount,
    outOfStockCount,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
    restockNeeded,
  }
}

/**
 * Get products that need restock (sorted by urgency).
 */
export function getRestockProducts(products) {
  return products
    .filter((p) => {
      const stock = getEffectiveStock(p)
      const maxStock = getEffectiveMaxStock(p)
      const restock = calculateRecommendedRestock(stock, maxStock)
      return restock !== null && restock > 0
    })
    .sort((a, b) => {
      const aStatus = getStockStatus(getEffectiveStock(a), getEffectiveMinStock(a))
      const bStatus = getStockStatus(getEffectiveStock(b), getEffectiveMinStock(b))
      // out_of_stock first, then low_stock
      if (aStatus === STOCK_STATUS.OUT_OF_STOCK && bStatus !== STOCK_STATUS.OUT_OF_STOCK) return -1
      if (bStatus === STOCK_STATUS.OUT_OF_STOCK && aStatus !== STOCK_STATUS.OUT_OF_STOCK) return 1
      return getEffectiveStock(a) - getEffectiveStock(b)
    })
}

/**
 * Get lowest stock products (sorted by stock ascending).
 */
export function getLowestStockProducts(products, limit = 5) {
  return [...products]
    .sort((a, b) => getEffectiveStock(a) - getEffectiveStock(b))
    .slice(0, limit)
}

// ── Helpers ──

/**
 * Get effective stock from product (handles joined inventory data).
 * Products loaded with inventory join will have inventory.quantity.
 * Products without inventory row get default 0.
 */
export function getEffectiveStock(product) {
  if (!product) return 0
  if (Array.isArray(product.inventory)) {
    return Number(product.inventory[0]?.quantity) || 0
  }
  if (product.inventory != null) {
    return Number(product.inventory.quantity) || 0
  }
  return Number(product.current_stock) || 0
}

/**
 * Get effective minimum stock.
 */
export function getEffectiveMinStock(product) {
  if (!product) return 0
  if (Array.isArray(product.inventory)) {
    return Number(product.inventory[0]?.min_stock) || 0
  }
  if (product.inventory !== undefined && product.inventory !== null) {
    return Number(product.inventory.min_stock) || 0
  }
  return Number(product.minimum_stock) || 0
}

/**
 * Get effective maximum stock.
 */
export function getEffectiveMaxStock(product) {
  if (!product) return 0
  if (Array.isArray(product.inventory)) {
    return Number(product.inventory[0]?.maximum_stock) || 0
  }
  if (product.inventory !== undefined && product.inventory !== null) {
    return Number(product.inventory.maximum_stock) || 0
  }
  return Number(product.maximum_stock) || 0
}

/**
 * Format movement type to Indonesian label.
 */
export function getMovementLabel(type) {
  return MOVEMENT_LABELS[type] || type
}

/**
 * Get effective location from product (handles joined inventory data).
 */
export function getEffectiveLocation(product) {
  if (!product) return ''
  if (Array.isArray(product.inventory)) {
    return (product.inventory[0]?.location || '').trim()
  }
  if (product.inventory !== undefined && product.inventory !== null) {
    return (product.inventory.location || '').trim()
  }
  return (product.location || '').trim()
}

/**
 * Safe number parse: returns 0 for empty, NaN, Infinity.
 * Exported for use in tests and external code.
 */
export function safeNumber(value) {
  return safeNum(value)
}
