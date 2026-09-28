import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency } from '../../lib/orderNumber'
import {
  getEffectiveStock,
  getEffectiveMinStock,
  getEffectiveMaxStock,
  getEffectiveLocation,
  calcInventoryValue,
} from '../../lib/inventoryUtils'
import StockStatusBadge from './StockStatusBadge'
import StockAdjustmentForm from './StockAdjustmentForm'
import StockHistoryTable from './StockHistoryTable'
import RestockInfo from './RestockInfo'

export default function ProductDetail({ product, onBack, onEdit }) {
  const { business } = useAuth()
  const [movements, setMovements] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [currentProduct, setCurrentProduct] = useState(product)

  // Ensure stock uses the most current currentProduct state.
  // If currentProduct lacks inventory data (e.g. initial mount before refreshProduct runs),
  // we still call getEffectiveStock which will return 0 for missing inventory,
  // but the refetch via refreshKey will correct it on next render.
  const stock = getEffectiveStock(currentProduct)
  const minStock = getEffectiveMinStock(currentProduct)
  const maxStock = getEffectiveMaxStock(currentProduct)
  const value = calcInventoryValue(currentProduct.cost_price, stock)
  const location = getEffectiveLocation(currentProduct)

  useEffect(() => {
    loadMovements()
  }, [product?.id, refreshKey])

  useEffect(() => {
    if (refreshKey > 0) {
      refreshProduct()
    } else {
      // On initial mount: if product prop has no inventory data, fetch it now
      // so that currentProduct and stock are set correctly on first render
      if (product?.inventory == null) {
        refreshProduct()
      }
    }
  }, [refreshKey, product?.id, product?.inventory != null])

  async function loadMovements() {
    if (!product?.id) return
    setLoadingHistory(true)
    const { data } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(50)

    setMovements(data || [])
    setLoadingHistory(false)
  }

  async function refreshProduct() {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, sku, description, category, unit, cost_price, unit_price, is_active, created_at, notes,
        inventory ( quantity, min_stock, maximum_stock, supplier_id, location )
      `)
      .eq('id', product.id)
      .single()

    if (data && !error) {
      setCurrentProduct(data)
    } else {
      console.error('[ProductDetail] refreshProduct error:', error)
    }
  }

  async function handleStockAdjustment({ movement_type, quantity, reason }) {
    setSaving(true)
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_product_id: product.id,
      p_movement_type: movement_type,
      p_quantity: quantity,
      p_reason: reason,
    })

    setSaving(false)

    if (error || !data?.success) {
      return { success: false, error: data?.error || error?.message }
    }

    setRefreshKey((k) => k + 1)
    return { success: true }
  }

  async function handleToggleActive() {
    const newActive = !currentProduct.is_active
    const label = newActive ? 'mengaktifkan' : 'menonaktifkan'
    if (!confirm(`Yakin ingin ${label} produk ini?`)) return

    const { error } = await supabase
      .from('products')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .eq('business_id', business.id)

    if (!error) {
      setCurrentProduct((prev) => ({ ...prev, is_active: newActive }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onBack} className="mb-2 text-xs font-semibold text-text-muted hover:text-navy-700">
            ← Kembali ke Daftar
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-navy-700">{currentProduct.name}</h1>
            <StockStatusBadge stock={stock} minimumStock={minStock} />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
            {currentProduct.sku && <span>SKU: {currentProduct.sku}</span>}
            {currentProduct.category && <span>{currentProduct.category}</span>}
            <span>{currentProduct.unit || 'pcs'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit?.(currentProduct)}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-cream"
          >
            Edit
          </button>
          <button
            onClick={handleToggleActive}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
              currentProduct.is_active
                ? 'border-red-200 text-red-500 hover:bg-red-50'
                : 'border-profit-200 text-profit-600 hover:bg-profit-50'
            }`}
          >
            {currentProduct.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-[11px] text-text-muted">Stok Saat Ini</p>
          <p className="mt-1 text-xl font-extrabold text-navy-700">{stock}</p>
          <p className="text-[10px] text-text-muted">{currentProduct.unit || 'pcs'}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-[11px] text-text-muted">Stok Minimum</p>
          <p className="mt-1 text-xl font-extrabold text-navy-700">{minStock}</p>
          <p className="text-[10px] text-text-muted">{currentProduct.unit || 'pcs'}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-[11px] text-text-muted">Stok Maksimal</p>
          <p className="mt-1 text-xl font-extrabold text-navy-700">{maxStock != null && !Number.isNaN(maxStock) ? maxStock : '-'}</p>
          <p className="text-[10px] text-text-muted">{currentProduct.unit || 'pcs'}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <p className="text-[11px] text-text-muted">Nilai Persediaan</p>
          <p className="mt-1 text-xl font-extrabold text-navy-700">{formatCurrency(value)}</p>
          <p className="text-[10px] text-text-muted">HPP × Stok</p>
        </motion.div>
      </div>

      {/* Description */}
      {currentProduct.description && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-xs font-bold text-navy-700">Deskripsi</h4>
          <p className="mt-1 text-[13px] text-text-secondary">{currentProduct.description}</p>
        </div>
      )}

      {/* Location */}
      {location && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-xs font-bold text-navy-700">Lokasi Penyimpanan</h4>
          <p className="mt-1 text-[13px] text-text-secondary">{location}</p>
        </div>
      )}

      {/* Two columns: Adjustment + Restock */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left: Stock Adjustment + History */}
        <div className="space-y-6">
          <StockAdjustmentForm
            currentStock={stock}
            onSubmit={handleStockAdjustment}
            saving={saving}
          />
          <StockHistoryTable movements={movements} loading={loadingHistory} />
        </div>

        {/* Right: Restock Info */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <RestockInfo product={currentProduct} />

          {/* Quick Info */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <h4 className="text-xs font-bold text-navy-700">Detail Harga</h4>
            <div className="mt-2 space-y-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-text-muted">HPP / {currentProduct.unit || 'pcs'}</span>
                <span className="font-semibold text-navy-700">{formatCurrency(currentProduct.cost_price || 0)}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-text-muted">Harga Jual / {currentProduct.unit || 'pcs'}</span>
                <span className="font-semibold text-warm-500">{formatCurrency(currentProduct.unit_price || 0)}</span>
              </div>
              {(currentProduct.cost_price || 0) > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-text-muted">Margin</span>
                  <span className="font-semibold text-profit-600">
                    {Math.round(((currentProduct.unit_price - currentProduct.cost_price) / currentProduct.unit_price) * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
