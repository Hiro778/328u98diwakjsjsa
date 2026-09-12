import { useState } from 'react'
import { motion } from 'framer-motion'

const PRODUCT_CATEGORIES = [
  { value: '', label: 'Pilih kategori (opsional)' },
  { value: 'makanan', label: 'Makanan' },
  { value: 'minuman', label: 'Minuman' },
  { value: 'obat', label: 'Obat' },
  { value: 'kosmetik', label: 'Kosmetik' },
  { value: 'suplemen', label: 'Suplemen / Nutrisi' },
  { value: 'produk', label: 'Produk Lainnya' },
]

const ENTITY_TYPES = [
  { value: '', label: 'Pilih bentuk usaha (opsional)' },
  { value: 'perorangan', label: 'Perorangan' },
  { value: 'perseroan_perorangan', label: 'Perseroan Perorangan' },
  { value: 'pt', label: 'PT (Perseroan Terbatas)' },
  { value: 'cv', label: 'CV (Commanditaire Vennotschap)' },
  { value: 'firma', label: 'Firma' },
  { value: 'persekutuan_perdata', label: 'Persekutuan Perdata' },
  { value: 'yayasan', label: 'Yayasan' },
  { value: 'perkumpulan', label: 'Perkumpulan' },
  { value: 'tidak_tahu', label: 'Tidak tahu' },
]

export default function LegalCheckSearch({ onSearch, loading = false, initialValues = {} }) {
  const [businessName, setBusinessName] = useState(initialValues.businessName || '')
  const [brandName, setBrandName] = useState(initialValues.brandName || '')
  const [nibNumber, setNibNumber] = useState(initialValues.nibNumber || '')
  const [productCategory, setProductCategory] = useState(initialValues.productCategory || '')
  const [businessEntityType, setBusinessEntityType] = useState(initialValues.businessEntityType || '')
  const [nibError, setNibError] = useState('')

  function validateNib(value) {
    if (!value || value.trim().length === 0) {
      setNibError('')
      return true
    }
    if (!/^[A-Za-z0-9]{10,20}$/.test(value.trim())) {
      setNibError('Format NIB tidak valid. NIB biasanya berupa 13 digit angka.')
      return false
    }
    setNibError('')
    return true
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = businessName.trim()
    if (!trimmed || loading) return
    if (!validateNib(nibNumber)) return

    onSearch({
      businessName: trimmed,
      brandName: brandName.trim() || undefined,
      nibNumber: nibNumber.trim() || undefined,
      productCategory: productCategory || undefined,
      businessEntityType: businessEntityType || undefined,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface p-6"
    >
      <h3 className="text-sm font-bold text-navy-700">Cek Legalitas Usaha</h3>
      <p className="mt-1 text-xs text-text-secondary">
        Sistem akan menentukan sumber resmi yang relevan berdasarkan data yang Anda masukkan.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {/* Nama Usaha — required */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Nama Usaha <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Contoh: Kecap Bango, Kopi Nusantara"
            disabled={loading}
            required
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Nama Merek — optional */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Nama Merek <span className="text-text-muted/50">(opsional)</span>
          </label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Berbeda dari nama usaha? Isi di sini"
            disabled={loading}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Bentuk Badan Usaha — optional */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Bentuk Badan Usaha <span className="text-text-muted/50">(opsional)</span>
          </label>
          <select
            value={businessEntityType}
            onChange={(e) => setBusinessEntityType(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* NIB — optional */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            NIB <span className="text-text-muted/50">(opsional)</span>
          </label>
          <input
            type="text"
            value={nibNumber}
            onChange={(e) => {
              setNibNumber(e.target.value)
              validateNib(e.target.value)
            }}
            placeholder="Nomor Induk Berusaha (13 digit)"
            disabled={loading}
            className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              nibError
                ? 'border-red-300 focus:border-red-400 focus:ring-red-200/50'
                : 'border-border focus:border-warm-300 focus:ring-warm-200/50'
            }`}
          />
          {nibError && <p className="mt-1 text-[11px] text-red-500">{nibError}</p>}
        </div>

        {/* Kategori Produk — optional, triggers BPOM */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Kategori Produk <span className="text-text-muted/50">(opsional — untuk pengecekan BPOM)</span>
          </label>
          <select
            value={productCategory}
            onChange={(e) => setProductCategory(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-text-muted">
            Sumber yang diperiksa disesuaikan dengan data Anda.
          </p>
          <button
            type="submit"
            disabled={loading || !businessName.trim()}
            className="shrink-0 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Mengecek...
              </span>
            ) : (
              'Cek Legalitas'
            )}
          </button>
        </div>
      </form>
    </motion.div>
  )
}
