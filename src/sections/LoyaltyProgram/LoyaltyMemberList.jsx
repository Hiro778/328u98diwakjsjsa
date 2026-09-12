import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  searchMembers, filterMembers, sortMembers, paginate,
  formatPoints, formatCurrency, formatDateTime,
  MEMBER_FILTERS, MEMBER_SORT_OPTIONS, PAGE_SIZE,
} from './loyaltyUtils'

const item = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}

export default function LoyaltyMemberList({ members, loading, error, onRetry, onClick, onAdjust, onRedeem }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('points_desc')
  const [page, setPage] = useState(1)

  const searched = searchMembers(members, search)
  const filtered = filterMembers(searched, filter)
  const sorted = sortMembers(filtered, sort)
  const paginated = paginate(sorted, page, PAGE_SIZE)

  function handleSearchChange(val) { setSearch(val); setPage(1) }
  function handleFilterChange(val) { setFilter(val); setPage(1) }

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
        <button onClick={onRetry} className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">Coba Lagi</button>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
        <p className="text-lg font-semibold text-navy-700">Belum ada member</p>
        <p className="mt-2 text-sm text-text-muted">Customer akan muncul di sini setelah mendaftar program loyalitas.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Search & Filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input type="text" placeholder="Cari nama, HP, email..." value={search} onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50" />
        </div>
        <select value={filter} onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50">
          {MEMBER_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50">
          {MEMBER_SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {filtered.length === members.length ? `${members.length} member` : `${filtered.length} dari ${members.length} member`}
        </p>
      </div>

      {paginated.items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-navy-700">Tidak ada member ditemukan</p>
          <p className="mt-1 text-xs text-text-muted">Coba ubah filter atau kata kunci pencarian.</p>
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          className="mt-3 space-y-2">
          {paginated.items.map(m => (
            <motion.div key={m.id} variants={item} layout onClick={() => onClick(m)}
              className="flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-warm-200 hover:shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-50 text-sm font-bold text-warm-500">
                {(m.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy-700 truncate">{m.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                  {m.phone && <span>{m.phone}</span>}
                  <span>{m.total_transactions || 0} transaksi</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-warm-500">{formatPoints(m.loyalty_points_balance)}</p>
                <p className="text-[10px] text-text-muted">Lifetime: {formatPoints(m.loyalty_lifetime_points)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onAdjust(m)} title="Adjust Poin"
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <button onClick={() => onRedeem(m)} title="Tukar Poin"
                  className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-warm-50 hover:text-warm-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {paginated.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={paginated.currentPage === 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-40">Sebelumnya</button>
          <span className="text-xs text-text-muted">{paginated.currentPage} / {paginated.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(paginated.totalPages, p + 1))} disabled={paginated.currentPage === paginated.totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-40">Selanjutnya</button>
        </div>
      )}
    </div>
  )
}
