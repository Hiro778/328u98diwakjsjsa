import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  safeNumber,
  getToday,
  daysBetween,
  normalizePhoneForWhatsApp,
  normalizePhoneForTel,
  sanitizeLeadInput,
  validateLead,
  validateFollowup,
  checkDuplicateLead,
  normalizeLead,
  searchLeads,
  filterLeads,
  sortLeads,
  paginate,
  isOverdue,
  isTodayFollowup,
  calculateSummary,
  calculatePipeline,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  LEAD_STATUS,
  LEAD_STATUS_LABELS,
  LEAD_FILTERS,
  SORT_OPTIONS,
  FOLLOWUP_METHODS,
  FOLLOWUP_RESULTS,
  PRIORITY,
  PRIORITY_LABELS,
  PAGE_SIZE,
} from '../sections/WhatsAppSalesTracker/whatsappSalesUtils.js'

// ─── safeNumber ────────────────────────────────────────────────

describe('safeNumber', () => {
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

  it('parses numeric string', () => {
    assert.equal(safeNumber('1000'), 1000)
  })

  it('parses number', () => {
    assert.equal(safeNumber(130000), 130000)
  })

  it('parses zero', () => {
    assert.equal(safeNumber(0), 0)
  })

  it('parses negative', () => {
    assert.equal(safeNumber(-500), -500)
  })
})

// ─── getToday ──────────────────────────────────────────────────

describe('getToday', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(getToday()))
  })

  it('returns today matching Date object', () => {
    assert.equal(getToday(), new Date().toISOString().slice(0, 10))
  })
})

// ─── daysBetween ───────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for null inputs', () => {
    assert.equal(daysBetween(null, '2024-01-01'), 0)
    assert.equal(daysBetween('2024-01-01', null), 0)
    assert.equal(daysBetween(null, null), 0)
  })

  it('returns positive for future date', () => {
    assert.ok(daysBetween('2024-01-01', '2024-01-11') > 0)
  })

  it('returns 0 for same date', () => {
    assert.equal(daysBetween('2024-06-15', '2024-06-15'), 0)
  })
})

// ─── normalizePhoneForWhatsApp ─────────────────────────────────

describe('normalizePhoneForWhatsApp', () => {
  it('converts 08123456789 to 628123456789', () => {
    assert.equal(normalizePhoneForWhatsApp('08123456789'), '628123456789')
  })

  it('converts +628123456789 to 628123456789', () => {
    assert.equal(normalizePhoneForWhatsApp('+628123456789'), '628123456789')
  })

  it('handles already normalized 628123456789', () => {
    assert.equal(normalizePhoneForWhatsApp('628123456789'), '628123456789')
  })

  it('strips non-digit characters', () => {
    assert.equal(normalizePhoneForWhatsApp('0812-345-6789'), '628123456789')
    assert.equal(normalizePhoneForWhatsApp('0812 345 6789'), '628123456789')
  })

  it('returns empty for empty/null input', () => {
    assert.equal(normalizePhoneForWhatsApp(''), '')
    assert.equal(normalizePhoneForWhatsApp(null), '')
  })
})

// ─── normalizePhoneForTel ──────────────────────────────────────

describe('normalizePhoneForTel', () => {
  it('strips non-digit characters', () => {
    assert.equal(normalizePhoneForTel('+62 812-345-6789'), '628123456789')
  })

  it('preserves digits only', () => {
    assert.equal(normalizePhoneForTel('08123456789'), '08123456789')
  })

  it('returns empty for empty input', () => {
    assert.equal(normalizePhoneForTel(''), '')
    assert.equal(normalizePhoneForTel(null), '')
  })
})

// ─── sanitizeLeadInput ─────────────────────────────────────────

