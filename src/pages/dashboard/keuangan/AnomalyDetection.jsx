import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import BackButton from '../../../components/BackButton'
import { getPeriodRange } from '../../../sections/FinancialReports/calculateFinancialReports'
import {
  aggregateDailyTotals,
  calculateTimeSeriesAnomalies,
  analyzeExpenseContributors,
} from '../../../sections/AnomalyDetection/calculateTimeSeriesAnomalies'
import { calculateTransactionAnomalies } from '../../../sections/AnomalyDetection/calculateTransactionAnomalies'

const selectCls = 'rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none'

const PERIOD_OPTIONS = [
  { value: 7, label: '7 Hari' },
  { value: 14, label: '14 Hari' },
  { value: 30, label: '30 Hari' },
  { value: 60, label: '60 Hari' },
  { value: 90, label: '90 Hari' },
]

const SEVERITY_COLORS = {
  critical: 'border-red-300 bg-red-50',
  attention: 'border-yellow-300 bg-yellow-50',
}

const SEVERITY_LABELS = {
  critical: 'Kritis',
  attention: 'Perhatian',
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'sales', label: 'Penjualan' },
  { value: 'expenses', label: 'Pengeluaran' },
  { value: 'transaction', label: 'Transaksi' },
  { value: 'critical', label: 'Kritis' },
  { value: 'attention', label: 'Perhatian' },
]

function SeverityBadge({ severity }) {
  const colors = {
    critical: 'bg-red-100 text-red-600 border-red-200',
    attention: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${colors[severity] || 'bg-gray-100 text-gray-600'}`}>
      {SEVERITY_LABELS[severity] || severity}
    </span>
  )
}

function DirectionBadge({ direction }) {
  const isIncrease = direction === 'increase'
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold ${isIncrease ? 'text-profit-600' : 'text-red-500'}`}>
      {isIncrease ? '↑' : '↓'}
    </span>
  )
}

