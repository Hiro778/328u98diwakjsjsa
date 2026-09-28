/**
 * Analytics Service
 *
 * All analytics queries against Supabase.
 * Every function is scoped to the authenticated user's business via RLS.
 *
 * Timezone: WIB (Asia/Jakarta, UTC+7) used for all date calculations.
 * The database stores dates in UTC; we convert to WIB for display/filtering.
 */

import { supabase } from './supabase.js'
import {
  fetchCanonicalOrders,
  aggregateSalesMetrics,
  getWibDateString,
  WIB_OFFSET_MS,
} from '../services/canonicalSalesService.js'

/**
 * Get current WIB date as YYYY-MM-DD string
 */
export function todayWIB() {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  return wib.toISOString().slice(0, 10)
}

/**
 * Get start of current week in WIB (Monday).
 * Returns { start, end } as YYYY-MM-DD strings in WIB.
 */
export function currentWeekWIB() {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const day = wib.getUTCDay() // 0=Sun, 1=Mon...
  const diffToMonday = day === 0 ? 6 : day - 1
  const start = new Date(wib)
  start.setUTCDate(wib.getUTCDate() - diffToMonday)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  end.setUTCHours(23, 59, 59, 999)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

/**
 * Get previous week in WIB.
 * Returns { start, end } as YYYY-MM-DD strings in WIB.
 */
export function previousWeekWIB() {
  const cw = currentWeekWIB()
  const start = new Date(cw.start + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - 7)
  const end = new Date(cw.start + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() - 1)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

/**
 * Get current month range in WIB.
 * Returns { start, end } as YYYY-MM-DD strings.
 */
export function currentMonthWIB() {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const year = wib.getUTCFullYear()
  const month = wib.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

/**
 * Get N-day range ending today in WIB.
 */
export function dayRangeWIB(days) {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const end = wib.toISOString().slice(0, 10)
  const startD = new Date(wib)
  startD.setUTCDate(wib.getUTCDate() - (days - 1))
  return {
    start: startD.toISOString().slice(0, 10),
    end,
  }
}

/**
 * Get a specific week range in WIB, offset by N weeks from current week.
 * offset=0 is current week, offset=-1 is previous week, etc.
 */
export function weekRangeWIB(offset = 0) {
  const cw = currentWeekWIB()
  const start = new Date(cw.start + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() + offset * 7)
  const end = new Date(cw.start + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + offset * 7 + 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

// ─── Revenue Queries ───────────────────────────────────────────

/**
 * Get total revenue and transaction count from canonical final orders for a date range.
 * Uses shared canonicalSalesService as single source of truth.
 */
export async function getRevenue(businessId, startDate, endDate) {
  const { orders, error } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (error) {
    console.error('[analytics] getRevenue error:', error.code, error.message, error.details, error.hint)
    return { total: 0, count: 0, error }
  }

  const metrics = aggregateSalesMetrics(orders)
  return { total: metrics.totalRevenue, count: metrics.totalTransaksi, error: null }
}

/**
 * Get revenue breakdown by product for a date range from canonical final orders.
 */
export async function getRevenueByProduct(businessId, startDate, endDate) {
  const { orders, error } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (error) {
    console.error('[analytics] getRevenueByProduct error:', error.code, error.message)
    return { products: [], error }
  }

  // Aggregate by product from final order items
  const map = {}
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = item.product_id || item.product_name || 'unknown'
      if (!map[key]) {
        map[key] = {
          product_id: item.product_id,
          name: item.product_name || 'Produk tidak dikenal',
          total_quantity: 0,
          total_revenue: 0,
        }
      }
      const qty = Number(item.quantity) || 0
      const sub = Number(item.subtotal) || (Number(item.unit_price) || 0) * qty
      map[key].total_quantity += qty
      map[key].total_revenue += sub
    }
  }

  const products = Object.values(map).sort((a, b) => b.total_revenue - a.total_revenue)
  return { products, error: null }
}

// ─── Transaction Queries ───────────────────────────────────────

/**
 * Get transaction count and total revenue from canonical final orders.
 * Strictly consistent with getRevenue().
 */
export async function getTransactions(businessId, startDate, endDate) {
  const { orders, error } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (error) {
    console.error('[analytics] getTransactions error:', error.code, error.message)
    return { count: 0, totalRevenue: 0, error }
  }

  const metrics = aggregateSalesMetrics(orders)
  return { count: metrics.totalTransaksi, totalRevenue: metrics.totalRevenue, error: null }
}

/**
 * Get transaction breakdown by date for chart/trend data from canonical final orders.
 * Returns array of { date, count, revenue }.
 */
export async function getTransactionTrend(businessId, startDate, endDate) {
  const { orders, error } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (error) {
    console.error('[analytics] getTransactionTrend error:', error.code, error.message)
    return { trend: [], error }
  }

  // Group by date (WIB)
  const map = {}
  for (const order of orders) {
    const dateStr = getWibDateString(order.created_at)
    if (!map[dateStr]) {
      map[dateStr] = { date: dateStr, count: 0, revenue: 0 }
    }
    map[dateStr].count += 1
    map[dateStr].revenue += Number(order.total) || 0
  }

  const trend = Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  return { trend, error: null }
}

// ─── Revenue Trend ─────────────────────────────────────────────

/**
 * Get revenue breakdown by date for trend display from canonical final orders.
 * Returns array of { date, revenue }.
 */
export async function getRevenueTrend(businessId, startDate, endDate) {
  const { orders, error } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (error) {
    console.error('[analytics] getRevenueTrend error:', error.code, error.message)
    return { trend: [], error }
  }

  const map = {}
  for (const order of orders) {
    const dateStr = getWibDateString(order.created_at)
    if (!map[dateStr]) {
      map[dateStr] = { date: dateStr, revenue: 0 }
    }
    map[dateStr].revenue += Number(order.total) || 0
  }

  const trend = Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  return { trend, error: null }
}

// ─── Customer Queries ──────────────────────────────────────────

/**
 * Get new customers created in a date range.
 */
export async function getNewCustomers(businessId, startDate, endDate) {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .gte('created_at', startDate + 'T00:00:00Z')
    .lte('created_at', endDate + 'T23:59:59Z')

  if (error) {
    console.error('[analytics] getNewCustomers error:', error.code, error.message)
    return { count: 0, error }
  }
  return { count: data.length, error: null }
}

/**
 * Get repeat customers (customers with >1 transaction) in a date range.
 * Uses the total_transactions field on customers table.
 */
export async function getRepeatCustomers(businessId) {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .gt('total_transactions', 1)

  if (error) {
    console.error('[analytics] getRepeatCustomers error:', error.code, error.message)
    return { count: 0, error }
  }
  return { count: data.length, error: null }
}

// ─── Inventory Queries ─────────────────────────────────────────

/**
 * Get inventory health metrics.
 */
export async function getInventoryHealth(businessId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('quantity, min_stock, maximum_stock, products(name, unit_price, cost_price, business_id)')
    .eq('products.business_id', businessId)

  if (error) {
    console.error('[analytics] getInventoryHealth error:', error.code, error.message)
    return { lowStock: [], outOfStock: [], totalValue: 0, totalProducts: 0, error }
  }

  const lowStock = []
  const outOfStock = []
  let totalValue = 0

  for (const inv of data) {
    if (!inv.products) continue
    const qty = inv.quantity || 0
    const price = Number(inv.products.unit_price) || 0

    totalValue += qty * price

    if (qty === 0) {
      outOfStock.push({
        name: inv.products.name,
        quantity: qty,
        min_stock: inv.min_stock || 0,
      })
    } else if (inv.min_stock > 0 && qty <= inv.min_stock) {
      lowStock.push({
        name: inv.products.name,
        quantity: qty,
        min_stock: inv.min_stock,
      })
    }
  }

  return {
    lowStock,
    outOfStock,
    totalValue,
    totalProducts: data.length,
    error: null,
  }
}

// ─── HPP/COGS & Profitability ──────────────────────────────────

/**
 * Get HPP (cost of goods) and gross profitability from canonical final orders.
 * Joins final order items with hpp_calculations to compute gross profit.
 * Strictly consistent with Dashboard and Excel.
 */
export async function getProfitability(businessId, startDate, endDate) {
  const { orders, error: ordersErr } = await fetchCanonicalOrders(businessId, { startDate, endDate, onlyFinal: true })

  if (ordersErr) {
    console.error('[analytics] getProfitability orders error:', ordersErr.code, ordersErr.message)
    return { hasData: false, grossRevenue: 0, cogs: 0, grossProfit: 0, margin: 0, error: ordersErr }
  }

  if (!orders || orders.length === 0) {
    return { hasData: false, grossRevenue: 0, cogs: 0, grossProfit: 0, margin: 0, error: null }
  }

  const metrics = aggregateSalesMetrics(orders)
  const grossRevenue = metrics.totalRevenue

  const allItems = orders.flatMap(o => o.items || [])
  const productIds = [...new Set(allItems.map(i => i.product_id).filter(Boolean))]

  if (productIds.length === 0) {
    return {
      hasData: false,
      grossRevenue,
      cogs: 0,
      grossProfit: 0,
      margin: 0,
      note: 'Data HPP belum tersedia. Produk belum terhubung dengan perhitungan HPP.',
      error: null,
    }
  }

  const { data: hppData, error: hppErr } = await supabase
    .from('hpp_calculations')
    .select('product_id, hpp_per_unit')
    .eq('business_id', businessId)
    .in('product_id', productIds)

  if (hppErr) {
    console.error('[analytics] getProfitability hpp error:', hppErr.code, hppErr.message)
    return { hasData: false, grossRevenue, cogs: 0, grossProfit: 0, margin: 0, error: hppErr }
  }

  // Build HPP lookup (latest per product)
  const hppMap = {}
  for (const h of hppData || []) {
    hppMap[h.product_id] = Number(h.hpp_per_unit) || 0
  }

  let cogs = 0
  let hasAnyHpp = false

  for (const item of allItems) {
    if (item.product_id && hppMap[item.product_id] !== undefined) {
      cogs += hppMap[item.product_id] * (Number(item.quantity) || 1)
      hasAnyHpp = true
    }
  }

  if (!hasAnyHpp) {
    return {
      hasData: false,
      grossRevenue,
      cogs: 0,
      grossProfit: 0,
      margin: 0,
      note: 'Data HPP belum tersedia untuk produk yang dijual.',
      error: null,
    }
  }

  const grossProfit = grossRevenue - cogs
  const margin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0

  return {
    hasData: true,
    grossRevenue,
    cogs,
    grossProfit,
    margin,
    note: null,
    error: null,
  }
}

// ─── Expense Queries ───────────────────────────────────────────

/**
 * Get total expenses for a date range.
 */
export async function getExpenses(businessId, startDate, endDate) {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, category')
    .eq('business_id', businessId)
    .gte('expense_date', startDate)
    .lte('expense_date', endDate)

  if (error) {
    console.error('[analytics] getExpenses error:', error.code, error.message)
    return { total: 0, byCategory: [], error }
  }

  const total = data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const catMap = {}
  for (const r of data) {
    const cat = r.category || 'Lainnya'
    catMap[cat] = (catMap[cat] || 0) + (Number(r.amount) || 0)
  }
  const byCategory = Object.entries(catMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  return { total, byCategory, error: null }
}

// ─── Full Realtime Dashboard Data ──────────────────────────────

/**
 * Fetch all data needed for the realtime dashboard in parallel.
 * Returns a consolidated object with all metrics.
 */
export async function fetchRealtimeDashboard(businessId) {
  const today = todayWIB()
  const week = currentWeekWIB()
  const month = currentMonthWIB()

  // Fetch all metrics in parallel
  const [
    revToday,
    revWeek,
    revMonth,
    txToday,
    txWeek,
    txMonth,
    prodToday,
    newCustWeek,
    repeatCust,
    inventory,
    profitMonth,
    expMonth,
  ] = await Promise.all([
    getRevenue(businessId, today, today),
    getRevenue(businessId, week.start, week.end),
    getRevenue(businessId, month.start, month.end),
    getTransactions(businessId, today, today),
    getTransactions(businessId, week.start, week.end),
    getTransactions(businessId, month.start, month.end),
    getRevenueByProduct(businessId, today, today),
    getNewCustomers(businessId, week.start, week.end),
    getRepeatCustomers(businessId),
    getInventoryHealth(businessId),
    getProfitability(businessId, month.start, month.end),
    getExpenses(businessId, month.start, month.end),
  ])

  return {
    period: { today, week, month },
    revenue: {
      today: revToday.total,
      thisWeek: revWeek.total,
      thisMonth: revMonth.total,
    },
    transactions: {
      today: txToday.count,
      thisWeek: txWeek.count,
      thisMonth: txMonth.count,
    },
    aov: {
      today: txToday.count > 0 ? revToday.total / txToday.count : 0,
      thisWeek: txWeek.count > 0 ? revWeek.total / txWeek.count : 0,
      thisMonth: txMonth.count > 0 ? revMonth.total / txMonth.count : 0,
    },
    topProducts: prodToday.products,
    customers: {
      newThisWeek: newCustWeek.count,
      repeatCustomers: repeatCust.count,
    },
    inventory,
    profitability: profitMonth,
    expenses: expMonth,
  }
}

// ─── Benchmarking Data ─────────────────────────────────────────

/**
 * Fetch internal business benchmarking data.
 * Returns trend data for the last 8 weeks.
 */
export async function fetchBenchmarkingData(businessId) {
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const range = weekRangeWIB(-i)
    weeks.push({ ...range, label: i === 0 ? 'Minggu ini' : `${i} minggu lalu` })
  }

  const weeklyData = []
  for (const week of weeks) {
    const [rev, tx, prod] = await Promise.all([
      getRevenue(businessId, week.start, week.end),
      getTransactions(businessId, week.start, week.end),
      getRevenueByProduct(businessId, week.start, week.end),
    ])

    weeklyData.push({
      label: week.label,
      start: week.start,
      end: week.end,
      revenue: rev.total,
      transactions: tx.count,
      aov: tx.count > 0 ? rev.total / tx.count : 0,
      topProduct: prod.products[0] || null,
    })
  }

  // Monthly trend for last 3 months
  const months = []
  for (let i = 2; i >= 0; i--) {
    const now = new Date()
    const wib = new Date(now.getTime() + WIB_OFFSET_MS)
    const target = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - i, 1))
    const year = target.getUTCFullYear()
    const month = target.getUTCMonth()
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 0))
    months.push({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: start.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
    })
  }

  const monthlyData = []
  for (const m of months) {
    const [rev, tx] = await Promise.all([
      getRevenue(businessId, m.start, m.end),
      getTransactions(businessId, m.start, m.end),
    ])
    monthlyData.push({
      label: m.label,
      revenue: rev.total,
      transactions: tx.count,
      aov: tx.count > 0 ? rev.total / tx.count : 0,
    })
  }

  return { weeklyData, monthlyData }
}

