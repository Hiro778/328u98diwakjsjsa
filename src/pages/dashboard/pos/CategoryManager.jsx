import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'

function normalizeCategory(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function CategoryManager() {
  const { business } = useAuth()
  const { toast, showToast } = useToast()
  const [categories, setCategories] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null) // null = add, category object = edit
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (business?.id) {
      loadCategories()
    } else {
      setLoading(false)
    }
  }, [business?.id])

  async function loadCategories() {
    if (!business?.id) return
    setLoading(true)

    try {
      // 1. Fetch categories from menu_categories table
      const { data: catData, error: catErr } = await supabase
        .from('menu_categories')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (catErr) {
        console.error('Failed to load menu categories:', catErr)
        showToast('Gagal memuat kategori: ' + catErr.message, 'error')
        setLoading(false)
        return
      }

      let catList = catData || []

      // 2. Fetch products to get product counts and legacy categories
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, category, menu_category_id')
        .eq('business_id', business.id)

      if (prodErr) {
        console.error('Failed to load products for category counts:', prodErr)
      }

      const prods = prodData || []

      // 3. Handle legacy categories: if there are products with a category string not yet in menu_categories,
      // backfill them into menu_categories so user doesn't lose existing categories
      const existingNormalized = new Set(catList.map(c => normalizeCategory(c.name)))
      const legacyCategoryNames = [...new Set(prods.map(p => p.category?.trim()).filter(Boolean))]
        .filter(catName => !existingNormalized.has(normalizeCategory(catName)))

      if (legacyCategoryNames.length > 0) {
        const newLegacyRows = legacyCategoryNames.map((catName, idx) => ({
          business_id: business.id,
          name: catName,
          sort_order: catList.length + idx + 1,
          is_active: true,
        }))

        const { data: insertedLegacy, error: legacyErr } = await supabase
          .from('menu_categories')
          .insert(newLegacyRows)
          .select()

        if (!legacyErr && insertedLegacy) {
          catList = [...catList, ...insertedLegacy]
          for (const legCat of insertedLegacy) {
            await supabase
              .from('products')
              .update({ menu_category_id: legCat.id })
              .eq('business_id', business.id)
              .eq('category', legCat.name)
          }
        }
      }

      // 4. Calculate product counts for each category
      const counts = {}
      let uncategorized = 0

      for (const p of prods) {
        let matchedId = null
        if (p.menu_category_id) {
          const found = catList.find(c => c.id === p.menu_category_id)
          if (found) matchedId = found.id
        }
        if (!matchedId && p.category) {
          const found = catList.find(c => normalizeCategory(c.name) === normalizeCategory(p.category))
          if (found) matchedId = found.id
        }

        if (matchedId) {
          counts[matchedId] = (counts[matchedId] || 0) + 1
        } else {
          uncategorized++
        }
      }

      setCategories(catList)
      setProductCounts({ ...counts, __uncategorized: uncategorized })
    } catch (err) {
      console.error('Unexpected error loading categories:', err)
      showToast('Gagal memuat kategori: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function openAdd() {
    setEditingCategory(null)
    setName('')
    setError('')
    setShowForm(true)
  }

  function openEdit(cat) {
    setEditingCategory(cat)
    setName(cat.name)
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Nama kategori wajib diisi')
      return
    }

    if (!business?.id) {
      setError('Data bisnis tidak ditemukan. Silakan refresh halaman.')
      return
    }

    const newName = name.trim()
    const normalized = normalizeCategory(newName)

    // Check for duplicate (case-insensitive)
    const duplicate = categories.find(c =>
      normalizeCategory(c.name) === normalized && (!editingCategory || c.id !== editingCategory.id)
    )
    if (duplicate) {
      setError('Kategori dengan nama ini sudah ada')
      return
    }

    setSaving(true)
    setError('')

    try {
      if (editingCategory) {
        // UPDATE menu_categories
        const { data: updatedData, error: updErr } = await supabase
          .from('menu_categories')
          .update({
            name: newName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCategory.id)
          .eq('business_id', business.id)
          .select()
          .single()

        if (updErr) {
          console.error('Error updating menu category:', updErr)
          setError(updErr.message || 'Gagal mengubah kategori')
          showToast(updErr.message || 'Gagal mengubah kategori', 'error')
          setSaving(false)
          return
        }

        if (!updatedData) {
          setError('Kategori gagal diubah')
          showToast('Kategori gagal diubah', 'error')
          setSaving(false)
          return
        }

        // Also update products with old category name for consistency
        await supabase
          .from('products')
          .update({ category: newName, updated_at: new Date().toISOString() })
          .eq('business_id', business.id)
          .eq('menu_category_id', editingCategory.id)

        await supabase
          .from('products')
          .update({ category: newName, updated_at: new Date().toISOString() })
          .eq('business_id', business.id)
          .eq('category', editingCategory.name)

        showToast('Kategori berhasil diperbarui!', 'success')
      } else {
        // INSERT into menu_categories
        const { data: insertedData, error: insErr } = await supabase
          .from('menu_categories')
          .insert({
            business_id: business.id,
            name: newName,
            sort_order: categories.length + 1,
            is_active: true,
          })
          .select()
          .single()

        if (insErr) {
          console.error('Error inserting menu category:', insErr)
          setError(insErr.message || 'Gagal menyimpan kategori')
          showToast(insErr.message || 'Gagal menyimpan kategori', 'error')
          setSaving(false)
          return
        }

        if (!insertedData || !insertedData.id) {
          setError('Gagal menyimpan kategori: response ID tidak diterima')
          showToast('Gagal menyimpan kategori', 'error')
          setSaving(false)
          return
        }

        showToast('Kategori berhasil ditambahkan!', 'success')
      }

      setSaving(false)
      setShowForm(false)
      await loadCategories()
    } catch (err) {
      console.error('Unexpected error in handleSave:', err)
      setError(err.message || 'Terjadi kesalahan sistem')
      showToast(err.message || 'Terjadi kesalahan sistem', 'error')
      setSaving(false)
    }
  }

  async function handleDelete(cat) {
    if (!confirm(`Hapus kategori "${cat.name}"? Produk dalam kategori ini akan menjadi tanpa kategori.`)) return

    try {
      // 1. Unset category on products in this category
      await supabase
        .from('products')
        .update({ category: '', menu_category_id: null, updated_at: new Date().toISOString() })
        .eq('business_id', business.id)
        .eq('menu_category_id', cat.id)

      await supabase
        .from('products')
        .update({ category: '', menu_category_id: null, updated_at: new Date().toISOString() })
        .eq('business_id', business.id)
        .eq('category', cat.name)

      // 2. Delete from menu_categories
      const { error: delErr } = await supabase
        .from('menu_categories')
        .delete()
        .eq('id', cat.id)
        .eq('business_id', business.id)

      if (delErr) {
        console.error('Error deleting menu category:', delErr)
        showToast(delErr.message || 'Gagal menghapus kategori', 'error')
        return
      }

      showToast('Kategori berhasil dihapus.', 'success')
      await loadCategories()
    } catch (err) {
      console.error('Unexpected error in handleDelete:', err)
      showToast('Gagal menghapus kategori: ' + err.message, 'error')
    }
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
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />

      <BackButton fallbackUrl="/dashboard/pos" />

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
                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}
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
          <p className="mt-2 text-sm text-text-muted">Buat kategori untuk mengorganisasi menu lo.</p>
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
          {(productCounts.__uncategorized || 0) > 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-muted">
                <span className="font-semibold text-navy-700">{productCounts.__uncategorized}</span> produk tanpa kategori
              </p>
            </div>
          )}
          <div className="mt-6 space-y-2">
            {categories.map((cat) => (
              <motion.div
                key={cat.id}
                layout
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy-700">{cat.name}</p>
                  <p className="text-[11px] text-text-muted">
                    {productCounts[cat.id] || 0} produk
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(cat)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                    title="Edit kategori"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Hapus kategori"
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
