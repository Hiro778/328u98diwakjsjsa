import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { initiateOAuth } from '../../lib/marketplaceService'

const MARKETPLACE_INFO = {
  shopee: {
    name: 'Shopee',
    color: '#EE4D2D',
    description: 'Marketplace terbesar di Indonesia dengan jutaan pengunjung aktif.',
    docsUrl: 'https://open.shopee.co.id/document',
    docsLabel: 'Shopee Open Platform',
  },
  tokopedia: {
    name: 'Tokopedia',
    color: '#42B549',
    description: 'Platform e-commerce lokal terkemuka dengan ekosistem lengkap.',
    docsUrl: 'https://developer.tokopedia.com/',
    docsLabel: 'Tokopedia Developer Portal',
  },
  tiktokshop: {
    name: 'TikTok Shop',
    color: '#000000',
    description: 'Jualan langsung dari konten video TikTok dengan fitur live shopping.',
    docsUrl: 'https://partner.tiktokshop.com/',
    docsLabel: 'TikTok Shop Partner Center',
  },
}

export default function ConnectionModal({ show, marketplaceKey, onClose, onSuccess }) {
  const [mode, setMode] = useState('info') // 'info' | 'loading' | 'success' | 'error' | 'needs_setup'
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  if (!show || !marketplaceKey) return null

  const info = MARKETPLACE_INFO[marketplaceKey]
  if (!info) return null

  async function handleConnect() {
    setMode('loading')
    setError(null)

    try {
      const result = await initiateOAuth(marketplaceKey)

      if (result.status === 'needs_setup') {
        setMode('needs_setup')
        setError(result.message)
        return
      }

      if (result.status === 'error') {
        setError(result.message || 'Gagal memulai koneksi')
        setMode('error')
        return
      }

      if (result.authorization_url) {
        // Redirect to marketplace authorization page
        window.location.href = result.authorization_url
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
      setMode('error')
    }
  }

  function handleClose() {
    setMode('info')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold"
                  style={{ backgroundColor: info.color }}
                >
                  {info.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-navy-700">
                    {mode === 'loading' ? 'Menghubungkan...' : mode === 'needs_setup' ? 'Perlu Setup' : `Hubungkan ${info.name}`}
                  </h2>
                  <p className="text-xs text-text-muted">{info.description}</p>
                </div>
              </div>
              {mode !== 'loading' && (
                <button
                  onClick={handleClose}
                  className="rounded-lg p-2 text-text-muted hover:bg-cream hover:text-navy-700"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* INFO MODE — Tampilkan info dan tombol Lanjutkan */}
            {mode === 'info' && (
              <>
                {/* Info Banner */}
                <div className="mt-4 rounded-xl bg-warm-50 border border-warm-200 p-4">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 shrink-0 text-warm-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-warm-600">
                      <p className="font-semibold">Koneksi OAuth Diperlukan</p>
                      <p className="mt-1">
                        Anda akan diarahkan ke halaman resmi {info.name} untuk login dan memberikan akses kepada BisnisSehat.
                        Tidak ada kredensial login yang disimpan di BisnisSehat.
                      </p>
                    </div>
                  </div>
                </div>

                {/* What happens */}
                <div className="mt-4 rounded-xl bg-cream p-4">
                  <h3 className="text-sm font-semibold text-navy-700 mb-2">Yang akan terjadi:</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[10px] font-bold text-warm-500">1</span>
                      <span>Anda akan diarahkan ke halaman login {info.name}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[10px] font-bold text-warm-500">2</span>
                      <span>Login ke akun {info.name} seller Anda</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[10px] font-bold text-warm-500">3</span>
                      <span>Beri izin akses kepada BisnisSehat</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-text-secondary">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[10px] font-bold text-warm-500">4</span>
                      <span>Anda akan kembali ke BisnisSehat dengan status terhubung</span>
                    </div>
                  </div>
                </div>

                {/* Documentation Link */}
                <div className="mt-4 text-sm text-text-secondary">
                  Pelajari selengkapnya:{' '}
                  <a
                    href={info.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-electric-600 hover:underline"
                  >
                    {info.docsLabel}
                  </a>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-cream"
                  >
                    Nanti Saja
                  </button>
                  <button
                    onClick={handleConnect}
                    className="flex-1 rounded-xl bg-warm-400 px-4 py-3 text-sm font-bold text-white hover:bg-warm-500"
                  >
                    Lanjutkan ke {info.name}
                  </button>
                </div>
              </>
            )}

            {/* LOADING MODE — Saat OAuth redirect */}
            {mode === 'loading' && (
              <div className="mt-8 flex flex-col items-center py-8">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" />
                <p className="mt-4 text-sm text-text-secondary">
                  Mengarahkan ke {info.name}...
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Jika tidak otomatis, silakan coba lagi
                </p>
              </div>
            )}

            {/* NEEDS SETUP MODE — Marketplace belum dikonfigurasi */}
            {mode === 'needs_setup' && (
              <div className="mt-6">
                <div className="rounded-xl bg-warm-50 border border-warm-200 p-4">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 shrink-0 text-warm-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    </svg>
                    <div className="text-sm text-warm-600">
                      <p className="font-semibold">Memerlukan Setup Admin</p>
                      <p className="mt-1">{error || `Integrasi ${info.name} belum dikonfigurasi oleh admin. API credentials perlu diatur di server terlebih dahulu.`}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-cream p-4">
                  <h3 className="text-sm font-semibold text-navy-700 mb-2">Yang perlu dilakukan admin:</h3>
                  <div className="space-y-2 text-sm text-text-secondary">
                    <p>1. Daftar aplikasi di {info.docsLabel}</p>
                    <p>2. Dapatkan API credentials (App ID & Secret)</p>
                    <p>3. Atur environment variables di server BisnisSehat</p>
                    <p>4. Setelah dikonfigurasi, Anda dapat menghubungkan toko</p>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-cream"
                  >
                    Tutup
                  </button>
                  <a
                    href={info.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl bg-warm-400 px-4 py-3 text-center text-sm font-bold text-white hover:bg-warm-500"
                  >
                    Buka {info.docsLabel}
                  </a>
                </div>
              </div>
            )}

            {/* ERROR MODE */}
            {mode === 'error' && (
              <div className="mt-6">
                <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-red-600">Koneksi gagal</p>
                      <p className="mt-1 text-sm text-red-500">{error}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-cream"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={() => setMode('info')}
                    className="flex-1 rounded-xl bg-warm-400 px-4 py-3 text-sm font-bold text-white hover:bg-warm-500"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
