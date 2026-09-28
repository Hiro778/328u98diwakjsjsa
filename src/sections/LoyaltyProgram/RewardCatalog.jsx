import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateReward, normalizeReward, isRewardAvailable, formatPoints, formatDate } from './loyaltyUtils'
import DateInput from '../../components/DateInput'

export default function RewardCatalog({ rewards, loading, onAdd, onEdit, onDelete }) {
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
        <p className="text-xs text-text-muted">{rewards.length} reward</p>
        <button onClick={onAdd}
          className="rounded-xl bg-warm-400 px-4 py-2 text-xs font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">
          + Tambah Reward
        </button>
      </div>

      {rewards.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="text-lg font-semibold text-navy-700">Belum ada reward</p>
          <p className="mt-2 text-sm text-text-muted">Buat reward untuk program loyalitas Anda.</p>
          <button onClick={onAdd}
            className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30">
            + Tambah Reward
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rewards.map(r => {
            const available = isRewardAvailable(r)
            return (
              <div key={r.id}
                className={`flex items-center gap-4 rounded-xl border bg-surface px-4 py-3 transition-all ${available ? 'border-border' : 'border-border opacity-60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-navy-700 truncate">{r.name}</p>
                    {!r.is_active && <span className="text-[9px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">Nonaktif</span>}
                    {r.expiry_date && r.expiry_date < new Date().toISOString().split('T')[0] && (
                      <span className="text-[9px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">Kedaluwarsa</span>
                    )}
                  </div>
                  {r.description && <p className="mt-0.5 text-[11px] text-text-muted truncate">{r.description}</p>}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
                    <span>{formatPoints(r.points_required)}</span>
                    {r.stock != null && <span>Stok: {r.stock}</span>}
                    {r.expiry_date && <span>Exp: {formatDate(r.expiry_date)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => onEdit(r)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-cream hover:text-navy-700" title="Edit">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button onClick={() => onDelete(r)}
                    className="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-50 hover:text-red-500" title="Hapus">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Reward Form Modal ---

export function RewardForm({ show, onClose, onSave, editingReward }) {
  const [form, setForm] = useState({ name: '', description: '', points_required: '', stock: '', is_active: true, expiry_date: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  const isEdit = !!editingReward

  useEffect(() => {
    if (show) {
      if (editingReward) {
        setForm({
          name: editingReward.name || '',
          description: editingReward.description || '',
          points_required: String(editingReward.points_required || ''),
          stock: editingReward.stock != null ? String(editingReward.stock) : '',
          is_active: editingReward.is_active !== false,
          expiry_date: editingReward.expiry_date || '',
        })
      } else {
        setForm({ name: '', description: '', points_required: '', stock: '', is_active: true, expiry_date: '' })
      }
      setErrors({})
      setServerError('')
    }
  }, [show, editingReward])

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
      points_required: Number(form.points_required) || 0,
      stock: form.stock !== '' ? Number(form.stock) : null,
      expiry_date: form.expiry_date || null,
    }
    const { valid, errors: errs } = validateReward(data)
    if (!valid) { setErrors(errs); return }

    setSaving(true)
    setServerError('')
    try {
      await onSave(data, editingReward)
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5" onClick={() => !saving && onClose()}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-navy-700">{isEdit ? 'Edit Reward' : 'Tambah Reward'}</h2>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-text-muted">Nama <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Diskon Rp10.000"
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.name ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted">Deskripsi</label>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Deskripsi reward" rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Poin Dibutuhkan <span className="text-red-500">*</span></label>
                  <input type="number" value={form.points_required} onChange={(e) => set('points_required', e.target.value)} min="1"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.points_required ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                  {errors.points_required && <p className="mt-1 text-xs text-red-500">{errors.points_required}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted">Stock (kosong = unlimited)</label>
                  <input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} min="0" placeholder="Unlimited"
                    className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.stock ? 'border-red-400' : 'border-border focus:border-warm-400'}`} />
                  {errors.stock && <p className="mt-1 text-xs text-red-500">{errors.stock}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-text-muted">Tanggal Kedaluwarsa</label>
                  <DateInput
                    value={form.expiry_date}
                    onChange={(e) => set('expiry_date', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <button onClick={() => set('is_active', !form.is_active)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${form.is_active ? 'bg-warm-400' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                  <span className="ml-2 text-xs text-text-secondary">{form.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </div>
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
