import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { calculateTaxPlanning } from '../../../sections/TaxPlanning/calculateTaxPlanning'
import TaxPlanningInput from '../../../sections/TaxPlanning/TaxPlanningInput'
import TaxPlanningResults from '../../../sections/TaxPlanning/TaxPlanningResults'
import BackButton from '../../../components/BackButton'

const EMPTY_FORM = {
  businessName: '',
  taxRegime: 'umkm_final',
  customRate: '',
  revenueMode: 'annual',
  revenue: '',
  hasNPWP: true,
  taxAlreadyPaid: '',
  taxCredits: '',
  showMonthlyBreakdown: false,
}

export default function TaxPlanning() {
  const { business } = useAuth()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [expenses, setExpenses] = useState([])
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const [supabaseError, setSupabaseError] = useState('')
  const [showHistory, setShowHistory] = useState(true)

  // ── Load history ──
  useEffect(() => {
    if (!business?.id) return
    loadHistory()
  }, [business?.id])

  async function loadHistory() {
    const { data } = await supabase
      .from('tax_plannings')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory(data || [])
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
    return calculateTaxPlanning({
      revenue: Number(form.revenue) || 0,
      revenueMode: form.revenueMode,
      taxRegime: form.taxRegime,
      customRate: Number(form.customRate) || 0,
      expenses,
      taxAlreadyPaid: Number(form.taxAlreadyPaid) || 0,
      taxCredits: Number(form.taxCredits) || 0,
      hasNPWP: form.hasNPWP,
    })
  }, [form, expenses])

  // ── Validate before save ──
  function validateForm() {
    const errs = []
    if (!form.revenue || Number(form.revenue) <= 0) {
      errs.push('Pendapatan wajib diisi dan lebih dari 0')
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

    if (!business?.id) {
      setSupabaseError('Data bisnis belum dimuat. Silakan refresh halaman.')
      setSaving(false)
      return
    }

    setSaving(true)
    setSupabaseError('')

    const num = (v) => (Number.isFinite(v) ? v : 0)

    const payload = {
      business_id: business.id,
      period: form.revenueMode === 'monthly' ? 'monthly_input' : 'annual',
      tax_regime: form.taxRegime,
      revenue: num(result.revenue),
      deductible_expenses: num(result.deductibleExpenses),
      taxable_base: num(result.taxableBase),
      estimated_tax: num(result.estimatedTax),
      tax_already_paid: num(result.taxAlreadyPaid),
      remaining_tax: num(result.remainingTax),
      effective_tax_rate: num(result.effectiveTaxRate),
      post_tax_profit: num(result.postTaxProfit),
      monthly_tax_reserve: num(result.monthlyTaxReserve),
      annual_tax_reserve: num(result.annualTaxReserve),
      scenario_data: result.scenarios || [],
      monthly_breakdown: result.monthlyBreakdown || [],
      notes: form.businessName || '',
    }

    const { error, data } = await supabase.from('tax_plannings').insert(payload).select()

    if (error) {
      console.error('Tax planning save error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        query: error.query,
        stack: error.stack,
      })

      // Debug: log payload being sent
      console.error('Payload being sent:', JSON.stringify(payload, null, 2))

      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setSupabaseError('Tabel tax_plannings belum tersedia di database. Jalankan migration 012_tax_planning.sql di Supabase Dashboard → SQL Editor.')
      } else if (error.code === '42501') {
        setSupabaseError('Anda tidak memiliki akses untuk menyimpan data ini.')
      } else {
        setSupabaseError('Gagal menyimpan Tax Planning. Lihat konsol untuk detail error.')
      }

      setSaving(false)
      return
    }

    setSaving(false)
    loadHistory()
  }

  // ── Reuse history item ──
  function reuseHistory(item) {
    setForm({
      businessName: item.notes || '',
      taxRegime: item.tax_regime || 'umkm_final',
      customRate: '',
      revenueMode: item.period === 'monthly_input' ? 'monthly' : 'annual',
      revenue: String(item.revenue || ''),
      hasNPWP: true,
      taxAlreadyPaid: String(item.tax_already_paid || ''),
      taxCredits: '',
      showMonthlyBreakdown: false,
    })
    setExpenses([])
    setShowHistory(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Delete history item ──
  async function deleteHistory(id) {
    if (!confirm('Hapus tax planning ini?')) return
    await supabase.from('tax_plannings').delete().eq('id', id).eq('business_id', business.id)
    loadHistory()
  }

  // ── Reset form ──
  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setExpenses([])
    setErrors([])
    setSupabaseError('')
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Tax Planning</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Estimasi kewajiban pajak dan perencanaan dana pajak bisnis Anda.
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
          <TaxPlanningInput
            form={form}
            setField={setField}
            expenses={expenses}
            setExpenses={setExpenses}
          />
        </div>

        {/* Right: Results */}
        <div className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24 lg:self-start">
          <TaxPlanningResults
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
            Riwayat Tax Planning ({history.length})
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
                            {item.notes || 'Tax Planning'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            {new Date(item.created_at).toLocaleDateString('id-ID')} · {item.tax_regime}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Estimasi Pajak</span>
                          <span className="font-semibold text-warm-500">{formatCurrency(item.estimated_tax)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Sisa Pajak</span>
                          <span className="font-semibold text-navy-700">{formatCurrency(item.remaining_tax)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">Profit Setelah Pajak</span>
                          <span className={`font-semibold ${item.post_tax_profit < 0 ? 'text-red-500' : 'text-profit-600'}`}>
                            {formatCurrency(item.post_tax_profit)}
                          </span>
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
