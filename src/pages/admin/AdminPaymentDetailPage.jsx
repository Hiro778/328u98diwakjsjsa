import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router'
import {
  fetchAdminPaymentDetail,
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
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        Langganan SaaS
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
      Kasir / Pesanan Toko
    </span>
  )
}

function StatusBadge({ status }) {
  const s = (status || 'pending').toLowerCase()
  if (['paid', 'settlement', 'capture'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        Sukses (Lunas)
      </span>
    )
  }
  if (s === 'pending') {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        Menunggu Pembayaran (Pending)
      </span>
    )
  }
  if (['failed', 'cancel', 'expire', 'deny', 'dibatalkan'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
        Gagal / Batal
      </span>
    )
  }
  if (['refund', 'refunded'].includes(s)) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
        Refunded
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/15 text-gray-300 border border-gray-500/30">
      {status}
    </span>
  )
}

export default function AdminPaymentDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const paymentTypeQuery = searchParams.get('type') || 'auto'
  const navigate = useNavigate()

  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    const { payment: pData, error: pErr } = await fetchAdminPaymentDetail(id, paymentTypeQuery)
    if (pErr) {
      setError(pErr.message)
      setPayment(null)
    } else {
      setPayment(pData)
    }
    setLoading(false)
  }, [id, paymentTypeQuery])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/payments')}
          className="p-2 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Kembali ke Daftar Transaksi"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link to="/admin/payments" className="hover:text-slate-200 transition-colors">
            Payments
          </Link>
          <span>/</span>
          <span className="text-slate-200 font-mono truncate max-w-[200px]">{id}</span>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="p-12 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Memuat rincian transaksi pembayaran...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-red-300">Gagal Memuat Transaksi</h3>
              <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={loadDetail}
            className="px-4 py-1.5 text-xs font-medium text-red-200 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors cursor-pointer"
          >
            Coba Muat Ulang
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && payment && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="p-5 sm:p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <PaymentTypeBadge type={payment.payment_type} />
                  <StatusBadge status={payment.payment_status} />
                  {payment.transaction_status && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      tx: {payment.transaction_status}
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-white font-mono mt-3">
                  {formatRupiah(payment.gross_amount)}
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-1 select-all">
                  Payment ID: {payment.id}
                </p>
              </div>

              {/* Read Only Notice Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-[11px] text-slate-300">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Read-Only Payment Monitoring</span>
              </div>
            </div>

            {/* Grid Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Provider & Metode</span>
                <span className="text-slate-200 font-medium">
                  {payment.payment_provider || 'manual'} • {payment.payment_method || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Referensi / Transaction ID</span>
                <span className="text-slate-200 font-mono truncate block" title={payment.transaction_id || payment.midtrans_order_id || '—'}>
                  {payment.transaction_id || payment.midtrans_order_id || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Waktu Dibuat</span>
                <span className="text-slate-200">{formatDate(payment.created_at)}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Waktu Dibayar</span>
                <span className="text-slate-200">
                  {payment.paid_at ? (
                    <span className="text-emerald-400 font-medium">{formatDate(payment.paid_at)}</span>
                  ) : (
                    'Belum dibayar'
                  )}
                </span>
              </div>

              {payment.payment_type === 'order' && (
                <>
                  <div>
                    <span className="text-slate-400 block mb-1">Order Ref & Status</span>
                    <span className="text-slate-200">
                      {payment.order_number ? `#${payment.order_number}` : '—'} ({payment.order_status || '—'})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Customer & Sumber</span>
                    <span className="text-slate-200">
                      {payment.customer_name || 'Pelanggan Toko'} ({payment.order_source || 'pos'})
                    </span>
                  </div>
                </>
              )}

              {payment.payment_type === 'subscription' && (
                <>
                  <div>
                    <span className="text-slate-400 block mb-1">Paket Langganan</span>
                    <span className="text-purple-400 font-semibold uppercase">
                      {payment.subscription_plan || 'pro'} ({payment.subscription_status || 'active'})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Periode Aktif</span>
                    <span className="text-slate-200">
                      {payment.period_start ? formatDate(payment.period_start) : '—'} s/d{' '}
                      {payment.period_end ? formatDate(payment.period_end) : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* User & Business Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* User Info */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profil Pengguna
              </h2>
              <div className="text-xs space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama:</span>
                  <span className="font-medium text-slate-200">{payment.user_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-medium text-slate-200">{payment.user_email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User ID:</span>
                  <span className="font-mono text-slate-400 truncate max-w-[180px]">{payment.user_id || '—'}</span>
                </div>
              </div>
            </div>

            {/* Business Info */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Bisnis / Toko Terkait
              </h2>
              <div className="text-xs space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Bisnis:</span>
                  <span className="font-medium text-slate-200">{payment.business_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Business ID:</span>
                  <span className="font-mono text-slate-400 truncate max-w-[180px]">{payment.business_id || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sanitized Provider Metadata */}
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Sanitized Provider Metadata
              </h2>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                Credentials & Tokens Stripped
              </span>
            </div>
            <pre className="p-4 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 overflow-x-auto border border-slate-800/80 max-h-72">
              {JSON.stringify(payment.safe_metadata || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
