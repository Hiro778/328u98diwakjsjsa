import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  safeNumber,
  getToday,
  calculateOutstanding,
  calculateDaysOverdue,
  getInvoiceStatus,
  getInvoicePriority,
  normalizeInvoice,
  searchInvoices,
  filterInvoices,
  sortInvoices,
  calculateSummary,
  getLatestFollowup,
  daysSinceFollowup,
  validateFollowup,
  validateInvoice,
  validatePayment,
  calculateTotal,
  checkPaymentLimit,
  checkDuplicateInvoiceNumber,
  paginate,
  formatCurrency,
  formatDate,
  formatDueDate,
  formatFollowupReminder,
  INVOICE_STATUS,
  PRIORITY,
  FOLLOWUP_METHODS,
  INVOICE_FILTERS,
  PERIOD_FILTERS,
  SORT_OPTIONS,
  PAGE_SIZE,
} from '../sections/InvoiceFollowUp/invoiceFollowUpUtils.js'

// ─── safeNumber ───────────────────────────────────────────────

describe('safeNumber', () => {
  it('returns 0 for null', () => assert.equal(safeNumber(null), 0))
  it('returns 0 for undefined', () => assert.equal(safeNumber(undefined), 0))
  it('returns 0 for NaN', () => assert.equal(safeNumber(NaN), 0))
  it('returns 0 for Infinity', () => assert.equal(safeNumber(Infinity), 0))
  it('returns 0 for -Infinity', () => assert.equal(safeNumber(-Infinity), 0))
  it('parses number', () => assert.equal(safeNumber(1000), 1000))
  it('parses string', () => assert.equal(safeNumber('1000'), 1000))
  it('returns 0 for non-numeric string', () => assert.equal(safeNumber('abc'), 0))
  it('parses zero', () => assert.equal(safeNumber(0), 0))
  it('parses negative', () => assert.equal(safeNumber(-100), -100))
})

// ─── calculateOutstanding ─────────────────────────────────────

describe('calculateOutstanding', () => {
  it('full payment', () => {
    assert.equal(calculateOutstanding({ amount: 100000, paid_amount: 100000 }), 0)
  })
  it('partial payment', () => {
    assert.equal(calculateOutstanding({ amount: 100000, paid_amount: 30000 }), 70000)
  })
  it('zero payment', () => {
    assert.equal(calculateOutstanding({ amount: 100000, paid_amount: 0 }), 100000)
  })
  it('overpayment capped to 0', () => {
    assert.equal(calculateOutstanding({ amount: 100000, paid_amount: 150000 }), 0)
  })
  it('null invoice', () => {
    assert.equal(calculateOutstanding(null), 0)
  })
  it('null amount/paid', () => {
    assert.equal(calculateOutstanding({ amount: null, paid_amount: null }), 0)
  })
  it('NaN amounts', () => {
    assert.equal(calculateOutstanding({ amount: NaN, paid_amount: NaN }), 0)
  })
  it('Infinity amounts', () => {
    assert.equal(calculateOutstanding({ amount: Infinity, paid_amount: Infinity }), 0)
  })
})

// ─── calculateDaysOverdue ─────────────────────────────────────

describe('calculateDaysOverdue', () => {
  it('not overdue if paid', () => {
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 100, due_date: '2020-01-01' }), 0)
  })
  it('not overdue if future due date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const futureStr = future.toISOString().split('T')[0]
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 0, due_date: futureStr }), 0)
  })
  it('1 day overdue', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yStr = yesterday.toISOString().split('T')[0]
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 0, due_date: yStr }), 1)
  })
  it('multiple days overdue', () => {
    const d = new Date()
    d.setDate(d.getDate() - 5)
    const dStr = d.toISOString().split('T')[0]
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 0, due_date: dStr }), 5)
  })
  it('null due_date returns 0', () => {
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 0, due_date: null }), 0)
  })
  it('due today returns 0', () => {
    assert.equal(calculateDaysOverdue({ amount: 100, paid_amount: 0, due_date: getToday() }), 0)
  })
})

// ─── getInvoiceStatus ─────────────────────────────────────────

