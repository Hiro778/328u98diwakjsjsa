import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getSourceStatusConfig,
  LEGAL_SOURCE_STATUS,
  SOURCE_CONFIG,
} from '../../lib/legalUtils'
import OfficialSourceButton from './OfficialSourceButton'

const STATUS_EXPLANATION = {
  [LEGAL_SOURCE_STATUS.TERKONFIRMASI]: 'Data ditemukan dan cocok dengan identifier yang diperiksa.',
  [LEGAL_SOURCE_STATUS.DITEMUKAN]: 'Data ditemukan pada sumber yang diperiksa. Perlu verifikasi di portal resmi.',
  [LEGAL_SOURCE_STATUS.TIDAK_DITEMUKAN]: 'Tidak ditemukan kecocokan pada sumber yang diperiksa. Silakan periksa langsung di portal resmi.',
  [LEGAL_SOURCE_STATUS.PERLU_DITINJAU]: 'Perlu pengecekan langsung di portal resmi pemerintah.',
  [LEGAL_SOURCE_STATUS.TIDAK_RELEVAN]: 'Sumber ini tidak relevan berdasarkan data yang dimasukkan.',
  [LEGAL_SOURCE_STATUS.GAGAL_DIPERIKSA]: 'Pemeriksaan terhadap sumber ini gagal. Silakan coba lagi atau periksa langsung.',
}

export default function LegalSourceCard({ source, result, onConfirm }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmedNumber, setConfirmedNumber] = useState('')

  const status = result?.status || LEGAL_SOURCE_STATUS.PERLU_DITINJAU
  const statusConfig = getSourceStatusConfig(status)
  const sourceConfig = SOURCE_CONFIG[source]
  const explanation = STATUS_EXPLANATION[status] || ''
  const detail = result?.result_detail || {}

  const canConfirm =
    status === LEGAL_SOURCE_STATUS.PERLU_DITINJAU ||
    status === LEGAL_SOURCE_STATUS.TIDAK_DITEMUKAN

  function handleConfirm() {
    if (result?.id && onConfirm) {
      onConfirm(result.id, confirmedNumber.trim() || null)
      setShowConfirm(false)
    }
  }

  // Render detail fields if available
  const detailFields = sourceConfig?.detailLabels || {}
  const hasDetails = Object.keys(detailFields).some(
    (key) => detail[key] !== undefined && detail[key] !== null && detail[key] !== ''
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${statusConfig.bgClass}`}>
          <svg
            className={`h-5 w-5 ${statusConfig.textClass}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={sourceConfig?.icon} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-navy-700">{sourceConfig?.shortLabel}</h3>
          <p className="text-[11px] text-text-muted">{sourceConfig?.label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusConfig.bgClass} ${statusConfig.textClass} ${statusConfig.borderClass}`}
        >
          {status === LEGAL_SOURCE_STATUS.PERLU_DITINJAU && (
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-navy-400" />
          )}
          {statusConfig.label}
        </span>
      </div>

      {/* Explanation */}
      <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
        {result?.result_summary || explanation}
      </p>

      {/* Detail fields */}
      {hasDetails && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(detailFields).map(([key, label]) => {
            const value = detail[key]
            if (value === undefined || value === null || value === '') return null
            const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
            return (
              <div key={key} className="flex items-baseline gap-2 text-[12px]">
                <span className="shrink-0 font-medium text-text-muted">{label}:</span>
                <span className="truncate font-semibold text-navy-700">{displayValue}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Error message */}
      {status === LEGAL_SOURCE_STATUS.GAGAL_DIPERIKSA && result?.error_message && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-[12px] text-red-600">{result.error_message}</p>
        </div>
      )}

      {/* Portal link */}
      {result?.portal_link && status !== LEGAL_SOURCE_STATUS.TIDAK_RELEVAN && (
        <div className="mt-3">
          <OfficialSourceButton
            url={result.portal_link}
            label={`Buka Sumber Resmi →`}
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
                  Tandai bahwa Anda sudah mengecek
                </p>
                <input
                  type="text"
                  value={confirmedNumber}
                  onChange={(e) => setConfirmedNumber(e.target.value)}
                  placeholder="Nomor registrasi (opsional)"
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
