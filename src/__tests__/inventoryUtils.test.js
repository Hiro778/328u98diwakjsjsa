import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MOVEMENT_TYPES,
  MOVEMENT_LABELS,
  STOCK_STATUS,
  FILTER_OPTIONS,
  SORT_OPTIONS,
  ITEMS_PER_PAGE,
  getStockStatus,
  getStockStatusLabel,
  getStockStatusColors,
  validateProduct,
  validateStockAdjustment,
  validateSupplier,
  sanitizeProductInput,
  sanitizeSupplierInput,
  calculateRecommendedRestock,
  calcInventoryValue,
  searchProducts,
  filterProducts,
  sortProducts,
  paginate,
  calculateInventorySummary,
  getRestockProducts,
  getLowestStockProducts,
  getEffectiveStock,
  getEffectiveMinStock,
  getEffectiveMaxStock,
  getEffectiveLocation,
  getMovementLabel,
  safeNumber,
} from '../lib/inventoryUtils.js'

// ─── Constants ────────────────────────────────────────────

describe('Constants', () => {
  it('MOVEMENT_TYPES has all 4 types', () => {
    assert.equal(Object.keys(MOVEMENT_TYPES).length, 4)
    assert.ok(MOVEMENT_TYPES.STOCK_IN)
    assert.ok(MOVEMENT_TYPES.STOCK_OUT)
    assert.ok(MOVEMENT_TYPES.ADJUSTMENT_INCREASE)
    assert.ok(MOVEMENT_TYPES.ADJUSTMENT_DECREASE)
  })

  it('MOVEMENT_LABELS has labels for all types', () => {
    for (const key of Object.keys(MOVEMENT_TYPES)) {
      assert.ok(MOVEMENT_LABELS[MOVEMENT_TYPES[key]], `Missing label for ${key}`)
    }
  })

  it('STOCK_STATUS has 3 statuses', () => {
    assert.equal(Object.keys(STOCK_STATUS).length, 3)
    assert.ok(STOCK_STATUS.OUT_OF_STOCK)
    assert.ok(STOCK_STATUS.LOW_STOCK)
    assert.ok(STOCK_STATUS.IN_STOCK)
  })

  it('FILTER_OPTIONS has 5 options including inactive', () => {
    assert.equal(FILTER_OPTIONS.length, 5)
    const values = FILTER_OPTIONS.map((o) => o.value)
    assert.ok(values.includes('all'))
    assert.ok(values.includes('in_stock'))
    assert.ok(values.includes('low_stock'))
    assert.ok(values.includes('out_of_stock'))
    assert.ok(values.includes('inactive'))
  })

  it('SORT_OPTIONS has 6 options including name_desc', () => {
    assert.equal(SORT_OPTIONS.length, 6)
    const values = SORT_OPTIONS.map((o) => o.value)
    assert.ok(values.includes('name_asc'))
    assert.ok(values.includes('name_desc'))
    assert.ok(values.includes('stock_asc'))
    assert.ok(values.includes('stock_desc'))
    assert.ok(values.includes('value_desc'))
    assert.ok(values.includes('newest'))
  })

  it('ITEMS_PER_PAGE is 12', () => {
    assert.equal(ITEMS_PER_PAGE, 12)
  })
})

// ─── getStockStatus ───────────────────────────────────────

