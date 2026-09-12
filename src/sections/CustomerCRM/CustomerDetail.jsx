import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  safeNumber,
} from './customerUtils'

export default function CustomerDetail({ show, customer, onClose, onEdit, onDelete }) {
  const { business } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loadingTx, setLoadingTx] = useState(false)

  useEffect(() => {
    if (show && customer?.id && business?.id) {
      loadTransactions()
    }
  }, [show, customer?.id, business?.id])

  async function loadTransactions() {
    setLoadingTx(true)
    try {
      const { data } = await supabase
        .from('sales')
        .select('id, quantity, unit_price, total, sale_date, notes, created_at, product:products(name)')
        .eq('business_id', business.id)
        .eq('customer_id', customer.id)
        .order('sale_date', { ascending: false })
        .limit(50)

      setTransactions(data || [])
    } catch {
      setTransactions([])
    }
    setLoadingTx(false)
  }

  if (!customer) return null

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
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-50 text-lg font-bold text-warm-500">
                  {(customer.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-navy-700">{customer.name}</h2>
                  <p className="text-xs text-text-muted">
                    Customer sejak {formatDate(customer.created_at)}
                  </p>
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
                <p className="text-[10px] font-bold text-text-muted uppercase">Total Transaksi</p>
                <p className="mt-1 text-lg font-extrabold text-navy-700">
                  {customer.total_transactions || 0}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Total Belanja</p>
                <p className="mt-1 text-lg font-extrabold text-profit-600">
                  {formatCurrency(customer.total_spent || 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-cream p-3 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase">Transaksi Terakhir</p>
                <p className="mt-1 text-xs font-bold text-navy-700">
                  {customer.last_transaction_at
                    ? formatDate(customer.last_transaction_at)
                    : '-'}
                </p>
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
              {customer.address && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Alamat</span>
                  <span className="max-w-[60%] text-right font-medium text-navy-700">{customer.address}</span>
                </div>
              )}
              {customer.notes && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Catatan</span>
                  <span className="max-w-[60%] text-right font-medium text-navy-700">{customer.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Dibuat</span>
                <span className="font-medium text-navy-700">{formatDateTime(customer.created_at)}</span>
              </div>
              {customer.updated_at && customer.updated_at !== customer.created_at && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Diupdate</span>
                  <span className="font-medium text-navy-700">{formatDateTime(customer.updated_at)}</span>
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-bold text-text-muted uppercase">Riwayat Transaksi</p>
              {loadingTx ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="mt-3 text-xs text-text-muted text-center">Belum ada transaksi</p>
              ) : (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                  {transactions.map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-navy-700 truncate">
                          {tx.product?.name || 'Produk'}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {tx.quantity} × {formatCurrency(tx.unit_price)} · {formatDate(tx.sale_date)}
                        </p>
                      </div>
                      <p className="shrink-0 pl-3 text-xs font-bold text-warm-500">
                        {formatCurrency(safeNumber(tx.total))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
              >
                Tutup
              </button>
              <button
                onClick={() => { onClose(); onEdit(customer); }}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-cream"
              >
                Edit
              </button>
              <button
                onClick={() => { onClose(); onDelete(customer); }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                Hapus
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