describe('getInvoiceStatus', () => {
  it('paid invoice', () => {
    assert.equal(getInvoiceStatus({ amount: 100, paid_amount: 100, due_date: '2020-01-01' }), INVOICE_STATUS.PAID)
  })
  it('overdue', () => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    assert.equal(getInvoiceStatus({ amount: 100, paid_amount: 0, due_date: d.toISOString().split('T')[0] }), INVOICE_STATUS.OVERDUE)
  })
  it('due today', () => {
    assert.equal(getInvoiceStatus({ amount: 100, paid_amount: 0, due_date: getToday() }), INVOICE_STATUS.DUE_TODAY)
  })
  it('pending (future)', () => {
    const d = new Date()
    d.setDate(d.getDate() + 10)
    assert.equal(getInvoiceStatus({ amount: 100, paid_amount: 0, due_date: d.toISOString().split('T')[0] }), INVOICE_STATUS.PENDING)
  })
  it('null due_date returns pending', () => {
    assert.equal(getInvoiceStatus({ amount: 100, paid_amount: 0, due_date: null }), INVOICE_STATUS.PENDING)
  })
})

// ─── getInvoicePriority ───────────────────────────────────────

describe('getInvoicePriority', () => {
  it('overdue = HIGH', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    assert.equal(getInvoicePriority({ amount: 100, paid_amount: 0, due_date: d.toISOString().split('T')[0] }), PRIORITY.HIGH)
  })
  it('due today = MEDIUM', () => {
    assert.equal(getInvoicePriority({ amount: 100, paid_amount: 0, due_date: getToday() }), PRIORITY.MEDIUM)
  })
  it('future = LOW', () => {
    const d = new Date()
    d.setDate(d.getDate() + 10)
    assert.equal(getInvoicePriority({ amount: 100, paid_amount: 0, due_date: d.toISOString().split('T')[0] }), PRIORITY.LOW)
  })
  it('paid = LOW', () => {
    assert.equal(getInvoicePriority({ amount: 100, paid_amount: 100, due_date: '2020-01-01' }), PRIORITY.LOW)
  })
})

// ─── normalizeInvoice ─────────────────────────────────────────

describe('normalizeInvoice', () => {
  it('normalizes with customer data', () => {
    const customers = [{ id: 'c1', name: 'Budi', phone: '08123', email: 'budi@test.com' }]
    const row = { id: '1', amount: 100000, paid_amount: 0, due_date: '2020-01-01', customer_id: 'c1' }
    const n = normalizeInvoice(row, customers)
    assert.equal(n.customer_name, 'Budi')
    assert.equal(n.customer_phone, '08123')
    assert.equal(n.customer_email, 'budi@test.com')
    assert.equal(n.outstanding, 100000)
    assert.equal(n.status, INVOICE_STATUS.OVERDUE)
    assert.equal(n.priority, PRIORITY.HIGH)
  })
  it('normalizes without customer', () => {
    const row = { id: '1', amount: 100, paid_amount: 100, due_date: '2020-01-01' }
    const n = normalizeInvoice(row, [])
    assert.equal(n.customer_name, 'Tanpa Customer')
    assert.equal(n.outstanding, 0)
    assert.equal(n.status, INVOICE_STATUS.PAID)
  })
  it('returns null for null row', () => {
    assert.equal(normalizeInvoice(null, []), null)
  })
  it('handles NaN amounts', () => {
    const row = { id: '1', amount: NaN, paid_amount: NaN, due_date: null }
    const n = normalizeInvoice(row, [])
    assert.ok(Number.isFinite(n.outstanding))
    assert.equal(n.outstanding, 0)
  })
})

// ─── searchInvoices ───────────────────────────────────────────