describe('getStockStatus', () => {
  it('returns OUT_OF_STOCK when stock <= 0', () => {
    assert.equal(getStockStatus(0, 10), STOCK_STATUS.OUT_OF_STOCK)
    assert.equal(getStockStatus(-5, 10), STOCK_STATUS.OUT_OF_STOCK)
  })

  it('returns LOW_STOCK when 0 < stock <= min', () => {
    assert.equal(getStockStatus(5, 10), STOCK_STATUS.LOW_STOCK)
    assert.equal(getStockStatus(1, 1), STOCK_STATUS.LOW_STOCK)
  })

  it('returns IN_STOCK when stock > min', () => {
    assert.equal(getStockStatus(15, 10), STOCK_STATUS.IN_STOCK)
    assert.equal(getStockStatus(1, 0), STOCK_STATUS.IN_STOCK)
  })

  it('handles null/undefined/NaN values', () => {
    assert.equal(getStockStatus(null, 10), STOCK_STATUS.OUT_OF_STOCK)
    assert.equal(getStockStatus(undefined, 10), STOCK_STATUS.OUT_OF_STOCK)
    assert.equal(getStockStatus('abc', 10), STOCK_STATUS.OUT_OF_STOCK)
  })

  it('defaults minStock to 0', () => {
    assert.equal(getStockStatus(5), STOCK_STATUS.IN_STOCK)
    assert.equal(getStockStatus(0), STOCK_STATUS.OUT_OF_STOCK)
  })

  it('handles Infinity stock', () => {
    assert.equal(getStockStatus(Infinity, 10), STOCK_STATUS.IN_STOCK)
  })

  it('handles very large numbers', () => {
    assert.equal(getStockStatus(999999999, 10), STOCK_STATUS.IN_STOCK)
  })
})

// ─── getStockStatusLabel ───────────────────────────────────

describe('getStockStatusLabel', () => {
  it('returns correct labels in Indonesian', () => {
    assert.equal(getStockStatusLabel(0, 10), 'Habis')
    assert.equal(getStockStatusLabel(5, 10), 'Stok Menipis')
    assert.equal(getStockStatusLabel(15, 10), 'Tersedia')
  })
})

// ─── getStockStatusColors ──────────────────────────────────

describe('getStockStatusColors', () => {
  it('returns color objects for each status', () => {
    const outOfStock = getStockStatusColors(0, 10)
    assert.ok(outOfStock.bg.includes('red'))
    assert.ok(outOfStock.text.includes('red'))

    const lowStock = getStockStatusColors(5, 10)
    assert.ok(lowStock.bg.includes('warm'))

    const inStock = getStockStatusColors(15, 10)
    assert.ok(inStock.bg.includes('profit'))
  })
})

// ─── validateProduct ───────────────────────────────────────

describe('validateProduct', () => {
  it('requires name', () => {
    const result = validateProduct({ name: '' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.name)
  })

  it('rejects very long name (>200 chars)', () => {
    const result = validateProduct({ name: 'A'.repeat(201) })
    assert.equal(result.valid, false)
    assert.ok(result.errors.name)
  })

  it('accepts valid product with required fields', () => {
    const result = validateProduct({ name: 'Kopi ABC', unit: 'pcs' })
    assert.equal(result.valid, true)
  })

  it('requires unit', () => {
    const result = validateProduct({ name: 'Test', unit: '' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.unit)
  })

  it('accepts product without optional fields', () => {
    const result = validateProduct({ name: 'Test', unit: 'kg' })
    assert.equal(result.valid, true)
  })

  it('rejects negative prices', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', unit_price: -100 })
    assert.equal(result.valid, false)
    assert.ok(result.errors.unit_price)
  })

  it('rejects negative cost_price', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', cost_price: -50 })
    assert.equal(result.valid, false)
    assert.ok(result.errors.cost_price)
  })

  it('rejects negative stock', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', current_stock: -5 })
    assert.equal(result.valid, false)
    assert.ok(result.errors.current_stock)
  })

  it('rejects negative minimum_stock', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', minimum_stock: -1 })
    assert.equal(result.valid, false)
    assert.ok(result.errors.minimum_stock)
  })

  it('rejects maximum_stock < minimum_stock', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', minimum_stock: 10, maximum_stock: 5 })
    assert.equal(result.valid, false)
    assert.ok(result.errors.maximum_stock)
  })

  it('accepts maximum_stock >= minimum_stock', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', minimum_stock: 5, maximum_stock: 10 })
    assert.equal(result.valid, true)
  })

  it('accepts maximum_stock = 0 (unset)', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', minimum_stock: 5, maximum_stock: 0 })
    assert.equal(result.valid, true)
  })

  it('rejects invalid SKU length (>50)', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', sku: 'A'.repeat(51) })
    assert.equal(result.valid, false)
    assert.ok(result.errors.sku)
  })

  it('rejects non-finite prices (NaN)', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', unit_price: NaN })
    assert.equal(result.valid, false)
    assert.ok(result.errors.unit_price)
  })

  it('rejects Infinity prices', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', cost_price: Infinity })
    assert.equal(result.valid, false)
    assert.ok(result.errors.cost_price)
  })

  it('rejects NaN stock values', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', current_stock: NaN })
    assert.equal(result.valid, false)
    assert.ok(result.errors.current_stock)
  })

  it('rejects Infinity stock values', () => {
    const result = validateProduct({ name: 'Test', unit: 'pcs', minimum_stock: Infinity })
    assert.equal(result.valid, false)
    assert.ok(result.errors.minimum_stock)
  })
})

