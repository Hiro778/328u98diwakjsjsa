import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateSupplier, sanitizeSupplierInput, generateSupplierCode } from '../../lib/supplierUtils'
import InventoryField from '../Inventory/InventoryField'

const EMPTY_FORM = {
  name: '',
  supplier_code: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  is_active: true,
}

export default function SupplierForm({
  show,
  supplier,
  existingSuppliers,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState('')

  // Populate form when editing
  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name || '',
        supplier_code: supplier.supplier_code || '',
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        is_active: supplier.is_active !== false,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
    setGlobalError('')
  }, [supplier, show])

  function setField(field, value) {
    setForm((f) => {
      const next = { ...f, [field]: value }
      // Auto-generate supplier_code from name if code is empty
      if (field === 'name' && !f.supplier_code) {
        next.supplier_code = generateSupplierCode(value)
      }
      return next
    })
    setErrors((e) => ({ ...e, [field]: undefined }))
    setGlobalError('')
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    const sanitized = sanitizeSupplierInput(form)
    const validation = validateSupplier(sanitized, existingSuppliers, supplier?.id || null)

    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setSaving(true)
    setGlobalError('')

    try {
      await onSave(sanitized, supplier || null)
    } catch (err) {
      setGlobalError(err.message || 'Gagal menyimpan supplier')
    }

    setSaving(false)
  }

  if (!show) return null

  return (
    <AnimatePresence>
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
            {supplier?.id ? 'Edit Supplier' : 'Tambah Supplier Baru'}
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <InventoryField
                label="Nama Supplier *"
                value={form.name}
                onChange={(v) => setField('name', v)}
                placeholder="Nama supplier"
                error={errors.name}
              />
              <InventoryField
                label="Kode Supplier"
                value={form.supplier_code}
                onChange={(v) => setField('supplier_code', v)}
                placeholder="AUTO dari nama"
                error={errors.supplier_code}
                helpText="Kode unik per bisnis"
              />
              <InventoryField
                label="Kontak Person"
                value={form.contact_person}
                onChange={(v) => setField('contact_person', v)}
                placeholder="Nama kontak person"
                error={errors.contact_person}
              />
              <InventoryField
                label="Telepon"
                value={form.phone}
                onChange={(v) => setField('phone', v)}
                placeholder="08123456789"
                error={errors.phone}
              />
              <InventoryField
                label="Email"
                value={form.email}
                onChange={(v) => setField('email', v)}
                placeholder="supplier@email.com"
                error={errors.email}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-navy-700">Alamat</label>
              <textarea
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="Alamat supplier"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-navy-700">Catatan</label>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Catatan tentang supplier"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
              />
            </div>

            {/* Active toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField('is_active', e.target.checked)}
                className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-200"
              />
              <span className="text-sm font-bold text-navy-700">Supplier Aktif</span>
            </label>

            {/* Errors */}
            <AnimatePresence>
              {globalError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600"
                >
                  {globalError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : supplier?.id ? 'Simpan' : 'Tambah'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
