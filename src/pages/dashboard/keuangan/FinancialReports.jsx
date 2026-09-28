import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import BackButton from '../../../components/BackButton'
import DateInput from '../../../components/DateInput'
import {
  getPeriodRange,
  formatDateID,
  PERIOD_PRESETS,
  calculateRevenueSummary,
  calculateExpenseBreakdown,
  calculateCOGS,
  calculateProductPerformance,
  calculatePeriodComparison,
  calculateProfitLoss,
  calculateRevenueTrend,
  calculateExpenseTrend,
  generateInsights,
} from '../../../sections/FinancialReports/calculateFinancialReports'

const selectCls = 'rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none'
const dateCls = 'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-navy-700 focus:border-warm-400 focus:outline-none'

function KPICard({ label, value, sub, accent, negative }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${negative ? 'text-red-500' : accent ? 'text-warm-500' : 'text-navy-700'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-text-muted">{sub}</p>}
    </div>
  )
}

function ChangeIndicator({ changePercent, label }) {
  if (changePercent === null || changePercent === undefined) {
    return <span className="text-[10px] text-text-muted">— {label}</span>
  }
  const isUp = changePercent > 0
  const isDown = changePercent < 0
  return (
    <span className={`text-[10px] font-semibold ${isUp ? 'text-profit-600' : isDown ? 'text-red-500' : 'text-text-muted'}`}>
      {isUp ? '↑' : isDown ? '↓' : '—'} {Math.abs(changePercent)}% {label}
    </span>
  )
}

function TrendBar({ label, value, max }) {
  const width = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-[10px] text-text-muted shrink-0 truncate">{label}</span>
      <div className="flex-1 h-4 bg-cream rounded overflow-hidden">
        <div className="h-full bg-warm-400 rounded" style={{ width: `${Math.min(width, 100)}%` }} />
      </div>
      <span className="w-20 text-right text-[10px] font-semibold text-navy-700 shrink-0">{formatCurrency(value)}</span>
    </div>
  )
}

function InsightItem({ text }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-cream/50 p-3">
      <span className="text-xs mt-0.5">💡</span>
      <p className="text-xs text-navy-700 leading-relaxed">{text}</p>
    </div>
  )
}

