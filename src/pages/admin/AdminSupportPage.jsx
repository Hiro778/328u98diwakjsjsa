import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import {
  fetchAdminSupportTickets,
  fetchAdminSupportStats,
  updateAdminSupportTicket,
} from '../../services/adminSupportService.js'
import AdminSupportActionModal from '../../components/admin/AdminSupportActionModal.jsx'

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

function PriorityBadge({ priority }) {
  const p = (priority || 'medium').toLowerCase()
  switch (p) {
    case 'urgent':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
          URGENT
        </span>
      )
    case 'high':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          HIGH
        </span>
      )
    case 'low':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-500/15 text-gray-400 border border-gray-500/30">
          LOW
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
          MEDIUM
        </span>
      )
  }
}

function StatusBadge({ status }) {
  const s = (status || 'new').toLowerCase()
  switch (s) {
    case 'new':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
          Baru
        </span>
      )
    case 'in_progress':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          Diproses
        </span>
      )
    case 'waiting_user':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
          Menunggu User
        </span>
      )
    case 'resolved':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          Selesai
        </span>
      )
    case 'closed':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-600/20 text-gray-400 border border-gray-600/30">
          Ditutup
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-500/15 text-gray-300 border border-gray-500/30">
          {status}
        </span>
      )
  }
}

