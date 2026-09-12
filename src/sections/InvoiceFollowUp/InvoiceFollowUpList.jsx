import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  searchInvoices,
  filterInvoices,
  sortInvoices,
  paginate,
  formatCurrency,
  formatDueDate,
  formatFollowupReminder,
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  PRIORITY,
  INVOICE_FILTERS,
  PERIOD_FILTERS,
  SORT_OPTIONS,
  PAGE_SIZE,
  calculateDaysOverdue,
} from './invoiceFollowUpUtils'

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function InvoiceFollowUpList({
  invoices,
  followupsByInvoice,
  loading,
  error,
  onRetry,
  onClick,
  onFollowup,
  onContact,
  onEdit,
  onDelete,
  onPayment,
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [sort, setSort] = useState('due_date_asc')
  const [page, setPage] = useState(1)

  // Pipeline
  const searched = searchInvoices(invoices, search)
  const filtered = filterInvoices(searched, statusFilter, periodFilter)
  const sorted = sortInvoices(filtered, sort)
  const paginated = paginate(sorted, page, PAGE_SIZE)

  function handleSearchChange(val) {
    setSearch(val)
    setPage(1)
  }
  function handleStatusFilterChange(val) {
    setStatusFilter(val)
    setPage(1)
  }
  function handlePeriodFilterChange(val) {
    setPeriodFilter(val)
    setPage(1)
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  // Error
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

  // Empty state — no invoices at all
  if (invoices.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warm-50">
          <svg className="h-6 w-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-navy-700">Belum ada invoice</p>
        <p className="mt-2 text-sm text-text-muted">
          Invoice yang perlu ditindaklanjuti akan muncul di sini.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Cari nomor invoice, nama, HP..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {INVOICE_FILTERS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {/* Period Filter */}
        <select
          value={periodFilter}
          onChange={(e) => handlePeriodFilterChange(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {PERIOD_FILTERS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {SORT_OPTIONS.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {filtered.length === invoices.length
            ? `${invoices.length} invoice`
            : `${filtered.length} dari ${invoices.length} invoice`}
        </p>
      </div>

      {/* Invoice List */}
      {paginated.items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-navy-700">Tidak ada invoice ditemukan</p>
          <p className="mt-1 text-xs text-text-muted">Coba ubah filter atau kata kunci pencarian.</p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          className="mt-3 space-y-2"
        >
          {paginated.items.map(inv => {
            const followups = followupsByInvoice?.[inv.id] || []
            const daysOverdue = calculateDaysOverdue(inv)
            const hasWarning = inv.status === INVOICE_STATUS.OVERDUE && followups.length === 0

            return (
              <motion.div
                key={inv.id}
                variants={item}
                layout
                onClick={() => onClick(inv)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-all hover:border-warm-200 hover:shadow-sm ${
                  hasWarning ? 'border-red-300' : 'border-border'
                }`}
              >
                {/* Priority indicator */}
                <div className={`h-2 w-2 shrink-0 rounded-full ${
                  inv.priority === PRIORITY.HIGH ? 'bg-red-500' :
                  inv.priority === PRIORITY.MEDIUM ? 'bg-yellow-500' :
                  'bg-blue-400'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-navy-700 truncate">{inv.invoice_number}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${INVOICE_STATUS_COLORS[inv.status] || ''}`}>
                      {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted truncate">
                    {inv.customer_name}
                    {inv.customer_phone && ` · ${inv.customer_phone}`}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-text-muted">
                    <span>Jatuh tempo: {formatDueDate(inv.due_date, inv.status)}</span>
                    {daysOverdue > 0 && (
                      <span className="font-semibold text-red-500">{daysOverdue} hari terlambat</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-warm-500">{formatCurrency(inv.outstanding)}</p>
                  {inv.paid_amount > 0 && (
                    <p className="text-[10px] text-profit-600">Terbayar: {formatCurrency(inv.paid_amount)}</p>
                  )}
                </div>

                {/* Follow-up reminder */}
                <div className="hidden sm:block shrink-0 w-28">
                  <p className={`text-[10px] text-right ${
                    hasWarning ? 'font-bold text-red-500' : 'text-text-muted'
                  }`}>
                    {formatFollowupReminder(followups)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {inv.status !== INVOICE_STATUS.PAID && onPayment && (
                    <button
                      onClick={() => onPayment(inv)}
                      className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-profit-50 hover:text-profit-600"
                      title="Bayar"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                      </svg>
                    </button>
                  )}
                  {inv.customer_phone && (
                    <button
                      onClick={() => onContact(inv)}
                      className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-profit-600"
                      title="Hubungi"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => onFollowup(inv)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-warm-50 hover:text-warm-500"
                    title="Follow-up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(inv)}
                      className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                      title="Edit"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(inv)}
                      className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Hapus"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
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
          <span className="text-xs text-text-muted">
            {paginated.currentPage} / {paginated.totalPages}
          </span>
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
