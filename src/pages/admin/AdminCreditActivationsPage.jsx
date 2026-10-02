// src/pages/admin/AdminCreditActivationsPage.jsx
// BisnisSehat Admin - Manual AI Credit Sales & Activation Link Management
// Strictly conforms to load.md Sections 7, 8, 9

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  adminGenerateCreditActivation,
  getAdminCreditActivations,
  getAdminUserBusinesses,
  adminCancelCreditActivation,
  buildCreditActivationUrl,
} from '../../services/creditActivationService'

const PACKAGES = [
  { key: 'starter', name: 'Starter', credits: 100, priceIdr: 25000 },
  { key: 'growth', name: 'Growth', credits: 500, priceIdr: 100000 },
  { key: 'pro', name: 'Pro', credits: 1000, priceIdr: 175000 },
  { key: 'business', name: 'Business', credits: 3000, priceIdr: 450000 },
]

export default function AdminCreditActivationsPage() {
  const [activations, setActivations] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successToast, setSuccessToast] = useState(null)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 15

  // Generation Modal States
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [step, setStep] = useState(1) // 1: form, 2: confirm, 3: success

  // Form selections
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [userSearchResults, setUserSearchResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

  const [userBusinesses, setUserBusinesses] = useState([])
  const [loadingBusinesses, setLoadingBusinesses] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState(null)

  const [selectedPackageKey, setSelectedPackageKey] = useState('growth')
  const [generating, setGenerating] = useState(false)
  const [newActivationResult, setNewActivationResult] = useState(null)
  const [copied, setCopied] = useState(false)

  // Cancellation State
  const [cancellingId, setCancellingId] = useState(null)

  const fetchActivations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const offset = (page - 1) * limit
      const data = await getAdminCreditActivations({
        search,
        status: statusFilter,
        limit,
        offset,
      })
      setActivations(data?.items || [])
      setTotal(data?.total || 0)
    } catch (err) {
      console.error('Error fetching credit activations:', err)
      setError(err.message || 'Gagal mengambil data aktivasi kredit')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, limit])

  useEffect(() => {
    fetchActivations()
  }, [fetchActivations])

  // Search users for generation form
  const handleSearchUsers = async (q) => {
    setUserSearchQuery(q)
    if (!q || q.trim().length < 2) {
      setUserSearchResults([])
      return
    }

    try {
      setSearchingUsers(true)
      const { data, error: searchErr } = await supabase.rpc('get_admin_users', {
        p_search: q.trim(),
        p_plan_filter: 'all',
        p_status_filter: 'all',
        p_sort_by: 'newest',
        p_limit: 10,
        p_offset: 0,
      })

      if (!searchErr && data?.users) {
        setUserSearchResults(data.users)
      } else {
        // Fallback: search profiles directly
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .or(`email.ilike.%${q.trim()}%,full_name.ilike.%${q.trim()}%`)
          .limit(10)
        setUserSearchResults(profiles || [])
      }
    } catch (err) {
      console.error('User search error:', err)
    } finally {
      setSearchingUsers(false)
    }
  }

  // When a user is picked, load their businesses
  const handleSelectUser = async (u) => {
    setSelectedUser(u)
    setUserSearchResults([])
    setUserSearchQuery('')
    setSelectedBusiness(null)

    try {
      setLoadingBusinesses(true)
      const businesses = await getAdminUserBusinesses(u.id)
      setUserBusinesses(businesses)
      if (businesses.length > 0) {
        setSelectedBusiness(businesses[0])
      }
    } catch (err) {
      console.error('Error loading businesses for user:', err)
      setUserBusinesses([])
    } finally {
      setLoadingBusinesses(false)
    }
  }

  const handleOpenGenerate = () => {
    setShowGenerateModal(true)
    setStep(1)
    setSelectedUser(null)
    setSelectedBusiness(null)
    setUserBusinesses([])
    setSelectedPackageKey('growth')
    setNewActivationResult(null)
    setCopied(false)
    setError(null)
  }

  const handleProceedToConfirm = (e) => {
    e.preventDefault()
    if (!selectedUser) {
      setError('Pilih pengguna terlebih dahulu.')
      return
    }
    if (!selectedBusiness) {
      setError('Pilih bisnis pengguna terlebih dahulu.')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleExecuteGenerate = async () => {
    try {
      setGenerating(true)
      setError(null)

      const result = await adminGenerateCreditActivation({
        profileId: selectedUser.id,
        businessId: selectedBusiness.id,
        packageKey: selectedPackageKey,
      })

      setNewActivationResult(result)
      setStep(3)
      fetchActivations()
      setSuccessToast('Link aktivasi AI Credit berhasil dibuat!')
      setTimeout(() => setSuccessToast(null), 4000)
    } catch (err) {
      console.error('Generate activation error:', err)
      setError(err.message || 'Gagal menghasilkan link aktivasi')
    } finally {
      setGenerating(false)
    }
  }

  const handleCancelActivation = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin membatalkan link aktivasi ini?')) return

    try {
      setCancellingId(id)
      await adminCancelCreditActivation(id)
      setSuccessToast('Aktivasi berhasil dibatalkan.')
      setTimeout(() => setSuccessToast(null), 3000)
      fetchActivations()
    } catch (err) {
      console.error('Error cancelling activation:', err)
      setError(err.message || 'Gagal membatalkan aktivasi')
    } finally {
      setCancellingId(null)
    }
  }

  const handleCopyLink = () => {
    if (!newActivationResult?.token) return
    const fullUrl = buildCreditActivationUrl(newActivationResult.token)
    navigator.clipboard.writeText(fullUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const currentPkg = PACKAGES.find((p) => p.key === selectedPackageKey) || PACKAGES[1]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            Aktivasi Kredit AI
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Penjualan manual & penerbitan link aktivasi kredit 1x pakai (24 jam) untuk pelanggan.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenGenerate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate Activation Link
        </button>
      </div>

      {/* Toast Notifications */}
      {successToast && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successToast}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari berdasarkan email, nama, bisnis, atau paket..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="all">Semua Status</option>
          <option value="PENDING">PENDING</option>
          <option value="USED">USED</option>
          <option value="EXPIRED">EXPIRED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </div>

      {/* Activations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Memuat daftar aktivasi kredit...
          </div>
        ) : activations.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Belum ada data aktivasi kredit yang cocok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase font-medium border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">ID / Identifier</th>
                  <th className="px-5 py-3">Pengguna</th>
                  <th className="px-5 py-3">Bisnis</th>
                  <th className="px-5 py-3">Paket</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Dibuat</th>
                  <th className="px-5 py-3">Kedaluwarsa</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {activations.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      {item.masked_identifier}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-white">{item.user?.full_name || '—'}</div>
                      <div className="text-xs text-slate-400">{item.user?.email || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">
                      {item.business?.name || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{item.package_name}</div>
                      <div className="text-xs text-blue-400">+{item.credit_amount} Credits</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          item.status === 'USED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : item.status === 'EXPIRED'
                            ? 'bg-slate-800 text-slate-400 border border-slate-700'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(item.expires_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {item.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={cancellingId === item.id}
                          onClick={() => handleCancelActivation(item.id)}
                          className="px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-md transition-colors border border-rose-500/30"
                        >
                          {cancellingId === item.id ? '...' : 'Batalkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between p-4 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total} data
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* GENERATION MODAL */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 sm:p-7 space-y-6 shadow-2xl relative text-left">
            {/* Modal Header */}
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {step === 1 && 'Pilih Pengguna & Paket Kredit'}
                  {step === 2 && 'Konfirmasi Pembuatan Link'}
                  {step === 3 && 'Link Aktivasi Siap Dikirim!'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {step === 1 && 'Pilih customer yang telah membayar dan paket kredit yang dibeli.'}
                  {step === 2 && 'Periksa rincian sebelum link aktivasi one-time dibuat.'}
                  {step === 3 && 'Salin dan kirim link ini langsung ke customer melalui WhatsApp.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: FORM */}
            {step === 1 && (
              <form onSubmit={handleProceedToConfirm} className="space-y-4">
                {/* User Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Pilih Pengguna / Customer
                  </label>
                  {selectedUser ? (
                    <div className="flex items-center justify-between p-3 bg-slate-950 border border-blue-500/40 rounded-xl">
                      <div>
                        <div className="text-sm font-semibold text-white">{selectedUser.full_name || 'Tanpa Nama'}</div>
                        <div className="text-xs text-slate-400">{selectedUser.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUser(null)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ketik email atau nama customer..."
                        value={userSearchQuery}
                        onChange={(e) => handleSearchUsers(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      {searchingUsers && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          Mencari...
                        </div>
                      )}
                      {userSearchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto z-10 shadow-xl divide-y divide-slate-800/60">
                          {userSearchResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleSelectUser(u)}
                              className="w-full text-left p-2.5 hover:bg-slate-800/60 transition-colors"
                            >
                              <div className="text-sm text-white font-medium">{u.full_name || 'Tanpa Nama'}</div>
                              <div className="text-xs text-slate-400">{u.email}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Business Picker */}
                {selectedUser && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Pilih Bisnis Customer
                    </label>
                    {loadingBusinesses ? (
                      <div className="text-xs text-slate-400 p-2.5 bg-slate-950 rounded-xl">Memuat bisnis...</div>
                    ) : userBusinesses.length === 0 ? (
                      <div className="text-xs text-rose-400 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        Pengguna ini belum memiliki data bisnis.
                      </div>
                    ) : (
                      <select
                        value={selectedBusiness?.id || ''}
                        onChange={(e) => {
                          const b = userBusinesses.find((x) => x.id === e.target.value)
                          setSelectedBusiness(b)
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                      >
                        {userBusinesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Package Picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Pilih Paket AI Credit
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {PACKAGES.map((pkg) => (
                      <button
                        key={pkg.key}
                        type="button"
                        onClick={() => setSelectedPackageKey(pkg.key)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedPackageKey === pkg.key
                            ? 'bg-blue-600/15 border-blue-500 text-white ring-1 ring-blue-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-sm font-bold text-white">{pkg.name}</div>
                        <div className="text-xs text-blue-400 font-semibold mt-0.5">
                          +{pkg.credits.toLocaleString('id-ID')} Credits
                        </div>
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          Rp{pkg.priceIdr.toLocaleString('id-ID')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Status Info */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span>Status Pembayaran: <strong>Pembayaran diverifikasi manual</strong></span>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedUser || !selectedBusiness}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
                  >
                    Lanjut Konfirmasi
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: CONFIRMATION */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Pengguna</span>
                    <span className="font-semibold text-white">{selectedUser?.email}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Bisnis</span>
                    <span className="font-semibold text-white">{selectedBusiness?.name}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800/80 pt-2">
                    <span>Paket</span>
                    <span className="font-semibold text-white">{currentPkg.name}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Jumlah Kredit</span>
                    <span className="font-bold text-emerald-400">+{currentPkg.credits} Credits</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Harga Terverifikasi</span>
                    <span className="font-bold text-white">Rp{currentPkg.priceIdr.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800/80 pt-2">
                    <span>Masa Berlaku Link</span>
                    <span className="font-semibold text-amber-400">24 Jam (One-Time Use)</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                  ⚠️ Pastikan dana pembayaran dari pelanggan telah masuk dan diverifikasi sebelum membuat link aktivasi. Link ini hanya dapat digunakan 1 kali oleh akun yang dipilih.
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={generating}
                    onClick={handleExecuteGenerate}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Membuat Link...
                      </>
                    ) : (
                      'Generate Activation Link'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: SUCCESS RESULT */}
            {step === 3 && newActivationResult && (
              <div className="space-y-5">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-300 flex items-center gap-2">
                  <svg className="w-5 h-5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Activation berhasil dibuat.</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Kedaluwarsa:</span>
                    <span className="text-white font-mono">
                      {new Date(newActivationResult.expires_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })} (24 Jam)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paket:</span>
                    <span className="text-white font-semibold">{newActivationResult.package_name} (+{newActivationResult.credit_amount} Credits)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Activation Link:
                  </label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <input
                      type="text"
                      readOnly
                      value={buildCreditActivationUrl(newActivationResult.token)}
                      className="bg-transparent text-xs text-slate-300 w-full font-mono outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                        copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                      }`}
                    >
                      {copied ? 'Tersalin!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Penting: Token mentah ini hanya ditampilkan sekarang dan tidak akan disimpan dalam bentuk teks biasa. Kirimkan link ini ke WhatsApp customer.
                </p>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowGenerateModal(false)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    Selesai & Tutup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
