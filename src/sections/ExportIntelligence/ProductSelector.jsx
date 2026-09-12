import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProductCatalog } from '../../context/ProductCatalogContext'

const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

function formatRp(n) {
  return 'Rp' + (n / 1_000_000).toFixed(1) + 'Jt'
}

export default function ProductSelector({ selectedProductId, onSelectProduct, onAddNew, onContinue, onBack }) {
  const { products } = useProductCatalog()
  const [search, setSearch] = useState('')

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  })

  const selected = products.find((p) => p.id === selectedProductId)

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
        Pilih Produk
      </p>
      <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-cream sm:text-3xl">
        Produk mana yang mau lo
        <br />
        <span className="text-warm-400">ekspor?</span>
      </h2>

      {/* Search */}
      <div className="relative mt-6">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk..."
          className="w-full rounded-xl border border-cream/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-cream placeholder:text-cream/30 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
        />
      </div>

      {/* Product list */}
      <div className="mt-4 max-h-[340px] space-y-2 overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          {filtered.length > 0 ? (
            filtered.map((p, i) => (
              <motion.button
                key={p.id}
                variants={item}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ delay: i * 0.04 }}
                onClick={() => onSelectProduct(p.id)}
                className={`w-full rounded-xl px-4 py-3 text-left transition-all ${
                  selectedProductId === p.id
                    ? 'border border-warm-400/40 bg-warm-400/15'
                    : 'border border-transparent bg-white/5 hover:bg-white/8'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-cream">{p.name}</p>
                    <p className="text-xs text-cream/40">{p.sku} &middot; {formatRp(p.hpp)}/{p.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-cream/40">Stok</p>
                    <p className="text-sm font-medium text-cream">{p.stock} {p.unit}</p>
                  </div>
                </div>
              </motion.button>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <svg className="mx-auto mb-3 h-10 w-10 text-cream/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-sm text-cream/50">Belum ada produk.</p>
              <p className="text-xs text-cream/30">Tambah produk pertama lo untuk mulai.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onAddNew}
          className="flex items-center justify-center gap-2 rounded-xl border border-cream/15 px-5 py-3 text-sm font-medium text-cream/70 transition-all hover:border-cream/30 hover:bg-white/5 hover:text-cream"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah produk baru
        </button>

        {selected && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onContinue}
            className="rounded-xl bg-warm-400 px-7 py-3 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
          >
            Lanjutkan
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
