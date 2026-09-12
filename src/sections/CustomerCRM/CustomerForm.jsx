import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateCustomer, checkDuplicate, sanitizeCustomerInput } from './customerUtils'

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

export default function CustomerForm({ show, onClose, onSave, editingCustomer, existingCustomers }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  const [serverError, setServerError] = useState('')

  const isEdit = !!editingCustomer

  useEffect(() => {
    if (show) {
      if (editingCustomer) {
        setForm({
          name: editingCustomer.name || '',
          phone: editingCustomer.phone || '',
          email: editingCustomer.email || '',
          address: editingCustomer.address || '',
          notes: editingCustomer.notes || '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
      setDuplicateWarning(null)
      setServerError('')
    }
  }, [show, editingCustomer])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    setDuplicateWarning(null)
    setServerError('')
  }

  async function handleSave(allowDuplicate = false) {
    const sanitized = sanitizeCustomerInput(form)
    const { valid, errors: validationErrors } = validateCustomer(sanitized)

    if (!valid) {
      setErrors(validationErrors)
      return
    }

    // Duplicate check
    if (!allowDuplicate) {
      const dup = checkDuplicate(sanitized, existingCustomers || [], {
        excludeId: editingCustomer?.id,
      })
      if (dup.isDuplicate) {
        setDuplicateWarning({
          field: dup.field,
          message: dup.field === 'phone'
            ? `Nomor HP sudah digunakan oleh "${dup.existing.name}"`
            : `Email sudah digunakan oleh "${dup.existing.name}"`,
          existing: dup.existing,
        })
        return
      }
    }

    setSaving(true)
    setServerError('')

    try {
      await onSave(sanitized, editingCustomer)
    } catch (err) {
      setServerError(err.message || 'Terjadi kesalahan. Silakan coba lagi.')
      setSaving(false)
      return
    }

    setSaving(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
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
              {isEdit ? 'Edit Customer' : 'Tambah Customer'}
            </h2>

            {/* Server Error */}
            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2">
                <p className="text-xs font-medium text-yellow-700">{duplicateWarning.message}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleSave(true)}
                    className="rounded-lg bg-yellow-500 px-3 py-1 text-xs font-bold text-white hover:bg-yellow-600"
                  >
                    Tetap Simpan
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-cream"
                  >
                    Kembali Edit
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-text-muted">
                  Nama Customer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nama customer"
                  autoFocus
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.name ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-medium text-text-muted">Nomor HP</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="08xxxxxxxxxx"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.phone ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium text-text-muted">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="email@contoh.com"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.email ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              {/* Address */}
              <div>
                <label className="text-xs font-medium text-text-muted">Alamat</label>
                <textarea
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Alamat customer"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-text-muted">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Catatan tentang customer"
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
                onClick={() => handleSave()}
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