describe('sanitizeLeadInput', () => {
  it('trims all string fields', () => {
    const result = sanitizeLeadInput({
      name: '  Budi  ',
      phone: ' 0812345 ',
      email: ' budi@test.com ',
      product_interest: ' Laptop ',
      notes: ' notes ',
    })
    assert.equal(result.name, 'Budi')
    assert.equal(result.phone, '0812345')
    assert.equal(result.email, 'budi@test.com')
    assert.equal(result.product_interest, 'Laptop')
    assert.equal(result.notes, 'notes')
  })

  it('handles null fields', () => {
    const result = sanitizeLeadInput({})
    assert.equal(result.name, '')
    assert.equal(result.phone, '')
    assert.equal(result.email, '')
  })
})

// ─── validateLead ──────────────────────────────────────────────

describe('validateLead', () => {
  it('valid lead with all fields', () => {
    const r = validateLead({
      name: 'Budi',
      phone: '08123456789',
      email: 'budi@test.com',
      estimated_value: 500000,
    })
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('valid lead with only name', () => {
    const r = validateLead({ name: 'Budi' })
    assert.equal(r.valid, true)
  })

  it('empty name rejected', () => {
    const r = validateLead({ name: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('whitespace-only name rejected', () => {
    const r = validateLead({ name: '   ' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('null name rejected', () => {
    const r = validateLead({ name: null })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('undefined name rejected', () => {
    const r = validateLead({})
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('invalid email rejected', () => {
    const r = validateLead({ name: 'Budi', email: 'not-an-email' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.email)
  })

  it('valid email accepted', () => {
    const r = validateLead({ name: 'Budi', email: 'budi@test.com' })
    assert.equal(r.valid, true)
  })

  it('empty email is valid (optional)', () => {
    const r = validateLead({ name: 'Budi', email: '' })
    assert.equal(r.valid, true)
  })

  it('invalid phone rejected', () => {
    const r = validateLead({ name: 'Budi', phone: 'abc' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.phone)
  })

  it('valid phone accepted', () => {
    assert.equal(validateLead({ name: 'Budi', phone: '08123456789' }).valid, true)
  })

  it('phone with dashes accepted', () => {
    assert.equal(validateLead({ name: 'Budi', phone: '0812-345-6789' }).valid, true)
  })

  it('phone with plus prefix accepted', () => {
    assert.equal(validateLead({ name: 'Budi', phone: '+628123456789' }).valid, true)
  })

  it('negative estimated_value rejected', () => {
    const r = validateLead({ name: 'Budi', estimated_value: -1000 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.estimated_value)
  })

  it('zero estimated_value accepted', () => {
    assert.equal(validateLead({ name: 'Budi', estimated_value: 0 }).valid, true)
  })

  it('multiple errors returned at once', () => {
    const r = validateLead({ name: '', email: 'bad', phone: '!!' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
    assert.ok(r.errors.email)
    assert.ok(r.errors.phone)
  })
})

// ─── validateFollowup ──────────────────────────────────────────

describe('validateFollowup', () => {
  it('valid followup with method and date', () => {
    const r = validateFollowup({ method: 'whatsapp', date: '2024-06-15' })
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('missing method rejected', () => {
    const r = validateFollowup({ date: '2024-06-15' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.method)
  })

  it('missing date rejected', () => {
    const r = validateFollowup({ method: 'phone' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.date)
  })
})

// ─── checkDuplicateLead ────────────────────────────────────────

describe('checkDuplicateLead', () => {
  const existing = [
    { id: '1', phone: '08123456789', email: 'budi@test.com' },
    { id: '2', phone: '08987654321', email: 'siti@test.com' },
  ]

  it('no duplicate when no match', () => {
    const r = checkDuplicateLead({ phone: '08111111111', email: 'new@test.com' }, existing)
    assert.equal(r.isDuplicate, false)
  })

  it('detects phone duplicate', () => {
    const r = checkDuplicateLead({ phone: '08123456789', email: '' }, existing)
    assert.equal(r.isDuplicate, true)
    assert.equal(r.field, 'phone')
  })

  it('detects email duplicate', () => {
    const r = checkDuplicateLead({ phone: '', email: 'budi@test.com' }, existing)
    assert.equal(r.isDuplicate, true)
    assert.equal(r.field, 'email')
  })

  it('email duplicate is case-insensitive', () => {
    const r = checkDuplicateLead({ phone: '', email: 'BUDI@TEST.COM' }, existing)
    assert.equal(r.isDuplicate, true)
  })

  it('excludes lead by id (for edit)', () => {
    const r = checkDuplicateLead({ phone: '08123456789' }, existing, { excludeId: '1' })
    assert.equal(r.isDuplicate, false)
  })

  it('no duplicate when empty phone and email', () => {
    const r = checkDuplicateLead({ phone: '', email: '' }, existing)
    assert.equal(r.isDuplicate, false)
  })
})

// ─── normalizeLead ─────────────────────────────────────────────

describe('normalizeLead', () => {
  it('returns null for null input', () => {
    assert.equal(normalizeLead(null), null)
  })

  it('normalizes lead with customer join', () => {
    const row = { id: '1', name: 'Budi', customer_id: 'c1' }
    const customers = [{ id: 'c1', name: 'PT Test', phone: '08111' }]
    const result = normalizeLead(row, customers)
    assert.equal(result.customer_name, 'PT Test')
    assert.equal(result.customer_phone, '08111')
  })

  it('normalizes lead without customer', () => {
    const row = { id: '1', name: 'Budi', customer_id: null }
    const result = normalizeLead(row, [])
    assert.equal(result.customer_name, null)
  })

  it('handles missing customer_id gracefully', () => {
    const row = { id: '1', name: 'Budi' }
    const result = normalizeLead(row, [])
    assert.equal(result.customer_name, null)
  })
})

// ─── searchLeads ───────────────────────────────────────────────

describe('searchLeads', () => {
  const leads = [
    { id: '1', name: 'Budi', phone: '08123456789', email: 'budi@test.com', product_interest: 'Laptop', notes: 'Urgent' },
    { id: '2', name: 'Siti', phone: '08987654321', email: 'siti@test.com', product_interest: 'Handphone', notes: '' },
    { id: '3', name: 'Andi', phone: '08111222333', email: 'andi@test.com', product_interest: 'Tablet', notes: 'Follow-up minggu depan' },
  ]

  it('returns all when empty query', () => {
    assert.equal(searchLeads(leads, '').length, 3)
    assert.equal(searchLeads(leads, null).length, 3)
    assert.equal(searchLeads(leads, '   ').length, 3)
  })

  it('search by name', () => {
    assert.equal(searchLeads(leads, 'Budi').length, 1)
    assert.equal(searchLeads(leads, 'Budi')[0].id, '1')
  })

  it('search by phone', () => {
    assert.equal(searchLeads(leads, '0898765').length, 1)
  })

  it('search by email', () => {
    assert.equal(searchLeads(leads, 'andi@test').length, 1)
  })

  it('search by product_interest', () => {
    assert.equal(searchLeads(leads, 'Laptop').length, 1)
  })

  it('search by notes', () => {
    assert.equal(searchLeads(leads, 'minggu depan').length, 1)
  })

  it('case insensitive', () => {
    assert.equal(searchLeads(leads, 'budi').length, 1)
    assert.equal(searchLeads(leads, 'LAPTOP').length, 1)
  })

  it('no match returns empty', () => {
    assert.equal(searchLeads(leads, 'xyz').length, 0)
  })

  it('special characters do not crash', () => {
    assert.doesNotThrow(() => searchLeads(leads, '[test]'))
    assert.doesNotThrow(() => searchLeads(leads, '+62'))
  })
})

// ─── filterLeads ───────────────────────────────────────────────

describe('filterLeads', () => {
  const today = getToday()
  const leads = [
    { id: '1', status: 'new', priority: 'low', next_follow_up_at: null },
    { id: '2', status: 'contacted', priority: 'medium', next_follow_up_at: null },
    { id: '3', status: 'followup', priority: 'high', next_follow_up_at: `${today}T10:00:00` },
    { id: '4', status: 'negotiation', priority: 'medium', next_follow_up_at: null },
    { id: '5', status: 'won', priority: 'low', next_follow_up_at: null },
    { id: '6', status: 'lost', priority: 'high', next_follow_up_at: null },
    { id: '7', status: 'followup', priority: 'low', next_follow_up_at: '2020-01-01T10:00:00' },
  ]

  it('all filter returns everything', () => {
    assert.equal(filterLeads(leads, 'all').length, 7)
  })

  it('new filter matches status === new', () => {
    const r = filterLeads(leads, 'new')
    assert.equal(r.length, 1)
    assert.ok(r.every(l => l.status === 'new'))
  })

  it('contacted filter matches status === contacted', () => {
    assert.equal(filterLeads(leads, 'contacted').length, 1)
  })

  it('followup filter matches status === followup', () => {
    assert.equal(filterLeads(leads, 'followup').length, 2)
  })

  it('won filter matches status === won', () => {
    assert.equal(filterLeads(leads, 'won').length, 1)
  })

  it('lost filter matches status === lost', () => {
    assert.equal(filterLeads(leads, 'lost').length, 1)
  })

  it('today_followup filter matches leads with next_follow_up_at today', () => {
    const r = filterLeads(leads, 'today_followup')
    assert.equal(r.length, 1)
    assert.equal(r[0].id, '3')
  })

  it('overdue filter matches leads with past follow-up and active status', () => {
    const r = filterLeads(leads, 'overdue')
    assert.ok(r.length >= 1)
    assert.ok(r.every(l => l.status !== 'won' && l.status !== 'lost'))
  })

  it('high_priority filter matches priority === high', () => {
    const r = filterLeads(leads, 'high_priority')
    assert.ok(r.every(l => l.priority === 'high'))
  })

  it('unknown filter returns all', () => {
    assert.equal(filterLeads(leads, 'unknown').length, 7)
  })
})

// ─── sortLeads ─────────────────────────────────────────────────

describe('sortLeads', () => {
  const leads = [
    { id: '1', name: 'Charlie', created_at: '2024-01-01', estimated_value: 500000, last_contacted_at: '2024-06-01', next_follow_up_at: '2024-12-01', status: 'followup' },
    { id: '2', name: 'Alpha', created_at: '2024-06-01', estimated_value: 200000, last_contacted_at: '2024-01-01', next_follow_up_at: '2024-03-01', status: 'new' },
    { id: '3', name: 'Bravo', created_at: '2024-03-01', estimated_value: 800000, last_contacted_at: null, next_follow_up_at: null, status: 'won' },
  ]

  it('sort by newest (created_at desc)', () => {
    const r = sortLeads(leads, 'newest')
    assert.equal(r[0].id, '2')
    assert.equal(r[1].id, '3')
    assert.equal(r[2].id, '1')
  })

  it('sort by followup_nearest (next_follow_up_at asc)', () => {
    const r = sortLeads(leads, 'followup_nearest')
    assert.equal(r[0].id, '2')
    assert.equal(r[1].id, '1')
    assert.equal(r[2].id, '3')
  })

  it('sort by value_desc (estimated_value desc)', () => {
    const r = sortLeads(leads, 'value_desc')
    assert.equal(r[0].id, '3')
    assert.equal(r[1].id, '1')
    assert.equal(r[2].id, '2')
  })

  it('sort by name_asc (name A-Z)', () => {
    const r = sortLeads(leads, 'name_asc')
    assert.equal(r[0].id, '2')
    assert.equal(r[1].id, '3')
    assert.equal(r[2].id, '1')
  })

  it('sort by last_contacted (desc, nulls last)', () => {
    const r = sortLeads(leads, 'last_contacted')
    assert.equal(r[0].id, '1')
    assert.equal(r[1].id, '2')
    assert.equal(r[2].id, '3')
  })

  it('does not mutate original array', () => {
    const snapshot = leads.map(l => ({ ...l }))
    sortLeads(leads, 'newest')
    assert.deepEqual(leads, snapshot)
  })
})

// ─── paginate ──────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))

  it('defaults to PAGE_SIZE (20)', () => {
    const r = paginate(items, 1)
    assert.equal(r.items.length, 20)
    assert.equal(r.totalPages, 3)
    assert.equal(r.total, 50)
  })

  it('page 2 returns next batch', () => {
    const r = paginate(items, 2)
    assert.equal(r.items[0].id, 20)
  })

  it('last page returns remaining items', () => {
    const r = paginate(items, 3)
    assert.equal(r.items.length, 10)
  })

  it('page beyond total clamps to last', () => {
    assert.equal(paginate(items, 999).currentPage, 3)
  })

  it('page 0 clamps to 1', () => {
    assert.equal(paginate(items, 0).currentPage, 1)
  })

  it('empty array returns 1 page with 0 items', () => {
    const r = paginate([], 1)
    assert.equal(r.totalPages, 1)
    assert.equal(r.items.length, 0)
  })
})

// ─── isOverdue ─────────────────────────────────────────────────

describe('isOverdue', () => {
  it('returns true when next_follow_up_at is in the past and status is active', () => {
    assert.equal(isOverdue({ next_follow_up_at: '2020-01-01T10:00:00', status: 'followup' }), true)
  })

  it('returns false when next_follow_up_at is in the future', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    assert.equal(isOverdue({ next_follow_up_at: future.toISOString(), status: 'followup' }), false)
  })

  it('returns false when status is won', () => {
    assert.equal(isOverdue({ next_follow_up_at: '2020-01-01T10:00:00', status: 'won' }), false)
  })

  it('returns false when status is lost', () => {
    assert.equal(isOverdue({ next_follow_up_at: '2020-01-01T10:00:00', status: 'lost' }), false)
  })

  it('returns false when next_follow_up_at is null', () => {
    assert.equal(isOverdue({ next_follow_up_at: null, status: 'followup' }), false)
  })
})

// ─── isTodayFollowup ───────────────────────────────────────────

describe('isTodayFollowup', () => {
  it('returns true when next_follow_up_at is today', () => {
    const today = getToday()
    assert.equal(isTodayFollowup({ next_follow_up_at: `${today}T10:00:00` }), true)
  })

  it('returns false when next_follow_up_at is yesterday', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yesterday = d.toISOString().slice(0, 10)
    assert.equal(isTodayFollowup({ next_follow_up_at: `${yesterday}T10:00:00` }), false)
  })

  it('returns false when next_follow_up_at is null', () => {
    assert.equal(isTodayFollowup({ next_follow_up_at: null }), false)
  })
})

// ─── calculateSummary ──────────────────────────────────────────

describe('calculateSummary', () => {
  it('empty list returns all zeros', () => {
    const s = calculateSummary([])
    assert.equal(s.total, 0)
    assert.equal(s.newCount, 0)
    assert.equal(s.wonCount, 0)
    assert.equal(s.pipelineValue, 0)
    assert.equal(s.conversionRate, 0)
  })

  it('counts total leads', () => {
    const leads = [
      { status: 'new', priority: 'low', estimated_value: 100, next_follow_up_at: null },
      { status: 'won', priority: 'low', estimated_value: 200, next_follow_up_at: null },
    ]
    assert.equal(calculateSummary(leads).total, 2)
  })

  it('counts new leads', () => {
    const leads = [
      { status: 'new', priority: 'low', estimated_value: 0, next_follow_up_at: null },
      { status: 'new', priority: 'low', estimated_value: 0, next_follow_up_at: null },
      { status: 'contacted', priority: 'low', estimated_value: 0, next_follow_up_at: null },
    ]
    assert.equal(calculateSummary(leads).newCount, 2)
  })

  it('counts won leads', () => {
    const leads = [
      { status: 'won', priority: 'low', estimated_value: 100, next_follow_up_at: null },
      { status: 'won', priority: 'low', estimated_value: 200, next_follow_up_at: null },
    ]
    assert.equal(calculateSummary(leads).wonCount, 2)
  })

  it('sums pipeline value (excluding won/lost)', () => {
    const leads = [
      { status: 'new', priority: 'low', estimated_value: 100, next_follow_up_at: null },
      { status: 'negotiation', priority: 'low', estimated_value: 200, next_follow_up_at: null },
      { status: 'won', priority: 'low', estimated_value: 500, next_follow_up_at: null },
      { status: 'lost', priority: 'low', estimated_value: 300, next_follow_up_at: null },
    ]
    assert.equal(calculateSummary(leads).pipelineValue, 300)
  })

  it('calculates conversion rate (won / total)', () => {
    const leads = [
      { status: 'won', priority: 'low', estimated_value: 0, next_follow_up_at: null },
      { status: 'new', priority: 'low', estimated_value: 0, next_follow_up_at: null },
      { status: 'new', priority: 'low', estimated_value: 0, next_follow_up_at: null },
      { status: 'new', priority: 'low', estimated_value: 0, next_follow_up_at: null },
    ]
    assert.equal(calculateSummary(leads).conversionRate, 25)
  })

  it('conversion rate is 0 when no leads', () => {
    assert.equal(calculateSummary([]).conversionRate, 0)
  })

  it('handles null estimated_value without NaN', () => {
    const leads = [
      { status: 'new', priority: 'low', estimated_value: null, next_follow_up_at: null },
      { status: 'new', priority: 'low', estimated_value: undefined, next_follow_up_at: null },
    ]
    const s = calculateSummary(leads)
    assert.ok(Number.isFinite(s.pipelineValue))
    assert.equal(s.pipelineValue, 0)
  })
})

// ─── calculatePipeline ─────────────────────────────────────────

describe('calculatePipeline', () => {
  it('returns empty object for empty array', () => {
    assert.deepEqual(calculatePipeline([]), {})
  })

  it('groups leads by status with count and value', () => {
    const leads = [
      { status: 'new', estimated_value: 100 },
      { status: 'new', estimated_value: 200 },
      { status: 'won', estimated_value: 500 },
    ]
    const p = calculatePipeline(leads)
    assert.equal(p.new.count, 2)
    assert.equal(p.new.value, 300)
    assert.equal(p.won.count, 1)
    assert.equal(p.won.value, 500)
  })

  it('handles null estimated_value', () => {
    const leads = [{ status: 'new', estimated_value: null }]
    const p = calculatePipeline(leads)
    assert.equal(p.new.value, 0)
  })
})

// ─── formatCurrency ────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats IDR amount', () => {
    const result = formatCurrency(130000)
    assert.ok(result.includes('130'))
    assert.ok(result.includes('000'))
  })

  it('formats zero', () => {
    assert.ok(formatCurrency(0).includes('0'))
  })

  it('handles null safely', () => {
    assert.ok(formatCurrency(null).includes('0'))
  })

  it('handles NaN safely', () => {
    assert.ok(formatCurrency(NaN).includes('0'))
  })
})

// ─── formatDate / formatDateTime ───────────────────────────────

describe('formatDate', () => {
  it('returns "-" for null', () => {
    assert.equal(formatDate(null), '-')
  })

  it('returns "-" for invalid date', () => {
    assert.equal(formatDate('not-a-date'), '-')
  })

  it('formats valid date', () => {
    const result = formatDate('2024-06-15')
    assert.ok(result.includes('15'))
    assert.ok(result.includes('2024'))
  })
})

describe('formatDateTime', () => {
  it('returns "-" for null', () => {
    assert.equal(formatDateTime(null), '-')
  })

  it('returns "-" for invalid datetime', () => {
    assert.equal(formatDateTime('not-a-date'), '-')
  })

  it('formats valid datetime', () => {
    const result = formatDateTime('2024-06-15T10:30:00Z')
    assert.ok(result.includes('15'))
    assert.ok(result.includes('2024'))
  })
})

// ─── formatRelativeTime ────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "-" for null', () => {
    assert.equal(formatRelativeTime(null), '-')
  })

  it('returns "-" for invalid date', () => {
    assert.equal(formatRelativeTime('not-a-date'), '-')
  })

  it('returns something for valid date', () => {
    const result = formatRelativeTime(new Date().toISOString())
    assert.ok(typeof result === 'string')
    assert.ok(result.length > 0)
  })
})

// ─── constants ─────────────────────────────────────────────────

describe('constants', () => {
  it('LEAD_STATUS has 6 entries', () => {
    assert.equal(Object.keys(LEAD_STATUS).length, 6)
  })

  it('LEAD_STATUS_LABELS has entry for each status', () => {
    for (const key of Object.values(LEAD_STATUS)) {
      assert.ok(LEAD_STATUS_LABELS[key], `Missing label for ${key}`)
    }
  })

  it('LEAD_FILTERS has 10 entries', () => {
    assert.equal(LEAD_FILTERS.length, 10)
  })

  it('SORT_OPTIONS has 6 entries', () => {
    assert.equal(SORT_OPTIONS.length, 6)
  })

  it('PAGE_SIZE is 20', () => {
    assert.equal(PAGE_SIZE, 20)
  })

  it('FOLLOWUP_METHODS has 4 entries', () => {
    assert.equal(FOLLOWUP_METHODS.length, 4)
  })

  it('FOLLOWUP_RESULTS has 3 entries', () => {
    assert.equal(FOLLOWUP_RESULTS.length, 3)
  })

  it('PRIORITY has 3 entries', () => {
    assert.equal(Object.keys(PRIORITY).length, 3)
  })

  it('PRIORITY_LABELS has entry for each priority', () => {
    for (const key of Object.values(PRIORITY)) {
      assert.ok(PRIORITY_LABELS[key], `Missing label for ${key}`)
    }
  })
})

// ─── edge cases ────────────────────────────────────────────────

describe('edge cases', () => {
  it('no NaN in summary pipeline with extreme values', () => {
    const leads = [
      { status: 'new', priority: 'low', estimated_value: null, next_follow_up_at: null },
      { status: 'new', priority: 'high', estimated_value: NaN, next_follow_up_at: null },
      { status: 'won', priority: 'medium', estimated_value: undefined, next_follow_up_at: null },
    ]
    const s = calculateSummary(leads)
    assert.ok(Number.isFinite(s.total))
    assert.ok(Number.isFinite(s.pipelineValue))
    assert.ok(Number.isFinite(s.conversionRate))
  })

  it('searchLeads with regex special characters does not crash', () => {
    const leads = [{ name: 'Test', phone: '+62812', email: 'a@b.com', product_interest: 'Laptop', notes: '' }]
    assert.doesNotThrow(() => searchLeads(leads, '[test]'))
    assert.doesNotThrow(() => searchLeads(leads, '+62'))
    assert.doesNotThrow(() => searchLeads(leads, 'a@b'))
  })

  it('filter with null dates does not crash', () => {
    const leads = [
      { id: '1', status: 'followup', priority: 'low', next_follow_up_at: null, estimated_value: 0, last_contacted_at: null, created_at: '2024-01-01', name: 'A' },
    ]
    assert.doesNotThrow(() => filterLeads(leads, 'today_followup'))
    assert.doesNotThrow(() => filterLeads(leads, 'overdue'))
  })

  it('sort with all null dates does not crash', () => {
    const leads = [
      { id: '1', name: 'A', created_at: null, estimated_value: null, last_contacted_at: null, next_follow_up_at: null, status: 'new' },
      { id: '2', name: 'B', created_at: null, estimated_value: null, last_contacted_at: null, next_follow_up_at: null, status: 'new' },
    ]
    assert.doesNotThrow(() => sortLeads(leads, 'newest'))
    assert.doesNotThrow(() => sortLeads(leads, 'followup_nearest'))
    assert.doesNotThrow(() => sortLeads(leads, 'last_contacted'))
  })

  it('paginate with single item', () => {
    const r = paginate([{ id: 1 }], 1)
    assert.equal(r.items.length, 1)
    assert.equal(r.totalPages, 1)
    assert.equal(r.currentPage, 1)
  })
})
