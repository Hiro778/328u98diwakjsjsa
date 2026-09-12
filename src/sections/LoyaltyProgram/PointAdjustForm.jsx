import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validatePointAdjustment, canSubtractPoints, safeInt, LEDGER_TYPES } from './loyaltyUtils'

export default function PointAdjustForm({ show, onClose, onSave, customer }) {
  const [form, setForm] = useState({ type: LEDGER_TYPES.ADJUSTMENT_ADD, amount: '', reason: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (show) {
      setForm({ type: LEDGER_TYPES.ADJUSTMENT_ADD, amount: '', reason: '' })
      setErrors({})
      setServerError('')
    }
  }, [show])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
    setServerError('')
  }

  async function handleSave() {
    const pts = Math.abs(safeInt(form.amount))
    if (pts === 0) {
      setErrors({ amount: 'Jumlah poin tidak boleh 0' })
      return
    }

    const { valid, errors: errs } = validatePointAdjustment(pts, form.reason, customer?.loyalty_points_balance)
    if (!valid) { setErrors(errs); return }

    if (form.type === LEDGER_TYPES.ADJUSTMENT_SUBTRACT && !canSubtractPoints(pts, customer?.loyalty_points_balance)) {
      setErrors({ amount: `Poin tidak cukup. Saldo: ${safeInt(customer?.loyalty_points_balance)}` })
      return
    }

    setSaving(true)
    setServerError('')
    try {
      await onSave({ type: form.type, points: pts, reason: form.reason.trim() })
    } catch (err) {
      setServerError(err.message || 'Terjadi kesalahan.')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  if (!customer) return null

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5" onClick={() => !saving && onClose()}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold text-navy-700">Adjust Poin</h2>
            <p className="mt-1 text-xs text-text-muted">{customer.name} · Saldo: {safeInt(customer.loyalty_points_balance)} poin</p>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Type */}
              <div className="flex gap-2">
                <button onClick={() => set('type', LEDGER_TYPES.ADJUSTMENT_ADD)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${form.type === LEDGER_TYPES.ADJUSTMENT_ADD ? 'bg-profit-50 text-profit-600 border border-profit-200' : 'border border-border text-text-secondary hover:bg-cream'}`}>
                  + Tambah Poin
                </button>
                <button onClick={() => set('type', LEDGER_TYPES.ADJUSTMENT_SUBTRACT)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${form.type === LEDGER_TYPES.ADJUSTMENT_SUBTRACT ? 'bg-red-50 text-red-500 border border-red-200' : 'border border-border text-text-secondary hover:bg-cream'}`}>
                  - Kurangi Poin
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-medium text-text-muted">Jumlah Poin <span className="text-red-500">*</span></label>
                <input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} min="1" placeholder="0"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.amount ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-medium text-text-muted">Alasan <span className="text-red-500">*</span></label>
                <textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Alasan adjustment" rows={2}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.reason ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                {errors.reason && <p className="mt-1 text-xs text-red-500">{errors.reason}</p>}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => !saving && onClose()} disabled={saving}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60">
                Batal
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
