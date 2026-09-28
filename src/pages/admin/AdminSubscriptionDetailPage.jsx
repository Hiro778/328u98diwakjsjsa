import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { fetchAdminSubscriptionDetail, cancelAdminSubscription } from '../../services/adminSubscriptionService.js'
import AdminSubscriptionActionModal from '../../components/admin/AdminSubscriptionActionModal.jsx'

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

function formatRupiah(num) {
  if (typeof num !== 'number') return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num)
}

export default function AdminSubscriptionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    targetSubscription: null,
    loading: false,
  })

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { detail: data, error: fetchErr } = await fetchAdminSubscriptionDetail(id)
    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat detail langganan.')
    } else {
      setDetail(data)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        loadDetail()
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadDetail])

  const openCancelModal = () => {
    if (!detail?.subscription) return
    setModalState({
      isOpen: true,
      targetSubscription: {
        id: detail.subscription.id,
        plan: detail.subscription.plan,
        user: detail.owner,
        business_name: detail.business?.name,
      },
      loading: false,
    })
  }

  const handleCancelConfirm = async ({ subscriptionId, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await cancelAdminSubscription({ subscriptionId, reason })

    if (res.success) {
      setFeedback({
        type: 'success',
        message: 'Langganan berhasil dibatalkan dan tercatat dalam Audit Log.',
      })
      setModalState({ isOpen: false, targetSubscription: null, loading: false })
      loadDetail()
    } else {
      setFeedback({ type: 'error', message: res.error?.message || 'Gagal membatalkan langganan.' })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-gray-400 space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        <div>Memuat rincian langganan...</div>
      </div>
    )
  }

  if (error || !detail?.subscription) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/subscriptions"
          className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
        >
          ← Kembali ke Daftar Langganan
        </Link>
        <div className="bg-[#111827] border border-red-500/20 rounded-xl p-6 text-center space-y-3">
          <div className="text-red-400 text-sm font-semibold">{error || 'Data langganan tidak ditemukan.'}</div>
          <button
            onClick={() => navigate('/admin/subscriptions')}
            className="px-4 py-2 bg-[#1F2937] hover:bg-[#374151] text-white text-xs rounded-lg transition-colors cursor-pointer"
          >
            Kembali ke Daftar
          </button>
        </div>
      </div>
    )
  }

  const sub = detail.subscription
  const owner = detail.owner
  const business = detail.business
  const payments = detail.payments || []
  const auditLogs = detail.audit_logs || []

  const isPro = sub.plan?.toLowerCase() === 'pro'
  const isActive = sub.status === 'active'
  const isExpired = sub.status === 'expired'
  const isCancelled = sub.status === 'cancelled'

  return (
    <div className="space-y-6">
      {/* Back button and breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/subscriptions"
          className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
        >
          ← Kembali ke Daftar Langganan
        </Link>
        <div className="text-xs text-gray-500 font-mono">ID: {sub.id}</div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-white cursor-pointer ml-4 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Header Profile & Actions */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-xs font-bold border ${
                isPro
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
              }`}
            >
              PAKET {isPro ? 'PRO' : 'FREE'}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : isExpired
                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : isCancelled
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
              }`}
            >
              {isActive
                ? 'Aktif'
                : isExpired
                ? 'Kadaluarsa'
                : isCancelled
                ? 'Dibatalkan'
                : 'Nonaktif'}
            </span>
          </div>
          <div className="text-sm text-gray-300">
            Pemilik: <span className="text-white font-medium">{owner?.name || owner?.email || '—'}</span>{' '}
            <span className="text-gray-400 text-xs font-mono">({owner?.email || '—'})</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          {isActive ? (
            <button
              onClick={openCancelModal}
              className="px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors bg-red-600 hover:bg-red-700 cursor-pointer"
            >
              Batalkan Langganan
            </button>
          ) : (
            <div className="text-xs text-gray-500 italic">
              Tidak ada aksi operasional yang tersedia untuk status ini.
            </div>
          )}
        </div>
      </div>

      {/* Grid: Subscription Info + Owner/Business Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Info Card */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white border-b border-[#1F2937] pb-2">
            Informasi Siklus Langganan
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-gray-400 mb-0.5">Status Database (Raw)</div>
              <div className="text-gray-200 font-mono">{sub.raw_status}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Payment Provider</div>
              <div className="text-gray-200 uppercase">{sub.payment_provider || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Mulai Aktif (Started At)</div>
              <div className="text-gray-200">{formatDate(sub.started_at)}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Tanggal Kadaluarsa</div>
              <div className={isExpired ? 'text-red-400 font-medium' : 'text-gray-200'}>
                {formatDate(sub.expires_at)}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Dibuat Pada</div>
              <div className="text-gray-200">{formatDate(sub.created_at)}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Terakhir Diperbarui</div>
              <div className="text-gray-200">{formatDate(sub.updated_at)}</div>
            </div>
            {sub.cancelled_at && (
              <>
                <div>
                  <div className="text-gray-400 mb-0.5">Dibatalkan Pada</div>
                  <div className="text-amber-400">{formatDate(sub.cancelled_at)}</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-0.5">Dibatalkan Oleh</div>
                  <div className="text-gray-200 font-mono text-[11px] truncate">{sub.cancelled_by || 'Sistem'}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Business & Owner Info Card */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white border-b border-[#1F2937] pb-2">
            Entitas Bisnis & Pengguna Terkait
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-gray-400 mb-0.5">Nama Pengguna</div>
              <div className="text-white font-medium">{owner?.name || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Status Akun</div>
              <div className="text-emerald-400">{owner?.status || 'active'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Nama Bisnis Utama</div>
              <div className="text-white font-medium">{business?.name || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Status Bisnis</div>
              <div className={business?.is_active ? 'text-emerald-400' : 'text-gray-400'}>
                {business?.is_active ? 'Aktif' : 'Nonaktif'}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Kategori / Industri</div>
              <div className="text-gray-200">{business?.business_category || business?.business_type || '—'}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-0.5">Lokasi</div>
              <div className="text-gray-200">{business?.location || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1F2937]">
          <h2 className="text-sm font-semibold text-white">Riwayat Transaksi Pembayaran (Payment History)</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Daftar transaksi pembayaran langganan melalui gateway pembayaran resmi.
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">
            Belum ada riwayat transaksi pembayaran tercatat untuk langganan ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19] border-b border-[#1F2937] text-gray-400 font-medium uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Order ID</th>
                  <th className="px-4 py-2.5">Metode</th>
                  <th className="px-4 py-2.5">Nominal</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Dibayar Pada</th>
                  <th className="px-4 py-2.5">Periode Terproteksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937] text-gray-300">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-[#161F30] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-200">
                      {pay.midtrans_order_id}
                    </td>
                    <td className="px-4 py-2.5 uppercase text-[11px]">
                      {pay.payment_method || 'snap'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-white">
                      {formatRupiah(Number(pay.gross_amount))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          pay.payment_status === 'settlement' || pay.payment_status === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : pay.payment_status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
                        {pay.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-400">
                      {formatDate(pay.paid_at)}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-400">
                      {formatDate(pay.period_start)} – {formatDate(pay.period_end)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs Table */}
      {auditLogs.length > 0 && (
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#1F2937]">
            <h2 className="text-sm font-semibold text-white">Jejak Audit Administratif (Audit Logs)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Catatan mutasi administratif yang dilakukan oleh admin terhadap langganan ini.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19] border-b border-[#1F2937] text-gray-400 font-medium uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-2.5">Aksi</th>
                  <th className="px-4 py-2.5">Alasan (Reason)</th>
                  <th className="px-4 py-2.5">Admin ID</th>
                  <th className="px-4 py-2.5">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937] text-gray-300">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#161F30]">
                    <td className="px-4 py-2.5 font-semibold text-amber-400">{log.action}</td>
                    <td className="px-4 py-2.5 text-gray-300">{log.reason}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-400">{log.admin_id}</td>
                    <td className="px-4 py-2.5 text-gray-400">{formatDate(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      <AdminSubscriptionActionModal
        isOpen={modalState.isOpen}
        targetSubscription={modalState.targetSubscription}
        loading={modalState.loading}
        onClose={() => setModalState({ isOpen: false, targetSubscription: null, loading: false })}
        onConfirm={handleCancelConfirm}
      />
    </div>
  )
}
