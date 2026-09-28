import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import { fetchBenchmarkingData } from '../../../lib/analyticsService'

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

function TrendBar({ value, max, color = 'bg-profit-400' }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-cream">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}

export default function BenchmarkingPage() {
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
      const result = await fetchBenchmarkingData(business.id)
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[BenchmarkingPage] fetch error:', err)
      setError(err.message || 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

  // Calculate growth metrics from weekly data
  const getGrowthMetrics = () => {
    if (!data?.weeklyData || data.weeklyData.length < 2) return null
    const weeks = data.weeklyData
    const recent = weeks[weeks.length - 1]
    const previous = weeks[weeks.length - 2]
    const oldest = weeks[0]

    const weekOverWeekRev = previous.revenue > 0
      ? ((recent.revenue - previous.revenue) / previous.revenue) * 100
      : recent.revenue > 0 ? 100 : 0

    const weekOverWeekTx = previous.transactions > 0
      ? ((recent.transactions - previous.transactions) / previous.transactions) * 100
      : recent.transactions > 0 ? 100 : 0

    // 8-week trend
    const revTrend = oldest.revenue > 0
      ? ((recent.revenue - oldest.revenue) / oldest.revenue) * 100
      : recent.revenue > 0 ? 100 : 0

    const maxRev = Math.max(...weeks.map(w => w.revenue))
    const maxTx = Math.max(...weeks.map(w => w.transactions))

    return {
      weekOverWeekRev,
      weekOverWeekTx,
      revTrend,
      maxRev,
      maxTx,
      recent,
      previous,
    }
  }

  const metrics = getGrowthMetrics()

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
          <h1 className="text-2xl font-extrabold text-navy-700">Benchmarking</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Perbandingan performa bisnis dari waktu ke waktu
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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-6">
              <Skeleton className="h-4 w-40 mb-4" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
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
          {/* Industry Benchmark Notice */}
          <motion.div variants={item} className="rounded-xl border border-dashed border-navy-200 bg-navy-50/50 p-5">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 shrink-0 text-navy-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-navy-700">Benchmark Industri</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Benchmarking industri akan tersedia setelah data benchmark yang tervalidasi tersedia.
                  Saat ini yang ditampilkan adalah perbandingan internal bisnis Anda sendiri.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Growth Summary */}
          {metrics && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500">Ringkasan Pertumbuhan</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Revenue WoW</p>
                  <p className={`mt-1 text-2xl font-extrabold ${metrics.weekOverWeekRev >= 0 ? 'text-profit-500' : 'text-warm-500'}`}>
                    {pct(metrics.weekOverWeekRev)}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {fmt(metrics.recent.revenue)} vs {fmt(metrics.previous.revenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Transaksi WoW</p>
                  <p className={`mt-1 text-2xl font-extrabold ${metrics.weekOverWeekTx >= 0 ? 'text-profit-500' : 'text-warm-500'}`}>
                    {pct(metrics.weekOverWeekTx)}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {fmtNum(metrics.recent.transactions)} vs {fmtNum(metrics.previous.transactions)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-xs font-medium text-text-muted uppercase">Trend 8 Minggu</p>
                  <p className={`mt-1 text-2xl font-extrabold ${metrics.revTrend >= 0 ? 'text-profit-500' : 'text-warm-500'}`}>
                    {pct(metrics.revTrend)}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">perubahan revenue dari minggu pertama</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Weekly Revenue Trend */}
          {data.weeklyData.length > 0 && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-500">Trend Revenue (8 Minggu)</h2>
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="space-y-3">
                  {data.weeklyData.map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[11px] text-text-muted text-right">{w.label}</span>
                      <div className="flex-1">
                        <TrendBar value={w.revenue} max={metrics?.maxRev || 1} color="bg-warm-400" />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs font-medium text-navy-600">{fmt(w.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Weekly Transaction Trend */}
          {data.weeklyData.length > 0 && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-electric-500">Trend Transaksi (8 Minggu)</h2>
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="space-y-3">
                  {data.weeklyData.map((w, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[11px] text-text-muted text-right">{w.label}</span>
                      <div className="flex-1">
                        <TrendBar value={w.transactions} max={metrics?.maxTx || 1} color="bg-electric-400" />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs font-medium text-navy-600">{fmtNum(w.transactions)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* AOV Trend */}
          {data.weeklyData.length > 0 && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy-500">Trend AOV (8 Minggu)</h2>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-cream/50">
                      <th className="px-4 py-3 text-xs font-medium text-text-muted">Periode</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Revenue</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">Transaksi</th>
                      <th className="px-4 py-3 text-xs font-medium text-text-muted text-right">AOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyData.map((w, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-navy-600">{w.label}</td>
                        <td className="px-4 py-3 text-right text-text-secondary">{fmt(w.revenue)}</td>
                        <td className="px-4 py-3 text-right text-text-secondary">{fmtNum(w.transactions)}</td>
                        <td className="px-4 py-3 text-right font-medium text-profit-600">{fmt(w.aov)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Monthly Overview */}
          {data.monthlyData.length > 0 && data.monthlyData.some(m => m.revenue > 0) && (
            <motion.div variants={item}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-profit-500">Overview Bulanan</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {data.monthlyData.map((m, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface p-5">
                    <p className="text-xs font-medium text-text-muted uppercase">{m.label}</p>
                    <p className="mt-1 text-lg font-extrabold text-navy-700">{fmt(m.revenue)}</p>
                    <p className="mt-1 text-[11px] text-text-muted">{fmtNum(m.transaksi || m.transactions)} transaksi &middot; AOV {fmt(m.aov)}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Empty State */}
          {data.weeklyData.every(w => w.revenue === 0 && w.transactions === 0) && (
            <motion.div variants={item} className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              <p className="mt-3 text-sm font-medium text-navy-600">Belum ada data</p>
              <p className="mt-1 text-xs text-text-muted">
                Benchmarking akan menampilkan data setelah ada minimal 1 minggu transaksi.
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Empty State - no business */}
      {!business && !loading && (
        <div className="mt-12 text-center">
          <p className="text-sm text-text-muted">Pilih bisnis terlebih dahulu untuk melihat benchmarking.</p>
        </div>
      )}
    </div>
  )
}
