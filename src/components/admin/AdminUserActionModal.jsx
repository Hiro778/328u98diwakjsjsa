import { useState } from 'react'

export default function AdminUserActionModal({
  isOpen,
  actionType, // 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'delete'
  targetUser,
  onClose,
  onConfirm,
  loading = false,
}) {
  const [reason, setReason] = useState('')
  const [confirmationPhrase, setConfirmationPhrase] = useState('')
  const [validationError, setValidationError] = useState('')

  if (!isOpen || !targetUser) return null

  const actionConfigs = {
    suspend: {
      title: 'Tangguhkan Pengguna (Suspend)',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      buttonColor: 'bg-amber-600 hover:bg-amber-500 text-white',
      consequence: 'Pengguna tidak dapat menggunakan aplikasi sesuai policy. Data transaksi, subscription, dan support history tetap utuh. Status dapat dipulihkan (unsuspend).',
      requiresPhrase: false,
      newStatus: 'suspended',
    },
    unsuspend: {
      title: 'Pulihkan Pengguna (Unsuspend)',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      buttonColor: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      consequence: 'Akses pengguna akan dipulihkan kembali ke status aktif normal.',
      requiresPhrase: false,
      newStatus: 'active',
    },
    ban: {
      title: 'Cekal Pengguna (Ban)',
      badgeColor: 'bg-red-500/10 text-red-400 border-red-500/20',
      buttonColor: 'bg-red-600 hover:bg-red-500 text-white',
      consequence: 'Sesi pengguna akan diblokir total dari seluruh operasi terautentikasi dan API. Tindakan ini dicatat ke Audit Log.',
      requiresPhrase: true,
      phraseExpected: 'BAN USER',
      newStatus: 'banned',
    },
    unban: {
      title: 'Buka Cekal Pengguna (Unban)',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      buttonColor: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      consequence: 'Status pencekalan dicabut dan akun dipulihkan ke status aktif.',
      requiresPhrase: false,
      newStatus: 'active',
    },
    delete: {
      title: 'Hapus Pengguna (Soft Delete)',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      buttonColor: 'bg-rose-600 hover:bg-rose-500 text-white',
      consequence: 'TINDAKAN BERISIKO TINGGI: Pengguna akan dinonaktifkan secara soft-delete. Histori pembayaran dan foreign key tetap dijaga agar tidak terjadi data corruption.',
      requiresPhrase: true,
      phraseExpected: 'DELETE USER',
      newStatus: 'deleted',
    },
  }

  const config = actionConfigs[actionType] || actionConfigs.suspend

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError('')

    if (['suspend', 'ban', 'delete'].includes(actionType) && !reason.trim()) {
      setValidationError('Alasan tindakan wajib diisi untuk catatan Audit Log.')
      return
    }

    if (config.requiresPhrase && confirmationPhrase.trim() !== config.phraseExpected) {
      setValidationError(`Ketikkan "${config.phraseExpected}" secara persis untuk konfirmasi.`)
      return
    }

    onConfirm({
      targetUserId: targetUser.id,
      newStatus: config.newStatus,
      reason: reason.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-3">
          <div className="flex items-center gap-2.5">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeColor}`}>
              {config.title}
            </span>
          </div>
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
          <div className="text-gray-400">Target Pengguna:</div>
          <div className="text-white font-semibold text-sm">{targetUser.name || targetUser.email}</div>
          <div className="text-gray-400 font-mono text-[11px]">{targetUser.email} (ID: {targetUser.id})</div>
          {targetUser.business_name && (
            <div className="text-emerald-400 text-[11px]">Bisnis: {targetUser.business_name}</div>
          )}
        </div>

        {/* Consequences */}
        <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg leading-relaxed">
          <span className="font-semibold text-amber-300 block mb-0.5">Konsekuensi:</span>
          {config.consequence}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Alasan (Reason) {['suspend', 'ban', 'delete'].includes(actionType) && <span className="text-red-400">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan tindakan administratif ini untuk audit trail..."
              rows={3}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-hidden focus:border-emerald-500"
              required={['suspend', 'ban', 'delete'].includes(actionType)}
            />
          </div>

          {config.requiresPhrase && (
            <div>
              <label className="block text-xs font-semibold text-red-400 mb-1">
                Ketik <span className="font-mono bg-red-500/20 px-1 py-0.5 rounded">{config.phraseExpected}</span> untuk konfirmasi:
              </label>
              <input
                type="text"
                value={confirmationPhrase}
                onChange={(e) => setConfirmationPhrase(e.target.value)}
                placeholder={config.phraseExpected}
                className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-2 text-xs font-mono text-white focus:outline-hidden focus:border-red-500"
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
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${config.buttonColor}`}
            >
              {loading ? 'Memproses...' : 'Konfirmasi Tindakan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
