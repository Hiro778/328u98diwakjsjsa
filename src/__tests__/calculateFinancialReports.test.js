import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPeriodRange,
  formatDateID,
  calculateRevenueSummary,
  calculateExpenseBreakdown,
  calculateRevenueTrend,
  calculateExpenseTrend,
  calculateCOGS,
  calculateProductPerformance,
  calculatePeriodComparison,
  calculateProfitLoss,
  generateInsights,
  PERIOD_PRESETS,
} from '../sections/FinancialReports/calculateFinancialReports.js'

// ─── TEST 1: Period range ────────────────────────────────────

describe('TEST 1: period range - this_month', () => {
  it('returns valid start and end dates', () => {
    const { start, end } = getPeriodRange('this_month')
    assert.ok(start instanceof Date)
    assert.ok(end instanceof Date)
    assert.ok(start <= end)
    assert.equal(start.getDate(), 1)
  })
})

// ─── TEST 2: Period range - custom ──────────────────────────

describe('TEST 2: period range - custom', () => {
  it('uses provided dates', () => {
    const { start, end } = getPeriodRange('custom', '2026-01-15', '2026-02-20')
    assert.equal(start.getFullYear(), 2026)
    assert.equal(start.getMonth(), 0) // January
    assert.equal(start.getDate(), 15)
    assert.equal(end.getFullYear(), 2026)
    assert.equal(end.getMonth(), 1) // February
    assert.equal(end.getDate(), 20)
  })
})

// ─── TEST 3: Revenue summary from sales ─────────────────────

describe('TEST 3: revenue summary', () => {
  it('calculates total, count, average', () => {
    const r = calculateRevenueSummary([
      { total: 100000, quantity: 5 },
      { total: 200000, quantity: 3 },
      { total: 50000, quantity: 2 },
    ])
    assert.equal(r.totalRevenue, 350000)
    assert.equal(r.totalTransactions, 3)
    assert.ok(Math.abs(r.averageTransactionValue - 116666.67) < 0.1)
    assert.equal(r.totalUnitsSold, 10)
    assert.equal(r.hasData, true)
  })
})

// ─── TEST 4: Revenue summary empty ──────────────────────────

describe('TEST 4: revenue summary - empty', () => {
  it('returns zeros and hasData=false', () => {
    const r = calculateRevenueSummary([])
    assert.equal(r.totalRevenue, 0)
    assert.equal(r.totalTransactions, 0)
    assert.equal(r.hasData, false)
  })
})

// ─── TEST 5: Expense breakdown ──────────────────────────────

describe('TEST 5: expense breakdown', () => {
  it('groups by category, sorted by amount', () => {
    const r = calculateExpenseBreakdown([
      { category: 'Sewa', amount: 5000000 },
      { category: 'Gaji', amount: 3000000 },
      { category: 'Utilitas', amount: 1000000 },
    ])
    assert.equal(r.totalExpenses, 9000000)
    assert.equal(r.categories.length, 3)
    assert.equal(r.categories[0].name, 'Sewa')
    assert.equal(r.categories[0].amount, 5000000)
    assert.ok(Math.abs(r.categories[0].percent - 55.56) < 0.1)
    assert.equal(r.hasData, true)
  })
})

// ─── TEST 6: Expense breakdown empty ────────────────────────

describe('TEST 6: expense breakdown - empty', () => {
  it('returns zeros', () => {
    const r = calculateExpenseBreakdown([])
    assert.equal(r.totalExpenses, 0)
    assert.equal(r.categories.length, 0)
    assert.equal(r.hasData, false)
  })
})

// ─── TEST 7: COGS from HPP ─────────────────────────────────

describe('TEST 7: COGS from HPP data', () => {
  it('calculates cogs and gross profit', () => {
    const sales = [
      { product_id: 'p1', quantity: 10, total: 200000 },
      { product_id: 'p2', quantity: 5, total: 150000 },
    ]
    const hpp = [
      { product_id: 'p1', hpp_per_unit: 8000 },
      { product_id: 'p2', hpp_per_unit: 20000 },
    ]
    const r = calculateCOGS(sales, hpp)
    // COGS = 10*8000 + 5*20000 = 80000 + 100000 = 180000
    assert.equal(r.cogs, 180000)
    assert.equal(r.grossProfit, 170000) // 350000 - 180000
    assert.equal(r.hasReliableCOGS, true)
  })
})

// ─── TEST 8: COGS without HPP ──────────────────────────────

