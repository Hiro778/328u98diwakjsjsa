import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getSyncLogs } from '../../lib/marketplaceService'

const SYNC_TYPE_LABELS = {
  products: 'Produk',
  orders: 'Pesanan',
  inventory: 'Stok',
  connection_test: 'Test Koneksi',
  webhook: 'Webhook',
  credentials: 'Kredensial',
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '-'
  }
}

export default function SyncLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    marketplace: '',
    sync_type: '',
    status: '',
  })

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const data = await getSyncLogs({
      marketplace: filters.marketplace || undefined,
      sync_type: filters.sync_type || undefined,
      status: filters.status || undefined,
      limit: 100,
    })
    setLogs(data)
    setLoading(false)
  }, [filters])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.marketplace}
          onChange={(e) => handleFilterChange('marketplace', e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          <option value="">Semua Marketplace</option>
          <option value="shopee">Shopee</option>
          <option value="tokopedia">Tokopedia</option>
          <option value="tiktokshop">TikTok Shop</option>
        </select>

        <select
          value={filters.sync_type}
          onChange={(e) => handleFilterChange('sync_type', e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          <option value="">Semua Jenis</option>
          <option value="products">Produk</option>
          <option value="orders">Pesanan</option>
          <option value="inventory">Stok</option>
          <option value="connection_test">Test Koneksi</option>
          <option value="webhook">Webhook</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          <option value="">Semua Status</option>
          <option value="success">Berhasil</option>
          <option value="error">Gagal</option>
          <option value="partial">Sebagian</option>
        </select>
      </div>

      {/* Logs Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {loading ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-text-muted">Belum ada log sync</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-cream">
                  <th className="px-4 py-3 font-semibold text-navy-700">Waktu</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Marketplace</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Jenis</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Berhasil</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Gagal</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Durasi</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{log.marketplace}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                    </td>
                    <td className="px-4 py-3 text-profit-600 font-semibold">{log.items_synced}</td>
                    <td className="px-4 py-3 text-red-500 font-semibold">{log.items_failed}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{log.duration_ms}ms</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          log.status === 'success'
                            ? 'bg-profit-100 text-profit-600'
                            : log.status === 'error'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-warm-100 text-warm-600'
                        }`}
                      >
                        {log.status === 'success'
                          ? 'Berhasil'
                          : log.status === 'error'
                            ? 'Gagal'
                            : 'Sebagian'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {log.error_message && (
                        <p className="truncate text-xs text-red-500">{log.error_message}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
