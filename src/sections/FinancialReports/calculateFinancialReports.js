/**
 * Financial Reports Calculation Engine
 *
 * Pure functions — no side effects, no Supabase, no React.
 * Aggregates existing sales, expenses, products, and HPP data
 * into financial report metrics.
 */

const round2 = (n) => Math.round(n * 100) / 100

// ─── Period Utilities ─────────────────────────────────────────

export const PERIOD_PRESETS = {
  this_month: { label: 'Bulan Ini' },
  last_month: { label: 'Bulan Lalu' },
  last_3_months: { label: '3 Bulan Terakhir' },
  last_6_months: { label: '6 Bulan Terakhir' },
  this_year: { label: 'Tahun Ini' },
  custom: { label: 'Custom' },
}

/**
 * Get date range for a period preset.
 * All dates are in local timezone (no UTC offset bugs).
 */
export function getPeriodRange(preset, customStart, customEnd) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  let start, end

  switch (preset) {
    case 'this_month':
      start = new Date(year, month, 1)
      end = new Date(year, month + 1, 0)
      break
    case 'last_month':
      start = new Date(year, month - 1, 1)
      end = new Date(year, month, 0)
      break
    case 'last_3_months':
      start = new Date(year, month - 2, 1)
      end = new Date(year, month + 1, 0)
      break
    case 'last_6_months':
      start = new Date(year, month - 5, 1)
      end = new Date(year, month + 1, 0)
      break
    case 'this_year':
      start = new Date(year, 0, 1)
      end = new Date(year, 11, 31)
      break
    case 'custom':
      start = customStart ? new Date(customStart) : new Date(year, month, 1)
      end = customEnd ? new Date(customEnd) : new Date()
      break
    default:
      start = new Date(year, month, 1)
      end = new Date(year, month + 1, 0)
  }

  // Normalize to start/end of day in local time
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

/**
 * Format date for display: "01 Jan 2026"
 */
export function formatDateID(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Safe Math ────────────────────────────────────────────────

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function safePercent(num, denom) {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom === 0) return null
  return round2((num / denom) * 100)
}

function safeChangePercent(current, previous) {
  const c = safeNum(current)
  const p = safeNum(previous)
  if (p === 0) return null
  return round2(((c - p) / Math.abs(p)) * 100)
}

// ─── Revenue Summary ──────────────────────────────────────────

/**
 * Calculate revenue summary from sales data.
 *
 * @param {Array} sales - [{ total, quantity, unit_price, sale_date, product_id }]
 * @returns {Object} revenue summary
 */
export function calculateRevenueSummary(sales) {
  if (!Array.isArray(sales) || sales.length === 0) {
    return {
      totalRevenue: 0,
      totalTransactions: 0,
      averageTransactionValue: 0,
      totalUnitsSold: 0,
      hasData: false,
    }
  }

  let totalRevenue = 0
  let totalUnitsSold = 0

  for (const sale of sales) {
    totalRevenue += safeNum(sale.total)
    totalUnitsSold += safeNum(sale.quantity)
  }

  totalRevenue = round2(totalRevenue)

  return {
    totalRevenue,
    totalTransactions: sales.length,
    averageTransactionValue: sales.length > 0 ? round2(totalRevenue / sales.length) : 0,
    totalUnitsSold,
    hasData: true,
  }
}

// ─── Expense Breakdown ────────────────────────────────────────

/**
 * Calculate expense breakdown by category.
 *
 * @param {Array} expenses - [{ category, amount, expense_date }]
 * @returns {Object} expense summary
 */
