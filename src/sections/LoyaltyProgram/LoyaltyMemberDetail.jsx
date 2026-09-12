import { motion, AnimatePresence } from 'framer-motion'
import {
  formatPoints, formatCurrency, formatDate, formatDateTime, safeInt,
  LEDGER_TYPE_LABELS, LEDGER_TYPE_COLORS,
} from './loyaltyUtils'

export default function LoyaltyMemberDetail({ show, customer, ledger, onClose, onAdjust, onRedeem }) {
  if (!customer) return null

  const memberLedger = (ledger || [])
    .filter(l => l.customer_id === customer.id)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5" onClick={onClose}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-50 text-lg font-bold text-warm-500">
                  {(customer.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-navy-700">{customer.name}</h2>
                  {customer.loyalty_is_member && <span className="text-[9px] font-bold text-warm-500 bg-warm-50 rounded-full px-2 py-0.5">Member</span>}
                </div>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-navy-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Metrics */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Saldo Poin</p>
                <p className="mt-1 text-lg font-extrabold text-warm-500">{formatPoints(customer.loyalty_points_balance)}</p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Lifetime</p>
                <p className="mt-1 text-lg font-extrabold text-navy-700">{formatPoints(customer.loyalty_lifetime_points)}</p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Redeemed</p>
                <p className="mt-1 text-lg font-extrabold text-red-500">{formatPoints(customer.loyalty_total_redeemed)}</p>
              </div>
            </div>

            {/* Info */}
            <div className="mt-5 space-y-2.5 text-sm">
              {customer.phone && (
                <div className="flex justify-between">
                  <span className="text-text-muted">HP</span>
                  <span className="font-medium text-navy-700">{customer.phone}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Email</span>
                  <span className="font-medium text-navy-700">{customer.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Total Transaksi</span>
                <span className="font-medium text-navy-700">{customer.total_transactions || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Total Spending</span>
                <span className="font-medium text-navy-700">{formatCurrency(customer.total_spent || 0)}</span>
              </div>
            </div>

            {/* Ledger History */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-bold text-text-muted uppercase">Riwayat Poin</p>
              {memberLedger.length === 0 ? (
                <p className="mt-3 text-xs text-text-muted text-center">Belum ada aktivitas poin</p>
              ) : (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {memberLedger.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${LEDGER_TYPE_COLORS[entry.type] || ''}`}>
                            {LEDGER_TYPE_LABELS[entry.type] || entry.type}
                          </span>
                          <span className="text-[10px] text-text-muted">{formatDateTime(entry.created_at)}</span>
                        </div>
                        {entry.description && (
                          <p className="mt-0.5 text-[10px] text-text-muted truncate">{entry.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold ${
                          ['EARN', 'ADJUSTMENT_ADD'].includes(entry.type) ? 'text-profit-600' : 'text-red-500'
                        }`}>
                          {['EARN', 'ADJUSTMENT_ADD'].includes(entry.type) ? '+' : '-'}{entry.points} poin
                        </p>
                        <p className="text-[10px] text-text-muted">Saldo: {entry.balance_after}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button onClick={onClose}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream">
                Tutup
              </button>
              <button onClick={() => { onClose(); onAdjust(customer) }}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-cream">
                Adjust
              </button>
              <button onClick={() => { onClose(); onRedeem(customer) }}
                className="rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md">
                Tukar Poin
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
