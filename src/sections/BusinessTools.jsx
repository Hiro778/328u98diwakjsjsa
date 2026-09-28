import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STATUS = {
  available: { label: 'Tersedia', bg: 'bg-profit-50', text: 'text-profit-600', border: 'border-profit-200' },
  coming_soon: { label: 'Segera', bg: 'bg-navy-50', text: 'text-navy-400', border: 'border-navy-100' },
  pro: { label: 'Pro', bg: 'bg-warm-50', text: 'text-warm-500', border: 'border-warm-200' },
}

const categories = [
  {
    id: 'finance',
    title: 'Finance',
    color: '#F5A623',
    tools: [
      { name: 'HPP Calculator', status: 'available' },
      { name: 'Margin Analysis', status: 'pro' },
      { name: 'BEP Calculator', status: 'available' },
      { name: 'Cash Flow Forecast', status: 'coming_soon' },
      { name: 'Tax Planning', status: 'coming_soon' },
      { name: 'Financial Reports', status: 'coming_soon' },
      { name: 'Anomaly Detection', status: 'coming_soon' },
      { name: 'Financial Health Score', status: 'pro' },
      { name: 'Loan Simulation', status: 'coming_soon' },
    ],
  },
  {
    id: 'legal',
    title: 'Legal & Compliance',
    color: '#10B981',
    tools: [
      { name: 'Business Name Check', status: 'available' },
      { name: 'NIB Registration', status: 'available' },
      { name: 'PIRT License', status: 'available' },
      { name: 'Halal Certification', status: 'available' },
      { name: 'Trademark Registration', status: 'available' },
      { name: 'Contract Templates', status: 'coming_soon' },
      { name: 'Export Compliance', status: 'coming_soon' },
    ],
  },
  {
    id: 'export',
    title: 'Export',
    color: '#6366F1',
    tools: [
      { name: 'HS Code Lookup', status: 'coming_soon' },
      { name: 'Import Duty Estimator', status: 'coming_soon' },
      { name: 'Buyer Matching', status: 'coming_soon' },
      { name: 'Incoterms Guide', status: 'coming_soon' },
      { name: 'Export Documents', status: 'coming_soon' },
      { name: 'Currency Risk Calculator', status: 'coming_soon' },
      { name: 'Certification Guide', status: 'coming_soon' },
      { name: 'Freight Estimator', status: 'coming_soon' },
      { name: 'Localization Tool', status: 'coming_soon' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    color: '#818CF8',
    tools: [
      { name: 'Content Generator', status: 'coming_soon' },
      { name: 'Competitor Analysis', status: 'coming_soon' },
      { name: 'Ads', status: 'pro' },
      { name: 'SEO Optimizer', status: 'available' },
      { name: 'Content Calendar', status: 'available' },
      { name: 'A/B Testing', status: 'coming_soon' },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    color: '#F5A623',
    tools: [
      { name: 'QR Menu & Pesanan', status: 'available' },
      { name: 'POS / Kasir', status: 'available' },
      { name: 'Inventory Management', status: 'available' },
      { name: 'Supplier Database', status: 'available' },
      { name: 'Production Capacity Planner', status: 'available' },
      { name: 'Telegram Operasional', status: 'available' },
    ],
  },
  {
    id: 'sales',
    title: 'Sales & CRM',
    color: '#10B981',
    tools: [
      { name: 'Customer CRM', status: 'pro' },
      { name: 'Invoice Follow-up', status: 'coming_soon' },
      { name: 'Loyalty Program', status: 'coming_soon' },
      { name: 'WhatsApp Sales Tracker', status: 'coming_soon' },
    ],
  },
  {
    id: 'capital',
    title: 'Capital',
    color: '#6366F1',
    tools: [
      { name: 'KUR Matching', status: 'coming_soon' },
      { name: 'Pitch Deck Builder', status: 'coming_soon' },
      { name: 'Partnership Marketplace', status: 'coming_soon' },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    color: '#818CF8',
    tools: [
      { name: 'Real-time Dashboard', status: 'pro' },
      { name: 'Benchmarking', status: 'coming_soon' },
      { name: 'Weekly Recap', status: 'coming_soon' },
    ],
  },
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function BusinessTools() {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(null)

  const q = search.toLowerCase()
  const filtered = categories
    .map((cat) => ({
      ...cat,
      tools: cat.tools.filter((t) => t.name.toLowerCase().includes(q)),
    }))
    .filter((cat) => cat.tools.length > 0)

  const totalTools = categories.reduce((sum, c) => sum + c.tools.length, 0)

  return (
    <section id="tools" className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          className="max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mb-3 text-sm font-semibold tracking-wide text-profit-500 uppercase">
            Business Tools
          </p>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-navy-500 sm:text-4xl">
            <span className="text-warm-400">{totalTools}+ tools</span> untuk setiap
            <br />
            aspek bisnis lo.
          </h2>
          <p className="mt-3 max-w-lg text-base text-text-secondary">
            Dari kalkulator HPP sampai kalkulator impor — semua ada di sini.
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          className="relative mt-8 max-w-md"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder={`Cari dari ${totalTools} tools…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </motion.div>

        {/* Category Grid */}
        <motion.div
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          {filtered.map((cat) => (
            <motion.div
              key={cat.id}
              variants={item}
              className={`rounded-2xl border bg-surface p-5 transition-all duration-200 ${
                active === cat.id
                  ? 'border-warm-200 shadow-sm'
                  : 'border-border hover:border-warm-100'
              }`}
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm font-bold text-navy-600">{cat.title}</span>
                <span className="ml-auto rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {cat.tools.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {cat.tools.map((tool) => {
                  const st = STATUS[tool.status]
                  return (
                    <li
                      key={tool.name}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-cream/80 hover:text-navy-600"
                    >
                      <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                      <span className="flex-1">{tool.name}</span>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${st.bg} ${st.text} ${st.border}`}>
                        {st.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {filtered.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-sm text-text-muted">
              Tidak ada tool yang cocok dengan pencarian "<span className="font-medium text-navy-600">{search}</span>".
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
