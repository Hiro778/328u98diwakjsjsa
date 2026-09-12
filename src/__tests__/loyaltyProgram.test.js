import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  safeNumber,
  safeInt,
  getToday,
  calculateEarnedPoints,
  isDuplicateEarning,
  validateProgram,
  validateReward,
  isRewardAvailable,
  validateRedemption,
  validatePointAdjustment,
  canSubtractPoints,
  normalizeProgram,
  normalizeReward,
  searchMembers,
  filterMembers,
  sortMembers,
  searchRewards,
  sortRewards,
  calculateSummary,
  getTopMembers,
  getRecentActivity,
  paginate,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPoints,
  LEDGER_TYPES,
  LEDGER_TYPE_LABELS,
  MEMBER_FILTERS,
  MEMBER_SORT_OPTIONS,
  PAGE_SIZE,
} from '../sections/LoyaltyProgram/loyaltyUtils.js'

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

  it('returns 0 for non-numeric string', () => {
    assert.equal(safeNumber('abc'), 0)
  })

  it('parses numeric string', () => {
    assert.equal(safeNumber('1000'), 1000)
  })

  it('returns valid number', () => {
    assert.equal(safeNumber(130000), 130000)
  })
})

// ─── safeInt ───────────────────────────────────────────────────

describe('safeInt', () => {
  it('floors decimal', () => {
    assert.equal(safeInt(10.7), 10)
  })

  it('returns 0 for null', () => {
    assert.equal(safeInt(null), 0)
  })

  it('returns 0 for NaN', () => {
    assert.equal(safeInt(NaN), 0)
  })

  it('returns integer for valid input', () => {
    assert.equal(safeInt(100), 100)
  })
})

// ─── getToday ──────────────────────────────────────────────────

describe('getToday', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    const result = getToday()
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result))
  })

  it('returns today matching Date object', () => {
    const result = getToday()
    const expected = new Date().toISOString().slice(0, 10)
    assert.equal(result, expected)
  })
})

// ─── calculateEarnedPoints ─────────────────────────────────────

describe('calculateEarnedPoints', () => {
  const program = { min_transaction_amount: 10000, rule_amount: 10000, points_per_rule: 1 }

  it('basic calculation: floor(amount/rule) * points', () => {
    assert.equal(calculateEarnedPoints(50000, program), 5)
  })

  it('rounds down partial rules', () => {
    assert.equal(calculateEarnedPoints(49000, program), 4)
  })

  it('returns 0 for zero amount', () => {
    assert.equal(calculateEarnedPoints(0, program), 0)
  })

  it('returns 0 for negative amount', () => {
    assert.equal(calculateEarnedPoints(-5000, program), 0)
  })

  it('returns 0 for amount below min_transaction_amount', () => {
    assert.equal(calculateEarnedPoints(5000, program), 0)
  })

  it('returns 0 when rule_amount is 0', () => {
    assert.equal(calculateEarnedPoints(100000, { rule_amount: 0, points_per_rule: 1, min_transaction_amount: 0 }), 0)
  })

  it('returns 0 when points_per_rule is 0', () => {
    assert.equal(calculateEarnedPoints(100000, { rule_amount: 10000, points_per_rule: 0, min_transaction_amount: 0 }), 0)
  })

  it('handles NaN amount safely', () => {
    assert.equal(calculateEarnedPoints(NaN, program), 0)
  })

  it('handles Infinity amount safely', () => {
    assert.equal(calculateEarnedPoints(Infinity, program), 0)
  })
})

// ─── isDuplicateEarning ────────────────────────────────────────

describe('isDuplicateEarning', () => {
  const ledger = [
    { reference_type: 'sale', reference_id: 's1' },
    { reference_type: 'manual', reference_id: 'm1' },
  ]

  it('returns true when saleId exists in ledger', () => {
    assert.equal(isDuplicateEarning(ledger, 's1'), true)
  })

  it('returns false when saleId not in ledger', () => {
    assert.equal(isDuplicateEarning(ledger, 's2'), false)
  })

  it('returns false for empty ledger', () => {
    assert.equal(isDuplicateEarning([], 's1'), false)
  })

  it('returns false for falsy saleId', () => {
    assert.equal(isDuplicateEarning(ledger, null), false)
    assert.equal(isDuplicateEarning(ledger, ''), false)
  })

  it('ignores non-sale reference types', () => {
    assert.equal(isDuplicateEarning(ledger, 'm1'), false)
  })
})

