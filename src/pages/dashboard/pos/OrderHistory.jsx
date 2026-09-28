import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency, formatDateTime } from '../../../lib/orderNumber'
import { canDeleteOrder, deleteCompletedOrder } from '../../../services/posService'
import { getReceiptSettings } from '../../../services/receiptSettingsService'
import ReceiptView from '../../../components/pos/ReceiptView'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'

const STATUS_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'diproses', label: 'Diproses' },
  { key: 'siap', label: 'Siap' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'dibatalkan', label: 'Dibatalkan' },
]

const STATUS_COLORS = {
  pending: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  diproses: 'bg-blue-50 text-blue-600 border-blue-200',
  siap: 'bg-profit-50 text-profit-600 border-profit-200',
  selesai: 'bg-surface text-text-muted border-border',
  dibatalkan: 'bg-red-50 text-red-500 border-red-200',
  // Legacy statuses for backward compat
  confirmed: 'bg-blue-50 text-blue-600 border-blue-200',
  preparing: 'bg-purple-50 text-purple-600 border-purple-200',
  ready: 'bg-profit-50 text-profit-600 border-profit-200',
  completed: 'bg-surface text-text-muted border-border',
  cancelled: 'bg-red-50 text-red-500 border-red-200',
}

const STATUS_LABELS = {
  pending: 'Menunggu',
  diproses: 'Diproses',
  siap: 'Siap',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  // Legacy statuses for backward compat
  confirmed: 'Dikonfirmasi',
  preparing: 'Diproses',
  ready: 'Siap',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}

