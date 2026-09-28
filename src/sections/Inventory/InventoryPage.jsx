import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import InventoryDashboard from './InventoryDashboard'
import ProductInventoryList from './ProductInventoryList'
import ProductDetail from './ProductDetail'
import ProductForm from './ProductForm'
import BackButton from '../../components/BackButton'

/**
 * Main Inventory Management page.
 * Manages view state: dashboard → list → detail → form
 */
export default function InventoryPage() {
  const { business } = useAuth()
  const [view, setView] = useState('dashboard') // dashboard | list | detail | form
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  async function loadSuppliers() {
    if (!business?.id) return
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name')
    setSuppliers(data || [])
  }

  function handleViewProduct(product) {
    setSelectedProduct(product)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleAddProduct() {
    setSelectedProduct(null)
    loadSuppliers()
    setView('form')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEditProduct(product) {
    setSelectedProduct(product)
    loadSuppliers()
    setView('form')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSave() {
    setRefreshKey((k) => k + 1)
    setView('list')
    setSelectedProduct(null)
  }

  function handleBack() {
    setRefreshKey((k) => k + 1)
    setView('list')
    setSelectedProduct(null)
  }

  return (
    <div>
      <BackButton
        fallbackUrl="/dashboard/operasional"
        label={view === 'detail' ? 'Kembali ke Daftar Produk' : view !== 'dashboard' ? 'Kembali ke Dashboard Persediaan' : 'Kembali'}
        onClick={
          view === 'detail'
            ? handleBack
            : view !== 'dashboard'
            ? () => { setView('dashboard'); setSelectedProduct(null) }
            : undefined
        }
      />
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-warm-400">
          Operasional
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-navy-700">Persediaan</h1>
          {view !== 'dashboard' && (
            <button
              onClick={() => { setView('dashboard'); setSelectedProduct(null) }}
              className="text-xs font-semibold text-text-muted hover:text-navy-700"
            >
              Dashboard
            </button>
          )}
          {view === 'detail' && (
            <span className="text-xs text-text-muted">› Daftar Produk</span>
          )}
        </div>
        {view === 'dashboard' && (
          <p className="mt-1 text-sm text-text-secondary">
            Kelola stok dan persediaan produk Anda.
          </p>
        )}
      </motion.div>

      {/* Content */}
      <div className="mt-6">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <InventoryDashboard onViewProduct={handleViewProduct} />
            <div className="flex justify-center">
              <button
                onClick={() => setView('list')}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream"
              >
                Lihat Semua Produk →
              </button>
            </div>
          </div>
        )}

        {view === 'list' && (
          <ProductInventoryList
            onViewProduct={handleViewProduct}
            onAddProduct={handleAddProduct}
            refreshKey={refreshKey}
          />
        )}

        {view === 'detail' && selectedProduct && (
          <ProductDetail
            product={selectedProduct}
            onBack={handleBack}
            onEdit={(current) => handleEditProduct(current || selectedProduct)}
          />
        )}

        {view === 'form' && (
          <ProductForm
            product={selectedProduct}
            suppliers={suppliers}
            onSave={handleSave}
            onCancel={() => { setView(selectedProduct ? 'detail' : 'list'); if (!selectedProduct) setSelectedProduct(null) }}
          />
        )}
      </div>
    </div>
  )
}
