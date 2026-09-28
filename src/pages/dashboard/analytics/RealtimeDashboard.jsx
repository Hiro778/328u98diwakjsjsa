import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import {
  fetchRealtimeDashboard,
  todayWIB,
  currentWeekWIB,
  currentMonthWIB,
} from '../../../lib/analyticsService'

const fmt = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const fmtNum = (n) =>
  new Intl.NumberFormat('id-ID').format(n)

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

function MetricCard({ label, value, sub, accent = 'text-navy-700' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium text-text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RealtimeDashboard() {
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
      const result = await fetchRealtimeDashboard(business.id)
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[RealtimeDashboard] fetch error:', err)
      setError(err.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

  const today = todayWIB()
  const week = currentWeekWIB()
  const month = currentMonthWIB()

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
          <h1 className="text-2xl font-extrabold text-navy-700">Real-time Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Metrik bisnis aktual dari database
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
      {loading && !data && <div className="mt-6"><LoadingSkeleton /></div>}

      {/* Empty State */}
      {!loading && !error && data && (
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-6"
        >
          {/* Date Info */}
          <motion.div variants={item} className="flex flex-wrap gap-3 text-[11px] text-text-muted">
            <span>Hari ini: {today}</span>
            <span>Minggu: {week.start} s/d {week.end}</span>
            <span>Bulan: {month.start} s/d {month.end}</span>
          </motion.div>

          {/* Revenue Section */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-500">Revenue</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Hari Ini" value={fmt(data.revenue.today)} accent="text-warm-500" />
              <MetricCard label="Minggu Ini" value={fmt(data.revenue.thisWeek)} accent="text-warm-500" />
              <MetricCard label="Bulan Ini" value={fmt(data.revenue.thisMonth)} accent="text-warm-500" />
            </div>
          </motion.div>

          {/* Transactions Section */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-electric-500">Transaksi (Orders POS)</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Hari Ini" value={fmtNum(data.transactions.today)} sub="transaksi" accent="text-electric-500" />
              <MetricCard label="Minggu Ini" value={fmtNum(data.transactions.thisWeek)} sub="transaksi" accent="text-electric-500" />
              <MetricCard label="Bulan Ini" value={fmtNum(data.transactions.thisMonth)} sub="transaksi" accent="text-electric-500" />
            </div>
          </motion.div>

          {/* AOV Section */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500">Average Order Value</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Hari Ini" value={fmt(data.aov.today)} accent="text-navy-500" />
              <MetricCard label="Minggu Ini" value={fmt(data.aov.thisWeek)} accent="text-navy-500" />
              <MetricCard label="Bulan Ini" value={fmt(data.aov.thisMonth)} accent="text-navy-500" />
            </div>
          </motion.div>

          {/* Top Products */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-profit-500">Produk Hari Ini</h2>
            {data.topProducts.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-muted">Belum ada penjualan hari ini</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-cream/50">
                      <th className="px-4 py-3 text-xs font-medium text-text-muted">Produk</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Qty</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.product_id || p.name} className="border-b border-border last:border-0">
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

          {/* Customer Metrics */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500">Pelanggan</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetricCard label="Pelanggan Baru (Minggu Ini)" value={fmtNum(data.customers.newThisWeek)} accent="text-navy-500" />
              <MetricCard label="Repeat Customer" value={fmtNum(data.customers.repeatCustomers)} sub="total pelanggan dengan >1 transaksi" accent="text-navy-500" />
            </div>
          </motion.div>

          {/* Inventory */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-electric-500">Inventaris</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total Produk"
                value={fmtNum(data.inventory.totalProducts)}
                accent="text-electric-500"
              />
              <MetricCard
                label="Stok Menipis"
                value={fmtNum(data.inventory.lowStock.length)}
                sub={data.inventory.lowStock.length > 0
                  ? data.inventory.lowStock.slice(0, 3).map(p => p.name).join(', ') + (data.inventory.lowStock.length > 3 ? '...' : '')
                  : 'Tidak ada'}
                accent="text-warm-500"
              />
              <MetricCard
                label="Stok Habis"
                value={fmtNum(data.inventory.outOfStock.length)}
                sub={data.inventory.outOfStock.length > 0
                  ? data.inventory.outOfStock.slice(0, 3).map(p => p.name).join(', ') + (data.inventory.outOfStock.length > 3 ? '...' : '')
                  : 'Tidak ada'}
                accent="text-warm-500"
              />
            </div>
            {data.inventory.totalValue > 0 && (
              <div className="mt-3 rounded-xl border border-border bg-surface p-4">
                <p className="text-xs text-text-muted">Nilai Inventaris</p>
                <p className="text-lg font-extrabold text-electric-500">{fmt(data.inventory.totalValue)}</p>
              </div>
            )}
          </motion.div>

          {/* Profitability */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-profit-500">Profitabilitas (Bulan Ini)</h2>
            {data.profitability.hasData ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <MetricCard label="Gross Revenue" value={fmt(data.profitability.grossRevenue)} accent="text-warm-500" />
                <MetricCard label="COGS (HPP)" value={fmt(data.profitability.cogs)} accent="text-text-secondary" />
                <MetricCard label="Gross Profit" value={fmt(data.profitability.grossProfit)} accent="text-profit-500" />
                <MetricCard label="Gross Margin" value={`${data.profitability.margin.toFixed(1)}%`} accent="text-profit-500" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-muted">
                  {data.profitability.note || 'Data profitabilitas belum tersedia. Pastikan produk sudah dihitung HPP-nya.'}
                </p>
                {data.profitability.grossRevenue > 0 && (
                  <p className="mt-2 text-xs text-text-muted">
                    Revenue: {fmt(data.profitability.grossRevenue)} (COGS belum tersedia)
                  </p>
                )}
              </div>
            )}
          </motion.div>

          {/* Expenses */}
          <motion.div variants={item}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-500">Pengeluaran (Bulan Ini)</h2>
            {data.expenses.total > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricCard label="Total Pengeluaran" value={fmt(data.expenses.total)} accent="text-warm-500" />
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase mb-3">Per Kategori</p>
                  {data.expenses.byCategory.length === 0 ? (
                    <p className="text-xs text-text-muted">-</p>
                  ) : (
                    <div className="space-y-2">
                      {data.expenses.byCategory.slice(0, 5).map((c) => (
                        <div key={c.category} className="flex items-center justify-between text-sm">
                          <span className="text-navy-600">{c.category}</span>
                          <span className="font-medium text-text-secondary">{fmt(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-muted">Belum ada pengeluaran bulan ini</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Empty State - no business */}
      {!business && !loading && (
        <div className="mt-12 text-center">
          <p className="text-sm text-text-muted">Pilih bisnis terlebih dahulu untuk melihat analytics.</p>
        </div>
      )}
    </div>
  )
}
