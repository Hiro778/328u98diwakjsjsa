import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import SupplierDashboard from '../../../sections/Supplier/SupplierDashboard'
import SupplierList from '../../../sections/Supplier/SupplierList'
import SupplierForm from '../../../sections/Supplier/SupplierForm'
import SupplierDetail from '../../../sections/Supplier/SupplierDetail'

export default function SupplierDatabasePage() {
  const { business } = useAuth()

  // Data
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [view, setView] = useState('dashboard') // dashboard | list
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [detailSupplier, setDetailSupplier] = useState(null)
  const [toast, setToast] = useState(null)

  // Load suppliers with product counts
  const loadSuppliers = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')

    try {
      // Load suppliers
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('business_id', business.id)
        .order('name')

      if (supplierError) throw supplierError

      const supplierList = supplierData || []

      // Load product counts from inventory
      if (supplierList.length > 0) {
        const { data: inventoryData } = await supabase
          .from('inventory')
          .select('supplier_id')
          .not('supplier_id', 'is', null)

        // Count products per supplier
        const countMap = {}
        for (const row of inventoryData || []) {
          if (row.supplier_id) {
            countMap[row.supplier_id] = (countMap[row.supplier_id] || 0) + 1
          }
        }

        // Attach counts
        for (const s of supplierList) {
          s._productCount = countMap[s.id] || 0
        }
      }

      setSuppliers(supplierList)
    } catch (err) {
      setError(err.message || 'Gagal memuat data supplier')
    }

    setLoading(false)
  }, [business])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  // Toast helper
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Save supplier (add/edit)
  async function handleSaveSupplier(formData, existing) {
    if (!business?.id) throw new Error('Business tidak ditemukan')

    if (existing) {
      const { error: updateError } = await supabase
        .from('suppliers')
        .update({
          name: formData.name,
          supplier_code: formData.supplier_code || '',
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          notes: formData.notes,
          is_active: formData.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('business_id', business.id)

      if (updateError) {
        console.error('[Supplier UPDATE] Error:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        })
        if (updateError.code === '23505') {
          throw new Error('Kode supplier sudah digunakan')
        }
        throw new Error(updateError.message || 'Gagal memperbarui supplier')
      }
      showToast('Supplier berhasil diupdate')
    } else {
      const { error: insertError } = await supabase
        .from('suppliers')
        .insert({
          business_id: business.id,
          name: formData.name,
          supplier_code: formData.supplier_code || '',
          contact_person: formData.contact_person,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          notes: formData.notes,
          is_active: formData.is_active,
        })

      if (insertError) {
        console.error('[Supplier INSERT] Error:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        })
        if (insertError.code === '23505') {
          throw new Error('Kode supplier sudah digunakan')
        }
        // Surface informative message based on error type
        if (insertError.code === '42703' || insertError.message?.includes('column')) {
          throw new Error('Schema belum siap. Hubungi admin untuk menjalankan migration supplier terbaru.')
        }
        if (insertError.code === '23503') {
          throw new Error('Business tidak valid. Silakan login ulang.')
        }
        throw new Error(insertError.message || 'Gagal menambahkan supplier')
      }
      showToast('Supplier berhasil ditambahkan')
    }

    setShowForm(false)
    setEditingSupplier(null)
    await loadSuppliers()
  }

  // Toggle active status
  async function handleToggleActive(supplier) {
    if (!business?.id) return
    const newStatus = supplier.is_active === false ? true : false
    const action = newStatus ? 'mengaktifkan' : 'menonaktifkan'

    if (!confirm(`${action === 'mengaktifkan' ? 'Aktifkan' : 'Nonaktifkan'} supplier "${supplier.name}"?`)) return

    const { error } = await supabase
      .from('suppliers')
      .update({
        is_active: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplier.id)
      .eq('business_id', business.id)

    if (error) {
      showToast(`Gagal ${action} supplier`, 'error')
      return
    }

    showToast(`Supplier berhasil ${action === 'mengaktifkan' ? 'diaktifkan' : 'dinonaktifkan'}`)
    await loadSuppliers()

    // Update detail view if open
    if (detailSupplier?.id === supplier.id) {
      setDetailSupplier({ ...supplier, is_active: newStatus })
    }
  }

  // Open form for add
  function handleAddSupplier() {
    setEditingSupplier(null)
    setShowForm(true)
  }

  // Open form for edit
  function handleEditSupplier(supplier) {
    setEditingSupplier(supplier)
    setShowForm(true)
  }

  // View supplier detail
  function handleViewSupplier(supplier) {
    setDetailSupplier(supplier)
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-profit-200 bg-profit-50 text-profit-600'
        }`}>
          {toast.message}
        </div>
      )}

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
          <h1 className="text-2xl font-extrabold text-navy-700">Supplier Database</h1>
          {view !== 'dashboard' && (
            <button
              onClick={() => setView('dashboard')}
              className="text-xs font-semibold text-text-muted hover:text-navy-700"
            >
              Dashboard
            </button>
          )}
        </div>
        {view === 'dashboard' && (
          <p className="mt-1 text-sm text-text-secondary">
            Kelola data supplier dan pantau produk yang dipasok.
          </p>
        )}
      </motion.div>

      {/* Add Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={handleAddSupplier}
          className="rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
        >
          + Tambah Supplier
        </button>
      </div>

      {/* Content */}
      <div className="mt-4">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <SupplierDashboard
              suppliers={suppliers}
              onViewSupplier={handleViewSupplier}
            />
            {suppliers.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={() => setView('list')}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream"
                >
                  Lihat Semua Supplier →
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'list' && (
          <SupplierList
            suppliers={suppliers}
            loading={loading}
            error={error}
            onRetry={loadSuppliers}
            onView={handleViewSupplier}
            onEdit={handleEditSupplier}
            onToggleActive={handleToggleActive}
            onAddNew={handleAddSupplier}
          />
        )}
      </div>

      {/* Add/Edit Form Modal */}
      <SupplierForm
        show={showForm}
        supplier={editingSupplier}
        existingSuppliers={suppliers}
        onClose={() => { setShowForm(false); setEditingSupplier(null) }}
        onSave={handleSaveSupplier}
      />

      {/* Detail Modal */}
      <SupplierDetail
        show={!!detailSupplier}
        supplier={detailSupplier}
        onClose={() => setDetailSupplier(null)}
        onEdit={(s) => { setDetailSupplier(null); handleEditSupplier(s) }}
        onToggleActive={(s) => { handleToggleActive(s) }}
      />
    </div>
  )
}
