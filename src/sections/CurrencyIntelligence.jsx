import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import useExchangeRates from '../hooks/useExchangeRates'
import CurrencyCard from './CurrencyIntelligence/CurrencyCard'
import CurrencyConverter from './CurrencyIntelligence/CurrencyConverter'
import {
  getFavoritePairs,
  saveFavoritePairs,
  toggleFavoritePair,
  isFavoritePair,
  DEFAULT_PAIRS,
} from '../lib/currencyService'

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

/**
 * Landing page section: Live Currency Intelligence.
 * Preserves id="export" so existing navbar anchor (#export) still works.
 */
export default function CurrencyIntelligence() {
  const { rates, source, loading, error, isStale, refresh } = useExchangeRates({
    autoRefresh: true,
    intervalMs: 5 * 60 * 1000,
  })

  const [favorites, setFavorites] = useState(() => getFavoritePairs())

  const handleToggleFavorite = useCallback((from, to) => {
    setFavorites((prev) => {
      const updated = toggleFavoritePair(from, to, prev)
      saveFavoritePairs(updated)
      return updated
    })
  }, [])

  // Favorite pairs with rates
  const favoritePairs = useMemo(() => {
    if (!rates) return []
    return favorites
      .filter((p) => rates[p.from] != null)
      .map((p) => ({
        ...p,
        rate: rates[p.from],
      }))
      .filter((p) => p.rate != null)
  }, [favorites, rates])

  // Pairs to show: favorites if any, otherwise popular
  const displayPairs = useMemo(() => {
    if (favoritePairs.length > 0) {
      return favoritePairs.map((p) => ({ from: p.from, to: p.to }))
    }
    return DEFAULT_PAIRS
  }, [favoritePairs])

  // Popular pairs not yet favorited
  const popularPairs = useMemo(() => {
    return DEFAULT_PAIRS.filter(
      (p) => !isFavoritePair(p.from, p.to, favorites)
    )
  }, [favorites])

  return (
    <section id="export" className="px-5 py-20 sm:px-8 sm:py-28 bg-navy-600 text-cream">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 text-center"
        >
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-warm-400">
            Kurs & Valuta Asing
          </p>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Live Currency Intelligence
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-cream/60">
            Pantau nilai tukar mata uang pilihan Anda terhadap Rupiah dan mata uang lainnya.
          </p>
        </motion.div>

        {/* Status bar */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                loading ? 'animate-pulse bg-warm-400' : error ? 'bg-red-400' : 'bg-profit-400'
              }`}
            />
            <span className="text-xs text-cream/60">
              {loading
                ? 'Memuat data kurs…'
                : error
                  ? 'Data mungkin belum terbaru'
                  : 'Kurs diperbarui otomatis'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isStale && (
              <span className="rounded-full bg-warm-400/20 px-2 py-0.5 text-[10px] font-semibold text-warm-400">
                STALE
              </span>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-cream/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-50"
            >
              {loading ? 'Memuat…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Favorites / Popular pairs section */}
        <div className="mb-10">
          <h3 className="mb-4 text-sm font-semibold text-cream/80">
            {favoritePairs.length > 0 ? 'Mata Uang Favorit' : 'Mata Uang Populer'}
          </h3>

          {loading && !rates ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-5 w-5 rounded-full bg-white/10" />
                    <div className="h-3 w-3 bg-white/10 rounded" />
                    <div className="h-5 w-5 rounded-full bg-white/10" />
                  </div>
                  <div className="h-6 w-32 rounded bg-white/10" />
                  <div className="mt-2 h-4 w-16 rounded bg-white/10" />
                </div>
              ))}
            </div>
          ) : error && !rates ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
              <p className="text-sm text-cream/60">Data kurs belum tersedia</p>
              <p className="mt-1 text-xs text-cream/40">{error}</p>
            </div>
          ) : rates ? (
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {displayPairs.map((p) => (
                <motion.div key={`${p.from}-${p.to}`} variants={fadeUp}>
                  <CurrencyCard
                    from={p.from}
                    to={p.to}
                    rate={rates[p.from]}
                    prevRate={rates.previousRates?.[p.from]}
                    onStar={handleToggleFavorite}
                    isStarred={isFavoritePair(p.from, p.to, favorites)}
                    showStar
                    layout="compact"
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : null}
        </div>

        {/* Popular pairs to star (only if user has favorites and there are un-starred popular pairs) */}
        {favoritePairs.length > 0 && popularPairs.length > 0 && rates && (
          <div className="mb-10">
            <h3 className="mb-4 text-sm font-semibold text-cream/60">
              Tambah ke Favorit
            </h3>
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-wrap gap-2"
            >
              {popularPairs.map((p) => (
                <motion.button
                  key={`${p.from}-${p.to}`}
                  variants={fadeUp}
                  onClick={() => handleToggleFavorite(p.from, p.to)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-cream/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <span className="text-warm-400">☆</span>
                  <span className="font-medium">{p.from}</span>
                  <svg className="h-3 w-3 text-cream/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="font-medium">{p.to}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}

        {/* Converter */}
        <div className="mx-auto max-w-lg">
          <CurrencyConverter rates={rates} />
        </div>
      </div>
    </section>
  )
}
