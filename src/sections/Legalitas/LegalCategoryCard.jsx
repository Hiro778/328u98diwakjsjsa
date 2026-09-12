import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { normalizeCheckStatus, getStatusConfig, LEGAL_CHECK_STATUS, CATEGORY_CONFIG } from '../../lib/legalUtils'
import { LEGAL_LINKS } from '../../lib/officialLegalLinks'
import OfficialSourceButton from './OfficialSourceButton'

const STATUS_EXPLANATION = {
  [LEGAL_CHECK_STATUS.CHECKING]: 'Sedang melakukan pengecekan...',
  [LEGAL_CHECK_STATUS.FOUND]: 'Ditemukan pada sumber yang diperiksa.',
  [LEGAL_CHECK_STATUS.NOT_FOUND]: 'Belum ditemukan pada sumber yang diperiksa. Silakan periksa langsung di portal resmi.',
  [LEGAL_CHECK_STATUS.ERROR]: 'Terjadi kesalahan saat pengecekan. Silakan coba lagi.',
  [LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION]: 'Perlu pengecekan langsung di portal resmi pemerintah.',
}

const CATEGORY_PORTAL_LABEL = {
  nib: 'OSS',
  pirt: 'BPOM',
  halal: 'BPJPH',
  trademark: 'DJKI',
}

export default function LegalCategoryCard({ category, result, onConfirm }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmedNumber, setConfirmedNumber] = useState('')

  const status = normalizeCheckStatus(result?.status)
  const config = getStatusConfig(status)
  const catConfig = CATEGORY_CONFIG[category]
  const portalKey = catConfig?.portalKey
  const portalLink = portalKey ? LEGAL_LINKS[portalKey] : null
  const explanation = STATUS_EXPLANATION[status] || ''
  const portalLabel = CATEGORY_PORTAL_LABEL[category] || ''

  const canConfirm = status === LEGAL_CHECK_STATUS.NEEDS_OFFICIAL_VERIFICATION ||
    status === LEGAL_CHECK_STATUS.NOT_FOUND

  function handleConfirm() {
    if (result?.id && onConfirm) {
      onConfirm(result.id, confirmedNumber.trim() || null)
      setShowConfirm(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bgClass}`}>
          <svg
            className={`h-5 w-5 ${config.textClass}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={catConfig?.icon} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-navy-700">{catConfig?.shortLabel}</h3>
          <p className="text-[11px] text-text-muted">{catConfig?.label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${config.bgClass} ${config.textClass} ${config.borderClass}`}
        >
          {status === LEGAL_CHECK_STATUS.CHECKING && (
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-electric-400" />
          )}
          {config.label}
        </span>
      </div>

      {/* Explanation */}
      <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">{explanation}</p>

      {/* Portal link */}
      {portalLink && (
        <div className="mt-3">
          <OfficialSourceButton
            url={portalLink.url}
            label={`Verifikasi di Portal ${portalLabel} →`}
          />
        </div>
      )}

      {/* Confirmation toggle */}
      {canConfirm && !result?.user_confirmed && (
        <div className="mt-3">
          {!showConfirm ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="text-[12px] font-semibold text-electric-600 hover:underline"
            >
              Sudah mengecek di portal? Tandai di sini →
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 rounded-xl border border-border bg-cream/50 p-3"
              >
                <p className="mb-2 text-[12px] font-semibold text-navy-700">
                  Tandai bahwa Anda sudah mengecek di portal {portalLabel}
                </p>
                <input
                  type="text"
                  value={confirmedNumber}
                  onChange={(e) => setConfirmedNumber(e.target.value)}
                  placeholder={`Nomor registrasi ${catConfig?.shortLabel} (opsional)`}
                  className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded-lg bg-profit-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-profit-600"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirm(false)
                      setConfirmedNumber('')
                    }}
                    className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-text-secondary transition-all hover:bg-navy-50"
                  >
                    Batal
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Confirmed indicator */}
      {result?.user_confirmed && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-profit-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Sudah dicek
          {result.confirmed_number && (
            <span className="text-text-muted"> — {result.confirmed_number}</span>
          )}
        </div>
      )}
    </motion.div>
  )
}
