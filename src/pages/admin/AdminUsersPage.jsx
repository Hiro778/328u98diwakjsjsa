import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import { fetchAdminUsers, updateAdminUserStatus } from '../../services/adminUserService.js'
import { useAdminAuth } from '../../hooks/useAdminAuth.js'
import AdminUserActionModal from '../../components/admin/AdminUserActionModal.jsx'

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

export default function AdminUsersPage() {
  const { isSuperAdmin } = useAdminAuth()

  const [users, setUsers] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Search & Sort
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    actionType: 'suspend',
    targetUser: null,
    loading: false,
  })

  const [feedback, setFeedback] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { users: fetchedUsers, totalCount: count, error: fetchErr } = await fetchAdminUsers({
      search,
      planFilter,
      statusFilter,
      sortBy,
      limit,
      offset,
    })

    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat daftar pengguna.')
    } else {
      setUsers(fetchedUsers)
      setTotalCount(count)
    }
    setLoading(false)
  }, [search, planFilter, statusFilter, sortBy, page])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        loadUsers()
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadUsers])

  const openActionModal = (actionType, user) => {
    setModalState({
      isOpen: true,
      actionType,
      targetUser: user,
      loading: false,
    })
  }

  const handleActionConfirm = async ({ targetUserId, newStatus, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await updateAdminUserStatus({ targetUserId, newStatus, reason })

    if (res.success) {
      setFeedback({ type: 'success', message: `Status pengguna berhasil diperbarui ke ${newStatus}.` })
      setModalState({ isOpen: false, actionType: 'suspend', targetUser: null, loading: false })
      loadUsers()
    } else {
      setFeedback({ type: 'error', message: res.error?.message || 'Gagal memperbarui status pengguna.' })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">User Management</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Kelola seluruh akun pengguna, bisnis, lisensi langganan, dan status keamanan.
          </p>
        </div>
        <div className="text-xs text-gray-400 font-mono">
          Total: <span className="text-emerald-400 font-bold">{totalCount}</span> pengguna
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

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => loadUsers()} className="underline font-bold">Coba Lagi</button>
        </div>
      )}

      {/* Controls: Search, Filter, Sort */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari nama, email, ID, bisnis..."
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-emerald-500"
            />
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
              <option value="all">Semua Plan (All)</option>
              <option value="pro">Pro Users</option>
              <option value="free">Free Users</option>
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
              <option value="all">Semua Status (All)</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
              <option value="deleted">Deleted (Soft-Delete)</option>
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
              <option value="highest_ai">Penggunaan AI Tertinggi</option>
              <option value="latest_activity">Aktivitas Terakhir</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1F2937]/50 text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#1F2937]">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Bisnis</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">AI Usage</th>
                <th className="py-3 px-4">Terdaftar</th>
                <th className="py-3 px-4">Aktivitas</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2937]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-800" />
                        <div className="space-y-1.5">
                          <div className="w-24 h-3 bg-gray-800 rounded" />
                          <div className="w-16 h-2 bg-gray-800/60 rounded" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4"><div className="w-32 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-20 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-12 h-4 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-16 h-4 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-12 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-20 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="w-20 h-3 bg-gray-800 rounded" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="w-14 h-6 bg-gray-800 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-gray-800/60 border border-gray-700/50 flex items-center justify-center mx-auto mb-3 text-gray-400">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="font-medium text-gray-400 text-xs">Tidak ada pengguna yang ditemukan</p>
                    <p className="text-[11px] text-gray-500 mt-1">Coba sesuaikan kata kunci pencarian atau filter status yang dipilih.</p>
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#1F2937]/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover border border-[#1F2937]"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[10px]">
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white">{u.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-300">{u.email}</td>
                    <td className="py-3 px-4">
                      {u.business_name ? (
                        <div>
                          <div className="text-white font-medium">{u.business_name}</div>
                          <div className="text-[10px] text-emerald-400/80 font-mono">
                            {u.business_count ?? 1} bisnis
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">0 bisnis</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.plan === 'Pro'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                      >
                        {u.plan}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : u.status === 'suspended'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : u.status === 'banned'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-300">
                      {u.ai_credits_used} cr
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-[11px] whitespace-nowrap">
                      {formatDate(u.last_active)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to={`/admin/users/${u.id}`}
                          className="px-2 py-1 rounded bg-[#1F2937] hover:bg-[#374151] text-gray-200 text-[11px] font-medium transition-colors"
                        >
                          Detail
                        </Link>

                        {u.status === 'suspended' ? (
                          <button
                            onClick={() => openActionModal('unsuspend', u)}
                            className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/20 transition-colors"
                          >
                            Unsuspend
                          </button>
                        ) : u.status === 'active' ? (
                          <button
                            onClick={() => openActionModal('suspend', u)}
                            className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-medium border border-amber-500/20 transition-colors"
                          >
                            Suspend
                          </button>
                        ) : null}

                        {u.status === 'banned' ? (
                          <button
                            onClick={() => openActionModal('unban', u)}
                            className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/20 transition-colors"
                          >
                            Unban
                          </button>
                        ) : u.status !== 'deleted' ? (
                          <button
                            onClick={() => openActionModal('ban', u)}
                            className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium border border-red-500/20 transition-colors"
                          >
                            Ban
                          </button>
                        ) : null}

                        {isSuperAdmin && u.status !== 'deleted' && (
                          <button
                            onClick={() => openActionModal('delete', u)}
                            className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium border border-rose-500/20 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-[#1F2937] flex items-center justify-between text-xs text-gray-400">
          <div>
            Halaman <span className="text-white font-bold">{page}</span> dari <span className="text-white font-bold">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-200 disabled:opacity-40 transition-colors"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-200 disabled:opacity-40 transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AdminUserActionModal
        isOpen={modalState.isOpen}
        actionType={modalState.actionType}
        targetUser={modalState.targetUser}
        loading={modalState.loading}
        onClose={() => setModalState({ isOpen: false, actionType: 'suspend', targetUser: null, loading: false })}
        onConfirm={handleActionConfirm}
      />
    </div>
  )
}
