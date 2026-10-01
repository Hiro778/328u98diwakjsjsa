import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import { fetchAdminBusinesses, updateAdminBusinessStatus } from '../../services/adminBusinessService.js'
import AdminBusinessActionModal from '../../components/admin/AdminBusinessActionModal.jsx'

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

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Search & Sort & Pagination
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    targetBusiness: null,
    loading: false,
  })

  const [feedback, setFeedback] = useState(null)

  const loadBusinesses = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { businesses: fetchedBiz, totalCount: count, error: fetchErr } = await fetchAdminBusinesses({
      search,
      planFilter,
      statusFilter,
      sortBy,
      limit,
      offset,
    })

    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat daftar bisnis.')
    } else {
      setBusinesses(fetchedBiz)
      setTotalCount(count)
    }
    setLoading(false)
  }, [search, planFilter, statusFilter, sortBy, page])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        loadBusinesses()
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadBusinesses])

  const openActionModal = (biz) => {
    setModalState({
      isOpen: true,
      targetBusiness: biz,
      loading: false,
    })
  }

  const handleActionConfirm = async ({ businessId, isActive, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await updateAdminBusinessStatus({ businessId, isActive, reason })

    if (res.success) {
      setFeedback({
        type: 'success',
        message: `Status bisnis berhasil diubah menjadi ${isActive ? 'Aktif' : 'Nonaktif'}.`,
      })
      setModalState({ isOpen: false, targetBusiness: null, loading: false })
      loadBusinesses()
    } else {
      setFeedback({ type: 'error', message: res.error?.message || 'Gagal memperbarui status bisnis.' })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Business Management</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Kelola seluruh tenant bisnis UMKM, produk, order transaksi kasir, dan kepemilikan akun.
          </p>
        </div>
        <div className="text-xs text-gray-400 font-mono">
          Total: <span className="text-emerald-400 font-bold">{totalCount}</span> entitas bisnis
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold underline">✕</button>
        </div>
      )}

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => loadBusinesses()} className="underline font-bold">Coba Lagi</button>
        </div>
      )}

      {/* Control Bar: Search & Filters */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari bisnis, ID, atau email owner..."
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg pl-3 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                title="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Plan Filter */}
          <div>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="all">Semua Paket</option>
              <option value="free">Free Tier</option>
              <option value="pro">Pro Subscription</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif (Active)</option>
              <option value="inactive">Nonaktif (Inactive)</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="newest">Terbaru (Newest)</option>
              <option value="oldest">Terlama (Oldest)</option>
              <option value="most_products">Produk Terbanyak</option>
              <option value="most_orders">Pesanan Terbanyak</option>
              <option value="highest_ai">Penggunaan AI Tertinggi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Businesses Table */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[750px]">
            <thead className="bg-[#1F2937]/50 text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#1F2937]">
              <tr>
                <th className="py-3.5 px-4">Bisnis UMKM</th>
                <th className="py-3.5 px-4">Owner Akun</th>
                <th className="py-3.5 px-4">Plan</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Produk</th>
                <th className="py-3.5 px-4">Pesanan / Omzet</th>
                <th className="py-3.5 px-4">AI Usage</th>
                <th className="py-3.5 px-4">Terdaftar</th>
                <th className="py-3.5 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gray-800" />
                        <div className="space-y-1.5">
                          <div className="w-28 h-3.5 bg-gray-800 rounded" />
                          <div className="w-20 h-2.5 bg-gray-800/60 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4"><div className="w-28 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-12 h-4 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-16 h-4 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-10 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-24 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-14 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-20 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="w-16 h-6 bg-gray-800 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : businesses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-gray-800/60 border border-gray-700/50 flex items-center justify-center mx-auto mb-3 text-gray-400">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-400 text-xs">Tidak ada entitas bisnis yang ditemukan</p>
                    <p className="text-[11px] text-gray-500 mt-1">Coba sesuaikan kata kunci pencarian atau filter status yang dipilih.</p>
                  </td>
                </tr>
              ) : (
                businesses.map((b) => (
                  <tr key={b.id} className="hover:bg-[#1F2937]/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {b.logo_url ? (
                          <img
                            src={b.logo_url}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover border border-[#1F2937]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs">
                            {b.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white">{b.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {b.business_type} • {b.business_category}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[140px]">{b.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-white font-medium">{b.owner_name}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{b.owner_email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          b.plan === 'Pro'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                      >
                        {b.plan}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          b.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-300">
                      {b.products_count} produk
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-white font-medium">{b.orders_count} orders</div>
                      <div className="text-[10px] text-emerald-400 font-mono">{formatRupiah(b.total_revenue)}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-300">
                      {b.ai_credits_used} cr
                    </td>
                    <td className="py-3.5 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                      {formatDate(b.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to={`/admin/businesses/${b.id}`}
                          className="px-2.5 py-1 rounded bg-[#1F2937] hover:bg-[#374151] text-gray-200 text-[11px] font-medium transition-colors"
                        >
                          Detail
                        </Link>
                        <button
                          onClick={() => openActionModal(b)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                            b.is_active
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                          }`}
                        >
                          {b.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-[#1F2937]/30 border-t border-[#1F2937] text-xs text-gray-400">
          <div>
            Menampilkan <span className="text-white font-medium">{businesses.length === 0 ? 0 : (page - 1) * limit + 1}</span> -{' '}
            <span className="text-white font-medium">{Math.min(page * limit, totalCount)}</span> dari{' '}
            <span className="text-white font-bold">{totalCount}</span> bisnis
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-mono text-gray-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      <AdminBusinessActionModal
        isOpen={modalState.isOpen}
        targetBusiness={modalState.targetBusiness}
        onClose={() => setModalState({ isOpen: false, targetBusiness: null, loading: false })}
        onConfirm={handleActionConfirm}
        loading={modalState.loading}
      />
    </div>
  )
}