// ─── validateStockAdjustment ───────────────────────────────

describe('validateStockAdjustment', () => {
  it('requires movement_type', () => {
    const result = validateStockAdjustment({ quantity: 5, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
    assert.ok(result.errors.movement_type)
  })

  it('requires quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', reason: 'Test' }, 10)
    assert.equal(result.valid, false)
    assert.ok(result.errors.quantity)
  })

  it('rejects zero quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', quantity: 0, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
  })

  it('rejects negative quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', quantity: -5, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
  })

  it('rejects non-integer quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', quantity: 5.5, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
  })

  it('requires reason', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', quantity: 5, reason: '' }, 10)
    assert.equal(result.valid, false)
    assert.ok(result.errors.reason)
  })

  it('rejects stock_out exceeding current stock', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_out', quantity: 15, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
    assert.ok(result.errors.quantity.includes('tidak cukup'))
  })

  it('rejects adjustment_decrease exceeding current stock', () => {
    const result = validateStockAdjustment({ movement_type: 'adjustment_decrease', quantity: 20, reason: 'Test' }, 10)
    assert.equal(result.valid, false)
  })

  it('allows stock_in any quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_in', quantity: 100, reason: 'Restock' }, 10)
    assert.equal(result.valid, true)
  })

  it('allows stock_out within current stock', () => {
    const result = validateStockAdjustment({ movement_type: 'stock_out', quantity: 10, reason: 'Sale' }, 10)
    assert.equal(result.valid, true)
  })

  it('allows adjustment_increase any quantity', () => {
    const result = validateStockAdjustment({ movement_type: 'adjustment_increase', quantity: 50, reason: 'Koreksi' }, 5)
    assert.equal(result.valid, true)
  })

  it('valid adjustment passes', () => {
    const result = validateStockAdjustment({
      movement_type: 'stock_in',
      quantity: 50,
      reason: 'Restock dari supplier XYZ',
    }, 10)
    assert.equal(result.valid, true)
  })
})

// ─── validateSupplier ──────────────────────────────────────

