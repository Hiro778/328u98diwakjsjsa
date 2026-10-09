import { motion } from 'framer-motion'

function formatRp(n) {
  if (n >= 1_000_000_000) return 'Rp' + (n / 1_000_000_000).toFixed(1) + 'Miliar'
  if (n >= 1_000_000) return 'Rp' + (n / 1_000_000).toFixed(1) + 'Jt'
  return 'Rp' + n.toLocaleString('id-ID')
}

function formatRpShort(n) {
  if (n >= 1_000_000) return 'Rp' + (n / 1_000_000).toFixed(1) + 'Jt'
  return 'Rp' + n.toLocaleString('id-ID')
}

export default function ResultsPanel({ product, config, results, onBack, onReset }) {
  const metrics = [
    { label: 'Estimasi Revenue', value: formatRp(results.revenue), accent: 'text-warm-400' },
    { label: 'Total Biaya Logistik', value: formatRp(results.exportCost), accent: 'text-electric-400' },
    { label: 'Estimasi Profit', value: formatRp(results.profit), accent: 'text-profit-400' },
    { label: 'Margin', value: results.margin.toFixed(1) + '%', accent: 'text-profit-400' },
  ]

  const details = [
    { label: 'HS Code', value: results.hsCode },
    { label: 'Tarif Bea Masuk', value: results.dutyRate.toFixed(1) + '%' },
    { label: 'Estimasi Lead Time', value: results.leadTime },
    { label: 'Catatan Risiko', value: results.riskNotes },
  ]

  return (
    <motion.div
      key="results"
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
        <button onClick={onReset} className="ml-auto text-xs text-cream/40 underline transition-colors hover:text-cream/70">
          Mulai Ulang
        </button>
      </div>

      {/* Mock data banner */}
      <div className="mb-6 rounded-lg border border-electric-500/20 bg-electric-500/10 px-4 py-3">
        <p className="text-xs text-electric-400">
          <span className="font-semibold">Simulasi demo.</span>{' '}
          Angka aktual membutuhkan integrasi data real.
        </p>
      </div>

      {/* Product summary */}
      <p className="mb-1 text-xs text-cream/40">Produk</p>
      <p className="mb-4 text-sm font-semibold text-cream">
        {product.name} &middot; {config.quantity} {product.unit}
      </p>

      {/* Metrics grid */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg bg-white/5 px-3 py-2.5">
            <p className="text-[10px] text-cream/40">{m.label}</p>
            <p className={`text-lg font-bold ${m.accent}`}>{m.value}</p>
            <p className="text-[9px] text-cream/30">Data simulasi</p>
          </div>
        ))}
      </div>

      {/* Detail cards */}
      <div className="space-y-3">
        {details.map((d) => (
          <div key={d.label} className="rounded-lg bg-white/5 px-3 py-2.5">
            <p className="text-[10px] text-cream/40">{d.label}</p>
            <p className="text-sm font-medium text-cream">{d.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
