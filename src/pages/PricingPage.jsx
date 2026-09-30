import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { TOTAL_TOOLS, PLANS, PLAN_CONFIG } from '../data/categories'
import { cancelSubscription } from '../lib/subscriptionService'
import { redeemActivationCode } from '../lib/activationCodeService'

const FEATURES = [
  `${TOTAL_TOOLS}+ tools bisnis & operasional lengkap`,
  'Financial intelligence & analisis margin lanjutan',
  'Manajemen inventori & stok multi-lokasi',
  'CRM pelanggan & integrasi WhatsApp gateway',
  'Ekspor tools & riset pasar global',
  'AI business insights & analisis kompetitor',
  'Dukungan prioritas tim BisnisSehat',
]

export default function PricingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activateParam = searchParams.get('activate') || ''

  const {
    user,
    business,
    subscription,
    hasActiveSubscription,
    hasExpiredSubscription,
    hasCancelledSubscription,
    subscriptionExpiresAt,
    refreshSubscription,
    loading: authLoading,
  } = useAuth()

  // Activation code state
  const [activationCode, setActivationCode] = useState(activateParam)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemSuccessMessage, setRedeemSuccessMessage] = useState(null)
  const [error, setError] = useState(null)

  // Subscription cancellation modal states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState(null)

  // RULE @act.md: PREFILL ONLY. Do NOT auto-redeem on mount!
  useEffect(() => {
    if (activateParam) {
      setActivationCode(activateParam)
    }
  }, [activateParam])

  // Listen for Escape key to close cancellation modal
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && showCancelModal && !cancelling) {
        setShowCancelModal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCancelModal, cancelling])

  // On mount refresh subscription status read-only
  useEffect(() => {
    if (authLoading || !user) return
    refreshSubscription()
  }, [user, authLoading, refreshSubscription])

  // Handle explicit manual redemption
  async function handleRedeem(e) {
    if (e) e.preventDefault()

    if (!user) {
      const returnUrl = `/pricing${activationCode ? `?activate=${encodeURIComponent(activationCode.trim())}` : ''}`
      navigate(`/auth?returnTo=${encodeURIComponent(returnUrl)}`)
      return
    }

    if (!activationCode || !activationCode.trim()) {
      setError('Silakan masukkan kode aktivasi PRO Anda.')
      return
    }

    setRedeeming(true)
    setError(null)
    setRedeemSuccessMessage(null)
    setCancelSuccessMessage(null)

    try {
      const result = await redeemActivationCode(activationCode)
      await refreshSubscription()
      setRedeemSuccessMessage(
        result?.message || 'Selamat! Akun BisnisSehat PRO Anda telah aktif.'
      )
      setActivationCode('')
    } catch (err) {
      console.error('[PricingPage] Redeem error:', err)
      setError(err.message || 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.')
    } finally {
      setRedeeming(false)
    }
  }

  // Handle cancellation confirmation
  async function handleConfirmCancel() {
    if (!subscription?.id) return
    setCancelling(true)
    setError(null)
    try {
      await cancelSubscription(subscription.id, business?.id)
      await refreshSubscription()
      setShowCancelModal(false)
      setCancelSuccessMessage('Langganan Pro telah berhasil dihentikan. Riwayat transaksi tersimpan dengan aman.')
    } catch (err) {
      console.error('[PricingPage] Cancel subscription error:', err)
      setError(err.message || 'Gagal menghentikan langganan')
    } finally {
      setCancelling(false)
    }
  }

  const formattedExpiry = subscriptionExpiresAt
    ? new Date(subscriptionExpiresAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      })
    : null

  const loginReturnUrl = `/pricing${activationCode ? `?activate=${encodeURIComponent(activationCode.trim())}` : ''}`

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary px-4 py-8 sm:px-6">
      {/* Top Navigation Bar */}
      <div className="mx-auto flex w-full max-w-lg items-center justify-between pb-6">
        <Link
          to={user ? '/dashboard' : '/'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          {user ? 'Kembali ke Dashboard' : 'Kembali ke Beranda'}
        </Link>

        {user && (
          <span className="text-xs text-text-muted truncate max-w-[180px]">
            {user.email}
          </span>
        )}
      </div>

      {/* Main Container */}
      <div className="my-auto flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          {/* Brand Header */}
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex items-center justify-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 shadow-sm text-primary">
                <span className="text-base font-extrabold text-primary">BS</span>
              </div>
              <span className="text-xl font-black text-text-primary tracking-tight">BisnisSehat</span>
            </Link>
            <p className="mt-2 text-xs text-text-muted">Aktivasi Akses Bisnis & Keuangan Tanpa Batas</p>
          </div>

          {/* Feedback Banners */}
          <AnimatePresence>
            {cancelSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning flex items-start justify-between gap-2 overflow-hidden"
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm">ℹ️</span>
                  <span>{cancelSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelSuccessMessage(null)}
                  className="text-warning/70 hover:text-warning font-bold p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {redeemSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 rounded-xl border border-profit-500/30 bg-profit-500/15 p-4 text-xs text-profit-500 flex items-start justify-between gap-2 overflow-hidden shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-base">🎉</span>
                  <div>
                    <p className="font-bold text-sm">Aktivasi Berhasil!</p>
                    <p className="mt-0.5 text-text-primary">{redeemSuccessMessage}</p>
                    {formattedExpiry && (
                      <p className="mt-1 font-semibold text-profit-600">
                        Aktif sampai: {formattedExpiry}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRedeemSuccessMessage(null)}
                  className="text-profit-500/70 hover:text-profit-500 font-bold p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger flex items-start justify-between gap-2 overflow-hidden"
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <div>
                    <p className="font-bold">Aktivasi Belum Berhasil</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-danger/70 hover:text-danger font-bold p-0.5 cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pricing Card */}
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-xl shadow-black/20">
            {authLoading ? (
              <div className="space-y-4 py-6 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                <p className="text-xs font-medium text-text-muted">Memeriksa status akun...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-primary uppercase tracking-wider">
                    {PLAN_CONFIG[PLANS.PRO].displayName}
                  </span>
                  {hasActiveSubscription ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-profit-500/15 border border-profit-500/25 px-3 py-0.5 text-xs font-bold text-profit-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-profit-500 animate-pulse" />
                      Pro Aktif
                    </span>
                  ) : hasCancelledSubscription ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 border border-warning/25 px-3 py-0.5 text-xs font-bold text-warning">
                      Langganan Dihentikan
                    </span>
                  ) : hasExpiredSubscription ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated border border-border px-3 py-0.5 text-xs font-bold text-text-muted">
                      Pro Sudah Berakhir
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated border border-border px-3 py-0.5 text-xs font-semibold text-text-secondary">
                      Paket Fleksibel
                    </span>
                  )}
                </div>

                <h1 className="mt-3 text-2xl font-extrabold text-text-primary">
                  {hasCancelledSubscription
                    ? 'Langganan Pro Anda telah dihentikan'
                    : hasExpiredSubscription
                    ? 'BisnisSehat Pro Anda telah berakhir'
                    : hasActiveSubscription
                    ? 'BisnisSehat Pro'
                    : 'Mulai BisnisSehat Pro'}
                </h1>

                <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                  Akses tak terbatas ke seluruh modul operasional, keuangan, AI, dan ekspor UMKM.
                </p>

                {/* Price Display */}
                <div className="mt-5 border-y border-border py-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-text-primary tabular-nums">Rp 130.000</span>
                    <span className="text-xs font-medium text-text-muted">/ bulan kalender</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Aktivasi mudah menggunakan Voucher / QR Aktivasi resmi dari BisnisSehat.
                  </p>
                </div>

                {/* Features List */}
                <ul className="mt-5 space-y-2.5">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-xs text-text-primary">
                      <svg
                        className="h-4 w-4 shrink-0 text-profit-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Active Subscription Status Banner */}
                {hasActiveSubscription && (
                  <div className="mt-6 rounded-xl border border-profit-500/25 bg-profit-500/10 p-3.5 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-profit-500 uppercase">Status Langganan</span>
                      <span className="text-xs font-extrabold text-profit-500 tabular-nums">
                        Pro aktif sampai {formattedExpiry}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Masukkan kode aktivasi baru di bawah untuk menambah masa aktif langganan Anda secara otomatis.
                    </p>
                  </div>
                )}

                {/* Activation Form Section */}
                <div className="mt-6 pt-5 border-t border-border">
                  <div className="mb-3">
                    <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                      Punya Kode Aktivasi PRO?
                    </label>
                    <p className="text-[11px] text-text-muted">
                      Masukkan kode aktivasi yang Anda terima atau dari scan QR.
                    </p>
                  </div>

                  <form onSubmit={handleRedeem} className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Contoh: BS-PRO-9F8A-7B2C-..."
                        value={activationCode}
                        onChange={(e) => {
                          setActivationCode(e.target.value.toUpperCase())
                          if (error) setError(null)
                        }}
                        disabled={redeeming}
                        className="w-full px-3.5 py-3 rounded-xl bg-surface-elevated border border-border text-text-primary font-mono text-xs tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-text-muted focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                      />
                      {activationCode && (
                        <button
                          type="button"
                          onClick={() => setActivationCode('')}
                          className="absolute right-3 top-3 text-text-muted hover:text-text-primary text-xs cursor-pointer p-0.5"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {!user ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(loginReturnUrl)}`)}
                        className="w-full rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] cursor-pointer text-center"
                      >
                        Masuk untuk Aktivasi PRO &rarr;
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={redeeming || !activationCode.trim()}
                        className="w-full rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                      >
                        {redeeming ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Memvalidasi Kode...</span>
                          </>
                        ) : hasActiveSubscription ? (
                          'Perpanjang Masa Aktif PRO'
                        ) : (
                          'Aktivasi PRO Sekarang'
                        )}
                      </button>
                    )}
                  </form>

                  {/* Secondary Actions for Active Subscribers */}
                  {user && hasActiveSubscription && (
                    <div className="mt-4 pt-3 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setShowCancelModal(true)}
                        className="text-text-muted hover:text-danger text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        Hentikan langganan
                      </button>
                      <Link
                        to="/dashboard"
                        className="text-primary hover:underline text-[11px] font-semibold"
                      >
                        Buka Dashboard &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Cancellation Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl text-left"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancel-dialog-title"
              aria-describedby="cancel-dialog-desc"
            >
              {/* Header Icon */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 id="cancel-dialog-title" className="text-base font-bold text-text-primary">
                    Hentikan Langganan Pro?
                  </h3>
                  <p id="cancel-dialog-desc" className="text-xs text-text-muted mt-0.5">
                    Konfirmasi pembatalan akses BisnisSehat Pro
                  </p>
                </div>
              </div>

              {/* Explanatory Body */}
              <div className="my-4 rounded-xl border border-border bg-surface p-3.5 text-xs text-text-secondary space-y-2 leading-relaxed">
                <p>
                  Dengan menghentikan langganan, Anda tidak akan lagi memiliki akses ke fitur Pro setelah masa aktif berakhir.
                </p>
                {formattedExpiry && (
                  <p className="font-semibold text-text-primary">
                    Masa aktif Anda saat ini tetap berlaku hingga <span className="text-profit-500 tabular-nums">{formattedExpiry}</span>.
                  </p>
                )}
                <p className="text-[11px] text-text-muted">
                  Riwayat transaksi dan data bisnis Anda tersimpan dengan aman di sistem.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="rounded-xl border border-border bg-surface hover:bg-surface-hover px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors cursor-pointer disabled:opacity-50"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={cancelling}
                  className="rounded-xl bg-danger hover:bg-danger/90 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {cancelling ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    'Ya, Hentikan Langganan'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
