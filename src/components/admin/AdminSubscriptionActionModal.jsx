import { useState } from 'react'

export default function AdminSubscriptionActionModal({
  isOpen,
  targetSubscription,
  onClose,
  onConfirm,
  loading = false,
}) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  if (!isOpen || !targetSubscription) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError('')

    if (!reason.trim()) {
      setValidationError('Alasan pembatalan langganan wajib diisi untuk catatan Audit Log.')
      return
    }

    onConfirm({
      subscriptionId: targetSubscription.id,
      reason: reason.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-500/10 text-red-400 border-red-500/20">
            Batalkan Langganan (Cancel Subscription)
          </span>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-white text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Target Info */}
        <div className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 space-y-1 text-xs">
          <div className="text-gray-400">Target Langganan:</div>
          <div className="text-white font-semibold text-sm">
            Plan: <span className="uppercase text-amber-400">{targetSubscription.plan}</span>
          </div>
          <div className="text-gray-400 font-mono text-[11px]">ID: {targetSubscription.id}</div>
          <div className="text-emerald-400 text-[11px]">
            User: {targetSubscription.user?.name || targetSubscription.user?.email || '—'} ({targetSubscription.user?.email || '—'})
          </div>
          {targetSubscription.business_name && (
            <div className="text-cyan-400 text-[11px]">Bisnis: {targetSubscription.business_name}</div>
          )}
        </div>

        {/* Consequences */}
        <div className="text-xs p-3 rounded-lg leading-relaxed text-red-300/90 bg-red-500/10 border border-red-500/20">
          <span className="font-semibold block mb-0.5">Konsekuensi:</span>
          Status langganan akan diubah menjadi <span className="font-semibold text-white">cancelled</span> dan hak akses Pro akan ditutup. Riwayat pembayaran sebelumnya tetap aman dan tidak dihapus. Tindakan ini akan dicatat ke Admin Audit Log.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Alasan Pembatalan <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Permintaan pengguna via CS WhatsApp / Penghentian sepihak pelanggaran ToS..."
              rows={3}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-red-500"
              required
            />
          </div>

          {validationError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded">
              {validationError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-[#1F2937] hover:bg-[#374151] rounded-lg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Memproses...' : 'Konfirmasi Pembatalan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
