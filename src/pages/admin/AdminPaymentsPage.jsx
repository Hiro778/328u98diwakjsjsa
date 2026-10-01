import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import {
  fetchAdminPayments,
  fetchAdminPaymentMetrics,
  formatRupiah,
} from '../../services/adminPaymentService.js'

function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function PaymentTypeBadge({ type }) {
  const t = (type || 'order').toLowerCase()
  if (t === 'subscription') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        Langganan
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
      Kasir / Order
    </span>
  )
}

function StatusBadge({ status }) {
  const s = (status || 'pending').toLowerCase()
  if (['paid', 'settlement', 'capture'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        Sukses
      </span>
    )
  }
  if (s === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        Menunggu
      </span>
    )
  }
  if (['failed', 'cancel', 'expire', 'deny', 'dibatalkan'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
        Gagal / Batal
      </span>
    )
  }
  if (['refund', 'refunded'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        Refund
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-500/15 text-gray-300 border border-gray-500/30">
      {status}
    </span>
  )
}

function MethodBadge({ provider, method }) {
  const p = (provider || '').toLowerCase()
  const m = (method || '').toLowerCase()

  if (m === 'qris' || p === 'manual_qris') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal-500/15 text-teal-400 border border-teal-500/30">
        QRIS
      </span>
    )
  }
  if (p === 'midtrans' || m === 'snap') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
        Midtrans {m !== 'snap' && m ? `(${m})` : ''}
      </span>
    )
  }
  if (m === 'cash' || p === 'manual') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/15 text-gray-300 border border-gray-500/30">
        Tunai
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/40">
      {method || provider || '—'}
    </span>
  )
}