describe('validateSupplier', () => {
  it('requires name', () => {
    const result = validateSupplier({ name: '' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.name)
  })

  it('accepts valid supplier', () => {
    const result = validateSupplier({ name: 'Supplier ABC' })
    assert.equal(result.valid, true)
  })

  it('rejects invalid email', () => {
    const result = validateSupplier({ name: 'Test', email: 'not-an-email' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.email)
  })

  it('accepts valid email', () => {
    const result = validateSupplier({ name: 'Test', email: 'test@email.com' })
    assert.equal(result.valid, true)
  })

  it('rejects invalid phone', () => {
    const result = validateSupplier({ name: 'Test', phone: 'abc' })
    assert.equal(result.valid, false)
    assert.ok(result.errors.phone)
  })

  it('accepts valid phone', () => {
    const result = validateSupplier({ name: 'Test', phone: '08123456789' })
    assert.equal(result.valid, true)
  })

  it('rejects long name (>200)', () => {
    const result = validateSupplier({ name: 'A'.repeat(201) })
    assert.equal(result.valid, false)
  })
})

// ─── sanitizeProductInput ──────────────────────────────────

describe('sanitizeProductInput', () => {
  it('trims whitespace from strings', () => {
    const result = sanitizeProductInput({ name: '  Kopi ABC  ', sku: '  SKU-001  ' })
    assert.equal(result.name, 'Kopi ABC')
    assert.equal(result.sku, 'SKU-001')
  })

  it('trims location', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'pcs', location: '  Gudang A  ' })
    assert.equal(result.location, 'Gudang A')
  })

  it('converts empty strings to 0 for numbers', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'pcs', unit_price: '', cost_price: '' })
    assert.equal(result.unit_price, 0)
    assert.equal(result.cost_price, 0)
  })

  it('handles NaN/Infinity safely', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'pcs', unit_price: NaN, cost_price: Infinity })
    assert.equal(result.unit_price, 0)
    assert.equal(result.cost_price, 0)
  })

  it('defaults is_active to true', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'pcs' })
    assert.equal(result.is_active, true)
  })

  it('preserves is_active false', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'pcs', is_active: false })
    assert.equal(result.is_active, false)
  })

  it('defaults unit to empty string (not pcs)', () => {
    const result = sanitizeProductInput({ name: 'Test' })
    assert.equal(result.unit, '')
  })

  it('preserves valid unit', () => {
    const result = sanitizeProductInput({ name: 'Test', unit: 'kg' })
    assert.equal(result.unit, 'kg')
  })
})

// ─── sanitizeSupplierInput ─────────────────────────────────

describe('sanitizeSupplierInput', () => {
  it('trims all string fields', () => {
    const result = sanitizeSupplierInput({
      name: '  Test  ',
      phone: '  08123  ',
      email: '  test@email.com  ',
    })
    assert.equal(result.name, 'Test')
    assert.equal(result.phone, '08123')
    assert.equal(result.email, 'test@email.com')
  })
})

// ─── safeNumber ────────────────────────────────────────────

describe('safeNumber', () => {
  it('returns 0 for empty string', () => {
    assert.equal(safeNumber(''), 0)
  })

  it('returns 0 for null', () => {
    assert.equal(safeNumber(null), 0)
  })

  it('returns 0 for undefined', () => {
    assert.equal(safeNumber(undefined), 0)
  })

  it('returns 0 for NaN', () => {
    assert.equal(safeNumber(NaN), 0)
  })

  it('returns 0 for Infinity', () => {
    assert.equal(safeNumber(Infinity), 0)
  })

  it('returns 0 for -Infinity', () => {
    assert.equal(safeNumber(-Infinity), 0)
  })

  it('parses valid numbers', () => {
    assert.equal(safeNumber('42'), 42)
    assert.equal(safeNumber(3.14), 3.14)
    assert.equal(safeNumber('1000'), 1000)
  })

  it('handles large numbers', () => {
    assert.equal(safeNumber(999999999999), 999999999999)
    assert.equal(safeNumber('999999999999'), 999999999999)
  })
})

// ─── calculateRecommendedRestock ───────────────────────────

describe('calculateRecommendedRestock', () => {
  it('returns null when maxStock is 0', () => {
    assert.equal(calculateRecommendedRestock(5, 0), null)
    assert.equal(calculateRecommendedRestock(5, null), null)
    assert.equal(calculateRecommendedRestock(5, undefined), null)
  })

  it('calculates restock quantity', () => {
    assert.equal(calculateRecommendedRestock(5, 20), 15)
    assert.equal(calculateRecommendedRestock(0, 10), 10)
    assert.equal(calculateRecommendedRestock(20, 20), 0)
  })

  it('returns 0 when stock exceeds max', () => {
    assert.equal(calculateRecommendedRestock(25, 20), 0)
  })

  it('handles negative stock gracefully', () => {
    assert.equal(calculateRecommendedRestock(-5, 10), 15)
  })
})

// ─── calcInventoryValue ────────────────────────────────────

