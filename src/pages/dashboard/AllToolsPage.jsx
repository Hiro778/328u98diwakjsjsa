import { useState } from 'react'
import { motion } from 'framer-motion'
import { CATEGORIES, TOTAL_TOOLS } from '../../data/categories'
import ToolCard from '../../components/ToolCard'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
}

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function AllToolsPage() {
  const [search, setSearch] = useState('')
  const q = search.toLowerCase()

  const filtered = Object.values(CATEGORIES)
    .map((cat) => ({
      ...cat,
      tools: cat.tools.filter((t) => t.name.toLowerCase().includes(q)),
    }))
    .filter((cat) => cat.tools.length > 0)

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-2xl font-extrabold text-navy-700">Semua Tools</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {TOTAL_TOOLS}+ tools untuk setiap aspek bisnis lo.
        </p>
      </motion.div>

      {/* Search */}
      <div className="relative mt-6 max-w-md">
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
          placeholder={`Cari dari ${TOTAL_TOOLS} tools...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        />
      </div>

      {/* Categories */}
      {filtered.length > 0 ? (
        <div className="mt-8 space-y-10">
          {filtered.map((cat) => (
            <motion.section
              key={cat.id}
              variants={container}
              initial="hidden"
              animate="visible"
            >
              <h2
                className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: cat.color }}
              >
                {cat.title}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cat.tools.map((tool) => (
                  <motion.div key={tool.name} variants={item}>
                    <ToolCard tool={tool} />
                  </motion.div>
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      ) : (
        <div className="mt-12 text-center">
          <p className="text-sm text-text-muted">
            Tidak ada tool yang cocok dengan pencarian "<span className="font-medium text-navy-600">{search}</span>".
          </p>
        </div>
      )}
    </div>
  )
}
