import { motion } from 'framer-motion'
import AnimatedNumber from '../../components/AnimatedNumber'
import { getCurrencyMeta, formatIDR, calcChange } from '../../lib/currencyService'

/**
 * Currency pair card showing "1 FROM ≈ RpX" format.
 *
 * Props:
 *   from        – source currency code (e.g. 'USD')
 *   to          – target currency code (e.g. 'IDR')
 *   rate        – rate value: 1 from = X to
 *   prevRate    – previous rate for change calculation
 *   delay       – stagger delay in seconds
 *   onStar      – (from, to) => void — star button handler
 *   isStarred   – whether this pair is favorited
 *   showStar    – show star button
 */
export default function CurrencyCard({
  from,
  to = 'IDR',
  rate,
  prevRate,
  delay = 0,
  onStar,
  isStarred = false,
  showStar = true,
}) {
  const fromMeta = getCurrencyMeta(from)
  const toMeta = getCurrencyMeta(to)
  const change = calcChange(rate, prevRate)

  // Format: "1 USD ≈ Rp16.500" or "1 USD ≈ €0.92"
  const formatRate = (val) => {
    if (val == null || !Number.isFinite(val)) return '—'
    if (to === 'IDR') return formatIDR(val)
    return `${toMeta.symbol}${formatForeignCompact(val, to)}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md"
    >
      {/* Star button */}
      {showStar && onStar && (
        <button
          onClick={() => onStar(from, to)}
          className={`absolute right-3 top-3 text-lg transition-all duration-200 hover:scale-110 ${
            isStarred ? 'text-warm-400' : 'text-navy-200 hover:text-warm-300'
          }`}
          title={isStarred ? 'Hapus dari favorit' : 'Tambah ke favorit'}
        >
          {isStarred ? '★' : '☆'}
        </button>
      )}

      {/* Pair header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{fromMeta.flag}</span>
        <svg className="h-3 w-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
        <span className="text-lg">{toMeta.flag}</span>
        <span className="text-xs font-semibold text-text-secondary">{from} → {to}</span>
      </div>

      {/* Rate */}
      <div className="mb-1">
        <span className="text-xs text-text-muted">1 {from} ≈ </span>
        <AnimatedNumber
          value={rate}
          format={formatRate}
          size="lg"
          showIndicator
          className="text-navy-700"
        />
      </div>

      {/* Change */}
      <div className="flex items-center justify-between">
        {change.direction !== 'flat' ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              change.direction === 'up'
                ? 'bg-profit-50 text-profit-600'
                : 'bg-red-50 text-red-600'
            }`}
          >
            <span className="text-[10px]">{change.direction === 'up' ? '▲' : '▼'}</span>
            {change.value.toFixed(2)}%
          </span>
        ) : (
          <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs text-text-muted">
            0.00%
          </span>
        )}
      </div>
    </motion.div>
  )
}

function formatForeignCompact(value, code) {
  if (!Number.isFinite(value)) return '—'
  if (code === 'JPY' || code === 'KRW') {
    return value.toLocaleString('id-ID', { maximumFractionDigits: 1 })
  }
  if (value >= 100) {
    return value.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  }
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 })
}
