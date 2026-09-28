import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { fetchAdminUserDetail, updateAdminUserStatus } from '../../services/adminUserService.js'
import { useAdminAuth } from '../../hooks/useAdminAuth.js'
import AdminUserActionModal from '../../components/admin/AdminUserActionModal.jsx'

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

export default function AdminUserDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSuperAdmin } = useAdminAuth()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    actionType: 'suspend',
    targetUser: null,
    loading: false,
  })

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { detail: data, error: fetchErr } = await fetchAdminUserDetail(id)
    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat detail pengguna.')
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

  const openActionModal = (actionType) => {
    if (!detail?.profile) return
    setModalState({
      isOpen: true,
      actionType,
      targetUser: {
        id: detail.profile.id,
        name: detail.profile.name,
        email: detail.profile.email,
        business_name: detail.business?.name,
      },
      loading: false,
    })
  }

  const handleActionConfirm = async ({ targetUserId, newStatus, reason }) => {
    setModalState((prev) => ({ ...prev, loading: true }))
    const res = await updateAdminUserStatus({ targetUserId, newStatus, reason })

    if (res.success) {
      setFeedback({ type: 'success', message: `Status berhasil diperbarui ke ${newStatus}.` })
      setModalState({ isOpen: false, actionType: 'suspend', targetUser: null, loading: false })
      loadDetail()
    } else {
      setFeedback({ type: 'error', message: res.error?.message || 'Gagal memperbarui status.' })
      setModalState((prev) => ({ ...prev, loading: false }))
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-3 border-b border-[#1F2937] pb-4">
          <div className="w-10 h-10 rounded-full bg-gray-800" />
          <div className="space-y-2">
            <div className="w-48 h-5 bg-gray-800 rounded" />
            <div className="w-32 h-3 bg-gray-800/60 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-4">
              <div className="w-28 h-4 bg-gray-800 rounded" />
              <div className="space-y-2">
                <div className="w-full h-3 bg-gray-800/40 rounded" />
                <div className="w-full h-3 bg-gray-800/40 rounded" />
                <div className="w-3/4 h-3 bg-gray-800/40 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !detail?.profile) {
    return (
      <div className="p-8 rounded-xl bg-[#111827] border border-[#1F2937] text-center max-w-lg mx-auto space-y-4 mt-8 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          ✕
        </div>
        <div className="text-white font-semibold text-sm">Gagal Memuat Detail Pengguna</div>
        <div className="text-red-400 text-xs">{error || 'Pengguna tidak ditemukan'}</div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => loadDetail()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            Coba Lagi
          </button>
          <button
            onClick={() => navigate('/admin/users')}
            className="px-4 py-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 hover:text-white text-xs transition-colors"
          >
            Kembali ke Daftar
          </button>
        </div>
      </div>
    )
  }

  const { profile, business, subscription, ai_usage, support, security, audit_logs } = detail

  return (
    <div className="space-y-6">
      {/* Top Bar with Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/users"
            className="p-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 hover:text-white transition-colors"
            title="Kembali ke Daftar Pengguna"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-[#1F2937]"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
              {profile.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{profile.name}</h1>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  profile.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : profile.status === 'suspended'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : profile.status === 'banned'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {profile.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{profile.email} • ID: {profile.id}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {profile.status === 'suspended' ? (
            <button
              onClick={() => openActionModal('unsuspend')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition-colors"
            >
              Unsuspend
            </button>
          ) : profile.status === 'active' ? (
            <button
              onClick={() => openActionModal('suspend')}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/20 transition-colors"
            >
              Suspend User
            </button>
          ) : null}

          {profile.status === 'banned' ? (
            <button
              onClick={() => openActionModal('unban')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/20 transition-colors"
            >
              Unban User
            </button>
          ) : profile.status !== 'deleted' ? (
            <button
              onClick={() => openActionModal('ban')}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/20 transition-colors"
            >
              Ban User
            </button>
          ) : null}

          {isSuperAdmin && profile.status !== 'deleted' && (
            <button
              onClick={() => openActionModal('delete')}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition-colors"
            >
              Delete (Soft)
            </button>
          )}
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

      {/* Grid of 6 Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. PROFILE */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">1. Profil Pengguna</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Nama Lengkap</span>
              <span className="text-white font-medium">{profile.full_name || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Email</span>
              <span className="text-white font-mono">{profile.email}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">User ID</span>
              <span className="text-gray-300 font-mono text-[11px]">{profile.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Avatar</span>
              <span className="text-white font-mono text-[11px] truncate max-w-[200px]">
                {profile.avatar_url || 'Inisial otomatis'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Waktu Terdaftar</span>
              <span className="text-white">{formatDate(profile.created_at)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Aktivitas Terakhir</span>
              <span className="text-white">{formatDate(profile.last_active)}</span>
            </div>
          </div>
        </div>

        {/* 2. BUSINESS */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">2. Entitas Bisnis</h2>
            <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {detail.business_count ?? (detail.businesses?.length ?? (business ? 1 : 0))} Bisnis
            </span>
          </div>
          {detail.businesses && detail.businesses.length > 0 ? (
            <div className="space-y-3">
              {detail.businesses.map((biz) => (
                <div key={biz.id} className="p-3 bg-[#0B0F19] border border-[#1F2937] rounded-lg space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold text-sm">{biz.name}</span>
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">{biz.status}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 font-mono">ID: {biz.id}</div>
                  <div className="flex items-center justify-between text-gray-400 text-[11px]">
                    <span>{biz.type} • {biz.category}</span>
                    <span>{biz.location || '—'}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">Dibuat: {formatDate(biz.created_at)}</div>
                </div>
              ))}
            </div>
          ) : business ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Nama Bisnis</span>
                <span className="text-white font-medium">{business.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Business ID</span>
                <span className="text-gray-300 font-mono text-[11px]">{business.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Tipe / Kategori</span>
                <span className="text-white">{business.type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Status Bisnis</span>
                <span className="text-emerald-400 font-semibold uppercase text-[10px]">{business.status}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Dibuat</span>
                <span className="text-white">{formatDate(business.created_at)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4">Belum ada bisnis yang terdaftar untuk akun ini.</p>
          )}
        </div>

        {/* 3. SUBSCRIPTION */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">3. Langganan & Pembayaran</h2>
          {subscription ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Plan</span>
                <span className="text-white font-bold uppercase">{subscription.plan}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Status Entitlement</span>
                <span className="text-white font-semibold">{subscription.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Mulai Langganan</span>
                <span className="text-white">{formatDate(subscription.start_date)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Berakhir (Expiry)</span>
                <span className="text-white">{formatDate(subscription.expiry_date)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Histori Pembayaran Terakhir</span>
                <span className="text-white font-mono uppercase">{subscription.payment_status}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4">Tidak ada data langganan (Free Tier).</p>
          )}
        </div>

        {/* 4. AI USAGE */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">4. Penggunaan AI</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Kredit Diperoleh (Total)</span>
              <span className="text-white font-mono">{ai_usage?.total_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Kredit Digunakan</span>
              <span className="text-amber-400 font-mono">{ai_usage?.used_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Sisa Kredit</span>
              <span className="text-emerald-400 font-mono font-bold">{ai_usage?.remaining_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Permintaan (Total / Sukses / Gagal)</span>
              <span className="text-white font-mono">
                {ai_usage?.requests_total ?? 0} / {ai_usage?.requests_success ?? 0} / {ai_usage?.requests_failed ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* 5. SUPPORT */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">5. Support Tickets</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Total Tiket Keluhan</span>
              <span className="text-white font-bold">{support?.total_tickets ?? 0}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Tiket Terbuka (Open)</span>
              <span className="text-amber-400 font-bold">{support?.open_tickets ?? 0}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Tiket Selesai (Resolved)</span>
              <span className="text-emerald-400 font-bold">{support?.resolved_tickets ?? 0}</span>
            </div>
          </div>
        </div>

        {/* 6. SECURITY & AUDIT TRAIL */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">6. Keamanan & Status Akun</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Account Status</span>
              <span className="text-white font-bold uppercase">{security?.account_status}</span>
            </div>
            {security?.status_reason && (
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Alasan Tindakan Terakhir</span>
                <span className="text-amber-300 font-medium italic">{security.status_reason}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Aktivitas Terakhir</span>
              <span className="text-white">{formatDate(security?.last_login)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Relevant Audit Logs for this User */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
          <span>Riwayat Audit Trail Pengguna Ini (Database)</span>
          <span className="text-[10px] text-gray-500 font-mono">Limit 10 entri</span>
        </h2>

        {audit_logs?.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-3">Belum ada riwayat tindakan admin yang tercatat untuk pengguna ini.</p>
        ) : (
          <div className="divide-y divide-[#1F2937] text-xs">
            {audit_logs.map((log) => (
              <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <span className="font-mono text-emerald-400 font-semibold">{log.action}</span>
                  {log.reason && (
                    <span className="text-gray-300 ml-2 italic">— &quot;{log.reason}&quot;</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 font-mono">
                  {formatDate(log.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
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