describe('TEST 8: COGS without HPP data', () => {
  it('reports no reliable COGS', () => {
    const sales = [
      { product_id: 'p1', quantity: 10, total: 200000 },
    ]
    const r = calculateCOGS(sales, [])
    assert.equal(r.cogs, 0)
    assert.equal(r.hasReliableCOGS, false)
  })
})

// ─── TEST 9: COGS empty sales ──────────────────────────────

describe('TEST 9: COGS - empty sales', () => {
  it('returns no data', () => {
    const r = calculateCOGS([], [{ product_id: 'p1', hpp_per_unit: 5000 }])
    assert.equal(r.hasData, false)
  })
})

// ─── TEST 10: Product performance ──────────────────────────

describe('TEST 10: product performance', () => {
  it('ranks by revenue, includes COGS when available', () => {
    const sales = [
      { product_id: 'p1', product_name: 'Kopi', quantity: 20, total: 400000 },
      { product_id: 'p2', product_name: 'Teh', quantity: 10, total: 200000 },
      { product_id: 'p3', product_name: 'Jus', quantity: 5, total: 150000 },
    ]
    const hpp = [
      { product_id: 'p1', hpp_per_unit: 8000 },
      { product_id: 'p3', hpp_per_unit: 15000 },
    ]
    const r = calculateProductPerformance(sales, hpp, 5)
    assert.equal(r.length, 3)
    assert.equal(r[0].productName, 'Kopi')
    assert.equal(r[0].revenue, 400000)
    assert.equal(r[0].estimatedProfit, 240000) // 400k - 20*8k
    assert.equal(r[1].productName, 'Teh')
    assert.equal(r[1].estimatedProfit, null) // no HPP
    assert.equal(r[2].productName, 'Jus')
    assert.equal(r[2].estimatedProfit, 75000) // 150k - 5*15k
  })
})

// ─── TEST 11: Period comparison ────────────────────────────

describe('TEST 11: period comparison', () => {
  it('calculates change percentages', () => {
    const r = calculatePeriodComparison(
      { revenue: 5000000, expenses: 2000000, grossProfit: 3000000, netProfit: 1000000 },
      { revenue: 4000000, expenses: 1500000, grossProfit: 2500000, netProfit: 500000 },
    )
    assert.equal(r.revenue.changePercent, 25)
    assert.ok(Math.abs(r.expenses.changePercent - 33.33) < 0.1)
    assert.equal(r.grossProfit.changePercent, 20)
    assert.equal(r.netProfit.changePercent, 100)
  })
})

// ─── TEST 12: Period comparison - previous zero ────────────

describe('TEST 12: period comparison - previous zero', () => {
  it('returns null instead of Infinity', () => {
    const r = calculatePeriodComparison(
      { revenue: 5000000, expenses: 2000000, grossProfit: 3000000, netProfit: 1000000 },
      { revenue: 0, expenses: 0, grossProfit: 0, netProfit: 0 },
    )
    assert.equal(r.revenue.changePercent, null)
    assert.equal(r.expenses.changePercent, null)
  })
})

// ─── TEST 13: P&L with COGS ────────────────────────────────

describe('TEST 13: P&L with reliable COGS', () => {
  it('shows gross profit and margins', () => {
    const r = calculateProfitLoss({
      revenue: 10000000,
      cogs: 4000000,
      hasReliableCOGS: true,
      totalExpenses: 3000000,
    })
    assert.equal(r.revenue, 10000000)
    assert.equal(r.cogs, 4000000)
    assert.equal(r.grossProfit, 6000000)
    assert.equal(r.totalExpenses, 3000000)
    assert.equal(r.estimatedProfit, 3000000)
    assert.equal(r.grossMarginPercent, 60)
    assert.equal(r.netMarginPercent, 30)
  })
})

// ─── TEST 14: P&L without COGS ─────────────────────────────

describe('TEST 14: P&L without reliable COGS', () => {
  it('gross profit is null', () => {
    const r = calculateProfitLoss({
      revenue: 10000000,
      cogs: 0,
      hasReliableCOGS: false,
      totalExpenses: 3000000,
    })
    assert.equal(r.grossProfit, null)
    assert.equal(r.grossMarginPercent, null)
    assert.equal(r.estimatedProfit, 7000000)
    assert.equal(r.netMarginPercent, 70)
  })
})

// ─── TEST 15: Insights ─────────────────────────────────────