export function calculateExpenseBreakdown(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    return {
      totalExpenses: 0,
      categories: [],
      hasData: false,
    }
  }

  const categoryMap = {}
  let totalExpenses = 0

  for (const exp of expenses) {
    const amt = safeNum(exp.amount)
    totalExpenses += amt
    const cat = exp.category || 'Lainnya'
    categoryMap[cat] = (categoryMap[cat] || 0) + amt
  }

  totalExpenses = round2(totalExpenses)

  const categories = Object.entries(categoryMap)
    .map(([name, amount]) => ({
      name,
      amount: round2(amount),
      percent: safePercent(amount, totalExpenses),
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    totalExpenses,
    categories,
    hasData: true,
  }
}

// ─── Revenue Trend ────────────────────────────────────────────

/**
 * Calculate revenue trend (grouped by day or month).
 *
 * @param {Array} sales - [{ total, sale_date }]
 * @param {string} groupBy - 'day' | 'month'
 * @returns {Array} [{ label, revenue }]
 */
export function calculateRevenueTrend(sales, groupBy = 'day') {
  if (!Array.isArray(sales) || sales.length === 0) return []

  const map = {}

  for (const sale of sales) {
    const date = new Date(sale.sale_date)
    let key
    if (groupBy === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    map[key] = (map[key] || 0) + safeNum(sale.total)
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => ({
      label: key,
      revenue: round2(revenue),
    }))
}

// ─── Expense Trend ────────────────────────────────────────────

/**
 * Calculate expense trend.
 *
 * @param {Array} expenses - [{ amount, expense_date }]
 * @param {string} groupBy - 'day' | 'month'
 * @returns {Array} [{ label, expenses }]
 */
export function calculateExpenseTrend(expenses, groupBy = 'day') {
  if (!Array.isArray(expenses) || expenses.length === 0) return []

  const map = {}

  for (const exp of expenses) {
    const date = new Date(exp.expense_date)
    let key
    if (groupBy === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    map[key] = (map[key] || 0) + safeNum(exp.amount)
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, expenses]) => ({
      label: key,
      expenses: round2(expenses),
    }))
}

// ─── COGS / Gross Profit ──────────────────────────────────────

/**
 * Calculate COGS from sales and product HPP data.
 *
 * @param {Array} sales - [{ product_id, quantity, total }]
 * @param {Array} hppData - [{ product_id, hpp_per_unit }] (latest HPP per product)
 * @returns {Object} COGS and gross profit
 */
export function calculateCOGS(sales, hppData) {
  if (!Array.isArray(sales) || sales.length === 0) {
    return { cogs: 0, grossProfit: 0, hasData: false, hasReliableCOGS: false }
  }

  // Build HPP lookup: product_id → latest hpp_per_unit
  const hppMap = {}
  if (Array.isArray(hppData)) {
    for (const h of hppData) {
      if (h.product_id && h.hpp_per_unit > 0) {
        hppMap[h.product_id] = safeNum(h.hpp_per_unit)
      }
    }
  }

  let totalCOGS = 0
  let hasAnyCOGS = false
  let totalRevenue = 0

  for (const sale of sales) {
    totalRevenue += safeNum(sale.total)
    if (sale.product_id && hppMap[sale.product_id]) {
      totalCOGS += hppMap[sale.product_id] * safeNum(sale.quantity)
      hasAnyCOGS = true
    }
  }

  return {
    cogs: round2(totalCOGS),
    grossProfit: round2(totalRevenue - totalCOGS),
    hasData: true,
    hasReliableCOGS: hasAnyCOGS,
  }
}

// ─── Product Performance ──────────────────────────────────────

/**
 * Calculate top products by revenue.
 *
 * @param {Array} sales - [{ product_id, product_name, quantity, total }]
 * @param {Array} hppData - [{ product_id, hpp_per_unit }]
 * @param {number} limit - top N products
 * @returns {Array} [{ product_id, productName, quantity, revenue, estimatedProfit, hasCOGS }]
 */
export function calculateProductPerformance(sales, hppData, limit = 10) {
  if (!Array.isArray(sales) || sales.length === 0) return []

  const hppMap = {}
  if (Array.isArray(hppData)) {
    for (const h of hppData) {
      if (h.product_id && h.hpp_per_unit > 0) {
        hppMap[h.product_id] = safeNum(h.hpp_per_unit)
      }
    }
  }

  const productMap = {}

  for (const sale of sales) {
    const pid = sale.product_id || 'unknown'
    if (!productMap[pid]) {
      productMap[pid] = {
        product_id: pid,
        productName: sale.product_name || sale.product_id || 'Tanpa Nama',
        quantity: 0,
        revenue: 0,
        cogs: 0,
        hasCOGS: false,
      }
    }
    productMap[pid].quantity += safeNum(sale.quantity)
    productMap[pid].revenue += safeNum(sale.total)
    if (hppMap[pid]) {
      productMap[pid].cogs += hppMap[pid] * safeNum(sale.quantity)
      productMap[pid].hasCOGS = true
    }
  }

  return Object.values(productMap)
    .map(p => ({
      ...p,
      revenue: round2(p.revenue),
      cogs: round2(p.cogs),
      estimatedProfit: p.hasCOGS ? round2(p.revenue - p.cogs) : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

// ─── Period Comparison ────────────────────────────────────────

/**
 * Compare current period vs previous period.
 *
 * @param {Object} current - { revenue, expenses, grossProfit, netProfit }
 * @param {Object} previous - { revenue, expenses, grossProfit, netProfit }
 * @returns {Object} comparison with change percentages
 */
export function calculatePeriodComparison(current, previous) {
  const c = current || {}
  const p = previous || {}

  return {
    revenue: {
      current: safeNum(c.revenue),
      previous: safeNum(p.revenue),
      changePercent: safeChangePercent(c.revenue, p.revenue),
    },
    expenses: {
      current: safeNum(c.expenses),
      previous: safeNum(p.expenses),
      changePercent: safeChangePercent(c.expenses, p.expenses),
    },
    grossProfit: {
      current: safeNum(c.grossProfit),
      previous: safeNum(p.grossProfit),
      changePercent: safeChangePercent(c.grossProfit, p.grossProfit),
    },
    netProfit: {
      current: safeNum(c.netProfit),
      previous: safeNum(p.netProfit),
      changePercent: safeChangePercent(c.netProfit, p.netProfit),
    },
  }
}

// ─── Profit & Loss ────────────────────────────────────────────

/**
 * Calculate P&L from aggregated data.
 *
 * @param {Object} input
 * @param {number} input.revenue
 * @param {number} input.cogs
 * @param {boolean} input.hasReliableCOGS
 * @param {number} input.totalExpenses
 * @returns {Object} P&L summary
 */
export function calculateProfitLoss({ revenue = 0, cogs = 0, hasReliableCOGS = false, totalExpenses = 0 }) {
  const rev = safeNum(revenue)
  const cost = safeNum(cogs)
  const exp = safeNum(totalExpenses)

  const grossProfit = hasReliableCOGS ? round2(rev - cost) : null
  const estimatedProfit = round2(rev - cost - exp)

  return {
    revenue: round2(rev),
    cogs: round2(cost),
    hasReliableCOGS,
    grossProfit,
    totalExpenses: round2(exp),
    estimatedProfit,
    grossMarginPercent: hasReliableCOGS ? safePercent(grossProfit, rev) : null,
    netMarginPercent: safePercent(estimatedProfit, rev),
  }
}

// ─── Insights ─────────────────────────────────────────────────

/**
 * Generate deterministic insights from report data.
 *
 * @param {Object} data
 * @returns {Array<string>} insights
 */
export function generateInsights({ revenueSummary, expenseBreakdown, profitLoss, comparison }) {
  const insights = []

  if (!revenueSummary?.hasData && !expenseBreakdown?.hasData) {
    return ['Belum ada data keuangan untuk periode yang dipilih.']
  }

  // Revenue trend
  if (comparison?.revenue?.changePercent !== null) {
    const pct = comparison.revenue.changePercent
    if (pct > 0) {
      insights.push(`Revenue meningkat ${pct}% dibanding periode sebelumnya.`)
    } else if (pct < 0) {
      insights.push(`Revenue menurun ${Math.abs(pct)}% dibanding periode sebelumnya.`)
    } else {
      insights.push('Revenue stabil dibanding periode sebelumnya.')
    }
  }

  // Top expense
  if (expenseBreakdown?.categories?.length > 0) {
    const top = expenseBreakdown.categories[0]
    insights.push(`Pengeluaran terbesar berasal dari kategori "${top.name}" (${top.percent}% dari total).`)
  }

  // Margin
  if (profitLoss?.netMarginPercent !== null) {
    const margin = profitLoss.netMarginPercent
    if (margin < 0) {
      insights.push(`Bisnis mengalami rugi pada periode ini (margin: ${margin}%).`)
    } else {
      insights.push(`Margin bersih berada di ${margin}%.`)
    }
  }

  // COGS limitation
  if (!profitLoss?.hasReliableCOGS && revenueSummary?.hasData) {
    insights.push('Data HPP belum cukup untuk menghitung laba kotor secara akurat.')
  }

  // Expense trend
  if (comparison?.expenses?.changePercent !== null) {
    const pct = comparison.expenses.changePercent
    if (pct > 20) {
      insights.push(`Pengeluaran naik ${pct}% — perlu diperhatikan.`)
    }
  }

  return insights.length > 0 ? insights : ['Data belum cukup untuk menghasilkan insight.']
}