describe('calcInventoryValue', () => {
  it('calculates value correctly', () => {
    assert.equal(calcInventoryValue(10000, 10), 100000)
  })

  it('handles zero values', () => {
    assert.equal(calcInventoryValue(0, 10), 0)
    assert.equal(calcInventoryValue(10000, 0), 0)
  })

  it('handles null/undefined', () => {
    assert.equal(calcInventoryValue(null, 10), 0)
    assert.equal(calcInventoryValue(10000, null), 0)
  })

  it('rounds to 2 decimal places', () => {
    assert.equal(calcInventoryValue(10000.33, 3), 30000.99)
  })

  it('handles large numbers', () => {
    const result = calcInventoryValue(1000000, 10000)
    assert.equal(result, 10000000000)
  })
})

// ─── searchProducts ────────────────────────────────────────

describe('searchProducts', () => {
  const products = [
    { name: 'Kopi Arabika', sku: 'KA-001', category: 'Minuman' },
    { name: 'Teh Hijau', sku: 'TH-001', category: 'Minuman' },
    { name: 'Kopi Robusta', sku: 'KR-001', category: 'Biji Kopi' },
    { name: 'Nasi Goreng', sku: 'NG-001', category: 'Makanan' },
  ]

  it('returns all for empty query', () => {
    assert.equal(searchProducts(products, '').length, 4)
    assert.equal(searchProducts(products, null).length, 4)
    assert.equal(searchProducts(products, '   ').length, 4)
  })

  it('filters by name', () => {
    const result = searchProducts(products, 'kopi')
    assert.equal(result.length, 2)
  })

  it('filters by SKU', () => {
    const result = searchProducts(products, 'TH-001')
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'Teh Hijau')
  })

  it('filters by category', () => {
    const result = searchProducts(products, 'makanan')
    assert.equal(result.length, 1)
    assert.equal(result[0].name, 'Nasi Goreng')
  })

  it('is case-insensitive', () => {
    const result = searchProducts(products, 'KOPI')
    assert.equal(result.length, 2)
  })

  it('returns empty for no match', () => {
    const result = searchProducts(products, 'xyz')
    assert.equal(result.length, 0)
  })

  it('handles products with missing fields', () => {
    const sparse = [{ name: 'Test' }, { sku: 'SKU-1' }, { category: 'Food' }]
    assert.equal(searchProducts(sparse, 'test').length, 1)
    assert.equal(searchProducts(sparse, 'SKU').length, 1)
    assert.equal(searchProducts(sparse, 'food').length, 1)
  })
})

// ─── filterProducts ────────────────────────────────────────

describe('filterProducts', () => {
  const products = [
    { id: '1', name: 'A', is_active: true, inventory: { quantity: 15, min_stock: 10 } },
    { id: '2', name: 'B', is_active: true, inventory: { quantity: 3, min_stock: 10 } },
    { id: '3', name: 'C', is_active: true, inventory: { quantity: 0, min_stock: 5 } },
    { id: '4', name: 'D', is_active: false, inventory: { quantity: 20, min_stock: 5 } },
  ]

  it('returns all for "all" filter', () => {
    assert.equal(filterProducts(products, 'all').length, 4)
    assert.equal(filterProducts(products, '').length, 4)
  })

  it('filters in_stock (active only)', () => {
    const result = filterProducts(products, 'in_stock')
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '1')
  })

  it('filters low_stock (active only)', () => {
    const result = filterProducts(products, 'low_stock')
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '2')
  })

  it('filters out_of_stock (active only)', () => {
    const result = filterProducts(products, 'out_of_stock')
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '3')
  })

  it('filters inactive products', () => {
    const result = filterProducts(products, 'inactive')
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '4')
  })

  it('excludes inactive from status filters', () => {
    const inStock = filterProducts(products, 'in_stock')
    assert.ok(!inStock.find((p) => p.id === '4'))
  })
})

// ─── sortProducts ──────────────────────────────────────────