function AnomalyCard({ anomaly, contributors }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`rounded-xl border p-4 ${SEVERITY_COLORS[anomaly.severity] || 'border-border bg-surface'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={anomaly.severity} />
            <DirectionBadge direction={anomaly.direction} />
            <span className="text-[10px] font-bold uppercase text-text-muted">{anomaly.type === 'transaction' ? 'Transaksi' : 'Harian'}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-navy-700">{anomaly.explanation}</p>

          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-muted">Nilai saat ini</span>
              <span className="font-semibold text-navy-700">{formatCurrency(anomaly.currentValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Median baseline</span>
              <span className="font-semibold text-navy-700">{formatCurrency(anomaly.baselineMedian)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Selisih</span>
              <span className={`font-semibold ${anomaly.difference > 0 ? 'text-profit-600' : 'text-red-500'}`}>
                {anomaly.difference > 0 ? '+' : ''}{formatCurrency(anomaly.difference)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Perubahan</span>
              <span className="font-semibold text-navy-700">{anomaly.percentageDifference}%</span>
            </div>
            {anomaly.robustScore !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Robust Score</span>
                <span className="font-semibold text-navy-700">{anomaly.robustScore} MAD</span>
              </div>
            )}
            {anomaly.isMadZero && (
              <div className="flex justify-between">
                <span className="text-text-muted">Metode</span>
                <span className="font-semibold text-navy-700">Persentase (MAD=0)</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted">Confidence</span>
              <span className="font-semibold text-navy-700">{anomaly.confidence}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Tanggal</span>
              <span className="font-semibold text-navy-700">{anomaly.date}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Expense category contributors */}
      {anomaly.metric === 'expenses' && contributors && contributors.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-semibold text-warm-500 hover:underline"
          >
            {expanded ? 'Sembunyikan' : 'Lihat Kontributor'} ({contributors.length} kategori)
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden"
              >
                <div className="space-y-1">
                  {contributors.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-1.5 text-[10px]">
                      <span className="font-medium text-navy-700">{c.category}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-text-muted">{formatCurrency(c.amount)}</span>
                        <span className={`font-semibold ${c.difference > 0 ? 'text-red-500' : 'text-profit-600'}`}>
                          {c.difference > 0 ? '+' : ''}{formatCurrency(c.difference)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default function AnomalyDetection() {
  const { business } = useAuth()
  const [periodDays, setPeriodDays] = useState(30)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMethodology, setShowMethodology] = useState(false)

  // Raw data
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])

  // Date ranges — computed from periodDays, not Date.now() during render
  const now = useMemo(() => new Date(), [])
  const { start, end } = useMemo(() => {
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - periodDays)
    const endDate = new Date(now)
    return getPeriodRange('custom',
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    )
  }, [periodDays, now])

  // Baseline needs extra history
  const baselineStart = useMemo(() => {
    const d = new Date(start)
    d.setDate(d.getDate() - 60) // extra 60 days for baseline
    return d
  }, [start])

  useEffect(() => {
    if (!business?.id) return
    loadData()
  }, [business?.id, periodDays])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const baselineStartStr = baselineStart.toISOString().split('T')[0]
      const endStr = end.toISOString().split('T')[0]

      const [salesResult, expensesResult] = await Promise.all([
        supabase
          .from('sales')
          .select('id, product_id, quantity, unit_price, total, sale_date')
          .eq('business_id', business.id)
          .gte('sale_date', baselineStartStr)
          .lte('sale_date', endStr)
          .order('sale_date'),
        supabase
          .from('expenses')
          .select('id, category, description, amount, expense_date')
          .eq('business_id', business.id)
          .gte('expense_date', baselineStartStr)
          .lte('expense_date', endStr)
          .order('expense_date'),
      ])

      if (salesResult.error) throw salesResult.error
      if (expensesResult.error) throw expensesResult.error

      setSales(salesResult.data || [])
      setExpenses(expensesResult.data || [])
    } catch (err) {
      console.error('Anomaly detection load error:', err)
      setError('Gagal memuat data anomali. Silakan coba lagi.')
    }

    setLoading(false)
  }

  // ── Aggregate daily totals ──
  const salesByDay = useMemo(() => aggregateDailyTotals(sales, 'sale_date', 'total'), [sales])
  const expensesByDay = useMemo(() => aggregateDailyTotals(expenses, 'expense_date', 'amount'), [expenses])

  // ── Target dates (only the display period) ──
  const targetDates = useMemo(() => {
    const dates = []
    const d = new Date(start)
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0])
      d.setDate(d.getDate() + 1)
    }
    return dates
  }, [start, end])

  // ── Data readiness ──
  const totalUniqueDays = useMemo(() => {
    const allDays = new Set([...salesByDay.keys(), ...expensesByDay.keys()])
    return allDays.size
  }, [salesByDay, expensesByDay])

  const totalTransactions = sales.length + expenses.length
  const hasEnoughData = totalUniqueDays >= 14 || totalTransactions >= 20

  // ── Run detection ──
  const tsResult = useMemo(() => {
    if (!hasEnoughData) return { anomalies: [], summary: { totalAnomalies: 0, criticalAnomalies: 0, attentionAnomalies: 0, normalDays: 0, totalDaysAnalyzed: 0 } }
    return calculateTimeSeriesAnomalies({ salesByDay, expensesByDay, targetDates })
  }, [salesByDay, expensesByDay, targetDates, hasEnoughData])

  const txResult = useMemo(() => {
    if (!hasEnoughData) return { anomalies: [], summary: { totalAnomalies: 0, criticalAnomalies: 0, attentionAnomalies: 0 } }
    return calculateTransactionAnomalies({
      salesTransactions: sales.filter(s => targetDates.includes(String(s.sale_date).slice(0, 10))),
      expenseTransactions: expenses.filter(e => targetDates.includes(String(e.expense_date).slice(0, 10))),
    })
  }, [sales, expenses, targetDates, hasEnoughData])

  // ── Merge and deduplicate ──
  const allAnomalies = useMemo(() => {
    const merged = [...tsResult.anomalies, ...txResult.anomalies]

    // Dedup: same date + metric → keep time_series as primary, transaction as related
    const seen = new Map()
    for (const a of merged) {
      const key = `${a.date}_${a.metric}_${a.severity}`
      if (!seen.has(key)) {
        seen.set(key, a)
      }
    }

    return Array.from(seen.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      const sev = { critical: 0, attention: 1 }
      return (sev[a.severity] || 2) - (sev[b.severity] || 2)
    })
  }, [tsResult, txResult])

  // ── Filter ──
  const filteredAnomalies = useMemo(() => {
    if (filter === 'all') return allAnomalies
    if (filter === 'critical') return allAnomalies.filter(a => a.severity === 'critical')
    if (filter === 'attention') return allAnomalies.filter(a => a.severity === 'attention')
    if (filter === 'transaction') return allAnomalies.filter(a => a.type === 'transaction')
    return allAnomalies.filter(a => a.metric === filter)
  }, [allAnomalies, filter])

  // ── Expense contributors for anomaly days ──
  const expenseContributors = useMemo(() => {
    const result = {}
    for (const a of allAnomalies) {
      if (a.metric !== 'expenses' || a.type !== 'time_series') continue
      const dayExpenses = expenses.filter(e => String(e.expense_date).slice(0, 10) === a.date)
      if (dayExpenses.length === 0) continue

      // Build historical by category
      const historicalByCategory = new Map()
      for (const e of expenses) {
        const eDate = String(e.expense_date).slice(0, 10)
        if (eDate === a.date) continue
        const cat = e.category || 'Lainnya'
        if (!historicalByCategory.has(cat)) historicalByCategory.set(cat, [])
        historicalByCategory.get(cat).push(Number(e.amount) || 0)
      }

      result[a.date] = analyzeExpenseContributors(dayExpenses, historicalByCategory)
    }
    return result
  }, [allAnomalies, expenses])

  const totalAnomalies = tsResult.summary.totalAnomalies + txResult.summary.totalAnomalies
  const criticalCount = tsResult.summary.criticalAnomalies + txResult.summary.criticalAnomalies
  const attentionCount = tsResult.summary.attentionAnomalies + txResult.summary.attentionAnomalies
  const hasAnyData = sales.length > 0 || expenses.length > 0

  // ── Loading state ──
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-navy-700">Anomaly Detection</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl border border-border bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Anomaly Detection</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Deteksi pola tidak biasa dari data bisnis Anda sendiri.
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
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className={`mt-1 ${selectCls}`}
          >
            {PERIOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted">Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`mt-1 ${selectCls}`}
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* No data */}
      {!hasAnyData && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada transaksi.</p>
          <p className="mt-2 text-sm text-text-muted">
            Mulai mencatat penjualan atau pengeluaran untuk mendeteksi pola.
          </p>
        </div>
      )}

      {/* Cold start */}
      {hasAnyData && !hasEnoughData && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum cukup data untuk mendeteksi pola.</p>
          <p className="mt-2 text-sm text-text-muted">
            Business Sehat membutuhkan lebih banyak riwayat transaksi untuk mengenali pola bisnis Anda.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4 max-w-sm mx-auto">
            <div>
              <p className="text-lg font-extrabold text-navy-700">{totalUniqueDays}</p>
              <p className="text-[10px] text-text-muted">hari data</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-navy-700">{totalTransactions}</p>
              <p className="text-[10px] text-text-muted">transaksi</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-warm-500">14 / 20</p>
              <p className="text-[10px] text-text-muted">minimum</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {hasAnyData && hasEnoughData && (
        <>
          {/* Summary */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Total Anomali</p>
              <p className="mt-1 text-2xl font-extrabold text-navy-700">{totalAnomalies}</p>
              <p className="text-[10px] text-text-muted">{periodDays} hari dianalisis</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-500">Kritis</p>
              <p className="mt-1 text-2xl font-extrabold text-red-600">{criticalCount}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-yellow-600">Perhatian</p>
              <p className="mt-1 text-2xl font-extrabold text-yellow-700">{attentionCount}</p>
            </div>
          </div>

          {/* No anomalies found */}
          {filteredAnomalies.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
              <p className="text-lg font-semibold text-navy-700">Belum ditemukan anomali berarti pada periode ini.</p>
              <p className="mt-2 text-sm text-text-muted">
                Data bisnis Anda terlihat dalam pola normal.
              </p>
            </div>
          )}

          {/* Anomaly Cards */}
          {filteredAnomalies.length > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-sm font-bold text-navy-700">
                {filteredAnomalies.length} Anomali Ditemukan
              </h2>
              {filteredAnomalies.map((anomaly, i) => (
                <AnomalyCard
                  key={`${anomaly.date}_${anomaly.metric}_${anomaly.type}_${i}`}
                  anomaly={anomaly}
                  contributors={expenseContributors[anomaly.date]}
                />
              ))}
            </div>
          )}

          {/* Methodology */}
          <div className="mt-8">
            <button
              onClick={() => setShowMethodology(!showMethodology)}
              className="flex items-center gap-2 text-sm font-bold text-navy-700"
            >
              <svg
                className={`h-4 w-4 transition-transform ${showMethodology ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              Bagaimana anomali dihitung?
            </button>
            <AnimatePresence>
              {showMethodology && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <div className="rounded-xl border border-border bg-surface p-4 text-xs text-text-secondary space-y-2">
                    <p>
                      Business Sehat membandingkan data bisnis dengan pola historis bisnis Anda sendiri.
                      Sistem menggunakan <strong>median</strong> dan <strong>MAD</strong> (Median Absolute Deviation)
                      agar hasil tidak mudah dipengaruhi oleh satu transaksi ekstrem.
                    </p>
                    <p>
                      Anomali terdeteksi ketika nilai saat ini berbeda secara tidak biasa dari pola
                      hari yang sama di minggu-minggu sebelumnya (Senin dibanding Senin, dst).
                    </p>
                    <p>
                      <strong>Anomali bukan berarti kesalahan.</strong> Anomali hanya berarti
                      nilainya berbeda secara tidak biasa dari pola historis. Ini bisa positif
                      (penjualan naik signifikan) atau perlu diperhatikan (pengeluaran naik tiba-tiba).
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Threshold: Perhatian ≥ 1.5 MAD, Kritis ≥ 3 MAD.
                      Confidence: Terbatas (&lt;5 data), Sedang (5-7), Tinggi (8+).
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
