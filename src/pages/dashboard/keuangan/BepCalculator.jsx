import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { getLatestHPPByProduct } from '../../../lib/hppService'
import { getProductsByBusiness } from '../../../lib/productService'
import { calculateBEP } from '../../../sections/BEPCalculator/calculateBEP'
import BEPInputForm from '../../../sections/BEPCalculator/BEPInputForm'
import BEPResults from '../../../sections/BEPCalculator/BEPResults'
import BackButton from '../../../components/BackButton'
import { saveBepCalculation, getBepCalculationsByBusiness, deleteBepCalculation } from '../../../lib/bepService'

const EMPTY_FORM = {
  productId: '',
  productName: '',
  sellingPricePerUnit: '',
  materialCostPerUnit: '',
  packagingCostPerUnit: '',
  salesFeePerUnit: '',
  otherVariableCostPerUnit: '',
  rent: '',
  fixedLabor: '',
  utilities: '',
  software: '',
  otherFixedCosts: '',
  actualUnits: '',
  targetProfit: '',
  existingCostPrice: 0,
  existingUnitPrice: 0,
}

export default function BEPCalculator() {
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
  const [showHistory, setShowHistory] = useState(true)

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
    setLoadingHistory(true)
    const data = await getBepCalculationsByBusiness(business.id)
    setHistory(data)
    setLoadingHistory(false)
  }

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
  }

  function handleUseHPP() {
    if (latestHPP) {
      setField('materialCostPerUnit', String(latestHPP.hpp_per_unit))
    }
  }

  const result = useMemo(() => calculateBEP({
    sellingPricePerUnit: Number(form.sellingPricePerUnit) || 0,
    materialCostPerUnit: Number(form.materialCostPerUnit) || 0,
    packagingCostPerUnit: Number(form.packagingCostPerUnit) || 0,
    salesFeePerUnit: Number(form.salesFeePerUnit) || 0,
    otherVariableCostPerUnit: Number(form.otherVariableCostPerUnit) || 0,
    rent: Number(form.rent) || 0,
    fixedLabor: Number(form.fixedLabor) || 0,
    utilities: Number(form.utilities) || 0,
    software: Number(form.software) || 0,
    otherFixedCosts: Number(form.otherFixedCosts) || 0,
    actualUnits: Number(form.actualUnits) || 0,
    targetProfit: Number(form.targetProfit) || 0,
  }), [form])

  function validateForm() {
    const errs = []
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

    // Ensure no NaN/undefined in numeric fields
    const num = (v) => (Number.isFinite(v) ? v : 0)

    const payload = {
      business_id: business.id,
      product_id: form.productId || null,
      product_name: (form.productName || '').trim(),
      selling_price_per_unit: num(result.sellingPricePerUnit),
      material_cost_per_unit: num(result.materialCostPerUnit),
      packaging_cost_per_unit: num(result.packagingCostPerUnit),
      sales_fee_per_unit: num(result.salesFeePerUnit),
      other_variable_cost_per_unit: num(result.otherVariableCostPerUnit),
      variable_cost_per_unit: num(result.variableCostPerUnit),
      rent: num(result.rent),
      fixed_labor: num(result.fixedLabor),
      utilities: num(result.utilities),
      software: num(result.software),
      other_fixed_costs: num(result.otherFixedCosts),
      fixed_costs: num(result.fixedCosts),
      contribution_margin_per_unit: num(result.contributionMarginPerUnit),
      contribution_margin_ratio: num(result.contributionMarginRatio),
      bep_units: num(result.bepUnits),
      bep_revenue: num(result.bepRevenue),
      actual_units: Math.floor(num(result.actualUnits)),
      actual_revenue: num(result.actualRevenue),
      margin_of_safety: num(result.marginOfSafety),
      margin_of_safety_percent: num(result.marginOfSafetyPercent),
      target_profit: num(result.targetProfit),
      required_units_for_target_profit: num(result.requiredUnitsForTargetProfit),
      required_revenue_for_target_profit: num(result.requiredRevenueForTargetProfit),
    }

    try {
      await saveBepCalculation(payload, history)
      setSaving(false)
      setSaveMessage('History telah disimpan')
      setTimeout(() => setSaveMessage(''), 4000)
      loadHistory()
    } catch (err) {
      setSupabaseError(err.message || 'Gagal menyimpan BEP. Silakan coba lagi.')
      setSaving(false)
    }
  }

  function reuseHistory(item) {
    setForm({
      productId: item.product_id || '',
      productName: item.product_name || '',
      sellingPricePerUnit: String(item.selling_price_per_unit || ''),
      materialCostPerUnit: String(item.material_cost_per_unit || ''),
      packagingCostPerUnit: String(item.packaging_cost_per_unit || ''),
      salesFeePerUnit: String(item.sales_fee_per_unit || ''),
      otherVariableCostPerUnit: String(item.other_variable_cost_per_unit || ''),
      rent: String(item.rent || ''),
      fixedLabor: String(item.fixed_labor || ''),
      utilities: String(item.utilities || ''),
      software: String(item.software || ''),
      otherFixedCosts: String(item.other_fixed_costs || ''),
      actualUnits: String(item.actual_units || ''),
      targetProfit: String(item.target_profit || ''),
      existingCostPrice: 0,
      existingUnitPrice: 0,
    })
    setShowHistory(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteHistory(id) {
    if (!confirm('Hapus perhitungan BEP ini?')) return
    await deleteBepCalculation(id, business.id)
    loadHistory()
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setErrors([])
    setSupabaseError('')
    setLatestHPP(null)
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">BEP Calculator</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Hitung titik impas dan target penjualan bisnis Anda.
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

      {/* Empty state: no products */}
      {!loadingProducts && products.length === 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada produk</p>
          <p className="mt-2 text-sm text-text-muted">
            Tambahkan produk terlebih dahulu atau gunakan mode manual.
          </p>
          <a
            href="/dashboard/pos/products"
            className="mt-4 inline-block rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
          >
            Tambah Produk
          </a>
        </div>
      )}

      {/* Main content */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: Form */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <BEPInputForm
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
          <BEPResults
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
            Riwayat BEP ({history.length})
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
                      <p className="text-sm font-bold text-navy-700 truncate">
                        {item.product_name || 'Tanpa Nama'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {new Date(item.created_at).toLocaleDateString('id-ID')}
                      </p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">BEP</span>
                          <span className="font-semibold text-navy-700">{item.bep_units} unit</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">BEP Revenue</span>
                          <span className="font-semibold text-navy-700">{formatCurrency(item.bep_revenue)}</span>
                        </div>
                        {item.target_profit > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">Target</span>
                            <span className="font-semibold text-warm-500">{formatCurrency(item.target_profit)}</span>
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
