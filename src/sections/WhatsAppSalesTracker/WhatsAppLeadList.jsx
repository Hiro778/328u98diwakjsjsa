import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  searchLeads,
  filterLeads,
  sortLeads,
  paginate,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_FILTERS,
  SORT_OPTIONS,
  PAGE_SIZE,
  formatCurrency,
  formatRelativeTime,
  isOverdue,
  isTodayFollowup,
} from './whatsappSalesUtils'

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function WhatsAppLeadList({
  leads,
  followupsByLead,
  loading,
  error,
  onRetry,
  onClick,
  onWhatsApp,
  onCall,
  onFollowup,
  onEdit,
  onDelete,
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return sortLeads(filterLeads(searchLeads(leads, search), statusFilter), sort)
  }, [leads, search, statusFilter, sort])

  const paginated = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page])

  // Reset page on search/filter change
  function handleSearch(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  function handleFilter(e) {
    setStatusFilter(e.target.value)
    setPage(1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
        <p className="text-lg font-semibold text-red-500">Gagal memuat data</p>
        <p className="mt-2 text-sm text-text-muted">{error}</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          Coba Lagi
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Search / Filter / Sort */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Cari nama, WA, email, produk, catatan..."
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={handleFilter}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-warm-400 focus:outline-none"
        >
          {LEAD_FILTERS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-warm-400 focus:outline-none"
        >
          {SORT_OPTIONS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        {filtered.length} lead ditemukan
      </p>

      {/* List */}
      {paginated.items.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warm-50">
            <svg className="h-6 w-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-navy-700">Belum ada lead</p>
          <p className="mt-2 text-sm text-text-muted">Tambahkan lead WhatsApp pertama Anda.</p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          className="mt-3 space-y-2"
        >
          {paginated.items.map(lead => {
            const followups = followupsByLead?.[lead.id] || []
            const overdue = isOverdue(lead)
            const todayFu = isTodayFollowup(lead)
            return (
              <motion.div
                key={lead.id}
                variants={item}
                layout
                onClick={() => onClick(lead)}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-warm-200 hover:shadow-sm"
              >
                {/* Priority dot */}
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${lead.priority === 'high' ? 'bg-red-500' : lead.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'}`} />

                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-50 text-sm font-bold text-warm-500">
                  {(lead.name || '?')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-navy-700 truncate">{lead.name}</p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${LEAD_STATUS_COLORS[lead.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {LEAD_STATUS_LABELS[lead.status] || lead.status}
                    </span>
                    {overdue && (
                      <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        Overdue
                      </span>
                    )}
                    {todayFu && (
                      <span className="inline-flex items-center rounded-full bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-[10px] font-bold text-yellow-600">
                        Hari Ini
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.product_interest && <span className="truncate">• {lead.product_interest}</span>}
                    {lead.estimated_value > 0 && <span className="font-medium text-text-secondary">{formatCurrency(lead.estimated_value)}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
                    {lead.last_contacted_at && <span>Terakhir: {formatRelativeTime(lead.last_contacted_at)}</span>}
                    {lead.next_follow_up_at && !overdue && <span>Follow-up: {formatRelativeTime(lead.next_follow_up_at)}</span>}
                    {followups.length > 0 && <span>{followups.length} follow-up</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
                  {lead.phone && (
                    <>
                      <button
                        onClick={() => onWhatsApp(lead)}
                        className="rounded-lg p-1.5 text-green-500 hover:bg-green-50 transition-colors"
                        title="WhatsApp"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onCall(lead)}
                        className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Telepon"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onFollowup(lead)}
                    className="rounded-lg p-1.5 text-yellow-500 hover:bg-yellow-50 transition-colors"
                    title="Follow-up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onEdit(lead)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-cream transition-colors"
                    title="Edit"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(lead)}
                    className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 transition-colors"
                    title="Hapus"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Pagination */}
      {paginated.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={paginated.currentPage === 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sebelumnya
          </button>
          <span className="text-xs text-text-muted">{paginated.currentPage} / {paginated.totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(paginated.totalPages, p + 1))}
            disabled={paginated.currentPage === paginated.totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Selanjutnya
          </button>
        </div>
      )}
    </div>
  )
}
