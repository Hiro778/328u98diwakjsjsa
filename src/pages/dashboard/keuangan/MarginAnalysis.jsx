import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { getLatestHPPByProduct } from '../../../lib/hppService'
import { getProductsByBusiness } from '../../../lib/productService'
import { calculateMarginAnalysis, generateScenarios } from '../../../sections/MarginAnalysis/calculateMarginAnalysis'
import MarginAnalysisInput from '../../../sections/MarginAnalysis/MarginAnalysisInput'
import MarginAnalysisResults from '../../../sections/MarginAnalysis/MarginAnalysisResults'
import MarginAnalysisHistory from '../../../sections/MarginAnalysis/MarginAnalysisHistory'
import MarginAnalysisDetail from '../../../sections/MarginAnalysis/MarginAnalysisDetail'
import BackButton from '../../../components/BackButton'
import { saveCalculationHistory, SUCCESS_HISTORY_MESSAGE } from '../../../lib/calculationHistoryService'

const EMPTY_FORM = {
  productId: '',
  productName: '',
  costPerUnit: '',
  sellingPrice: '',
  discountPercent: '',
  sellingCostPerUnit: '',
  quantity: '1',
  analysisMode: 'price',
  targetMargin: '40',
  targetMarkup: '50',
  notes: '',
  existingCostPrice: 0,
  existingUnitPrice: 0,
}

