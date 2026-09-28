import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'

export default function SubscriptionCard() {
  const { hasActiveSubscription, hasExpiredSubscription, subscriptionExpiresAt } = useAuth()

  const formattedDate = subscriptionExpiresAt
    ? new Date(subscriptionExpiresAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  if (hasActiveSubscription) {
    return (
      <div className="mx-3 mb-3 rounded-2xl border border-success/30 bg-success/5 p-4 transition-all">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-bold text-success uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Pro Aktif
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-text-primary">BisnisSehat Pro</p>
        {formattedDate && (
          <p className="text-[11px] text-text-secondary mt-0.5">Aktif s/d {formattedDate}</p>
        )}
        <p className="mt-1 text-[11px] text-success font-medium">Semua tools bisnis aktif</p>
        <Link
          to="/pricing"
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-surface border border-border px-3 py-1.5 text-xs font-semibold text-text-primary shadow-xs hover:bg-surface-hover transition-colors"
        >
          Kelola Paket &rarr;
        </Link>
      </div>
    )
  }

  if (hasExpiredSubscription) {
    return (
      <div className="mx-3 mb-3 rounded-2xl border border-warning/40 bg-warning/5 p-4 transition-all">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-bold text-warning uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            Pro Berakhir
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-text-primary">BisnisSehat Pro</p>
        {formattedDate && (
          <p className="text-[11px] text-text-muted mt-0.5">Berakhir {formattedDate}</p>
        )}
        <p className="mt-1 text-[11px] text-warning font-medium">Fitur bisnis terkunci</p>
        <Link
          to="/pricing"
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-warning px-3 py-1.5 text-xs font-bold text-navy-900 shadow-xs hover:brightness-105 transition-all"
        >
          Perpanjang Pro &rarr;
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-3 mb-3 rounded-2xl border border-border bg-gradient-to-b from-surface-hover/80 to-surface p-4 transition-all">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-secondary/15 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-secondary uppercase">
          FREE PLAN
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-text-primary">BisnisSehat Pro</p>
      <p className="text-xs text-text-muted mt-0.5">Rp130.000 / bulan</p>
      <p className="mt-1 text-[11px] text-text-secondary leading-snug">Buka seluruh kapabilitas Pro, POS kasir, dan fitur AI</p>
      <Link
        to="/pricing"
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors"
      >
        Upgrade ke Pro &rarr;
      </Link>
    </div>
  )
}
