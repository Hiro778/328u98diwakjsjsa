import { motion } from 'framer-motion'
import { calculateSupplierSummary } from '../../lib/supplierUtils'
import { formatRelativeTime } from '../CustomerCRM/customerUtils'

const card = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function SupplierDashboard({ suppliers, onViewSupplier }) {
  const summary = calculateSupplierSummary(suppliers)

  if (suppliers.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <svg className="mx-auto h-12 w-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <p className="mt-3 text-sm font-semibold text-navy-700">Belum ada supplier</p>
        <p className="mt-1 text-xs text-text-muted">Tambahkan supplier untuk melacak asal produk Anda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Supplier', value: summary.total, color: 'text-navy-700' },
          { label: 'Supplier Aktif', value: summary.active, color: 'text-profit-600' },
          { label: 'Tidak Aktif', value: summary.inactive, color: 'text-warm-500' },
          {
            label: 'Produk Terbanyak',
            value: summary.topSupplier ? summary.topSupplierProductCount : 0,
            sub: summary.topSupplier?.name || '-',
            color: 'text-warm-500',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i}
            variants={card}
            initial="hidden"
            animate="visible"
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <p className="text-xs font-bold text-text-muted uppercase">{stat.label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
            {stat.sub && (
              <p className="mt-0.5 truncate text-xs text-text-muted">{stat.sub}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Last Used & Recent Activity */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Last Used */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Supplier Terakhir Digunakan</p>
          {summary.lastUsed ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-lg">
                🏪
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy-700">{summary.lastUsed.name}</p>
                <p className="text-[11px] text-text-muted">
                  {summary.lastUsed.updated_at ? formatRelativeTime(summary.lastUsed.updated_at) : '-'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-text-muted">-</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Aktivitas Terbaru (7 hari)</p>
          {summary.recentActivity.length === 0 ? (
            <p className="mt-2 text-xs text-text-muted">Tidak ada aktivitas terbaru.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {summary.recentActivity.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onViewSupplier(s)}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-cream"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cream text-xs">
                    🏪
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-navy-700">{s.name}</p>
                    <p className="text-[10px] text-text-muted">
                      {s.updated_at ? formatRelativeTime(s.updated_at) : '-'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    s.is_active !== false
                      ? 'bg-profit-50 text-profit-600'
                      : 'bg-red-50 text-red-500'
                  }`}>
                    {s.is_active !== false ? 'Aktif' : 'Nonaktif'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
