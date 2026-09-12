import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateSupplier,
  sanitizeSupplierInput,
  generateSupplierCode,
  searchSuppliers,
  filterSuppliers,
  sortSuppliers,
  paginate,
  calculateSupplierSummary,
  calculateRecommendedRestock,
  getRestockProducts,
  SUPPLIER_FILTERS,
  SUPPLIER_SORT_OPTIONS,
  PAGE_SIZE,
} from '../lib/supplierUtils.js'

// ─── validateSupplier ────────────────────────────────────────

describe('validateSupplier', () => {
  const mkSupplier = (overrides = {}) => ({
    name: 'PT Maju Jaya',
    supplier_code: '',
    contact_person: '',
    phone: '',
    email: '',
    ...overrides,
  })

  it('valid supplier with all fields', () => {
    const r = validateSupplier(mkSupplier({ phone: '08123456789', email: 'supplier@test.com' }))
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('valid supplier with only name', () => {
    const r = validateSupplier(mkSupplier())
    assert.equal(r.valid, true)
  })

  it('empty name rejected', () => {
    const r = validateSupplier(mkSupplier({ name: '' }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('whitespace-only name rejected', () => {
    const r = validateSupplier(mkSupplier({ name: '   ' }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('name too long rejected', () => {
    const r = validateSupplier(mkSupplier({ name: 'A'.repeat(201) }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('name at max length accepted', () => {
    const r = validateSupplier(mkSupplier({ name: 'A'.repeat(200) }))
    assert.equal(r.valid, true)
  })

  it('invalid email rejected', () => {
    const r = validateSupplier(mkSupplier({ email: 'not-an-email' }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.email)
  })

  it('empty email accepted', () => {
    const r = validateSupplier(mkSupplier({ email: '' }))
    assert.equal(r.valid, true)
  })

  it('valid email accepted', () => {
    const r = validateSupplier(mkSupplier({ email: 'test@example.com' }))
    assert.equal(r.valid, true)
  })

  it('invalid phone rejected', () => {
    const r = validateSupplier(mkSupplier({ phone: 'abc' }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.phone)
  })

  it('short phone rejected', () => {
    const r = validateSupplier(mkSupplier({ phone: '12345' }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.phone)
  })

  it('valid phone accepted', () => {
    const r = validateSupplier(mkSupplier({ phone: '08123456789' }))
    assert.equal(r.valid, true)
  })

  it('phone with special chars accepted', () => {
    const r = validateSupplier(mkSupplier({ phone: '+62 812-3456-7890' }))
    assert.equal(r.valid, true)
  })

  it('duplicate supplier_code rejected', () => {
    const existing = [{ id: '1', supplier_code: 'PTMAJU' }]
    const r = validateSupplier(mkSupplier({ supplier_code: 'PTMAJU' }), existing, null)
    assert.equal(r.valid, false)
    assert.ok(r.errors.supplier_code)
  })

  it('duplicate supplier_code case-insensitive', () => {
    const existing = [{ id: '1', supplier_code: 'ptmaju' }]
    const r = validateSupplier(mkSupplier({ supplier_code: 'PTMAJU' }), existing, null)
    assert.equal(r.valid, false)
    assert.ok(r.errors.supplier_code)
  })

  it('same supplier_code allowed when editing same supplier', () => {
    const existing = [{ id: '1', supplier_code: 'PTMAJU' }]
    const r = validateSupplier(mkSupplier({ supplier_code: 'PTMAJU' }), existing, '1')
    assert.equal(r.valid, true)
  })

  it('empty supplier_code not checked for uniqueness', () => {
    const existing = [{ id: '1', supplier_code: '' }]
    const r = validateSupplier(mkSupplier({ supplier_code: '' }), existing, null)
    assert.equal(r.valid, true)
  })

  it('contact_person too long rejected', () => {
    const r = validateSupplier(mkSupplier({ contact_person: 'A'.repeat(201) }))
    assert.equal(r.valid, false)
    assert.ok(r.errors.contact_person)
  })
})

// ─── sanitizeSupplierInput ───────────────────────────────────

describe('sanitizeSupplierInput', () => {
  it('trims whitespace from all fields', () => {
    const r = sanitizeSupplierInput({
      name: '  PT Maju  ',
      supplier_code: '  PTMAJU  ',
      contact_person: '  Budi  ',
      phone: '  08123456789  ',
      email: '  test@test.com  ',
      address: '  Jakarta  ',
      notes: '  catatan  ',
    })
    assert.equal(r.name, 'PT Maju')
    assert.equal(r.supplier_code, 'PTMAJU')
    assert.equal(r.contact_person, 'Budi')
    assert.equal(r.phone, '08123456789')
    assert.equal(r.email, 'test@test.com')
    assert.equal(r.address, 'Jakarta')
    assert.equal(r.notes, 'catatan')
  })

  it('handles null/undefined fields safely', () => {
    const r = sanitizeSupplierInput({})
    assert.equal(r.name, '')
    assert.equal(r.supplier_code, '')
    assert.equal(r.contact_person, '')
    assert.equal(r.phone, '')
    assert.equal(r.email, '')
    assert.equal(r.address, '')
    assert.equal(r.notes, '')
  })

  it('defaults is_active to true', () => {
    const r = sanitizeSupplierInput({ name: 'Test', is_active: undefined })
    assert.equal(r.is_active, true)
  })

  it('preserves is_active false', () => {
    const r = sanitizeSupplierInput({ name: 'Test', is_active: false })
    assert.equal(r.is_active, false)
  })
})

// ─── generateSupplierCode ────────────────────────────────────

describe('generateSupplierCode', () => {
  it('generates code from name', () => {
    assert.equal(generateSupplierCode('PT Maju Jaya'), 'PTMAJUJAYA')
  })

  it('removes special characters', () => {
    assert.equal(generateSupplierCode('PT. Maju-Jaya!'), 'PTMAJUJAYA')
  })

  it('truncates to 20 chars', () => {
    const code = generateSupplierCode('A Very Long Supplier Name Here')
    assert.ok(code.length <= 20)
  })

  it('handles empty name', () => {
    assert.equal(generateSupplierCode(''), '')
  })

  it('handles null name', () => {
    assert.equal(generateSupplierCode(null), '')
  })

  it('handles numbers', () => {
    assert.equal(generateSupplierCode('Supplier 123'), 'SUPPLIER123')
  })
})

// ─── searchSuppliers ─────────────────────────────────────────

describe('searchSuppliers', () => {
  const suppliers = [
    { id: '1', name: 'PT Maju Jaya', supplier_code: 'PTMAJU', contact_person: 'Budi', phone: '08123456789', email: 'budi@majujaya.com' },
    { id: '2', name: 'CV Sejahtera', supplier_code: 'CVSEJAHTERA', contact_person: 'Andi', phone: '08567890123', email: 'andi@sejahtera.com' },
    { id: '3', name: 'Toko Berkah', supplier_code: '', contact_person: 'Sari', phone: '08111222333', email: '' },
  ]

  it('returns all for empty query', () => {
    assert.equal(searchSuppliers(suppliers, '').length, 3)
    assert.equal(searchSuppliers(suppliers, null).length, 3)
  })

  it('searches by name', () => {
    const r = searchSuppliers(suppliers, 'Maju')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '1')
  })

  it('searches by code', () => {
    const r = searchSuppliers(suppliers, 'CVSEJAHTERA')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '2')
  })

  it('searches by contact person', () => {
    const r = searchSuppliers(suppliers, 'Sari')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '3')
  })

  it('searches by phone', () => {
    const r = searchSuppliers(suppliers, '085678')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '2')
  })

  it('searches by email', () => {
    const r = searchSuppliers(suppliers, 'majujaya')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '1')
  })

  it('case-insensitive search', () => {
    const r = searchSuppliers(suppliers, 'MAJU')
    assert.equal(r.length, 1)
  })

  it('returns empty for no match', () => {
    const r = searchSuppliers(suppliers, 'xyznotfound')
    assert.equal(r.length, 0)
  })
})

// ─── filterSuppliers ─────────────────────────────────────────

describe('filterSuppliers', () => {
  const suppliers = [
    { id: '1', is_active: true },
    { id: '2', is_active: false },
    { id: '3', is_active: true },
    { id: '4', is_active: undefined }, // defaults to active
  ]

  it('all filter returns all', () => {
    assert.equal(filterSuppliers(suppliers, 'all').length, 4)
    assert.equal(filterSuppliers(suppliers, null).length, 4)
  })

  it('active filter returns active suppliers', () => {
    const r = filterSuppliers(suppliers, 'active')
    assert.equal(r.length, 3) // 1, 3, 4 (undefined treated as active)
  })

  it('inactive filter returns inactive suppliers', () => {
    const r = filterSuppliers(suppliers, 'inactive')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '2')
  })
})

// ─── sortSuppliers ───────────────────────────────────────────

describe('sortSuppliers', () => {
  const suppliers = [
    { id: '1', name: 'Charlie', created_at: '2024-01-01', _productCount: 5 },
    { id: '2', name: 'Alpha', created_at: '2024-06-01', _productCount: 10 },
    { id: '3', name: 'Bravo', created_at: '2024-03-01', _productCount: 3 },
  ]

  it('name_asc sorts A-Z', () => {
    const r = sortSuppliers(suppliers, 'name_asc')
    assert.equal(r[0].name, 'Alpha')
    assert.equal(r[2].name, 'Charlie')
  })

  it('name_desc sorts Z-A', () => {
    const r = sortSuppliers(suppliers, 'name_desc')
    assert.equal(r[0].name, 'Charlie')
    assert.equal(r[2].name, 'Alpha')
  })

  it('newest sorts by created_at desc', () => {
    const r = sortSuppliers(suppliers, 'newest')
    assert.equal(r[0].name, 'Alpha')
  })

  it('oldest sorts by created_at asc', () => {
    const r = sortSuppliers(suppliers, 'oldest')
    assert.equal(r[0].name, 'Charlie')
  })

  it('products_desc sorts by product count', () => {
    const r = sortSuppliers(suppliers, 'products_desc')
    assert.equal(r[0].name, 'Alpha') // 10 products
    assert.equal(r[2].name, 'Bravo') // 3 products
  })

  it('unknown sort returns original order', () => {
    const r = sortSuppliers(suppliers, 'unknown')
    assert.equal(r[0].name, 'Charlie')
  })
})

// ─── paginate ────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i }))

  it('returns first page', () => {
    const r = paginate(items, 1, 10)
    assert.equal(r.items.length, 10)
    assert.equal(r.currentPage, 1)
    assert.equal(r.totalPages, 3)
    assert.equal(r.total, 25)
  })

  it('returns last page with fewer items', () => {
    const r = paginate(items, 3, 10)
    assert.equal(r.items.length, 5)
    assert.equal(r.currentPage, 3)
  })

  it('handles empty array', () => {
    const r = paginate([], 1, 10)
    assert.equal(r.items.length, 0)
    assert.equal(r.totalPages, 1)
    assert.equal(r.currentPage, 1)
    assert.equal(r.total, 0)
  })

  it('handles page out of range', () => {
    const r = paginate(items, 99, 10)
    assert.equal(r.currentPage, 3) // clamped to last page
  })

  it('handles page 0', () => {
    const r = paginate(items, 0, 10)
    assert.equal(r.currentPage, 1) // clamped to 1
  })
})

// ─── calculateSupplierSummary ─────────────────────────────────

describe('calculateSupplierSummary', () => {
  it('calculates summary correctly', () => {
    const suppliers = [
      { id: '1', is_active: true, _productCount: 5, updated_at: '2024-06-01' },
      { id: '2', is_active: false, _productCount: 10, updated_at: '2024-01-01' },
      { id: '3', is_active: true, _productCount: 3, updated_at: '2024-03-01' },
    ]
    const r = calculateSupplierSummary(suppliers)
    assert.equal(r.total, 3)
    assert.equal(r.active, 2)
    assert.equal(r.inactive, 1)
    assert.equal(r.topSupplier.id, '2') // 10 products
    assert.equal(r.topSupplierProductCount, 10)
  })

  it('handles empty suppliers', () => {
    const r = calculateSupplierSummary([])
    assert.equal(r.total, 0)
    assert.equal(r.active, 0)
    assert.equal(r.inactive, 0)
    assert.equal(r.topSupplier, null)
    assert.equal(r.lastUsed, null)
  })

  it('identifies last used supplier', () => {
    const suppliers = [
      { id: '1', is_active: true, _productCount: 0, updated_at: '2024-01-01' },
      { id: '2', is_active: true, _productCount: 0, updated_at: '2024-06-01' },
    ]
    const r = calculateSupplierSummary(suppliers)
    assert.equal(r.lastUsed.id, '2')
  })
})

// ─── calculateRecommendedRestock ──────────────────────────────

describe('calculateRecommendedRestock', () => {
  it('calculates restock quantity', () => {
    assert.equal(calculateRecommendedRestock(5, 20), 15)
  })

  it('returns 0 when stock equals max', () => {
    assert.equal(calculateRecommendedRestock(20, 20), 0)
  })

  it('returns 0 when stock exceeds max', () => {
    assert.equal(calculateRecommendedRestock(25, 20), 0)
  })

  it('returns null when max is 0', () => {
    assert.equal(calculateRecommendedRestock(5, 0), null)
  })

  it('returns null when max is not set', () => {
    assert.equal(calculateRecommendedRestock(5, null), null)
  })

  it('handles NaN/Infinity safely', () => {
    assert.equal(calculateRecommendedRestock(NaN, 20), 20)
    assert.equal(calculateRecommendedRestock(Infinity, 20), 0)
    assert.equal(calculateRecommendedRestock(5, NaN), null)
  })

  it('handles negative values safely', () => {
    assert.equal(calculateRecommendedRestock(-5, 20), 25)
  })
})

// ─── getRestockProducts ──────────────────────────────────────

describe('getRestockProducts', () => {
  it('identifies out of stock products', () => {
    const products = [
      { id: '1', name: 'A', inventory: { quantity: 0, min_stock: 5, maximum_stock: 20 } },
      { id: '2', name: 'B', inventory: { quantity: 10, min_stock: 5, maximum_stock: 20 } },
    ]
    const r = getRestockProducts(products)
    assert.equal(r.length, 2) // A is out_of_stock, B has stock < max
    assert.equal(r[0].name, 'A') // out_of_stock first
  })

  it('identifies low stock products', () => {
    const products = [
      { id: '1', name: 'A', inventory: { quantity: 2, min_stock: 5, maximum_stock: 20 } },
    ]
    const r = getRestockProducts(products)
    assert.equal(r.length, 1)
    assert.equal(r[0]._stockStatus, 'low_stock')
    assert.equal(r[0]._recommendedRestock, 18)
  })

  it('excludes fully stocked products', () => {
    const products = [
      { id: '1', name: 'A', inventory: { quantity: 20, min_stock: 5, maximum_stock: 20 } },
    ]
    const r = getRestockProducts(products)
    assert.equal(r.length, 0)
  })

  it('handles null/empty products', () => {
    assert.deepEqual(getRestockProducts(null), [])
    assert.deepEqual(getRestockProducts([]), [])
    assert.deepEqual(getRestockProducts(undefined), [])
  })

  it('handles products without inventory', () => {
    const products = [
      { id: '1', name: 'A', inventory: null },
      { id: '2', name: 'B' },
    ]
    const r = getRestockProducts(products)
    // Both have 0 stock, which is <= 0, so out_of_stock
    assert.equal(r.length, 2)
  })

  it('sorts by urgency (out_of_stock first)', () => {
    const products = [
      { id: '1', name: 'Low', inventory: { quantity: 3, min_stock: 5, maximum_stock: 20 } },
      { id: '2', name: 'Out', inventory: { quantity: 0, min_stock: 5, maximum_stock: 20 } },
      { id: '3', name: 'Full', inventory: { quantity: 20, min_stock: 5, maximum_stock: 20 } },
    ]
    const r = getRestockProducts(products)
    assert.equal(r[0].name, 'Out') // out_of_stock first
    assert.equal(r[1].name, 'Low') // low_stock second
    assert.equal(r.length, 2) // Full excluded (stock == max)
  })

  it('handles products with no maximum_stock', () => {
    const products = [
      { id: '1', name: 'A', inventory: { quantity: 5, min_stock: 3, maximum_stock: 0 } },
    ]
    const r = getRestockProducts(products)
    // Stock > min_stock and no max, so no restock needed
    assert.equal(r.length, 0)
  })

  it('safe with NaN values', () => {
    const products = [
      { id: '1', name: 'A', inventory: { quantity: NaN, min_stock: NaN, maximum_stock: NaN } },
    ]
    const r = getRestockProducts(products)
    // NaN treated as 0, so out_of_stock
    assert.equal(r.length, 1)
  })
})

// ─── Constants ───────────────────────────────────────────────

describe('constants', () => {
  it('SUPPLIER_FILTERS has correct structure', () => {
    assert.ok(Array.isArray(SUPPLIER_FILTERS))
    assert.equal(SUPPLIER_FILTERS.length, 3)
    assert.ok(SUPPLIER_FILTERS.find((f) => f.value === 'all'))
    assert.ok(SUPPLIER_FILTERS.find((f) => f.value === 'active'))
    assert.ok(SUPPLIER_FILTERS.find((f) => f.value === 'inactive'))
  })

  it('SUPPLIER_SORT_OPTIONS has correct structure', () => {
    assert.ok(Array.isArray(SUPPLIER_SORT_OPTIONS))
    assert.ok(SUPPLIER_SORT_OPTIONS.length >= 5)
    SUPPLIER_SORT_OPTIONS.forEach((opt) => {
      assert.ok(opt.value)
      assert.ok(opt.label)
    })
  })

  it('PAGE_SIZE is reasonable', () => {
    assert.ok(PAGE_SIZE > 0 && PAGE_SIZE <= 50)
  })
})
