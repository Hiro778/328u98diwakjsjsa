import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import {
  fetchAdminSupportTicketDetail,
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
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
          URGENT
        </span>
      )
    case 'high':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          HIGH
        </span>
      )
    case 'low':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/15 text-gray-400 border border-gray-500/30">
          LOW
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
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
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
          Baru (New)
        </span>
      )
    case 'in_progress':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          Sedang Diproses (In Progress)
        </span>
      )
    case 'waiting_user':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
          Menunggu Respon User
        </span>
      )
    case 'resolved':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          Terselesaikan (Resolved)
        </span>
      )
    case 'closed':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-600/20 text-gray-400 border border-gray-600/30">
          Ditutup (Closed)
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/15 text-gray-300 border border-gray-500/30">
          {status}
        </span>
      )
  }
}

export default function AdminSupportDetailPage() {
  const params = useParams()
  const ticketId = params.id || params.ticketId
  const navigate = useNavigate()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    loading: false,
  })

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { detail: data, error: fetchErr } = await fetchAdminSupportTicketDetail(ticketId)
    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat detail tiket support.')
    } else {
      setDetail(data)
    }
    setLoading(false)
  }, [ticketId])

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

  const handleConfirmAction = async ({ status, priority, adminNote, reason }) => {
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
      setModalState({ isOpen: false, loading: false })
      loadDetail()
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message || 'Gagal memperbarui tiket support.',
      })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-6 w-32 bg-[#1F2937]/50 rounded animate-pulse" />
        <div className="h-32 bg-[#111827] border border-[#1F2937] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-[#111827] border border-[#1F2937] rounded-xl animate-pulse" />
          <div className="h-40 bg-[#111827] border border-[#1F2937] rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !detail?.ticket) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="text-red-400 font-semibold text-lg">
          {error || 'Tiket support tidak ditemukan.'}
        </div>
        <p className="text-gray-400 text-xs">
          Pastikan ID tiket support benar dan akun Anda memiliki izin administratif.
        </p>
        <button
          onClick={() => navigate('/admin/support')}
          className="px-4 py-2 bg-[#1F2937] hover:bg-[#374151] text-white text-xs font-semibold rounded-lg transition cursor-pointer"
        >
          ← Kembali ke Daftar Support
        </button>
      </div>
    )
  }

  const { ticket, user, business, audit_logs: auditLogs } = detail

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/support"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
        >
          ← Kembali ke Daftar Support
        </Link>
        <button
          onClick={() => setModalState({ isOpen: true, loading: false })}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-lg shadow-indigo-600/20"
        >
          Ubah Status / Catatan
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

      {/* Main Ticket Card */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1F2937] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#1F2937] text-gray-300">
                {ticket.category || 'Lainnya'}
              </span>
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-2">
              {ticket.subject || '(Tanpa Judul)'}
            </h1>
            <div className="text-gray-500 font-mono text-xs">
              ID Tiket: {ticket.id}
            </div>
          </div>

          <div className="text-right text-xs text-gray-400 space-y-1 self-start sm:self-auto">
            <div>Diajukan: {formatDate(ticket.created_at)}</div>
            <div className="text-gray-500">Terakhir Diperbarui: {formatDate(ticket.updated_at)}</div>
          </div>
        </div>

        {/* Message / Description */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Isi Keluhan / Masalah Pengguna:
          </div>
          <div className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
            {ticket.description || '(Tidak ada deskripsi keluhan)'}
          </div>
        </div>

        {/* Page URL and Screenshot attachment if available */}
        {(ticket.page_url || ticket.screenshot_url) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {ticket.page_url && (
              <div className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 space-y-1 text-xs">
                <div className="text-gray-400 font-medium">Halaman Terkait:</div>
                <div className="text-indigo-400 font-mono text-[11px] truncate">
                  {ticket.page_url}
                </div>
              </div>
            )}

            {ticket.screenshot_url && (
              <div className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 space-y-1 text-xs">
                <div className="text-gray-400 font-medium">Lampiran Tangkapan Layar:</div>
                <a
                  href={ticket.screenshot_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline text-[11px] truncate inline-block"
                >
                  Lihat Lampiran Screenshot ↗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Admin Note Box */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Catatan Penanganan Tim Support (admin_note):
            </span>
            <button
              onClick={() => setModalState({ isOpen: true, loading: false })}
              className="text-indigo-400 hover:text-indigo-300 text-xs cursor-pointer"
            >
              Ubah Catatan
            </button>
          </div>
          <div className="bg-[#0B0F19] border border-indigo-500/20 rounded-lg p-3 text-xs text-gray-300">
            {ticket.admin_note ? (
              <div className="whitespace-pre-wrap">{ticket.admin_note}</div>
            ) : (
              <span className="text-gray-500 italic">Belum ada catatan internal dari admin.</span>
            )}
          </div>
        </div>
      </div>

      {/* User Context & Business Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Card */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1F2937] pb-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Konteks Pengguna (User)
            </h2>
            {user?.id && (
              <Link
                to={`/admin/users/${user.id}`}
                className="text-xs text-indigo-400 hover:underline"
              >
                Lihat Profil Admin →
              </Link>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Nama Lengkap:</span>
              <span className="text-white font-medium">{user?.full_name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Email:</span>
              <span className="text-white font-mono">{user?.email || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">User ID:</span>
              <span className="text-gray-500 font-mono text-[11px]">{ticket.user_id}</span>
            </div>
          </div>
        </div>

        {/* Business Card */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1F2937] pb-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Konteks Bisnis (Business)
            </h2>
            {business?.id && (
              <Link
                to={`/admin/businesses/${business.id}`}
                className="text-xs text-indigo-400 hover:underline"
              >
                Lihat Bisnis Admin →
              </Link>
            )}
          </div>
          <div className="space-y-2 text-xs">
            {business ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nama Bisnis:</span>
                  <span className="text-white font-medium">{business.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Business ID:</span>
                  <span className="text-gray-500 font-mono text-[11px]">{business.id}</span>
                </div>
              </>
            ) : (
              <div className="text-gray-500 italic py-2">
                Tiket diajukan tanpa mengaitkan entitas bisnis spesifik.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Trail Section */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider border-b border-[#1F2937] pb-2">
          Jejak Audit Perubahan Tiket (Audit Logs)
        </h2>

        {!auditLogs || auditLogs.length === 0 ? (
          <div className="text-gray-500 text-xs italic py-3 text-center">
            Belum ada catatan audit log administratif untuk tiket ini.
          </div>
        ) : (
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-400">{log.action}</span>
                  <span className="text-gray-500 text-[10px]">{formatDate(log.created_at)}</span>
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Alasan:</span> {log.reason || '—'}
                </div>
                {log.metadata && (
                  <div className="text-[11px] text-gray-400 font-mono pt-1">
                    Status: {log.metadata.old_status} → {log.metadata.new_status}
                    {log.metadata.old_priority && (
                      <> | Prioritas: {log.metadata.old_priority} → {log.metadata.new_priority}</>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      <AdminSupportActionModal
        isOpen={modalState.isOpen}
        ticket={{ ...ticket, user, business }}
        onClose={() => setModalState({ isOpen: false, loading: false })}
        onConfirm={handleConfirmAction}
        loading={modalState.loading}
      />
    </div>
  )
}