export default function AdminSupportPage() {
  const [records, setRecords] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    ticket: null,
    loading: false,
  })

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const { stats: fetchedStats, error: statsErr } = await fetchAdminSupportStats()
    if (!statsErr && fetchedStats) {
      setStats(fetchedStats)
    }
    setStatsLoading(false)
  }, [])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { records: fetchedRecords, totalCount: count, error: fetchErr } = await fetchAdminSupportTickets({
      search,
      statusFilter,
      priorityFilter,
      categoryFilter,
      sortBy,
      limit,
      offset,
    })

    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat catatan tiket support.')
    } else {
      setRecords(fetchedRecords)
      setTotalCount(count)
    }
    setLoading(false)
  }, [search, statusFilter, priorityFilter, categoryFilter, sortBy, page])

  useEffect(() => {
    let isMounted = true
    queueMicrotask(() => {
      if (isMounted) {
        loadStats()
        loadRecords()
      }
    })
    return () => {
      isMounted = false
    }
  }, [loadStats, loadRecords])

  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    loadRecords()
  }

  const handleOpenActionModal = (ticket) => {
    setModalState({
      isOpen: true,
      ticket,
      loading: false,
    })
  }

  const handleConfirmAction = async ({ ticketId, status, priority, adminNote, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await updateAdminSupportTicket({
      ticketId,
      status,
      priority,
      adminNote,
      reason,
    })

    if (res.success) {
      setFeedback({
        type: 'success',
        message: 'Tiket berhasil diperbarui dan tercatat dalam Audit Log.',
      })
      setModalState({ isOpen: false, ticket: null, loading: false })
      loadStats()
      loadRecords()
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message || 'Gagal memperbarui tiket support.',
      })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Support Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Pusat monitoring dan manajemen tiket keluhan pengguna (Admin Control Center — Stage 7).
          </p>
        </div>
        <button
          onClick={() => {
            loadStats()
            loadRecords()
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white bg-[#111827] hover:bg-[#1F2937] border border-[#1F2937] rounded-lg transition cursor-pointer self-start sm:self-auto"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Segarkan Data
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Total Tiket</div>
          <div className="text-2xl font-bold text-white mt-1">
            {statsLoading ? '…' : stats?.total_tickets || 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">Baru (New)</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {statsLoading ? '…' : stats?.new_tickets || 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-sky-400 uppercase tracking-wider">Sedang Diproses</div>
          <div className="text-2xl font-bold text-sky-400 mt-1">
            {statsLoading ? '…' : stats?.in_progress || 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-yellow-400 uppercase tracking-wider">Menunggu User</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">
            {statsLoading ? '…' : stats?.waiting_user || 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Selesai</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {statsLoading ? '…' : stats?.resolved || 0}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <div className="text-[11px] font-medium text-red-400 uppercase tracking-wider">Urgent / Mendesak</div>
          <div className="text-2xl font-bold text-red-400 mt-1">
            {statsLoading ? '…' : stats?.urgent_tickets || 0}
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID tiket, subjek, pesan, email user, atau bisnis..."
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <svg
              className="w-4 h-4 text-gray-500 absolute left-3 top-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="new">Baru</option>
              <option value="in_progress">Diproses</option>
              <option value="waiting_user">Menunggu User</option>
              <option value="resolved">Selesai</option>
              <option value="closed">Ditutup</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value)
                setPage(1)
              }}
              className="bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Semua Prioritas</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                setPage(1)
              }}
              className="bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Semua Kategori</option>
              <option value="Lainnya">Lainnya</option>
              <option value="Akun">Akun</option>
              <option value="Pembayaran">Pembayaran</option>
              <option value="POS">POS Kasir</option>
              <option value="AI">AI Studio</option>
              <option value="Bug">Bug Teknis</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="priority">Prioritas Tertinggi</option>
              <option value="status">Status</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Ticket Table */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-red-400 font-semibold">{error}</div>
            <button
              onClick={loadRecords}
              className="px-4 py-2 bg-[#1F2937] hover:bg-[#374151] text-white text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : loading ? (
          <div className="p-8 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-[#1F2937]/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <svg
              className="w-12 h-12 text-gray-600 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <div className="text-gray-300 font-medium text-sm">Tidak ada tiket support ditemukan</div>
            <div className="text-gray-500 text-xs">
              {search || statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all'
                ? 'Coba sesuaikan kata kunci pencarian atau filter status/prioritas.'
                : 'Belum ada tiket support yang diajukan oleh pengguna.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B0F19] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#1F2937]">
                <tr>
                  <th className="px-4 py-3">Tiket & Pengguna</th>
                  <th className="px-4 py-3">Subjek & Kategori</th>
                  <th className="px-4 py-3">Prioritas</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {records.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-[#1F2937]/30 transition">
                    <td className="px-4 py-3 space-y-1">
                      <div className="font-semibold text-white">
                        {ticket.user?.full_name || ticket.user?.email || '—'}
                      </div>
                      <div className="text-gray-400 text-[11px]">{ticket.user?.email || '—'}</div>
                      {ticket.business?.name && (
                        <div className="text-cyan-400 text-[11px] truncate max-w-[200px]">
                          Bisnis: {ticket.business.name}
                        </div>
                      )}
                      <div className="text-gray-500 font-mono text-[10px] truncate max-w-[140px]">
                        ID: {ticket.id}
                      </div>
                    </td>

                    <td className="px-4 py-3 space-y-1 max-w-[280px]">
                      <div className="font-semibold text-white truncate">
                        {ticket.subject || '(Tanpa Judul)'}
                      </div>
                      <div className="text-gray-400 text-[11px] line-clamp-2">
                        {ticket.description || '—'}
                      </div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#1F2937] text-gray-300">
                        {ticket.category || 'Lainnya'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <PriorityBadge priority={ticket.priority} />
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>

                    <td className="px-4 py-3 space-y-0.5 text-gray-400 whitespace-nowrap">
                      <div>Dibuat: {formatDate(ticket.created_at)}</div>
                      <div className="text-[10px] text-gray-500">Update: {formatDate(ticket.updated_at)}</div>
                    </td>

                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenActionModal(ticket)}
                        className="px-2.5 py-1 text-xs font-medium text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 border border-indigo-500/30 rounded-lg transition cursor-pointer"
                      >
                        Ubah Status
                      </button>
                      <Link
                        to={`/admin/support/${ticket.id}`}
                        className="px-2.5 py-1 text-xs font-medium text-gray-300 hover:text-white bg-[#1F2937] hover:bg-[#374151] rounded-lg transition inline-block"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && totalCount > 0 && (
          <div className="px-4 py-3 bg-[#0B0F19] border-t border-[#1F2937] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <div>
              Menampilkan {Math.min((page - 1) * limit + 1, totalCount)} –{' '}
              {Math.min(page * limit, totalCount)} dari {totalCount} tiket
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#111827] text-gray-300 hover:text-white hover:bg-[#1F2937] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                ← Sebelumnya
              </button>
              <span className="text-white font-medium">
                Halaman {page} dari {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#111827] text-gray-300 hover:text-white hover:bg-[#1F2937] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      <AdminSupportActionModal
        isOpen={modalState.isOpen}
        ticket={modalState.ticket}
        onClose={() => setModalState({ isOpen: false, ticket: null, loading: false })}
        onConfirm={handleConfirmAction}
        loading={modalState.loading}
      />
    </div>
  )
}