export default function OrderHistory() {
  const { business, profile } = useAuth()
  const { toast, showToast } = useToast()
  const [orders, setOrders] = useState([])
  const [receiptSettings, setReceiptSettings] = useState(null)
  const [receiptModalOrder, setReceiptModalOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [dateFilter, setDateFilter] = useState('today')
  const [detailOrder, setDetailOrder] = useState(null)
  const [deletingOrder, setDeletingOrder] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (business?.id) {
      loadOrders()
      loadReceiptSettings()
    }
  }, [business?.id, dateFilter])

  async function loadReceiptSettings() {
    try {
      const data = await getReceiptSettings(business.id, business)
      setReceiptSettings(data)
    } catch (err) {
      console.warn('[OrderHistory] Failed to load receipt settings:', err)
    }
  }

  async function loadOrders() {
    setLoading(true)

    let query = supabase
      .from('orders')
      .select('*, items:order_items(*), table:tables(name)')
      .eq('business_id', business.id)

    const now = new Date()
    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      query = query.gte('created_at', start)
    } else if (dateFilter === 'week') {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      query = query.gte('created_at', start.toISOString())
    } else if (dateFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      query = query.gte('created_at', start)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) {
      showToast('Gagal memuat riwayat pesanan.', 'error')
    }
    setOrders(data || [])
    setLoading(false)
  }

  async function handleConfirmDelete() {
    if (!deletingOrder || !business?.id) return

    setDeleteLoading(true)
    try {
      await deleteCompletedOrder(deletingOrder.id, business.id)
      setOrders(prev => prev.filter(o => o.id !== deletingOrder.id))
      showToast('Pesanan berhasil dihapus dari riwayat.', 'success')
      if (detailOrder?.id === deletingOrder.id) {
        setDetailOrder(null)
      }
      setDeletingOrder(null)
      loadOrders()
    } catch (err) {
      console.error('[OrderHistory] Delete order error:', err)
      showToast(err.message || 'Gagal menghapus pesanan.', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const filtered = activeTab === 'all'
    ? orders
    : orders.filter(o => o.order_status === activeTab)

  const totalRevenue = orders
    .filter(o => o.payment_status === 'paid')
    .reduce((sum, o) => sum + Number(o.total), 0)

  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />
      <BackButton fallbackUrl="/dashboard/pos" />
      <div>
        <h1 className="text-2xl font-extrabold text-navy-700">Riwayat Pesanan</h1>
        <p className="mt-1 text-sm text-text-secondary">Lihat semua pesanan dari QR Menu dan POS.</p>
      </div>

      {/* Summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Pesanan</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Pendapatan</p>
          <p className="mt-1 text-2xl font-extrabold text-profit-600">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Pesanan Hari Ini</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">
            {orders.filter(o => {
              const d = new Date(o.created_at)
              const now = new Date()
              return d.toDateString() === now.toDateString()
            }).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5">
          {['today', 'week', 'month', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                dateFilter === f
                  ? 'bg-navy-700 text-white'
                  : 'bg-surface border border-border text-text-secondary hover:bg-cream'
              }`}
            >
              {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu Ini' : f === 'month' ? 'Bulan Ini' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              activeTab === tab.key
                ? 'bg-warm-50 text-warm-500 border border-warm-200'
                : 'text-text-muted hover:bg-cream'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada pesanan</p>
          <p className="mt-2 text-sm text-text-muted">Pesanan pertama akan muncul di sini.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map(o => (
            <motion.div
              key={o.id}
              layout
              onClick={() => setDetailOrder(o)}
              className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-warm-200 hover:shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-navy-700">#{o.order_number}{o.customer_name ? ` — ${o.customer_name}` : ''}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${STATUS_COLORS[o.order_status] || ''}`}>
                    {STATUS_LABELS[o.order_status] || o.order_status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {o.table?.name || 'Tanpa meja'} · {(o.items || []).length} item
                </p>
                <p className="text-[10px] text-text-muted">{formatDateTime(o.created_at)}</p>
              </div>
              <div className="text-right flex flex-col items-end">
                <p className="text-sm font-bold text-warm-500">{formatCurrency(o.total)}</p>
                <p className={`text-[10px] font-semibold ${
                  o.payment_status === 'paid' ? 'text-profit-600' : 'text-yellow-600'
                }`}>
                  {o.payment_status === 'paid'
                    ? 'PAID / Lunas'
                    : (o.payment_method || '').toLowerCase() === 'qris'
                    ? 'Menunggu Konfirmasi'
                    : 'Belum Bayar'}
                </p>

                {canDeleteOrder(o) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingOrder(o)
                    }}
                    className="mt-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 text-[9px] font-bold transition-colors"
                    title="Hapus dari riwayat POS"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {detailOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
            onClick={() => setDetailOrder(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy-700">Order #{detailOrder.order_number}{detailOrder.customer_name ? ` — ${detailOrder.customer_name}` : ''}</h2>
                <button onClick={() => setDetailOrder(null)} className="text-text-muted">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                {detailOrder.customer_name && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Nama Pembeli</span>
                    <span className="font-semibold text-navy-700">{detailOrder.customer_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-muted">Meja</span>
                  <span className="font-semibold text-navy-700">{detailOrder.table?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Sumber</span>
                  <span className="font-semibold text-navy-700">{detailOrder.order_source === 'qr_menu' ? 'QR Menu' : 'POS'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Status</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[detailOrder.order_status] || ''}`}>
                    {STATUS_LABELS[detailOrder.order_status]}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Metode Pembayaran</span>
                  <span className="font-semibold text-navy-700 uppercase">
                    {(detailOrder.payment_method || '').toLowerCase() === 'qris' ? 'QRIS' : detailOrder.payment_method || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Status Pembayaran</span>
                  <span className={`font-bold ${
                    detailOrder.payment_status === 'paid'
                      ? 'text-profit-600'
                      : (detailOrder.payment_method || '').toLowerCase() === 'qris'
                      ? 'text-yellow-600'
                      : 'text-yellow-600'
                  }`}>
                    {detailOrder.payment_status === 'paid'
                      ? 'PAID / Lunas'
                      : (detailOrder.payment_method || '').toLowerCase() === 'qris'
                      ? 'Menunggu Konfirmasi'
                      : 'Belum Bayar'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Waktu</span>
                  <span className="text-navy-700">{formatDateTime(detailOrder.created_at)}</span>
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs font-bold text-text-muted uppercase mb-2">Item</p>
                <div className="space-y-1.5">
                  {(detailOrder.items || []).map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{item.quantity}x {item.product_name}</span>
                      <span className="font-semibold text-navy-700">{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                {detailOrder.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Diskon</span>
                    <span>-{formatCurrency(detailOrder.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-navy-700">
                  <span>Total</span>
                  <span>{formatCurrency(detailOrder.total)}</span>
                </div>
              </div>


              <div className="mt-6 border-t border-border pt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const orderToPrint = detailOrder
                      setDetailOrder(null)
                      setReceiptModalOrder(orderToPrint)
                    }}
                    className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-cream transition-colors shadow-2xs"
                  >
                    <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Lihat Struk
                  </button>
                  {canDeleteOrder(detailOrder) && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = detailOrder
                        setDetailOrder(null)
                        setDeletingOrder(target)
                      }}
                      className="rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-2 text-xs font-bold text-red-600 transition-colors"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailOrder(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-cream"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-xs p-5"
            onClick={() => !deleteLoading && setDeletingOrder(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">Hapus pesanan ini?</h2>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                Pesanan <span className="font-mono font-bold text-navy-700">#{deletingOrder.order_number}</span> akan dihapus dari riwayat POS. Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingOrder(null)}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-60 shadow-xs"
                >
                  {deleteLoading ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Full Thermal Receipt & WhatsApp Modal */}
      <AnimatePresence>
        {receiptModalOrder && (
          <ReceiptView
            order={receiptModalOrder}
            settings={receiptSettings || {}}
            business={business}
            cashierName={profile?.full_name || 'Kasir'}
            isModal={true}
            onClose={() => setReceiptModalOrder(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
