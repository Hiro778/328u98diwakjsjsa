import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { validateProduct, sanitizeProductInput } from '../../lib/inventoryUtils'
import InventoryField from './InventoryField'

const EMPTY_FORM = {
  name: '',
  sku: '',
  description: '',
  category: '',
  unit: 'pcs',
  unit_price: '',
  cost_price: '',
  current_stock: '0',
  minimum_stock: '0',
  maximum_stock: '0',
  supplier_id: '',
  location: '',
  notes: '',
  is_active: true,
}

export default function ProductForm({ product, suppliers, onSave, onCancel }) {
  const { business } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [skuError, setSkuError] = useState('')
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState('')

  useEffect(() => {
    if (product) {
      const inv = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory
      setForm({
        name: product.name || '',
        sku: product.sku || '',
        description: product.description || '',
        category: product.category || '',
        unit: product.unit || 'pcs',
        unit_price: product.unit_price != null ? String(product.unit_price) : '',
        cost_price: product.cost_price != null ? String(product.cost_price) : '',
        current_stock: inv?.quantity != null ? String(inv.quantity) : (product.current_stock != null ? String(product.current_stock) : '0'),
        minimum_stock: inv?.min_stock != null ? String(inv.min_stock) : (product.minimum_stock != null ? String(product.minimum_stock) : '0'),
        maximum_stock: inv?.maximum_stock != null ? String(inv.maximum_stock) : (product.maximum_stock != null ? String(product.maximum_stock) : '0'),
        supplier_id: inv?.supplier_id || product.supplier_id || '',
        location: inv?.location || product.location || '',
        notes: product.notes || '',
        is_active: product.is_active !== false,
      })
    }
  }, [product])

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setSkuError('')
    setGlobalError('')
  }

  async function checkSkuUnique(sku) {
    if (!sku || !business?.id) return true
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('business_id', business.id)
      .eq('sku', sku)
      .maybeSingle()

    if (data && (!product || data.id !== product.id)) {
      setSkuError('SKU sudah digunakan oleh produk lain')
      return false
    }
    return true
  }

  async function handleSubmit() {
    const sanitized = sanitizeProductInput(form)
    const validation = validateProduct(sanitized)

    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    // Check SKU uniqueness
    if (sanitized.sku) {
      const skuOk = await checkSkuUnique(sanitized.sku)
      if (!skuOk) return
    }

    setSaving(true)
    setGlobalError('')

    const productPayload = {
      business_id: business.id,
      name: sanitized.name,
      sku: sanitized.sku || null,
      description: sanitized.description,
      category: sanitized.category,
      unit: sanitized.unit,
      unit_price: sanitized.unit_price,
      cost_price: sanitized.cost_price,
      notes: sanitized.notes || '',
      is_active: sanitized.is_active,
    }

    let productId = product?.id
    let createdNewProduct = false

    if (product?.id) {
      // Update existing product
      const { error } = await supabase
        .from('products')
        .update({ ...productPayload, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .eq('business_id', business.id)

      if (error) {
        console.error('[Inventory] Product update failed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })
        setGlobalError('Gagal memperbarui produk. Silakan coba lagi.')
        setSaving(false)
        return
      }
    } else {
      // Create new product
      const { data, error } = await supabase
        .from('products')
        .insert(productPayload)
        .select('id')
        .single()

      if (error) {
        console.error('[Inventory] Product create failed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })
        setGlobalError('Gagal membuat produk. Silakan coba lagi.')
        setSaving(false)
        return
      }
      productId = data.id
      createdNewProduct = true
    }

    // Upsert inventory
    const inventoryPayload = {
      product_id: productId,
      quantity: sanitized.current_stock,
      min_stock: sanitized.minimum_stock,
      maximum_stock: sanitized.maximum_stock,
      supplier_id: sanitized.supplier_id || null,
      location: sanitized.location || '',
      updated_at: new Date().toISOString(),
    }

    // Check if inventory row exists
    const { data: existingInv, error: existingInvError } = await supabase
      .from('inventory')
      .select('id')
      .eq('product_id', productId)
      .maybeSingle()

    if (existingInvError) {
      console.error('[Inventory] Failed to check existing inventory:', {
        code: existingInvError.code,
        message: existingInvError.message,
        details: existingInvError.details,
        hint: existingInvError.hint,
        productId,
      })
    }

    let inventoryError = null

    if (existingInv) {
      // Update existing inventory row - maintain maximum_stock and supplier_id
      const { error: updateError } = await supabase
        .from('inventory')
        .update(inventoryPayload)
        .eq('id', existingInv.id)

      if (updateError) {
        // If column doesn't exist, retry with base columns only
        const msg = (updateError.message || '').toLowerCase()
        if (msg.includes('column') && msg.includes('does not exist')) {
          console.warn('[Inventory] Extended columns missing, retrying update with base schema:', updateError.message)
          const basePayload = {
            product_id: productId,
            quantity: sanitized.current_stock,
            min_stock: sanitized.minimum_stock,
            location: sanitized.location || '',
            updated_at: new Date().toISOString(),
          }
          const { error: retryError } = await supabase
            .from('inventory')
            .update(basePayload)
            .eq('id', existingInv.id)
          inventoryError = retryError
        } else {
          inventoryError = updateError
        }
      }
    } else {
      // Insert new inventory row — try with full payload first
      const { error: insertError } = await supabase
        .from('inventory')
        .insert(inventoryPayload)

      if (insertError) {
        // If column doesn't exist, retry with base columns only
        const msg = (insertError.message || '').toLowerCase()
        if (msg.includes('column') && msg.includes('does not exist')) {
          console.warn('[Inventory] Extended columns missing, retrying with base schema:', insertError.message)
          const basePayload = {
            product_id: productId,
            quantity: sanitized.current_stock,
            min_stock: sanitized.minimum_stock,
            location: sanitized.location || '',
            updated_at: new Date().toISOString(),
          }
          const { error: retryError } = await supabase
            .from('inventory')
            .insert(basePayload)
          inventoryError = retryError
        } else {
          inventoryError = insertError
        }
      }
    }

    if (inventoryError) {
      console.error('[Inventory] Inventory save failed:', {
        code: inventoryError.code,
        message: inventoryError.message,
        details: inventoryError.details,
        hint: inventoryError.hint,
        productId,
        isNewProduct: createdNewProduct,
      })

      // Rollback: delete orphan product if this was a new creation
      if (createdNewProduct && productId) {
        console.warn('[Inventory] Rolling back orphan product:', productId)
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('id', productId)

        if (deleteError) {
          console.error('[Inventory] Rollback failed:', {
            code: deleteError.code,
            message: deleteError.message,
            productId,
          })
        }
      }

      // Provide specific error message based on error type
      const errMsg = inventoryError.message || ''
      if (errMsg.includes('row-level security') || errMsg.includes('RLS') || inventoryError.code === '42501') {
        setGlobalError('Session Anda sudah berakhir. Silakan login kembali.')
      } else if (errMsg.includes('foreign key') || errMsg.includes('violates')) {
        setGlobalError('Data tidak sesuai format database. Periksa data Anda.')
      } else if (errMsg.includes('column') && errMsg.includes('does not exist')) {
        setGlobalError('Struktur database belum sesuai. Hubungi admin untuk menjalankan migrasi terbaru.')
      } else if (inventoryError.code === '23505') {
        setGlobalError('Data persediaan untuk produk ini sudah ada.')
      } else {
        setGlobalError('Gagal menyimpan data persediaan. Silakan coba lagi.')
      }
      setSaving(false)
      return
    }

    setSaving(false)
    onSave?.()
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="mb-4 text-sm font-bold text-navy-700">
        {product?.id ? 'Edit Produk' : 'Tambah Produk Baru'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <InventoryField
          label="Nama Produk *"
          value={form.name}
          onChange={(v) => setField('name', v)}
          placeholder="Nama produk"
          error={errors.name}
        />
        <InventoryField
          label="SKU"
          value={form.sku}
          onChange={(v) => setField('sku', v)}
          placeholder="Kode SKU (opsional)"
          error={errors.sku || skuError}
          helpText="Kode unik produk"
        />
        <InventoryField
          label="Kategori"
          value={form.category}
          onChange={(v) => setField('category', v)}
          placeholder="Contoh: Makanan, Minuman"
        />
        <InventoryField
          label="Satuan *"
          value={form.unit}
          onChange={(v) => setField('unit', v)}
          placeholder="pcs, kg, liter"
          error={errors.unit}
        />
        <InventoryField
          label="Harga Beli / HPP"
          value={form.cost_price}
          onChange={(v) => setField('cost_price', v)}
          type="number"
          inputMode="decimal"
          placeholder="0"
          error={errors.cost_price}
        />
        <InventoryField
          label="Harga Jual"
          value={form.unit_price}
          onChange={(v) => setField('unit_price', v)}
          type="number"
          inputMode="decimal"
          placeholder="0"
          error={errors.unit_price}
        />
        <InventoryField
          label="Stok Saat Ini"
          value={form.current_stock}
          onChange={(v) => setField('current_stock', v)}
          type="number"
          inputMode="numeric"
          placeholder="0"
          error={errors.current_stock}
        />
        <InventoryField
          label="Stok Minimum"
          value={form.minimum_stock}
          onChange={(v) => setField('minimum_stock', v)}
          type="number"
          inputMode="numeric"
          placeholder="0"
          error={errors.minimum_stock}
          helpText="Batas stok menipis"
        />
        <InventoryField
          label="Stok Maksimal"
          value={form.maximum_stock}
          onChange={(v) => setField('maximum_stock', v)}
          type="number"
          inputMode="numeric"
          placeholder="0"
          error={errors.maximum_stock}
          helpText="Target stok (opsional)"
        />

        {/* Supplier select — only active suppliers for new relations; keep existing inactive */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-navy-700">Supplier</label>
          <select
            value={form.supplier_id}
            onChange={(e) => setField('supplier_id', e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
          >
            <option value="">Tanpa supplier</option>
            {suppliers
              .filter((s) => s.is_active !== false || s.id === form.supplier_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.is_active === false ? ' (Nonaktif)' : ''}
                </option>
              ))}
          </select>
        </div>

        <InventoryField
          label="Lokasi Penyimpanan"
          value={form.location}
          onChange={(v) => setField('location', v)}
          placeholder="Contoh: Gudang A, Rak 3"
        />

        {/* Active toggle */}
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-200"
            />
            <span className="text-sm font-bold text-navy-700">Produk Aktif</span>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-bold text-navy-700">Catatan</label>
        <textarea
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          placeholder="Catatan tambahan tentang produk"
          rows={2}
          className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        />
      </div>

      {/* Errors */}
      <AnimatePresence>
        {globalError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600"
          >
            {globalError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : product?.id ? 'Simpan Perubahan' : 'Tambah Produk'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-cream"
          >
            Batal
          </button>
        )}
      </div>
    </div>
  )
}