describe('searchInvoices', () => {
  const invoices = [
    { invoice_number: 'INV-001', customer_name: 'Budi', customer_phone: '08123456' },
    { invoice_number: 'INV-002', customer_name: 'Siti', customer_phone: '08987654' },
    { invoice_number: 'INV-003', customer_name: 'Andi', customer_phone: '08111222' },
  ]

  it('empty query returns all', () => {
    assert.equal(searchInvoices(invoices, '').length, 3)
    assert.equal(searchInvoices(invoices, '  ').length, 3)
    assert.equal(searchInvoices(invoices, null).length, 3)
  })
  it('search by invoice number', () => {
    assert.equal(searchInvoices(invoices, 'INV-001').length, 1)
  })
  it('search by customer name', () => {
    assert.equal(searchInvoices(invoices, 'Budi').length, 1)
  })
  it('search by phone', () => {
    assert.equal(searchInvoices(invoices, '089876').length, 1)
  })
  it('case insensitive', () => {
    assert.equal(searchInvoices(invoices, 'budi').length, 1)
    assert.equal(searchInvoices(invoices, 'inv-002').length, 1)
  })
  it('partial match', () => {
    assert.equal(searchInvoices(invoices, 'INV-0').length, 3)
  })
  it('no match', () => {
    assert.equal(searchInvoices(invoices, 'xyz999').length, 0)
  })
  it('special chars safe', () => {
    assert.doesNotThrow(() => searchInvoices(invoices, '[test]'))
    assert.doesNotThrow(() => searchInvoices(invoices, '+62'))
  })
  it('null invoice fields safe', () => {
    const invs = [{ invoice_number: null, customer_name: null, customer_phone: null }]
    assert.doesNotThrow(() => searchInvoices(invs, 'test'))
    assert.equal(searchInvoices(invs, 'test').length, 0)
  })
})

// ─── filterInvoices ───────────────────────────────────────────

describe('filterInvoices', () => {
  const invoices = [
    { status: 'paid', issue_date: '2024-01-01' },
    { status: 'overdue', issue_date: '2024-06-01' },
    { status: 'pending', issue_date: '2024-06-15' },
    { status: 'due_today', issue_date: getToday() },
  ]

  it('all filter', () => {
    assert.equal(filterInvoices(invoices, 'all', 'all').length, 4)
  })
  it('paid filter', () => {
    assert.equal(filterInvoices(invoices, 'paid', 'all').length, 1)
  })
  it('overdue filter', () => {
    assert.equal(filterInvoices(invoices, 'overdue', 'all').length, 1)
  })
  it('pending filter', () => {
    assert.equal(filterInvoices(invoices, 'pending', 'all').length, 1)
  })
  it('due_today filter', () => {
    assert.equal(filterInvoices(invoices, 'due_today', 'all').length, 1)
  })
  it('period filter 7 days', () => {
    const recent = { status: 'pending', issue_date: getToday() }
    const old = { status: 'pending', issue_date: '2020-01-01' }
    const r = filterInvoices([recent, old], 'all', '7')
    assert.equal(r.length, 1)
    assert.equal(r[0].issue_date, getToday())
  })
  it('combined filters', () => {
    assert.equal(filterInvoices(invoices, 'paid', '30').length, 0) // paid but old
  })
})

// ─── sortInvoices ─────────────────────────────────────────────

describe('sortInvoices', () => {
  const invoices = [
    { id: '1', due_date: '2024-06-20', outstanding: 50000, created_at: '2024-01-01' },
    { id: '2', due_date: '2024-06-10', outstanding: 100000, created_at: '2024-06-01' },
    { id: '3', due_date: null, outstanding: 0, created_at: '2024-03-01' },
  ]

  it('due_date_asc', () => {
    const r = sortInvoices(invoices, 'due_date_asc')
    assert.equal(r[0].id, '2') // 2024-06-10
  })
  it('due_date_desc', () => {
    const r = sortInvoices(invoices, 'due_date_desc')
    assert.equal(r[0].id, '1') // 2024-06-20
  })
  it('amount_desc', () => {
    const r = sortInvoices(invoices, 'amount_desc')
    assert.equal(r[0].id, '2') // 100000
  })
  it('amount_asc', () => {
    const r = sortInvoices(invoices, 'amount_asc')
    assert.equal(r[0].id, '3') // 0
  })
  it('newest', () => {
    const r = sortInvoices(invoices, 'newest')
    assert.equal(r[0].id, '2') // 2024-06-01
  })
  it('does not mutate original', () => {
    const orig = [...invoices]
    sortInvoices(invoices, 'due_date_asc')
    assert.deepEqual(invoices, orig)
  })
  it('null-safe sort', () => {
    assert.doesNotThrow(() => sortInvoices(invoices, 'due_date_asc'))
    assert.doesNotThrow(() => sortInvoices(invoices, 'due_date_desc'))
  })
})

// ─── calculateSummary ─────────────────────────────────────────

