import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { saveCalculationHistory } from '../../../lib/calculationHistoryService'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import { getPeriodRange } from '../../../sections/FinancialReports/calculateFinancialReports'
import { aggregateDailyTotals } from '../../../sections/AnomalyDetection/calculateTimeSeriesAnomalies'
import {
  calculateFinancialHealthScore,
  classifyScore,
} from '../../../sections/FinancialHealthScore/calculateFinancialHealthScore'

const SCORE_COLORS = {
  green: 'text-profit-600',
  yellow: 'text-yellow-600',
  orange: 'text-orange-500',
  red: 'text-red-500',
}

const SCORE_BG = {
  green: 'bg-profit-50 border-profit-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  orange: 'bg-orange-50 border-orange-200',
  red: 'bg-red-50 border-red-200',
}

function ComponentBar({ label, score, maxScore = 100, status, detail }) {
  const width = maxScore > 0 ? (score / maxScore) * 100 : 0
  const isUnavailable = status !== 'available'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-navy-700">{label}</span>
        <span className="text-xs font-bold text-navy-700">
          {isUnavailable ? '—' : `${score}/100`}
        </span>
      </div>
      <div className="h-2.5 bg-cream rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isUnavailable ? 'bg-gray-200' : 'bg-warm-400'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {detail && <p className="text-[10px] text-text-muted">{detail}</p>}
    </div>
  )
}

function ScoreRing({ score, classification }) {
  const circumference = 2 * Math.PI * 45
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f0eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          className={`${SCORE_COLORS[classification.color]} transition-all duration-1000`}
        />
      </svg>
      <div className="absolute text-center">
        <p className={`text-3xl font-extrabold ${SCORE_COLORS[classification.color]}`}>{score}</p>
        <p className="text-[10px] text-text-muted">/100</p>
      </div>
    </div>
  )
}

