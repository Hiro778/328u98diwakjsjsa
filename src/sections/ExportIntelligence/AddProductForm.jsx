import { useState } from 'react'
import { motion } from 'framer-motion'
import { useProductCatalog } from '../../context/ProductCatalogContext'

const CATEGORIES = [
  { value: 'kopi', label: 'Kopi' },
  { value: 'cokelat', label: 'Cokelat' },
  { value: 'rempah', label: 'Rempah' },
  { value: 'tekstil', label: 'Tekstil' },
  { value: 'kerajinan', label: 'Kerajinan' },
  { value: 'lainnya', label: 'Lainnya' },
]

const UNITS = ['kg', 'pcs', 'liter', 'box']

export default function AddProductForm({ onBack, onSave }) {
  const { addProduct } = useProductCatalog()
  const [form, setForm] = useState({
    name: '', sku: '', category: 'kopi', hpp: '', unit: 'kg', weight: '', stock: '', supplier: '',
  })
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }))
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Nama produk wajib diisi'
    if (!form.sku.trim()) errs.sku = 'SKU wajib diisi'
    if (!form.hpp || Number(form.hpp) <= 0) errs.hpp = 'HPP harus lebih dari 0'
    if (!form.stock || Number(form.stock) < 0) errs.stock = 'Stok tidak boleh negatif'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    const product = addProduct({
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      hpp: Number(form.hpp),
      unit: form.unit,
      weight: Number(form.weight) || 0,
      stock: Number(form.stock),
      supplier: form.supplier.trim(),
    })
    onSave(product)
  }

  const inputClass = 'w-full rounded-lg border border-cream/10 bg-white/5 px-3 py-2.5 text-sm text-cream placeholder:text-cream/30 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Nav */}
      <div className="mb-6 flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-cream/50 transition-colors hover:text-cream">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Kembali
        </button>
      </div>

      <p className="mb-3 text-sm font-semibold tracking-wide text-warm-400 uppercase">
        Produk Baru
      </p>
      <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-cream sm:text-3xl">
        Tambah <span className="text-warm-400">Produk</span>
      </h2>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {/* Nama */}
        <div>
          <label className="mb-1 block text-xs text-cream/50">Nama Produk</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Contoh: Kopi Arabica Gayo"
            className={inputClass}
          />
          {errors.name && <p className="mt-1 text-xs text-warm-400">{errors.name}</p>}
        </div>

        {/* SKU + Category row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-cream/50">SKU</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              placeholder="Contoh: KAG-001"
              className={inputClass}
            />
            {errors.sku && <p className="mt-1 text-xs text-warm-400">{errors.sku}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-cream/50">Kategori</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('category', c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                    form.category === c.value
                      ? 'bg-warm-400 text-white'
                      : 'bg-white/10 text-cream/60 hover:bg-white/15'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* HPP + Unit row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-cream/50">HPP (per unit)</label>
            <input
              type="number"
              value={form.hpp}
              onChange={(e) => set('hpp', e.target.value)}
              placeholder="Rp"
              min="0"
              className={inputClass}
            />
            {errors.hpp && <p className="mt-1 text-xs text-warm-400">{errors.hpp}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-cream/50">Satuan</label>
            <div className="flex gap-1.5">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => set('unit', u)}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-medium transition-all ${
                    form.unit === u
                      ? 'bg-warm-400 text-white'
                      : 'bg-white/10 text-cream/60 hover:bg-white/15'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Weight + Stock + Supplier row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs text-cream/50">Berat (kg)</label>
            <input
              type="number"
              value={form.weight}
              onChange={(e) => set('weight', e.target.value)}
              placeholder="0"
              min="0"
              step="0.1"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-cream/50">Stok</label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) => set('stock', e.target.value)}
              placeholder="0"
              min="0"
              className={inputClass}
            />
            {errors.stock && <p className="mt-1 text-xs text-warm-400">{errors.stock}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-cream/50">Supplier</label>
            <input
              type="text"
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              placeholder="Opsional"
              className={inputClass}
            />
          </div>
        </div>

        {/* Submit */}
        <motion.button
          type="submit"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="mt-2 w-full rounded-xl bg-warm-400 px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          Simpan Produk
        </motion.button>
      </form>
    </motion.div>
  )
}
