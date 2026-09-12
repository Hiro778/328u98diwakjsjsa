import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { getPlanDisplay } from '../../data/categories'

const KPI_DATA = [
  { label: 'Revenue', accent: 'text-warm-400', border: 'border-warm-400/20', empty: 'Belum ada data' },
  { label: 'Profit', accent: 'text-profit-500', border: 'border-profit-500/20', empty: 'Belum ada data' },
  { label: 'Stok', accent: 'text-electric-500', border: 'border-electric-500/20', empty: 'Belum ada data' },
  { label: 'Pelanggan', accent: 'text-navy-500', border: 'border-navy-500/20', empty: 'Belum ada data' },
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
}

export default function DashboardHome() {
  const { profile, business, subscription } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0] || 'Kamu'
  const planLabel = getPlanDisplay(subscription?.plan).displayName

  return (
    <div>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-2xl font-extrabold text-navy-700">
          Selamat datang, {firstName}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {profile?.full_name || profile?.email} &middot; {planLabel}
        </p>
        {business && (
          <p className="mt-0.5 text-xs text-text-muted">{business.name}</p>
        )}
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {KPI_DATA.map((kpi) => (
          <motion.div
            key={kpi.label}
            variants={item}
            className={`rounded-xl border ${kpi.border} bg-surface p-5`}
          >
            <p className="text-xs font-medium text-text-muted uppercase">{kpi.label}</p>
            <p className={`mt-1 text-3xl font-extrabold ${kpi.accent}`}>--</p>
            <p className="mt-2 text-[11px] text-text-muted">{kpi.empty}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Command Center */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Business Performance */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface p-6 lg:col-span-2"
        >
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Business Performance</h3>
          <div className="mt-4 space-y-4">
            {['Revenue Trend', 'Profit Trend', 'Inventory Health'].map((label) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-cream/60 px-4 py-3">
                <span className="text-sm font-medium text-navy-600">{label}</span>
                <span className="text-xs text-text-muted">--</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-text-muted">
            Data akan tersedia setelah Anda mulai mencatat transaksi.
          </p>
        </motion.div>

        {/* Business Insights */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface p-6"
        >
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Business Insights</h3>
          <div className="mt-4 flex h-32 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-xs text-text-muted">Insight akan muncul ketika ada data yang cukup.</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
