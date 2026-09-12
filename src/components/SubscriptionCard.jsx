import { Link } from 'react-router'

export default function SubscriptionCard() {
  return (
    <div className="mx-3 mb-3 rounded-2xl border border-warm-400/15 bg-white/60 p-4 backdrop-blur-md shadow-[0_0_20px_rgba(245,166,35,0.08)]">
      <p className="text-[10px] font-bold tracking-wider text-warm-500 uppercase">Langganan Aktif</p>
      <p className="mt-1 text-sm font-bold text-navy-700">BisnisSehat Pro</p>
      <p className="text-xs text-text-muted">Rp130.000 / bulan</p>
      <p className="mt-1 text-[11px] text-profit-600">Semua tools aktif</p>
      <Link
        to="/pricing"
        className="mt-2 inline-block text-xs font-medium text-warm-500 transition-colors hover:text-warm-600"
      >
        Kelola Langganan &rarr;
      </Link>
    </div>
  )
}
