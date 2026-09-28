import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import { fetchWeeklyRecap } from '../../../lib/analyticsService'

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const fmtNum = (n) =>
  new Intl.NumberFormat('id-ID').format(n)

const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-navy-100 ${className}`} />
}

function ChangeIndicator({ value, suffix = '' }) {
  const isPositive = value > 0
  const isNeutral = value === 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
      isNeutral ? 'text-text-muted' : isPositive ? 'text-profit-600' : 'text-warm-500'
    }`}>
      {!isNeutral && (
        <svg className={`h-3 w-3 ${isPositive ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      )}
      {pct(value)}{suffix}
    </span>
  )
}

function MetricComparison({ label, current, previous, format = 'currency', accent = 'text-navy-700' }) {
  const change = previous === 0
    ? (current > 0 ? 100 : 0)
    : ((current - previous) / Math.abs(previous)) * 100

  const displayCurrent = format === 'currency' ? fmt(current) : format === 'number' ? fmtNum(current) : format === 'percent' ? `${current.toFixed(1)}%` : current
  const displayPrevious = format === 'currency' ? fmt(previous) : format === 'number' ? fmtNum(previous) : format === 'percent' ? `${previous.toFixed(1)}%` : previous

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-text-muted uppercase">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-2xl font-extrabold ${accent}`}>{displayCurrent}</p>
        <ChangeIndicator value={change} />
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        Minggu lalu: {displayPrevious}
      </p>
    </div>
  )
}

/**
 * Generate deterministic insights from weekly data.
 * All insights are based purely on actual database values.
 */
function generateInsights(data) {
  if (!data) return []

  const insights = []

  // Revenue insights
  if (data.revenue.current > 0 || data.revenue.previous > 0) {
    if (data.revenue.change > 0) {
      insights.push({
        type: 'positive',
        text: `Revenue naik ${data.revenue.change.toFixed(1)}% dibanding minggu lalu (${fmt(data.revenue.current)} vs ${fmt(data.revenue.previous)}).`,
      })
    } else if (data.revenue.change < 0) {
      insights.push({
        type: 'warning',
        text: `Revenue turun ${Math.abs(data.revenue.change).toFixed(1)}% dibanding minggu lalu (${fmt(data.revenue.current)} vs ${fmt(data.revenue.previous)}).`,
      })
    } else if (data.revenue.current === 0 && data.revenue.previous === 0) {
      insights.push({
        type: 'neutral',
        text: 'Belum ada revenue di kedua minggu.',
      })
    }
  }

  // Transaction insights
  if (data.transactions.current > 0 || data.transactions.previous > 0) {
    if (data.transactions.change > 0) {
      insights.push({
        type: 'positive',
        text: `Jumlah transaksi naik ${data.transactions.change.toFixed(1)}% (${fmtNum(data.transactions.current)} vs ${fmtNum(data.transactions.previous)}).`,
      })
    } else if (data.transactions.change < 0) {
      insights.push({
        type: 'warning',
        text: `Jumlah transaksi turun ${Math.abs(data.transactions.change).toFixed(1)}% (${fmtNum(data.transactions.current)} vs ${fmtNum(data.transactions.previous)}).`,
      })
    }
  }

  // AOV insights
  if (data.aov.current > 0 || data.aov.previous > 0) {
    if (data.aov.change > 10) {
      insights.push({
        type: 'positive',
        text: `AOV naik signifikan ${data.aov.change.toFixed(1)}% — rata-rata transaksi lebih besar minggu ini.`,
      })
    } else if (data.aov.change < -10) {
      insights.push({
        type: 'warning',
        text: `AOV turun ${Math.abs(data.aov.change).toFixed(1)}% — rata-rata transaksi lebih kecil minggu ini.`,
      })
    }
  }

  // Top product insight
  if (data.topProducts.current.length > 0) {
    const top = data.topProducts.current[0]
    insights.push({
      type: 'info',
      text: `Produk "${top.name}" menghasilkan revenue terbesar minggu ini: ${fmt(top.total_revenue)} (${fmtNum(top.total_quantity)} terjual).`,
    })
  }

  // Customer insight
  if (data.customers.newCurrent > 0) {
    insights.push({
      type: 'info',
      text: `${fmtNum(data.customers.newCurrent)} pelanggan baru minggu ini.`,
    })
  }

  // Inventory insights
  if (data.inventory.lowStock.length > 0) {
    insights.push({
      type: 'warning',
      text: `${data.inventory.lowStock.length} produk masuk kategori stok menipis: ${data.inventory.lowStock.slice(0, 3).map(p => p.name).join(', ')}${data.inventory.lowStock.length > 3 ? '...' : ''}.`,
    })
  }
  if (data.inventory.outOfStock.length > 0) {
    insights.push({
      type: 'warning',
      text: `${data.inventory.outOfStock.length} produk stok habis: ${data.inventory.outOfStock.slice(0, 3).map(p => p.name).join(', ')}${data.inventory.outOfStock.length > 3 ? '...' : ''}.`,
    })
  }

  // Profitability insight
  if (data.profitability.current.hasData) {
    if (data.profitability.marginChange !== null) {
      if (data.profitability.marginChange > 0) {
        insights.push({
          type: 'positive',
          text: `Gross margin naik ${data.profitability.marginChange.toFixed(1)} poin ke ${data.profitability.current.margin.toFixed(1)}%.`,
        })
      } else if (data.profitability.marginChange < 0) {
        insights.push({
          type: 'warning',
          text: `Gross margin turun ${Math.abs(data.profitability.marginChange).toFixed(1)} poin ke ${data.profitability.current.margin.toFixed(1)}%.`,
        })
      }
    }
  }

  // No data at all
  if (insights.length === 0) {
    insights.push({
      type: 'neutral',
      text: 'Belum ada data transaksi minggu ini. Mulai mencatat penjualan untuk melihat insight.',
    })
  }

  return insights
}