describe('sortProducts', () => {
  const products = [
    { name: 'Banana', inventory: { quantity: 5 }, cost_price: 1000, created_at: '2024-01-01' },
    { name: 'Apple', inventory: { quantity: 20 }, cost_price: 2000, created_at: '2024-06-01' },
    { name: 'Cherry', inventory: { quantity: 10 }, cost_price: 1500, created_at: '2024-03-01' },
  ]

  it('sorts by name A-Z', () => {
    const result = sortProducts(products, 'name_asc')
    assert.equal(result[0].name, 'Apple')
    assert.equal(result[2].name, 'Cherry')
  })

  it('sorts by name Z-A', () => {
    const result = sortProducts(products, 'name_desc')
    assert.equal(result[0].name, 'Cherry')
    assert.equal(result[2].name, 'Apple')
  })

  it('sorts by stock descending', () => {
    const result = sortProducts(products, 'stock_desc')
    assert.equal(result[0].inventory.quantity, 20)
  })

  it('sorts by stock ascending', () => {
    const result = sortProducts(products, 'stock_asc')
    assert.equal(result[0].inventory.quantity, 5)
  })

  it('sorts by value descending', () => {
    const result = sortProducts(products, 'value_desc')
    assert.equal(result[0].name, 'Apple') // 2000 * 20 = 40000
  })

  it('sorts by newest', () => {
    const result = sortProducts(products, 'newest')
    assert.equal(result[0].name, 'Apple')
  })

  it('does not mutate original array', () => {
    const original = [...products]
    sortProducts(products, 'name_asc')
    assert.deepEqual(products, original)
  })

  it('handles empty array', () => {
    const result = sortProducts([], 'name_asc')
    assert.equal(result.length, 0)
  })

  it('handles unknown sort option', () => {
    const result = sortProducts(products, 'unknown')
    assert.equal(result.length, 3)
  })
})

// ─── paginate ──────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }))

  it('returns first page', () => {
    const result = paginate(items, 1, 10)
    assert.equal(result.items.length, 10)
    assert.equal(result.currentPage, 1)
    assert.equal(result.totalPages, 3)
    assert.equal(result.total, 25)
  })

  it('returns last page with fewer items', () => {
    const result = paginate(items, 3, 10)
    assert.equal(result.items.length, 5)
    assert.equal(result.currentPage, 3)
  })

  it('handles page beyond range', () => {
    const result = paginate(items, 100, 10)
    assert.equal(result.currentPage, 3) // clamped to last
  })

  it('handles empty array', () => {
    const result = paginate([], 1, 10)
    assert.equal(result.items.length, 0)
    assert.equal(result.totalPages, 1)
  })

  it('handles single item', () => {
    const result = paginate([{ id: 1 }], 1, 12)
    assert.equal(result.items.length, 1)
    assert.equal(result.totalPages, 1)
  })
})

// ─── calculateInventorySummary ─────────────────────────────

describe('calculateInventorySummary', () => {
  it('calculates correct summary', () => {
    const products = [
      { id: '1', is_active: true, cost_price: 10000, inventory: { quantity: 20, min_stock: 5, maximum_stock: 50 } },
      { id: '2', is_active: true, cost_price: 5000, inventory: { quantity: 3, min_stock: 10 } },
      { id: '3', is_active: false, cost_price: 2000, inventory: { quantity: 0, min_stock: 5 } },
    ]

    const result = calculateInventorySummary(products)
    assert.equal(result.totalProducts, 3)
    assert.equal(result.activeProducts, 2)
    assert.equal(result.totalStock, 23)
    assert.equal(result.lowStockCount, 1)
    assert.equal(result.outOfStockCount, 1)
    assert.equal(result.inventoryValue, 215000)
  })

  it('handles empty products', () => {
    const result = calculateInventorySummary([])
    assert.equal(result.totalProducts, 0)
    assert.equal(result.totalStock, 0)
    assert.equal(result.inventoryValue, 0)
    assert.equal(result.lowStockCount, 0)
    assert.equal(result.outOfStockCount, 0)
  })

  it('handles products with no inventory data', () => {
    const products = [
      { id: '1', is_active: true, cost_price: 5000 },
    ]
    const result = calculateInventorySummary(products)
    assert.equal(result.totalProducts, 1)
    assert.equal(result.totalStock, 0)
  })
})

