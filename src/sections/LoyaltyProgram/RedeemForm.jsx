import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { validateRedemption, normalizeReward, safeInt, isRewardAvailable, formatPoints } from './loyaltyUtils'

export default function RedeemForm({ show, onClose, onSave, customer, rewards, program }) {
  const [selectedReward, setSelectedReward] = useState(null)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')

  const availableRewards = (rewards || []).filter(r => isRewardAvailable(r))

  useEffect(() => {
    if (show) {
      setSelectedReward(null)
      setServerError('')
    }
  }, [show])

  async function handleRedeem() {
    if (!selectedReward || !customer) return

    const { valid, errors } = validateRedemption(customer, selectedReward, program)
    if (!valid) {
      setServerError(Object.values(errors)[0])
      return
    }

    setSaving(true)
    setServerError('')
    try {
      await onSave({ reward: selectedReward, customer })
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
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-navy-700">Tukar Poin</h2>
            <p className="mt-1 text-xs text-text-muted">
              {customer.name} · Saldo: {formatPoints(customer.loyalty_points_balance)}
            </p>

            {serverError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{serverError}</p>
              </div>
            )}

            {availableRewards.length === 0 ? (
              <div className="mt-6 rounded-xl border border-border bg-cream p-6 text-center">
                <p className="text-sm text-text-muted">Tidak ada reward tersedia</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {availableRewards.map(r => {
                  const canAfford = safeInt(customer.loyalty_points_balance) >= r.points_required
                  const isSelected = selectedReward?.id === r.id
                  return (
                    <button key={r.id} onClick={() => canAfford && setSelectedReward(r)}
                      disabled={!canAfford}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                        isSelected ? 'border-warm-400 bg-warm-50' :
                        canAfford ? 'border-border bg-surface hover:border-warm-200' :
                        'border-border bg-surface opacity-50 cursor-not-allowed'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-navy-700">{r.name}</p>
                          {r.description && <p className="text-[10px] text-text-muted">{r.description}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-warm-500">{formatPoints(r.points_required)}</p>
                          {r.stock != null && <p className="text-[10px] text-text-muted">Stok: {r.stock}</p>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => !saving && onClose()} disabled={saving}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60">
                Batal
              </button>
              <button onClick={handleRedeem} disabled={saving || !selectedReward}
                className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60">
                {saving ? 'Memproses...' : 'Tukar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
