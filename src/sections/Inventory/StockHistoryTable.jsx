import { motion } from 'framer-motion'
import { getMovementLabel, MOVEMENT_TYPES, MOVEMENT_ICONS } from '../../lib/inventoryUtils'
import { formatDateTime } from '../../lib/orderNumber'

const TYPE_COLORS = {
  [MOVEMENT_TYPES.STOCK_IN]: 'text-profit-600',
  [MOVEMENT_TYPES.STOCK_OUT]: 'text-red-500',
  [MOVEMENT_TYPES.ADJUSTMENT_INCREASE]: 'text-electric-600',
  [MOVEMENT_TYPES.ADJUSTMENT_DECREASE]: 'text-warm-500',
}

const TYPE_BG = {
  [MOVEMENT_TYPES.STOCK_IN]: 'bg-profit-50',
  [MOVEMENT_TYPES.STOCK_OUT]: 'bg-red-50',
  [MOVEMENT_TYPES.ADJUSTMENT_INCREASE]: 'bg-electric-50',
  [MOVEMENT_TYPES.ADJUSTMENT_DECREASE]: 'bg-warm-50',
}

export default function StockHistoryTable({ movements, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-muted">Memuat riwayat stok...</p>
      </div>
    )
  }

  if (!movements || movements.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <svg className="mx-auto h-10 w-10 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-3 text-sm font-semibold text-navy-700">Belum ada riwayat</p>
        <p className="mt-1 text-xs text-text-muted">Riwayat stok akan muncul setelah ada perubahan.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-bold text-navy-700">Riwayat Stok</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-muted">
              <th className="pb-2 pr-3 font-semibold">Tanggal</th>
              <th className="pb-2 pr-3 font-semibold">Tipe</th>
              <th className="pb-2 pr-3 font-semibold text-right">Qty</th>
              <th className="pb-2 pr-3 font-semibold text-right">Sebelum</th>
              <th className="pb-2 pr-3 font-semibold text-right">Sesudah</th>
              <th className="pb-2 font-semibold">Alasan</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m, idx) => {
              const isIncrease = m.movement_type === MOVEMENT_TYPES.STOCK_IN || m.movement_type === MOVEMENT_TYPES.ADJUSTMENT_INCREASE
              return (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5 pr-3 text-text-muted whitespace-nowrap">
                    {formatDateTime ? formatDateTime(m.created_at) : new Date(m.created_at).toLocaleDateString('id-ID')}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BG[m.movement_type]} ${TYPE_COLORS[m.movement_type]}`}>
                      {MOVEMENT_ICONS[m.movement_type]} {getMovementLabel(m.movement_type)}
                    </span>
                  </td>
                  <td className={`py-2.5 pr-3 text-right font-semibold ${isIncrease ? 'text-profit-600' : 'text-red-500'}`}>
                    {isIncrease ? '+' : '-'}{m.quantity}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-text-muted">{m.stock_before}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-navy-700">{m.stock_after}</td>
                  <td className="py-2.5 text-text-secondary max-w-[200px] truncate">{m.reason}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
