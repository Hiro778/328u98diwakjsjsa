import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CurrencySelector from '../../components/CurrencySelector'
import AnimatedNumber from '../../components/AnimatedNumber'
import {
  convert,
  formatIDR,
  formatForeign,
  getCurrencyMeta,
  getFavoritePairs,
  saveFavoritePairs,
  toggleFavoritePair,
  isFavoritePair,
} from '../../lib/currencyService'

/**
 * Premium currency converter with custom selectors.
 *
 * Layout:
 *   [ FROM selector ] [ ⇄ ] [ TO selector ]
 *   [ Amount input ]
 *   ≈ Result
 *   1 FROM ≈ X TO
 *   1 TO ≈ Y FROM
 *   [ ★ Save as favorite ]
 *
 * Props:
 *   rates – current rates { USD: 16500, EUR: 17920, ... }
 */
export default function CurrencyConverter({ rates }) {
  const [fromCurrency, setFromCurrency] = useState('IDR')
  const [toCurrency, setToCurrency] = useState('USD')
  const [amount, setAmount] = useState('1000000')
  const [favorites, setFavorites] = useState(() => getFavoritePairs())

  const numericAmount = useMemo(() => {
    const clean = amount.replace(/[^0-9.,]/g, '').replace(',', '.')
    const n = parseFloat(clean)
    return Number.isFinite(n) ? n : 0
  }, [amount])

  const result = useMemo(() => {
    if (!rates || numericAmount === 0) return null
    return convert(numericAmount, fromCurrency, toCurrency, rates)
  }, [numericAmount, fromCurrency, toCurrency, rates])

  // Rate info: "1 USD ≈ Rp16.500" and inverse "1 IDR ≈ US$0.0000606"
  const rateInfo = useMemo(() => {
    if (!rates) return null
    const direct = convert(1, fromCurrency, toCurrency, rates)
    const inverse = convert(1, toCurrency, fromCurrency, rates)
    return { direct, inverse }
  }, [fromCurrency, toCurrency, rates])

  const handleSwap = useCallback(() => {
    // When swapping: keep the amount value but swap currencies
    // If result was computed, use it as the new amount
    if (result !== null && Number.isFinite(result)) {
      const decimals = toCurrency === 'JPY' || toCurrency === 'KRW' ? 0 : 2
      setAmount(
        result.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      )
    }
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }, [fromCurrency, toCurrency, result])

  const handleToggleFavorite = useCallback(() => {
    const updated = toggleFavoritePair(fromCurrency, toCurrency, favorites)
    setFavorites(updated)
    saveFavoritePairs(updated)
  }, [fromCurrency, toCurrency, favorites])

  const isFav = isFavoritePair(fromCurrency, toCurrency, favorites)
  const fromMeta = getCurrencyMeta(fromCurrency)

  const formatResult = (val) => {
    if (val == null || !Number.isFinite(val)) return '—'
    if (toCurrency === 'IDR') return formatIDR(val)
    return formatForeign(val, toCurrency)
  }

  if (!rates) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="h-5 w-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-sm font-semibold text-navy-700">Konverter Mata Uang</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-navy-200 border-t-warm-400" />
            <p className="text-sm text-text-muted">Memuat data kurs…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-sm font-semibold text-navy-700">Konverter Mata Uang</p>
        </div>
        <button
          onClick={handleToggleFavorite}
          className={`text-xl transition-all duration-200 hover:scale-110 ${
            isFav ? 'text-warm-400' : 'text-navy-200 hover:text-warm-300'
          }`}
          title={isFav ? 'Hapus dari favorit' : 'Simpan pair ini sebagai favorit'}
        >
          {isFav ? '★' : '☆'}
        </button>
      </div>

      {/* Selector row */}
      <div className="flex items-end gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Dari</label>
          <CurrencySelector
            value={fromCurrency}
            onChange={setFromCurrency}
            exclude={toCurrency}
            rates={rates}
          />
        </div>

        {/* Swap button */}
        <button
          onClick={handleSwap}
          className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-cream transition-all duration-200 hover:border-warm-300 hover:bg-warm-50 hover:scale-105 active:scale-95"
          title="Tukar posisi"
        >
          <svg className="h-4 w-4 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Ke</label>
          <CurrencySelector
            value={toCurrency}
            onChange={setToCurrency}
            exclude={fromCurrency}
            rates={rates}
          />
        </div>
      </div>

      {/* Amount input */}
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-text-muted">Nominal</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-navy-400">
            {fromMeta.symbol}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-border bg-cream py-3 pl-10 pr-4 text-lg font-bold text-navy-700 outline-none transition-colors placeholder:text-text-muted focus:border-warm-400 focus:ring-2 focus:ring-warm-400/20"
            placeholder="0"
          />
        </div>
      </div>

      {/* Result */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${fromCurrency}-${toCurrency}-${numericAmount}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 rounded-xl border border-warm-200 bg-warm-50 p-4"
        >
          <p className="text-xs text-text-muted mb-1">Hasil konversi</p>
          {result !== null ? (
            <AnimatedNumber
              value={result}
              format={formatResult}
              size="xl"
              className="text-navy-700"
            />
          ) : (
            <p className="text-2xl font-bold text-navy-700">—</p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Rate explanation */}
      {rateInfo && rateInfo.direct !== null && (
        <div className="mt-4 space-y-1 rounded-xl bg-cream p-3">
          <p className="text-xs font-medium text-text-muted">Nilai tukar</p>
          <div className="flex items-center gap-2 text-sm text-navy-600">
            <span className="font-semibold">1 {fromCurrency}</span>
            <span className="text-text-muted">≈</span>
            <span className="font-bold text-navy-700">
              {toCurrency === 'IDR' ? formatIDR(rateInfo.direct) : formatForeign(rateInfo.direct, toCurrency)}
            </span>
          </div>
          {rateInfo.inverse !== null && (
            <div className="flex items-center gap-2 text-sm text-navy-600">
              <span className="font-semibold">1 {toCurrency}</span>
              <span className="text-text-muted">≈</span>
              <span className="font-bold text-navy-700">
                {fromCurrency === 'IDR' ? formatIDR(rateInfo.inverse) : formatForeign(rateInfo.inverse, fromCurrency)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
