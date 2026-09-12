import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getMarketplaceOrders, syncOrders } from '../../lib/marketplaceService'

const STATUS_LABELS = {
  pending: { label: 'Pending', color: 'bg-navy-50 text-navy-400' },
  processing: { label: 'Diproses', color: 'bg-warm-100 text-warm-600' },
  shipped: { label: 'Dikirim', color: 'bg-electric-100 text-electric-600' },
  delivered: { label: 'Diterima', color: 'bg-profit-100 text-profit-600' },
  completed: { label: 'Selesai', color: 'bg-profit-100 text-profit-600' },
  cancelled: { label: 'Dibatalkan', color: 'bg-red-100 text-red-600' },
  returned: { label: 'Dikembalikan', color: 'bg-red-100 text-red-600' },
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '-'
  }
}

export default function OrderSync({ connections }) {
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const connectedList = connections.filter((c) => c.status === 'connected')

  useEffect(() => {
    if (connectedList.length > 0 && !selectedConnection) {
      setSelectedConnection(connectedList[0].id)
    }
  }, [connectedList, selectedConnection])

  const loadOrders = useCallback(async () => {
    if (!selectedConnection) return
    setLoading(true)
    const data = await getMarketplaceOrders(selectedConnection, {
      status: statusFilter || undefined,
    })
    setOrders(data)
    setLoading(false)
  }, [selectedConnection, statusFilter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  async function handleSync() {
    if (!selectedConnection) return
    setSyncing(true)
    await syncOrders(selectedConnection)
    await loadOrders()
    setSyncing(false)
  }

  if (connectedList.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-muted">Hubungkan marketplace terlebih dahulu untuk melihat pesanan.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedConnection || ''}
          onChange={(e) => setSelectedConnection(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {connectedList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shop_name || c.marketplace}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="processing">Diproses</option>
          <option value="shipped">Dikirim</option>
          <option value="completed">Selesai</option>
          <option value="cancelled">Dibatalkan</option>
        </select>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
        >
          {syncing ? 'Sync...' : 'Tarik Pesanan'}
        </button>
      </div>

      {/* Orders Table */}
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
        ) : orders.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-text-muted">
              Belum ada pesanan. Klik "Tarik Pesanan" untuk sync.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-cream">
                  <th className="px-4 py-3 font-semibold text-navy-700">Order ID</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Pembeli</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Total</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const statusInfo = STATUS_LABELS[order.order_status] || {
                    label: order.order_status,
                    color: 'bg-navy-50 text-navy-400',
                  }
                  return (
                    <tr key={order.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-navy-700">
                          {order.marketplace_order_id}
                        </p>
                        {order.tracking_number && (
                          <p className="mt-0.5 text-[11px] text-text-muted">
                            No. Resi: {order.tracking_number}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-navy-700">{order.buyer_name || '-'}</p>
                        {order.buyer_address && (
                          <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-text-muted">
                            {order.buyer_address}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        Rp{(order.total_amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {formatDate(order.marketplace_created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
