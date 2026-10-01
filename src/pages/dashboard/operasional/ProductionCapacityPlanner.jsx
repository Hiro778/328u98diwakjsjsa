import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import {
  fetchProducts,
  fetchInventory,
  fetchBoms,
  saveBom,
  deleteBom,
  fetchProductionSettings,
  saveProductionSettings,
  fetchSuppliers,
  calculateMaterialBatches,
  calculateRequirements,
  calculateShortages
} from '../../../services/productionCapacityService'

export default function ProductionCapacityPlanner() {
  const { business } = useAuth()
  const [products, setProducts] = useState([])
  const [inventory, setInventory] = useState([])
  const [boms, setBoms] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProductId, setSelectedProductId] = useState('')

  // Active BOM editing state
  const [activeBom, setActiveBom] = useState(null)
  const [bomName, setBomName] = useState('')
  const [batchSize, setBatchSize] = useState('1')
  const [batchUnit, setBatchUnit] = useState('pcs')
  const [bomNotes, setBomNotes] = useState('')
  const [bomItems, setBomItems] = useState([])

  // Production settings state
  const [settings, setSettings] = useState({
    batch_capacity: '1',
    batch_unit: 'pcs',
    production_time_minutes: '0',
    workers_required: '1',
    work_hours_per_day: '8',
    work_days_per_period: '30',
    notes: '',
  })

  // Simulation target
  const [targetQuantity, setTargetQuantity] = useState('100')
  const [savingBom, setSavingBom] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (!business?.id) return
    loadInitialData()
  }, [business?.id])

  async function loadInitialData() {
    setLoading(true)
    setErrorMsg('')
    try {
      const [pData, iData, bData, sData] = await Promise.all([
        fetchProducts(business.id),
        fetchInventory(business.id),
        fetchBoms(business.id),
        fetchSuppliers(business.id),
      ])
      setProducts(pData)
      setInventory(iData)
      setBoms(bData)
      setSuppliers(sData)

      if (pData.length > 0 && !selectedProductId) {
        setSelectedProductId(pData[0].id)
      }
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memuat data awal.')
    } finally {
      setLoading(false)
    }
  }

  // Inventory map for fast lookup: material_product_id -> quantity
  const inventoryMap = useMemo(() => {
    const map = {}
    for (const inv of inventory) {
      map[inv.product_id] = Number(inv.quantity || 0)
    }
    return map
  }, [inventory])

  // Current selected product object
  const currentProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null
  }, [products, selectedProductId])

  // Current product's BOM
  const currentBom = useMemo(() => {
    return boms.find((b) => b.product_id === selectedProductId && b.is_active) || null
  }, [boms, selectedProductId])

  // Sync BOM and settings state when selectedProductId changes
  useEffect(() => {
    if (!selectedProductId) return
    if (currentBom) {
      setActiveBom(currentBom)
      setBomName(currentBom.name || '')
      setBatchSize(String(currentBom.batch_size || 1))
      setBatchUnit(currentBom.batch_unit || currentProduct?.unit || 'pcs')
      setBomNotes(currentBom.notes || '')
      setBomItems(currentBom.items || [])
    } else {
      setActiveBom(null)
      setBomName(currentProduct ? `Resep ${currentProduct.name}` : '')
      setBatchSize('1')
      setBatchUnit(currentProduct?.unit || 'pcs')
      setBomNotes('')
      setBomItems([])
    }

    // Load settings for this product
    fetchProductionSettings(business.id, selectedProductId).then((st) => {
      if (st) {
        setSettings({
          batch_capacity: String(st.batch_capacity || 1),
          batch_unit: st.batch_unit || currentProduct?.unit || 'pcs',
          production_time_minutes: String(st.production_time_minutes || 0),
          workers_required: String(st.workers_required || 1),
          work_hours_per_day: String(st.work_hours_per_day || 8),
          work_days_per_period: String(st.work_days_per_period || 30),
          notes: st.notes || '',
        })
      } else {
        setSettings({
          batch_capacity: '1',
          batch_unit: currentProduct?.unit || 'pcs',
          production_time_minutes: '0',
          workers_required: '1',
          work_hours_per_day: '8',
          work_days_per_period: '30',
          notes: '',
        })
      }
    }).catch(() => {})
  }, [selectedProductId, currentBom, business?.id, currentProduct])

  // Calculations
  const calculation = useMemo(() => {
    if (!currentBom || !bomItems || bomItems.length === 0) {
      return { maxBatches: 0, bottleneck: null, breakdown: [], shortages: [], requiredBatches: 0, targetFulfilled: false }
    }

    const { maxBatches, bottleneck, breakdown } = calculateMaterialBatches(inventoryMap, bomItems)
    const bSize = Number(batchSize) > 0 ? Number(batchSize) : 1
    const maxOutput = maxBatches * bSize

    const targetBatches = Number(targetQuantity) > 0 ? Number(targetQuantity) : 0
    const requirements = calculateRequirements(targetBatches, bomItems)
    const shortages = calculateShortages(inventoryMap, requirements, bomItems)

    const targetFulfilled = maxBatches >= targetBatches
    const targetProductOutput = targetBatches * bSize

    // Production time calculation
    const timePerBatch = Number(settings.production_time_minutes) || 0
    const totalTimeMinutes = targetBatches * timePerBatch
    const hours = Math.floor(totalTimeMinutes / 60)
    const minutes = totalTimeMinutes % 60

    return {
      maxBatches,
      maxOutput,
      bottleneck,
      breakdown,
      shortages,
      targetBatches,
      targetProductOutput,
      targetFulfilled,
      totalTimeMinutes,
      timeFormatted: timePerBatch > 0 ? `${hours > 0 ? `${hours} jam ` : ''}${minutes} menit` : 'Data waktu belum diatur',
    }
  }, [currentBom, bomItems, inventoryMap, batchSize, targetQuantity, settings.production_time_minutes])

  // Handlers for BOM Items
  function handleAddBomItem() {
    // Find a product that can be a material (not the finished product itself if possible, or any product)
    const availableMaterial = products.find((p) => p.id !== selectedProductId) || products[0]
    if (!availableMaterial) return

    setBomItems([
      ...bomItems,
      {
        material_product_id: availableMaterial.id,
        quantity_required: '1',
        unit: availableMaterial.unit || 'kg',
        notes: '',
        material: { id: availableMaterial.id, name: availableMaterial.name, unit: availableMaterial.unit },
      },
    ])
  }

  function handleUpdateBomItem(index, field, value) {
    const updated = [...bomItems]
    updated[index][field] = value
    if (field === 'material_product_id') {
      const mat = products.find((p) => p.id === value)
      if (mat) {
        updated[index].material = { id: mat.id, name: mat.name, unit: mat.unit }
        updated[index].unit = mat.unit || 'kg'
      }
    }
    setBomItems(updated)
  }

  function handleRemoveBomItem(index) {
    setBomItems(bomItems.filter((_, i) => i !== index))
  }

  async function handleSaveBom(e) {
    e.preventDefault()
    if (!selectedProductId) return
    setSavingBom(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const bomPayload = {
        id: activeBom?.id || null,
        product_id: selectedProductId,
        name: bomName || `Resep ${currentProduct?.name || 'Produk'}`,
        batch_size: Number(batchSize) || 1,
        batch_unit: batchUnit || 'pcs',
        notes: bomNotes,
      }

      await saveBom(business.id, bomPayload, bomItems)
      const updatedBoms = await fetchBoms(business.id)
      setBoms(updatedBoms)
      setSuccessMsg('BOM / Resep berhasil disimpan dan dipersist ke database!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menyimpan BOM.')
    } finally {
      setSavingBom(false)
    }
  }

  async function handleDeleteBom() {
    if (!activeBom?.id) return
    if (!confirm('Yakin ingin menghapus resep/BOM ini?')) return
    try {
      await deleteBom(business.id, activeBom.id)
      const updatedBoms = await fetchBoms(business.id)
      setBoms(updatedBoms)
      setActiveBom(null)
      setSuccessMsg('BOM berhasil dihapus.')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menghapus BOM.')
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    if (!selectedProductId) return
    setSavingSettings(true)
    setErrorMsg('')
    try {
      await saveProductionSettings(business.id, {
        product_id: selectedProductId,
        batch_capacity: Number(settings.batch_capacity) || 1,
        batch_unit: settings.batch_unit || 'pcs',
        production_time_minutes: Number(settings.production_time_minutes) || 0,
        workers_required: Number(settings.workers_required) || 1,
        work_hours_per_day: Number(settings.work_hours_per_day) || 8,
        work_days_per_period: Number(settings.work_days_per_period) || 30,
        notes: settings.notes,
      })
      setSuccessMsg('Pengaturan produksi berhasil disimpan.')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menyimpan pengaturan produksi.')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-profit-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <BackButton fallbackUrl="/dashboard/operasional" label="Kembali" />
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="mb-1 text-sm font-semibold tracking-wide text-profit-600 uppercase">Operasional & Produksi</p>
        <h1 className="text-2xl font-extrabold text-navy-700 sm:text-3xl">Production Capacity Planner</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Hitung kapasitas produksi maksimal, analisis bottleneck bahan baku, dan simulasi target produksi secara akurat.
        </p>
      </motion.div>

      {/* Notifications */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-red-50 p-4 border border-red-200 text-sm text-red-700">
            {errorMsg}
          </motion.div>
        )}
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-profit-50 p-4 border border-profit-200 text-sm text-profit-700">
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Selector */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-sm">
        <label className="block text-sm font-bold text-navy-700 mb-2">Pilih Produk yang Akan Direncanakan</label>
        {products.length === 0 ? (
          <div className="py-4 text-center text-sm text-text-muted">
            Belum ada produk terdaftar. Silakan tambahkan produk terlebih dahulu di menu produk atau inventory.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full min-w-0 sm:flex-1 sm:min-w-[280px] rounded-xl border border-border bg-surface px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium text-navy-700 focus:border-profit-500 focus:outline-none focus:ring-2 focus:ring-profit-500/20"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ''} — Satuan: {p.unit || 'pcs'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedProductId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: BOM & Production Settings */}
          <div className="lg:col-span-2 space-y-8">
            {/* BOM / Resep Section */}
            <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-navy-700">BOM (Bill of Materials) / Resep</h2>
                  <p className="text-xs text-text-secondary">Komposisi bahan baku yang dibutuhkan untuk 1 batch produksi.</p>
                </div>
                {activeBom && (
                  <button
                    onClick={handleDeleteBom}
                    type="button"
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                  >
                    Hapus Resep
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveBom} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-600 mb-1">Nama Resep / BOM</label>
                    <input
                      type="text"
                      required
                      value={bomName}
                      onChange={(e) => setBomName(e.target.value)}
                      placeholder="Contoh: Resep Standar 1 Batch"
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-navy-600 mb-1">Batch Size</label>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        required
                        value={batchSize}
                        onChange={(e) => setBatchSize(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-navy-600 mb-1">Satuan Batch</label>
                      <input
                        type="text"
                        required
                        value={batchUnit}
                        onChange={(e) => setBatchUnit(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-navy-600 mb-1">Catatan Resep</label>
                  <input
                    type="text"
                    value={bomNotes}
                    onChange={(e) => setBomNotes(e.target.value)}
                    placeholder="Catatan tambahan proses pembuatan..."
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                  />
                </div>

                {/* BOM Items Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wide text-navy-600">Daftar Bahan Baku</span>
                    <button
                      type="button"
                      onClick={handleAddBomItem}
                      className="rounded-xl bg-profit-50 px-3 py-1.5 text-xs font-semibold text-profit-700 border border-profit-200 hover:bg-profit-100"
                    >
                      + Tambah Bahan
                    </button>
                  </div>

                  {bomItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <p className="text-sm text-text-muted">Belum ada bahan dalam resep ini.</p>
                      <button
                        type="button"
                        onClick={handleAddBomItem}
                        className="mt-3 rounded-xl bg-profit-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-profit-600"
                      >
                        Tambah Bahan Pertama
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bomItems.map((item, index) => {
                        const invStock = inventoryMap[item.material_product_id] ?? 0
                        return (
                          <div key={index} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 bg-surface/50">
                            <div className="w-full sm:flex-1 sm:min-w-[180px]">
                              <label className="block text-[10px] font-bold text-text-muted mb-1">Bahan Baku</label>
                              <select
                                value={item.material_product_id}
                                onChange={(e) => handleUpdateBomItem(index, 'material_product_id', e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-navy-700"
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} (Stok: {inventoryMap[p.id] ?? 0} {p.unit || 'pcs'})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1 min-w-[110px] sm:w-32 sm:flex-none">
                              <label className="block text-[10px] font-bold text-navy-700 mb-1">Kebutuhan per Batch</label>
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                placeholder="Jml / batch"
                                value={item.quantity_required}
                                onChange={(e) => handleUpdateBomItem(index, 'quantity_required', e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-navy-700"
                              />
                            </div>
                            <div className="w-20 sm:w-24">
                              <label className="block text-[10px] font-bold text-text-muted mb-1">Satuan</label>
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => handleUpdateBomItem(index, 'unit', e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-navy-700"
                              />
                            </div>
                            <div className="pt-5">
                              <button
                                type="button"
                                onClick={() => handleRemoveBomItem(index)}
                                className="rounded-lg p-1.5 text-text-muted hover:bg-red-50 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    type="submit"
                    disabled={savingBom}
                    className="rounded-xl bg-profit-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-profit-600 disabled:opacity-50"
                  >
                    {savingBom ? 'Menyimpan...' : 'Simpan Resep / BOM'}
                  </button>
                </div>
              </form>
            </div>

            {/* Production Settings Section */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-bold text-navy-700 mb-1">Pengaturan Waktu & Kapasitas</h2>
              <p className="text-xs text-text-secondary mb-6">Parameter operasional untuk estimasi waktu produksi.</p>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-navy-600 mb-1">Waktu per Batch (Menit)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={settings.production_time_minutes}
                      onChange={(e) => setSettings({ ...settings, production_time_minutes: e.target.value })}
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-navy-600 mb-1">Tenaga Kerja Diperlukan</label>
                    <input
                      type="number"
                      min="1"
                      value={settings.workers_required}
                      onChange={(e) => setSettings({ ...settings, workers_required: e.target.value })}
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-navy-700 focus:border-profit-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="rounded-xl bg-navy-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 disabled:opacity-50"
                  >
                    {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Target Simulation & Results */}
          <div className="space-y-8">
            {/* Target Simulation Input */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-bold text-navy-700 mb-1">Simulasi Target Produksi</h2>
              <p className="text-xs text-text-secondary mb-4">Masukkan target jumlah batch yang ingin diproduksi.</p>

              <div>
                <label className="block text-xs font-bold text-navy-700 mb-1">Target Produksi (Batch)</label>
                <div className="relative flex items-stretch rounded-xl border border-border bg-surface focus-within:border-profit-500 focus-within:ring-2 focus-within:ring-profit-500/20 overflow-hidden">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={targetQuantity}
                    onChange={(e) => setTargetQuantity(e.target.value)}
                    placeholder="Contoh: 100"
                    className="w-full bg-transparent px-3.5 py-2.5 text-base font-bold text-navy-700 focus:outline-none"
                  />
                  <div className="flex items-center px-4 bg-surface-secondary border-l border-border text-xs font-bold text-text-secondary">
                    Batch
                  </div>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Setara dengan <span className="font-semibold text-navy-700">{calculation.targetProductOutput} {currentProduct?.unit || 'pcs'}</span> produk jadi (1 batch = {batchSize} {batchUnit}).
                </p>
              </div>
            </div>

            {/* Results Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-navy-700">Hasil Analisis Kapasitas</h2>

              {!currentBom || bomItems.length === 0 ? (
                <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-xs text-amber-800">
                  ⚠️ Belum ada BOM / resep aktif untuk produk ini. Harap buat resep terlebih dahulu untuk melihat analisis kapasitas.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border bg-surface/50 p-4">
                      <p className="text-xs text-text-secondary">Kapasitas Maksimum</p>
                      <p className="text-2xl font-extrabold text-navy-700 mt-1">{calculation.maxOutput} <span className="text-sm font-normal">{currentProduct?.unit || 'pcs'}</span></p>
                      <p className="text-[10px] text-text-muted mt-0.5">Setara {calculation.maxBatches} batch</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface/50 p-4">
                      <p className="text-xs text-text-secondary">Status Target ({calculation.targetBatches} Batch)</p>
                      <p className={`text-sm font-extrabold mt-1 px-2.5 py-1 rounded-lg inline-block ${calculation.targetFulfilled ? 'bg-profit-50 text-profit-600 border border-profit-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {calculation.targetFulfilled ? 'TERPENUHI' : 'TIDAK TERPENUHI'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Bottleneck Utama:</span>
                      <span className="font-bold text-navy-700">{calculation.bottleneck ? calculation.bottleneck.material?.name : 'Tidak ada'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Estimasi Waktu Produksi:</span>
                      <span className="font-bold text-navy-700">{calculation.timeFormatted}</span>
                    </div>
                  </div>

                  {/* Material Breakdown & Shortages */}
                  <div className="pt-4 border-t border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-navy-600 mb-3">Analisis Bahan Baku & Stok</h3>
                    <div className="space-y-2">
                      {calculation.breakdown.map((item, idx) => {
                        const stock = inventoryMap[item.materialId] ?? 0
                        const reqPerBatch = item.requiredPerBatch
                        const totalReq = calculation.targetBatches * reqPerBatch
                        const possible = reqPerBatch > 0 ? Math.floor(stock / reqPerBatch) : 0
                        const isBottleneck = calculation.bottleneck?.material_product_id === item.materialId

                        return (
                          <div key={idx} className={`rounded-xl border p-3 text-xs ${isBottleneck ? 'border-red-200 bg-red-50/50' : 'border-border bg-surface/50'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-navy-700">{item.materialName}</span>
                              {isBottleneck && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">Bottleneck</span>}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-text-secondary pt-1">
                              <div>Stok: <span className="font-bold text-navy-700">{stock} {item.unit}</span></div>
                              <div>Per Batch: <span className="font-bold text-navy-700">{reqPerBatch} {item.unit}</span></div>
                              <div>Dibutuhkan: <span className="font-bold text-navy-700">{totalReq} {item.unit}</span></div>
                              <div>Max Batch: <span className="font-bold text-navy-700">{possible} batch</span></div>
                            </div>
                            {calculation.targetBatches > 0 && (
                              <p className="mt-1.5 text-[10px] text-text-muted">
                                Rumus: {calculation.targetBatches} batch × {reqPerBatch} {item.unit} = {totalReq} {item.unit}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Shortages & Recommendations */}
                  {calculation.shortages.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-red-600 mb-2">Kekurangan Bahan untuk Target</h3>
                      <div className="space-y-2">
                        {calculation.shortages.map((s, idx) => {
                          // Find supplier for this material if available
                          const matInv = inventory.find((i) => i.product_id === s.materialId)
                          const supplier = suppliers.find((su) => su.id === matInv?.supplier_id)
                          const bomItem = bomItems.find((b) => b.material_product_id === s.materialId)
                          const reqPerBatch = Number(bomItem?.quantity_required || 0)

                          return (
                            <div key={idx} className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                              <p className="font-bold">{s.materialName}: Kekurangan <span className="underline">{s.shortage} {s.unit}</span></p>
                              <p className="text-[11px]">
                                Total Dibutuhkan: <span className="font-semibold text-navy-700">{s.required} {s.unit}</span> ({calculation.targetBatches} batch × {reqPerBatch} {s.unit}/batch) | Stok Tersedia: {s.stock} {s.unit}
                              </p>
                              {supplier && (
                                <p className="text-[11px] font-semibold text-navy-700 pt-1">
                                  Rekomendasi Supplier: {supplier.name} {supplier.phone ? `(${supplier.phone})` : ''}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
