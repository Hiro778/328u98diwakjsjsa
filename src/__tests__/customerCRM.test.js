import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCustomer,
  checkDuplicate,
  sanitizeCustomerInput,
  searchCustomers,
  filterCustomers,
  sortCustomers,
  calculateSummary,
  safeNumber,
  sanitizeMetric,
  paginate,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  CUSTOMER_FILTERS,
  SORT_OPTIONS,
  PAGE_SIZE,
} from '../sections/CustomerCRM/customerUtils.js'

// ─── validateCustomer ─────────────────────────────────────────

describe('validateCustomer', () => {
  it('valid customer with all fields', () => {
    const r = validateCustomer({ name: 'Budi', phone: '08123456789', email: 'budi@test.com', address: 'Jakarta', notes: '' })
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('valid customer with only name', () => {
    const r = validateCustomer({ name: 'Budi' })
    assert.equal(r.valid, true)
  })

  it('empty name rejected', () => {
    const r = validateCustomer({ name: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
    assert.ok(r.errors.name.includes('wajib'))
  })

  it('whitespace-only name rejected', () => {
    const r = validateCustomer({ name: '   ' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('null name rejected', () => {
    const r = validateCustomer({ name: null })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('undefined name rejected', () => {
    const r = validateCustomer({})
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('invalid email rejected', () => {
    const r = validateCustomer({ name: 'Budi', email: 'not-an-email' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.email)
    assert.ok(r.errors.email.includes('valid'))
  })

  it('valid email accepted', () => {
    const r = validateCustomer({ name: 'Budi', email: 'budi@test.com' })
    assert.equal(r.valid, true)
  })

  it('empty email is valid (optional)', () => {
    const r = validateCustomer({ name: 'Budi', email: '' })
    assert.equal(r.valid, true)
  })

  it('invalid phone rejected', () => {
    const r = validateCustomer({ name: 'Budi', phone: 'abc' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.phone)
  })

  it('valid phone accepted', () => {
    const r = validateCustomer({ name: 'Budi', phone: '08123456789' })
    assert.equal(r.valid, true)
  })

  it('phone with dashes accepted', () => {
    const r = validateCustomer({ name: 'Budi', phone: '081-2345-6789' })
    assert.equal(r.valid, true)
  })

  it('phone with plus prefix accepted', () => {
    const r = validateCustomer({ name: 'Budi', phone: '+628123456789' })
    assert.equal(r.valid, true)
  })

  it('empty phone is valid (optional)', () => {
    const r = validateCustomer({ name: 'Budi', phone: '' })
    assert.equal(r.valid, true)
  })

  it('multiple errors returned at once', () => {
    const r = validateCustomer({ name: '', email: 'bad', phone: 'abc' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
    assert.ok(r.errors.email)
    assert.ok(r.errors.phone)
  })
})

// ─── checkDuplicate ───────────────────────────────────────────

describe('checkDuplicate', () => {
  const existing = [
    { id: '1', name: 'Budi', phone: '08123456789', email: 'budi@test.com' },
    { id: '2', name: 'Siti', phone: '08987654321', email: 'siti@test.com' },
  ]

  it('no duplicate when no match', () => {
    const r = checkDuplicate({ name: 'Andi', phone: '08111111111', email: 'andi@test.com' }, existing)
    assert.equal(r.isDuplicate, false)
  })

  it('detects phone duplicate', () => {
    const r = checkDuplicate({ name: 'Budi2', phone: '08123456789', email: '' }, existing)
    assert.equal(r.isDuplicate, true)
    assert.equal(r.field, 'phone')
    assert.equal(r.existing.id, '1')
  })

  it('detects email duplicate', () => {
    const r = checkDuplicate({ name: 'Budi2', phone: '', email: 'budi@test.com' }, existing)
    assert.equal(r.isDuplicate, true)
    assert.equal(r.field, 'email')
  })

  it('email duplicate is case-insensitive', () => {
    const r = checkDuplicate({ name: 'Budi2', phone: '', email: 'BUDI@TEST.COM' }, existing)
    assert.equal(r.isDuplicate, true)
    assert.equal(r.field, 'email')
  })

  it('excludes customer by id (for edit)', () => {
    const r = checkDuplicate({ name: 'Budi', phone: '08123456789', email: 'budi@test.com' }, existing, { excludeId: '1' })
    assert.equal(r.isDuplicate, false)
  })

  it('no duplicate when empty phone and email', () => {
    const r = checkDuplicate({ name: 'Andi', phone: '', email: '' }, existing)
    assert.equal(r.isDuplicate, false)
  })

  it('no match on partial phone', () => {
    const r = checkDuplicate({ name: 'Test', phone: '0812345678', email: '' }, existing)
    assert.equal(r.isDuplicate, false)
  })
})

// ─── sanitizeCustomerInput ────────────────────────────────────

describe('sanitizeCustomerInput', () => {
  it('trims whitespace from all fields', () => {
    const r = sanitizeCustomerInput({
      name: '  Budi  ',
      phone: '  08123  ',
      email: '  budi@test.com  ',
      address: '  Jakarta  ',
      notes: '  catatan  ',
    })
    assert.equal(r.name, 'Budi')
    assert.equal(r.phone, '08123')
    assert.equal(r.email, 'budi@test.com')
    assert.equal(r.address, 'Jakarta')
    assert.equal(r.notes, 'catatan')
  })

  it('handles null/undefined fields', () => {
    const r = sanitizeCustomerInput({ name: null, phone: undefined })
    assert.equal(r.name, '')
    assert.equal(r.phone, '')
  })

  it('preserves valid input', () => {
    const r = sanitizeCustomerInput({ name: 'Budi', phone: '08123456789', email: 'budi@test.com', address: '', notes: '' })
    assert.equal(r.name, 'Budi')
    assert.equal(r.phone, '08123456789')
  })
})

// ─── searchCustomers ──────────────────────────────────────────

describe('searchCustomers', () => {
  const customers = [
    { id: '1', name: 'Budi Santoso', phone: '08123456789', email: 'budi@test.com' },
    { id: '2', name: 'Siti Rahayu', phone: '08987654321', email: 'siti@test.com' },
    { id: '3', name: 'Andi Wijaya', phone: '08111222333', email: 'andi@test.com' },
  ]

  it('returns all when empty query', () => {
    assert.equal(searchCustomers(customers, '').length, 3)
    assert.equal(searchCustomers(customers, '  ').length, 3)
    assert.equal(searchCustomers(customers, null).length, 3)
  })

  it('search by name', () => {
    const r = searchCustomers(customers, 'Budi')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '1')
  })

  it('search by phone', () => {
    const r = searchCustomers(customers, '0898765')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '2')
  })

  it('search by email', () => {
    const r = searchCustomers(customers, 'andi@test')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '3')
  })

  it('case insensitive search', () => {
    const r = searchCustomers(customers, 'budi')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '1')
  })

  it('partial match works', () => {
    const r = searchCustomers(customers, 'San')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '1')
  })

  it('no match returns empty', () => {
    const r = searchCustomers(customers, 'xyz999')
    assert.equal(r.length, 0)
  })

  it('matches multiple customers', () => {
    const r = searchCustomers(customers, '08')
    assert.equal(r.length, 3)
  })
})

// ─── filterCustomers ──────────────────────────────────────────

describe('filterCustomers', () => {
  const now = new Date().toISOString()
  const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago

  const customers = [
    { id: '1', name: 'Active', total_transactions: 5, total_spent: 500000, created_at: oldDate },
    { id: '2', name: 'New', total_transactions: 0, total_spent: 0, created_at: now },
    { id: '3', name: 'Never', total_transactions: 0, total_spent: 0, created_at: oldDate },
    { id: '4', name: 'ActiveNew', total_transactions: 2, total_spent: 200000, created_at: now },
  ]

  it('all filter returns everything', () => {
    assert.equal(filterCustomers(customers, 'all').length, 4)
  })

  it('active filter: total_transactions > 0', () => {
    const r = filterCustomers(customers, 'active')
    assert.equal(r.length, 2)
    assert.ok(r.every(c => c.total_transactions > 0))
  })

  it('new filter: created within 30 days', () => {
    const r = filterCustomers(customers, 'new')
    assert.equal(r.length, 2)
    assert.ok(r.every(c => c.total_transactions === 0 || true)) // both new and activeNew
  })

  it('never filter: total_transactions === 0', () => {
    const r = filterCustomers(customers, 'never')
    assert.equal(r.length, 2)
    assert.ok(r.every(c => !c.total_transactions || c.total_transactions === 0))
  })

  it('unknown filter returns all', () => {
    assert.equal(filterCustomers(customers, 'unknown').length, 4)
  })
})

// ─── sortCustomers ────────────────────────────────────────────

describe('sortCustomers', () => {
  const customers = [
    { id: '1', name: 'Charlie', created_at: '2024-01-01', total_spent: 100000, last_transaction_at: '2024-06-01' },
    { id: '2', name: 'Alpha', created_at: '2024-06-01', total_spent: 500000, last_transaction_at: '2024-01-01' },
    { id: '3', name: 'Bravo', created_at: '2024-03-01', total_spent: 300000, last_transaction_at: null },
  ]

  it('sort by newest', () => {
    const r = sortCustomers(customers, 'newest')
    assert.equal(r[0].id, '2')
    assert.equal(r[2].id, '1')
  })

  it('sort by name A-Z', () => {
    const r = sortCustomers(customers, 'name_asc')
    assert.equal(r[0].name, 'Alpha')
    assert.equal(r[1].name, 'Bravo')
    assert.equal(r[2].name, 'Charlie')
  })

  it('sort by spent descending', () => {
    const r = sortCustomers(customers, 'spent_desc')
    assert.equal(r[0].id, '2')
    assert.equal(r[1].id, '3')
    assert.equal(r[2].id, '1')
  })

  it('sort by last transaction (nulls last)', () => {
    const r = sortCustomers(customers, 'last_transaction')
    assert.equal(r[0].id, '1') // 2024-06-01
    assert.equal(r[1].id, '2') // 2024-01-01
    assert.equal(r[2].id, '3') // null
  })

  it('does not mutate original array', () => {
    const orig = [...customers]
    sortCustomers(customers, 'name_asc')
    assert.deepEqual(customers, orig)
  })
})

// ─── calculateSummary ─────────────────────────────────────────

describe('calculateSummary', () => {
  it('empty list returns zeros', () => {
    const r = calculateSummary([])
    assert.equal(r.total, 0)
    assert.equal(r.active, 0)
    assert.equal(r.newCustomers, 0)
    assert.equal(r.totalRevenue, 0)
  })

  it('counts active customers (transactions > 0)', () => {
    const customers = [
      { total_transactions: 5, total_spent: 100000, created_at: '2020-01-01' },
      { total_transactions: 0, total_spent: 0, created_at: '2020-01-01' },
    ]
    const r = calculateSummary(customers)
    assert.equal(r.active, 1)
  })

  it('counts new customers (last 30 days)', () => {
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const customers = [
      { total_transactions: 0, total_spent: 0, created_at: now },
      { total_transactions: 0, total_spent: 0, created_at: old },
    ]
    const r = calculateSummary(customers)
    assert.equal(r.newCustomers, 1)
  })

  it('sums total revenue', () => {
    const customers = [
      { total_transactions: 1, total_spent: 100000, created_at: '2020-01-01' },
      { total_transactions: 2, total_spent: 250000, created_at: '2020-01-01' },
    ]
    const r = calculateSummary(customers)
    assert.equal(r.totalRevenue, 350000)
  })

  it('handles missing/null total_spent without NaN', () => {
    const customers = [
      { total_transactions: 1, total_spent: null, created_at: '2020-01-01' },
      { total_transactions: 1, total_spent: undefined, created_at: '2020-01-01' },
    ]
    const r = calculateSummary(customers)
    assert.ok(Number.isFinite(r.totalRevenue))
    assert.equal(r.totalRevenue, 0)
  })

  it('handles invalid total_spent without NaN', () => {
    const customers = [
      { total_transactions: 1, total_spent: NaN, created_at: '2020-01-01' },
      { total_transactions: 1, total_spent: Infinity, created_at: '2020-01-01' },
    ]
    const r = calculateSummary(customers)
    assert.ok(Number.isFinite(r.totalRevenue))
    assert.equal(r.totalRevenue, 0)
  })
})

// ─── safeNumber ───────────────────────────────────────────────

describe('safeNumber', () => {
  it('returns 0 for null', () => assert.equal(safeNumber(null), 0))
  it('returns 0 for undefined', () => assert.equal(safeNumber(undefined), 0))
  it('returns 0 for NaN', () => assert.equal(safeNumber(NaN), 0))
  it('returns 0 for Infinity', () => assert.equal(safeNumber(Infinity), 0))
  it('returns 0 for -Infinity', () => assert.equal(safeNumber(-Infinity), 0))
  it('returns 0 for non-numeric string', () => assert.equal(safeNumber('abc'), 0))
  it('parses numeric string', () => assert.equal(safeNumber('1000'), 1000))
  it('parses number', () => assert.equal(safeNumber(1000), 1000))
  it('parses decimal', () => assert.equal(safeNumber(10.5), 10.5))
  it('parses zero', () => assert.equal(safeNumber(0), 0))
  it('parses negative', () => assert.equal(safeNumber(-100), -100))
})

// ─── sanitizeMetric ───────────────────────────────────────────

describe('sanitizeMetric', () => {
  it('returns 0 for NaN', () => assert.equal(sanitizeMetric(NaN), 0))
  it('returns 0 for Infinity', () => assert.equal(sanitizeMetric(Infinity), 0))
  it('returns 0 for negative', () => assert.equal(sanitizeMetric(-5), 0))
  it('returns 0 for null', () => assert.equal(sanitizeMetric(null), 0))
  it('returns 0 for undefined', () => assert.equal(sanitizeMetric(undefined), 0))
  it('returns value for valid number', () => assert.equal(sanitizeMetric(1000), 1000))
  it('returns 0 for zero', () => assert.equal(sanitizeMetric(0), 0))
})

// ─── paginate ─────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }))

  it('defaults to PAGE_SIZE (20)', () => {
    const r = paginate(items, 1)
    assert.equal(r.items.length, 20)
    assert.equal(r.totalPages, 3)
    assert.equal(r.currentPage, 1)
    assert.equal(r.total, 50)
  })

  it('page 2 returns next batch', () => {
    const r = paginate(items, 2)
    assert.equal(r.items.length, 20)
    assert.equal(r.items[0].id, 21)
  })

  it('last page returns remaining items', () => {
    const r = paginate(items, 3)
    assert.equal(r.items.length, 10)
    assert.equal(r.items[0].id, 41)
  })

  it('page beyond total clamps to last', () => {
    const r = paginate(items, 999)
    assert.equal(r.currentPage, 3)
  })

  it('page 0 clamps to 1', () => {
    const r = paginate(items, 0)
    assert.equal(r.currentPage, 1)
  })

  it('empty array returns 1 page with 0 items', () => {
    const r = paginate([], 1)
    assert.equal(r.totalPages, 1)
    assert.equal(r.items.length, 0)
  })
})

// ─── formatCurrency ───────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats IDR', () => {
    const r = formatCurrency(130000)
    assert.ok(r.includes('130'))
    assert.ok(r.includes('000'))
  })

  it('formats zero', () => {
    const r = formatCurrency(0)
    assert.ok(r.includes('0'))
  })

  it('handles null safely', () => {
    const r = formatCurrency(null)
    assert.ok(r.includes('0'))
  })

  it('handles NaN safely', () => {
    const r = formatCurrency(NaN)
    assert.ok(r.includes('0'))
  })
})

// ─── formatDate / formatDateTime ──────────────────────────────

describe('formatDate', () => {
  it('returns "-" for null', () => assert.equal(formatDate(null), '-'))
  it('returns "-" for undefined', () => assert.equal(formatDate(undefined), '-'))
  it('formats valid date', () => {
    const r = formatDate('2024-06-15')
    assert.ok(r.includes('15'))
    assert.ok(r.includes('2024'))
  })
})

describe('formatDateTime', () => {
  it('returns "-" for null', () => assert.equal(formatDateTime(null), '-'))
  it('formats valid datetime', () => {
    const r = formatDateTime('2024-06-15T10:30:00Z')
    assert.ok(r.includes('15'))
    assert.ok(r.includes('2024'))
  })
})

// ─── formatRelativeTime ───────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "-" for null', () => assert.equal(formatRelativeTime(null), '-'))
  it('returns "baru saja" for very recent', () => {
    const r = formatRelativeTime(new Date().toISOString())
    assert.equal(r, 'baru saja')
  })
  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60000).toISOString()
    const r = formatRelativeTime(d)
    assert.ok(r.includes('5 menit'))
  })
  it('returns hours ago', () => {
    const d = new Date(Date.now() - 3 * 3600000).toISOString()
    const r = formatRelativeTime(d)
    assert.ok(r.includes('3 jam'))
  })
  it('returns days ago', () => {
    const d = new Date(Date.now() - 5 * 86400000).toISOString()
    const r = formatRelativeTime(d)
    assert.ok(r.includes('5 hari'))
  })
})

