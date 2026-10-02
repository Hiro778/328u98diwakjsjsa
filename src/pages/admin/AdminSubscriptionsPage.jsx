import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import { fetchAdminSubscriptions, cancelAdminSubscription } from '../../services/adminSubscriptionService.js'
import AdminSubscriptionActionModal from '../../components/admin/AdminSubscriptionActionModal.jsx'

function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
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

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters, Search, Sort, Pagination
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    targetSubscription: null,
    loading: false,
  })

  const [feedback, setFeedback] = useState(null)

  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { subscriptions: fetchedSubs, totalCount: count, error: fetchErr } = await fetchAdminSubscriptions({
      search,
      planFilter,
      statusFilter,
      sortBy,
      limit,
      offset,
    })

    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat daftar langganan.')
    } else {
      setSubscriptions(fetchedSubs)
      setTotalCount(count)
    }
    setLoading(false)
  }, [search, planFilter, statusFilter, sortBy, page])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        loadSubscriptions()
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadSubscriptions])

  const openCancelModal = (sub) => {
    setModalState({
      isOpen: true,
      targetSubscription: sub,
      loading: false,
    })
  }

  const handleCancelConfirm = async ({ subscriptionId, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await cancelAdminSubscription({ subscriptionId, reason })

    if (res.success) {
      setFeedback({
        type: 'success',
        message: 'Langganan berhasil dibatalkan dan dicatat ke Audit Log.',
      })
      setModalState({ isOpen: false, targetSubscription: null, loading: false })
      loadSubscriptions()
    } else {
      setFeedback({ type: 'error', message: res.error?.message || 'Gagal membatalkan langganan.' })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  const totalPages = Math.ceil(totalCount / limit) || 1

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Subscription Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Monitoring terpusat status paket langganan Pro/Free, tanggal kadaluarsa, dan histori transaksi.
          </p>
        </div>
        <div className="text-xs text-gray-400 bg-[#111827] border border-[#1F2937] px-3 py-1.5 rounded-lg shrink-0">
          Total Langganan: <span className="font-semibold text-white">{totalCount}</span>
        </div>
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
          <button
            onClick={() => setFeedback(null)}
            className="text-gray-400 hover:text-white cursor-pointer ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Cari Langganan / User</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Email, nama, ID langganan..."
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Plan Filter */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Paket Plan</label>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Semua Paket (All Plans)</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="free">Free (Legacy)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Status Langganan</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Semua Status (All Status)</option>
              <option value="active">Active (Aktif)</option>
              <option value="expired">Expired (Kadaluarsa)</option>
              <option value="cancelled">Cancelled (Dibatalkan)</option>
              <option value="inactive">Inactive (Nonaktif)</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Urutan (Sort)</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="newest">Terbaru Dibuat</option>
              <option value="oldest">Terlama Dibuat</option>
              <option value="expires_soon">Kadaluarsa Terdekat</option>
              <option value="expires_late">Kadaluarsa Terjauh</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400 space-y-3">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
            <div>Memuat data langganan...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs space-y-3">
            <div className="text-red-400">{error}</div>
            <button
              onClick={loadSubscriptions}
              className="px-3 py-1.5 bg-[#1F2937] hover:bg-[#374151] text-white rounded text-xs transition-colors cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 space-y-1">
            <div className="text-base font-medium text-gray-300">Tidak ada data langganan</div>
            <div>Coba sesuaikan filter pencarian atau kata kunci Anda.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-[#0B0F19] border-b border-[#1F2937] text-gray-400 font-medium uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">User / Business</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Dibuat</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937] text-gray-300">
                {subscriptions.map((sub) => {
                  const p = (sub.plan || '').toLowerCase()
                  const isPro = p === 'pro'
                  const isBasic = p === 'basic'
                  const isActive = sub.status === 'active'
                  const isExpired = sub.status === 'expired'
                  const isCancelled = sub.status === 'cancelled'

                  return (
                    <tr key={sub.id} className="hover:bg-[#161F30] transition-colors">
                      {/* User / Business */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{sub.user?.name || sub.user?.email || '—'}</div>
                        <div className="text-[11px] text-gray-400">{sub.user?.email || '—'}</div>
                        <div className="text-[10px] text-cyan-400/80 mt-0.5">Bisnis: {sub.business_name}</div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            isPro
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : isBasic
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                          }`}
                        >
                          {isPro ? 'PRO' : isBasic ? 'BASIC' : 'FREE (LEGACY)'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
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
                      </td>

                      {/* Periode */}
                      <td className="px-4 py-3 text-[11px]">
                        <div>Mulai: {formatDate(sub.started_at || sub.created_at)}</div>
                        <div className="text-gray-400">Berakhir: {formatDate(sub.expires_at)}</div>
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3 text-[11px]">
                        {sub.last_payment ? (
                          <>
                            <div className="font-medium text-white">{formatRupiah(Number(sub.last_payment.amount))}</div>
                            <div className="text-[10px] text-gray-400 uppercase">
                              {sub.last_payment.method || 'online'} • {sub.last_payment.status}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="px-4 py-3 text-[11px] text-gray-400">
                        {formatDate(sub.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/admin/subscriptions/${sub.id}`}
                            className="px-2.5 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded transition-colors"
                          >
                            Detail
                          </Link>

                          {isActive && (
                            <button
                              onClick={() => openCancelModal(sub)}
                              className="px-2.5 py-1 text-[11px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors cursor-pointer"
                            >
                              Batalkan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && subscriptions.length > 0 && (
          <div className="bg-[#0B0F19] border-t border-[#1F2937] px-4 py-3 flex items-center justify-between text-xs text-gray-400">
            <div>
              Menampilkan {subscriptions.length} dari {totalCount} langganan
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded bg-[#111827] border border-[#1F2937] hover:bg-[#1F2937] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sebelumnya
              </button>
              <span>
                Halaman {page} dari {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded bg-[#111827] border border-[#1F2937] hover:bg-[#1F2937] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

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
