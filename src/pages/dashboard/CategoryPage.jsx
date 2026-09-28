import { motion } from 'framer-motion'
import { CATEGORIES } from '../../data/categories'
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

  if (!category) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-semibold text-text-muted">Kategori tidak ditemukan.</p>
      </div>
    )
  }

  const availableCount = category.tools.filter(
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
        {category.tools.map((tool) => (
          <motion.div key={tool.name} variants={item}>
            <ToolCard tool={tool} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
