import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getBusinessQrisSettings,
  uploadBusinessQris,
  deleteBusinessQris,
  setBusinessQrisEnabled,
  getSecureQrisUrl,
  validateQrisFile,
} from '../../services/qrisPaymentService'

/**
 * BusinessQrisSettings Component
 * Provides UI for UMKM business owners to manage QRIS settings:
 * - View QRIS status
 * - Upload/Replace QRIS image
 * - View secure QRIS preview via time-limited signed URL
 * - Delete QRIS with modal confirmation
 * - Toggle QRIS ON/OFF with pre-condition validation
 *
 * @param {object} props
 * @param {string} props.businessId - Authenticated business UUID
 * @param {function} [props.onToast] - Optional callback to show toast (message, type)
 */
export default function BusinessQrisSettings({ businessId, onToast }) {
  const fileInputRef = useRef(null)

  // Loading & data states
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [securePreviewUrl, setSecurePreviewUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Action states
  const [uploading, setUploading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [localError, setLocalError] = useState(null)

  // Internal helper to show notifications
  const notify = useCallback(
    (message, type = 'info') => {
      if (onToast) {
        onToast(message, type)
      } else {
        if (type === 'error') {
          setLocalError(message)
        }
      }
    },
    [onToast]
  )

  // Load QRIS settings and secure preview URL
  const loadQrisData = useCallback(async () => {
    if (!businessId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setLocalError(null)

    try {
      const { data, error } = await getBusinessQrisSettings(businessId)
      if (error) {
        notify(error.message, 'error')
        setSettings(null)
        setSecurePreviewUrl(null)
        return
      }

      setSettings(data)

      // If business has QRIS image, fetch a scoped signed preview URL
      if (data?.qris_image_url) {
        setLoadingPreview(true)
        const { data: signData, error: signError } = await getSecureQrisUrl(businessId)
        if (signError) {
          console.warn('[BusinessQrisSettings] Gagal memuat signed preview:', signError)
          // Fallback to direct URL if signed URL generation fails
          setSecurePreviewUrl(data.qris_image_url)
        } else {
          setSecurePreviewUrl(signData?.signedUrl || data.qris_image_url)
        }
        setLoadingPreview(false)
      } else {
        setSecurePreviewUrl(null)
      }
    } catch (err) {
      notify(err.message || 'Gagal memuat pengaturan QRIS.', 'error')
    } finally {
      setLoading(false)
    }
  }, [businessId, notify])

  useEffect(() => {
    loadQrisData()
  }, [loadQrisData])

  // Handle file selection and upload
  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input value so re-selecting same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // 1. Client-side file validation
    const validation = validateQrisFile(file)
    if (!validation.valid) {
      notify(validation.error, 'error')
      return
    }

    if (!businessId) {
      notify('Bisnis tidak valid atau belum dipilih.', 'error')
      return
    }

    setUploading(true)
    setLocalError(null)

    try {
      // 2. Upload file & update settings
      const currentEnabled = settings?.qris_enabled ?? true
      const { data, error } = await uploadBusinessQris(businessId, file, {
        qrisEnabled: currentEnabled,
      })

      if (error) {
        notify(error.message, 'error')
        return
      }

      // 3. Update state & fetch secure preview URL
      setSettings(data)
      const { data: signData } = await getSecureQrisUrl(businessId)
      setSecurePreviewUrl(signData?.signedUrl || data.qris_image_url)

      notify('QRIS toko berhasil diunggah!', 'success')
    } catch (err) {
      notify(err.message || 'Gagal mengunggah QRIS toko.', 'error')
    } finally {
      setUploading(false)
    }
  }

  // Handle toggle ON/OFF
  async function handleToggleEnabled() {
    if (!settings || toggling || uploading || deleting) return

    const nextState = !settings.qris_enabled

    // Validation: Cannot turn ON if no QRIS image exists
    if (nextState && !settings.qris_image_url) {
      notify('Upload QRIS terlebih dahulu sebelum mengaktifkan pembayaran QRIS.', 'error')
      return
    }

    setToggling(true)
    setLocalError(null)

    try {
      const { data, error } = await setBusinessQrisEnabled(businessId, nextState)
      if (error) {
        notify(error.message, 'error')
        return
      }

      setSettings((prev) => ({ ...prev, qris_enabled: data.qris_enabled }))
      notify(
        data.qris_enabled ? 'Pembayaran QRIS diaktifkan.' : 'Pembayaran QRIS dinonaktifkan.',
        'success'
      )
    } catch (err) {
      notify(err.message || 'Gagal mengubah status QRIS.', 'error')
    } finally {
      setToggling(false)
    }
  }

  // Handle QRIS deletion
  async function handleConfirmDelete() {
    if (!businessId || deleting) return

    setDeleting(true)
    setLocalError(null)

    try {
      const { success, error } = await deleteBusinessQris(businessId)
      if (!success || error) {
        notify(error?.message || 'Gagal menghapus QRIS toko.', 'error')
        return
      }

      // Reset state
      setSettings((prev) => (prev ? { ...prev, qris_image_url: null, qris_enabled: false } : null))
      setSecurePreviewUrl(null)
      setShowDeleteModal(false)
      notify('QRIS toko berhasil dihapus.', 'success')
    } catch (err) {
      notify(err.message || 'Gagal menghapus QRIS toko.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const hasQris = Boolean(settings?.qris_image_url)
  const isEnabled = Boolean(settings?.qris_enabled)

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Pilih file gambar QRIS"
      />

      {/* Header section */}
      <div className="p-4 sm:p-8 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-elevated/20">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-text-primary">
              QRIS Toko
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-text-secondary">
            Pembayaran langsung ke rekening/merchant QRIS bisnis Anda.
          </p>
        </div>

        {/* Status Badge & Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-border bg-surface">
            {isEnabled ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500 font-bold">Aktif</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-text-muted/60" />
                <span className="text-text-muted">Nonaktif</span>
              </>
            )}
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label="Aktifkan atau nonaktifkan QRIS toko"
            disabled={loading || toggling || uploading}
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${
              isEnabled ? 'bg-primary' : 'bg-surface-hover border-border'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 lg:p-8">
        {localError && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-400 flex items-center justify-between">
            <span>{localError}</span>
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="text-red-400 hover:text-red-300 font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent mb-3" />
            <p className="text-xs text-text-muted">Memuat pengaturan QRIS...</p>
          </div>
        ) : !hasQris ? (
          /* Empty State: Belum ada QRIS */
          <div className="rounded-2xl border-2 border-dashed border-border bg-surface-elevated/20 p-8 sm:p-12 text-center flex flex-col items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-border text-text-muted mb-4 shadow-xs">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-text-primary">
              Belum ada QRIS
            </h3>
            <p className="mt-1 text-xs text-text-muted max-w-sm">
              Upload QRIS untuk menerima pembayaran melalui QRIS langsung ke toko Anda.
            </p>

            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {uploading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Mengunggah QRIS...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload QRIS
                  </>
                )}
              </button>
              <span className="text-[11px] text-text-muted">
                Format: PNG, JPG, atau WebP. Maksimal 3 MB.
              </span>
            </div>
          </div>
        ) : (
          /* Has QRIS: Preview and Actions */
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 bg-surface-elevated/40 rounded-2xl border border-border p-4 sm:p-8">
            {/* QR Image Preview Card */}
            <div className="relative group shrink-0">
              <div className="flex h-48 w-48 sm:h-56 sm:w-56 max-w-full items-center justify-center rounded-2xl bg-white p-3 shadow-md border border-border/80 overflow-hidden">
                {loadingPreview ? (
                  <div className="flex flex-col items-center justify-center text-zinc-500">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent mb-2" />
                    <span className="text-[10px]">Memuat gambar...</span>
                  </div>
                ) : securePreviewUrl ? (
                  <img
                    src={securePreviewUrl}
                    alt="QRIS Toko"
                    className="h-full w-full object-contain"
                    onError={() => {
                      setLocalError('Gagal memuat preview gambar QRIS.')
                    }}
                  />
                ) : (
                  <div className="text-center text-zinc-400 text-xs">
                    Gambar tidak dapat dimuat
                  </div>
                )}
              </div>
              <div className="mt-2 text-center">
                <span className="text-[11px] text-text-muted font-medium">
                  Akses gambar aman & terenkripsi
                </span>
              </div>
            </div>

            {/* QRIS Status & Actions */}
            <div className="flex-1 flex flex-col justify-between self-stretch text-center sm:text-left">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-text-primary">
                    QRIS Terdaftar
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    QRIS ini digunakan sebagai tujuan transfer scan pada pesanan tokomu.
                  </p>
                </div>

                <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold">
                  <span className="text-text-muted">Status:</span>
                  {isEnabled ? (
                    <span className="text-emerald-500 font-bold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Aktif (Dapat digunakan pelanggan)
                    </span>
                  ) : (
                    <span className="text-text-muted flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-text-muted/60" />
                      Nonaktif (Tidak ditampilkan di checkout)
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || deleting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-hover hover:border-primary/50 transition-colors shadow-xs disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-text-primary border-t-transparent" />
                      Mengunggah...
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Ganti QRIS
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={uploading || deleting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Hapus QRIS
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-[calc(100vw-24px)] sm:max-w-md max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-border bg-surface-elevated p-4 sm:p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    Hapus QRIS toko?
                  </h3>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                    QRIS akan dihapus dan tidak dapat digunakan untuk pembayaran QRIS.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {deleting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Menghapus...
                    </>
                  ) : (
                    'Hapus QRIS'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