describe('calculateSummary', () => {
  it('empty list', () => {
    const r = calculateSummary([])
    assert.equal(r.totalReceivable, 0)
    assert.equal(r.overdueCount, 0)
    assert.equal(r.dueTodayCount, 0)
    assert.equal(r.paidCount, 0)
  })
  it('counts correctly', () => {
    const invoices = [
      { status: 'paid', outstanding: 0 },
      { status: 'overdue', outstanding: 50000 },
      { status: 'overdue', outstanding: 30000 },
      { status: 'due_today', outstanding: 20000 },
      { status: 'pending', outstanding: 40000 },
    ]
    const r = calculateSummary(invoices)
    assert.equal(r.totalReceivable, 140000)
    assert.equal(r.overdueCount, 2)
    assert.equal(r.overdueAmount, 80000)
    assert.equal(r.dueTodayCount, 1)
    assert.equal(r.paidCount, 1)
  })
  it('no NaN', () => {
    const invoices = [{ status: 'paid', outstanding: NaN }, { status: 'overdue', outstanding: Infinity }]
    const r = calculateSummary(invoices)
    assert.ok(Number.isFinite(r.totalReceivable))
    assert.ok(Number.isFinite(r.overdueAmount))
  })
})

// ─── follow-up helpers ────────────────────────────────────────

describe('getLatestFollowup', () => {
  it('returns null for empty', () => {
    assert.equal(getLatestFollowup([]), null)
    assert.equal(getLatestFollowup(null), null)
  })
  it('returns latest by date', () => {
    const followups = [
      { id: '1', follow_up_date: '2024-01-01' },
      { id: '2', follow_up_date: '2024-06-01' },
      { id: '3', follow_up_date: '2024-03-01' },
    ]
    assert.equal(getLatestFollowup(followups).id, '2')
  })
})

describe('daysSinceFollowup', () => {
  it('null if no followups', () => {
    assert.equal(daysSinceFollowup(null), null)
    assert.equal(daysSinceFollowup([]), null)
  })
  it('calculates days', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 3)
    const yStr = yesterday.toISOString().split('T')[0]
    assert.equal(daysSinceFollowup([{ follow_up_date: yStr }]), 3)
  })
  it('0 for today', () => {
    assert.equal(daysSinceFollowup([{ follow_up_date: getToday() }]), 0)
  })
})

// ─── validateFollowup ─────────────────────────────────────────

describe('validateFollowup', () => {
  it('valid', () => {
    const r = validateFollowup({ method: 'whatsapp', follow_up_date: getToday() })
    assert.equal(r.valid, true)
  })
  it('missing method', () => {
    const r = validateFollowup({ method: '', follow_up_date: getToday() })
    assert.equal(r.valid, false)
    assert.ok(r.errors.method)
  })
  it('invalid method', () => {
    const r = validateFollowup({ method: 'invalid', follow_up_date: getToday() })
    assert.equal(r.valid, false)
    assert.ok(r.errors.method)
  })
  it('missing date', () => {
    const r = validateFollowup({ method: 'phone', follow_up_date: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.follow_up_date)
  })
  it('all valid methods accepted', () => {
    for (const m of FOLLOWUP_METHODS) {
      const r = validateFollowup({ method: m.key, follow_up_date: getToday() })
      assert.equal(r.valid, true, `Method ${m.key} should be valid`)
    }
  })
})

// ─── paginate ─────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }))

  it('defaults to PAGE_SIZE (20)', () => {
    const r = paginate(items, 1)
    assert.equal(r.items.length, 20)
    assert.equal(r.totalPages, 3)
    assert.equal(r.total, 50)
  })
  it('last page', () => {
    const r = paginate(items, 3)
    assert.equal(r.items.length, 10)
  })
  it('empty array', () => {
    const r = paginate([], 1)
    assert.equal(r.totalPages, 1)
    assert.equal(r.items.length, 0)
  })
})

// ─── formatting ───────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats IDR', () => {
    assert.ok(formatCurrency(130000).includes('130'))
  })
  it('handles null', () => {
    assert.ok(formatCurrency(null).includes('0'))
  })
  it('handles NaN', () => {
    assert.ok(formatCurrency(NaN).includes('0'))
  })
})

describe('formatDate', () => {
  it('returns - for null', () => assert.equal(formatDate(null), '-'))
  it('formats valid date', () => {
    const r = formatDate('2024-06-15')
    assert.ok(r.includes('15'))
    assert.ok(r.includes('2024'))
  })
})