// ─── Weekly Recap Data ─────────────────────────────────────────

/**
 * Fetch all data needed for the weekly recap.
 */
export async function fetchWeeklyRecap(businessId) {
  const current = currentWeekWIB()
  const previous = previousWeekWIB()

  const [
    revCurrent,
    revPrevious,
    txCurrent,
    txPrevious,
    prodCurrent,
    prodPrevious,
    newCustCurrent,
    newCustPrevious,
    inventory,
    profitCurrent,
    profitPrevious,
  ] = await Promise.all([
    getRevenue(businessId, current.start, current.end),
    getRevenue(businessId, previous.start, previous.end),
    getTransactions(businessId, current.start, current.end),
    getTransactions(businessId, previous.start, previous.end),
    getRevenueByProduct(businessId, current.start, current.end),
    getRevenueByProduct(businessId, previous.start, previous.end),
    getNewCustomers(businessId, current.start, current.end),
    getNewCustomers(businessId, previous.start, previous.end),
    getInventoryHealth(businessId),
    getProfitability(businessId, current.start, current.end),
    getProfitability(businessId, previous.start, previous.end),
  ])

  // Calculate percentage changes
  const pctChange = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0
    return ((curr - prev) / Math.abs(prev)) * 100
  }

  return {
    period: {
      current,
      previous,
    },
    revenue: {
      current: revCurrent.total,
      previous: revPrevious.total,
      change: pctChange(revCurrent.total, revPrevious.total),
    },
    transactions: {
      current: txCurrent.count,
      previous: txPrevious.count,
      change: pctChange(txCurrent.count, txPrevious.count),
    },
    aov: {
      current: txCurrent.count > 0 ? revCurrent.total / txCurrent.count : 0,
      previous: txPrevious.count > 0 ? revPrevious.total / txPrevious.count : 0,
      change: pctChange(
        txCurrent.count > 0 ? revCurrent.total / txCurrent.count : 0,
        txPrevious.count > 0 ? revPrevious.total / txPrevious.count : 0,
      ),
    },
    topProducts: {
      current: prodCurrent.products,
      previous: prodPrevious.products,
    },
    customers: {
      newCurrent: newCustCurrent.count,
      newPrevious: newCustPrevious.count,
      change: pctChange(newCustCurrent.count, newCustPrevious.count),
    },
    inventory,
    profitability: {
      current: profitCurrent,
      previous: profitPrevious,
      marginChange: profitCurrent.hasData && profitPrevious.hasData
        ? profitCurrent.margin - profitPrevious.margin
        : null,
    },
  }
}