export default function FinancialReports() {
  const { business } = useAuth()
  const [period, setPeriod] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Raw data
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [hppData, setHppData] = useState([])
  const [prevSales, setPrevSales] = useState([])
  const [prevExpenses, setPrevExpenses] = useState([])

  // Compute date ranges
  const { start, end } = useMemo(() => getPeriodRange(period, customStart, customEnd), [period, customStart, customEnd])

  // Previous period range (same length, immediately before)
  const prevRange = useMemo(() => {
    const duration = end.getTime() - start.getTime()
    return {
      start: new Date(start.getTime() - duration - 86400000),
      end: new Date(start.getTime() - 86400000),
    }
  }, [start, end])

  // Load data
  useEffect(() => {
    if (!business?.id) return
    loadData()
  }, [business?.id, start.toISOString(), end.toISOString()])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const startStr = start.toISOString().split('T')[0]
      const endStr = end.toISOString().split('T')[0]
      const prevStartStr = prevRange.start.toISOString().split('T')[0]
      const prevEndStr = prevRange.end.toISOString().split('T')[0]

      // Parallel queries
      const [salesResult, expensesResult, hppResult, prevSalesResult, prevExpensesResult] = await Promise.all([
        supabase
          .from('sales')
          .select('id, product_id, quantity, unit_price, total, sale_date')
          .eq('business_id', business.id)
          .gte('sale_date', startStr)
          .lte('sale_date', endStr)
          .order('sale_date'),
        supabase
          .from('expenses')
          .select('id, category, description, amount, expense_date')
          .eq('business_id', business.id)
          .gte('expense_date', startStr)
          .lte('expense_date', endStr)
          .order('expense_date'),
        supabase
          .from('hpp_calculations')
          .select('product_id, hpp_per_unit, created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('sales')
          .select('id, product_id, quantity, unit_price, total, sale_date')
          .eq('business_id', business.id)
          .gte('sale_date', prevStartStr)
          .lte('sale_date', prevEndStr),
        supabase
          .from('expenses')
          .select('id, category, amount, expense_date')
          .eq('business_id', business.id)
          .gte('expense_date', prevStartStr)
          .lte('expense_date', prevEndStr),
      ])

      if (salesResult.error) throw salesResult.error
      if (expensesResult.error) throw expensesResult.error

      setSales(salesResult.data || [])
      setExpenses(expensesResult.data || [])
      setPrevSales(prevSalesResult.data || [])
      setPrevExpenses(prevExpensesResult.data || [])

      // Build latest HPP per product
      const hppMap = {}
      for (const h of (hppResult.data || [])) {
        if (h.product_id && !hppMap[h.product_id]) {
          hppMap[h.product_id] = h
        }
      }
      setHppData(Object.values(hppMap))
    } catch (err) {
      console.error('Financial reports load error:', err)
      setError('Gagal memuat laporan keuangan. Silakan coba lagi.')
    }

    setLoading(false)
  }

  // ── Computed metrics ──
  const revenueSummary = useMemo(() => calculateRevenueSummary(sales), [sales])
  const expenseBreakdown = useMemo(() => calculateExpenseBreakdown(expenses), [expenses])
  const cogs = useMemo(() => calculateCOGS(sales, hppData), [sales, hppData])
  const productPerformance = useMemo(() => calculateProductPerformance(sales, hppData, 10), [sales, hppData])

  const profitLoss = useMemo(() => calculateProfitLoss({
    revenue: revenueSummary.totalRevenue,
    cogs: cogs.cogs,
    hasReliableCOGS: cogs.hasReliableCOGS,
    totalExpenses: expenseBreakdown.totalExpenses,
  }), [revenueSummary, cogs, expenseBreakdown])

  // Previous period metrics
  const prevRevenue = useMemo(() => calculateRevenueSummary(prevSales), [prevSales])
  const prevExpense = useMemo(() => calculateExpenseBreakdown(prevExpenses), [prevExpenses])
  const prevCogs = useMemo(() => calculateCOGS(prevSales, hppData), [prevSales, hppData])
  const prevPnL = useMemo(() => calculateProfitLoss({
    revenue: prevRevenue.totalRevenue,
    cogs: prevCogs.cogs,
    hasReliableCOGS: prevCogs.hasReliableCOGS,
    totalExpenses: prevExpense.totalExpenses,
  }), [prevRevenue, prevCogs, prevExpense])

  const comparison = useMemo(() => calculatePeriodComparison(
    { revenue: profitLoss.revenue, expenses: profitLoss.totalExpenses, grossProfit: profitLoss.grossProfit, netProfit: profitLoss.estimatedProfit },
    { revenue: prevPnL.revenue, expenses: prevPnL.totalExpenses, grossProfit: prevPnL.grossProfit, netProfit: prevPnL.estimatedProfit },
  ), [profitLoss, prevPnL])

  const insights = useMemo(() => generateInsights({
    revenueSummary,
    expenseBreakdown,
    profitLoss,
    comparison,
  }), [revenueSummary, expenseBreakdown, profitLoss, comparison])

  // ── Trends ──
  const revenueTrend = useMemo(() => {
    const days = (end - start) / 86400000
    return calculateRevenueTrend(sales, days > 60 ? 'month' : 'day')
  }, [sales, start, end])

  const expenseTrend = useMemo(() => {
    const days = (end - start) / 86400000
    return calculateExpenseTrend(expenses, days > 60 ? 'month' : 'day')
  }, [expenses, start, end])

  // Merge trends for chart
  const trendData = useMemo(() => {
    const allLabels = new Set([...revenueTrend.map(t => t.label), ...expenseTrend.map(t => t.label)])
    const revMap = Object.fromEntries(revenueTrend.map(t => [t.label, t.revenue]))
    const expMap = Object.fromEntries(expenseTrend.map(t => [t.label, t.expenses]))

    return Array.from(allLabels)
      .sort()
      .map(label => ({
        label,
        revenue: revMap[label] || 0,
        expenses: expMap[label] || 0,
        profit: (revMap[label] || 0) - (expMap[label] || 0),
      }))
  }, [revenueTrend, expenseTrend])

  const maxTrendValue = useMemo(() => {
    if (trendData.length === 0) return 0
    return Math.max(...trendData.map(t => Math.max(t.revenue, t.expenses)))
  }, [trendData])

  const hasAnyData = sales.length > 0 || expenses.length > 0

  // ── Period label ──
  const periodLabel = `${formatDateID(start)} — ${formatDateID(end)}`

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-navy-700">Financial Reports</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 rounded-xl border border-border bg-surface animate-pulse" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-2xl border border-border bg-surface animate-pulse" />
      </div>
    )
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Financial Reports</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Laporan keuangan berdasarkan data bisnis Anda.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
        >
          {error}
        </motion.div>
      )}

      {/* Period Filter */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs font-medium text-text-muted">Periode</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {Object.entries(PERIOD_PRESETS).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <label className="text-xs font-medium text-text-muted">Dari</label>
              <DateInput
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={`mt-1 ${dateCls}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted">Sampai</label>
              <DateInput
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={`mt-1 ${dateCls}`}
              />
            </div>
          </>
        )}
        <button
          onClick={loadData}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-cream"
        >
          Refresh
        </button>
        <span className="mt-4 text-[10px] text-text-muted">{periodLabel}</span>
      </div>

      {/* No data */}
      {!hasAnyData && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada data keuangan untuk periode yang dipilih.</p>
          <p className="mt-2 text-sm text-text-muted">
            Mulai mencatat penjualan atau pengeluaran untuk melihat laporan.
          </p>
        </div>
      )}

      {hasAnyData && (
        <>
          {/* KPI Cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              label="Revenue"
              value={formatCurrency(profitLoss.revenue)}
              sub={<ChangeIndicator changePercent={comparison.revenue.changePercent} label="vs periode sebelumnya" />}
            />
            <KPICard
              label="Total Pengeluaran"
              value={formatCurrency(profitLoss.totalExpenses)}
              sub={<ChangeIndicator changePercent={comparison.expenses.changePercent} label="vs periode sebelumnya" />}
            />
            <KPICard
              label={cogs.hasReliableCOGS ? 'Laba Kotor' : 'Estimasi Laba'}
              value={cogs.hasReliableCOGS ? formatCurrency(profitLoss.grossProfit) : formatCurrency(profitLoss.estimatedProfit)}
              accent
              sub={cogs.hasReliableCOGS
                ? `Margin: ${profitLoss.grossMarginPercent ?? '—'}%`
                : 'COGS belum tersedia'}
            />
            <KPICard
              label="Net Profit"
              value={formatCurrency(profitLoss.estimatedProfit)}
              negative={profitLoss.estimatedProfit < 0}
              sub={`Margin: ${profitLoss.netMarginPercent ?? '—'}%`}
            />
          </div>

          {/* Revenue Summary */}
          {revenueSummary.hasData && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-bold text-navy-700">Ringkasan Revenue</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] text-text-muted">Total Revenue</p>
                  <p className="text-lg font-extrabold text-navy-700">{formatCurrency(revenueSummary.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted">Jumlah Transaksi</p>
                  <p className="text-lg font-extrabold text-navy-700">{revenueSummary.totalTransactions}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted">Rata-rata per Transaksi</p>
                  <p className="text-lg font-extrabold text-navy-700">{formatCurrency(revenueSummary.averageTransactionValue)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Revenue vs Expenses Trend */}
          {trendData.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-bold text-navy-700">Trend Revenue vs Pengeluaran</h2>
              <div className="mt-4 space-y-2">
                {trendData.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-4">
                    <div>
                      <p className="text-[10px] text-text-muted mb-1">{t.label}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-profit-100 rounded overflow-hidden">
                          <div className="h-full bg-profit-500 rounded" style={{ width: `${maxTrendValue > 0 ? (t.revenue / maxTrendValue) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-profit-600 w-20 text-right shrink-0">{formatCurrency(t.revenue)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-3 bg-red-100 rounded overflow-hidden">
                          <div className="h-full bg-red-400 rounded" style={{ width: `${maxTrendValue > 0 ? (t.expenses / maxTrendValue) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-red-500 w-20 text-right shrink-0">{formatCurrency(t.expenses)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4">
                <span className="flex items-center gap-1 text-[10px] text-profit-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-profit-500" /> Revenue
                </span>
                <span className="flex items-center gap-1 text-[10px] text-red-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Pengeluaran
                </span>
              </div>
            </div>
          )}

          {/* Profit & Loss */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-sm font-bold text-navy-700">Profit & Loss</h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Revenue</span>
                <span className="font-semibold text-navy-700">{formatCurrency(profitLoss.revenue)}</span>
              </div>
              {cogs.hasReliableCOGS ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">COGS</span>
                    <span className="font-semibold text-red-500">-{formatCurrency(profitLoss.cogs)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="font-semibold text-navy-700">Laba Kotor</span>
                    <span className="font-bold text-profit-600">{formatCurrency(profitLoss.grossProfit)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-text-muted italic">
                  COGS belum dapat dihitung secara lengkap dari data saat ini.
                </p>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Pengeluaran Operasional</span>
                <span className="font-semibold text-red-500">-{formatCurrency(profitLoss.totalExpenses)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="font-bold text-navy-700">
                  {cogs.hasReliableCOGS ? 'Laba Bersih' : 'Estimasi Laba'}
                </span>
                <span className={`font-bold ${profitLoss.estimatedProfit < 0 ? 'text-red-500' : 'text-profit-600'}`}>
                  {formatCurrency(profitLoss.estimatedProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Expense Breakdown */}
          {expenseBreakdown.hasData && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-bold text-navy-700">Breakdown Pengeluaran</h2>
              <div className="mt-4 space-y-2">
                {expenseBreakdown.categories.map((cat, i) => (
                  <TrendBar key={i} label={cat.name} value={cat.amount} max={expenseBreakdown.categories[0]?.amount || 0} />
                ))}
              </div>
              <div className="mt-3 text-right">
                <span className="text-xs font-semibold text-navy-700">
                  Total: {formatCurrency(expenseBreakdown.totalExpenses)}
                </span>
              </div>
            </div>
          )}

          {/* Top Products */}
          {productPerformance.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-bold text-navy-700">Top Produk</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-semibold text-text-muted">Produk</th>
                      <th className="pb-2 text-right font-semibold text-text-muted">Qty</th>
                      <th className="pb-2 text-right font-semibold text-text-muted">Revenue</th>
                      {cogs.hasReliableCOGS && (
                        <th className="pb-2 text-right font-semibold text-text-muted">Estimasi Profit</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {productPerformance.map((p, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 font-medium text-navy-700">{p.productName}</td>
                        <td className="py-2 text-right text-navy-700">{p.quantity}</td>
                        <td className="py-2 text-right font-semibold text-navy-700">{formatCurrency(p.revenue)}</td>
                        {cogs.hasReliableCOGS && (
                          <td className={`py-2 text-right font-semibold ${p.estimatedProfit !== null && p.estimatedProfit < 0 ? 'text-red-500' : 'text-profit-600'}`}>
                            {p.estimatedProfit !== null ? formatCurrency(p.estimatedProfit) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Insights */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-sm font-bold text-navy-700">Insight</h2>
            <div className="mt-4 space-y-2">
              {insights.map((insight, i) => (
                <InsightItem key={i} text={insight} />
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/dashboard/keuangan/cash-flow-forecast"
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-cream"
            >
              Lihat Cash Flow Forecast →
            </a>
            <a
              href="/dashboard/keuangan/tax-planning"
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-cream"
            >
              Lihat Tax Planning →
            </a>
          </div>
        </>
      )}
    </div>
  )
}
