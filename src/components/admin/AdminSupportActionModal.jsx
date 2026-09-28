import { useState } from 'react'

export default function AdminSupportActionModal({
  isOpen,
  ticket,
  onClose,
  onConfirm,
  loading = false,
}) {
  const [status, setStatus] = useState(ticket?.status || 'in_progress')
  const [priority, setPriority] = useState(ticket?.priority || 'medium')
  const [adminNote, setAdminNote] = useState(ticket?.admin_note || '')
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  if (!isOpen || !ticket) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError('')

    onConfirm({
      ticketId: ticket.id,
      status,
      priority,
      adminNote: adminNote.trim(),
      reason: reason.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-[#111827] border border-[#1F2937] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2937] pb-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
            Perbarui Tiket Support
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
          <div className="text-gray-400">Target Tiket:</div>
          <div className="text-white font-semibold text-sm">
            {ticket.subject || '(Tanpa Judul)'}
          </div>
          <div className="text-gray-400 font-mono text-[11px]">ID: {ticket.id}</div>
          <div className="text-emerald-400 text-[11px]">
            Pengguna: {ticket.user?.full_name || ticket.user?.email || ticket.user_id}
          </div>
          {ticket.business?.name && (
            <div className="text-cyan-400 text-[11px]">Bisnis: {ticket.business.name}</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Status Tiket
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading}
                className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="new">Baru (New)</option>
                <option value="in_progress">Sedang Diproses (In Progress)</option>
                <option value="waiting_user">Menunggu Respon User (Waiting User)</option>
                <option value="resolved">Terselesaikan (Resolved)</option>
                <option value="closed">Ditutup (Closed)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Prioritas
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={loading}
                className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="low">Rendah (Low)</option>
                <option value="medium">Sedang (Medium)</option>
                <option value="high">Tinggi (High)</option>
                <option value="urgent">Mendesak (Urgent)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Catatan Internal Admin (admin_note)
            </label>
            <textarea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Catatan penanganan internal tim support..."
              disabled={loading}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Alasan Perubahan (Dicatat di Audit Log)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Tiket selesai diinvestigasi / eskalasi teknis..."
              disabled={loading}
              className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {validationError && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
              {validationError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white bg-transparent rounded-lg border border-[#1F2937] hover:bg-[#1F2937] transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition cursor-pointer"
            >
              {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