// ─── validateProgram ───────────────────────────────────────────

describe('validateProgram', () => {
  it('valid program returns valid=true', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 10000, points_per_rule: 1, min_points_redeem: 100 })
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('empty name rejected', () => {
    const r = validateProgram({ name: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('whitespace-only name rejected', () => {
    const r = validateProgram({ name: '   ' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('rule_amount <= 0 rejected', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 0, points_per_rule: 1 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.rule_amount)
  })

  it('points_per_rule <= 0 rejected', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 10000, points_per_rule: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.points_per_rule)
  })

  it('negative min_points_redeem rejected', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 10000, points_per_rule: 1, min_points_redeem: -1 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.min_points_redeem)
  })

  it('points_expiry_days <= 0 rejected when provided', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 10000, points_per_rule: 1, min_points_redeem: 0, points_expiry_days: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.points_expiry_days)
  })

  it('null points_expiry_days is valid (no expiry)', () => {
    const r = validateProgram({ name: 'Test', rule_amount: 10000, points_per_rule: 1, min_points_redeem: 0, points_expiry_days: null })
    assert.equal(r.valid, true)
  })
})

// ─── validateReward ────────────────────────────────────────────

describe('validateReward', () => {
  it('valid reward returns valid=true', () => {
    const r = validateReward({ name: 'Free Coffee', points_required: 100 })
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('empty name rejected', () => {
    const r = validateReward({ name: '' })
    assert.equal(r.valid, false)
    assert.ok(r.errors.name)
  })

  it('points_required <= 0 rejected', () => {
    const r = validateReward({ name: 'R', points_required: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.points_required)
  })

  it('negative stock rejected', () => {
    const r = validateReward({ name: 'R', points_required: 100, stock: -1 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.stock)
  })

  it('null stock is valid (unlimited)', () => {
    assert.equal(validateReward({ name: 'R', points_required: 100, stock: null }).valid, true)
    assert.equal(validateReward({ name: 'R', points_required: 100, stock: undefined }).valid, true)
    assert.equal(validateReward({ name: 'R', points_required: 100, stock: '' }).valid, true)
  })
})

// ─── isRewardAvailable ─────────────────────────────────────────

describe('isRewardAvailable', () => {
  it('returns true for active reward with stock', () => {
    assert.equal(isRewardAvailable({ is_active: true, stock: 5 }), true)
  })

  it('returns false for null reward', () => {
    assert.equal(isRewardAvailable(null), false)
  })

  it('returns false when is_active is false', () => {
    assert.equal(isRewardAvailable({ is_active: false, stock: 5 }), false)
  })

  it('returns false when stock is 0', () => {
    assert.equal(isRewardAvailable({ is_active: true, stock: 0 }), false)
  })

  it('returns false when reward expired', () => {
    assert.equal(isRewardAvailable({ is_active: true, stock: 5, expiry_date: '2020-01-01' }), false)
  })
})

// ─── validateRedemption ────────────────────────────────────────

describe('validateRedemption', () => {
  const customer = { loyalty_points_balance: 500 }
  const reward = { is_active: true, stock: 5, points_required: 100 }
  const program = { min_points_redeem: 50 }

  it('valid redemption returns valid=true', () => {
    const r = validateRedemption(customer, reward, program)
    assert.equal(r.valid, true)
  })

  it('null customer rejected', () => {
    const r = validateRedemption(null, reward, program)
    assert.equal(r.valid, false)
    assert.ok(r.errors.customer)
  })

  it('null reward rejected', () => {
    const r = validateRedemption(customer, null, program)
    assert.equal(r.valid, false)
    assert.ok(r.errors.reward)
  })

  it('unavailable reward rejected', () => {
    const r = validateRedemption(customer, { is_active: false, stock: 5, points_required: 100 }, program)
    assert.equal(r.valid, false)
    assert.ok(r.errors.reward)
  })

  it('insufficient points rejected', () => {
    const r = validateRedemption({ loyalty_points_balance: 50 }, reward, program)
    assert.equal(r.valid, false)
    assert.ok(r.errors.points)
  })

  it('below min_points_redeem rejected', () => {
    const r = validateRedemption({ loyalty_points_balance: 30 }, { is_active: true, stock: 5, points_required: 10 }, { min_points_redeem: 50 })
    assert.equal(r.valid, false)
    assert.ok(r.errors.points)
  })
})

// ─── validatePointAdjustment ───────────────────────────────────

describe('validatePointAdjustment', () => {
  it('valid adjustment returns valid=true', () => {
    const r = validatePointAdjustment(100, 'Bonus', 500)
    assert.equal(r.valid, true)
    assert.deepEqual(r.errors, {})
  })

  it('zero points rejected', () => {
    const r = validatePointAdjustment(0, 'Reason', 500)
    assert.equal(r.valid, false)
    assert.ok(r.errors.amount)
  })

  it('empty reason rejected', () => {
    const r = validatePointAdjustment(100, '', 500)
    assert.equal(r.valid, false)
    assert.ok(r.errors.reason)
  })

  it('whitespace-only reason rejected', () => {
    const r = validatePointAdjustment(100, '   ', 500)
    assert.equal(r.valid, false)
    assert.ok(r.errors.reason)
  })

  it('null reason rejected', () => {
    const r = validatePointAdjustment(100, null, 500)
    assert.equal(r.valid, false)
    assert.ok(r.errors.reason)
  })
})

// ─── canSubtractPoints ─────────────────────────────────────────

describe('canSubtractPoints', () => {
  it('returns true when amount equals balance', () => {
    assert.equal(canSubtractPoints(100, 100), true)
  })

  it('returns true when amount < balance', () => {
    assert.equal(canSubtractPoints(50, 100), true)
  })

  it('returns false when amount > balance', () => {
    assert.equal(canSubtractPoints(150, 100), false)
  })

  it('handles NaN safely', () => {
    assert.equal(canSubtractPoints(NaN, 100), true)
    assert.equal(canSubtractPoints(100, NaN), false)
  })
})

// ─── normalizeProgram ──────────────────────────────────────────

describe('normalizeProgram', () => {
  it('returns null for null input', () => {
    assert.equal(normalizeProgram(null), null)
  })

  it('normalizes numeric fields', () => {
    const result = normalizeProgram({
      rule_amount: '10000',
      points_per_rule: '1',
      min_transaction_amount: '5000',
      min_points_redeem: '100',
      points_expiry_days: null,
    })
    assert.equal(result.rule_amount, 10000)
    assert.equal(result.points_per_rule, 1)
    assert.equal(result.min_transaction_amount, 5000)
    assert.equal(result.min_points_redeem, 100)
    assert.equal(result.points_expiry_days, null)
  })

  it('sets null points_expiry_days as null', () => {
    const result = normalizeProgram({ rule_amount: 10000, points_per_rule: 1, min_points_redeem: 0, points_expiry_days: null })
    assert.equal(result.points_expiry_days, null)
  })
})

// ─── normalizeReward ───────────────────────────────────────────

describe('normalizeReward', () => {
  it('returns null for null input', () => {
    assert.equal(normalizeReward(null), null)
  })

  it('normalizes points_required to int', () => {
    const result = normalizeReward({ points_required: '100', stock: null, is_active: true })
    assert.equal(result.points_required, 100)
    assert.equal(result.stock, null)
  })

  it('sets is_available flag', () => {
    const active = normalizeReward({ points_required: 100, stock: 5, is_active: true, expiry_date: null })
    assert.equal(active.is_available, true)

    const inactive = normalizeReward({ points_required: 100, stock: 5, is_active: false, expiry_date: null })
    assert.equal(inactive.is_available, false)
  })
})

// ─── searchMembers ─────────────────────────────────────────────

describe('searchMembers', () => {
  const members = [
    { id: '1', name: 'Budi', phone: '08123456789', email: 'budi@test.com' },
    { id: '2', name: 'Siti', phone: '08987654321', email: 'siti@test.com' },
    { id: '3', name: 'Andi', phone: '08111222333', email: 'andi@test.com' },
  ]

  it('returns all for empty/null query', () => {
    assert.equal(searchMembers(members, '').length, 3)
    assert.equal(searchMembers(members, null).length, 3)
    assert.equal(searchMembers(members, '   ').length, 3)
  })

  it('search by name', () => {
    assert.equal(searchMembers(members, 'Budi').length, 1)
    assert.equal(searchMembers(members, 'Budi')[0].id, '1')
  })

  it('search by phone', () => {
    assert.equal(searchMembers(members, '0898765').length, 1)
    assert.equal(searchMembers(members, '0898765')[0].id, '2')
  })

  it('search by email', () => {
    assert.equal(searchMembers(members, 'andi@test').length, 1)
    assert.equal(searchMembers(members, 'andi@test')[0].id, '3')
  })

  it('case insensitive', () => {
    assert.equal(searchMembers(members, 'budi').length, 1)
  })

  it('no match returns empty', () => {
    assert.equal(searchMembers(members, 'xyz').length, 0)
  })
})

// ─── filterMembers ─────────────────────────────────────────────

describe('filterMembers', () => {
  const members = [
    { id: '1', name: 'A', loyalty_is_member: true, total_transactions: 5, loyalty_points_balance: 200, loyalty_total_redeemed: 0 },
    { id: '2', name: 'B', loyalty_is_member: true, total_transactions: 0, loyalty_points_balance: 0, loyalty_total_redeemed: 0 },
    { id: '3', name: 'C', loyalty_is_member: false, total_transactions: 3, loyalty_points_balance: 50, loyalty_total_redeemed: 50 },
    { id: '4', name: 'D', loyalty_is_member: true, total_transactions: 10, loyalty_points_balance: 0, loyalty_total_redeemed: 200 },
  ]

  it('all filter returns everything', () => {
    assert.equal(filterMembers(members, 'all').length, 4)
  })

  it('active: is_member AND transactions > 0', () => {
    const result = filterMembers(members, 'active')
    assert.equal(result.length, 2)
    assert.ok(result.every(m => m.loyalty_is_member && m.total_transactions > 0))
  })

  it('inactive: not is_member OR transactions === 0', () => {
    const result = filterMembers(members, 'inactive')
    assert.equal(result.length, 2)
    assert.ok(result.every(m => !m.loyalty_is_member || m.total_transactions === 0))
  })

  it('has_points: points > 0', () => {
    const result = filterMembers(members, 'has_points')
    assert.equal(result.length, 2)
    assert.ok(result.every(m => m.loyalty_points_balance > 0))
  })

  it('never_redeemed: total_redeemed === 0', () => {
    const result = filterMembers(members, 'never_redeemed')
    assert.equal(result.length, 2)
    assert.ok(result.every(m => m.loyalty_total_redeemed === 0))
  })

  it('unknown filter key returns all', () => {
    assert.equal(filterMembers(members, 'unknown').length, 4)
  })
})

// ─── sortMembers ───────────────────────────────────────────────

describe('sortMembers', () => {
  const members = [
    { id: '1', name: 'Charlie', loyalty_points_balance: 100, total_spent: 500000, total_transactions: 3, created_at: '2024-01-01' },
    { id: '2', name: 'Alpha', loyalty_points_balance: 300, total_spent: 200000, total_transactions: 1, created_at: '2024-06-01' },
    { id: '3', name: 'Bravo', loyalty_points_balance: 200, total_spent: 800000, total_transactions: 5, created_at: '2024-03-01' },
  ]

  it('points_desc: highest points first', () => {
    const result = sortMembers(members, 'points_desc')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })

  it('spending_desc: highest spent first', () => {
    const result = sortMembers(members, 'spending_desc')
    assert.equal(result[0].id, '3')
    assert.equal(result[1].id, '1')
    assert.equal(result[2].id, '2')
  })

  it('transactions_desc: most transactions first', () => {
    const result = sortMembers(members, 'transactions_desc')
    assert.equal(result[0].id, '3')
    assert.equal(result[1].id, '1')
    assert.equal(result[2].id, '2')
  })

  it('newest: newest created_at first', () => {
    const result = sortMembers(members, 'newest')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })

  it('name_asc: alphabetical A-Z', () => {
    const result = sortMembers(members, 'name_asc')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })
})

// ─── searchRewards ─────────────────────────────────────────────

describe('searchRewards', () => {
  const rewards = [
    { id: '1', name: 'Free Coffee', description: 'Kopi gratis' },
    { id: '2', name: 'Discount 10%', description: 'Potongan harga' },
    { id: '3', name: 'Free Snack', description: 'Cemilan gratis' },
  ]

  it('returns all for empty/null query', () => {
    assert.equal(searchRewards(rewards, '').length, 3)
    assert.equal(searchRewards(rewards, null).length, 3)
  })

  it('search by name', () => {
    assert.equal(searchRewards(rewards, 'Coffee').length, 1)
    assert.equal(searchRewards(rewards, 'Coffee')[0].id, '1')
  })

  it('search by description', () => {
    assert.equal(searchRewards(rewards, 'Potongan').length, 1)
    assert.equal(searchRewards(rewards, 'Potongan')[0].id, '2')
  })

  it('case insensitive partial match', () => {
    const result = searchRewards(rewards, 'free')
    assert.equal(result.length, 2)
  })
})

// ─── sortRewards ───────────────────────────────────────────────

describe('sortRewards', () => {
  const rewards = [
    { id: '1', name: 'Z Reward', points_required: 300, created_at: '2024-01-01' },
    { id: '2', name: 'A Reward', points_required: 100, created_at: '2024-06-01' },
    { id: '3', name: 'M Reward', points_required: 200, created_at: '2024-03-01' },
  ]

  it('points_asc: lowest points first', () => {
    const result = sortRewards(rewards, 'points_asc')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })

  it('points_desc: highest points first', () => {
    const result = sortRewards(rewards, 'points_desc')
    assert.equal(result[0].id, '1')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '2')
  })

  it('newest first', () => {
    const result = sortRewards(rewards, 'newest')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })

  it('name_asc: alphabetical', () => {
    const result = sortRewards(rewards, 'name_asc')
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '3')
    assert.equal(result[2].id, '1')
  })
})

// ─── calculateSummary ──────────────────────────────────────────

describe('calculateSummary', () => {
  it('empty inputs return all zeros', () => {
    const s = calculateSummary([], [], [])
    assert.equal(s.totalMembers, 0)
    assert.equal(s.activeMembers, 0)
    assert.equal(s.totalPoints, 0)
    assert.equal(s.totalRedeemed, 0)
    assert.equal(s.availableRewards, 0)
  })

  it('counts members and active correctly', () => {
    const members = [
      { loyalty_is_member: true, total_transactions: 5, loyalty_points_balance: 0, loyalty_total_redeemed: 0 },
      { loyalty_is_member: true, total_transactions: 0, loyalty_points_balance: 0, loyalty_total_redeemed: 0 },
      { loyalty_is_member: false, total_transactions: 3, loyalty_points_balance: 0, loyalty_total_redeemed: 0 },
    ]
    const s = calculateSummary(members, [], [])
    assert.equal(s.totalMembers, 2)
    assert.equal(s.activeMembers, 1)
  })

  it('sums points and redeemed', () => {
    const members = [
      { loyalty_is_member: true, total_transactions: 1, loyalty_points_balance: 100, loyalty_total_redeemed: 50 },
      { loyalty_is_member: true, total_transactions: 1, loyalty_points_balance: 200, loyalty_total_redeemed: 30 },
    ]
    const s = calculateSummary(members, [], [])
    assert.equal(s.totalPoints, 300)
    assert.equal(s.totalRedeemed, 80)
  })

  it('counts available rewards', () => {
    const rewards = [
      { is_active: true, stock: 5, expiry_date: null },
      { is_active: true, stock: 3, expiry_date: null },
      { is_active: false, stock: 1, expiry_date: null },
    ]
    const s = calculateSummary([], rewards, [])
    assert.equal(s.availableRewards, 2)
  })
})

// ─── getTopMembers ─────────────────────────────────────────────

describe('getTopMembers', () => {
  const members = [
    { id: '1', loyalty_is_member: true, loyalty_points_balance: 100 },
    { id: '2', loyalty_is_member: true, loyalty_points_balance: 500 },
    { id: '3', loyalty_is_member: false, loyalty_points_balance: 300 },
    { id: '4', loyalty_is_member: true, loyalty_points_balance: 0 },
    { id: '5', loyalty_is_member: true, loyalty_points_balance: 200 },
  ]

  it('returns top members sorted by points desc', () => {
    const result = getTopMembers(members, 3)
    assert.equal(result.length, 3)
    assert.equal(result[0].id, '2')
    assert.equal(result[1].id, '5')
    assert.equal(result[2].id, '1')
  })

  it('filters out non-members and zero points', () => {
    const result = getTopMembers(members)
    assert.ok(result.every(m => m.loyalty_is_member && m.loyalty_points_balance > 0))
  })

  it('default limit is 5', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      loyalty_is_member: true,
      loyalty_points_balance: (i + 1) * 100,
    }))
    assert.equal(getTopMembers(many).length, 5)
  })
})

