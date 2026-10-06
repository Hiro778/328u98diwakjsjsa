import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { calculateHPP } from '../../../sections/HPPCalculator/calculateHPP'
import HPPInputForm from '../../../sections/HPPCalculator/HPPInputForm'
import HPPResults from '../../../sections/HPPCalculator/HPPResults'
import BackButton from '../../../components/BackButton'
import { saveCalculationHistory, SUCCESS_HISTORY_MESSAGE } from '../../../lib/calculationHistoryService'

const EMPTY_FORM = {
  productId: '',
  productName: '',
  productionUnit: 'pcs',
  quantityProduced: '',
  materials: [],
  packaging: [],
  labor: [],
  overhead: [],
  otherCosts: [],
  wastePercent: '',
  priceMode: 'markup',
  markupPercent: '50',
  marginPercent: '40',
  existingCostPrice: 0,
  existingUnitPrice: 0,
}

const HISTORY_SORT_OPTIONS = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'hpp_desc', label: 'HPP Tertinggi' },
  { value: 'hpp_asc', label: 'HPP Terendah' },
  { value: 'total_desc', label: 'Total Biaya Terbesar' },
]

export default function HPPCalculator() {
  const { business } = useAuth()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [errors, setErrors] = useState([])
  const [supabaseError, setSupabaseError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [activeTab, setActiveTab] = useState('calculator')
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historySort, setHistorySort] = useState('newest')
  const [detailItem, setDetailItem] = useState(null)
  const [showProductPicker, setShowProductPicker] = useState(false)

  // ── Load products ──
  useEffect(() => {
    if (!business?.id) return
    loadProducts()
  }, [business?.id])

  // ── Load history ──
  useEffect(() => {
    if (!business?.id) return
    loadHistory()
  }, [business?.id])

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit, unit_price, cost_price, category')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name')
    if (error) console.error('[HPP] loadProducts error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }))
    setProducts(data || [])
    setLoadingProducts(false)
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from('hpp_calculations')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('[HPP] loadHistory error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }))
    setHistory(data || [])
    setLoadingHistory(false)
  }

  // ── History search/filter/sort ──
  const filteredHistory = useMemo(() => {
    let result = history
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim()
      result = result.filter(h =>
        (h.product_name || '').toLowerCase().includes(q)
      )
    }
    if (historyFilter !== 'all') {
      result = result.filter(h => h.price_mode === historyFilter)
    }
    switch (historySort) {
      case 'oldest':
        return [...result].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      case 'hpp_desc':
        return [...result].sort((a, b) => (b.hpp_per_unit || 0) - (a.hpp_per_unit || 0))
      case 'hpp_asc':
        return [...result].sort((a, b) => (a.hpp_per_unit || 0) - (b.hpp_per_unit || 0))
      case 'total_desc':
        return [...result].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0))
      default:
        return result
    }
  }, [history, historySearch, historyFilter, historySort])

  // ── Form setter ──
  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors([])
    setSupabaseError('')
  }

  // ── Live calculation ──
  const result = useMemo(() => calculateHPP({
    materials: form.materials,
    packaging: form.packaging,
    labor: form.labor,
    overhead: form.overhead,
    otherCosts: form.otherCosts,
    quantityProduced: Number(form.quantityProduced) || 0,
    priceMode: form.priceMode,
    markupPercent: Number(form.markupPercent) || 0,
    marginPercent: Number(form.marginPercent) || 0,
    wastePercent: Number(form.wastePercent) || 0,
  }), [form])

  // ── Validate before save ──
  function validateForm() {
    const errs = []
    if (!form.productName.trim()) errs.push('Nama produk wajib diisi')

    const qty = Number(form.quantityProduced)
    if (!form.quantityProduced && form.quantityProduced !== 0) {
      errs.push('Jumlah produksi wajib diisi')
    } else if (!Number.isFinite(qty)) {
      errs.push('Jumlah produksi tidak valid')
    } else if (qty <= 0) {
      errs.push('Jumlah produksi harus lebih dari 0')
    }

    const costFields = [
      { label: 'Bahan Baku', items: form.materials, keys: ['quantity', 'pricePerUnit'] },
      { label: 'Kemasan', items: form.packaging, keys: ['quantity', 'pricePerUnit'] },
      { label: 'Tenaga Kerja', items: form.labor, keys: ['cost'] },
      { label: 'Overhead', items: form.overhead, keys: ['cost'] },
      { label: 'Biaya Lain', items: form.otherCosts, keys: ['cost'] },
    ]
    for (const field of costFields) {
      for (const item of (field.items || [])) {
        for (const key of field.keys) {
          const raw = item[key]
          if (raw === '' || raw === undefined) continue
          const val = Number(raw)
          if (!Number.isFinite(val)) {
            errs.push(`${field.label} "${item.name || '(tanpa nama)'}" memiliki nilai tidak valid`)
          } else if (val < 0) {
            errs.push(`${field.label} "${item.name || '(tanpa nama)'}" tidak boleh negatif`)
          }
        }
      }
    }

    if (form.priceMode === 'margin') {
      const m = Number(form.marginPercent)
      if (form.marginPercent !== '' && form.marginPercent !== undefined) {
        if (!Number.isFinite(m)) errs.push('Margin tidak valid')
        else if (m >= 100) errs.push('Margin harus kurang dari 100%')
        else if (m < 0) errs.push('Margin tidak boleh negatif')
      }
    }
    if (form.priceMode === 'markup') {
      const m = Number(form.markupPercent)
      if (form.markupPercent !== '' && form.markupPercent !== undefined) {
        if (!Number.isFinite(m)) errs.push('Markup tidak valid')
        else if (m < 0) errs.push('Markup tidak boleh negatif')
      }
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

    if (!Number.isFinite(result.hppPerUnit) || !Number.isFinite(result.totalCost)) {
      setErrors(['Terjadi kesalahan perhitungan. Periksa data input Anda.'])
      return
    }

    setSaving(true)
    setSupabaseError('')

    const payload = {
      business_id: business.id,
      product_id: form.productId || null,
      product_name: form.productName.trim(),
      quantity_produced: Number(form.quantityProduced),
      production_unit: form.productionUnit,
      material_cost: result.materialCost,
      direct_labor_cost: result.directLaborCost,
      packaging_cost: result.packagingCost,
      overhead_cost: result.overheadCost,
      other_cost: result.otherCost,
      total_cost: result.totalCost,
      hpp_per_unit: result.hppPerUnit,
      waste_percentage: Number(form.wastePercent) || 0,
      markup_percent: Number(form.markupPercent) || 0,
      margin_percent: Number(form.marginPercent) || 0,
      price_mode: form.priceMode,
      selling_price: result.sellingPrice,
      profit_per_unit: result.profitPerUnit,
      cost_breakdown: {
        materials: form.materials || [],
        packaging: form.packaging || [],
        labor: form.labor || [],
        overhead: form.overhead || [],
        otherCosts: form.otherCosts || [],
      },
    }

    const saveResult = await saveCalculationHistory(supabase, {
      table: 'hpp_calculations',
      toolType: 'hpp_calculation',
      businessId: business.id,
      payload,
      existingHistory: history,
    })

    if (!saveResult.success) {
      const error = saveResult.error || {}
      // Log EXACT Supabase error for debugging — never swallow
      console.error('[HPP] Save error:', JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      }, null, 2))

      const code = error.code || ''
      const msg = (error.message || error.error_description || '').toLowerCase()

      if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('rls')) {
        setSupabaseError('Anda tidak memiliki akses untuk menyimpan data ini.')
      } else if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
        // undefined_column — schema mismatch (migration not applied)
        setSupabaseError(`Error database: ${error.message || 'Kolom tidak ditemukan'}. Hubungi admin untuk memperbarui schema database.`)
      } else if (code === '23503' || msg.includes('violates foreign key') || msg.includes('foreign key')) {
        setSupabaseError('Referensi data tidak valid. Pastikan produk atau bisnis yang dipilih masih ada.')
      } else if (code === '23502' || msg.includes('violates not-null') || msg.includes('not-null')) {
        setSupabaseError('Data tidak lengkap. Pastikan semua field wajib terisi.')
      } else if (code === '22P02' || msg.includes('invalid input') || msg.includes('invalid text')) {
        setSupabaseError('Format data tidak valid. Periksa input angka dan teks Anda.')
      } else if (msg.includes('auth') || msg.includes('session') || msg.includes('jwt')) {
        setSupabaseError('Session Anda sudah berakhir. Silakan login kembali.')
      } else {
        // Fallback: include actual error details so it's never silently swallowed
        setSupabaseError(`Gagal menyimpan: ${error.message || 'Error tidak diketahui'} (code: ${code || 'N/A'})`)
      }
      setSaving(false)
      return
    }

    setSaving(false)
    setErrors([])
    setSaveMessage(saveResult.message || SUCCESS_HISTORY_MESSAGE)
    setTimeout(() => setSaveMessage(''), 4000)
    loadHistory()
    setActiveTab('history')
  }

  // ── Apply to product cost_price ──
  async function handleApplyToProduct() {
    if (result.hppPerUnit <= 0) return

    // If no product selected, show product picker
    if (!form.productId) {
      setShowProductPicker(true)
      return
    }

    setApplying(true)
    setSupabaseError('')

    const { error } = await supabase
      .from('products')
      .update({
        cost_price: result.hppPerUnit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', form.productId)
      .eq('business_id', business.id)

    if (error) {
      console.error('[HPP] Product update error:', JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      }, null, 2))
      setSupabaseError(`Gagal memperbarui HPP produk: ${error.message || 'Error tidak diketahui'} (code: ${error.code || 'N/A'})`)
    } else {
      setSupabaseError('')
    }

    setApplying(false)
    loadProducts()
  }

  // ── Apply HPP to product from picker ──
  async function handleApplyToPickedProduct(pickedProductId) {
    setShowProductPicker(false)
    setField('productId', pickedProductId)

    const picked = products.find(p => p.id === pickedProductId)
    if (picked) {
      setField('productName', picked.name)
      setField('productionUnit', picked.unit || 'pcs')
    }

    setApplying(true)
    setSupabaseError('')

    const { error } = await supabase
      .from('products')
      .update({
        cost_price: result.hppPerUnit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pickedProductId)
      .eq('business_id', business.id)

    if (error) {
      console.error('[HPP] Apply to picked product error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }, null, 2))
      setSupabaseError(`Gagal memperbarui HPP produk: ${error.message || 'Error tidak diketahui'}`)
    }

    setApplying(false)
    loadProducts()
  }

  // ── Create new product and apply HPP ──
  async function handleCreateAndApply() {
    if (!form.productName.trim()) return

    setApplying(true)
    setSupabaseError('')
    setShowProductPicker(false)

    const { data: newProduct, error: createError } = await supabase
      .from('products')
      .insert({
        business_id: business.id,
        name: form.productName.trim(),
        unit: form.productionUnit || 'pcs',
        cost_price: result.hppPerUnit,
        is_active: true,
      })
      .select('id, name, unit')
      .single()

    if (createError) {
      console.error('[HPP] Create product error:', JSON.stringify({ code: createError.code, message: createError.message, details: createError.details, hint: createError.hint }, null, 2))
      setSupabaseError(`Gagal membuat produk baru: ${createError.message || 'Error tidak diketahui'}`)
      setApplying(false)
      return
    }

    setField('productId', newProduct.id)
    setApplying(false)
    loadProducts()
  }

  // ── Reuse history item ──
  function reuseHistory(item) {
    // Restore line items from cost_breakdown snapshot (full restore)
    const breakdown = item.cost_breakdown || {}
    setForm({
      productId: item.product_id || '',
      productName: item.product_name || '',
      productionUnit: item.production_unit || 'pcs',
      quantityProduced: String(item.quantity_produced || ''),
      materials: breakdown.materials || [],
      packaging: breakdown.packaging || [],
      labor: breakdown.labor || [],
      overhead: breakdown.overhead || [],
      otherCosts: breakdown.otherCosts || [],
      wastePercent: item.waste_percentage != null ? String(item.waste_percentage) : '',
      priceMode: item.price_mode || 'markup',
      markupPercent: item.markup_percent != null ? String(item.markup_percent) : '50',
      marginPercent: item.margin_percent != null ? String(item.margin_percent) : '40',
      existingCostPrice: 0,
      existingUnitPrice: 0,
    })
    setErrors([])
    setSupabaseError('')
    setActiveTab('calculator')
    setDetailItem(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Delete history item ──
  async function deleteHistory(id) {
    if (!confirm('Hapus kalkulasi HPP ini?')) return
    await supabase.from('hpp_calculations').delete().eq('id', id).eq('business_id', business.id)
    setDetailItem(null)
    loadHistory()
  }

  // ── Reset form ──
  function resetForm() {
    setForm({ ...EMPTY_FORM })
    setErrors([])
    setSupabaseError('')
    setSaving(false)
    setApplying(false)
  }

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/keuangan" label="Kembali" />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-navy-700">HPP Calculator</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Hitung modal produksi dan tentukan harga jual dengan lebih akurat.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-cream p-1">
        <button
          onClick={() => setActiveTab('calculator')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'calculator'
              ? 'bg-warm-400 text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface'
          }`}
        >
          Kalkulator
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-warm-400 text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface'
          }`}
        >
          Riwayat HPP {history.length > 0 && `(${history.length})`}
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

      {/* ═══ CALCULATOR TAB ═══ */}
      {activeTab === 'calculator' && (
        <>
          {/* Empty state: no products */}
          {!loadingProducts && products.length === 0 && (
            <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
              <p className="text-lg font-semibold text-navy-700">Belum ada produk</p>
              <p className="mt-2 text-sm text-text-muted">
                Tambahkan produk terlebih dahulu untuk menggunakan HPP Calculator.
              </p>
              <a
                href="/dashboard/pos/products"
                className="mt-4 inline-block rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
              >
                Tambah Produk
              </a>
            </div>
          )}

          {(!loadingProducts && products.length > 0) && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="rounded-2xl border border-border bg-surface p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-navy-700">Input Produksi</h2>
                  <button
                    onClick={resetForm}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-cream"
                  >
                    Reset Form
                  </button>
                </div>
                <HPPInputForm
                  form={form}
                  setField={setField}
                  products={products}
                  loadingProducts={loadingProducts}
                />
              </div>

              <div className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24 lg:self-start">
                <HPPResults
                  result={result}
                  form={form}
                  setField={setField}
                  onSave={handleSave}
                  saving={saving}
                  onApplyToProduct={handleApplyToProduct}
                  applying={applying}
                  errors={errors}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === 'history' && (
        <div className="mt-6">
          {loadingHistory && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-navy-50" />
              ))}
            </div>
          )}

          {!loadingHistory && history.length === 0 && (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center">
              <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-3 text-sm font-semibold text-navy-700">Belum ada riwayat</p>
              <p className="mt-1 text-xs text-text-muted">Kalkulasi HPP yang tersimpan akan muncul di sini.</p>
              <button
                onClick={() => setActiveTab('calculator')}
                className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
              >
                Mulai Kalkulasi
              </button>
            </div>
          )}

          {!loadingHistory && history.length > 0 && (
            <>
              {/* Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Cari nama produk..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                  />
                </div>
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
                >
                  <option value="all">Semua Mode</option>
                  <option value="markup">Markup</option>
                  <option value="margin">Margin</option>
                </select>
                <select
                  value={historySort}
                  onChange={(e) => setHistorySort(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
                >
                  {HISTORY_SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <p className="mt-2 text-xs text-text-muted">
                {filteredHistory.length} dari {history.length} kalkulasi
              </p>

              {/* Detail view */}
              {detailItem && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-2xl border border-warm-200 bg-warm-50 p-5"
                >
                  <BackButton
                    fallbackUrl="/dashboard/keuangan/hpp-calculator"
                    label="Kembali ke Kalkulator HPP"
                    onClick={() => setDetailItem(null)}
                  />
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-navy-700">{detailItem.product_name}</h3>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        {new Date(detailItem.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button onClick={() => setDetailItem(null)} className="text-text-muted hover:text-navy-700">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-surface p-3">
                      <p className="text-[10px] text-text-muted">HPP/Unit</p>
                      <p className="mt-0.5 text-lg font-extrabold text-navy-700">{formatCurrency(detailItem.hpp_per_unit)}</p>
                    </div>
                    <div className="rounded-xl bg-surface p-3">
                      <p className="text-[10px] text-text-muted">Total Biaya</p>
                      <p className="mt-0.5 text-lg font-extrabold text-navy-700">{formatCurrency(detailItem.total_cost)}</p>
                    </div>
                    <div className="rounded-xl bg-surface p-3">
                      <p className="text-[10px] text-text-muted">Harga Jual</p>
                      <p className="mt-0.5 text-lg font-extrabold text-warm-500">{formatCurrency(detailItem.selling_price)}</p>
                    </div>
                    <div className="rounded-xl bg-surface p-3">
                      <p className="text-[10px] text-text-muted">Lab/Unit</p>
                      <p className="mt-0.5 text-lg font-extrabold text-profit">{formatCurrency(detailItem.profit_per_unit)}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <DetailRow label="Jumlah Produksi" value={`${Number(detailItem.quantity_produced)} ${detailItem.production_unit}`} />
                    <DetailRow label="Bahan Baku" value={formatCurrency(detailItem.material_cost)} />
                    <DetailRow label="Kemasan" value={formatCurrency(detailItem.packaging_cost)} />
                    <DetailRow label="Tenaga Kerja" value={formatCurrency(detailItem.direct_labor_cost)} />
                    <DetailRow label="Overhead" value={formatCurrency(detailItem.overhead_cost)} />
                    {detailItem.other_cost > 0 && <DetailRow label="Biaya Lain" value={formatCurrency(detailItem.other_cost)} />}
                    {detailItem.waste_percentage > 0 && <DetailRow label="Waste" value={`${detailItem.waste_percentage}%`} />}
                    <hr className="border-border" />
                    <DetailRow label="Mode" value={detailItem.price_mode === 'markup' ? `Markup ${detailItem.markup_percent}%` : `Margin ${detailItem.margin_percent}%`} />
                    <DetailRow label="Lab/Unit" value={formatCurrency(detailItem.profit_per_unit)} accent />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => reuseHistory(detailItem)}
                      className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
                    >
                      Gunakan sebagai HPP
                    </button>
                    <button
                      onClick={() => deleteHistory(detailItem.id)}
                      className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  </div>
                </motion.div>
              )}

              {/* History list */}
              <div className="mt-4 space-y-2">
                {filteredHistory.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setDetailItem(detailItem?.id === item.id ? null : item)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      detailItem?.id === item.id
                        ? 'border-warm-300 bg-warm-50'
                        : 'border-border bg-surface hover:border-warm-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-navy-700 truncate">{item.product_name}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          {Number(item.quantity_produced)} {item.production_unit} · {item.price_mode === 'markup' ? 'Markup' : 'Margin'} {Number(item.price_mode === 'markup' ? item.markup_percent : item.margin_percent)}% · {new Date(item.created_at).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-navy-700">{formatCurrency(item.hpp_per_unit)}/unit</p>
                        <p className="text-[11px] text-text-muted">Jual {formatCurrency(item.selling_price)}</p>
                        <p className="text-[11px] text-profit font-medium">Lab {formatCurrency(item.profit_per_unit)}/unit</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ PRODUCT PICKER MODAL ═══ */}
      <AnimatePresence>
        {showProductPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowProductPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-navy-700">Gunakan sebagai HPP Produk</h3>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Pilih produk existing atau buat baru
                  </p>
                </div>
                <button onClick={() => setShowProductPicker(false)} className="text-text-muted hover:text-navy-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Existing products */}
              {products.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-semibold text-text-muted uppercase">Produk Existing</p>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleApplyToPickedProduct(p.id)}
                        className="w-full rounded-xl border border-border p-3 text-left transition-all hover:border-warm-200 hover:bg-warm-50"
                      >
                        <p className="text-sm font-semibold text-navy-700">{p.name}</p>
                        <p className="text-[11px] text-text-muted">{p.unit || 'pcs'} · HPP: {formatCurrency(p.cost_price)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Create new product */}
              <div className="mt-4">
                <p className="text-[11px] font-semibold text-text-muted uppercase">Atau Buat Produk Baru</p>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-navy-700">
                    {form.productName || '(tanpa nama)'}
                  </div>
                  <button
                    onClick={handleCreateAndApply}
                    disabled={!form.productName.trim()}
                    className="rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
                  >
                    Buat & Terapkan
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DetailRow({ label, value, accent }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`font-semibold ${accent ? 'text-warm-500' : 'text-navy-700'}`}>{value}</span>
    </div>
  )
}