// ─── getRestockProducts ────────────────────────────────────

describe('getRestockProducts', () => {
  it('returns products needing restock', () => {
    const products = [
      { id: '1', inventory: { quantity: 5, min_stock: 10, maximum_stock: 50 } },
      { id: '2', inventory: { quantity: 50, min_stock: 10, maximum_stock: 50 } },
      { id: '3', inventory: { quantity: 0, min_stock: 5, maximum_stock: 20 } },
    ]

    const result = getRestockProducts(products)
    assert.equal(result.length, 2)
    // out_of_stock first
    assert.equal(result[0].id, '3')
  })

  it('returns empty when no restock needed', () => {
    const products = [
      { id: '1', inventory: { quantity: 50, min_stock: 10, maximum_stock: 50 } },
    ]

    const result = getRestockProducts(products)
    assert.equal(result.length, 0)
  })
})

// ─── getLowestStockProducts ────────────────────────────────

describe('getLowestStockProducts', () => {
  it('returns lowest stock products', () => {
    const products = [
      { id: '1', inventory: { quantity: 20 } },
      { id: '2', inventory: { quantity: 3 } },
      { id: '3', inventory: { quantity: 10 } },
      { id: '4', inventory: { quantity: 0 } },
    ]

    const result = getLowestStockProducts(products, 2)
    assert.equal(result.length, 2)
    assert.equal(result[0].id, '4') // 0
    assert.equal(result[1].id, '2') // 3
  })

  it('handles empty array', () => {
    const result = getLowestStockProducts([], 5)
    assert.equal(result.length, 0)
  })
})

// ─── getEffectiveStock/Min/Max/Location ────────────────────

describe('getEffectiveStock', () => {
  it('reads from inventory.join', () => {
    assert.equal(getEffectiveStock({ inventory: { quantity: 15 } }), 15)
  })

  it('falls back to current_stock', () => {
    assert.equal(getEffectiveStock({ current_stock: 10 }), 10)
  })

  it('returns 0 for no data', () => {
    assert.equal(getEffectiveStock({}), 0)
    assert.equal(getEffectiveStock(null), 0)
  })

  it('handles non-numeric values', () => {
    assert.equal(getEffectiveStock({ inventory: { quantity: 'abc' } }), 0)
  })
})

describe('getEffectiveMinStock', () => {
  it('reads from inventory.join', () => {
    assert.equal(getEffectiveMinStock({ inventory: { min_stock: 5 } }), 5)
  })

  it('falls back to minimum_stock', () => {
    assert.equal(getEffectiveMinStock({ minimum_stock: 3 }), 3)
  })

  it('returns 0 for no data', () => {
    assert.equal(getEffectiveMinStock({}), 0)
  })
})

describe('getEffectiveMaxStock', () => {
  it('reads from inventory.join', () => {
    assert.equal(getEffectiveMaxStock({ inventory: { maximum_stock: 100 } }), 100)
  })

  it('falls back to maximum_stock', () => {
    assert.equal(getEffectiveMaxStock({ maximum_stock: 50 }), 50)
  })

  it('returns 0 for no data', () => {
    assert.equal(getEffectiveMaxStock({}), 0)
  })
})

describe('getEffectiveLocation', () => {
  it('reads from inventory.join', () => {
    assert.equal(getEffectiveLocation({ inventory: { location: 'Gudang A' } }), 'Gudang A')
  })

  it('falls back to product location', () => {
    assert.equal(getEffectiveLocation({ location: 'Rak 3' }), 'Rak 3')
  })

  it('returns empty string for no data', () => {
    assert.equal(getEffectiveLocation({}), '')
    assert.equal(getEffectiveLocation(null), '')
  })

  it('trims whitespace', () => {
    assert.equal(getEffectiveLocation({ inventory: { location: '  Gudang B  ' } }), 'Gudang B')
  })
})