// ─── getRecentActivity ─────────────────────────────────────────

describe('getRecentActivity', () => {
  const ledger = [
    { id: '1', created_at: '2024-01-01' },
    { id: '2', created_at: '2024-06-01' },
    { id: '3', created_at: '2024-03-01' },
    { id: '4', created_at: '2024-09-01' },
    { id: '5', created_at: '2024-12-01' },
  ]

  it('returns entries sorted by created_at desc', () => {
    const result = getRecentActivity(ledger)
    assert.equal(result[0].id, '5')
    assert.equal(result[1].id, '4')
    assert.equal(result[2].id, '2')
  })

  it('default limit is 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}`,
    }))
    assert.equal(getRecentActivity(many).length, 10)
  })

  it('respects custom limit', () => {
    assert.equal(getRecentActivity(ledger, 3).length, 3)
  })
})

// ─── paginate ──────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i }))

  it('defaults to PAGE_SIZE (20)', () => {
    const result = paginate(items, 1)
    assert.equal(result.items.length, 20)
    assert.equal(result.totalPages, 3)
    assert.equal(result.total, 50)
  })

  it('page beyond total clamps to last', () => {
    const result = paginate(items, 999)
    assert.equal(result.currentPage, 3)
  })

  it('page 0 clamps to 1', () => {
    const result = paginate(items, 0)
    assert.equal(result.currentPage, 1)
  })

  it('empty array returns 1 page with 0 items', () => {
    const result = paginate([], 1)
    assert.equal(result.totalPages, 1)
    assert.equal(result.items.length, 0)
    assert.equal(result.total, 0)
  })

  it('custom pageSize works', () => {
    const result = paginate(items, 1, 10)
    assert.equal(result.items.length, 10)
    assert.equal(result.totalPages, 5)
  })
})

