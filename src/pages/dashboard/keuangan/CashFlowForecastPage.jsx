import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { calculateCashFlowForecast } from '../../../sections/CashFlowForecast/calculateCashFlowForecast'
import CashFlowInputForm from '../../../sections/CashFlowForecast/CashFlowInputForm'
import CashFlowResults from '../../../sections/CashFlowForecast/CashFlowResults'
import BackButton from '../../../components/BackButton'
import { saveCashFlowForecast, getCashFlowForecastsByBusiness, deleteCashFlowForecast } from '../../../lib/cashFlowService'

const EMPTY_FORM = {
  openingCash: '',
  forecastPeriod: '3_months',
}

const EMPTY_TRANSACTIONS = {
  inflows: [],
  outflows: [],
}

export default function CashFlowForecastPage() {
  const { business } = useAuth()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [transactions, setTransactions] = useState({ ...EMPTY_TRANSACTIONS })
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const [supabaseError, setSupabaseError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [showHistory, setShowHistory] = useState(true)

  // ── Load history ──
  useEffect(() => {
    if (!business?.id) return
    loadHistory()
  }, [business?.id])

  async function loadHistory() {
    setLoadingHistory(true)
    const data = await getCashFlowForecastsByBusiness(business.id)
    setHistory(data)
    setLoadingHistory(false)
  }

  // ── Form setter ──
  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors([])
    setSupabaseError('')
  }

  // ── Live calculation ──
  const result = useMemo(() => {
    const inflows = transactions.inflows
      .filter(t => t.name || Number(t.amount) > 0)
      .map(t => ({
        name: t.name || 'Tanpa Nama',
        amount: Number(t.amount) || 0,
        frequency: t.frequency,
        startPeriod: Number(t.startPeriod) || 1,
        endPeriod: t.endPeriod ? Number(t.endPeriod) : null,
      }))

    const outflows = transactions.outflows
      .filter(t => t.name || Number(t.amount) > 0)
      .map(t => ({
        name: t.name || 'Tanpa Nama',
        amount: Number(t.amount) || 0,
        frequency: t.frequency,
        startPeriod: Number(t.startPeriod) || 1,
        endPeriod: t.endPeriod ? Number(t.endPeriod) : null,
      }))

    return calculateCashFlowForecast({
      openingCash: Number(form.openingCash) || 0,
      forecastPeriod: form.forecastPeriod,
      inflows,
      outflows,
    })
  }, [form, transactions])

  // ── Validate before save ──
  function validateForm() {
    const errs = []
    if (!form.openingCash || Number(form.openingCash) < 0) {
      errs.push('Saldo kas saat ini wajib diisi')
    }
    if (transactions.inflows.length === 0 && transactions.outflows.length === 0) {
      errs.push('Tambahkan minimal satu pemasukan atau pengeluaran')
    }
    return errs
  }

  // ── Save to Supabase ──
  async function handleSave() {
    const formErrors = validateForm()
    const calcErrors = result.errors || []
    const allErrors = [...formErrors, ...calcErrors]
    if (allErrors.length > 0) {
      setErrors(allErrors)
      return
    }

    setSaving(true)
    setSupabaseError('')

    const num = (v) => (Number.isFinite(v) ? v : 0)

    const inflows = transactions.inflows
      .filter(t => t.name || Number(t.amount) > 0)
      .map(t => ({
        name: t.name || 'Tanpa Nama',
        amount: Number(t.amount) || 0,
        frequency: t.frequency,
        startPeriod: Number(t.startPeriod) || 1,
        endPeriod: t.endPeriod ? Number(t.endPeriod) : null,
      }))

    const outflows = transactions.outflows
      .filter(t => t.name || Number(t.amount) > 0)
      .map(t => ({
        name: t.name || 'Tanpa Nama',
        amount: Number(t.amount) || 0,
        frequency: t.frequency,
        startPeriod: Number(t.startPeriod) || 1,
        endPeriod: t.endPeriod ? Number(t.endPeriod) : null,
      }))

    const payload = {
      business_id: business.id,
      forecast_name: '',
      forecast_period: form.forecastPeriod,
      opening_cash: num(result.openingCash),
      total_inflows: num(result.totalInflows),
      total_outflows: num(result.totalOutflows),
      net_cash_flow: num(result.netCashFlow),
      closing_cash: num(result.closingCash),
      minimum_cash_balance: num(result.minimumCashBalance),
      maximum_cash_balance: num(result.maximumCashBalance),
      shortfall_detected: result.shortfallDetected,
      shortfall_amount: num(result.shortfallAmount),
      inflows,
      outflows,
      periods: result.periods,
    }

    try {
      await saveCashFlowForecast(payload, history)
      setSaving(false)
      setSaveMessage('History telah disimpan')
      setTimeout(() => setSaveMessage(''), 4000)
      loadHistory()
    } catch (err) {
      setSupabaseError(err.message || 'Gagal menyimpan forecast. Silakan coba lagi.')
      setSaving(false)
    }
  }

  // ── Reuse history item ──
  function reuseHistory(item) {
    setForm({
      openingCash: String(item.opening_cash || ''),
      forecastPeriod: item.forecast_period || '3_months',
    })
    setTransactions({
      inflows: Array.isArray(item.inflows) ? item.inflows.map(t => ({
        name: t.name || '',
        amount: String(t.amount || ''),
        frequency: t.frequency || 'monthly',
        startPeriod: String(t.startPeriod || 1),
        endPeriod: t.endPeriod ? String(t.endPeriod) : '',
      })) : [],
      outflows: Array.isArray(item.outflows) ? item.outflows.map(t => ({
        name: t.name || '',
        amount: String(t.amount || ''),
        frequency: t.frequency || 'monthly',
        startPeriod: String(t.startPeriod || 1),
        endPeriod: t.endPeriod ? String(t.endPeriod) : '',
      })) : [],
    })
    setShowHistory(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Delete history item ──
  async function deleteHistory(id) {
    if (!confirm('Hapus forecast arus kas ini?')) return
    await deleteCashFlowForecast(id, business.id)
    loadHistory()
  }

  // ── Reset form ──
  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setTransactions({ ...EMPTY_TRANSACTIONS })
    setErrors([])
    setSupabaseError('')
  }

  // ── Check if there are transactions ──
  const hasTransactions = transactions.inflows.length > 0 || transactions.outflows.length > 0

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Cash Flow Forecast</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Proyeksi arus kas bisnis Anda ke depan. Ketahui kapan uang cukup dan kapan perlu waspada.
          </p>
        </div>
        <button
          onClick={resetForm}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
        >
          Reset Form
        </button>
      </div>

      {/* Supabase error / success banner */}
      <AnimatePresence>
        {supabaseError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
          >
            {supabaseError}
          </motion.div>
        )}
        {saveMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
          >
            <span>{saveMessage}</span>
            <button
              type="button"
              onClick={() => setSaveMessage('')}
              className="text-xs text-emerald-700 hover:text-emerald-900"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state: no transactions */}
      {!hasTransactions && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada proyeksi arus kas.</p>
          <p className="mt-2 text-sm text-text-muted">
            Mulai dengan menambahkan saldo kas, pemasukan, atau pengeluaran.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={() => {
                setTransactions(prev => ({
                  ...prev,
                  inflows: [...prev.inflows, { name: '', amount: '', frequency: 'monthly', startPeriod: '1', endPeriod: '' }],
                }))
              }}
              className="rounded-xl bg-profit-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
            >
              + Tambah Pemasukan
            </button>
            <button
              onClick={() => {
                setTransactions(prev => ({
                  ...prev,
                  outflows: [...prev.outflows, { name: '', amount: '', frequency: 'monthly', startPeriod: '1', endPeriod: '' }],
                }))
              }}
              className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
            >
              + Tambah Pengeluaran
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: Form */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <CashFlowInputForm
            form={form}
            setField={setField}
            transactions={transactions}
            setTransactions={setTransactions}
          />
        </div>

        {/* Right: Results */}
        <div className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24 lg:self-start">
          <CashFlowResults
            result={result}
            onSave={handleSave}
            saving={saving}
            errors={errors}
          />
        </div>
      </div>

      {/* History */}
      {!loadingHistory && history.length > 0 && (
        <div className="mt-8">
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
            Riwayat Forecast ({history.length})
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
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-warm-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-navy-700 truncate">
                            {item.forecast_name || 'Forecast Arus Kas'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {new Date(item.created_at).toLocaleDateString('id-ID')} · {item.forecast_period?.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Saldo awal</span>
                          <span className="font-semibold text-navy-700">{formatCurrency(item.opening_cash)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Saldo akhir</span>
                          <span className={`font-semibold ${item.closing_cash < 0 ? 'text-red-500' : 'text-navy-700'}`}>
                            {formatCurrency(item.closing_cash)}
                          </span>
                        </div>
                        {item.shortfall_detected && (
                          <div className="flex justify-between text-xs">
                            <span className="text-red-500 font-semibold">⚠️ Kekurangan</span>
                            <span className="font-semibold text-red-500">{formatCurrency(item.shortfall_amount)}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => reuseHistory(item)}
                          className="flex-1 rounded-lg bg-cream px-2 py-1.5 text-[11px] font-semibold text-navy-700 transition-colors hover:bg-warm-50"
                        >
                          Gunakan Kembali
                        </button>
                        <button
                          onClick={() => deleteHistory(item.id)}
                          className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          Hapus
                        </button>
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
