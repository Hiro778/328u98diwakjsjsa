import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  searchSuppliers,
  filterSuppliers,
  sortSuppliers,
  paginate,
  SUPPLIER_FILTERS,
  SUPPLIER_SORT_OPTIONS,
  PAGE_SIZE,
} from '../../lib/supplierUtils'

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function SupplierList({
  suppliers,
  loading,
  error,
  onRetry,
  onView,
  onEdit,
  onToggleActive,
  onAddNew,
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('name_asc')
  const [page, setPage] = useState(1)

  // Pipeline: search → filter → sort → paginate
  const searched = searchSuppliers(suppliers, search)
  const filtered = filterSuppliers(searched, filter)
  const sorted = sortSuppliers(filtered, sort)
  const paginated = paginate(sorted, page, PAGE_SIZE)

  function handleSearchChange(val) {
    setSearch(val)
    setPage(1)
  }

  function handleFilterChange(val) {
    setFilter(val)
    setPage(1)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama, kode, kontak, telepon, email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          >
            {SUPPLIER_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          >
            {SUPPLIER_SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-navy-50" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <button
              onClick={onRetry}
              className="mt-2 text-xs font-semibold text-red-500 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        )}

        {!loading && !error && paginated.items.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="mt-3 text-sm font-semibold text-navy-700">
              {search || filter !== 'all' ? 'Tidak ada supplier yang cocok' : 'Belum ada supplier'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {search || filter !== 'all' ? 'Coba ubah kata kunci atau filter.' : 'Tambahkan supplier pertama Anda.'}
            </p>
            {!search && filter === 'all' && (
              <button
                onClick={onAddNew}
                className="mt-4 rounded-xl bg-warm-400 px-4 py-2 text-xs font-bold text-white transition-all hover:shadow-md"
              >
                + Tambah Supplier
              </button>
            )}
          </div>
        )}

        {!loading && !error && paginated.items.length > 0 && (
          <>
            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-cream/50">
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Nama Supplier</th>
                    <th className="hidden px-4 py-3 text-xs font-bold text-text-muted uppercase sm:table-cell">Kontak</th>
                    <th className="hidden px-4 py-3 text-xs font-bold text-text-muted uppercase md:table-cell">Telepon</th>
                    <th className="hidden px-4 py-3 text-xs font-bold text-text-muted uppercase lg:table-cell">Email</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Produk</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.items.map((s) => (
                    <motion.tr
                      key={s.id}
                      variants={item}
                      initial="hidden"
                      animate="visible"
                      className="border-b border-border last:border-0 transition-colors hover:bg-cream/30"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onView(s)}
                          className="text-left"
                        >
                          <p className="font-bold text-navy-700 hover:underline">{s.name}</p>
                          {s.supplier_code && (
                            <p className="text-[11px] text-text-muted font-mono">{s.supplier_code}</p>
                          )}
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary sm:table-cell">
                        {s.contact_person || '-'}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                        {s.phone || '-'}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                        {s.email || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-cream px-2 text-xs font-bold text-navy-700">
                          {s._productCount || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          s.is_active !== false
                            ? 'bg-profit-50 text-profit-600'
                            : 'bg-red-50 text-red-500'
                        }`}>
                          {s.is_active !== false ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onView(s)}
                            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-cream"
                          >
                            Detail
                          </button>
                          <button
                            onClick={() => onEdit(s)}
                            className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-cream"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onToggleActive(s)}
                            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                              s.is_active !== false
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-profit-600 hover:bg-profit-50'
                            }`}
                          >
                            {s.is_active !== false ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {paginated.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  Menampilkan {(paginated.currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(paginated.currentPage * PAGE_SIZE, paginated.total)} dari{' '}
                  {paginated.total} supplier
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={paginated.currentPage === 1}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-cream disabled:opacity-40"
                  >
                    ←
                  </button>
                  {Array.from({ length: paginated.totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      const current = paginated.currentPage
                      return p === 1 || p === paginated.totalPages || Math.abs(p - current) <= 1
                    })
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-xs text-text-muted">
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            p === paginated.currentPage
                              ? 'bg-warm-400 text-white'
                              : 'border border-border text-text-secondary hover:bg-cream'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
                    disabled={paginated.currentPage === paginated.totalPages}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-cream disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
