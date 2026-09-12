import { motion } from 'framer-motion'
import { CATEGORIES } from '../../data/categories'
import ToolCard from '../../components/ToolCard'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function CategoryPage({ categoryId }) {
  const category = CATEGORIES[categoryId]

  if (!category) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-text-muted">Kategori tidak ditemukan.</p>
      </div>
    )
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p
          className="mb-1 text-sm font-semibold uppercase tracking-wide"
          style={{ color: category.color }}
        >
          {category.title}
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">{category.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {category.tools.length} tools tersedia
        </p>
      </motion.div>

      <motion.div
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
