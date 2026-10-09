import { motion } from 'framer-motion'
import { CATEGORIES, isToolVisible, isCategoryVisible } from '../../data/categories'
import ToolCard from '../../components/ToolCard'
import BackButton from '../../components/BackButton'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function CategoryPage({ categoryId }) {
  const category = CATEGORIES[categoryId]

  if (!category || !isCategoryVisible(category)) {
    return (
      <div className="space-y-6">
        <BackButton fallbackUrl="/dashboard" label="Kembali" />
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-[#222C3E] bg-[#151D2C] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
            🔒 Fitur Tidak Tersedia
          </span>
          <h2 className="mt-4 text-xl font-bold text-white">
            Fitur ini saat ini belum tersedia
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Platform BisnisSehat saat ini berfokus penuh pada solusi dan instrumen bisnis UMKM Indonesia.
          </p>
        </div>
      </div>
    )
  }

  const visibleTools = category.tools.filter(isToolVisible)

  const availableCount = visibleTools.filter(
    (t) => t.availability !== 'COMING_SOON' && t.status !== 'coming_soon'
  ).length

  return (
    <div className="space-y-6">
      <BackButton fallbackUrl="/dashboard" label="Kembali" />
      {/* Category Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-2 border-b border-[#222C3E] pb-6"
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            {availableCount > 0 ? `${availableCount} Tools Siap Pakai` : `${category.tools.length} Tools Segera Hadir`}
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {category.title}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
          Kelola dan optimalkan aspek {category.title.toLowerCase()} usaha Anda dengan rangkaian instrumen otomatis dan analitik akurat.
        </p>
      </motion.div>

      {/* Tools Grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {visibleTools.map((tool) => (
          <motion.div key={tool.name} variants={item}>
            <ToolCard tool={tool} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
