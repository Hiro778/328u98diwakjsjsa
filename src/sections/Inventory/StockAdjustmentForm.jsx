import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MOVEMENT_TYPES,
  validateStockAdjustment,
} from '../../lib/inventoryUtils'

const MOVEMENT_OPTIONS = [
  { value: MOVEMENT_TYPES.STOCK_IN, label: '↑ Barang Masuk', color: 'profit' },
  { value: MOVEMENT_TYPES.STOCK_OUT, label: '↓ Barang Keluar', color: 'red' },
  { value: MOVEMENT_TYPES.ADJUSTMENT_INCREASE, label: '➚ Penyesuaian Naik', color: 'electric' },
  { value: MOVEMENT_TYPES.ADJUSTMENT_DECREASE, label: '➘ Penyesuaian Turun', color: 'warm' },
]

const COLOR_MAP = {
  profit: { bg: 'bg-profit-50', border: 'border-profit-200', text: 'text-profit-600', selectedBg: 'bg-profit-100' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', selectedBg: 'bg-red-100' },
  electric: { bg: 'bg-electric-50', border: 'border-electric-200', text: 'text-electric-600', selectedBg: 'bg-electric-100' },
  warm: { bg: 'bg-warm-50', border: 'border-warm-200', text: 'text-warm-500', selectedBg: 'bg-warm-100' },
}

export default function StockAdjustmentForm({ currentStock, onSubmit, saving }) {
  const [form, setForm] = useState({
    movement_type: '',
    quantity: '',
    reason: '',
  })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit() {
    const validation = validateStockAdjustment(form, currentStock)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setErrors({})
    const result = await onSubmit({
      movement_type: form.movement_type,
      quantity: Number(form.quantity),
      reason: form.reason.trim(),
    })

    if (result?.success !== false) {
      setForm({ movement_type: '', quantity: '', reason: '' })
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 2000)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-bold text-navy-700">Penyesuaian Stok</h3>

      {/* Movement type selector */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-navy-700">Tipe Gerakan</label>
        <div className="grid grid-cols-2 gap-2">
          {MOVEMENT_OPTIONS.map((opt) => {
            const isSelected = form.movement_type === opt.value
            const colors = COLOR_MAP[opt.color]
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setField('movement_type', opt.value)}
                className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                  isSelected
                    ? `${colors.selectedBg} ${colors.border} ${colors.text}`
                    : `border-border bg-surface text-text-secondary hover:border-navy-200`
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {errors.movement_type && (
          <p className="mt-1 text-[11px] text-red-500">{errors.movement_type}</p>
        )}
      </div>

      {/* Quantity */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-bold text-navy-700">Jumlah</label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={form.quantity}
          onChange={(e) => setField('quantity', e.target.value)}
          placeholder="Masukkan jumlah"
          className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 ${
            errors.quantity ? 'border-red-300' : 'border-border'
          }`}
        />
        {errors.quantity && <p className="mt-1 text-[11px] text-red-500">{errors.quantity}</p>}
        <p className="mt-1 text-[11px] text-text-muted">Stok saat ini: {currentStock}</p>
      </div>

      {/* Reason */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-bold text-navy-700">Alasan</label>
        <textarea
          value={form.reason}
          onChange={(e) => setField('reason', e.target.value)}
          placeholder="Contoh: Restock dari supplier, Barang rusak, Koreksi stok"
          rows={3}
          className={`w-full resize-none rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50 ${
            errors.reason ? 'border-red-300' : 'border-border'
          }`}
        />
        {errors.reason && <p className="mt-1 text-[11px] text-red-500">{errors.reason}</p>}
      </div>

      {/* Success */}
      <AnimatePresence>
        {submitted && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 rounded-xl border border-profit-200 bg-profit-50 p-3 text-sm font-semibold text-profit-600"
          >
            Stok berhasil diperbarui.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || !form.movement_type}
        className="w-full rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
      >
        {saving ? 'Memproses...' : 'Terapkan Penyesuaian'}
      </button>
    </div>
  )
}
