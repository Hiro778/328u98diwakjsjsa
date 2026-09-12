import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'
import {
  searchProducts,
  filterProducts,
  sortProducts,
  paginate,
  ITEMS_PER_PAGE,
  FILTER_OPTIONS,
  SORT_OPTIONS,
  getEffectiveStock,
  getEffectiveMinStock,
  calcInventoryValue,
} from '../../lib/inventoryUtils'
import StockStatusBadge from './StockStatusBadge'

export default function ProductInventoryList({ onViewProduct, onAddProduct, refreshKey }) {
  const { business } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name_asc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!business?.id) return
    loadProducts()
  }, [business?.id, refreshKey])

  async function loadProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select(`
        id, name, sku, category, unit, cost_price, unit_price, is_active, created_at,
        inventory ( quantity, min_stock, maximum_stock, location )
      `)
      .eq('business_id', business.id)
      .order('name')

    setProducts(data || [])
    setLoading(false)
  }

  // Apply search, filter, sort, paginate
  const processed = useMemo(() => {
    let result = products
    result = searchProducts(result, search)
    result = filterProducts(result, filter)
    result = sortProducts(result, sortBy)
    return paginate(result, page, ITEMS_PER_PAGE)
  }, [products, search, filter, sortBy, page])

  // Reset page on search/filter change
  useEffect(() => {
    setPage(1)
  }, [search, filter, sortBy])

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
            placeholder="Cari nama atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          />
        </div>

        <div className="flex gap-2">
          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-text-secondary focus:border-warm-300 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Add button */}
          <button
            onClick={onAddProduct}
            className="rounded-xl bg-warm-400 px-4 py-2.5 text-xs font-bold text-white transition-all hover:shadow-md"
          >
            + Tambah
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="mt-3 text-xs text-text-muted">
        {processed.total} produk
        {search && ` · Pencarian: "${search}"`}
        {filter !== 'all' && ` · Filter: ${FILTER_OPTIONS.find((f) => f.value === filter)?.label}`}
      </p>

      {/* Loading */}
      {loading && (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-navy-50" />
          ))}
        </div>
      )}

      {/* Product List */}
      {!loading && processed.items.length === 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="mt-3 text-sm font-semibold text-navy-700">
            {search || filter !== 'all' ? 'Tidak ada produk yang cocok' : 'Belum ada produk'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {search || filter !== 'all' ? 'Coba ubah kata kunci atau filter.' : 'Tambahkan produk untuk mulai mengelola persediaan.'}
          </p>
        </div>
      )}

      {!loading && processed.items.length > 0 && (
        <div className="mt-4 space-y-2">
          <AnimatePresence mode="popLayout">
            {processed.items.map((p) => {
              const stock = getEffectiveStock(p)
              const minStock = getEffectiveMinStock(p)
              const value = calcInventoryValue(p.cost_price, stock)

              return (
                <motion.button
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => onViewProduct?.(p)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-warm-200 hover:shadow-sm"
                >
                  {/* Product icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-lg">
                    📦
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-navy-700">{p.name}</p>
                      {!p.is_active && (
                        <span className="shrink-0 rounded-full bg-navy-100 px-1.5 py-0.5 text-[9px] font-semibold text-navy-400">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
                      {p.sku && <span>SKU: {p.sku}</span>}
                      {p.category && <span>{p.category}</span>}
                      <span>{stock} {p.unit || 'pcs'}</span>
                    </div>
                  </div>

                  {/* Value + Status */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-navy-700">{formatCurrency(value)}</p>
                    <StockStatusBadge stock={stock} minimumStock={minStock} />
                  </div>

                  {/* Arrow */}
                  <svg className="h-4 w-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {processed.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={processed.currentPage <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-cream disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-xs text-text-muted">
            {processed.currentPage} / {processed.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(processed.totalPages, p + 1))}
            disabled={processed.currentPage >= processed.totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-cream disabled:opacity-40"
          >
            Selanjutnya →
          </button>
        </div>
      )}
    </div>
  )
}
