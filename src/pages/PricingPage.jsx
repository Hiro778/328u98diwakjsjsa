import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { TOTAL_TOOLS, PLANS, PLAN_CONFIG } from '../data/categories'

const FEATURES = [
  `${TOTAL_TOOLS}+ tools bisnis`,
  'Financial intelligence',
  'Inventory & operasional',
  'CRM & sales',
  'Export tools',
  'AI business insights',
  'Weekly business recap',
]

export default function PricingPage() {
  const navigate = useNavigate()
  const { user, subscription, hasActiveSubscription, refreshSubscription } = useAuth()
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState(null)

  const isActive = hasActiveSubscription

  async function handleSubscribe() {
    setSubscribing(true)
    setError(null)

    if (subscription) {
      const { error: updErr } = await supabase
        .from('subscriptions')
        .update({ plan: 'pro', status: 'pending', payment_provider: 'manual' })
        .eq('id', subscription.id)
      if (updErr) { setError(updErr.message); setSubscribing(false); return }
    } else {
      const { error: insErr } = await supabase
        .from('subscriptions')
        .insert({
          profile_id: user.id,
          plan: 'pro',
          status: 'pending',
          payment_provider: 'manual',
        })
      if (insErr) { setError(insErr.message); setSubscribing(false); return }
    }

    await refreshSubscription()
    setSubscribing(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-600">
            <span className="text-lg font-extrabold text-white">BS</span>
          </div>
        </div>

        {/* Pricing card */}
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <p className="text-sm font-semibold text-warm-400 uppercase tracking-wide">Langganan</p>
          <h1 className="mt-2 text-2xl font-extrabold text-navy-700">{PLAN_CONFIG[PLANS.PRO].displayName}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Semua tools bisnis lo dalam satu tempat.
          </p>

          {/* Price */}
          <div className="mt-6 border-b border-border pb-6">
            <p className="text-3xl font-extrabold text-navy-700">
              {PLAN_CONFIG[PLANS.PRO].priceDetail.split(' / ')[0]}
              <span className="text-base font-medium text-text-muted"> / bulan</span>
            </p>
          </div>

          {/* Features */}
          <ul className="mt-6 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-text-primary">
                <svg className="h-4 w-4 shrink-0 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-8">
            {isActive ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-profit-50 border border-profit-200 px-5 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm font-semibold text-profit-600">Sudah Berlangganan</p>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">{PLAN_CONFIG[PLANS.PRO].displayName} aktif</p>
                </div>
                <div className="rounded-xl bg-surface border border-border px-5 py-3 text-center">
                  <p className="text-[10px] font-bold tracking-wider text-text-muted uppercase">Status</p>
                  <p className="mt-0.5 text-sm font-bold text-profit-600">AKTIF</p>
                </div>
                <Link
                  to="/dashboard"
                  className="block w-full rounded-xl border border-warm-200 bg-white px-7 py-3.5 text-center text-[15px] font-bold text-warm-500 transition-all hover:bg-warm-50"
                >
                  Kelola Langganan
                </Link>
              </div>
            ) : (
              <motion.button
                onClick={handleSubscribe}
                disabled={subscribing}
                whileHover={!subscribing ? { scale: 1.02 } : {}}
                whileTap={!subscribing ? { scale: 0.98 } : {}}
                className="w-full rounded-xl bg-warm-400 px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30 disabled:opacity-60"
              >
                {subscribing ? 'Memproses...' : 'Mulai Berlangganan →'}
              </motion.button>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-text-muted">
            Integrasi pembayaran segera hadir.
          </p>

          {error && (
            <p className="mt-3 text-center text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Dev simulation */}
        {import.meta.env.DEV && !isActive && subscription?.status === 'pending' && (
          <DevSimulateButton subscription={subscription} refreshSubscription={refreshSubscription} />
        )}
      </motion.div>
    </div>
  )
}

function DevSimulateButton({ subscription, refreshSubscription }) {
  const navigate = useNavigate()
  const [simulating, setSimulating] = useState(false)

  async function handleSimulatePayment() {
    if (!subscription) return
    setSimulating(true)

    const now = new Date()
    const expires = new Date(now)
    expires.setMonth(expires.getMonth() + 1)

    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
      })
      .eq('id', subscription.id)

    await refreshSubscription()
    navigate('/dashboard', { replace: true })
  }

  return (
    <motion.button
      onClick={handleSimulatePayment}
      disabled={simulating}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="mt-4 w-full rounded-xl border border-dashed border-text-muted/30 px-5 py-3 text-xs text-text-muted transition-colors hover:border-text-muted/50 hover:bg-white/50"
    >
      {simulating ? 'Simulating...' : '[Dev] Simulasi Pembayaran'}
    </motion.button>
  )
}
