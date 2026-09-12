import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { validateSupplier, sanitizeSupplierInput } from '../../lib/inventoryUtils'
import InventoryField from './InventoryField'

const EMPTY_FORM = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

export default function SupplierDatabase() {
  const { business } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!business?.id) return
    loadSuppliers()
  }, [business?.id])

  async function loadSuppliers() {
    setLoading(true)
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('business_id', business.id)
      .order('name')

    setSuppliers(data || [])
    setLoading(false)
  }

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setGlobalError('')
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setErrors({})
    setGlobalError('')
  }

  function openEdit(supplier) {
    setForm({
      name: supplier.name || '',
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    })
    setEditingId(supplier.id)
    setShowForm(true)
    setErrors({})
    setGlobalError('')
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setGlobalError('')
  }

  async function handleSubmit() {
    const sanitized = sanitizeSupplierInput(form)
    const validation = validateSupplier(sanitized)

    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setSaving(true)
    setGlobalError('')

    const payload = {
      business_id: business.id,
      name: sanitized.name,
      contact: sanitized.contact,
      phone: sanitized.phone,
      email: sanitized.email,
      address: sanitized.address,
      notes: sanitized.notes,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const { error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', editingId)
        .eq('business_id', business.id)

      if (error) {
        setGlobalError('Gagal memperbarui supplier.')
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('suppliers')
        .insert(payload)

      if (error) {
        console.error('Insert error:', error)
        setGlobalError(`Gagal menambahkan supplier: ${error.message} (${error.code})`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    closeForm()
    loadSuppliers()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus supplier ini?')) return
    await supabase.from('suppliers').delete().eq('id', id).eq('business_id', business.id)
    loadSuppliers()
  }

  const filtered = suppliers.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.contact || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Supplier Database</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola data supplier dan vendor Anda.</p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
        >
          + Tambah Supplier
        </button>
      </div>

      {/* Search */}
      <div className="relative mt-4 max-w-md">
        <svg className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          placeholder="Cari supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        />
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="mb-4 text-sm font-bold text-navy-700">
                {editingId ? 'Edit Supplier' : 'Tambah Supplier Baru'}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <InventoryField
                  label="Nama Supplier *"
                  value={form.name}
                  onChange={(v) => setField('name', v)}
                  placeholder="Nama supplier"
                  error={errors.name}
                />
                <InventoryField
                  label="Kontak Person"
                  value={form.contact}
                  onChange={(v) => setField('contact', v)}
                  placeholder="Nama kontak person"
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
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-bold text-navy-700">Alamat</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  placeholder="Alamat supplier"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                />
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-bold text-navy-700">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Catatan tentang supplier"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                />
              </div>

              {globalError && (
                <p className="mt-3 text-sm text-red-600">{globalError}</p>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Simpan' : 'Tambah'}
                </button>
                <button
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream"
                >
                  Batal
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Supplier List */}
      <div className="mt-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-navy-50" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="mt-3 text-sm font-semibold text-navy-700">
              {search ? 'Tidak ada supplier yang cocok' : 'Belum ada supplier'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {search ? 'Coba ubah kata kunci pencarian.' : 'Tambahkan supplier untuk melacak asal produk.'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:border-warm-200"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-lg">
                  🏪
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy-700">{s.name}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
                    {s.contact && <span>{s.contact}</span>}
                    {s.phone && <span>{s.phone}</span>}
                    {s.email && <span className="truncate">{s.email}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-cream"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    Hapus
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
