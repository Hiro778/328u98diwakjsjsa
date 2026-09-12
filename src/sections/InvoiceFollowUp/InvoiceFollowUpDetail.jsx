import { motion, AnimatePresence } from 'framer-motion'
import {
  formatCurrency,
  formatDate,
  formatDueDate,
  formatFollowupReminder,
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  FOLLOWUP_METHODS,
  calculateDaysOverdue,
  daysSinceFollowup,
} from './invoiceFollowUpUtils'

const METHOD_LABELS = Object.fromEntries(FOLLOWUP_METHODS.map(m => [m.key, m.label]))

const PAYMENT_METHODS = {
  cash: 'Tunai',
  transfer: 'Transfer',
  ewallet: 'E-Wallet',
  card: 'Kartu',
  other: 'Lainnya',
}

const FOLLOWUP_RESULT_LABELS = {
  berhasil: 'Berhasil',
  menunggu: 'Menunggu',
  tidak_terhubung: 'Tidak Terhubung',
}

const FOLLOWUP_RESULT_COLORS = {
  berhasil: 'text-profit-600',
  menunggu: 'text-yellow-600',
  tidak_terhubung: 'text-red-500',
}

export default function InvoiceFollowUpDetail({ show, invoice, followups, payments, onClose, onFollowup, onContact, onEdit, onDelete, onPayment }) {
  if (!invoice) return null

  const daysOverdue = calculateDaysOverdue(invoice)
  const daysSince = daysSinceFollowup(followups)
  const hasWarning = invoice.status === INVOICE_STATUS.OVERDUE && (!followups || followups.length === 0)

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-navy-700">{invoice.invoice_number}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${INVOICE_STATUS_COLORS[invoice.status] || ''}`}>
                    {INVOICE_STATUS_LABELS[invoice.status] || invoice.status}
                  </span>
                  <span className={`text-xs font-semibold ${PRIORITY_COLORS[invoice.priority] || ''}`}>
                    Prioritas: {PRIORITY_LABELS[invoice.priority] || '-'}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-navy-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Warning */}
            {hasWarning && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-600">
                  Invoice terlambat {daysOverdue} hari dan belum pernah di-follow-up!
                </p>
              </div>
            )}

            {/* Reminder */}
            <div className="mt-3 rounded-lg border border-border bg-cream px-3 py-2">
              <p className="text-xs text-text-muted">
                {formatFollowupReminder(followups)}
                {daysSince !== null && daysSince > 7 && invoice.status !== INVOICE_STATUS.PAID && (
                  <span className="ml-1 font-semibold text-warm-500">(sudah lebih dari 7 hari)</span>
                )}
              </p>
            </div>

            {/* Invoice Info */}
            <div className="mt-5 space-y-2.5 text-sm">
              {invoice.customer_name && invoice.customer_name !== 'Tanpa Customer' && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Customer</span>
                  <span className="font-medium text-navy-700">{invoice.customer_name}</span>
                </div>
              )}
              {invoice.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-text-muted">HP</span>
                  <span className="font-medium text-navy-700">{invoice.customer_phone}</span>
                </div>
              )}
              {invoice.customer_email && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Email</span>
                  <span className="font-medium text-navy-700">{invoice.customer_email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Tanggal Invoice</span>
                <span className="font-medium text-navy-700">{formatDate(invoice.issue_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Jatuh Tempo</span>
                <span className={`font-medium ${
                  invoice.status === INVOICE_STATUS.OVERDUE ? 'text-red-600' :
                  invoice.status === INVOICE_STATUS.DUE_TODAY ? 'text-yellow-600' :
                  'text-navy-700'
                }`}>
                  {formatDueDate(invoice.due_date, invoice.status)}
                </span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Total</p>
                <p className="mt-1 text-sm font-extrabold text-navy-700">{formatCurrency(invoice.amount)}</p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Terbayar</p>
                <p className="mt-1 text-sm font-extrabold text-profit-600">{formatCurrency(invoice.paid_amount)}</p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Sisa</p>
                <p className={`mt-1 text-sm font-extrabold ${
                  invoice.outstanding > 0 ? 'text-red-600' : 'text-profit-600'
                }`}>
                  {formatCurrency(invoice.outstanding)}
                </p>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-4 rounded-lg border border-border bg-cream px-3 py-2">
                <p className="text-[10px] font-bold text-text-muted uppercase mb-1">Catatan</p>
                <p className="text-xs text-navy-700">{invoice.notes}</p>
              </div>
            )}

            {/* Payment History */}
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-text-muted uppercase">Riwayat Pembayaran</p>
                {invoice.status !== INVOICE_STATUS.PAID && onPayment && (
                  <button
                    onClick={() => { onClose(); onPayment(invoice) }}
                    className="text-[10px] font-semibold text-warm-500 hover:text-warm-600"
                  >
                    + Bayar
                  </button>
                )}
              </div>
              {!payments || payments.length === 0 ? (
                <p className="mt-3 text-xs text-text-muted text-center">Belum ada pembayaran</p>
              ) : (
                <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
                  {[...payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)).map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-profit-600">{formatCurrency(p.amount)}</span>
                          <span className="text-[10px] text-text-muted">{formatDate(p.payment_date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.method && (
                            <span className="text-[10px] text-text-muted">{PAYMENT_METHODS[p.method] || p.method}</span>
                          )}
                          {p.notes && (
                            <span className="text-[10px] text-text-muted truncate">{p.notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Follow-up History */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-bold text-text-muted uppercase">Riwayat Follow-up</p>
              {!followups || followups.length === 0 ? (
                <p className="mt-3 text-xs text-text-muted text-center">Belum ada follow-up</p>
              ) : (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {[...followups].sort((a, b) => new Date(b.follow_up_date) - new Date(a.follow_up_date)).map(f => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-navy-700">
                            {METHOD_LABELS[f.method] || f.method}
                          </span>
                          <span className="text-[10px] text-text-muted">{formatDate(f.follow_up_date)}</span>
                          {f.result && (
                            <span className={`text-[10px] font-semibold ${FOLLOWUP_RESULT_COLORS[f.result] || ''}`}>
                              {FOLLOWUP_RESULT_LABELS[f.result] || f.result}
                            </span>
                          )}
                        </div>
                        {f.next_follow_up_date && (
                          <p className="mt-0.5 text-[10px] text-warm-500">
                            Follow-up berikutnya: {formatDate(f.next_follow_up_date)}
                          </p>
                        )}
                        {f.note && (
                          <p className="mt-0.5 text-[10px] text-text-muted truncate">{f.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
              >
                Tutup
              </button>
              {invoice.status !== INVOICE_STATUS.PAID && onPayment && (
                <button
                  onClick={() => { onClose(); onPayment(invoice) }}
                  className="rounded-xl border border-profit-200 bg-profit-50 px-4 py-2.5 text-sm font-medium text-profit-600 transition-colors hover:bg-profit-100"
                >
                  Bayar
                </button>
              )}
              {invoice.customer_phone && onContact && (
                <button
                  onClick={() => onContact(invoice)}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
                >
                  Hubungi
                </button>
              )}
              {invoice.status !== INVOICE_STATUS.PAID && onFollowup && (
                <button
                  onClick={() => { onClose(); onFollowup(invoice) }}
                  className="rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md"
                >
                  + Follow-up
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => { onClose(); onEdit(invoice) }}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => { onClose(); onDelete(invoice) }}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
                >
                  Hapus
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