describe('TEST 15: insights generation', () => {
  it('generates meaningful insights', () => {
    const insights = generateInsights({
      revenueSummary: { hasData: true, totalRevenue: 5000000 },
      expenseBreakdown: {
        hasData: true,
        categories: [{ name: 'Sewa', amount: 3000000, percent: 60 }],
      },
      profitLoss: { hasReliableCOGS: false, netMarginPercent: 20 },
      comparison: {
        revenue: { changePercent: 15 },
        expenses: { changePercent: -5 },
      },
    })
    assert.ok(insights.length > 0)
    assert.ok(insights.some(i => i.includes('meningkat')))
    assert.ok(insights.some(i => i.includes('Sewa')))
    assert.ok(insights.some(i => i.toLowerCase().includes('margin')))
  })
})

// ─── TEST 16: Insights - no data ───────────────────────────

describe('TEST 16: insights - no data', () => {
  it('returns empty data message', () => {
    const insights = generateInsights({
      revenueSummary: { hasData: false },
      expenseBreakdown: { hasData: false },
      profitLoss: {},
      comparison: {},
    })
    assert.equal(insights.length, 1)
    assert.ok(insights[0].includes('Belum ada data'))
  })
})

// ─── TEST 17: Empty sales array ────────────────────────────

describe('TEST 17: product performance - empty sales', () => {
  it('returns empty array', () => {
    const r = calculateProductPerformance([], [])
    assert.equal(r.length, 0)
  })
})

// ─── TEST 18: Revenue trend ────────────────────────────────

describe('TEST 18: revenue trend by day', () => {
  it('groups sales by day', () => {
    const sales = [
      { total: 100000, sale_date: '2026-03-01' },
      { total: 200000, sale_date: '2026-03-01' },
      { total: 150000, sale_date: '2026-03-02' },
    ]
    const trend = calculateRevenueTrend(sales, 'day')
    assert.equal(trend.length, 2)
    assert.equal(trend[0].revenue, 300000)
    assert.equal(trend[1].revenue, 150000)
  })
})

// ─── TEST 19: Expense trend ────────────────────────────────

describe('TEST 19: expense trend by month', () => {
  it('groups expenses by month', () => {
    const expenses = [
      { amount: 1000000, expense_date: '2026-01-15' },
      { amount: 500000, expense_date: '2026-01-20' },
      { amount: 2000000, expense_date: '2026-02-10' },
    ]
    const trend = calculateExpenseTrend(expenses, 'month')
    assert.equal(trend.length, 2)
    assert.equal(trend[0].expenses, 1500000)
    assert.equal(trend[1].expenses, 2000000)
  })
})

// ─── TEST 20: NaN safety ───────────────────────────────────

describe('TEST 20: NaN in sales data', () => {
  it('handles NaN gracefully', () => {
    const sales = [
      { total: NaN, quantity: 5 },
      { total: 100000, quantity: NaN },
    ]
    const r = calculateRevenueSummary(sales)
    assert.equal(r.totalRevenue, 100000)
    assert.equal(r.totalUnitsSold, 5)
    assert.ok(Number.isFinite(r.totalRevenue))
    assert.ok(!Number.isNaN(r.averageTransactionValue))
  })
})

// ─── TEST 21: Infinity safety ──────────────────────────────

describe('TEST 21: Infinity in expense data', () => {
  it('handles Infinity gracefully', () => {
    const expenses = [
      { category: 'Test', amount: Infinity },
      { category: 'Valid', amount: 500000 },
    ]
    const r = calculateExpenseBreakdown(expenses)
    assert.equal(r.totalExpenses, 500000)
    assert.ok(Number.isFinite(r.totalExpenses))
  })
})

// ─── TEST 22: Large values ─────────────────────────────────

describe('TEST 22: large values', () => {
  it('handles large monetary values', () => {
    const sales = [{ total: 9999999999999, quantity: 1 }]
    const r = calculateRevenueSummary(sales)
    assert.equal(r.totalRevenue, 9999999999999)
    assert.ok(Number.isFinite(r.totalRevenue))
  })
})

// ─── TEST 23: Decimal values ───────────────────────────────

describe('TEST 23: decimal values', () => {
  it('rounds correctly', () => {
    const sales = [
      { total: 100000.50, quantity: 1 },
      { total: 200000.75, quantity: 1 },
    ]
    const r = calculateRevenueSummary(sales)
    assert.equal(r.totalRevenue, 300001.25)
    assert.equal(r.averageTransactionValue, 150000.63)
  })
})

// ─── TEST 24: Missing/undefined fields ─────────────────────

describe('TEST 24: missing fields in sales', () => {
  it('handles undefined fields safely', () => {
    const sales = [
      { total: undefined, quantity: undefined },
      { total: 50000, quantity: 3 },
    ]
    const r = calculateRevenueSummary(sales)
    assert.equal(r.totalRevenue, 50000)
    assert.equal(r.totalUnitsSold, 3)
  })
})

