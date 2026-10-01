// src/components/help/BugReportModal.jsx
// Native Bug Report Modal conforming to @30.md specifications:
// - Header: "Lapor Bug"
// - Subtitle: "Laporkan masalah yang kamu temukan agar tim kami dapat segera memeriksanya."
// - Fields:
//     * Nama (opsional)
//     * Deskripsi Bug * (textarea, required)
//     * Foto / Screenshot * (image upload, image preview, required)
// - Buttons: [Batal], [Kirim Laporan]
// - Loading state, double-submit protection, auto-cleanup on failure
// - Success: "Laporan bug berhasil dikirim.", "Tim support akan memeriksa laporan kamu."

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import {
  submitBugReport,
  validateBugReportInput,
  MAX_SCREENSHOT_SIZE_BYTES,
  ALLOWED_IMAGE_TYPES,
} from '../../services/bugReportService'

export default function BugReportModal({ isOpen, onClose }) {
  const { user, business } = useAuth()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [screenshotFile, setScreenshotFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const fileInputRef = useRef(null)

  // Reset form when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setName(user?.user_metadata?.full_name || '')
      setDescription('')
      setScreenshotFile(null)
      setPreviewUrl(null)
      setErrors({})
      setSubmitError(null)
      setIsSuccess(false)
      setSubmitting(false)
    } else {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [isOpen, user])

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSubmitError(null)
    const newErrors = { ...errors }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      newErrors.screenshot = 'Format file tidak didukung. Harap pilih gambar PNG, JPEG, atau WebP.'
      setErrors(newErrors)
      return
    }

    if (file.size > MAX_SCREENSHOT_SIZE_BYTES) {
      newErrors.screenshot = `Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maksimal 5MB.`
      setErrors(newErrors)
      return
    }

    delete newErrors.screenshot
    setErrors(newErrors)
    setScreenshotFile(file)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
  }

  const handleRemoveFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setScreenshotFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (submitting) return

    setSubmitError(null)
    const validation = validateBugReportInput({ name, description, screenshotFile })
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setSubmitting(true)
    try {
      await submitBugReport({
        name,
        description,
        screenshotFile,
        businessId: business?.id || null,
        pageUrl: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '',
      })

      setIsSuccess(true)
      // Automatically close after 2 seconds
      setTimeout(() => {
        onClose()
      }, 2200)
    } catch (err) {
      setSubmitError(err.message || 'Terjadi kesalahan saat mengirimkan laporan bug.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      data-testid="bug-report-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-[calc(100vw-24px)] sm:max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl text-text-primary"
      >
        {/* Success Overlay */}
        <AnimatePresence>
          {isSuccess && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/95 backdrop-blur-sm p-6 text-center"
              data-testid="bug-report-success-state"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 mb-4">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-1">
                Laporan bug berhasil dikirim.
              </h3>
              <p className="text-sm text-text-muted max-w-sm mb-6">
                Tim support akan memeriksa laporan kamu.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors"
              >
                Tutup
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-border bg-surface-hover/30 px-4 sm:px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <h2 id="bug-report-title" className="text-base font-bold text-text-primary">
                Lapor Bug
              </h2>
            </div>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              Laporkan masalah yang kamu temukan agar tim kami dapat segera memeriksanya.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
            aria-label="Tutup formulir lapor bug"
            data-testid="bug-report-close-button"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {submitError && (
            <div
              className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center justify-between"
              data-testid="bug-report-error-alert"
            >
              <span>{submitError}</span>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="text-xs opacity-75 hover:opacity-100 ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Field 1: Nama (Optional) */}
          <div className="space-y-1.5">
            <label htmlFor="bug-name" className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>Nama (opsional)</span>
              <span className="text-[10px] text-text-muted font-normal">Boleh dikosongkan</span>
            </label>
            <input
              id="bug-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama kamu"
              disabled={submitting}
              data-testid="bug-report-name-input"
              className="w-full rounded-xl border border-border bg-surface-hover/20 px-3.5 py-2 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Field 2: Deskripsi Bug (Required) */}
          <div className="space-y-1.5">
            <label htmlFor="bug-description" className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>Deskripsi Bug <span className="text-rose-500">*</span></span>
              <span className="text-[10px] text-text-muted font-normal">Wajib diisi</span>
            </label>
            <textarea
              id="bug-description"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (errors.description) {
                  setErrors((prev) => {
                    const copy = { ...prev }
                    delete copy.description
                    return copy
                  })
                }
              }}
              placeholder="Jelaskan masalah yang terjadi..."
              disabled={submitting}
              data-testid="bug-report-description-input"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 transition-colors resize-none disabled:opacity-50 ${
                errors.description
                  ? 'border-rose-500/60 bg-rose-500/5 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-border bg-surface-hover/20 focus:border-primary focus:ring-primary'
              }`}
            />
            {errors.description && (
              <p className="text-[11px] text-rose-400 font-medium" data-testid="bug-description-error">
                {errors.description}
              </p>
            )}
          </div>

          {/* Field 3: Foto / Screenshot (Required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>Foto / Screenshot <span className="text-rose-500">*</span></span>
              <span className="text-[10px] text-text-muted font-normal">PNG, JPEG, WebP (maks. 5MB)</span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
              disabled={submitting}
              className="hidden"
              data-testid="bug-report-file-input"
            />

            {!previewUrl ? (
              <div
                onClick={() => !submitting && fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-surface-hover/40 transition-colors ${
                  errors.screenshot
                    ? 'border-rose-500/60 bg-rose-500/5'
                    : 'border-border bg-surface-hover/10'
                }`}
                data-testid="bug-report-dropzone"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline pointer-events-none"
                >
                  Upload Foto
                </button>
                <span className="text-[11px] text-text-muted mt-0.5">
                  Klik untuk memilih screenshot bukti bug
                </span>
              </div>
            ) : (
              <div className="relative rounded-xl border border-border bg-surface-hover/30 p-2 overflow-hidden" data-testid="bug-report-preview-container">
                <div className="relative max-h-48 w-full overflow-hidden rounded-lg bg-black/40 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Preview Screenshot"
                    className="max-h-48 w-auto object-contain rounded"
                    data-testid="bug-report-preview-image"
                  />
                  {!submitting && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      aria-label="Hapus screenshot"
                      className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900/80 text-white hover:bg-rose-600 transition-colors shadow"
                      data-testid="bug-report-remove-image"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-text-muted">
                  <span className="truncate max-w-[240px] font-mono text-text-secondary">
                    {screenshotFile?.name}
                  </span>
                  <span>
                    {(screenshotFile?.size ? (screenshotFile.size / 1024).toFixed(0) : '0')} KB
                  </span>
                </div>
              </div>
            )}

            {errors.screenshot && (
              <p className="text-[11px] text-rose-400 font-medium" data-testid="bug-screenshot-error">
                {errors.screenshot}
              </p>
            )}
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              data-testid="bug-report-cancel-button"
              className="px-4 py-2 rounded-xl border border-border bg-transparent text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="bug-report-submit-button"
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Mengirim Laporan...</span>
                </>
              ) : (
                <span>Kirim Laporan</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