describe('formatDueDate', () => {
  it('returns - for null', () => assert.equal(formatDueDate(null), '-'))
  it('normal for pending', () => {
    const r = formatDueDate('2024-06-15', INVOICE_STATUS.PENDING)
    assert.ok(r.includes('15'))
  })
  it('shows days for overdue', () => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    const r = formatDueDate(d.toISOString().split('T')[0], INVOICE_STATUS.OVERDUE)
    assert.ok(r.includes('3 hari'))
  })
})

describe('formatFollowupReminder', () => {
  it('never followed up', () => {
    assert.equal(formatFollowupReminder([]), 'Belum pernah di-follow-up')
    assert.equal(formatFollowupReminder(null), 'Belum pernah di-follow-up')
  })
  it('today', () => {
    assert.equal(formatFollowupReminder([{ follow_up_date: getToday() }]), 'Hari ini')
  })
})

// ─── constants ────────────────────────────────────────────────

describe('constants', () => {
  it('INVOICE_FILTERS has 6 entries', () => assert.equal(INVOICE_FILTERS.length, 6))
  it('PERIOD_FILTERS has 4 entries', () => assert.equal(PERIOD_FILTERS.length, 4))
  it('SORT_OPTIONS has 6 entries', () => assert.equal(SORT_OPTIONS.length, 6))
  it('PAGE_SIZE is 20', () => assert.equal(PAGE_SIZE, 20))
  it('all FOLLOWUP_METHODS have valid keys', () => {
    assert.ok(FOLLOWUP_METHODS.length >= 5)
    for (const m of FOLLOWUP_METHODS) {
      assert.ok(m.key)
      assert.ok(m.label)
    }
  })
  it('INVOICE_STATUS has 5 statuses', () => {
    assert.equal(Object.keys(INVOICE_STATUS).length, 5)
  })
})

// ─── validateInvoice ──────────────────────────────────────────

describe('validateInvoice', () => {
  it('valid invoice', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '2024-06-01', due_date: '2024-06-30', amount: 100000 })
    assert.equal(r.valid, true)
  })
  it('missing invoice number', () => {
    const r = validateInvoice({ invoice_number: '', issue_date: '2024-06-01', due_date: '2024-06-30', amount: 100000 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.invoice_number)
  })
  it('missing issue date', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '', due_date: '2024-06-30', amount: 100000 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.issue_date)
  })
  it('missing due date', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '2024-06-01', due_date: '', amount: 100000 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.due_date)
  })
  it('due date before issue date', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '2024-06-30', due_date: '2024-06-01', amount: 100000 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.due_date)
  })
  it('zero amount', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '2024-06-01', due_date: '2024-06-30', amount: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.amount)
  })
  it('negative amount', () => {
    const r = validateInvoice({ invoice_number: 'INV-001', issue_date: '2024-06-01', due_date: '2024-06-30', amount: -100 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.amount)
  })
})

// ─── validatePayment ──────────────────────────────────────────

