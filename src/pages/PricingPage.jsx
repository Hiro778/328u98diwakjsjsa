import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { PLANS, PLAN_CONFIG } from '../data/categories'
import { cancelSubscription } from '../lib/subscriptionService'
import { redeemActivationCode } from '../lib/activationCodeService'

const BASIC_FEATURES = [
  'Tools Bisnis Basic: HPP, BEP, Tax Planning, Loan Simulation, Cash Flow Forecast, dan Kurs',
  'Akses AI Creative Studio (tanpa kuota kredit bulanan; top-up kredit tersedia terpisah)',
  'Perhitungan realtime instan langsung di browser',
  'Tanpa komitmen jangka panjang, bayar bulanan Rp35.000',
]

const PRO_FEATURES = [
  'Semua fitur & tools paket Basic',
  'AI Creative Studio dengan 15.000 Kredit AI per bulan',
  'Point of Sales (POS) Kasir & QR Menu Toko/Resto',
  'Database Bisnis, Inventori & Stok Multi-Lokasi',
  'CRM Pelanggan & Integrasi WhatsApp Gateway',
  'Laporan Keuangan Komprehensif (Laba Rugi, Neraca, Arus Kas) & Margin Analysis',
  'Tools Marketing Pro (Ads, SEO Optimizer, Content Calendar, A/B Testing, Riset Kompetitor)',
  'Legalitas Checker & Analitik Bisnis Realtime',
  'Dukungan prioritas tim BisnisSehat',
]

