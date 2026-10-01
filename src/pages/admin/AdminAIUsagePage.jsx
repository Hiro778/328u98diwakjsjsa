import { useState, useEffect, useCallback } from 'react'
import { fetchAdminAiUsage, fetchAdminAiUsageStats } from '../../services/adminAiUsageService.js'

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

function formatNumber(num) {
  if (typeof num !== 'number') return '0'
  return new Intl.NumberFormat('id-ID').format(num)
}

function formatCostUsd(num) {
  if (typeof num !== 'number') return '$0.000000'
  return `$${num.toFixed(6)}`
}

export default function AdminAIUsagePage() {
  const [records, setRecords] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filters & Pagination
  const [timeRange, setTimeRange] = useState('all') // 'today' | '7d' | '30d' | 'all'
  const [search, setSearch] = useState('')
  const [operationFilter, setOperationFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const limit = 20

  // Detail Modal State
  const [selectedRecord, setSelectedRecord] = useState(null)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const { stats: fetchedStats, error: statsErr } = await fetchAdminAiUsageStats({ timeRange })
    if (!statsErr && fetchedStats) {
      setStats(fetchedStats)
    }
    setStatsLoading(false)
  }, [timeRange])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = (page - 1) * limit
    const { records: fetchedRecords, totalCount: count, error: fetchErr } = await fetchAdminAiUsage({
      search,
      timeRange,
      operationFilter,
      modelFilter,
      statusFilter,
      sortBy,
      limit,
      offset,
    })

    if (fetchErr) {
      setError(fetchErr.message || 'Gagal memuat catatan penggunaan AI.')
    } else {
      setRecords(fetchedRecords)
      setTotalCount(count)
    }
    setLoading(false)
  }, [search, timeRange, operationFilter, modelFilter, statusFilter, sortBy, page])

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

  const handleTimeRangeChange = (range) => {
    setTimeRange(range)
    setPage(1)
  }

  const handleSearchChange = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">AI Usage Management</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Tahap 6 — Monitoring
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Monitoring telemetri penggunaan model AI, konsumsi token Gemini, credit ledger, dan estimasi biaya provider.
          </p>
        </div>

        {/* Time Filter Pills */}
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: '7d', label: '7 Hari' },
            { id: '30d', label: '30 Hari' },
            { id: 'all', label: 'Semua Waktu' },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => handleTimeRangeChange(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timeRange === pill.id
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Requests */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Permintaan AI</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {statsLoading ? (
              <div className="h-7 w-20 bg-slate-800 animate-pulse rounded" />
            ) : (
              formatNumber(stats?.total_requests || 0)
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {statsLoading ? '...' : `${formatNumber(stats?.success_requests || 0)} berhasil`}
          </div>
        </div>

        {/* Credits Used */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-amber-400 uppercase tracking-wider">Kredit Terpakai</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {statsLoading ? (
              <div className="h-7 w-20 bg-slate-800 animate-pulse rounded" />
            ) : (
              formatNumber(stats?.total_credits || 0)
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">Kredit internal UMKM</div>
        </div>

        {/* Total Tokens */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-purple-400 uppercase tracking-wider">Total Token Konsumsi</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {statsLoading ? (
              <div className="h-7 w-24 bg-slate-800 animate-pulse rounded" />
            ) : (
              formatNumber(stats?.total_tokens || 0)
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            In: {formatNumber(stats?.input_tokens || 0)} | Out: {formatNumber(stats?.output_tokens || 0)}
          </div>
        </div>

        {/* Provider Cost */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Estimasi Biaya (USD)</div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {statsLoading ? (
              <div className="h-7 w-24 bg-slate-800 animate-pulse rounded" />
            ) : (
              formatCostUsd(stats?.total_cost_usd || 0)
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">Gemini Flash API rate</div>
        </div>

        {/* Active AI Users */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 shadow-sm relative overflow-hidden">
          <div className="text-xs font-medium text-blue-400 uppercase tracking-wider">Pengguna AI Aktif</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {statsLoading ? (
              <div className="h-7 w-16 bg-slate-800 animate-pulse rounded" />
            ) : (
              formatNumber(stats?.active_users || 0)
            )}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {statsLoading ? '...' : `${formatNumber(stats?.active_businesses || 0)} bisnis unik`}
          </div>
        </div>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800/80 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Cari user, bisnis, request ID, model..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <svg
              className="w-4 h-4 text-slate-500 absolute left-3 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Operation Filter */}
          <div>
            <select
              value={operationFilter}
              onChange={(e) => {
                setOperationFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Operasi</option>
              <option value="GENERATE_PRD">GENERATE_PRD</option>
              <option value="GENERATE_BRIEF">GENERATE_BRIEF</option>
              <option value="GENERATE_ASSET">GENERATE_ASSET</option>
              <option value="COPYWRITING">COPYWRITING</option>
            </select>
          </div>

          {/* Model Filter */}
          <div>
            <select
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Model</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
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
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="highest_tokens">Token Terbanyak</option>
              <option value="highest_credits">Kredit Terbanyak</option>
              <option value="highest_cost">Biaya Tertinggi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-between text-red-300 text-sm">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              loadStats()
              loadRecords()
            }}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs rounded-lg transition-colors font-medium"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className="rounded-xl bg-[#0f172a] border border-slate-800/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300 min-w-[750px]">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase text-slate-400 tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Waktu</th>
                <th className="py-3.5 px-4">Pengguna & Bisnis</th>
                <th className="py-3.5 px-4">Operasi / Tool</th>
                <th className="py-3.5 px-4">Model</th>
                <th className="py-3.5 px-4 text-right">Tokens (Total)</th>
                <th className="py-3.5 px-4 text-center">Kredit</th>
                <th className="py-3.5 px-4 text-right">Biaya (USD)</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 w-28 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-36 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-24 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-28 bg-slate-800 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-800 rounded ml-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-10 bg-slate-800 rounded mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-800 rounded ml-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-14 bg-slate-800 rounded mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-6 w-16 bg-slate-800 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="text-sm font-medium">Tidak ada data AI usage yang sesuai kriteria.</p>
                      <span className="text-xs text-slate-600">Coba ubah kata kunci pencarian atau filter rentang waktu.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>

                    {/* User & Business */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-white text-xs truncate max-w-[180px]">
                        {r.user?.email || 'User Anonim'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {r.business?.name || 'Tanpa Bisnis'}
                      </div>
                    </td>

                    {/* Operation */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                        {r.operation}
                      </span>
                    </td>

                    {/* Model */}
                    <td className="py-3 px-4 text-xs font-mono text-purple-300 whitespace-nowrap">
                      {r.model}
                    </td>

                    {/* Total Tokens */}
                    <td className="py-3 px-4 text-right text-xs font-mono whitespace-nowrap" title={`In: ${r.input_tokens} | Out: ${r.output_tokens}`}>
                      <span className="text-white font-medium">{formatNumber(r.total_tokens)}</span>
                      <span className="text-[10px] text-slate-400 ml-1">tkn</span>
                    </td>

                    {/* Credits */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {r.credits_charged}
                      </span>
                    </td>

                    {/* Cost */}
                    <td className="py-3 px-4 text-right text-xs font-mono text-emerald-400 whitespace-nowrap">
                      {formatCostUsd(Number(r.provider_cost_usd) || 0)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          r.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : r.status === 'failed'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(r)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3 px-4 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Menampilkan <span className="font-medium text-white">{records.length}</span> dari{' '}
            <span className="font-medium text-white">{totalCount}</span> total catatan
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sebelumnya
            </button>
            <span>
              Hal <span className="font-medium text-white">{page}</span> dari {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Detail Penggunaan AI</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedRecord.request_id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Pengguna:</span>
                  <span className="text-white font-medium block truncate">{selectedRecord.user?.email || '—'}</span>
                  <span className="text-slate-400 block truncate">{selectedRecord.user?.full_name || '—'}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Bisnis:</span>
                  <span className="text-white font-medium block truncate">{selectedRecord.business?.name || '—'}</span>
                  <span className="text-slate-500 font-mono text-[10px] block truncate">{selectedRecord.business_id}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Operasi:</span>
                  <span className="text-white font-medium">{selectedRecord.operation}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Model AI:</span>
                  <span className="text-purple-300 font-mono font-medium">{selectedRecord.model}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Status:</span>
                  <span className="text-emerald-400 font-medium capitalize">{selectedRecord.status}</span>
                </div>
              </div>

              {/* Tokens & Cost Card */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">Rincian Token & Biaya</div>
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-slate-500 block">Input:</span>
                    <span className="text-white font-medium">{formatNumber(selectedRecord.input_tokens)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Output:</span>
                    <span className="text-white font-medium">{formatNumber(selectedRecord.output_tokens)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Token:</span>
                    <span className="text-purple-300 font-semibold">{formatNumber(selectedRecord.total_tokens)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <div>
                    <span className="text-slate-500 block">Kredit Dikurangi:</span>
                    <span className="text-amber-400 font-bold">{selectedRecord.credits_charged} Kredit</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Biaya Provider:</span>
                    <span className="text-emerald-400 font-bold font-mono">{formatCostUsd(Number(selectedRecord.provider_cost_usd) || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Sanitized Metadata */}
              <div className="space-y-1.5 text-xs">
                <span className="text-slate-400 font-medium">Metadata (Sanitized, Privacy-Compliant):</span>
                <pre className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-300 text-[11px] font-mono overflow-x-auto max-h-36">
                  {JSON.stringify(selectedRecord.metadata || {}, null, 2)}
                </pre>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span>Waktu Catatan: {formatDate(selectedRecord.created_at)}</span>
                <span>ID: {selectedRecord.id}</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