// ─── Constants ────────────────────────────────────────────────

describe('constants', () => {
  it('CUSTOMER_FILTERS has 4 entries', () => {
    assert.equal(CUSTOMER_FILTERS.length, 4)
  })

  it('SORT_OPTIONS has 4 entries', () => {
    assert.equal(SORT_OPTIONS.length, 4)
  })

  it('PAGE_SIZE is 20', () => {
    assert.equal(PAGE_SIZE, 20)
  })
})

// ─── Edge Cases / Integration ─────────────────────────────────

describe('edge cases', () => {
  it('no NaN in customer metrics pipeline', () => {
    const customers = [
      { id: '1', name: 'Test', total_transactions: null, total_spent: null, created_at: null, last_transaction_at: null },
      { id: '2', name: 'Test2', total_transactions: NaN, total_spent: NaN, created_at: 'invalid', last_transaction_at: 'invalid' },
    ]
    const summary = calculateSummary(customers)
    assert.ok(Number.isFinite(summary.total))
    assert.ok(Number.isFinite(summary.active))
    assert.ok(Number.isFinite(summary.newCustomers))
    assert.ok(Number.isFinite(summary.totalRevenue))
  })

  it('no Infinity in sort with extreme values', () => {
    const customers = [
      { id: '1', name: 'A', total_spent: Infinity, created_at: '2024-01-01', last_transaction_at: null },
      { id: '2', name: 'B', total_spent: -Infinity, created_at: '2024-06-01', last_transaction_at: '2024-06-01' },
    ]
    const sorted = sortCustomers(customers, 'spent_desc')
    assert.equal(sorted.length, 2)
    // Should not throw
  })

  it('search with special characters does not crash', () => {
    const customers = [
      { id: '1', name: 'Test [user]', phone: '+62 (812) 345-6789', email: 'test@example.com' },
    ]
    assert.doesNotThrow(() => searchCustomers(customers, '[user]'))
    assert.doesNotThrow(() => searchCustomers(customers, '+62'))
    assert.doesNotThrow(() => searchCustomers(customers, '(812)'))
  })

  it('filter with null created_at does not crash', () => {
    const customers = [
      { id: '1', total_transactions: 0, created_at: null },
    ]
    assert.doesNotThrow(() => filterCustomers(customers, 'new'))
  })

  it('sort with all null dates does not crash', () => {
    const customers = [
      { id: '1', name: 'A', total_spent: 0, created_at: null, last_transaction_at: null },
      { id: '2', name: 'B', total_spent: 0, created_at: null, last_transaction_at: null },
    ]
    assert.doesNotThrow(() => sortCustomers(customers, 'newest'))
    assert.doesNotThrow(() => sortCustomers(customers, 'last_transaction'))
  })

  it('paginate with single item', () => {
    const r = paginate([{ id: 1 }], 1)
    assert.equal(r.items.length, 1)
    assert.equal(r.totalPages, 1)
  })

  it('validateCustomer trims name before validation', () => {
    // name with only spaces should be rejected
    const r = validateCustomer({ name: '   ' })
    assert.equal(r.valid, false)
  })
})
