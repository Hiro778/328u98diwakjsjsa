import { motion } from 'framer-motion'
import LegalDisclaimer from './LegalDisclaimer'

/**
 * Shared layout wrapper for all Legal & Compliance tool pages.
 * Provides consistent header, content area, and disclaimer placement.
 */
export default function LegalToolPage({
  categoryLabel = 'Legal & Compliance',
  title,
  description,
  disclaimerType = 'general',
  children,
}) {
  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-profit-500">
          {categoryLabel}
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </motion.div>

      <div className="mt-6">{children}</div>

      <div className="mt-6">
        <LegalDisclaimer type={disclaimerType} />
      </div>
    </div>
  )
}
