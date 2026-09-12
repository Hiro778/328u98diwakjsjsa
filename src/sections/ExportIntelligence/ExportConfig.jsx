import { useState } from 'react'
import { motion } from 'framer-motion'

const DESTINATIONS = [
  { code: 'SG', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' },
  { code: 'MY', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'US', name: 'USA', flag: '\u{1F1FA}\u{1F1F8}' },
]

const INCOTERMS = [
  { code: 'FOB', label: 'FOB', desc: 'Sampai kapal berangkat' },
  { code: 'CIF', label: 'CIF', desc: 'Termasuk asuransi + freight' },
  { code: 'EXW', label: 'EXW', desc: 'Dari gudang, buyer atur' },
  { code: 'DDP', label: 'DDP', desc: 'Sampai tujuan, all-in' },
]

const SHIPPING = [
  { code: 'sea', label: 'Laut', icon: 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4z' },
  { code: 'air', label: 'Udara', icon: 'M22 16.5L12 22 2 16.5M12 2L22 7.5 12 12 2 7.5z' },
  { code: 'land', label: 'Darat', icon: 'M5 17h14M5 17a2 2 0 01-2-2V5h16v10a2 2 0 01-2 2M7 17v2m10-2v2' },
]

function formatRp(n) {
  return 'Rp' + (n / 1_000_000).toFixed(1) + 'Jt'
}

export default function ExportConfig({ product, onBack, onContinue }) {
  const [quantity, setQuantity] = useState('')
  const [destination, setDestination] = useState('')
  const [incoterm, setIncoterm] = useState('')
  const [shipping, setShipping] = useState('')

  const qty = Number(quantity)
  const isValid = qty > 0 && destination && incoterm && shipping

  function handleSubmit() {
    if (!isValid) return
    onContinue({ quantity: qty, destination, incoterm, shipping })
  }

  const chipBase = 'rounded-lg px-3 py-2 text-xs font-medium transition-all'
  const active = 'bg-warm-400 text-white'
  const inactive = 'bg-white/10 text-cream/60 hover:bg-white/15'

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
          Ganti produk
        </button>
      </div>

      {/* Product summary */}
      <div className="mb-6 rounded-xl border border-cream/10 bg-white/5 px-4 py-3">
        <p className="text-[10px] text-cream/40">Produk dipilih</p>
        <p className="text-sm font-semibold text-cream">{product.name}</p>
        <p className="text-xs text-cream/40">{product.sku} &middot; {formatRp(product.hpp)}/{product.unit} &middot; Stok: {product.stock}</p>
      </div>

      <p className="mb-3 text-sm font-semibold tracking-wide text-warm-400 uppercase">
        Konfigurasi Ekspor
      </p>
      <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-cream">
        Atur detail <span className="text-warm-400">ekspor-nya</span>
      </h2>

      <div className="mt-6 space-y-5">
        {/* Quantity */}
        <div>
          <label className="mb-1 block text-xs text-cream/50">Jumlah</label>
          <div className="relative">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              min="1"
              className="w-full rounded-lg border border-cream/10 bg-white/5 px-3 py-2.5 pr-16 text-sm text-cream placeholder:text-cream/30 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cream/30">{product.unit}</span>
          </div>
          {product.stock > 0 && (
            <p className="mt-1 text-[11px] text-cream/30">Stok tersedia: {product.stock} {product.unit}</p>
          )}
        </div>

        {/* Destination */}
        <div>
          <label className="mb-1 block text-xs text-cream/50">Tujuan</label>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.map((d) => (
              <button
                key={d.code}
                type="button"
                onClick={() => setDestination(d.code)}
                className={`${chipBase} ${destination === d.code ? active : inactive}`}
              >
                {d.flag} {d.code}
              </button>
            ))}
          </div>
        </div>

        {/* Incoterm */}
        <div>
          <label className="mb-1 block text-xs text-cream/50">Incoterm</label>
          <div className="flex flex-wrap gap-2">
            {INCOTERMS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setIncoterm(t.code)}
                className={`${chipBase} ${incoterm === t.code ? active : inactive}`}
                title={t.desc}
              >
                {t.label}
              </button>
            ))}
          </div>
          {incoterm && (
            <p className="mt-1 text-[11px] text-cream/30">
              {INCOTERMS.find((t) => t.code === incoterm)?.desc}
            </p>
          )}
        </div>

        {/* Shipping */}
        <div>
          <label className="mb-1 block text-xs text-cream/50">Metode Pengiriman</label>
          <div className="flex gap-2">
            {SHIPPING.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setShipping(s.code)}
                className={`${chipBase} ${shipping === s.code ? active : inactive}`}
              >
                <span className="mr-1.5 inline-block h-3 w-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.icon} />
                  </svg>
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calculate CTA */}
        <motion.button
          whileHover={isValid ? { scale: 1.03 } : {}}
          whileTap={isValid ? { scale: 0.97 } : {}}
          onClick={handleSubmit}
          disabled={!isValid}
          className={`mt-2 w-full rounded-xl px-7 py-3.5 text-[15px] font-bold shadow-md transition-all ${
            isValid
              ? 'bg-warm-400 text-white hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30'
              : 'cursor-not-allowed bg-white/10 text-cream/30'
          }`}
        >
          Hitung Potensi Ekspor &rarr;
        </motion.button>
      </div>
    </motion.div>
  )
}
