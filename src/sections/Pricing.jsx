import { motion } from 'framer-motion'
import { TOTAL_VISIBLE_TOOLS } from '../data/categories'
import usePricingCta from '../hooks/usePricingCta'

const features = [
  `${TOTAL_VISIBLE_TOOLS}+ business tools`,
  'Financial intelligence',
  'Inventory & operations',
  'CRM',
  'Perencanaan Pajak & Cash Flow',
  'AI business insights',
  'Weekly business recap',
]

export default function Pricing() {
  const { handleCtaClick, loading } = usePricingCta()

  return (
    <section id="pricing" className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-xl text-center">
          {/* Header */}
          <motion.p
            className="mb-3 text-sm font-semibold tracking-wide text-warm-400 uppercase"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            Harga
          </motion.p>
          <motion.h2
            className="text-3xl font-extrabold leading-tight tracking-tight text-navy-500 sm:text-4xl"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            Semua tools inti bisnis
            <br />
            dalam satu tempat.
          </motion.h2>
        </div>

        {/* Pricing Card */}
        <motion.div
          className="mx-auto mt-12 max-w-md"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-warm-200/50 bg-surface p-8 shadow-sm">
            {/* Subtle accent glow */}
            <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-warm-300/15 blur-3xl" />

            <div className="relative">
              <p className="text-sm font-semibold text-text-secondary">Bisnis Sehat Plan</p>

              {/* Price */}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-navy-600">Rp130K</span>
                <span className="text-base text-text-muted">/ bulan</span>
              </div>

              <p className="mt-2 text-sm text-text-secondary">
                Satu harga. Tanpa tier tersembunyi. Tanpa batas tools.
              </p>

              {/* Features */}
              <ul className="mt-6 space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-profit-50">
                      <svg className="h-3 w-3 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                    <span className="text-[15px] text-navy-500">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <motion.button
                onClick={handleCtaClick}
                disabled={loading}
                whileHover={!loading ? { scale: 1.02 } : {}}
                whileTap={!loading ? { scale: 0.98 } : {}}
                className="mt-8 block w-full rounded-xl bg-warm-400 py-3.5 text-center text-[15px] font-bold text-white shadow-sm transition-shadow hover:shadow-md hover:shadow-warm-400/25 disabled:opacity-60"
              >
                Mulai sekarang
              </motion.button>

              <p className="mt-3 text-center text-xs text-text-muted">
                Pembayaran via QRIS, transfer bank, atau e-wallet.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
