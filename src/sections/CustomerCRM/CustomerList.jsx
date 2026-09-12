import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  searchCustomers,
  filterCustomers,
  sortCustomers,
  paginate,
  formatCurrency,
  formatRelativeTime,
  CUSTOMER_FILTERS,
  SORT_OPTIONS,
  PAGE_SIZE,
} from './customerUtils'

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function CustomerList({
  customers,
  loading,
  error,
  onRetry,
  onEdit,
  onDelete,
  onClick,
  onAddNew,
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  // Pipeline: search → filter → sort → paginate
  const searched = searchCustomers(customers, search)
  const filtered = filterCustomers(searched, filter)
  const sorted = sortCustomers(filtered, sort)
  const paginated = paginate(sorted, page, PAGE_SIZE)

  // Reset page on search/filter change
  function handleSearchChange(val) {
    setSearch(val)
    setPage(1)
  }

  function handleFilterChange(val) {
    setFilter(val)
    setPage(1)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  // Error state
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

  // Empty state — no customers at all
  if (customers.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warm-50">
          <svg className="h-6 w-6 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-navy-700">Belum ada customer</p>
        <p className="mt-2 text-sm text-text-muted">
          Tambahkan customer pertama Anda untuk mulai membangun database pelanggan.
        </p>
        <button
          onClick={onAddNew}
          className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Customer
        </button>
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
            placeholder="Cari nama, HP, atau email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </div>

        {/* Filter */}
        <select
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {CUSTOMER_FILTERS.map(f => (
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
          {filtered.length === customers.length
            ? `${customers.length} customer`
            : `${filtered.length} dari ${customers.length} customer`}
        </p>
      </div>

      {/* Customer List */}
      {paginated.items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-navy-700">Tidak ada customer ditemukan</p>
          <p className="mt-1 text-xs text-text-muted">Coba ubah filter atau kata kunci pencarian.</p>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          className="mt-3 space-y-2"
        >
          {paginated.items.map(c => (
            <motion.div
              key={c.id}
              variants={item}
              layout
              onClick={() => onClick(c)}
              className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-warm-200 hover:shadow-sm"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-50 text-sm font-bold text-warm-500">
                {(c.name || '?').charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy-700 truncate">{c.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                  {c.phone && <span>{c.phone}</span>}
                  {c.email && <span className="truncate">{c.email}</span>}
                </div>
              </div>

              {/* Metrics */}
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-warm-500">{formatCurrency(c.total_spent || 0)}</p>
                <p className="text-[10px] text-text-muted">
                  {c.total_transactions || 0} transaksi
                  {c.last_transaction_at && (
                    <span> · {formatRelativeTime(c.last_transaction_at)}</span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onEdit(c)}
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                  title="Edit"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(c)}
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Hapus"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
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
