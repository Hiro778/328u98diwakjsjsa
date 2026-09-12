import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateProgram, normalizeProgram } from './loyaltyUtils'

export default function LoyaltySettings({ show, onClose, onSave, program }) {
  const [form, setForm] = useState({
    name: 'Program Loyalitas',
    is_active: true,
    min_transaction_amount: '0',
    points_per_rule: '1',
    rule_amount: '10000',
    min_points_redeem: '100',
    points_expiry_days: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (show && program) {
      setForm({
        name: program.name || 'Program Loyalitas',
        is_active: program.is_active !== false,
        min_transaction_amount: String(program.min_transaction_amount || 0),
        points_per_rule: String(program.points_per_rule || 1),
        rule_amount: String(program.rule_amount || 10000),
        min_points_redeem: String(program.min_points_redeem || 100),
        points_expiry_days: program.points_expiry_days != null ? String(program.points_expiry_days) : '',
      })
    }
    setErrors({})
    setServerError('')
  }, [show, program])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
    setServerError('')
  }

  async function handleSave() {
    const data = {
      ...form,
      min_transaction_amount: Number(form.min_transaction_amount) || 0,
      points_per_rule: Number(form.points_per_rule) || 1,
      rule_amount: Number(form.rule_amount) || 10000,
      min_points_redeem: Number(form.min_points_redeem) || 0,
      points_expiry_days: form.points_expiry_days ? Number(form.points_expiry_days) : null,
    }
    const { valid, errors: errs } = validateProgram(data)
    if (!valid) { setErrors(errs); return }

    setSaving(true)
    setServerError('')
    try {
      await onSave(data)
    } catch (err) {
      setServerError(err.message || 'Terjadi kesalahan.')
      setSaving(false)
      return
    }
    setSaving(false)
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
            <h2 className="text-lg font-bold text-navy-700">Pengaturan Program</h2>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-text-muted">Nama Program <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.name ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-text-muted">Status</label>
                <button onClick={() => set('is_active', !form.is_active)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.is_active ? 'bg-warm-400' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-xs text-text-secondary">{form.is_active ? 'Aktif' : 'Nonaktif'}</span>
              </div>

              {/* Rule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Minimum Transaksi (Rp)</label>
                  <input type="number" value={form.min_transaction_amount} onChange={(e) => set('min_transaction_amount', e.target.value)} min="0"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Minimum Redeem (Poin)</label>
                  <input type="number" value={form.min_points_redeem} onChange={(e) => set('min_points_redeem', e.target.value)} min="0"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Per Rp Transaksi</label>
                  <input type="number" value={form.rule_amount} onChange={(e) => set('rule_amount', e.target.value)} min="1"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.rule_amount ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                  {errors.rule_amount && <p className="mt-1 text-xs text-red-500">{errors.rule_amount}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Dapat Poin</label>
                  <input type="number" value={form.points_per_rule} onChange={(e) => set('points_per_rule', e.target.value)} min="1"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.points_per_rule ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                  {errors.points_per_rule && <p className="mt-1 text-xs text-red-500">{errors.points_per_rule}</p>}
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label className="text-xs font-medium text-text-muted">Masa Berlaku Poin (hari, kosong = tidak terbatas)</label>
                <input type="number" value={form.points_expiry_days} onChange={(e) => set('points_expiry_days', e.target.value)} min="0" placeholder="Tidak terbatas"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50" />
              </div>

              {/* Preview */}
              <div className="rounded-lg border border-border bg-cream px-3 py-2">
                <p className="text-[10px] font-bold text-text-muted uppercase mb-1">Contoh Perhitungan</p>
                <p className="text-xs text-navy-700">
                  Transaksi Rp125.000 → {Math.floor(125000 / (Number(form.rule_amount) || 10000)) * (Number(form.points_per_rule) || 1)} poin
                </p>
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