export default function PricingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activateParam = searchParams.get('activate') || ''
  const selectedPlanParam = (searchParams.get('plan') || '').toLowerCase()

  const {
    user,
    business,
    subscription,
    isBasic,
    isPro,
    plan: userPlan,
    hasActiveSubscription,
    hasExpiredSubscription,
    hasCancelledSubscription,
    subscriptionExpiresAt,
    refreshSubscription,
    loading: authLoading,
  } = useAuth()

  // Selected plan tab/focus: 'basic' or 'pro'
  const [activeCard, setActiveCard] = useState(selectedPlanParam === 'basic' ? 'basic' : 'pro')

  // Activation code state
  const [activationCode, setActivationCode] = useState(activateParam)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemSuccessMessage, setRedeemSuccessMessage] = useState(null)
  const [error, setError] = useState(null)

  // Subscription cancellation modal states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState(null)

  // Sync plan param if changed
  useEffect(() => {
    if (selectedPlanParam === 'basic' || selectedPlanParam === 'pro') {
      setActiveCard(selectedPlanParam)
    }
  }, [selectedPlanParam])

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

  // Handle explicit manual redemption of PRO voucher
  async function handleRedeem(e) {
    if (e) e.preventDefault()

    if (!user) {
      const returnUrl = `/pricing?plan=pro${activationCode ? `&activate=${encodeURIComponent(activationCode.trim())}` : ''}`
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
      setCancelSuccessMessage('Langganan telah berhasil dihentikan. Riwayat transaksi tersimpan dengan aman.')
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

  const loginReturnUrl = `/pricing?plan=${activeCard}${activationCode ? `&activate=${encodeURIComponent(activationCode.trim())}` : ''}`

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary px-3 py-6 sm:px-6 sm:py-8 min-w-0 w-full">
      {/* Top Navigation Bar */}
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between pb-6 gap-2">
        <Link
          to={user ? '/dashboard' : '/'}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary shrink-0"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          {user ? 'Kembali' : 'Beranda'}
        </Link>

        {user && (
          <div className="flex items-center gap-2">
            {isPro ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                PRO AKTIF
              </span>
            ) : isBasic ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-bold text-emerald-500">
                BASIC AKTIF
              </span>
            ) : null}
            <span className="text-xs text-text-muted truncate max-w-[140px] sm:max-w-[180px]">
              {user.email}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="my-auto flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-4xl"
        >
          {/* Brand Header */}
          <div className="mb-8 text-center">
            <Link to="/" className="inline-flex items-center justify-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 shadow-sm text-primary">
                <span className="text-base font-extrabold text-primary">BS</span>
              </div>
              <span className="text-xl font-black text-text-primary tracking-tight">BisnisSehat</span>
            </Link>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              Pilihan Paket Langganan UMKM
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-text-muted max-w-md mx-auto">
              Tingkatkan produktivitas bisnis Anda dengan kalkulator standalone atau ekosistem operasional lengkap & AI.
            </p>
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
                    <p className="font-bold">Terjadi Kendala</p>
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

          {/* Active Subscription Status Banner */}
          {hasActiveSubscription && (
            <div className="mb-6 rounded-2xl border border-profit-500/25 bg-profit-500/10 p-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-profit-500 uppercase tracking-wider">Status Langganan Anda</span>
                  <h3 className="text-base font-extrabold text-text-primary">
                    Paket {isPro ? 'BisnisSehat PRO' : 'BisnisSehat BASIC'} Aktif
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Masa aktif berlaku sampai: <span className="font-bold text-profit-600 tabular-nums">{formattedExpiry}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/dashboard"
                    className="rounded-xl bg-profit-500 hover:bg-profit-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
                  >
                    Buka Dashboard &rarr;
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="text-text-muted hover:text-danger text-xs font-medium px-2 py-1 transition-colors cursor-pointer"
                  >
                    Hentikan langganan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancelled Subscription Banner */}
          {hasCancelledSubscription && (
            <div className="mb-6 rounded-2xl border border-warning/25 bg-warning/10 p-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-warning uppercase tracking-wider">Langganan Dihentikan</span>
                  <h3 className="text-base font-extrabold text-text-primary">
                    Langganan Pro Anda telah dihentikan
                  </h3>
                  {formattedExpiry && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      Masa aktif Anda saat ini tetap berlaku hingga: <span className="font-bold text-warning tabular-nums">{formattedExpiry}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/dashboard"
                    className="rounded-xl bg-surface-elevated border border-border px-4 py-2 text-xs font-bold text-text-primary shadow-sm hover:bg-surface transition-all"
                  >
                    Buka Dashboard &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Dual-Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* 1. BASIC CARD */}
            <div
              className={`relative rounded-2xl border transition-all flex flex-col justify-between p-6 ${
                activeCard === 'basic'
                  ? 'border-emerald-500 bg-surface shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500'
                  : 'border-border bg-surface shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-500 uppercase tracking-wider">
                    {PLAN_CONFIG[PLANS.BASIC].displayName}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-bold text-emerald-500">
                    Standalone Tools
                  </span>
                </div>

                <h2 className="mt-3 text-xl font-extrabold text-text-primary">
                  Kalkulator & Tools Mandiri
                </h2>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Akses instan ke seluruh kalkulator keuangan & operasional mandiri berbasis input tanpa koneksi database.
                </p>

                {/* Price Display */}
                <div className="mt-4 border-y border-border py-3.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-text-primary tabular-nums">
                      {PLAN_CONFIG[PLANS.BASIC].priceDetail.split(' / ')[0]}
                    </span>
                    <span className="text-xs font-medium text-text-muted">/ bulan</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Pembayaran diverifikasi manual oleh admin.
                  </p>
                </div>

                {/* Features */}
                <ul className="mt-4 space-y-2.5">
                  {BASIC_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-xs text-text-primary">
                      <svg
                        className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5"
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
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-border">
                {isPro ? (
                  <div className="w-full rounded-xl bg-surface-elevated border border-border py-3 text-center text-xs font-semibold text-text-muted">
                    Sudah Termasuk dalam Pro Anda
                  </div>
                ) : isBasic ? (
                  <div className="w-full rounded-xl bg-emerald-500/10 border border-emerald-500/25 py-3 text-center text-xs font-bold text-emerald-500">
                    Paket Basic Aktif
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError('Pembayaran Paket Basic diverifikasi manual oleh admin. Silakan hubungi admin atau customer support untuk aktivasi.')
                    }}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Pilih Basic &bull; Rp 35.000 / bln
                  </button>
                )}
              </div>
            </div>

            {/* 2. PRO CARD */}
            <div
              className={`relative rounded-2xl border transition-all flex flex-col justify-between p-6 ${
                activeCard === 'pro'
                  ? 'border-primary bg-surface shadow-xl shadow-primary/10 ring-1 ring-primary'
                  : 'border-border bg-surface shadow-md'
              }`}
            >
              {/* Highlight ribbon */}
              <div className="absolute -top-3 right-5">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                  ★ Paling Lengkap
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-primary uppercase tracking-wider">
                    {PLAN_CONFIG[PLANS.PRO].displayName}
                  </span>
                  {isPro && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-profit-500/15 border border-profit-500/25 px-2.5 py-0.5 text-[11px] font-bold text-profit-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-profit-500 animate-pulse" />
                      Aktif
                    </span>
                  )}
                </div>

                <h2 className="mt-3 text-xl font-extrabold text-text-primary">
                  Ekosistem Operasional & AI
                </h2>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                  Solusi terintegrasi lengkap: database bisnis, POS kasir, CRM, laporan keuangan, dan AI Creative Studio.
                </p>

                {/* Price Display */}
                <div className="mt-4 border-y border-border py-3.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-text-primary tabular-nums">
                      {PLAN_CONFIG[PLANS.PRO].priceDetail.split(' / ')[0]}
                    </span>
                    <span className="text-xs font-medium text-text-muted">/ bulan</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Pembayaran diverifikasi manual oleh admin. Kode aktivasi resmi diberikan setelah pembayaran diverifikasi.
                  </p>
                </div>

                {/* Features */}
                <ul className="mt-4 space-y-2.5">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-xs text-text-primary">
                      <svg
                        className="h-4 w-4 shrink-0 text-primary mt-0.5"
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
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-border space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('pro-activation-input')?.focus()
                    document.getElementById('pro-activation-section')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="w-full rounded-xl bg-primary hover:bg-primary-hover py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Masukkan Kode Aktivasi
                </button>
              </div>
            </div>
          </div>

          {/* PRO Activation Voucher Section */}
          <div id="pro-activation-section" className="mt-8 rounded-2xl border border-border bg-surface p-5 sm:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                  Punya Kode Aktivasi / Voucher PRO?
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Masukkan voucher resmi dari tim BisnisSehat untuk aktivasi akun Pro secara instan.
                </p>
              </div>
              <span className="text-[11px] font-mono text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg shrink-0">
                Format: BS-PRO-XXXX
              </span>
            </div>

            <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="pro-activation-input"
                type="text"
                placeholder="Contoh: BS-PRO-9F8A-7B2C-..."
                value={activationCode}
                onChange={(e) => {
                  setActivationCode(e.target.value.toUpperCase())
                  if (error) setError(null)
                }}
                disabled={redeeming}
                className="flex-1 px-3.5 py-3 rounded-xl bg-surface-elevated border border-border text-text-primary font-mono text-xs tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-text-muted focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
              />

              {!user ? (
                <button
                  type="button"
                  onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(loginReturnUrl)}`)}
                  className="rounded-xl bg-primary hover:bg-primary-hover px-5 py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] cursor-pointer text-center whitespace-nowrap"
                >
                  Masuk untuk Aktivasi &rarr;
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={redeeming || !activationCode.trim()}
                  className="rounded-xl bg-primary hover:bg-primary-hover px-6 py-3 text-xs font-bold text-white shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {redeeming ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Memvalidasi...</span>
                    </>
                  ) : hasCancelledSubscription ? (
                    'Berlangganan Pro Kembali'
                  ) : hasActiveSubscription ? (
                    'Perpanjang Pro'
                  ) : (
                    'Aktivasi PRO Sekarang'
                  )}
                </button>
              )}
            </form>
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
              className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-4 sm:p-6 shadow-2xl text-left max-h-[calc(100dvh-24px)] overflow-y-auto"
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
                    Hentikan Langganan?
                  </h3>
                  <p id="cancel-dialog-desc" className="text-xs text-text-muted mt-0.5">
                    Konfirmasi pembatalan perpanjangan otomatis
                  </p>
                </div>
              </div>

              {/* Explanatory Body */}
              <div className="my-4 rounded-xl border border-border bg-surface p-3.5 text-xs text-text-secondary space-y-2 leading-relaxed">
                <p>
                  Dengan menghentikan langganan, Anda tidak akan lagi diperpanjang secara otomatis setelah masa aktif berakhir.
                </p>
                {formattedExpiry && (
                  <p className="font-semibold text-text-primary">
                    Masa aktif Anda saat ini tetap berlaku hingga <span className="text-profit-500 tabular-nums">{formattedExpiry}</span>.
                  </p>
                )}
                <p className="text-[11px] text-text-muted">
                  Riwayat transaksi dan data bisnis Anda tetap tersimpan dengan aman di sistem.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="w-full sm:w-auto text-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-hover px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors cursor-pointer disabled:opacity-50"
                >
                  Batal, Tetap Berlangganan
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={cancelling}
                  className="w-full sm:w-auto text-center justify-center rounded-xl bg-danger hover:bg-danger/90 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {cancelling ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