export default function FinancialHealthScore() {
  const { business } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])

  // Raw data
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [products, setProducts] = useState([])
  const [bepData, setBepData] = useState(null)

  // 30-day period
  const { start, end } = useMemo(() => getPeriodRange('last_3_months'), [])

  useEffect(() => {
    if (!business?.id) return
    loadData()
  }, [business?.id])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const startStr = start.toISOString().split('T')[0]
      const endStr = end.toISOString().split('T')[0]

      const [salesResult, expensesResult, productsResult, bepResult, historyResult] = await Promise.all([
        supabase
          .from('sales')
          .select('id, product_id, quantity, unit_price, total, sale_date')
          .eq('business_id', business.id)
          .gte('sale_date', startStr)
          .lte('sale_date', endStr)
          .order('sale_date'),
        supabase
          .from('expenses')
          .select('id, category, amount, expense_date')
          .eq('business_id', business.id)
          .gte('expense_date', startStr)
          .lte('expense_date', endStr)
          .order('expense_date'),
        supabase
          .from('products')
          .select('id, name, unit_price, cost_price')
          .eq('business_id', business.id)
          .eq('is_active', true),
        supabase
          .from('bep_calculations')
          .select('bep_revenue, created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('financial_health_scores')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (salesResult.error) throw salesResult.error
      if (expensesResult.error) throw expensesResult.error

      setSales(salesResult.data || [])
      setExpenses(expensesResult.data || [])
      setProducts(productsResult.data || [])
      setBepData(bepResult.data || null)
      setHistory(historyResult.data || [])
    } catch (err) {
      console.error('Financial health score load error:', err)
      setError('Gagal menghitung Financial Health Score. Silakan coba lagi.')
    }

    setLoading(false)
  }

  // ── Compute metrics ──
  const totalRevenue = useMemo(() => sales.reduce((s, sale) => s + (Number(sale.total) || 0), 0), [sales])
  const totalExpenses = useMemo(() => expenses.reduce((s, exp) => s + (Number(exp.amount) || 0), 0), [expenses])

  // Daily net cash flow (revenue - expenses per day)
  const dailyNetCashFlows = useMemo(() => {
    const salesByDay = aggregateDailyTotals(sales, 'sale_date', 'total')
    const expByDay = aggregateDailyTotals(expenses, 'expense_date', 'amount')
    const allDays = new Set([...salesByDay.keys(), ...expByDay.keys()])
    return Array.from(allDays).sort().map(day => (salesByDay.get(day) || 0) - (expByDay.get(day) || 0))
  }, [sales, expenses])

  // Daily revenues
  const dailyRevenues = useMemo(() => {
    const salesByDay = aggregateDailyTotals(sales, 'sale_date', 'total')
    return Array.from(salesByDay.values())
  }, [sales])

  // Products with HPP
  const productsWithHPP = useMemo(() =>
    products
      .filter(p => Number(p.unit_price) > 0 && Number(p.cost_price) > 0)
      .map(p => ({ unitPrice: Number(p.unit_price), costPrice: Number(p.cost_price) })),
  [products])

  // BEP revenue
  const bepRevenue = bepData?.bep_revenue || 0

  // Previous score
  const prevScore = history.length > 0 ? history[0].score : null

  // ── Calculate score ──
  const result = useMemo(() => calculateFinancialHealthScore({
    revenue: totalRevenue,
    totalExpenses,
    dailyNetCashFlows,
    productsWithHPP,
    bepRevenue,
    dailyRevenues,
    prevScore,
  }), [totalRevenue, totalExpenses, dailyNetCashFlows, productsWithHPP, bepRevenue, dailyRevenues, prevScore])

  // ── Save snapshot (once per session if score changed) ──
  useEffect(() => {
    if (!result.isValid || !business?.id) return
    if (prevScore === result.score) return // no change, don't duplicate

    async function saveSnapshot() {
      await saveCalculationHistory(supabase, {
        table: 'financial_health_scores',
        toolType: 'financial_health_score',
        businessId: business.id,
        payload: {
          business_id: business.id,
          analysis_period: '30_days',
          period_start: start.toISOString().split('T')[0],
          period_end: end.toISOString().split('T')[0],
          score: result.score,
          profitability_score: result.components.profitability?.score || 0,
          cash_flow_score: result.components.cashFlow?.score || 0,
          margin_score: result.components.margin?.score || 0,
          break_even_score: result.components.breakEven?.score || 0,
          stability_score: result.components.stability?.score || 0,
          metrics: {
            profitability: result.components.profitability?.metric,
            cashFlow: result.components.cashFlow?.metric,
            margin: result.components.margin?.metric,
            breakEven: result.components.breakEven?.metric,
            stability: result.components.stability?.metric,
          },
          risks: result.risks,
          positive_signals: result.positiveSignals,
        },
        existingHistory: history,
      })
      // Reload history
      const { data } = await supabase
        .from('financial_health_scores')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setHistory(data || [])
    }
    saveSnapshot()
  }, [result.isValid, result.score, business?.id, start, end, prevScore])

  const classification = result.isValid ? result.classification : classifyScore(0)
  const hasAnyData = sales.length > 0 || expenses.length > 0

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-navy-700">Financial Health Score</h1>
        <div className="mt-6 flex justify-center">
          <div className="h-32 w-32 rounded-full border-4 border-cream border-t-warm-400 animate-spin" />
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
          <h1 className="text-2xl font-extrabold text-navy-700">Financial Health Score</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Skor kesehatan finansial bisnis Anda berdasarkan data aktual.
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

      {/* Empty */}
      {!hasAnyData && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada data keuangan.</p>
          <p className="mt-2 text-sm text-text-muted">
            Mulai mencatat penjualan atau pengeluaran untuk melihat skor kesehatan finansial.
          </p>
        </div>
      )}

      {/* Cold start */}
      {hasAnyData && !result.isValid && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">BisnisSehat sedang mempelajari pola bisnis Anda.</p>
          <p className="mt-2 text-sm text-text-muted">
            Data belum cukup untuk menghitung indikator ini. Terus catat transaksi untuk mendapatkan skor.
          </p>
        </div>
      )}

      {/* Score */}
      {result.isValid && (
        <>
          {/* Score Hero */}
          <div className={`mt-6 rounded-2xl border p-6 ${SCORE_BG[classification.color]}`}>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <ScoreRing score={result.score} classification={classification} />
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <span className="text-2xl">{classification.emoji}</span>
                  <span className={`text-xl font-extrabold ${SCORE_COLORS[classification.color]}`}>
                    {classification.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Skor {result.score}/100 — {result.score >= 60 ? 'Bisnis Anda dalam kondisi baik.' : 'Perlu perhatian pada beberapa aspek.'}
                </p>
                {result.scoreChange !== null && (
                  <p className={`mt-1 text-xs font-semibold ${result.scoreChange > 0 ? 'text-profit-600' : result.scoreChange < 0 ? 'text-red-500' : 'text-text-muted'}`}>
                    {result.scoreChange > 0 ? `↑ +${result.scoreChange}` : result.scoreChange < 0 ? `↓ ${result.scoreChange}` : '— 0'}
                    {' '}vs periode sebelumnya
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Components */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-sm font-bold text-navy-700">Komponen Skor</h2>
            <div className="mt-4 space-y-4">
              <ComponentBar
                label="Profitability (30%)"
                score={result.components.profitability?.score || 0}
                status={result.components.profitability?.status}
                detail={result.components.profitability?.detail}
              />
              <ComponentBar
                label="Cash Flow (20%)"
                score={result.components.cashFlow?.score || 0}
                status={result.components.cashFlow?.status}
                detail={result.components.cashFlow?.detail}
              />
              <ComponentBar
                label="Margin (20%)"
                score={result.components.margin?.score || 0}
                status={result.components.margin?.status}
                detail={result.components.margin?.detail}
              />
              <ComponentBar
                label="Break-Even (15%)"
                score={result.components.breakEven?.score || 0}
                status={result.components.breakEven?.status}
                detail={result.components.breakEven?.detail}
              />
              <ComponentBar
                label="Stabilitas (15%)"
                score={result.components.stability?.score || 0}
                status={result.components.stability?.status}
                detail={result.components.stability?.detail}
              />
            </div>
          </div>

          {/* Positive Signals */}
          {result.positiveSignals.length > 0 && (
            <div className="mt-6 rounded-2xl border border-profit-200 bg-profit-50 p-6">
              <h2 className="text-sm font-bold text-profit-700">Indikator Positif</h2>
              <div className="mt-3 space-y-2">
                {result.positiveSignals.map((signal, i) => (
                  <p key={i} className="text-xs text-profit-600">{signal}</p>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {result.risks.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-sm font-bold text-navy-700">Risiko & Perhatian</h2>
              <div className="mt-3 space-y-2">
                {result.risks.map((risk, i) => (
                  <div key={i} className={`rounded-lg p-3 text-xs ${risk.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'}`}>
                    {risk.severity === 'critical' ? '🔴' : '🟡'} {risk.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anomaly context */}
          {result.anomalyCount > 0 && (
            <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-xs text-yellow-700">
                ⚠️ {result.anomalyCount} anomali keuangan terdeteksi dalam periode ini.
              </p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-sm font-bold text-navy-700"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${showHistory ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Riwayat Health Score ({history.length})
              </button>

              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 overflow-hidden"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {history.map(item => {
                        const cls = classifyScore(item.score)
                        return (
                          <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-muted">
                                {new Date(item.created_at).toLocaleDateString('id-ID')}
                              </span>
                              <span className={`text-lg font-extrabold ${SCORE_COLORS[cls.color]}`}>
                                {item.score}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-semibold">{cls.emoji} {cls.label}</p>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Methodology */}
          <div className="mt-6 rounded-xl border border-border bg-surface p-4">
            <p className="text-[10px] text-text-muted">
              Skor dihitung berdasarkan data penjualan, pengeluaran, HPP, dan BEP bisnis Anda.
              Komponen: Profitability (30%), Cash Flow (20%), Margin (20%), Break-Even (15%), Stabilitas (15%).
              Tidak menggunakan AI atau data bisnis lain.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
