import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateFollowup, FOLLOWUP_METHODS, FOLLOWUP_RESULTS, getToday } from './whatsappSalesUtils'
import DateInput from '../../components/DateInput'

export default function FollowUpForm({ show, onClose, onSave, lead }) {
  const [form, setForm] = useState({
    method: 'whatsapp',
    date: getToday(),
    result: '',
    next_follow_up_at: '',
    notes: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (show) {
      setForm({
        method: 'whatsapp',
        date: getToday(),
        result: '',
        next_follow_up_at: '',
        notes: '',
      })
      setErrors({})
      setServerError('')
    }
  }, [show])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  async function handleSave() {
    const validation = validateFollowup(form)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    setSaving(true)
    setServerError('')
    try {
      await onSave({
        method: form.method,
        date: form.date,
        result: form.result,
        next_follow_up_at: form.next_follow_up_at || null,
        notes: form.notes,
      })
      onClose()
    } catch (err) {
      setServerError(err.message || 'Gagal menyimpan follow-up')
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
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-navy-700">Tambah Follow-up</h2>
            {lead && <p className="mt-1 text-sm text-text-muted">Untuk: {lead.name}</p>}

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {serverError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Method */}
              <div>
                <label className="text-xs font-medium text-text-muted">Metode <span className="text-red-500">*</span></label>
                <select
                  value={form.method}
                  onChange={(e) => set('method', e.target.value)}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.method ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                >
                  {FOLLOWUP_METHODS.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
                {errors.method && <p className="mt-1 text-xs text-red-500">{errors.method}</p>}
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-text-muted">Tanggal <span className="text-red-500">*</span></label>
                <DateInput
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${errors.date ? 'border-red-400' : 'border-border focus:border-warm-400'}`}
                />
                {errors.date && <p className="mt-1 text-xs text-red-500">{errors.date}</p>}
              </div>

              {/* Result */}
              <div>
                <label className="text-xs font-medium text-text-muted">Hasil</label>
                <select
                  value={form.result}
                  onChange={(e) => set('result', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
                >
                  <option value="">Pilih hasil...</option>
                  {FOLLOWUP_RESULTS.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Next Follow-up */}
              <div>
                <label className="text-xs font-medium text-text-muted">Jadwal Follow-up Berikutnya</label>
                <DateInput
                  value={form.next_follow_up_at}
                  onChange={(e) => set('next_follow_up_at', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-text-muted">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Hasil percakapan, catatan..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50 resize-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
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
  )
}