describe('validatePayment', () => {
  it('valid payment', () => {
    const r = validatePayment({ amount: 50000, payment_date: '2024-06-15' })
    assert.equal(r.valid, true)
  })
  it('zero amount', () => {
    const r = validatePayment({ amount: 0, payment_date: '2024-06-15' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.amount)
  })
  it('negative amount', () => {
    const r = validatePayment({ amount: -100, payment_date: '2024-06-15' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.amount)
  })
  it('missing date', () => {
    const r = validatePayment({ amount: 50000, payment_date: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.payment_date)
  })
  it('NaN amount', () => {
    const r = validatePayment({ amount: NaN, payment_date: '2024-06-15' })
    assert.equal(r.valid, false)
  })
})

// ─── calculateTotal ───────────────────────────────────────────

describe('calculateTotal', () => {
  it('subtotal only', () => assert.equal(calculateTotal(100000, 0, 0), 100000))
  it('with discount', () => assert.equal(calculateTotal(100000, 10000, 0), 90000))
  it('with tax', () => assert.equal(calculateTotal(100000, 0, 11000), 111000))
  it('with all', () => assert.equal(calculateTotal(100000, 10000, 10000), 100000))
  it('negative result capped to 0', () => assert.equal(calculateTotal(10000, 50000, 0), 0))
  it('null values', () => assert.equal(calculateTotal(null, null, null), 0))
  it('NaN values', () => assert.equal(calculateTotal(NaN, NaN, NaN), 0))
})

// ─── checkPaymentLimit ────────────────────────────────────────

describe('checkPaymentLimit', () => {
  it('within limit', () => {
    const r = checkPaymentLimit({ amount: 100000, paid_amount: 0 }, 50000)
    assert.equal(r.allowed, true)
    assert.equal(r.excess, 0)
  })
  it('exact limit', () => {
    const r = checkPaymentLimit({ amount: 100000, paid_amount: 0 }, 100000)
    assert.equal(r.allowed, true)
  })
  it('exceeds limit', () => {
    const r = checkPaymentLimit({ amount: 100000, paid_amount: 0 }, 150000)
    assert.equal(r.allowed, false)
    assert.equal(r.excess, 50000)
  })
  it('already partially paid', () => {
    const r = checkPaymentLimit({ amount: 100000, paid_amount: 30000 }, 80000)
    assert.equal(r.allowed, false)
    assert.equal(r.excess, 10000)
  })
})

// ─── checkDuplicateInvoiceNumber ──────────────────────────────

describe('checkDuplicateInvoiceNumber', () => {
  const existing = [
    { id: '1', invoice_number: 'INV-001' },
    { id: '2', invoice_number: 'INV-002' },
  ]

  it('no duplicate', () => assert.equal(checkDuplicateInvoiceNumber('INV-003', existing), false))
  it('duplicate found', () => assert.equal(checkDuplicateInvoiceNumber('INV-001', existing), true))
  it('case insensitive', () => assert.equal(checkDuplicateInvoiceNumber('inv-001', existing), true))
  it('exclude self on edit', () => assert.equal(checkDuplicateInvoiceNumber('INV-001', existing, { excludeId: '1' }), false))
  it('empty number returns false', () => assert.equal(checkDuplicateInvoiceNumber('', existing), false))
})

// ─── partial payment status ───────────────────────────────────

describe('partial payment status', () => {
  it('partial payment returns PARTIAL status', () => {
    const inv = { amount: 100000, paid_amount: 30000, due_date: '2099-01-01' }
    assert.equal(getInvoiceStatus(inv), INVOICE_STATUS.PARTIAL)
  })
  it('partial payment with overdue due date returns PARTIAL', () => {
    const d = new Date()
    d.setDate(d.getDate() - 5)
    const inv = { amount: 100000, paid_amount: 30000, due_date: d.toISOString().split('T')[0] }
    assert.equal(getInvoiceStatus(inv), INVOICE_STATUS.PARTIAL)
  })
  it('full payment returns PAID', () => {
    const inv = { amount: 100000, paid_amount: 100000, due_date: '2020-01-01' }
    assert.equal(getInvoiceStatus(inv), INVOICE_STATUS.PAID)
  })
})

// ─── edge cases ───────────────────────────────────────────────

describe('edge cases', () => {
  it('no NaN in summary pipeline', () => {
    const invoices = [
      { status: 'paid', outstanding: NaN },
      { status: 'overdue', outstanding: null },
      { status: 'pending', outstanding: Infinity },
    ]
    const r = calculateSummary(invoices)
    assert.ok(Number.isFinite(r.totalReceivable))
    assert.ok(Number.isFinite(r.overdueAmount))
  })
  it('negative amounts in outstanding', () => {
    const r = calculateOutstanding({ amount: -100, paid_amount: 0 })
    assert.equal(r, 0)
  })
  it('search with null fields', () => {
    const invs = [
      { invoice_number: null, customer_name: null, customer_phone: null },
      { invoice_number: 'INV-1', customer_name: 'Test', customer_phone: '08123' },
    ]
    assert.equal(searchInvoices(invs, 'INV-1').length, 1)
    assert.equal(searchInvoices(invs, null).length, 2)
  })
  it('filter with null dates', () => {
    const invs = [{ status: 'pending', issue_date: null }]
    assert.doesNotThrow(() => filterInvoices(invs, 'all', '7'))
  })
  it('sort with all nulls', () => {
    const invs = [
      { id: '1', due_date: null, outstanding: 0, created_at: null },
      { id: '2', due_date: null, outstanding: 0, created_at: null },
    ]
    assert.doesNotThrow(() => sortInvoices(invs, 'due_date_asc'))
  })
})
