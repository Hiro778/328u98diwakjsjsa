import { motion } from 'framer-motion'
import {
  LOGO_CHECK_STATUS,
  getLogoCheckStatusConfig,
  LOGO_MATCH_CONFIG,
  NO_CLAIM_DISCLAIMERS,
} from '../../lib/legalUtils'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

function MatchTypeBadge({ type }) {
  const config = LOGO_MATCH_CONFIG[type]
  if (!config) return null
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass}`}
    >
      {config.label}
    </span>
  )
}

function LogoResultCard({ result }) {
  return (
    <motion.div
      variants={item}
      className="rounded-xl border border-border bg-cream/50 p-4"
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        {result.thumbnail_url ? (
          <img
            src={result.thumbnail_url}
            alt={result.name}
            className="h-16 w-16 shrink-0 rounded-lg object-cover bg-navy-50"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-navy-50">
            <svg className="h-6 w-6 text-navy-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[13px] font-semibold text-navy-700 line-clamp-2">
              {result.name}
            </h4>
            <MatchTypeBadge type={result.type} />
          </div>

          {result.description && (
            <p className="mt-1 text-[11px] text-text-secondary line-clamp-2">
              {result.description}
            </p>
          )}

          {result.similarity !== undefined && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100">
                <div
                  className="h-full rounded-full bg-warm-400"
                  style={{ width: `${Math.min(result.similarity, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-text-muted">
                {result.similarity}%
              </span>
            </div>
          )}

          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-electric-600 hover:underline"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Lihat sumber
            </a>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function LogoCheckResults({ overallStatus, results = [], totalResults = 0, errorMessage }) {
  const statusConfig = getLogoCheckStatusConfig(overallStatus)

  if (overallStatus === LOGO_CHECK_STATUS.CHECKING) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <h2 className="text-sm font-bold text-navy-700">Hasil Penelusuran Logo</h2>

      {/* Overall status banner */}
      <div className={`mt-3 flex items-start gap-3 rounded-2xl border p-4 ${statusConfig.borderClass} ${statusConfig.bgClass}`}>
        <svg
          className={`mt-0.5 h-5 w-5 shrink-0 ${statusConfig.textClass}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={statusConfig.iconPath} />
        </svg>
        <div>
          <p className={`text-sm font-bold ${statusConfig.textClass}`}>
            {overallStatus === LOGO_CHECK_STATUS.HAS_SIMILARITY
              ? `${statusConfig.label} — ${totalResults} hasil perlu ditinjau`
              : statusConfig.label}
          </p>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {overallStatus === LOGO_CHECK_STATUS.CLEAN
              ? NO_CLAIM_DISCLAIMERS.logoClean
              : overallStatus === LOGO_CHECK_STATUS.HAS_SIMILARITY
                ? NO_CLAIM_DISCLAIMERS.logoSimilarity
                : errorMessage || statusConfig.description}
          </p>
        </div>
      </div>

      {/* Result cards */}
      {results.length > 0 && (
        <motion.div
          className="mt-4 space-y-3"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {results.map((result, idx) => (
            <LogoResultCard key={idx} result={result} />
          ))}
        </motion.div>
      )}

      {/* Never-claim disclaimer */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-warm-200 bg-warm-50 p-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-warm-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[12px] leading-relaxed text-warm-600">
          {NO_CLAIM_DISCLAIMERS.neverRegister}
        </p>
      </div>
    </motion.div>
  )
}