// ─── formatCurrency ────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats IDR currency', () => {
    const result = formatCurrency(130000)
    assert.ok(result.includes('130'))
    assert.ok(result.includes('000'))
  })

  it('handles null safely', () => {
    const result = formatCurrency(null)
    assert.ok(result.includes('0'))
  })

  it('handles NaN safely', () => {
    const result = formatCurrency(NaN)
    assert.ok(result.includes('0'))
  })
})

// ─── formatDate ────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns "-" for null', () => {
    assert.equal(formatDate(null), '-')
  })

  it('returns "-" for undefined', () => {
    assert.equal(formatDate(undefined), '-')
  })

  it('formats valid date string', () => {
    const result = formatDate('2024-06-15')
    assert.ok(result.includes('15'))
    assert.ok(result.includes('2024'))
  })
})

// ─── formatDateTime ────────────────────────────────────────────

describe('formatDateTime', () => {
  it('returns "-" for null', () => {
    assert.equal(formatDateTime(null), '-')
  })

  it('formats valid datetime string', () => {
    const result = formatDateTime('2024-06-15T10:30:00Z')
    assert.ok(result.includes('15'))
    assert.ok(result.includes('2024'))
  })
})

// ─── formatPoints ──────────────────────────────────────────────

describe('formatPoints', () => {
  it('formats integer points', () => {
    assert.equal(formatPoints(100), '100 poin')
  })

  it('floors decimal points', () => {
    assert.equal(formatPoints(100.7), '100 poin')
  })

  it('formats zero points', () => {
    assert.equal(formatPoints(0), '0 poin')
  })
})

