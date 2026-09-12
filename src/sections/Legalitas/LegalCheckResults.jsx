import { motion } from 'framer-motion'
import { getSourceResultsMap } from '../../lib/legalUtils'
import LegalSourceCard from './LegalSourceCard'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-navy-100" />
        <div className="flex-1">
          <div className="h-4 w-16 animate-pulse rounded bg-navy-100" />
          <div className="mt-1 h-3 w-32 animate-pulse rounded bg-navy-50" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-navy-100" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-navy-50" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-navy-50" />
      </div>
      <div className="mt-3 h-9 w-48 animate-pulse rounded-xl bg-navy-50" />
    </div>
  )
}

export default function LegalCheckResults({ results = [], loading = false, searchQuery = '', onConfirm }) {
  // Dynamic source list from actual results (only relevant sources shown)
  const sources = results.map(r => r.category)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <h2 className="text-sm font-bold text-navy-700">Hasil Pemeriksaan</h2>
      <p className="mt-1 text-xs text-text-secondary">
        {searchQuery && (
          <>
            <span className="font-semibold text-navy-600">"{searchQuery}"</span>
            {' — '}
          </>
        )}
        Hasil pengecekan dari sumber pemerintah yang relevan. Klik kartu untuk melihat detail.
      </p>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {results.map((result) => (
            <motion.div key={result.category} variants={item}>
              <LegalSourceCard
                source={result.category}
                result={result}
                onConfirm={onConfirm}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
