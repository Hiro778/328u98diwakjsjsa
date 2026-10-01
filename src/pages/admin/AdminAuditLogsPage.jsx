import { useState, useEffect, useCallback } from 'react'
import {
  fetchAdminAuditLogs,
  fetchAdminAuditLogDetail,
  formatAuditDate,
  getActionBadgeColor,
  formatActionLabel,
} from '../../services/adminAuditLogService.js'

function DetailModal({ logId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true
    async function loadDetail() {
      setLoading(true)
      setError(null)
      const res = await fetchAdminAuditLogDetail(logId)
      if (!isMounted) return
      if (res.error) {
        setError(res.error.message)
      } else {
        setDetail(res.detail)
      }
      setLoading(false)
    }
    if (logId) {
      loadDetail()
    }
    return () => {
      isMounted = false
    }
  }, [logId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Detail Audit Log</h3>
              <p className="text-xs text-zinc-400">Jejak historis tindakan administratif (Read-Only)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            aria-label="Tutup modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-zinc-300">
          {loading && (
            <div className="space-y-4 py-8">
              <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/2"></div>
              <div className="h-24 bg-zinc-800 rounded animate-pulse w-full"></div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* Event Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                <div>
                  <span className="text-xs text-zinc-500 block">Tindakan (Action)</span>
                  <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-semibold border ${getActionBadgeColor(detail.action)}`}>
                    {formatActionLabel(detail.action)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block font-mono mt-0.5">{detail.action}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 block">Waktu Terjadi</span>
                  <span className="text-zinc-200 font-medium mt-1 block">
                    {formatAuditDate(detail.created_at)}
                  </span>
                  <span className="text-[11px] text-zinc-500 block font-mono">{detail.created_at}</span>
                </div>
              </div>

              {/* Actor Information */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Identitas Pelaku (Admin)</h4>
                <div className="p-3.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {detail.admin_avatar_url ? (
                      <img src={detail.admin_avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300">
                        {(detail.admin_name || 'A')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-zinc-200">{detail.admin_name}</div>
                      <div className="text-xs text-zinc-400">{detail.admin_email || 'Tidak ada email'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-zinc-500 block">Admin ID</span>
                    <span className="font-mono text-xs text-zinc-400">{detail.admin_id}</span>
                  </div>
                </div>
              </div>

              {/* Target Information */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Target Entitas</h4>
                <div className="p-3.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-zinc-500 block">Tipe Target</span>
                      <span className="capitalize font-medium text-zinc-200">{detail.target_type}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500 block">Target ID</span>
                      <span className="font-mono text-xs text-zinc-300">{detail.target_id}</span>
                    </div>
                  </div>

                  {detail.target_info && Object.keys(detail.target_info).length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      {detail.target_info.name && (
                        <div>
                          <span className="text-zinc-500">Nama: </span>
                          <span className="text-zinc-300 font-medium">{detail.target_info.name}</span>
                        </div>
                      )}
                      {detail.target_info.email && (
                        <div>
                          <span className="text-zinc-500">Email: </span>
                          <span className="text-zinc-300 font-medium">{detail.target_info.email}</span>
                        </div>
                      )}
                      {detail.target_info.subject && (
                        <div>
                          <span className="text-zinc-500">Subjek: </span>
                          <span className="text-zinc-300 font-medium">{detail.target_info.subject}</span>
                        </div>
                      )}
                      {detail.target_info.plan && (
                        <div>
                          <span className="text-zinc-500">Plan: </span>
                          <span className="text-zinc-300 uppercase font-medium">{detail.target_info.plan}</span>
                        </div>
                      )}
                      {detail.target_info.status && (
                        <div>
                          <span className="text-zinc-500">Status: </span>
                          <span className="text-zinc-300 capitalize font-medium">{detail.target_info.status}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Alasan / Keterangan</h4>
                <div className="p-3.5 rounded-lg bg-zinc-950/50 border border-zinc-800/80">
                  <p className="text-zinc-300 whitespace-pre-wrap">{detail.reason || 'Tidak ada alasan khusus dicatat.'}</p>
                </div>
              </div>

              {/* Metadata Payload (Sanitized) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Metadata Transaksi</h4>
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Tersanitasi (Bebas Kredensial)
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 font-mono text-xs overflow-x-auto text-zinc-300">
                  <pre className="whitespace-pre-wrap">
                    {detail.metadata && Object.keys(detail.metadata).length > 0
                      ? JSON.stringify(detail.metadata, null, 2)
                      : '{} (Kosong)'}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Audit Log bersifat Read-Only dan Terkunci secara Kriptografis
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [action, setAction] = useState('all')
  const [targetType, setTargetType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Options
  const [availableActions, setAvailableActions] = useState([])
  const [availableTargetTypes, setAvailableTargetTypes] = useState([])

  // Modal Detail
  const [selectedLogId, setSelectedLogId] = useState(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * pageSize
    const res = await fetchAdminAuditLogs({
      search,
      action,
      targetType,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : null,
      dateTo: dateTo ? new Date(dateTo + 'T23:59:59.999Z').toISOString() : null,
      sortBy,
      limit: pageSize,
      offset,
    })

    if (res.error) {
      setError(res.error.message)
    } else {
      setLogs(res.records || [])
      setTotalCount(res.totalCount || 0)
      if (res.availableActions?.length) setAvailableActions(res.availableActions)
      if (res.availableTargetTypes?.length) setAvailableTargetTypes(res.availableTargetTypes)
    }
    setLoading(false)
  }, [search, action, targetType, dateFrom, dateTo, sortBy, page, pageSize])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleResetFilters = () => {
    setSearch('')
    setSearchInput('')
    setAction('all')
    setTargetType('all')
    setDateFrom('')
    setDateTo('')
    setSortBy('newest')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Audit Logs</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Append-Only (Read-Only)
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Catatan riwayat audit dan jejak aktivitas administratif internal secara append-only dan terenkripsi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700/60 disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Cari Audit</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Cari alasan, target ID, admin..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500 transition"
              />
              <svg
                className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Tindakan</label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500 transition"
            >
              <option value="all">Semua Tindakan</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {formatActionLabel(act)} ({act})
                </option>
              ))}
            </select>
          </div>

          {/* Target Type Filter */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Target Entitas</label>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500 transition"
            >
              <option value="all">Semua Tipe Target</option>
              {availableTargetTypes.map((type) => (
                <option key={type} value={type} className="capitalize">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500 transition"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500 transition"
            />
          </div>
        </form>

        {/* Filter secondary controls & Active Tags */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                setPage(1)
              }}
              className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 focus:outline-hidden focus:border-emerald-500 transition"
            >
              <option value="newest">Terbaru (Newest First)</option>
              <option value="oldest">Terlama (Oldest First)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {(search || action !== 'all' || targetType !== 'all' || dateFrom || dateTo || sortBy !== 'newest') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition underline underline-offset-4"
              >
                Reset Filter
              </button>
            )}
            <span className="text-xs text-zinc-400">
              Total: <strong className="text-zinc-200">{totalCount}</strong> catatan
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden shadow-xs">
        {loading && (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-32"></div>
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-48"></div>
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-24"></div>
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-40"></div>
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-16"></div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-8 text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">Gagal Memuat Audit Logs</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">{error}</p>
            <button
              onClick={loadLogs}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="p-12 text-center space-y-3">
            <div className="inline-flex p-3.5 rounded-full bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-zinc-300">Tidak Ada Catatan Audit</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Tidak ditemukan data audit logs yang sesuai dengan kriteria filter atau pencarian Anda.
            </p>
            {(search || action !== 'all' || targetType !== 'all' || dateFrom || dateTo) && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
              >
                Reset Semua Filter
              </button>
            )}
          </div>
        )}

        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300 min-w-[650px]">
              <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-[11px] tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th scope="col" className="px-5 py-3.5 font-medium">Waktu</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Pelaku (Admin)</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Tindakan</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Target</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Alasan</th>
                  <th scope="col" className="px-5 py-3.5 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30 transition">
                    {/* Timestamp */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="font-medium text-zinc-200">{formatAuditDate(log.created_at)}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString('id-ID') : '-'}
                      </div>
                    </td>

                    {/* Actor */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {log.admin_avatar_url ? (
                          <img src={log.admin_avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 text-[10px]">
                            {(log.admin_name || 'A')[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-zinc-200">{log.admin_name}</div>
                          <div className="text-[11px] text-zinc-500">{log.admin_email || log.admin_id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${getActionBadgeColor(log.action)}`}>
                        {formatActionLabel(log.action)}
                      </span>
                      <span className="block text-[10px] text-zinc-500 font-mono mt-0.5">{log.action}</span>
                    </td>

                    {/* Target */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-[10px] font-medium text-zinc-400 capitalize">
                          {log.target_type}
                        </span>
                        <span className="font-mono text-xs text-zinc-300">
                          {log.target_id.length > 16 ? `${log.target_id.slice(0, 8)}...${log.target_id.slice(-4)}` : log.target_id}
                        </span>
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="px-5 py-4 max-w-xs truncate">
                      <span className="text-zinc-300" title={log.reason}>
                        {log.reason || '—'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLogId(log.id)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition border border-zinc-700/60"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && !error && totalCount > 0 && (
          <div className="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
            <div>
              Menampilkan <span className="font-medium text-zinc-200">{(page - 1) * pageSize + 1}</span> -{' '}
              <span className="font-medium text-zinc-200">{Math.min(page * pageSize, totalCount)}</span> dari{' '}
              <span className="font-medium text-zinc-200">{totalCount}</span> log
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Sebelumnya
              </button>
              <span className="px-2 py-1 text-zinc-400">
                Hal {page} dari {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLogId && (
        <DetailModal
          logId={selectedLogId}
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </div>
  )
}
