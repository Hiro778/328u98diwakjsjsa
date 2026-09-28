import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  saveLoanSimulation,
  getLoanSimulationsByBusiness,
  deleteLoanSimulation,
} from '../../../lib/loanSimulationService'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { calculateLoanSimulation, compareLoanMethods } from '../../../sections/LoanSimulation/calculateLoanSimulation'
import LoanSimulationInput from '../../../sections/LoanSimulation/LoanSimulationInput'
import LoanSimulationResults from '../../../sections/LoanSimulation/LoanSimulationResults'
import BackButton from '../../../components/BackButton'

const EMPTY_FORM = {
  principal: '',
  annualInterestRate: '12',
  tenorValue: '12',
  tenorUnit: 'months',
  tenorMonths: 12,
  method: 'annuity',
  adminFee: '',
  provisionRate: '',
  otherFee: '',
}

export default function LoanSimulation() {
  const { business } = useAuth()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const [supabaseError, setSupabaseError] = useState('')
  const [showHistory, setShowHistory] = useState(true)

  // ── Load history ──
  const loadHistory = useCallback(async () => {
    if (!business?.id) return
    setLoadingHistory(true)
    const data = await getLoanSimulationsByBusiness(business.id, 20)
    setHistory(data || [])
    setLoadingHistory(false)
  }, [business?.id])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // ── Form setter ──
  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors([])
    setSupabaseError('')
  }

  // ── Live calculation ──
  const result = useMemo(() => calculateLoanSimulation({
    principal: Number(form.principal) || 0,
    annualInterestRate: Number(form.annualInterestRate) || 0,
    tenorMonths: Number(form.tenorMonths) || 0,
    method: form.method,
    adminFee: Number(form.adminFee) || 0,
    provisionRate: Number(form.provisionRate) || 0,
    otherFee: Number(form.otherFee) || 0,
  }), [form])

  // ── Method comparison ──
  const comparison = useMemo(() => {
    if (!result.isValid) return []
    return compareLoanMethods({
      principal: Number(form.principal) || 0,
      annualInterestRate: Number(form.annualInterestRate) || 0,
      tenorMonths: Number(form.tenorMonths) || 0,
      adminFee: Number(form.adminFee) || 0,
      provisionRate: Number(form.provisionRate) || 0,
      otherFee: Number(form.otherFee) || 0,
    })
  }, [form, result.isValid])

  // ── Validate before save ──
  function validateForm() {
    const errs = []
    if (!form.principal || Number(form.principal) <= 0) {
      errs.push('Jumlah pinjaman wajib diisi')
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

    try {
      const payload = {
        business_id: business.id,
        principal: result.principal,
        annual_interest_rate: result.annualInterestRate,
        tenor_months: result.tenorMonths,
        method: result.method,
        admin_fee: Number(form.adminFee) || 0,
        provision_rate: Number(form.provisionRate) || 0,
        other_fee: Number(form.otherFee) || 0,
        monthly_payment: result.monthlyPayment,
        total_interest: result.totalInterest,
        total_fees: result.totalFees,
        total_payment: result.totalPayment,
        effective_total_cost: result.effectiveTotalCost,
        schedule: result.amortizationSchedule,
      }

      await saveLoanSimulation(payload)
      await loadHistory()
    } catch (err) {
      setSupabaseError(err.message || 'Gagal menyimpan simulasi. Silakan coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  // ── Reuse history item ──
  function reuseHistory(item) {
    setForm({
      principal: String(item.principal || ''),
      annualInterestRate: String(item.annual_interest_rate || ''),
      tenorValue: String(item.tenor_months || ''),
      tenorUnit: 'months',
      tenorMonths: item.tenor_months,
      method: item.method || 'annuity',
      adminFee: String(item.admin_fee || ''),
      provisionRate: String(item.provision_rate || ''),
      otherFee: String(item.other_fee || ''),
    })
    setShowHistory(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Delete history item ──
  async function deleteHistory(id) {
    if (!confirm('Hapus simulasi pinjaman ini?')) return
    const ok = await deleteLoanSimulation(id, business.id)
    if (ok) {
      await loadHistory()
    } else {
      setSupabaseError('Gagal menghapus simulasi pinjaman.')
    }
  }

  // ── Reset form ──
  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setErrors([])
    setSupabaseError('')
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Loan Simulation</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Simulasi pinjaman dengan berbagai metode bunga.
          </p>
        </div>
        <button
          onClick={resetForm}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
        >
          Reset Form
        </button>
      </div>

      {/* Supabase error */}
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
      </AnimatePresence>

      {/* Main content */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: Form */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <LoanSimulationInput
            form={form}
            setField={setField}
          />
        </div>

        {/* Right: Results */}
        <div className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24 lg:self-start">
          <LoanSimulationResults
            result={result}
            comparison={comparison}
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
            Riwayat Simulasi ({history.length})
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
                            {formatCurrency(item.principal)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {new Date(item.created_at).toLocaleDateString('id-ID')} · {item.method} · {item.tenor_months} bln
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Cicilan/bulan</span>
                          <span className="font-semibold text-navy-700">{formatCurrency(item.monthly_payment)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Total bunga</span>
                          <span className="font-semibold text-warm-500">{formatCurrency(item.total_interest)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Total bayar</span>
                          <span className="font-semibold text-navy-700">{formatCurrency(item.total_payment)}</span>
                        </div>
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
