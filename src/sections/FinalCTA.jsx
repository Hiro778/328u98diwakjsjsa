import { motion } from 'framer-motion'
import usePricingCta from '../hooks/usePricingCta'

export default function FinalCTA() {
  const { handleCtaClick, loading } = usePricingCta()

  return (
    <section className="relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28">
      {/* Background glow — same language as hero */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(245,166,35,0.12) 0%, rgba(99,102,241,0.06) 50%, transparent 85%)',
        }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.p
          className="mb-4 text-sm font-semibold tracking-wide text-warm-400 uppercase"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Mulai Sekarang
        </motion.p>

        <motion.h2
          className="text-3xl font-extrabold leading-tight tracking-tight text-navy-500 sm:text-4xl lg:text-5xl"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          Bisnis yang sehat nggak tumbuh
          <br />
          karena <span className="text-warm-400">keberuntungan.</span>
        </motion.h2>

        <motion.p
          className="mt-5 text-lg text-text-secondary"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          Mulai ngerti bisnis lo.
          <br />
          Mulai Rp130.000/bulan.
        </motion.p>

        <motion.div
          className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.button
            onClick={handleCtaClick}
            disabled={loading}
            whileHover={!loading ? { scale: 1.03 } : {}}
            whileTap={!loading ? { scale: 0.97 } : {}}
            className="group inline-flex items-center gap-2 rounded-xl bg-warm-400 px-8 py-4 text-base font-bold text-white shadow-md transition-shadow hover:shadow-lg hover:shadow-warm-400/30 disabled:opacity-60"
          >
            Mulai 130K/bulan
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </motion.button>
          <a
            href="#cara-kerja"
            className="inline-flex items-center gap-2 rounded-xl border border-navy-100 bg-white/60 px-6 py-4 text-base font-medium text-navy-500 backdrop-blur-sm transition-all duration-200 hover:border-navy-200 hover:bg-white"
          >
            Lihat cara kerjanya
          </a>
        </motion.div>
      </div>
    </section>
  )
}
