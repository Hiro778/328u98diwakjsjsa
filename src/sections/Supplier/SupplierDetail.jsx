import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  getRestockProducts,
} from '../../lib/supplierUtils'
import {
  getStockStatusLabel,
  getStockStatusColors,
} from '../../lib/inventoryUtils'

const TABS = [
  { id: 'profile', label: 'Profil' },
  { id: 'products', label: 'Produk Dipasok' },
  { id: 'restock', label: 'Restock' },
]

export default function SupplierDetail({ show, supplier, onClose, onEdit, onToggleActive }) {
  const { business } = useAuth()
  const [tab, setTab] = useState('profile')
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  useEffect(() => {
    if (show && supplier?.id && business?.id) {
      setLoadingProducts(true)
      setTab('profile')

      supabase
        .from('inventory')
        .select(`
          id, quantity, min_stock, maximum_stock, supplier_id, updated_at,
          product:products(id, name, sku, cost_price, unit_price, is_active, category)
        `)
        .eq('supplier_id', supplier.id)
        .then(({ data }) => {
          const items = (data || [])
            .filter((row) => row.product)
            .map((row) => ({
              ...row.product,
              inventory: {
                id: row.id,
                quantity: row.quantity,
                min_stock: row.min_stock,
                maximum_stock: row.maximum_stock,
                supplier_id: row.supplier_id,
                updated_at: row.updated_at,
              },
            }))
          setProducts(items)
          setLoadingProducts(false)
        })
        .catch(() => {
          setProducts([])
          setLoadingProducts(false)
        })
    }
  }, [show, supplier?.id, business?.id])

  if (!show || !supplier) return null

  const restockProducts = getRestockProducts(products)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cream text-xl">
                🏪
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-700">{supplier.name}</h2>
                <div className="flex items-center gap-2">
                  {supplier.supplier_code && (
                    <span className="font-mono text-xs text-text-muted">{supplier.supplier_code}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    supplier.is_active !== false
                      ? 'bg-profit-50 text-profit-600'
                      : 'bg-red-50 text-red-500'
                  }`}>
                    {supplier.is_active !== false ? 'Aktif' : 'Tidak Aktif'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-cream"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border px-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                  tab === t.id ? 'text-warm-500' : 'text-text-muted hover:text-navy-700'
                }`}
              >
                {t.label}
                {t.id === 'restock' && restockProducts.length > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {restockProducts.length}
                  </span>
                )}
                {tab === t.id && (
                  <motion.div
                    layoutId="supplier-tab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-warm-400"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Profile Tab */}
            {tab === 'profile' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Nama</p>
                    <p className="mt-0.5 text-sm font-semibold text-navy-700">{supplier.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Kode Supplier</p>
                    <p className="mt-0.5 font-mono text-sm text-navy-700">{supplier.supplier_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Kontak Person</p>
                    <p className="mt-0.5 text-sm text-navy-700">{supplier.contact_person || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Telepon</p>
                    <p className="mt-0.5 text-sm text-navy-700">{supplier.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Email</p>
                    <p className="mt-0.5 text-sm text-navy-700">{supplier.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Status</p>
                    <p className={`mt-0.5 text-sm font-semibold ${
                      supplier.is_active !== false ? 'text-profit-600' : 'text-red-500'
                    }`}>
                      {supplier.is_active !== false ? 'Aktif' : 'Tidak Aktif'}
                    </p>
                  </div>
                </div>
                {supplier.address && (
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Alamat</p>
                    <p className="mt-0.5 text-sm text-navy-700">{supplier.address}</p>
                  </div>
                )}
                {supplier.notes && (
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Catatan</p>
                    <p className="mt-0.5 text-sm text-navy-700">{supplier.notes}</p>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Dibuat</p>
                    <p className="mt-0.5 text-sm text-navy-700">
                      {supplier.created_at ? new Date(supplier.created_at).toLocaleDateString('id-ID') : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Terakhir Diperbarui</p>
                    <p className="mt-0.5 text-sm text-navy-700">
                      {supplier.updated_at ? new Date(supplier.updated_at).toLocaleDateString('id-ID') : '-'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Products Tab */}
            {tab === 'products' && (
              <div>
                {loadingProducts ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-navy-50" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="rounded-xl border border-border bg-cream/30 p-6 text-center">
                    <p className="text-sm font-semibold text-navy-700">Tidak ada produk</p>
                    <p className="mt-1 text-xs text-text-muted">Supplier ini belum terkait dengan produk mana pun.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-cream/50">
                          <th className="px-3 py-2 text-xs font-bold text-text-muted uppercase">Produk</th>
                          <th className="px-3 py-2 text-xs font-bold text-text-muted uppercase">SKU</th>
                          <th className="px-3 py-2 text-xs font-bold text-text-muted uppercase">HPP</th>
                          <th className="px-3 py-2 text-xs font-bold text-text-muted uppercase">Stok</th>
                          <th className="px-3 py-2 text-xs font-bold text-text-muted uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => {
                          const stock = p.inventory?.quantity ?? 0
                          const minStock = p.inventory?.min_stock ?? 0
                          const statusColors = getStockStatusColors(stock, minStock)
                          return (
                            <tr key={p.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-semibold text-navy-700">{p.name}</td>
                              <td className="px-3 py-2 font-mono text-text-muted">{p.sku || '-'}</td>
                              <td className="px-3 py-2 text-text-secondary">
                                {p.cost_price ? `Rp ${Number(p.cost_price).toLocaleString('id-ID')}` : '-'}
                              </td>
                              <td className="px-3 py-2 text-text-secondary">{stock}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColors.bg} ${statusColors.text}`}>
                                  {getStockStatusLabel(stock, minStock)}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Restock Tab */}
            {tab === 'restock' && (
              <div>
                {loadingProducts ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-xl bg-navy-50" />
                    ))}
                  </div>
                ) : restockProducts.length === 0 ? (
                  <div className="rounded-xl border border-border bg-cream/30 p-6 text-center">
                    <p className="text-sm font-semibold text-navy-700">Semua stok mencukupi</p>
                    <p className="mt-1 text-xs text-text-muted">Tidak ada produk yang perlu direstock.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {restockProducts.map((p) => {
                      const statusColors = getStockStatusColors(p._currentStock, p._minStock)
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-navy-700">{p.name}</p>
                            <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                              <span>Stok: {p._currentStock}</span>
                              <span>Min: {p._minStock}</span>
                              {p._maxStock > 0 ? (
                                <span>Target: {p._maxStock}</span>
                              ) : (
                                <span className="text-warm-500">Target belum ditentukan</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColors.bg} ${statusColors.text}`}>
                              {getStockStatusLabel(p._currentStock, p._minStock)}
                            </span>
                            {p._recommendedRestock !== null && p._recommendedRestock > 0 && (
                              <p className="mt-1 text-xs font-bold text-warm-500">
                                Restock: {p._recommendedRestock}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 border-t border-border p-5">
            <button
              onClick={() => onEdit(supplier)}
              className="rounded-xl bg-warm-400 px-4 py-2 text-sm font-bold text-white transition-all hover:shadow-md"
            >
              Edit
            </button>
            <button
              onClick={() => onToggleActive(supplier)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                supplier.is_active !== false
                  ? 'border-red-200 text-red-500 hover:bg-red-50'
                  : 'border-profit-200 text-profit-600 hover:bg-profit-50'
              }`}
            >
              {supplier.is_active !== false ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
