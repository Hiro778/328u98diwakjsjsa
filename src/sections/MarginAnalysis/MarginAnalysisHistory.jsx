import { useState, useMemo } from 'react'
import { formatCurrency } from '../../lib/orderNumber'

const MODE_LABELS = {
  price: 'Analisis Harga Jual',
  target_margin: 'Target Margin',
  target_markup: 'Target Markup',
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'Semua Mode' },
  { value: 'price', label: 'Harga Jual' },
  { value: 'target_margin', label: 'Target Margin' },
  { value: 'target_markup', label: 'Target Markup' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'profit_desc', label: 'Profit Tertinggi' },
  { value: 'margin_desc', label: 'Margin Tertinggi' },
  { value: 'hpp_desc', label: 'HPP Tertinggi' },
]

function sortHistory(items, sortBy) {
  const sorted = [...items]
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    case 'profit_desc':
      return sorted.sort((a, b) => (Number(b.profit_per_unit) || 0) - (Number(a.profit_per_unit) || 0))
    case 'margin_desc':
      return sorted.sort((a, b) => (Number(b.margin_percent) || 0) - (Number(a.margin_percent) || 0))
    case 'hpp_desc':
      return sorted.sort((a, b) => (Number(b.cost_per_unit) || 0) - (Number(a.cost_per_unit) || 0))
    case 'newest':
    default:
      return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
}

export default function MarginAnalysisHistory({ history, loading, onViewDetail }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const filtered = useMemo(() => {
    let result = history || []

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(item =>
        (item.product_name || '').toLowerCase().includes(q)
      )
    }

    if (filter !== 'all') {
      result = result.filter(item => item.analysis_mode === filter)
    }

    return sortHistory(result, sortBy)
  }, [history, search, filter, sortBy])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-navy-50" />
        ))}
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-lg font-semibold text-navy-700">Belum ada riwayat analisis</p>
        <p className="mt-2 text-sm text-text-muted">
          Simpan analisis dari tab Kalkulator untuk melihat riwayat di sini.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <svg
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Cari nama produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Count */}
      <p className="mt-3 text-xs text-text-muted">
        {filtered.length} analisis
        {search && ` · Pencarian: "${search}"`}
      </p>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-navy-700">Tidak ada analisis yang cocok</p>
          <p className="mt-1 text-xs text-text-muted">Coba ubah kata kunci atau filter.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => onViewDetail(item)}
              className="rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-warm-200 hover:shadow-sm"
            >
              <p className="text-sm font-bold text-navy-700 truncate">{item.product_name}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {MODE_LABELS[item.analysis_mode] || item.analysis_mode}
                {' · '}
                {new Date(item.created_at).toLocaleDateString('id-ID')}
              </p>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">HPP</span>
                  <span className="font-semibold text-navy-700">{formatCurrency(item.hpp_snapshot || item.cost_per_unit)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Harga jual</span>
                  <span className="font-semibold text-navy-700">{formatCurrency(item.effective_selling_price)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Profit</span>
                  <span className="font-semibold text-warm-500">{formatCurrency(item.profit_per_unit)}/unit</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Margin</span>
                  <span className="font-semibold text-navy-700">{Number(item.margin_percent).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Markup</span>
                  <span className="font-semibold text-navy-700">{Number(item.markup_percent).toFixed(2)}%</span>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-text-muted">
                {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
