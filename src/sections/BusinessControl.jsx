import { motion } from 'framer-motion'

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 },
  }),
}

const miniCards = [
  {
    label: 'Stok',
    value: 'Optimal',
    sub: 'Stock turnover 12.4x/bulan',
    color: '#10B981',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="5" width="14" height="10" rx="2" stroke="#10B981" strokeWidth="1.5" />
        <path d="M6 5V3a3 3 0 016 0v2" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Penjualan',
    value: '14.2%',
    sub: 'Conversion rate',
    color: '#F5A623',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 13l4-5 3 3 4-6 3 4" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Pelanggan',
    value: '1,247',
    sub: 'Total active customers',
    color: '#818CF8',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" stroke="#818CF8" strokeWidth="1.5" />
        <path d="M3 16c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Legalitas',
    value: 'Verified',
    sub: 'NIB + PIRT verified',
    color: '#10B981',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2l1.5 3 3.5.5-2.5 2.5.6 3.5L9 9.5 5.9 11.5l.6-3.5L4 5.5l3.5-.5L9 2z" stroke="#10B981" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Ekspor',
    value: '3 pasar',
    sub: 'Active export markets',
    color: '#6366F1',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6" stroke="#6366F1" strokeWidth="1.5" />
        <path d="M3 9h12M9 3c2 2 2 4 0 6s-2 4 0 6" stroke="#6366F1" strokeWidth="1.2" />
      </svg>
    ),
  },
]

const revenueData = [
  { month: 'Jan', val: 62 },
  { month: 'Feb', val: 58 },
  { month: 'Mar', val: 71 },
  { month: 'Apr', val: 68 },
  { month: 'Mei', val: 84 },
  { month: 'Jun', val: 79 },
  { month: 'Jul', val: 88 },
  { month: 'Agu', val: 84 },
]

export default function BusinessControl() {
  return (
    <section id="features" className="bg-cream py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeUp}
          className="mb-14 max-w-2xl"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-navy-800 sm:text-4xl lg:text-5xl">
            Satu tempat buat ngerti{' '}
            <span className="text-warm-400">bisnis lo.</span>
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Semua aspek bisnis — dari keuangan sampai ekspor — terhubung dalam satu panel yang rapi.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-5">
          {/* Large feature card — Keuangan */}
          <motion.div
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            className="group relative overflow-hidden rounded-2xl border border-border bg-white p-7 shadow-sm transition-shadow hover:shadow-md lg:col-span-3"
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Keuangan
                </span>
                <h3 className="mt-1 text-2xl font-bold text-navy-800">Revenue</h3>
              </div>
              <span className="text-3xl font-extrabold text-warm-500">Rp84.2M</span>
            </div>

            {/* Metrics row */}
            <div className="mb-6 grid grid-cols-3 gap-4">
              {[
                { label: 'Profit Margin', val: '28.4%', c: '#10B981' },
                { label: 'Cash Health', val: '82/100', c: '#F5A623' },
                { label: 'Growth', val: '+12.3%', c: '#10B981' },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-cream px-4 py-3">
                  <span className="block text-xs text-text-muted">{m.label}</span>
                  <span className="mt-0.5 block text-lg font-bold" style={{ color: m.c }}>
                    {m.val}
                  </span>
                </div>
              ))}
            </div>

            {/* Mini bar chart */}
            <div>
              <span className="mb-3 block text-xs font-medium text-text-muted">8 Bulan Terakhir</span>
              <div className="flex items-end gap-2" style={{ height: 80 }}>
                {revenueData.map((d, i) => (
                  <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
                    <motion.div
                      className="w-full rounded-t-md bg-warm-400/80"
                      initial={{ height: 0 }}
                      whileInView={{ height: `${(d.val / 100) * 80}px` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <span className="text-[10px] text-text-muted">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decorative edge glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-warm-200/30 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
          </motion.div>

          {/* Right column — mini cards */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {miniCards.map((card, i) => (
              <motion.div
                key={card.label}
                custom={i + 1}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeUp}
                className="group flex items-center gap-4 rounded-xl border border-border bg-white px-5 py-4 shadow-sm transition-all hover:border-warm-200 hover:shadow-md"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${card.color}14` }}
                >
                  {card.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs text-text-muted">{card.label}</span>
                  <span className="block text-base font-bold text-navy-700">{card.value}</span>
                </div>
                <span className="hidden text-xs text-text-muted sm:block">{card.sub}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
