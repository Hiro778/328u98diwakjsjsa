import { useState } from 'react'

export default function AdminBusinessActionModal({
  isOpen,
  targetBusiness,
  onClose,
  onConfirm,
  loading = false,
}) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  if (!isOpen || !targetBusiness) return null

  const isDeactivating = targetBusiness.is_active

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError('')

    if (isDeactivating && !reason.trim()) {
      setValidationError('Alasan penonaktifan bisnis wajib diisi untuk catatan Audit Log.')
      return
    }

    onConfirm({
      businessId: targetBusiness.id,
      isActive: !isDeactivating,
      reason: reason.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-3">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isDeactivating
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            {isDeactivating ? 'Nonaktifkan Bisnis (Deactivate)' : 'Aktifkan Kembali Bisnis (Activate)'}
          </span>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Target Info */}
        <div className="bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 space-y-1 text-xs">
          <div className="text-gray-400">Target Entitas Bisnis:</div>
          <div className="text-white font-semibold text-sm">{targetBusiness.name}</div>
          <div className="text-gray-400 font-mono text-[11px]">ID: {targetBusiness.id}</div>
          <div className="text-emerald-400 text-[11px]">Owner: {targetBusiness.owner_name} ({targetBusiness.owner_email})</div>
        </div>

        {/* Consequences */}
        <div
          className={`text-xs p-3 rounded-lg leading-relaxed ${
            isDeactivating
              ? 'text-amber-300/90 bg-amber-500/10 border border-amber-500/20'
              : 'text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/20'
          }`}
        >
          <span className="font-semibold block mb-0.5">Konsekuensi:</span>
          {isDeactivating
            ? 'Bisnis akan ditandai nonaktif. QR Menu publik dan kasir POS bisnis ini akan ditangguhkan sementara hingga diaktifkan kembali. Data produk dan pesanan tetap tersimpan utuh.'
            : 'Bisnis akan dipulihkan ke status aktif normal. Seluruh layanan QR Menu dan transaksi POS dapat beroperasi kembali.'}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isDeactivating && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Alasan Penonaktifan <span className="text-red-400">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Jelaskan alasan penonaktifan bisnis ini untuk catatan Audit Log..."
                rows={3}
                className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-amber-500"
                required
              />
            </div>
          )}

          {validationError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded">
              {validationError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white bg-[#1F2937] hover:bg-[#374151] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                isDeactivating
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {loading ? 'Memproses...' : isDeactivating ? 'Konfirmasi Nonaktifkan' : 'Konfirmasi Aktifkan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
