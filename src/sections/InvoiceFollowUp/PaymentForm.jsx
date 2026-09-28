import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  validatePayment,
  checkPaymentLimit,
  formatCurrency,
  calculateOutstanding,
  getToday,
} from './invoiceFollowUpUtils'
import DateInput from '../../components/DateInput'

export default function PaymentForm({ show, onClose, onSave, invoice }) {
  const [form, setForm] = useState({
    amount: '',
    payment_date: getToday(),
    method: '',
    notes: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    if (show) {
      const outstanding = calculateOutstanding(invoice)
      setForm({
        amount: outstanding > 0 ? outstanding.toString() : '',
        payment_date: getToday(),
        method: '',
        notes: '',
      })
      setErrors({})
      setServerError('')
    }
  }, [show, invoice])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
    setServerError('')
  }

  async function handleSave() {
    const { valid, errors: validationErrors } = validatePayment(form)
    if (!valid) {
      setErrors(validationErrors)
      return
    }

    // Check payment limit
    const { allowed, excess } = checkPaymentLimit(invoice, form.amount)
    if (!allowed) {
      setErrors({ amount: `Pembayaran melebihi sisa tagihan sebesar ${formatCurrency(excess)}` })
      return
    }

    setSaving(true)
    setServerError('')

    try {
      await onSave({
        amount: Number(form.amount),
        payment_date: form.payment_date,
        method: form.method,
        notes: form.notes.trim(),
      })
    } catch (err) {
      setServerError(err.message || 'Terjadi kesalahan.')
      setSaving(false)
      return
    }

    setSaving(false)
  }

  if (!invoice) return null

  const outstanding = calculateOutstanding(invoice)

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
            <h2 className="text-lg font-bold text-navy-700">Catat Pembayaran</h2>
            <p className="mt-1 text-xs text-text-muted">
              Invoice {invoice.invoice_number} · Sisa: {formatCurrency(outstanding)}
            </p>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {/* Amount */}
              <div>
                <label className="text-xs font-medium text-text-muted">
                  Jumlah Pembayaran <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  placeholder="0"
                  min="0"
                  max={outstanding}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.amount ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-text-muted">
                  Tanggal Pembayaran <span className="text-red-500">*</span>
                </label>
                <DateInput
                  value={form.payment_date}
                  onChange={(e) => set('payment_date', e.target.value)}
                  className={`mt-1 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:outline-none focus:ring-1 focus:ring-warm-400/50 ${
                    errors.payment_date ? 'border-red-400' : 'border-border focus:border-warm-400'
                  }`}
                />
                {errors.payment_date && <p className="mt-1 text-xs text-red-500">{errors.payment_date}</p>}
              </div>

              {/* Method */}
              <div>
                <label className="text-xs font-medium text-text-muted">Metode</label>
                <select
                  value={form.method}
                  onChange={(e) => set('method', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
                >
                  <option value="">Pilih metode</option>
                  <option value="cash">Tunai</option>
                  <option value="transfer">Transfer</option>
                  <option value="ewallet">E-Wallet</option>
                  <option value="card">Kartu</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-text-muted">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Catatan pembayaran (opsional)"
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400/50"
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
                className="flex-1 rounded-xl bg-profit-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-profit-600 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Pembayaran'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