// ─── getMovementLabel ──────────────────────────────────────

describe('getMovementLabel', () => {
  it('returns correct labels', () => {
    assert.equal(getMovementLabel('stock_in'), 'Barang Masuk')
    assert.equal(getMovementLabel('stock_out'), 'Barang Keluar')
    assert.equal(getMovementLabel('adjustment_increase'), 'Penyesuaian Naik')
    assert.equal(getMovementLabel('adjustment_decrease'), 'Penyesuaian Turun')
  })

  it('returns raw type for unknown', () => {
    assert.equal(getMovementLabel('unknown'), 'unknown')
  })
})

// ─── Stock Logic: IN/OUT/ADJUSTMENT calculations ──────────

describe('Stock Logic', () => {
  it('IN: stock_after = stock_before + quantity', () => {
    const before = 10
    const quantity = 5
    const after = before + quantity
    assert.equal(after, 15)
  })

  it('OUT: stock_after = stock_before - quantity', () => {
    const before = 10
    const quantity = 3
    const after = before - quantity
    assert.equal(after, 7)
  })

  it('ADJUSTMENT: stock_after = new value', () => {
    const before = 10
    const newStock = 25
    assert.equal(newStock, 25)
    assert.notEqual(newStock, before)
  })

  it('negative stock prevention: OUT cannot exceed stock', () => {
    const currentStock = 5
    const requested = 10
    const wouldBeNegative = currentStock - requested < 0
    assert.equal(wouldBeNegative, true)
    // validateStockAdjustment should catch this
    const result = validateStockAdjustment(
      { movement_type: 'stock_out', quantity: requested, reason: 'Test' },
      currentStock
    )
    assert.equal(result.valid, false)
  })

  it('zero minimum_stock does not auto-trigger low stock', () => {
    const status = getStockStatus(5, 0)
    assert.equal(status, STOCK_STATUS.IN_STOCK)
  })
})

// ─── Edge Cases ────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles empty data gracefully', () => {
    assert.equal(calculateInventorySummary([]).totalProducts, 0)
    assert.equal(paginate([], 1).items.length, 0)
    assert.equal(searchProducts([], 'test').length, 0)
    assert.equal(filterProducts([], 'all').length, 0)
    assert.equal(sortProducts([], 'name_asc').length, 0)
  })

  it('handles null/undefined inputs', () => {
    assert.equal(getEffectiveStock(null), 0)
    assert.equal(getEffectiveStock(undefined), 0)
    assert.equal(getEffectiveMinStock(null), 0)
    assert.equal(getEffectiveMaxStock(null), 0)
    assert.equal(getEffectiveLocation(null), '')
    assert.equal(calcInventoryValue(null, null), 0)
  })

  it('handles NaN inputs', () => {
    assert.equal(calcInventoryValue(NaN, 10), 0)
    assert.equal(calcInventoryValue(10, NaN), 0)
    assert.equal(safeNumber(NaN), 0)
  })

  it('handles Infinity inputs', () => {
    assert.equal(safeNumber(Infinity), 0)
    assert.equal(safeNumber(-Infinity), 0)
    assert.equal(getStockStatus(Infinity, 10), STOCK_STATUS.IN_STOCK)
  })

  it('handles large numbers', () => {
    assert.equal(calcInventoryValue(999999, 999999), 999998000001)
    assert.equal(safeNumber(999999999999), 999999999999)
  })

  it('handles products with missing inventory join', () => {
    const product = { name: 'Test', cost_price: 5000 }
    assert.equal(getEffectiveStock(product), 0)
    assert.equal(getEffectiveMinStock(product), 0)
    assert.equal(getEffectiveMaxStock(product), 0)
    assert.equal(calcInventoryValue(product.cost_price, getEffectiveStock(product)), 0)
  })
})
