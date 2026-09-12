import { motion } from 'framer-motion'
import StockStatusBadge from './StockStatusBadge'
import { getEffectiveStock, getEffectiveMinStock } from '../../lib/inventoryUtils'

export default function LowStockAlert({ products, onViewProduct }) {
  if (!products || products.length === 0) return null

  return (
    <div className="rounded-2xl border border-warm-200 bg-warm-50 p-5">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-sm font-bold text-warm-600">Perlu Perhatian</h3>
        <span className="ml-auto rounded-full bg-warm-200 px-2 py-0.5 text-[10px] font-bold text-warm-600">
          {products.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {products.slice(0, 5).map((p) => (
          <motion.button
            key={p.id}
            onClick={() => onViewProduct?.(p)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex w-full items-center justify-between rounded-xl border border-warm-100 bg-surface px-3 py-2.5 text-left transition-all hover:border-warm-200"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-700">{p.name}</p>
              <p className="text-[11px] text-text-muted">
                Stok: {getEffectiveStock(p)} · Min: {getEffectiveMinStock(p)}
              </p>
            </div>
            <StockStatusBadge stock={getEffectiveStock(p)} minimumStock={getEffectiveMinStock(p)} />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