export default function MarginAnalysis() {
  const { business } = useAuth()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [latestHPP, setLatestHPP] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const [supabaseError, setSupabaseError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [view, setView] = useState('calculator') // 'calculator' | 'history' | 'detail'
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => {
    if (!business?.id) return
    loadProducts()
  }, [business?.id])

  useEffect(() => {
    if (!business?.id) return
    loadHistory()
  }, [business?.id])

  async function loadProducts() {
    const data = await getProductsByBusiness(business.id)
    setProducts(data)
    setLoadingProducts(false)
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from('margin_analyses')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Margin Analysis history load error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      setHistory([])
    } else {
      setHistory(data || [])
    }
    setLoadingHistory(false)
  }

  // Load latest HPP when product is selected
  useEffect(() => {
    if (!business?.id || !form.productId) {
      setLatestHPP(null)
      return
    }
    async function loadLatestHPP() {
      const data = await getLatestHPPByProduct(form.productId, business.id)
      setLatestHPP(data && data.hpp_per_unit > 0 ? data : null)
    }
    loadLatestHPP()
  }, [business?.id, form.productId])

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors([])
    setSupabaseError('')
    setSaveMessage('')
  }

  function handleUseHPP() {
    if (latestHPP) {
      setField('costPerUnit', String(latestHPP.hpp_per_unit))
    }
  }

  const result = useMemo(() => calculateMarginAnalysis({
    costPerUnit: Number(form.costPerUnit) || 0,
    sellingPrice: Number(form.sellingPrice) || 0,
    discountPercent: Number(form.discountPercent) || 0,
    sellingCostPerUnit: Number(form.sellingCostPerUnit) || 0,
    quantity: Number(form.quantity) || 1,
    analysisMode: form.analysisMode,
    targetMargin: Number(form.targetMargin) || 0,
    targetMarkup: Number(form.targetMarkup) || 0,
  }), [form])

  const scenarios = useMemo(() => {
    const cost = Number(form.costPerUnit) || 0
    const sellCost = Number(form.sellingCostPerUnit) || 0
    if (cost <= 0) return []

    // Generate scenarios around the calculated selling price
    const base = result.effectiveSellingPrice || cost * 1.5
    const prices = [
      Math.round(base * 0.8 / 1000) * 1000,
      Math.round(base * 1.0 / 1000) * 1000,
      Math.round(base * 1.3 / 1000) * 1000,
      Math.round(base * 1.6 / 1000) * 1000,
      Math.round(base * 2.0 / 1000) * 1000,
    ].filter((v, i, a) => a.indexOf(v) === i && v > 0)

    return generateScenarios(cost, prices, sellCost)
  }, [form.costPerUnit, form.sellingCostPerUnit, result.effectiveSellingPrice])

  function validateForm() {
    const errs = []
    // Manual mode: productName required
    // Product mode: productName auto-filled from product
    if (!form.productName.trim()) errs.push('Nama produk wajib diisi')
    return errs
  }

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

    const payload = {
      business_id: business.id,
      // product_id: null for manual mode, UUID for product mode
      product_id: form.productId || null,
      product_name: form.productName.trim(),
      // Snapshot HPP at time of analysis (immutable in history)
      hpp_snapshot: result.costPerUnit,
      cost_per_unit: result.costPerUnit,
      gross_selling_price: result.grossSellingPrice,
      discount_percent: Number(form.discountPercent) || 0,
      effective_selling_price: result.effectiveSellingPrice,
      selling_cost_per_unit: result.sellingCostPerUnit,
      total_cost_per_unit: result.totalCostPerUnit,
      profit_per_unit: result.profitPerUnit,
      margin_percent: result.marginPercent,
      markup_percent: result.markupPercent,
      quantity: result.quantity,
      revenue: result.revenue,
      total_cost: result.totalCost,
      total_profit: result.totalProfit,
      analysis_mode: form.analysisMode,
      target_margin: Number(form.targetMargin) || 0,
      target_markup: Number(form.targetMarkup) || 0,
      notes: form.notes.trim(),
    }

    const saveResult = await saveCalculationHistory(supabase, {
      table: 'margin_analyses',
      toolType: 'margin_analysis',
      businessId: business.id,
      payload,
      existingHistory: history,
    })

    if (!saveResult.success) {
      const error = saveResult.error || {}
      // Log full error details for debugging
      console.error('Margin Analysis save error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        full: error,
      })

      const msg = error.message || ''
      const code = error.code || ''

      if (code === 'PGRST205' || msg.includes('Could not find the table')) {
        setSupabaseError('Tabel database belum tersedia. Hubungi admin untuk menjalankan migration.')
      } else if (code === '42501' || msg.includes('row-level security')) {
        setSupabaseError('Anda tidak memiliki akses untuk menyimpan data ini.')
      } else if (code === '23503' || msg.includes('violates foreign key')) {
        setSupabaseError('Data tidak sesuai format database. Periksa produk yang dipilih.')
      } else if (code === '23502' || msg.includes('violates not-null')) {
        setSupabaseError('Ada kolom wajib yang belum diisi. Periksa semua input.')
      } else if (code === '22P02' || msg.includes('invalid input syntax')) {
        setSupabaseError('Format data tidak valid. Periksa nilai yang dimasukkan.')
      } else {
        // Show actual error code + message for unknown errors
        const detail = code ? `[${code}] ` : ''
        setSupabaseError(`Gagal menyimpan analisis. ${detail}${msg || 'Silakan coba lagi.'}`)
      }
      setSaving(false)
      return
    }

    setSaving(false)
    setSaveMessage(saveResult.message || SUCCESS_HISTORY_MESSAGE)
    setTimeout(() => setSaveMessage(''), 4000)
    loadHistory()
  }

  function reuseHistory(item) {
    setForm({
      productId: item.product_id || '',
      productName: item.product_name || '',
      // Use hpp_snapshot for history reuse (preserves original value)
      costPerUnit: String(item.hpp_snapshot || item.cost_per_unit || ''),
      sellingPrice: String(item.effective_selling_price || ''),
      discountPercent: String(item.discount_percent || ''),
      sellingCostPerUnit: String(item.selling_cost_per_unit || ''),
      quantity: String(item.quantity || 1),
      analysisMode: item.analysis_mode || 'price',
      targetMargin: String(item.target_margin || 40),
      targetMarkup: String(item.target_markup || 50),
      notes: item.notes || '',
      existingCostPrice: 0,
      existingUnitPrice: 0,
    })
    setView('calculator')
    setSelectedItem(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteHistory(id) {
    if (!confirm('Hapus analisis ini?')) return
    const { error } = await supabase.from('margin_analyses').delete().eq('id', id).eq('business_id', business.id)
    if (error) {
      console.error('Margin Analysis delete error:', {
        code: error.code,
        message: error.message,
      })
      alert('Gagal menghapus analisis. Silakan coba lagi.')
    }
    setSelectedItem(null)
    setView('history')
    loadHistory()
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setErrors([])
    setSupabaseError('')
    setSaveMessage('')
    setLatestHPP(null)
  }

  function handleViewDetail(item) {
    setSelectedItem(item)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBackToHistory() {
    setView('history')
    setSelectedItem(null)
  }

  return (
    <div>
      <BackButton
        fallbackUrl="/dashboard/keuangan"
        label={view === 'detail' ? 'Kembali ke Riwayat Margin' : 'Kembali'}
        onClick={view === 'detail' ? handleBackToHistory : undefined}
      />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Margin Analysis</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Analisis unit economics dan profitabilitas produk.
          </p>
        </div>
        {view === 'calculator' && (
          <button
            onClick={resetForm}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
          >
            Reset Form
          </button>
        )}
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

      {/* Tabs — always visible */}
      <div className="mt-6 flex gap-1 rounded-xl border border-border bg-surface p-1">
        <button
          onClick={() => setView('calculator')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            view === 'calculator' || view === 'detail'
              ? 'bg-warm-400 text-white'
              : 'text-text-secondary hover:bg-cream'
          }`}
        >
          Kalkulator
        </button>
        <button
          onClick={() => { setView('history'); setSelectedItem(null) }}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            view === 'history'
              ? 'bg-warm-400 text-white'
              : 'text-text-secondary hover:bg-cream'
          }`}
        >
          Riwayat Analisis
          {history.length > 0 && ` (${history.length})`}
        </button>
      </div>

      {/* Calculator View */}
      {view === 'calculator' && (
        <>
          {/* Empty state: no products */}
          {!loadingProducts && products.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
              <p className="text-lg font-semibold text-navy-700">Belum ada produk</p>
              <p className="mt-2 text-sm text-text-muted">
                Tambahkan produk atau gunakan mode manual untuk analisis.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <a
                  href="/dashboard/pos/products"
                  className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
                >
                  Tambah Produk
                </a>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            {/* Left: Form */}
            <div className="rounded-2xl border border-border bg-surface p-6">
              <MarginAnalysisInput
                form={form}
                setField={setField}
                products={products}
                loadingProducts={loadingProducts}
                latestHPP={latestHPP}
                onUseHPP={handleUseHPP}
              />
            </div>

            {/* Right: Results */}
            <div className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24 lg:self-start">
              <MarginAnalysisResults
                result={result}
                scenarios={scenarios}
                onSave={handleSave}
                saving={saving}
                errors={errors}
                saveMessage={saveMessage}
              />
            </div>
          </div>
        </>
      )}

      {/* History View */}
      {view === 'history' && (
        <div className="mt-6">
          <MarginAnalysisHistory
            history={history}
            loading={loadingHistory}
            onViewDetail={handleViewDetail}
          />
        </div>
      )}

      {/* Detail View */}
      {view === 'detail' && selectedItem && (
        <div className="mt-6">
          <MarginAnalysisDetail
            item={selectedItem}
            onBack={handleBackToHistory}
            onReuse={reuseHistory}
            onDelete={deleteHistory}
          />
        </div>
      )}
    </div>
  )
}