// ─── constants ─────────────────────────────────────────────────

describe('constants', () => {
  it('LEDGER_TYPES has 5 entries', () => {
    assert.equal(Object.keys(LEDGER_TYPES).length, 5)
  })

  it('LEDGER_TYPE_LABELS has entry for each type', () => {
    for (const type of Object.values(LEDGER_TYPES)) {
      assert.ok(LEDGER_TYPE_LABELS[type], `Missing label for ${type}`)
    }
  })

  it('MEMBER_FILTERS has 5 entries', () => {
    assert.equal(MEMBER_FILTERS.length, 5)
  })

  it('MEMBER_SORT_OPTIONS has 5 entries', () => {
    assert.equal(MEMBER_SORT_OPTIONS.length, 5)
  })

  it('PAGE_SIZE is 20', () => {
    assert.equal(PAGE_SIZE, 20)
  })
})

// ─── edge cases / regression ───────────────────────────────────

describe('edge cases', () => {
  it('no NaN in calculateSummary pipeline', () => {
    const members = [
      { loyalty_is_member: true, total_transactions: 1, loyalty_points_balance: null, loyalty_total_redeemed: undefined },
      { loyalty_is_member: false, total_transactions: 0, loyalty_points_balance: NaN, loyalty_total_redeemed: NaN },
    ]
    const s = calculateSummary(members, [], [])
    assert.ok(Number.isFinite(s.totalMembers))
    assert.ok(Number.isFinite(s.activeMembers))
    assert.ok(Number.isFinite(s.totalPoints))
    assert.ok(Number.isFinite(s.totalRedeemed))
  })

  it('sortMembers does not mutate original array', () => {
    const original = [
      { id: '1', loyalty_points_balance: 100, total_spent: 500, total_transactions: 3, created_at: '2024-01-01', name: 'B' },
      { id: '2', loyalty_points_balance: 300, total_spent: 200, total_transactions: 1, created_at: '2024-06-01', name: 'A' },
    ]
    const snapshot = original.map(m => ({ ...m }))
    sortMembers(original, 'points_desc')
    assert.deepEqual(original, snapshot)
  })

  it('sortRewards does not mutate original array', () => {
    const original = [
      { id: '1', points_required: 300, created_at: '2024-01-01', name: 'Z' },
      { id: '2', points_required: 100, created_at: '2024-06-01', name: 'A' },
    ]
    const snapshot = original.map(r => ({ ...r }))
    sortRewards(original, 'points_asc')
    assert.deepEqual(original, snapshot)
  })

  it('searchMembers with special regex characters does not crash', () => {
    const members = [{ name: 'Test', phone: '+628123', email: 'test@test.com' }]
    assert.doesNotThrow(() => searchMembers(members, '[test]'))
    assert.doesNotThrow(() => searchMembers(members, '+62'))
  })

  it('calculateEarnedPoints with large numbers does not overflow', () => {
    const program = { min_transaction_amount: 1, rule_amount: 1, points_per_rule: 1 }
    const result = calculateEarnedPoints(Number.MAX_SAFE_INTEGER, program)
    assert.ok(Number.isFinite(result))
  })
})
