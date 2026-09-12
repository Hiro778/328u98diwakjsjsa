import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import ImageUpload from '../../../components/pos/ImageUpload'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'

/**
 * Extract storage file path from a Supabase public URL.
 * URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 */
function extractStoragePath(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const match = u.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.*)/)
    if (!match) return null
    return { bucket: match[1], path: match[2] }
  } catch {
    return null
  }
}

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  slogan: '',
  unit_price: 0,
  category_name: '',
  image_url: '',
  is_available: true,
  is_best_seller: false,
  sort_order: 0,
}

function normalizeCategory(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function ProductManager() {
  const { business } = useAuth()
  const { toast, showToast } = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_PRODUCT })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [catSuggestions, setCatSuggestions] = useState([])
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const catInputRef = useRef(null)
  const catDropdownRef = useRef(null)

  useEffect(() => {
    if (business?.id) loadProducts()
  }, [business?.id])

  // Close category dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target)) {
        setShowCatDropdown(false)
      }
    }
    if (showCatDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCatDropdown])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order', { ascending: true })

    setProducts(data || [])
    setLoading(false)
  }

  // Derive categories from products (text-based)
  useEffect(() => {
    const names = [...new Set(products.map(p => p.category).filter(Boolean))]
    setCategories(names.sort())
  }, [products])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Nama produk wajib diisi'
    if (!form.unit_price || form.unit_price <= 0) errs.unit_price = 'Harga harus lebih dari 0'
    return errs
  }

  function openAdd() {
    setEditingId(null)
    setForm({ ...EMPTY_PRODUCT })
    setErrors({})
    setShowForm(true)
  }

  function openEdit(p) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description || '',
      slogan: p.slogan || '',
      unit_price: p.unit_price || 0,
      category_name: p.category || '',
      image_url: p.image_url || '',
      is_available: p.is_available ?? true,
      is_best_seller: p.is_best_seller ?? false,
      sort_order: p.sort_order || 0,
    })
    setErrors({})
    setShowForm(true)
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      slogan: form.slogan.trim(),
      unit_price: Number(form.unit_price),
      cost_price: Number(form.cost_price) || 0,
      category: form.category_name.trim(),
      unit: form.unit || 'pcs',
      sku: form.sku || '',
      image_url: form.image_url,
      is_available: form.is_available,
      is_best_seller: form.is_best_seller,
      sort_order: Number(form.sort_order),
    }

    if (editingId) {
      const { error } = await supabase
        .from('products')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId)
      if (error) { setErrors({ submit: error.message }); setSaving(false); return }

      // Also sync inventory row when editing product
      const { data: existingInv } = await supabase
        .from('inventory')
        .select('id')
        .eq('product_id', editingId)
        .maybeSingle()
      if (existingInv) {
        await supabase
          .from('inventory')
          .update({
            quantity: sanitized.current_stock || 0,
            min_stock: sanitized.minimum_stock || 0,
            maximum_stock: sanitized.maximum_stock || 0,
            supplier_id: sanitized.supplier_id || null,
            location: sanitized.location || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingInv.id)
      } else {
        // Create inventory row if missing
        await supabase.from('inventory').insert({
          product_id: editingId,
          quantity: sanitized.current_stock || 0,
          min_stock: sanitized.minimum_stock || 0,
          maximum_stock: sanitized.maximum_stock || 0,
          supplier_id: sanitized.supplier_id || null,
          location: sanitized.location || null,
        })
      }
    } else {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({ ...payload, business_id: business.id })
        .select()
      if (error) { setErrors({ submit: error.message }); setSaving(false); return }

      // Also create inventory row for the new product
      if (newProduct && newProduct.length > 0) {
        const productId = newProduct[0].id
        const { error: invError } = await supabase
          .from('inventory')
          .insert({
            product_id: productId,
            quantity: 0,
            min_stock: 0,
            maximum_stock: 0,
            supplier_id: null,
            location: null,
          })
        if (invError) {
          // Log error but don't prevent product creation
          console.error('Gagal membuat inventory row untuk produk baru:', invError.message)
        }
      }
    }

    setSaving(false)
    setShowForm(false)
    showToast(editingId ? 'Produk berhasil diupdate!' : 'Produk berhasil ditambahkan!', 'success')
    loadProducts()
  }

  async function handleDelete(id) {
    if (!confirm('Hapus produk ini?')) return

    // Cleanup image from storage before deleting the product
    const product = products.find(p => p.id === id)
    if (product?.image_url) {
      const storage = extractStoragePath(product.image_url)
      if (storage) {
        const { error: storageErr } = await supabase.storage.from(storage.bucket).remove([storage.path])
        if (storageErr) {
          showToast('Foto gagal dihapus dari server.', 'error')
        }
      }
    }

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      showToast('Gagal menghapus produk.', 'error')
      return
    }
    showToast('Produk berhasil dihapus.', 'success')
    loadProducts()
  }

  async function handleToggleAvailable(id, current) {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !current, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      showToast('Gagal mengubah status produk.', 'error')
      return
    }
    loadProducts()
  }

  async function handleToggleBestSeller(id, current) {
    const { error } = await supabase
      .from('products')
      .update({ is_best_seller: !current, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      showToast('Gagal mengubah status produk.', 'error')
      return
    }
    loadProducts()
  }

  // Barang Masuk (Restock)
  async function handleStockIn(productId, quantity, reason) {
    if (!quantity || quantity <= 0) return
    if (!reason || !reason.trim()) {
      showToast('Alasan wajib diisi', 'error')
      return
    }

    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: productId,
      p_movement_type: 'stock_in',
      p_quantity: quantity,
      p_reason: reason.trim(),
      p_reference_type: 'manual',
      p_reference_id: null,
    })

    if (error) {
      console.error('[ProductManager] StockIn RPC error:', error)
      showToast('Gagal barang masuk: ' + error.message, 'error')
      return
    }

    showToast('Barang masuk berhasil, stok ditambah ' + quantity, 'success')
    loadProducts()
  }

  // Barang Keluar (Penjualan/Retur)
  async function handleStockOut(productId, quantity, reason) {
    if (!quantity || quantity <= 0) return
    if (!reason || !reason.trim()) {
      showToast('Alasan wajib diisi', 'error')
      return
    }

    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: productId,
      p_movement_type: 'stock_out',
      p_quantity: quantity,
      p_reason: reason.trim(),
      p_reference_type: 'manual',
      p_reference_id: null,
    })

    if (error) {
      console.error('[ProductManager] StockOut RPC error:', error)
      showToast('Gagal barang keluar: ' + error.message, 'error')
      return
    }

    showToast('Barang keluar berhasil, stok dikurangi ' + quantity, 'success')
    loadProducts()
  }

  // Category input handlers
  function handleCategoryInput(value) {
    set('category_name', value)
    const normalized = normalizeCategory(value)
    if (normalized.length === 0) {
      setCatSuggestions([])
      setShowCatDropdown(false)
      return
    }
    const matches = categories.filter(c =>
      normalizeCategory(c).includes(normalized)
    )
    setCatSuggestions(matches)
    setShowCatDropdown(true)
  }

  function selectCategory(catName) {
    set('category_name', catName)
    setShowCatDropdown(false)
  }

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCategory = filterCategory === 'all' || p.category === filterCategory
    return matchSearch && matchCategory
  })

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">Menu Produk</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola produk/menu yang tampil di halaman publik.</p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          + Tambah Produk
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
        >
          <option value="all">Semua Kategori</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Product Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 p-5 pt-10 pb-10"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">
                {editingId ? 'Edit Produk' : 'Tambah Produk'}
              </h2>

              <div className="mt-5 space-y-4">
                {/* Image */}
                <div>
                  <label className="text-xs font-medium text-text-muted">Foto Produk</label>
                  <ImageUpload
                    bucket="product-images"
                    folder={business?.id || ''}
                    currentImage={form.image_url}
                    onUpload={(url) => set('image_url', url)}
                    onError={(err) => setErrors(e => ({ ...e, image: err }))}
                    accept="image/jpeg,image/png"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-text-muted">Nama Produk *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Nasi Goreng Spesial"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                      errors.name ? 'border-red-400' : 'border-border focus:border-warm-400'
                    }`}
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>

                {/* Slogan */}
                <div>
                  <label className="text-xs font-medium text-text-muted">Slogan / Deskripsi Singkat</label>
                  <input
                    type="text"
                    value={form.slogan}
                    onChange={(e) => set('slogan', e.target.value)}
                    placeholder="Favorit pelanggan"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-text-muted">Deskripsi</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Deskripsi lengkap produk..."
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="text-xs font-medium text-text-muted">Harga (Rp) *</label>
                  <input
                    type="number"
                    value={form.unit_price}
                    onChange={(e) => set('unit_price', e.target.value)}
                    min="0"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                      errors.unit_price ? 'border-red-400' : 'border-border focus:border-warm-400'
                    }`}
                  />
                  {errors.unit_price && <p className="mt-1 text-xs text-red-500">{errors.unit_price}</p>}
                </div>

                {/* Category — text input with autocomplete */}
                <div className="relative" ref={catDropdownRef}>
                  <label className="text-xs font-medium text-text-muted">Kategori</label>
                  <input
                    ref={catInputRef}
                    type="text"
                    value={form.category_name}
                    onChange={(e) => handleCategoryInput(e.target.value)}
                    onFocus={() => {
                      if (form.category_name.trim()) {
                        const normalized = normalizeCategory(form.category_name)
                        const matches = categories.filter(c =>
                          normalizeCategory(c).includes(normalized)
                        )
                        setCatSuggestions(matches)
                        setShowCatDropdown(true)
                      }
                    }}
                    placeholder="Ketik atau buat kategori baru"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                  {showCatDropdown && catSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                      {catSuggestions.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => selectCategory(c)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-cream"
                        >
                          <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                          </svg>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  {showCatDropdown && catSuggestions.length === 0 && form.category_name.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-surface shadow-lg">
                      <div className="px-3 py-2 text-xs text-text-muted">
                        Kategori baru akan dibuat: <span className="font-semibold text-navy-700">"{form.category_name.trim()}"</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Toggles */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_available}
                      onChange={(e) => set('is_available', e.target.checked)}
                      className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400"
                    />
                    <span className="text-sm text-navy-700">Tersedia</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_best_seller}
                      onChange={(e) => set('is_best_seller', e.target.checked)}
                      className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400"
                    />
                    <span className="text-sm text-navy-700">Best Seller</span>
                  </label>
                </div>
              </div>

              {errors.submit && <p className="mt-3 text-sm text-red-500">{errors.submit}</p>}

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

      {/* Product Grid */}
      {filtered.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-navy-700">
            {products.length === 0 ? 'Belum ada produk' : 'Tidak ada produk yang cocok'}
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {products.length === 0 ? 'Tambahkan produk pertama untuk menu lo.' : 'Coba kata kunci lain.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => {
            return (
              <motion.div
                key={p.id}
                layout
                className={`rounded-xl border bg-surface overflow-hidden transition-all ${
                  p.is_available ? 'border-border' : 'border-border opacity-60'
                }`}
              >
                {p.image_url ? (
                  <div className="relative h-36">
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    {p.is_best_seller && (
                      <span className="absolute left-2 top-2 rounded-full bg-warm-400 px-2 py-0.5 text-[10px] font-bold text-white">
                        Best Seller
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="relative flex h-36 items-center justify-center bg-cream">
                    <svg className="h-10 w-10 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                    {p.is_best_seller && (
                      <span className="absolute left-2 top-2 rounded-full bg-warm-400 px-2 py-0.5 text-[10px] font-bold text-white">
                        Best Seller
                      </span>
                    )}
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy-700 truncate">{p.name}</p>
                      {p.slogan && <p className="mt-0.5 text-[11px] text-text-muted truncate">{p.slogan}</p>}
                      {p.category ? (
                        <span className="mt-1 inline-block rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          {p.category}
                        </span>
                      ) : (
                        <span className="mt-1 inline-block rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          Tanpa Kategori
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-warm-500 whitespace-nowrap">{formatCurrency(p.unit_price)}</p>
                  </div>

                  <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                    <button
                      onClick={() => handleToggleAvailable(p.id, p.is_available)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                        p.is_available
                          ? 'bg-profit-50 text-profit-600 hover:bg-profit-100'
                          : 'bg-surface text-text-muted hover:bg-cream'
                      }`}
                    >
                      {p.is_available ? 'Tersedia' : 'Habis'}
                    </button>
                    <button
                      onClick={() => handleToggleBestSeller(p.id, p.is_best_seller)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                        p.is_best_seller
                          ? 'bg-warm-50 text-warm-500 hover:bg-warm-100'
                          : 'bg-surface text-text-muted hover:bg-cream'
                      }`}
                    >
                      {p.is_best_seller ? '★ Best Seller' : 'Best Seller'}
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
