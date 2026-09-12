import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'
import {
  calculateInventorySummary,
  getLowestStockProducts,
  getEffectiveStock,
  getEffectiveMinStock,
  STOCK_STATUS,
} from '../../lib/inventoryUtils'
import StockStatusBadge from './StockStatusBadge'
import LowStockAlert from './LowStockAlert'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function InventoryDashboard({ onViewProduct }) {
  const { business } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business?.id) return
    loadData()
  }, [business?.id])

  async function loadData() {
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

  const summary = useMemo(() => calculateInventorySummary(products), [products])
  const lowestStock = useMemo(() => getLowestStockProducts(products, 5), [products])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-navy-50" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={item} className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium text-text-muted">Total Produk</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{summary.totalProducts}</p>
          <p className="text-[10px] text-text-muted">{summary.activeProducts} aktif</p>
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium text-text-muted">Total Stok</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{summary.totalStock.toLocaleString('id-ID')}</p>
          <p className="text-[10px] text-text-muted">unit</p>
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium text-text-muted">Nilai Persediaan</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{formatCurrency(summary.inventoryValue)}</p>
          <p className="text-[10px] text-text-muted">berdasarkan HPP</p>
        </motion.div>

        <motion.div variants={item} className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium text-text-muted">Stok Menipis</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">{summary.lowStockCount}</p>
          <p className="text-[10px] text-red-500">{summary.outOfStockCount} habis</p>
        </motion.div>
      </motion.div>

      {/* Restock Needed */}
      {summary.restockNeeded > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-electric-200 bg-electric-50 p-4"
        >
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm font-bold text-electric-600">
              {summary.restockNeeded} produk perlu restock
            </p>
          </div>
        </motion.div>
      )}

      {/* Two columns: Lowest Stock + Low Stock Alert */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lowest Stock */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-border bg-surface p-5"
        >
          <h3 className="mb-3 text-sm font-bold text-navy-700">Stok Terendah</h3>
          {lowestStock.length === 0 ? (
            <p className="text-xs text-text-muted">Belum ada produk.</p>
          ) : (
            <div className="space-y-2">
              {lowestStock.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onViewProduct?.(p)}
                  className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left transition-all hover:border-warm-200"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-700">{p.name}</p>
                    <p className="text-[11px] text-text-muted">
                      Stok: {getEffectiveStock(p)} · Min: {getEffectiveMinStock(p)}
                    </p>
                  </div>
                  <StockStatusBadge stock={getEffectiveStock(p)} minimumStock={getEffectiveMinStock(p)} />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Low Stock Alert */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <LowStockAlert
            products={[...lowestStock.filter((p) => {
              const status = getEffectiveStock(p) <= 0 ? STOCK_STATUS.OUT_OF_STOCK :
                getEffectiveStock(p) <= getEffectiveMinStock(p) ? STOCK_STATUS.LOW_STOCK : STOCK_STATUS.IN_STOCK
              return status !== STOCK_STATUS.IN_STOCK
            })]}
            onViewProduct={onViewProduct}
          />
          {lowestStock.filter((p) => {
            const stock = getEffectiveStock(p)
            return stock <= 0 || stock <= getEffectiveMinStock(p)
          }).length === 0 && (
            <div className="rounded-2xl border border-profit-200 bg-profit-50 p-5 text-center">
              <svg className="mx-auto h-8 w-8 text-profit-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2 text-sm font-semibold text-profit-600">Semua stok aman</p>
              <p className="mt-1 text-xs text-text-muted">Tidak ada produk yang perlu perhatian.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
