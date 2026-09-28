import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  sanitizeLeadInput,
  validateLead,
  checkDuplicateLead,
  LEAD_STATUS_LABELS,
  PRIORITY_LABELS,
  getToday,
} from './whatsappSalesUtils'
import DateInput from '../../components/DateInput'

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  customer_id: '',
  product_interest: '',
  estimated_value: '',
  status: 'new',
  priority: 'medium',
  notes: '',
  lead_date: getToday(),
}

export default function WhatsAppLeadForm({ show, onClose, onSave, editingLead, existingLeads, customers }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(null)

  const isEdit = !!editingLead

  useEffect(() => {
    if (show) {
      if (editingLead) {
        setForm({
          name: editingLead.name || '',
          phone: editingLead.phone || '',
          email: editingLead.email || '',
          customer_id: editingLead.customer_id || '',
          product_interest: editingLead.product_interest || '',
          estimated_value: editingLead.estimated_value || '',
          status: editingLead.status || 'new',
          priority: editingLead.priority || 'medium',
          notes: editingLead.notes || '',
          lead_date: editingLead.lead_date || getToday(),
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
      setServerError('')
      setDuplicateWarning(null)
    }
  }, [show, editingLead])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  async function handleSave() {
    const sanitized = sanitizeLeadInput(form)
    const validation = validateLead(sanitized)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    // Duplicate check
    const dup = checkDuplicateLead(sanitized, existingLeads, { excludeId: editingLead?.id })
    if (dup.isDuplicate) {
      setDuplicateWarning(dup)
      return
    }

    await doSave(sanitized)
  }

  async function doSave(data) {
    setSaving(true)
    setServerError('')
    try {
      await onSave(data, editingLead)
      onClose()
    } catch (err) {
      setServerError(err.message || 'Gagal menyimpan')
    }
    setSaving(false)
  }

  function handleDuplicateConfirm() {
    setDuplicateWarning(null)
    doSave(sanitizeLeadInput(form))
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
            <h2 className="text-lg font-bold text-navy-700">{isEdit ? 'Edit Lead' : 'Tambah Lead Baru'}</h2>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {serverError}
              </div>
            )}

            {duplicateWarning && (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm">
                <p className="font-medium text-yellow-700">Lead duplikat terdeteksi ({duplicateWarning.field === 'phone' ? 'nomor HP' : 'email'})</p>
                <p className="mt-1 text-yellow-600">Sudah ada lead dengan {duplicateWarning.field === 'phone' ? 'nomor' : 'email'} ini: {duplicateWarning.existing.name}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setDuplicateWarning(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-cream">
                    Kembali Edit
                  </button>
                  <button onClick={handleDuplicateConfirm} className="rounded-lg bg-warm-400 px-3 py-1.5 text-xs font-bold text-white hover:shadow-md">
                    Tetap Simpan
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-text-muted">Nama Lead <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Nama kontak"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.name ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Nomor HP</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="08123456789"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.phone ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="email@contoh.com"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.email ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                </div>
              </div>

              {/* Customer */}
              <div>
                <label className="text-xs font-medium text-text-muted">Customer (opsional)</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                >
                  <option value="">Tanpa Customer</option>
                  {customers?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Product Interest + Estimated Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Produk / Minat</label>
                  <input
                    type="text"
                    value={form.product_interest}
                    onChange={(e) => set('product_interest', e.target.value)}
                    placeholder="Laptop, HP, dll"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Estimasi Nilai (Rp)</label>
                  <input
                    type="number"
                    value={form.estimated_value}
                    onChange={(e) => set('estimated_value', e.target.value)}
                    placeholder="0"
                    min="0"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.estimated_value ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                  />
                  {errors.estimated_value && <p className="mt-1 text-xs text-red-500">{errors.estimated_value}</p>}
                </div>
              </div>

              {/* Status + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
                  >
                    {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => set('priority', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lead Date */}
              <div>
                <label className="text-xs font-medium text-text-muted">Tanggal Lead</label>
                <DateInput
                  value={form.lead_date}
                  onChange={(e) => set('lead_date', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-text-muted">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Catatan tambahan..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50 resize-none"
                />
              </div>

              {form.status === 'won' && (
                <div className="rounded-lg border border-profit-200 bg-profit-50 p-3 text-xs text-profit-600">
                  Lead yang diubah ke status Won akan ditandai sebagai converted. Jika customer dipilih, akan di-link ke customer tersebut.
                </div>
              )}
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
