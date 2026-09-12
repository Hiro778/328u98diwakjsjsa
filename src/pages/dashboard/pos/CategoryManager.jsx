import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'

function normalizeCategory(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function CategoryManager() {
  const { business } = useAuth()
  const [categories, setCategories] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingName, setEditingName] = useState(null) // null = add, string = rename
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (business?.id) loadCategories()
  }, [business?.id])

  async function loadCategories() {
    const { data } = await supabase
      .from('products')
      .select('category')
      .eq('business_id', business.id)

    const products = data || []
    const counts = {}
    for (const p of products) {
      const cat = p.category || ''
      counts[cat] = (counts[cat] || 0) + 1
    }

    const names = [...new Set(products.map(p => p.category).filter(Boolean))].sort()
    setCategories(names)
    setProductCounts(counts)
    setLoading(false)
  }

  function openAdd() {
    setEditingName(null)
    setName('')
    setError('')
    setShowForm(true)
  }

  function openEdit(catName) {
    setEditingName(catName)
    setName(catName)
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Nama kategori wajib diisi')
      return
    }

    const newName = name.trim()
    const normalized = normalizeCategory(newName)

    // Check for duplicate (case-insensitive)
    const duplicate = categories.find(c =>
      normalizeCategory(c) === normalized && c !== editingName
    )
    if (duplicate) {
      setError('Kategori dengan nama ini sudah ada')
      return
    }

    setSaving(true)
    setError('')

    if (editingName) {
      // Rename: update all products with old category name
      const { error: updErr } = await supabase
        .from('products')
        .update({ category: newName, updated_at: new Date().toISOString() })
        .eq('business_id', business.id)
        .eq('category', editingName)
      if (updErr) { setError(updErr.message); setSaving(false); return }
    }
    // For new category: no DB action needed — category appears when products are assigned

    setSaving(false)
    setShowForm(false)
    loadCategories()
  }

  async function handleDelete(catName) {
    if (!confirm(`Hapus kategori "${catName}"? Produk akan menjadi tanpa kategori.`)) return
    await supabase
      .from('products')
      .update({ category: '', updated_at: new Date().toISOString() })
      .eq('business_id', business.id)
      .eq('category', catName)
    loadCategories()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Kategori Menu</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola kategori produk/menu bisnis lo.</p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Kategori
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">
                {editingName ? 'Edit Kategori' : 'Tambah Kategori'}
              </h2>
              <div className="mt-4">
                <label className="text-xs font-medium text-text-muted">Nama Kategori</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Contoh: Makanan, Minuman, Dessert"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  autoFocus
                />
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
                >
                  Batal
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category List */}
      {categories.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada kategori</p>
          <p className="mt-2 text-sm text-text-muted">Buat kategori untuk mengorganisir menu lo.</p>
          <button
            onClick={openAdd}
            className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
          >
            + Buat Kategori
          </button>
        </div>
      ) : (
        <>
          {/* Uncategorized products info */}
          {(productCounts[''] || 0) > 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-muted">
                <span className="font-semibold text-navy-700">{productCounts['']}</span> produk tanpa kategori
              </p>
            </div>
          )}
          <div className="mt-6 space-y-2">
            {categories.map((cat) => (
              <motion.div
                key={cat}
                layout
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy-700">{cat}</p>
                  <p className="text-[11px] text-text-muted">{productCounts[cat] || 0} produk</p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(cat)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
