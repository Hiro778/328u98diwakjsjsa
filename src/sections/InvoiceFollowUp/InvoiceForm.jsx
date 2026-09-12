import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  validateInvoice,
  checkDuplicateInvoiceNumber,
  calculateTotal,
  safeNumber,
  getToday,
} from './invoiceFollowUpUtils'

const EMPTY_FORM = {
  invoice_number: '',
  customer_id: '',
  issue_date: getToday(),
  due_date: '',
  subtotal: '',
  discount: '',
  tax: '',
  notes: '',
}

export default function InvoiceForm({ show, onClose, onSave, editingInvoice, customers, existingInvoices }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  const isEdit = !!editingInvoice

  useEffect(() => {
    if (show) {
      if (editingInvoice) {
        setForm({
          invoice_number: editingInvoice.invoice_number || '',
          customer_id: editingInvoice.customer_id || '',
          issue_date: editingInvoice.issue_date || getToday(),
          due_date: editingInvoice.due_date || '',
          subtotal: editingInvoice.subtotal?.toString() || editingInvoice.amount?.toString() || '',
          discount: editingInvoice.discount?.toString() || '',
          tax: editingInvoice.tax?.toString() || '',
          notes: editingInvoice.notes || '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
      setServerError('')
    }
  }, [show, editingInvoice])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    setServerError('')
  }

  // Calculate preview total
  const previewTotal = calculateTotal(form.subtotal, form.discount, form.tax)

  async function handleSave() {
    const total = calculateTotal(form.subtotal, form.discount, form.tax)
    const submitData = {
      ...form,
      subtotal: safeNumber(form.subtotal),
      discount: safeNumber(form.discount),
      tax: safeNumber(form.tax),
      amount: total,
    }

    const { valid, errors: validationErrors } = validateInvoice(submitData)
    if (!valid) {
      setErrors(validationErrors)
      return
    }

    // Duplicate check
    if (checkDuplicateInvoiceNumber(form.invoice_number, existingInvoices || [], { excludeId: editingInvoice?.id })) {
      setErrors({ invoice_number: 'Nomor invoice sudah digunakan' })
      return
    }

    setSaving(true)
    setServerError('')

    try {
      await onSave(submitData, editingInvoice)
    } catch (err) {
      setServerError(err.message || 'Terjadi kesalahan.')
      setSaving(false)
      return
    }

    setSaving(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
          onClick={() => !saving && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-bold text-navy-700">
              {isEdit ? 'Edit Invoice' : 'Tambah Invoice'}
            </h2>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Invoice Number */}
              <div>
                <label className="text-xs font-medium text-text-muted">
                  Nomor Invoice <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.invoice_number}
                  onChange={(e) => set('invoice_number', e.target.value)}
                  placeholder="INV-001"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.invoice_number ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.invoice_number && <p className="mt-1 text-xs text-red-500">{errors.invoice_number}</p>}
              </div>

              {/* Customer */}
              <div>
                <label className="text-xs font-medium text-text-muted">Customer</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                >
                  <option value="">Tanpa Customer</option>
                  {(customers || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">
                    Tanggal Invoice <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => set('issue_date', e.target.value)}
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                      errors.issue_date ? 'border-red-400' : 'border-border focus:border-warm-400'
                    }`}
                  />
                  {errors.issue_date && <p className="mt-1 text-xs text-red-500">{errors.issue_date}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">
                    Jatuh Tempo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => set('due_date', e.target.value)}
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                      errors.due_date ? 'border-red-400' : 'border-border focus:border-warm-400'
                    }`}
                  />
                  {errors.due_date && <p className="mt-1 text-xs text-red-500">{errors.due_date}</p>}
                </div>
              </div>

              {/* Financial */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Subtotal</label>
                  <input
                    type="number"
                    value={form.subtotal}
                    onChange={(e) => set('subtotal', e.target.value)}
                    placeholder="0"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Diskon</label>
                  <input
                    type="number"
                    value={form.discount}
                    onChange={(e) => set('discount', e.target.value)}
                    placeholder="0"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Pajak</label>
                  <input
                    type="number"
                    value={form.tax}
                    onChange={(e) => set('tax', e.target.value)}
                    placeholder="0"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>
              </div>

              {/* Total preview */}
              <div className="rounded-lg border border-border bg-cream px-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Total</span>
                  <span className="font-bold text-navy-700">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(previewTotal)}
                  </span>
                </div>
              </div>
              {errors.amount && <p className="text-xs text-red-500">{errors.amount}</p>}

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-text-muted">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Catatan invoice (opsional)"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Simpan'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