export default function AdminPaymentsPage() {
  const [records, setRecords] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [paymentType, setPaymentType] = useState('all')
  const [paymentStatus, setPaymentStatus] = useState('all')
  const [paymentProvider, setPaymentProvider] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true)
    const { metrics: mData, error: mErr } = await fetchAdminPaymentMetrics()
    if (!mErr && mData) {
      setMetrics(mData)
    }
    setMetricsLoading(false)
  }, [])

  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { records: rData, totalCount: tCount, error: rErr } = await fetchAdminPayments({
      paymentType,
      search,
      paymentProvider,
      paymentMethod,
      paymentStatus,
      sortBy,
      limit,
      offset,
    })

    if (rErr) {
      setError(rErr.message)
      setRecords([])
      setTotalCount(0)
    } else {
      setRecords(rData || [])
      setTotalCount(tCount || 0)
    }
    setLoading(false)
  }, [paymentType, search, paymentProvider, paymentMethod, paymentStatus, sortBy, page])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const totalPages = Math.ceil(totalCount / limit) || 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitoring terpusat riwayat transaksi pembayaran pesanan toko (POS / QRIS) dan langganan paket SaaS BisnisSehat.
          </p>
        </div>
        <button
          onClick={() => {
            loadMetrics()
            loadPayments()
          }}
          disabled={loading || metricsLoading}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Segarkan Data
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Payments */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Total Transaksi</span>
          <span className="text-2xl font-bold text-white mt-2">
            {metricsLoading ? '…' : (metrics?.total_payments ?? '—')}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Order + Langganan</span>
        </div>

        {/* Total Gross Amount */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-slate-400">Total Gross (Sukses)</span>
          <span className="text-lg font-bold text-emerald-400 mt-2 truncate">
            {metricsLoading ? '…' : formatRupiah(metrics?.total_gross_amount ?? 0)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Settlement/Paid</span>
        </div>

        {/* Paid Count */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-emerald-400">Pembayaran Sukses</span>
          <span className="text-2xl font-bold text-emerald-400 mt-2">
            {metricsLoading ? '…' : (metrics?.paid_count ?? '—')}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Lunas terverifikasi</span>
        </div>

        {/* Pending Count */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-amber-400">Menunggu Pembayaran</span>
          <span className="text-2xl font-bold text-amber-400 mt-2">
            {metricsLoading ? '…' : (metrics?.pending_count ?? '—')}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Status pending</span>
        </div>

        {/* Order Payments */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-sky-400">Order & POS</span>
          <span className="text-2xl font-bold text-sky-400 mt-2">
            {metricsLoading ? '…' : (metrics?.order_payments_count ?? '—')}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Toko UMKM</span>
        </div>

        {/* Subscription Payments */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between">
          <span className="text-xs font-medium text-purple-400">Langganan SaaS</span>
          <span className="text-2xl font-bold text-purple-400 mt-2">
            {metricsLoading ? '…' : (metrics?.subscription_payments_count ?? '—')}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">Paket PRO Midtrans</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Pencarian</label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="ID pembayaran, Order ID, User, Toko..."
                className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipe</label>
            <select
              value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value)
                setPage(1)
              }}
              className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Semua Tipe</option>
              <option value="order">Kasir / Order</option>
              <option value="subscription">Langganan SaaS</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value)
                setPage(1)
              }}
              className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Semua Status</option>
              <option value="paid">Sukses (Paid/Settlement)</option>
              <option value="pending">Pending</option>
              <option value="failed">Gagal / Dibatalkan</option>
              <option value="refunded">Refund</option>
            </select>
          </div>

          {/* Provider Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Provider</label>
            <select
              value={paymentProvider}
              onChange={(e) => {
                setPaymentProvider(e.target.value)
                setPage(1)
              }}
              className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Semua Provider</option>
              <option value="manual">Manual</option>
              <option value="midtrans">Midtrans</option>
              <option value="manual_qris">Manual QRIS</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Urutan</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="amount_desc">Nominal Tertinggi</option>
              <option value="amount_asc">Nominal Terendah</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs text-red-300">{error}</span>
          </div>
          <button
            onClick={loadPayments}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium rounded border border-red-500/30 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="px-4 py-3 font-semibold">Tipe & ID Pembayaran</th>
                <th className="px-4 py-3 font-semibold">Pengguna & Bisnis</th>
                <th className="px-4 py-3 font-semibold">Provider & Metode</th>
                <th className="px-4 py-3 font-semibold">Nominal (Gross)</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Waktu Dibuat</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data transaksi pembayaran...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span className="text-slate-400 font-medium">Tidak ada data pembayaran yang ditemukan</span>
                      <span className="text-[11px] text-slate-500">Coba ubah kata kunci atau bersihkan filter pencarian.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.payment_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <PaymentTypeBadge type={r.payment_type} />
                          {r.payment_type === 'order' && r.order_number && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              #{r.order_number}
                            </span>
                          )}
                          {r.payment_type === 'subscription' && r.subscription_plan && (
                            <span className="text-[11px] text-purple-400 font-semibold uppercase">
                              {r.subscription_plan}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 truncate max-w-[150px]" title={r.payment_id}>
                          {r.payment_id}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-slate-200 font-medium truncate max-w-[180px]">
                          {r.business_name}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
                          {r.user_name} ({r.user_email})
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        <MethodBadge provider={r.payment_provider} method={r.payment_method} />
                        {r.midtrans_order_id && (
                          <span className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]" title={r.midtrans_order_id}>
                            {r.midtrans_order_id}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-100">
                        {formatRupiah(r.gross_amount)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={r.payment_status} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col text-[11px] text-slate-400">
                        <span>{formatDate(r.created_at)}</span>
                        {r.paid_at && (
                          <span className="text-[10px] text-emerald-400/80">
                            Dibayar: {formatDate(r.paid_at)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/payments/${r.payment_id}?type=${r.payment_type}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
                      >
                        Detail
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Menampilkan <span className="font-medium text-slate-200">{records.length}</span> dari{' '}
            <span className="font-medium text-slate-200">{totalCount}</span> transaksi
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sebelumnya
            </button>
            <span>
              Halaman <span className="font-medium text-slate-200">{page}</span> dari{' '}
              <span className="font-medium text-slate-200">{totalPages}</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
