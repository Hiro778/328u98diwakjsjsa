import { useState } from 'react'
import { motion } from 'framer-motion'
import { CATEGORIES, isToolVisible, isCategoryVisible, TOTAL_VISIBLE_TOOLS } from '../../data/categories'
import ToolCard from '../../components/ToolCard'
import BackButton from '../../components/BackButton'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.025 } },
}

const item = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
}

const CATEGORY_TABS = [
  { id: 'all', label: 'Semua' },
  { id: 'finance', label: 'Keuangan' },
  { id: 'operations', label: 'Operasional' },
  { id: 'sales', label: 'Penjualan & CRM' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'legal', label: 'Legal & Compliance' },
  { id: 'analytics', label: 'Analytics' },
]

export default function AllToolsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const q = search.toLowerCase().trim()

  const categoriesToDisplay = (activeCategory === 'all'
    ? Object.values(CATEGORIES).filter(isCategoryVisible)
    : Object.values(CATEGORIES).filter((cat) => cat.id === activeCategory && isCategoryVisible(cat))
  )

  const filtered = categoriesToDisplay
    .map((cat) => ({
      ...cat,
      tools: cat.tools.filter((t) => {
        if (!isToolVisible(t)) return false
        const matchesQuery = t.name.toLowerCase().includes(q)
        if (!matchesQuery) return false
        if (tierFilter === 'basic') return t.tier === 'basic'
        if (tierFilter === 'pro') return t.tier === 'pro' || t.requiresPro
        return true
      }),
    }))
    .filter((cat) => cat.tools.length > 0)

  return (
    <div className="space-y-6">
      <BackButton fallbackUrl="/dashboard" label="Kembali" />

      {/* Workspace Application Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-4 border-b border-[#222C3E] pb-6"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Direktori Tools
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Katalog instrumen operasional, keuangan, kasir POS, dan otomasi BisnisSehat.
          </p>
        </div>

        {/* Search and Category Filter Controls */}
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative w-full sm:max-w-xs">
              <svg
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                placeholder={`Cari dari ${TOTAL_VISIBLE_TOOLS} tools...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#222C3E] bg-[#151D2C] py-2 pl-9 pr-8 text-xs sm:text-sm text-[#F8FAFC] placeholder:text-slate-500 focus:border-[#818CF8] focus:outline-none focus:ring-1 focus:ring-[#818CF8]/40 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-mono text-slate-400 hover:text-white"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Tier Filter Pills */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs">
              <span className="text-[11px] font-mono text-slate-500 mr-0.5">Tier:</span>
              {[
                { id: 'all', label: 'Semua' },
                { id: 'basic', label: 'Basic • Rp35K', activeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
                { id: 'pro', label: 'Pro • Rp130K', activeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
              ].map((tier) => {
                const isSelected = tierFilter === tier.id
                return (
                  <button
                    key={tier.id}
                    onClick={() => setTierFilter(tier.id)}
                    className={`inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? tier.activeClass || 'bg-[#1E293B] text-white border-[#222C3E] shadow-xs'
                        : 'border-transparent text-slate-400 hover:text-white hover:bg-[#151D2C]'
                    }`}
                  >
                    {tier.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab.id
              const count = tab.id === 'all'
                ? TOTAL_VISIBLE_TOOLS
                : CATEGORIES[tab.id]?.tools.filter(isToolVisible).length || 0

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#1E293B] text-white border border-[#222C3E] shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-[#151D2C]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-mono ${isActive ? 'text-[#818CF8]' : 'text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Categories Grid Display */}
      {filtered.length > 0 ? (
        <div className="space-y-8">
          {filtered.map((cat) => (
            <motion.section
              key={cat.id}
              variants={container}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {/* Category Header */}
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  {cat.title}
                </h2>
                <span className="text-[11px] font-mono text-slate-500">
                  ({cat.tools.length})
                </span>
              </div>

              {/* Tools Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="rounded-xl border border-dashed border-[#222C3E] bg-[#151D2C]/40 p-10 text-center">
          <p className="text-sm font-semibold text-white">Tidak Ada Tool Ditemukan</p>
          <p className="mt-1 text-xs text-slate-400">
            Tidak ada tool yang cocok dengan filter atau kata kunci &ldquo;<span className="font-semibold text-slate-200">{search}</span>&rdquo;.
          </p>
          <button
            onClick={() => {
              setSearch('')
              setActiveCategory('all')
              setTierFilter('all')
            }}
            className="mt-4 inline-flex items-center rounded-lg border border-[#222C3E] bg-[#1E293B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#222C3E] transition-colors"
          >
            Reset Filter
          </button>
        </div>
      )}
    </div>
  )
}
