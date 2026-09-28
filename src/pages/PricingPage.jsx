import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { TOTAL_TOOLS, PLANS, PLAN_CONFIG } from '../data/categories'
import {
  createSubscriptionSnap,
  openSnapPaymentModal,
  verifySubscriptionPayment,
  cancelSubscription,
} from '../lib/subscriptionService'
import { formatSyncResultMessage, getFriendlyErrorMessage } from '../lib/subscriptionUtils'

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

  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [verificationSuccess, setVerificationSuccess] = useState(false)
  const [pendingInstruction, setPendingInstruction] = useState(null)

  // Subscription cancellation modal states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState(null)

  const pollTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

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

  // On mount refresh subscription status read-only without blind verify_payment call (plan.md requirement)
  useEffect(() => {
    if (authLoading || !user) return
    refreshSubscription()
  }, [user, authLoading, refreshSubscription])

  // Precise verification polling: inspects fresh server subscription response & Midtrans status
  const startVerificationPolling = (initialExpiresAt, orderId = null) => {
    setVerifying(true)
    setError(null)
    setPendingInstruction(null)

    let attempts = 0
    const maxAttempts = 12

    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      attempts++
      try {
        const verifyRes = await verifySubscriptionPayment(orderId).catch(() => null)
        const updated = await refreshSubscription()

        const newExpires = updated?.expires_at ? new Date(updated.expires_at) : null
        const isActive =
          (updated?.status === 'active' &&
            updated?.plan === 'pro' &&
            newExpires &&
            newExpires > new Date()) ||
          verifyRes?.is_active === true

        const isRenewed = initialExpiresAt
          ? newExpires && newExpires.getTime() > new Date(initialExpiresAt).getTime()
          : isActive

        if (isActive && isRenewed) {
          clearInterval(pollTimerRef.current)
          setVerifying(false)
          setVerificationSuccess(true)
          setTimeout(() => {
            navigate('/dashboard')
          }, 1500)
          return
        }
      } catch (err) {
        console.warn('[PricingPage] Polling error:', err)
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollTimerRef.current)
        setVerifying(false)
      }
    }, 2500)
  }

  // Handle subscribe / renewal via Midtrans Snap
  async function handleSubscribeOrRenew() {
    if (!user) {
      navigate('/auth?returnTo=/pricing')
      return
    }

    setProcessing(true)
    setError(null)
    setVerificationSuccess(false)
    setPendingInstruction(null)
    setCancelSuccessMessage(null)

    const baselineExpiresAt = subscriptionExpiresAt

    try {
      // Get Snap Token from Edge Function (Rp 130.000 fixed on server)
      const snapData = await createSubscriptionSnap()
      const { snap_token, midtrans_order_id } = snapData

      // Open Midtrans Snap modal
      await openSnapPaymentModal(snap_token, {
        onSuccess: (res) => {
          console.log('[PricingPage] Snap onSuccess:', res)
          startVerificationPolling(baselineExpiresAt, midtrans_order_id)
        },
        onPending: (res) => {
          console.log('[PricingPage] Snap onPending:', res)
          setPendingInstruction(
            'Instruksi pembayaran telah diterbitkan. Silakan selesaikan pembayaran, lalu klik "Cek Status Langganan".'
          )
        },
        onError: (err) => {
          console.error('[PricingPage] Snap onError:', err)
          setError('Pembayaran gagal atau dibatalkan. Silakan coba kembali.')
        },
        onClose: () => {
          console.log('[PricingPage] Snap popup closed by user.')
          startVerificationPolling(baselineExpiresAt, midtrans_order_id)
        },
      })
    } catch (err) {
      console.error('[PricingPage] Subscribe error:', err)
      setError(err.message || 'Gagal memulai proses pembayaran')
    } finally {
      setProcessing(false)
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

  const formattedNextExpiry = subscriptionExpiresAt
    ? (() => {
        const next = new Date(subscriptionExpiresAt)
        const day = next.getUTCDate()
        next.setUTCMonth(next.getUTCMonth() + 1)
        if (next.getUTCDate() !== day) next.setUTCDate(0)
        return next.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Jakarta',
        })
      })()
    : null

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
          </div>

          {/* Feedback Banners */}
          <AnimatePresence>
            {verifying && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden rounded-xl border border-primary/30 bg-surface-elevated p-4 text-center shadow-xs"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p className="text-sm font-bold text-text-primary">Memverifikasi pembayaran...</p>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  Kami sedang mengonfirmasi pembayaran Anda. Akses Pro akan aktif otomatis setelah pembayaran berhasil dikonfirmasi.
                </p>
              </motion.div>
            )}

            {verificationSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 rounded-xl border border-profit-500/30 bg-profit-500/10 p-4 text-center shadow-sm"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-profit-500/20 text-profit-500">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="mt-2 text-sm font-extrabold text-profit-500">
                  Selamat! BisnisSehat Pro Telah Aktif 🎉
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Pembayaran terkonfirmasi. Mengalihkan ke Dashboard...
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="mt-3 inline-block w-full rounded-xl bg-profit-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-profit-600 cursor-pointer"
                >
                  Buka Dashboard Sekarang &rarr;
                </button>
              </motion.div>
            )}

            {cancelSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning shadow-xs flex items-start justify-between gap-2"
              >
                <div className="flex items-start gap-2">
                  <svg className="h-4 w-4 shrink-0 text-warning mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p>{cancelSuccessMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelSuccessMessage(null)}
                  className="text-warning/70 hover:text-warning font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {pendingInstruction && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden rounded-xl border border-primary/30 bg-primary-soft/30 p-4 text-xs text-text-primary shadow-xs"
              >
                <p className="font-bold text-primary">Informasi Pembayaran</p>
                <p className="mt-1 leading-relaxed text-text-secondary">{pendingInstruction}</p>
                <button
                  type="button"
                  onClick={() => setPendingInstruction(null)}
                  className="mt-2 font-semibold text-primary hover:underline cursor-pointer"
                >
                  Tutup pemberitahuan
                </button>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 flex items-start justify-between gap-2 overflow-hidden rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger shadow-xs"
              >
                <div>
                  <p className="font-bold">Terjadi Kesalahan</p>
                  <p className="mt-0.5">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-danger/70 hover:text-danger font-bold p-1 cursor-pointer"
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
                    Tanpa tagihan otomatis (non-recurring). Perpanjangan manual setiap bulan.
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

                {/* Dynamic Action Buttons */}
                <div className="mt-6 space-y-3">
                  {!user ? (
                    /* State 1: Belum login */
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => navigate('/auth?returnTo=/pricing')}
                        className="w-full rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Masuk untuk Mulai Menggunakan Pro &rarr;
                      </button>
                      <p className="text-center text-[11px] text-text-muted">
                        Kamu akan diarahkan kembali ke sini setelah login.
                      </p>
                    </div>
                  ) : hasActiveSubscription ? (
                    /* State 3: Login + Pro aktif */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-profit-500/25 bg-profit-500/10 p-3.5 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-profit-500 uppercase">Status Langganan</span>
                          <span className="text-xs font-extrabold text-profit-500 tabular-nums">Pro aktif sampai {formattedExpiry}</span>
                        </div>
                        {formattedNextExpiry && (
                          <p className="mt-1.5 text-[11px] text-text-secondary">
                            Perpanjangan manual akan memperpanjang masa aktif hingga{' '}
                            <span className="font-semibold text-text-primary tabular-nums">{formattedNextExpiry}</span>.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <motion.button
                          onClick={handleSubscribeOrRenew}
                          disabled={processing || verifying}
                          whileHover={!processing ? { scale: 1.01 } : {}}
                          whileTap={!processing ? { scale: 0.99 } : {}}
                          className="flex-1 rounded-xl bg-primary hover:bg-primary-hover px-4 py-3 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed text-center"
                        >
                          {processing ? 'Menyiapkan pembayaran...' : 'Perpanjang Pro'}
                        </motion.button>

                        <button
                          type="button"
                          onClick={() => setShowCancelModal(true)}
                          disabled={processing || verifying}
                          className="rounded-xl bg-surface-elevated hover:bg-danger/10 hover:text-danger hover:border-danger/30 text-text-secondary border border-border px-4 py-3 text-center text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Hentikan langganan
                        </button>

                        <Link
                          to="/dashboard"
                          className="rounded-xl border border-border bg-surface-elevated hover:bg-surface-hover px-4 py-3 text-center text-xs font-semibold text-text-primary transition-colors"
                        >
                          Dashboard
                        </Link>
                      </div>
                    </div>
                  ) : hasCancelledSubscription ? (
                    /* State 5: Login + Langganan Dihentikan */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-warning/25 bg-warning/10 p-3.5 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-warning uppercase">Status Langganan</span>
                          <span className="text-xs font-extrabold text-warning">Langganan Dihentikan</span>
                        </div>
                        {formattedExpiry && (
                          <p className="mt-1 text-[11px] text-text-secondary">
                            Akses Pro telah dihentikan. Riwayat pembayaran Anda tetap aman dan tercatat di sistem.
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          onClick={handleSubscribeOrRenew}
                          disabled={processing || verifying}
                          whileHover={!processing ? { scale: 1.01 } : {}}
                          whileTap={!processing ? { scale: 0.99 } : {}}
                          className="flex-1 rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {processing ? 'Menyiapkan pembayaran...' : 'Berlangganan Pro Kembali'}
                        </motion.button>

                        <Link
                          to="/dashboard"
                          className="rounded-xl border border-border bg-surface-elevated hover:bg-surface-hover px-5 py-3.5 text-center text-xs font-semibold text-text-primary transition-colors flex items-center justify-center"
                        >
                          Dashboard
                        </Link>
                      </div>
                    </div>
                  ) : hasExpiredSubscription ? (
                    /* State 4: Login + Pro expired */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-surface-elevated/60 p-3.5 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-text-muted uppercase">Status Langganan</span>
                          <span className="text-xs font-extrabold text-text-secondary">Sudah Berakhir</span>
                        </div>
                        {formattedExpiry && (
                          <p className="mt-1 text-[11px] text-text-muted">
                            Masa aktif berakhir pada <span className="tabular-nums">{formattedExpiry}</span>. Semua data kamu tetap aman.
                          </p>
                        )}
                      </div>

                      <motion.button
                        onClick={handleSubscribeOrRenew}
                        disabled={processing || verifying}
                        whileHover={!processing ? { scale: 1.01 } : {}}
                        whileTap={!processing ? { scale: 0.99 } : {}}
                        className="w-full rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {processing ? 'Menyiapkan pembayaran...' : 'Berlangganan Pro'}
                      </motion.button>
                    </div>
                  ) : (
                    /* State 2: Login + belum pernah Pro (Free) */
                    <div className="space-y-2">
                      <motion.button
                        onClick={handleSubscribeOrRenew}
                        disabled={processing || verifying}
                        whileHover={!processing ? { scale: 1.01 } : {}}
                        whileTap={!processing ? { scale: 0.99 } : {}}
                        className="w-full rounded-xl bg-primary hover:bg-primary-hover px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {processing ? 'Menyiapkan pembayaran...' : 'Berlangganan Pro Sekarang →'}
                      </motion.button>
                      <p className="text-center text-[11px] text-text-muted">
                        Pembayaran sekali bayar (QRIS, Transfer Bank, GoPay).
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual Check Status Link */}
                {user && (
                  <div className="mt-4 pt-3 border-t border-border/60 text-center">
                    <button
                      type="button"
                      onClick={async () => {
                        setVerifying(true)
                        setError(null)
                        try {
                          const verifyRes = await verifySubscriptionPayment()
                          const sub = await refreshSubscription()
                          setVerifying(false)
                          const isSubActive =
                            verifyRes?.is_active === true ||
                            (sub?.status === 'active' &&
                              sub?.plan === 'pro' &&
                              sub?.expires_at &&
                              new Date(sub.expires_at) > new Date())

                          if (isSubActive) {
                            setVerificationSuccess(true)
                            setTimeout(() => {
                              navigate('/dashboard')
                            }, 1200)
                          } else {
                            const feedback = formatSyncResultMessage(verifyRes, false)
                            setError(feedback.title ? `${feedback.title} ${feedback.text}` : feedback.text)
                          }
                        } catch {
                          setVerifying(false)
                          const errFeedback = getFriendlyErrorMessage()
                          setError(errFeedback.title ? `${errFeedback.title} ${errFeedback.text}` : errFeedback.text)
                        }
                      }}
                      disabled={verifying}
                      className="text-[11px] font-medium text-text-muted hover:text-primary transition-colors underline cursor-pointer disabled:cursor-not-allowed"
                    >
                      {verifying ? 'Memeriksa status langganan...' : 'Cek Status Langganan'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Cancellation Confirmation Modal (Context7 Framer Motion v13 & design.md) */}
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
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 id="cancel-dialog-title" className="text-base font-bold text-text-primary">
                    Hentikan Langganan Pro?
                  </h3>
                  <p className="text-xs text-text-muted">Konfirmasi pembatalan langganan</p>
                </div>
              </div>

              {/* Body */}
              <div className="mt-4 space-y-2">
                <p id="cancel-dialog-desc" className="text-xs text-text-secondary leading-relaxed">
                  Apakah kamu yakin ingin menghentikan langganan Pro? Langganan Pro akan dihentikan dan status akan berubah menjadi dihentikan.
                </p>
                <div className="rounded-xl border border-border bg-surface p-3 text-[11px] text-text-muted leading-relaxed">
                  <span className="font-semibold text-text-secondary">Pemberitahuan:</span> Karena BisnisSehat menggunakan sistem top-up bulanan manual (non-recurring), tindakan ini tidak membuat pembayaran Midtrans menjadi refund.
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="rounded-xl border border-border bg-surface hover:bg-surface-hover px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors cursor-pointer text-center"
                >
                  Batal, Tetap Berlangganan
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={cancelling}
                  className="rounded-xl bg-danger hover:bg-danger-hover px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                >
                  {cancelling ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Memproses...</span>
                    </>
                  ) : (
                    'Ya, Hentikan Pro'
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