export default function WeeklyRecapPage() {
  const { business } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchWeeklyRecap(business.id)
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[WeeklyRecapPage] fetch error:', err)
      setError(err.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

  const insights = useMemo(() => generateInsights(data), [data])

  return (
    <div>
      {/* Header */}
      <BackButton fallbackUrl="/dashboard/analytics" label="Kembali" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Weekly Recap</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Perbandingan minggu ini vs minggu lalu
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] text-text-muted">
              Update: {lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy-600 transition-colors hover:bg-cream disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5"
        >
          <p className="text-sm font-medium text-red-700">Gagal memuat data</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button onClick={load} className="mt-3 text-xs font-medium text-red-700 underline hover:no-underline">
            Coba lagi
          </button>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-5">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-6"
        >
          {/* Period Info */}
          <motion.div variants={item} className="flex flex-wrap gap-4 text-xs text-text-muted">
            <div className="rounded-lg border border-border bg-surface px-3 py-2">
              <span className="font-medium text-navy-600">Minggu ini:</span>{' '}
              {data.period.current.start} s/d {data.period.current.end}
            </div>
            <div className="rounded-lg border border-border bg-surface px-3 py-2">
              <span className="font-medium text-navy-600">Minggu lalu:</span>{' '}
              {data.period.previous.start} s/d {data.period.previous.end}
            </div>
          </motion.div>

          {/* Key Metrics Comparison */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-500">Perbandingan Utama</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricComparison
                label="Revenue"
                current={data.revenue.current}
                previous={data.revenue.previous}
                format="currency"
                accent="text-warm-500"
              />
              <MetricComparison
                label="Transaksi"
                current={data.transactions.current}
                previous={data.transactions.previous}
                format="number"
                accent="text-electric-500"
              />
              <MetricComparison
                label="AOV"
                current={data.aov.current}
                previous={data.aov.previous}
                format="currency"
                accent="text-navy-500"
              />
              <MetricComparison
                label="Pelanggan Baru"
                current={data.customers.newCurrent}
                previous={data.customers.newPrevious}
                format="number"
                accent="text-profit-500"
              />
            </div>
          </motion.div>

          {/* Insights */}
          {insights.length > 0 && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500">Insight</h2>
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="space-y-3">
                  {insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        insight.type === 'positive' ? 'bg-profit-400'
                          : insight.type === 'warning' ? 'bg-warm-400'
                            : insight.type === 'info' ? 'bg-electric-400'
                              : 'bg-navy-200'
                      }`} />
                      <p className="text-sm text-navy-600">{insight.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Top Products */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-profit-500">Top Produk (Minggu Ini)</h2>
            {data.topProducts.current.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-muted">Belum ada penjualan minggu ini</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-cream/50">
                      <th className="px-4 py-3 text-xs font-medium text-text-muted">#</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted">Produk</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Qty Terjual</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.current.map((p, i) => (
                      <tr key={p.product_id || p.name} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-text-muted">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-navy-600">{p.name}</td>
                        <td className="px-4 py-3 text-right text-text-secondary">{fmtNum(p.total_quantity)}</td>
                        <td className="px-4 py-3 text-right font-medium text-profit-600">{fmt(p.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          {/* Inventory Status */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-electric-500">Status Inventaris</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="text-xs font-medium text-text-muted uppercase">Total Produk</p>
                <p className="mt-1 text-2xl font-extrabold text-electric-500">{fmtNum(data.inventory.totalProducts)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="text-xs font-medium text-text-muted uppercase">Stok Menipis</p>
                <p className="mt-1 text-2xl font-extrabold text-warm-500">{fmtNum(data.inventory.lowStock.length)}</p>
                {data.inventory.lowStock.length > 0 && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    {data.inventory.lowStock.slice(0, 2).map(p => `${p.name} (${p.quantity})`).join(', ')}
                    {data.inventory.lowStock.length > 2 ? '...' : ''}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="text-xs font-medium text-text-muted uppercase">Stok Habis</p>
                <p className="mt-1 text-2xl font-extrabold text-warm-500">{fmtNum(data.inventory.outOfStock.length)}</p>
                {data.inventory.outOfStock.length > 0 && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    {data.inventory.outOfStock.slice(0, 2).map(p => p.name).join(', ')}
                    {data.inventory.outOfStock.length > 2 ? '...' : ''}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Profitability */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-profit-500">Profitabilitas (Minggu Ini)</h2>
            {data.profitability.current.hasData ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Gross Revenue</p>
                  <p className="mt-1 text-lg font-extrabold text-warm-500">{fmt(data.profitability.current.grossRevenue)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">COGS (HPP)</p>
                  <p className="mt-1 text-lg font-extrabold text-text-secondary">{fmt(data.profitability.current.cogs)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Gross Profit</p>
                  <p className="mt-1 text-lg font-extrabold text-profit-500">{fmt(data.profitability.current.grossProfit)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Gross Margin</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="text-lg font-extrabold text-profit-500">{data.profitability.current.margin.toFixed(1)}%</p>
                    {data.profitability.marginChange !== null && (
                      <ChangeIndicator value={data.profitability.marginChange} suffix=" poin" />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-muted">
                  {data.profitability.current.note || 'Data profitabilitas belum tersedia. Pastikan produk sudah dihitung HPP-nya.'}
                </p>
              </div>
            )}
          </motion.div>

          {/* Empty State */}
          {data.revenue.current === 0 && data.revenue.previous === 0 &&
           data.transactions.current === 0 && data.transactions.previous === 0 && (
            <motion.div variants={item} className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <p className="mt-3 text-sm font-medium text-navy-600">Belum ada data minggu ini</p>
              <p className="mt-1 text-xs text-text-muted">
                Weekly recap akan menampilkan data setelah ada transaksi yang tercatat.
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Empty State - no business */}
      {!business && !loading && (
        <div className="mt-12 text-center">
          <p className="text-sm text-text-muted">Pilih bisnis terlebih dahulu untuk melihat weekly recap.</p>
        </div>
      )}
    </div>
  )
}
