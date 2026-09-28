import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../../services/notificationService'
import { useAuth } from '../../../context/AuthContext'
import {
  calculateSummary,
  formatCurrency,
  normalizeInvoice,
} from '../../../sections/InvoiceFollowUp/invoiceFollowUpUtils'
import InvoiceFollowUpList from '../../../sections/InvoiceFollowUp/InvoiceFollowUpList'
import InvoiceFollowUpDetail from '../../../sections/InvoiceFollowUp/InvoiceFollowUpDetail'
import InvoiceForm from '../../../sections/InvoiceFollowUp/InvoiceForm'
import PaymentForm from '../../../sections/InvoiceFollowUp/PaymentForm'
import FollowUpForm from '../../../sections/InvoiceFollowUp/FollowUpForm'
import BackButton from '../../../components/BackButton'

export default function InvoiceFollowUp() {
  const { business } = useAuth()

  // Data
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [followups, setFollowups] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // UI state
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [followupInvoice, setFollowupInvoice] = useState(null)
  const [showFollowupForm, setShowFollowupForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [paymentInvoice, setPaymentInvoice] = useState(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [deletingInvoice, setDeletingInvoice] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast] = useState(null)

  // Load data
  const loadData = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')

    try {
      const [invoicesRes, customersRes, followupsRes, paymentsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('business_id', business.id)
          .order('due_date', { ascending: true }),
        supabase
          .from('customers')
          .select('id, name, phone, email')
          .eq('business_id', business.id),
        supabase
          .from('invoice_followups')
          .select('*')
          .eq('business_id', business.id),
        supabase
          .from('invoice_payments')
          .select('*')
          .eq('business_id', business.id),
      ])

      if (invoicesRes.error) throw invoicesRes.error
      if (customersRes.error) throw customersRes.error
      if (followupsRes.error) throw followupsRes.error
      if (paymentsRes.error) throw paymentsRes.error

      const rawInvoices = invoicesRes.data || []
      const custs = customersRes.data || []
      const followupsData = followupsRes.data || []
      const paymentsData = paymentsRes.data || []

      // Calculate paid_amount from payments for each invoice
      const paidAmounts = {}
      for (const p of paymentsData) {
        paidAmounts[p.invoice_id] = (paidAmounts[p.invoice_id] || 0) + Number(p.amount || 0)
      }

      // Merge paid amounts into invoices
      const withPayments = rawInvoices.map(inv => ({
        ...inv,
        paid_amount: paidAmounts[inv.id] || Number(inv.paid_amount || 0),
      }))

      const normalized = withPayments.map(inv => normalizeInvoice(inv, custs))

      setInvoices(normalized)
      setCustomers(custs)
      setFollowups(followupsData)
      setPayments(paymentsData)
    } catch (err) {
      setError(err.message || 'Gagal memuat data')
    }

    setLoading(false)
  }, [business])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build followups map by invoice_id
  const followupsByInvoice = {}
  for (const f of followups) {
    if (!followupsByInvoice[f.invoice_id]) followupsByInvoice[f.invoice_id] = []
    followupsByInvoice[f.invoice_id].push(f)
  }

  // Build payments map by invoice_id
  const paymentsByInvoice = {}
  for (const p of payments) {
    if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = []
    paymentsByInvoice[p.invoice_id].push(p)
  }

  // Summary
  const summary = calculateSummary(invoices)

  // Toast
  function showToast(message, type = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Invoice CRUD
  function handleAddInvoice() {
    setEditingInvoice(null)
    setShowInvoiceForm(true)
  }

  function handleEditInvoice(invoice) {
    setEditingInvoice(invoice)
    setShowInvoiceForm(true)
  }

  async function handleSaveInvoice(formData, existing) {
    if (!business?.id) throw new Error('Business tidak ditemukan')

    if (existing) {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          invoice_number: formData.invoice_number,
          customer_id: formData.customer_id || null,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          subtotal: formData.subtotal,
          discount: formData.discount,
          tax: formData.tax,
          amount: formData.amount,
          notes: formData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('business_id', business.id)

      if (updateError) throw updateError
      showToast('Invoice berhasil diupdate')
      const { data: newInvoice, error: insertError } = await supabase
        .from('invoices')
        .insert({
          business_id: business.id,
          customer_id: formData.customer_id || null,
          invoice_number: formData.invoice_number,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          subtotal: formData.subtotal,
          discount: formData.discount,
          tax: formData.tax,
          amount: formData.amount,
          notes: formData.notes,
        })
        .select()
        .single()

      if (insertError) throw insertError
      showToast('Invoice berhasil ditambahkan')

      // Create persistent notification
      try {
        const customerName = customers.find((c) => c.id === formData.customer_id)?.name || 'Pelanggan'
        await createNotification({
          business_id: business.id,
          title: 'Invoice dibuat',
          message: `Invoice ${formData.invoice_number} untuk ${customerName} berhasil dibuat.`,
          category: 'sales',
          priority: 'normal',
          action_url: '/dashboard/penjualan/invoice-follow-up',
          dedup_key: `inv_created_${newInvoice?.id || formData.invoice_number}`,
        })
      } catch (notifErr) {
        console.warn('[Invoice] Notification creation failed:', notifErr)
      }
    }

    setShowInvoiceForm(false)
    setEditingInvoice(null)
    await loadData()
  }

  // Delete invoice
  function handleDeleteClick(invoice) {
    setDeletingInvoice(invoice)
  }

  async function confirmDelete() {
    if (!deletingInvoice || !business?.id) return
    setDeleteLoading(true)

    try {
      // Delete followups first
      await supabase
        .from('invoice_followups')
        .delete()
        .eq('invoice_id', deletingInvoice.id)
        .eq('business_id', business.id)

      // Delete payments
      await supabase
        .from('invoice_payments')
        .delete()
        .eq('invoice_id', deletingInvoice.id)
        .eq('business_id', business.id)

      // Delete invoice
      const { error: deleteError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', deletingInvoice.id)
        .eq('business_id', business.id)

      if (deleteError) throw deleteError
      showToast('Invoice berhasil dihapus')
      setDeletingInvoice(null)
      await loadData()
    } catch (err) {
      showToast(err.message || 'Gagal menghapus invoice', 'error')
    }

    setDeleteLoading(false)
  }

  // Payment
  function handlePaymentClick(invoice) {
    setPaymentInvoice(invoice)
    setShowPaymentForm(true)
  }

  async function handleSavePayment(formData) {
    if (!business?.id || !paymentInvoice) throw new Error('Data tidak lengkap')

    const { error: insertError } = await supabase
      .from('invoice_payments')
      .insert({
        business_id: business.id,
        invoice_id: paymentInvoice.id,
        amount: formData.amount,
        payment_date: formData.payment_date,
        method: formData.method,
        notes: formData.notes,
      })

    if (insertError) throw insertError

    // Update invoice paid_amount
    const newPaid = (paymentsByInvoice[paymentInvoice.id] || []).reduce((sum, p) => sum + Number(p.amount || 0), 0) + formData.amount
    const total = Number(paymentInvoice.amount || 0)
    const newPaidAmount = Math.min(newPaid, total)

    await supabase
      .from('invoices')
      .update({ paid_amount: newPaidAmount, updated_at: new Date().toISOString() })
      .eq('id', paymentInvoice.id)
      .eq('business_id', business.id)

    showToast('Pembayaran berhasil dicatat')

    // Create persistent notification for payment
    try {
      const amountFmt = Number(formData.amount).toLocaleString('id-ID')
      await createNotification({
        business_id: business.id,
        title: 'Pembayaran Invoice Diterima',
        message: `Pembayaran senilai Rp ${amountFmt} untuk invoice ${paymentInvoice.invoice_number} telah dicatat.`,
        category: 'invoice',
        priority: 'normal',
        action_url: '/dashboard/penjualan/invoice-follow-up',
        dedup_key: `inv_payment_${paymentInvoice.id}_${Date.now()}`,
      })
    } catch (notifErr) {
      console.warn('[Invoice] Payment notification failed:', notifErr)
    }

    setShowPaymentForm(false)
    setPaymentInvoice(null)
    await loadData()
  }

  // Follow-up
  function handleFollowupClick(invoice) {
    setFollowupInvoice(invoice)
    setShowFollowupForm(true)
  }

  async function handleSaveFollowup(formData) {
    if (!business?.id || !followupInvoice) throw new Error('Data tidak lengkap')

    const { error: insertError } = await supabase
      .from('invoice_followups')
      .insert({
        business_id: business.id,
        invoice_id: followupInvoice.id,
        follow_up_date: formData.follow_up_date,
        method: formData.method,
        result: formData.result,
        next_follow_up_date: formData.next_follow_up_date,
        note: formData.note,
      })

    if (insertError) throw insertError

    showToast('Follow-up berhasil dicatat')
    setShowFollowupForm(false)
    setFollowupInvoice(null)
    await loadData()
  }

  // Contact
  function handleContact(invoice) {
    if (!invoice.customer_phone) return
    const phone = invoice.customer_phone.replace(/[^0-9+]/g, '')
    const isWhatsApp = confirm('Buka WhatsApp? Klik Batal untuk menelepon.')
    if (isWhatsApp) {
      const waPhone = phone.replace(/^0/, '62').replace(/^\+/, '')
      window.open(`https://wa.me/${waPhone}`, '_blank')
    } else {
      window.open(`tel:${phone}`, '_self')
    }
  }

  // Detail
  function handleDetailClick(invoice) {
    setDetailInvoice(invoice)
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
      <BackButton
        fallbackUrl="/dashboard/penjualan"
        label={detailInvoice ? 'Kembali ke Daftar Invoice' : 'Kembali'}
        onClick={detailInvoice ? () => setDetailInvoice(null) : undefined}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#10B981]">
            Penjualan & CRM
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-700">Invoice Follow-up</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Pantau piutang dan tindak lanjut invoice pelanggan.
          </p>
        </div>
        <button
          onClick={handleAddInvoice}
          className="shrink-0 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Invoice
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Invoice</p>
          <p className="mt-1 text-2xl font-extrabold text-navy-700">{invoices.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Total Piutang</p>
          <p className="mt-1 text-2xl font-extrabold text-warm-500">{formatCurrency(summary.totalReceivable)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Terlambat</p>
          <p className="mt-1 text-2xl font-extrabold text-red-500">{summary.overdueCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-bold text-text-muted uppercase">Lunas</p>
          <p className="mt-1 text-2xl font-extrabold text-profit-600">{summary.paidCount}</p>
        </div>
      </div>

      {/* Overdue amount warning */}
      {summary.overdueAmount > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold text-red-600">
            Total piutang terlambat: {formatCurrency(summary.overdueAmount)}
          </p>
        </div>
      )}

      {/* Invoice List */}
      <InvoiceFollowUpList
        invoices={invoices}
        followupsByInvoice={followupsByInvoice}
        loading={loading}
        error={error}
        onRetry={loadData}
        onClick={handleDetailClick}
        onFollowup={handleFollowupClick}
        onContact={handleContact}
        onEdit={handleEditInvoice}
        onDelete={handleDeleteClick}
        onPayment={handlePaymentClick}
      />

      {/* Detail Modal */}
      <InvoiceFollowUpDetail
        show={!!detailInvoice}
        invoice={detailInvoice}
        followups={detailInvoice ? (followupsByInvoice[detailInvoice.id] || []) : []}
        payments={detailInvoice ? (paymentsByInvoice[detailInvoice.id] || []) : []}
        onClose={() => setDetailInvoice(null)}
        onFollowup={handleFollowupClick}
        onContact={handleContact}
        onEdit={handleEditInvoice}
        onDelete={handleDeleteClick}
        onPayment={handlePaymentClick}
      />

      {/* Invoice Form Modal */}
      <InvoiceForm
        show={showInvoiceForm}
        onClose={() => { setShowInvoiceForm(false); setEditingInvoice(null) }}
        onSave={handleSaveInvoice}
        editingInvoice={editingInvoice}
        customers={customers}
        existingInvoices={invoices}
      />

      {/* Payment Form Modal */}
      <PaymentForm
        show={showPaymentForm}
        onClose={() => { setShowPaymentForm(false); setPaymentInvoice(null) }}
        onSave={handleSavePayment}
        invoice={paymentInvoice}
      />

      {/* Follow-up Form Modal */}
      <FollowUpForm
        show={showFollowupForm}
        onClose={() => { setShowFollowupForm(false); setFollowupInvoice(null) }}
        onSave={handleSaveFollowup}
        invoice={followupInvoice}
      />

      {/* Delete Confirmation Modal */}
      {deletingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
          onClick={() => !deleteLoading && setDeletingInvoice(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-navy-700">Hapus Invoice</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Yakin ingin menghapus invoice <span className="font-semibold text-navy-700">{deletingInvoice.invoice_number}</span>?
              Semua data pembayaran dan follow-up terkait juga akan dihapus.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeletingInvoice(null)}
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
          </div>
        </div>
      )}
    </div>
  )
}
