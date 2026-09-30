// src/pages/admin/AdminActivationCodesPage.jsx
// BisnisSehat Admin - PRO Activation Code & QR Management
// Strictly follows @act.md: single-view QR generation, masked listing, server-side audit & RBAC.

import { useState, useEffect, useCallback } from 'react'
import {
  adminGenerateActivationCode,
  getAdminActivationCodes,
} from '../../lib/activationCodeService'
import ActivationQrModal from '../../components/admin/ActivationQrModal'

export default function AdminActivationCodesPage() {
  const [codes, setCodes] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 15

  // Generation Modal States
  const [showGeneratePrompt, setShowGeneratePrompt] = useState(false)
  const [durationDays, setDurationDays] = useState(30)
  const [generating, setGenerating] = useState(false)
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState(null)

  const fetchCodes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const offset = (page - 1) * limit
      const data = await getAdminActivationCodes({
        search,
        status: statusFilter,
        limit,
        offset,
      })
      setCodes(data?.items || [])
      setTotal(data?.total || 0)
    } catch (err) {
      console.error('Error fetching activation codes:', err)
      setError(err.message || 'Gagal mengambil data kode aktivasi')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, limit])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleGenerate = async (e) => {
    e.preventDefault()
    try {
      setGenerating(true)
      setError(null)
      const res = await adminGenerateActivationCode(Number(durationDays))
      setShowGeneratePrompt(false)
      setNewlyGeneratedCode(res)
      fetchCodes()
    } catch (err) {
      console.error('Generate code error:', err)
      setError(err.message || 'Gagal menghasilkan kode aktivasi')
    } finally {
      setGenerating(false)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'unused':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Aktif / Belum Dipakai
          </span>
        )
      case 'redeemed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            Sudah Terpakai
          </span>
        )
      case 'revoked':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            Dicabut (Revoked)
          </span>
        )
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
            Kadaluarsa
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Kode Aktivasi & QR PRO
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola dan buat kode aktivasi paket PRO dengan QR code instan (128-bit CSPRNG entropy).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowGeneratePrompt(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Generate Kode & QR Baru
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-medium text-rose-600 hover:text-rose-800"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-3 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari ID kode, email user, atau nama bisnis..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="w-full sm:w-48 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:bg-white focus:border-emerald-500"
          >
            <option value="all">Semua Status</option>
            <option value="unused">Aktif (Belum Dipakai)</option>
            <option value="redeemed">Sudah Terpakai</option>
            <option value="expired">Kadaluarsa</option>
            <option value="revoked">Dicabut</option>
          </select>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Kode / Identifier</th>
                <th className="px-6 py-3.5">Paket & Durasi</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Dibuat Tanggal</th>
                <th className="px-6 py-3.5">Digunakan Oleh</th>
                <th className="px-6 py-3.5">Tanggal Redeem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mb-2" />
                    <p className="text-xs">Memuat data kode aktivasi...</p>
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="text-sm">Tidak ada kode aktivasi yang cocok dengan pencarian.</p>
                  </td>
                </tr>
              ) : (
                codes.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-sm border border-slate-200">
                        {item.masked_code || 'BS-PRO-••••-••••'}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">ID: {item.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 uppercase">{item.plan}</div>
                      <div className="text-xs text-slate-500">{item.duration_days} Hari</div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {item.redeemed_user?.email ? (
                        <div>
                          <div className="font-medium text-slate-900 text-xs">
                            {item.redeemed_user.full_name || item.redeemed_user.email}
                          </div>
                          <div className="text-[11px] text-slate-400">{item.redeemed_user.email}</div>
                          {item.redeemed_business?.name && (
                            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                              Bisnis: {item.redeemed_business.name}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Belum diklaim</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {item.redeemed_at ? new Date(item.redeemed_at).toLocaleString('id-ID') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {total > limit && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total} data
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Sebelumnya
              </button>
              <span>Halaman {page}</span>
              <button
                type="button"
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-slate-200 rounded-md bg-white hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Generate Prompt */}
      {showGeneratePrompt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Generate Kode Aktivasi PRO</h3>
            <p className="text-xs text-slate-500 mb-5">
              Kode akan dibuat secara aman menggunakan CSPRNG server-side dengan 128-bit entropy.
            </p>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                  Durasi Paket PRO
                </label>
                <select
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-hidden focus:border-emerald-500"
                >
                  <option value={30}>30 Hari (1 Bulan Standar)</option>
                  <option value={90}>90 Hari (3 Bulan)</option>
                  <option value={180}>180 Hari (6 Bulan)</option>
                  <option value={365}>365 Hari (1 Tahun Penuh)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowGeneratePrompt(false)}
                  disabled={generating}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Generate & Tampilkan QR'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Single-View QR & Plaintext Code Modal */}
      {newlyGeneratedCode && (
        <ActivationQrModal
          codeData={newlyGeneratedCode}
          onClose={() => setNewlyGeneratedCode(null)}
        />
      )}
    </div>
  )
}
