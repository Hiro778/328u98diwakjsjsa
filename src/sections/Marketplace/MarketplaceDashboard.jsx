import { motion } from 'framer-motion'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

export default function MarketplaceDashboard({ stats = {}, logs = [] }) {
  const summaryCards = [
    {
      label: 'Marketplace Terhubung',
      value: stats.connected_count || 0,
      total: stats.total_marketplaces || 3,
      color: 'text-profit-500',
      bg: 'bg-profit-50',
    },
    {
      label: 'Produk Tersinkron',
      value: stats.synced_products || 0,
      detail: `${stats.error_products || 0} error`,
      color: 'text-electric-500',
      bg: 'bg-electric-50',
    },
    {
      label: 'Pesanan Marketplace',
      value: stats.total_orders || 0,
      detail: `${stats.pending_orders || 0} pending`,
      color: 'text-warm-500',
      bg: 'bg-warm-50',
    },
    {
      label: 'Error (24 jam)',
      value: stats.recent_errors || 0,
      color: stats.recent_errors > 0 ? 'text-red-500' : 'text-profit-500',
      bg: stats.recent_errors > 0 ? 'bg-red-50' : 'bg-profit-50',
    },
  ]

  return (
    <div>
      {/* Summary Cards */}
      <motion.div
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {summaryCards.map((card) => (
          <motion.div
            key={card.label}
            variants={item}
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <p className="text-xs font-semibold text-text-muted">{card.label}</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-2xl font-extrabold ${card.color}`}>{card.value}</span>
              {card.total !== undefined && (
                <span className="text-sm text-text-muted">/{card.total}</span>
              )}
            </div>
            {card.detail && (
              <p className="mt-1 text-xs text-text-muted">{card.detail}</p>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Recent Sync Logs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 rounded-2xl border border-border bg-surface p-6"
      >
        <h3 className="text-lg font-bold text-navy-700">Aktivitas Terbaru</h3>

        {logs.length === 0 ? (
          <div className="mt-4 py-8 text-center">
            <p className="text-sm text-text-muted">Belum ada aktivitas sync</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {logs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-xl bg-cream p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      log.status === 'success'
                        ? 'bg-profit-500'
                        : log.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-warm-400'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-navy-700 capitalize">
                      {log.sync_type === 'connection_test'
                        ? 'Test Koneksi'
                        : log.sync_type === 'products'
                          ? 'Sync Produk'
                          : log.sync_type === 'orders'
                            ? 'Sync Pesanan'
                            : log.sync_type === 'inventory'
                              ? 'Sync Stok'
                              : log.sync_type === 'webhook'
                                ? 'Webhook'
                                : log.sync_type}
                    </p>
                    <p className="text-xs text-text-muted capitalize">{log.marketplace}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${log.status === 'success' ? 'text-profit-600' : 'text-red-500'}`}>
                    {log.status === 'success' ? 'Berhasil' : log.status === 'error' ? 'Gagal' : 'Sebagian'}
                  </p>
                  <p className="text-[11px] text-text-muted">{formatDate(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}
