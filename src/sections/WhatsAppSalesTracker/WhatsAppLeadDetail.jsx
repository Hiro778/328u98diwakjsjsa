import { motion, AnimatePresence } from 'framer-motion'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  FOLLOWUP_METHODS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from './whatsappSalesUtils'

export default function WhatsAppLeadDetail({ show, lead, followups, onClose, onWhatsApp, onCall, onFollowup, onEdit, onDelete }) {
  if (!lead) return null

  const sortedFollowups = [...(followups || [])].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

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
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warm-50 text-lg font-bold text-warm-500">
                {(lead.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-navy-700 truncate">{lead.name}</h2>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${LEAD_STATUS_COLORS[lead.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                    {LEAD_STATUS_LABELS[lead.status] || lead.status}
                  </span>
                  <span className={`text-xs font-medium ${PRIORITY_COLORS[lead.priority] || 'text-text-muted'}`}>
                    {PRIORITY_LABELS[lead.priority] || lead.priority}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            {lead.phone && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onWhatsApp(lead)}
                  className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-white hover:bg-green-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => onCall(lead)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Telepon
                </button>
              </div>
            )}

            {/* Info Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <InfoItem label="Estimasi Nilai" value={formatCurrency(lead.estimated_value)} />
              <InfoItem label="Produk / Minat" value={lead.product_interest || '-'} />
              <InfoItem label="Tanggal Lead" value={formatDate(lead.lead_date)} />
              <InfoItem label="Last Contacted" value={lead.last_contacted_at ? formatRelativeTime(lead.last_contacted_at) : '-'} />
              <InfoItem label="Next Follow-up" value={lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : '-'} />
              {lead.phone && <InfoItem label="Telepon" value={lead.phone} />}
              {lead.email && <InfoItem label="Email" value={lead.email} />}
              {lead.customer_name && <InfoItem label="Customer" value={lead.customer_name} />}
            </div>

            {/* Conversion Info */}
            {lead.status === 'won' && lead.converted_at && (
              <div className="mt-3 rounded-lg border border-profit-200 bg-profit-50 p-3 text-xs text-profit-600">
                ✓ Converted pada {formatDateTime(lead.converted_at)}
                {lead.customer_name && ` — Customer: ${lead.customer_name}`}
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div className="mt-3">
                <p className="text-xs font-medium text-text-muted">Catatan</p>
                <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Follow-up Timeline */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-text-muted uppercase">Riwayat Follow-up</p>
                <span className="text-xs text-text-muted">{sortedFollowups.length} aktivitas</span>
              </div>
              {sortedFollowups.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">Belum ada follow-up</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {sortedFollowups.map(fu => (
                    <div key={fu.id} className="rounded-lg border border-border bg-cream/50 p-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-warm-50 border border-warm-200 px-2 py-0.5 text-[10px] font-bold text-warm-500">
                          {FOLLOWUP_METHODS.find(m => m.key === fu.method)?.label || fu.method}
                        </span>
                        {fu.result && (
                          <span className="text-[10px] text-text-muted">{fu.result}</span>
                        )}
                      </div>
                      {fu.notes && <p className="mt-1 text-xs text-text-secondary">{fu.notes}</p>}
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted">
                        <span>{formatDateTime(fu.created_at)}</span>
                        {fu.next_follow_up_at && <span>Next: {formatDate(fu.next_follow_up_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
              >
                Tutup
              </button>
              <button
                onClick={() => onFollowup(lead)}
                className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-2.5 text-sm font-bold text-warm-500 transition-colors hover:bg-warm-100"
              >
                Follow-up
              </button>
              <button
                onClick={() => onEdit(lead)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(lead)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-100"
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

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-sm text-navy-700">{value}</p>
    </div>
  )
}
