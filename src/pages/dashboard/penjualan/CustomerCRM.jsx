import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { calculateSummaryFromSupabase, formatCurrency } from '../../../sections/CustomerCRM/customerUtils'
import CustomerForm from '../../../sections/CustomerCRM/CustomerForm'
import CustomerList from '../../../sections/CustomerCRM/CustomerList'
import CustomerDetail from '../../../sections/CustomerCRM/CustomerDetail'

export default function CustomerCRM() {
  const { business } = useAuth()

  // Data
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [detailCustomer, setDetailCustomer] = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast] = useState(null)

  // Load customers
  const loadCustomers = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError
      setCustomers(data || [])
    } catch (err) {
      setError(err.message || 'Gagal memuat data customer')
    }

    setLoading(false)
  }, [business])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  // Summary
  // Calculate summary using LIVE data from sales table
  // This ensures metrics reflect actual transactions, not stale stored fields
  let summary = {
    total: customers.length,
    active: 0,
    newCustomers: 0,
    totalRevenue: 0,
  }

  useEffect(() => {
    ;(async () => {
      if (!business?.id) return
      const { data: { user } } = await supabase.auth.getUser()
      const bizId = business.id

      // Fetch all sales for this business to compute live metrics
      const { data: sales, error } = await supabase
        .from('sales')
        .select('id, customer_id, total, created_at')
        .eq('business_id', bizId)

      if (error) {
        console.error('Error fetching sales for summary:', error)
        summary = calculateSummary(customers)
        return
      }

      // Build customer_id → { count, spent } map
      const customerMetrics = {}
      for (const sale of sales || []) {
        if (sale.customer_id) {
          if (!customerMetrics[sale.customer_id]) {
            customerMetrics[sale.customer_id] = { count: 0, spent: 0 }
          }
          customerMetrics[sale.customer_id].count++
          customerMetrics[sale.customer_id].spent += Number(sale.total || 0)
        }
      }

      const now = Date.now()
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

      let activeCount = 0
      let newCount = 0
      let totalRevenue = 0

      for (const c of customers) {
        const metrics = customerMetrics[c.id] || { count: 0, spent: 0 }

        if (metrics.count > 0) activeCount++
        totalRevenue += metrics.spent

        if (c.created_at && (now - new Date(c.created_at).getTime()) <= THIRTY_DAYS) {
          newCount++
        }
      }

      summary = {
        total: customers.length,
        active: activeCount,
        newCustomers: newCount,
        totalRevenue,
      }
    })()
  }, [business?.id, customers.length])

  // Toast helper
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Add / Edit customer
  async function handleSaveCustomer(formData, existing) {
    if (!business?.id) throw new Error('Business tidak ditemukan')

    if (existing) {
      // Edit
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          notes: formData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('business_id', business.id)

      if (updateError) throw updateError
      showToast('Customer berhasil diupdate')
    } else {
      // Add
      const { error: insertError } = await supabase
        .from('customers')
        .insert({
          business_id: business.id,
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          notes: formData.notes,
        })

      if (insertError) throw insertError
      showToast('Customer berhasil ditambahkan')
    }

    setShowForm(false)
    setEditingCustomer(null)
    await loadCustomers()
  }

  // Edit handler
  function handleEdit(customer) {
    setEditingCustomer(customer)
    setShowForm(true)
  }

  // Delete handler
  function handleDeleteClick(customer) {
    setDeletingCustomer(customer)
  }

  async function confirmDelete() {
    if (!deletingCustomer || !business?.id) return
    setDeleteLoading(true)

    try {
      const { error: deleteError } = await supabase
        .from('customers')
        .delete()
        .eq('id', deletingCustomer.id)
        .eq('business_id', business.id)

      if (deleteError) throw deleteError
      showToast('Customer berhasil dihapus')
      setDeletingCustomer(null)
      await loadCustomers()
    } catch (err) {
      showToast(err.message || 'Gagal menghapus customer', 'error')
    }

    setDeleteLoading(false)
  }

  // Detail click
  function handleClick(customer) {
    setDetailCustomer(customer)
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

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#10B981]">
            Penjualan & CRM
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-700">Customer CRM</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola data pelanggan dan pantau riwayat transaksi mereka.
          </p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setShowForm(true) }}
          className="shrink-0 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Customer
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Customer</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Customer Aktif</p>
          <p className="mt-1 text-2xl font-extrabold text-profit-600">{summary.active}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Customer Baru</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">{summary.newCustomers}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Nilai Transaksi</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">{formatCurrency(summary.totalRevenue)}</p>
        </div>
      </div>

      {/* Customer List */}
      <CustomerList
        customers={customers}
        loading={loading}
        error={error}
        onRetry={loadCustomers}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onClick={handleClick}
        onAddNew={() => { setEditingCustomer(null); setShowForm(true) }}
      />

      {/* Add/Edit Form Modal */}
      <CustomerForm
        show={showForm}
        onClose={() => { setShowForm(false); setEditingCustomer(null) }}
        onSave={handleSaveCustomer}
        editingCustomer={editingCustomer}
        existingCustomers={customers}
      />

      {/* Detail Modal */}
      <CustomerDetail
        show={!!detailCustomer}
        customer={detailCustomer}
        onClose={() => setDetailCustomer(null)}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
      />

      {/* Delete Confirmation Modal */}
      {deletingCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
          onClick={() => !deleteLoading && setDeletingCustomer(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-navy-700">Hapus Customer</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Yakin ingin menghapus <span className="font-semibold text-navy-700">{deletingCustomer.name}</span>?
              Data transaksi tidak akan dihapus.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeletingCustomer(null)}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                {deleteLoading ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