// ─── TEST 25: Expense category empty string ─────────────────

describe('TEST 25: expense with empty category', () => {
  it('defaults to Lainnya', () => {
    const r = calculateExpenseBreakdown([
      { category: '', amount: 100000 },
      { category: null, amount: 50000 },
    ])
    assert.equal(r.categories.length, 1)
    assert.equal(r.categories[0].name, 'Lainnya')
    assert.equal(r.categories[0].amount, 150000)
  })
})

// ─── TEST 26: Expense percent = 0 when total = 0 ───────────

describe('TEST 26: expense percent safety', () => {
  it('no NaN when total is zero', () => {
    const r = calculateExpenseBreakdown([])
    assert.equal(r.totalExpenses, 0)
    assert.ok(Number.isFinite(r.totalExpenses))
  })
})

// ─── TEST 27: Product limit ────────────────────────────────

describe('TEST 27: product performance limit', () => {
  it('returns only top N', () => {
    const sales = Array.from({ length: 20 }, (_, i) => ({
      product_id: `p${i}`,
      product_name: `Product ${i}`,
      quantity: 1,
      total: (20 - i) * 10000,
    }))
    const r = calculateProductPerformance(sales, [], 5)
    assert.equal(r.length, 5)
    assert.equal(r[0].revenue, 200000) // highest
  })
})

// ─── TEST 28: Comparison with null previous ─────────────────

describe('TEST 28: comparison with null/missing data', () => {
  it('handles missing previous period', () => {
    const r = calculatePeriodComparison(
      { revenue: 5000000, expenses: 2000000, grossProfit: 3000000, netProfit: 1000000 },
      null
    )
    assert.equal(r.revenue.previous, 0)
    assert.equal(r.revenue.changePercent, null)
  })
})

// ─── TEST 29: Insights - loss ──────────────────────────────

describe('TEST 29: insights - business loss', () => {
  it('detects loss', () => {
    const insights = generateInsights({
      revenueSummary: { hasData: true },
      expenseBreakdown: { hasData: true, categories: [] },
      profitLoss: { hasReliableCOGS: false, netMarginPercent: -15 },
      comparison: { revenue: { changePercent: null }, expenses: { changePercent: null } },
    })
    assert.ok(insights.some(i => i.includes('rugi')))
  })
})

// ─── TEST 30: Insights - COGS limitation ───────────────────

describe('TEST 30: insights - COGS limitation', () => {
  it('reports COGS limitation', () => {
    const insights = generateInsights({
      revenueSummary: { hasData: true },
      expenseBreakdown: { hasData: true, categories: [] },
      profitLoss: { hasReliableCOGS: false, netMarginPercent: 10 },
      comparison: { revenue: { changePercent: null }, expenses: { changePercent: null } },
    })
    assert.ok(insights.some(i => i.includes('HPP') || i.includes('laba kotor')))
  })
})

// ─── TEST 31: formatDateID ─────────────────────────────────

describe('TEST 31: formatDateID', () => {
  it('formats date in Indonesian', () => {
    const result = formatDateID('2026-03-15')
    assert.ok(result.includes('2026'))
    assert.ok(typeof result === 'string')
  })
})

// ─── TEST 32: No NaN in any output ─────────────────────────

describe('TEST 32: no NaN in any output', () => {
  it('all outputs are finite', () => {
    const sales = [{ total: 100000, quantity: 5 }]
    const expenses = [{ category: 'Test', amount: 50000 }]
    const hpp = [{ product_id: 'p1', hpp_per_unit: 8000 }]

    const rev = calculateRevenueSummary(sales)
    const exp = calculateExpenseBreakdown(expenses)
    const cogs = calculateCOGS(sales, hpp)
    const prods = calculateProductPerformance(sales, hpp)
    const pnl = calculateProfitLoss({ revenue: rev.totalRevenue, cogs: cogs.cogs, hasReliableCOGS: true, totalExpenses: exp.totalExpenses })

    assert.ok(Number.isFinite(rev.totalRevenue))
    assert.ok(Number.isFinite(rev.averageTransactionValue))
    assert.ok(Number.isFinite(exp.totalExpenses))
    assert.ok(Number.isFinite(cogs.cogs))
    assert.ok(Number.isFinite(cogs.grossProfit))
    assert.ok(Number.isFinite(pnl.grossMarginPercent))
    assert.ok(Number.isFinite(pnl.netMarginPercent))

    for (const p of prods) {
      assert.ok(Number.isFinite(p.revenue))
    }
  })
})
