import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { fetchAdminBusinessDetail, updateAdminBusinessStatus } from '../../services/adminBusinessService.js'
import AdminBusinessActionModal from '../../components/admin/AdminBusinessActionModal.jsx'

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

export default function AdminBusinessDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Action Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    targetBusiness: null,
    loading: false,
  })

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { detail: data, error: fetchErr } = await fetchAdminBusinessDetail(id)
    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat detail bisnis.')
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

  const openActionModal = () => {
    if (!detail?.business) return
    setModalState({
      isOpen: true,
      targetBusiness: {
        id: detail.business.id,
        name: detail.business.name,
        is_active: detail.business.is_active,
        owner_name: detail.owner?.name,
        owner_email: detail.owner?.email,
      },
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
          <div className="w-12 h-12 rounded-lg bg-gray-800" />
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

  if (error || !detail?.business) {
    return (
      <div className="p-8 rounded-xl bg-[#111827] border border-[#1F2937] text-center max-w-lg mx-auto space-y-4 mt-8 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          ✕
        </div>
        <div className="text-white font-semibold text-sm">Gagal Memuat Detail Bisnis</div>
        <div className="text-red-400 text-xs">{error || 'Bisnis tidak ditemukan'}</div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => loadDetail()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            Coba Lagi
          </button>
          <button
            onClick={() => navigate('/admin/businesses')}
            className="px-4 py-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 hover:text-white text-xs transition-colors"
          >
            Kembali ke Daftar
          </button>
        </div>
      </div>
    )
  }

  const { business, owner, subscription, products, orders, ai_usage, support, audit_logs } = detail

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
        <Link to="/admin" className="hover:text-white transition-colors">Admin</Link>
        <span className="text-gray-600">/</span>
        <Link to="/admin/businesses" className="hover:text-white transition-colors">Businesses</Link>
        <span className="text-gray-600">/</span>
        <span className="text-emerald-400 font-semibold truncate max-w-[240px]">{business.name}</span>
      </nav>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div className="flex items-center gap-3.5">
          <Link
            to="/admin/businesses"
            className="p-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 hover:text-white transition-colors"
            title="Kembali ke Daftar Bisnis"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="w-12 h-12 rounded-xl object-cover border border-[#1F2937]"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-base">
              {business.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{business.name}</h1>
              <span
                className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  business.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {business.is_active ? 'Active' : 'Inactive'}
              </span>
              {business.is_menu_published && (
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  QR Menu Published
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              ID: {business.id} • {business.business_type} ({business.business_category})
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={openActionModal}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              business.is_active
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
            }`}
          >
            {business.is_active ? 'Nonaktifkan Bisnis' : 'Aktifkan Bisnis'}
          </button>
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

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. INFORMASI BISNIS */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">1. Informasi Entitas Bisnis</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Nama Bisnis</span>
              <span className="text-white font-medium">{business.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Tipe & Kategori</span>
              <span className="text-white">{business.business_type} • {business.business_category}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Lokasi</span>
              <span className="text-white">{business.location || '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Deskripsi</span>
              <span className="text-gray-300 italic">{business.description || 'Tidak ada deskripsi.'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Terdaftar</span>
              <span className="text-white">{formatDate(business.created_at)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Terakhir Diperbarui</span>
              <span className="text-white">{formatDate(business.updated_at)}</span>
            </div>
          </div>
        </div>

        {/* 2. PROFIL PEMILIK (OWNER) */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">2. Pemilik Akun (Owner)</h2>
          {owner ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Nama Lengkap</span>
                <Link to={`/admin/users/${owner.id}`} className="text-emerald-400 hover:underline font-medium">
                  {owner.name} ↗
                </Link>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Email</span>
                <span className="text-white font-mono">{owner.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Owner User ID</span>
                <span className="text-gray-300 font-mono text-[11px]">{owner.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Status Akun Owner</span>
                <span className="text-white uppercase font-bold text-[10px]">{owner.status}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Terdaftar Sebagai User</span>
                <span className="text-white">{formatDate(owner.created_at)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4">Data owner tidak ditemukan atau akun telah dihapus.</p>
          )}
        </div>

        {/* 3. SUBSCRIPTION & PLAN */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">3. Status Langganan Bisnis</h2>
          {subscription ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#1F2937]">
                <span className="text-gray-400">Paket Langganan</span>
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
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Masa Berlaku (Expiry)</span>
                <span className="text-white">{formatDate(subscription.expiry_date)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4">Tidak ada data langganan (Free Tier).</p>
          )}
        </div>

        {/* 4. PRODUK OVERVIEW */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">4. Katalog Produk</h2>
            <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {products?.total_count ?? 0} Produk ({products?.active_count ?? 0} Aktif)
            </span>
          </div>
          {products?.recent_items && products.recent_items.length > 0 ? (
            <div className="space-y-2">
              {products.recent_items.map((pr) => (
                <div key={pr.id} className="p-2.5 bg-[#0B0F19] border border-[#1F2937] rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <div className="text-white font-medium">{pr.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">ID: {pr.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 font-mono">{formatRupiah(pr.price)}</div>
                    <div className="text-[10px] text-gray-400">{pr.is_available !== false ? 'Tersedia' : 'Habis'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-4">Belum ada produk yang didaftarkan pada bisnis ini.</p>
          )}
        </div>

        {/* 5. ORDERS & POS */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">5. Transaksi & Pesanan Kasir</h2>
            <span className="text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {orders?.total_orders ?? 0} Transaksi
            </span>
          </div>
          <div className="p-3 bg-[#0B0F19] border border-[#1F2937] rounded-lg flex justify-between items-center text-xs">
            <span className="text-gray-400">Total Omzet Transaksi Selesai</span>
            <span className="text-white font-bold font-mono text-sm">{formatRupiah(orders?.total_revenue ?? 0)}</span>
          </div>
          {orders?.recent_orders && orders.recent_orders.length > 0 ? (
            <div className="space-y-2">
              {orders.recent_orders.map((ord) => (
                <div key={ord.id} className="p-2 bg-[#0B0F19] border border-[#1F2937] rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <div className="text-white font-mono">{formatRupiah(ord.total_amount)}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{formatDate(ord.created_at)}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold text-gray-300 bg-gray-800">
                    {ord.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic py-2">Belum ada catatan transaksi pesanan.</p>
          )}
        </div>

        {/* 6. AI USAGE */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">6. Kuota & Penggunaan AI</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Total Kredit AI Diperoleh</span>
              <span className="text-white font-mono">{ai_usage?.total_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Kredit Digunakan</span>
              <span className="text-amber-400 font-mono">{ai_usage?.used_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Sisa Kredit Tersedia</span>
              <span className="text-emerald-400 font-mono font-bold">{ai_usage?.remaining_credits ?? 0} credits</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Total Request Generasi</span>
              <span className="text-white font-mono">{ai_usage?.requests_total ?? 0} requests</span>
            </div>
          </div>
        </div>

        {/* 7. SUPPORT TICKETS */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">7. Tiket Layanan & Support</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Total Tiket Keluhan</span>
              <span className="text-white font-mono">{support?.total_tickets ?? 0} tiket</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#1F2937]">
              <span className="text-gray-400">Tiket Terbuka / Pending</span>
              <span className="text-amber-400 font-mono">{support?.open_tickets ?? 0} tiket</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-400">Tiket Selesai / Closed</span>
              <span className="text-emerald-400 font-mono">{support?.resolved_tickets ?? 0} tiket</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. SECURITY EVENTS & AUDIT TRAIL */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
          <span>8. Security Events & Audit Trail</span>
          <span className="text-[10px] text-gray-500 font-mono">Limit 10 entri</span>
        </h2>
        {audit_logs && audit_logs.length > 0 ? (
          <div className="space-y-2">
            {audit_logs.map((al) => (
              <div key={al.id} className="p-3 bg-[#0B0F19] border border-[#1F2937] rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    al.action?.includes('DEACTIVATE') || al.action?.includes('SUSPEND')
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : al.action?.includes('ACTIVATE') || al.action?.includes('RESTORE')
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-gray-800 text-gray-300 border-gray-700'
                  }`}>
                    {al.action}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{formatDate(al.created_at)}</span>
                </div>
                {al.reason && (
                  <div className="text-amber-300/90 text-[11px]">Alasan: {al.reason}</div>
                )}
                <div className="text-[10px] text-gray-500 font-mono">Admin ID: {al.admin_id}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic py-2">Belum ada catatan audit administratif untuk bisnis ini.</p>
        )}
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
