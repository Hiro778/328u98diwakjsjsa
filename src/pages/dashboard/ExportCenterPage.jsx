import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import useExchangeRates from '../../hooks/useExchangeRates'
import AnimatedNumber from '../../components/AnimatedNumber'
import CurrencyConverter from '../../sections/CurrencyIntelligence/CurrencyConverter'
import CurrencyCard from '../../sections/CurrencyIntelligence/CurrencyCard'
import {
  formatIDR,
  calcChange,
  getFavoritePairs,
  saveFavoritePairs,
  toggleFavoritePair,
  isFavoritePair,
  DEFAULT_PAIRS,
} from '../../lib/currencyService'

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function ExportCenterPage() {
  const { rates, source, timestamp, loading, error, isStale, refresh } = useExchangeRates({
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

  // Favorite pairs with rate data
  const favoritePairs = useMemo(() => {
    if (!rates) return []
    return favorites
      .filter((p) => rates[p.from] != null)
      .map((p) => ({
        ...p,
        rate: p.from === 'IDR'
          ? convertForeignToIDR(1, p.to, rates)
          : rates[p.from],
        label: `${p.from} → ${p.to}`,
      }))
      .filter((p) => p.rate != null)
  }, [favorites, rates])

  return (
    <div>
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-electric-500">
          Kurs & Valuta Asing
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">Live Currency Intelligence</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pantau nilai tukar mata uang utama terhadap Rupiah secara real-time.
        </p>
      </motion.div>

      {/* Status bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              loading ? 'animate-pulse bg-warm-400' : error ? 'bg-red-400' : 'bg-profit-500'
            }`}
          />
          <span className="text-xs text-text-secondary">
            {loading
              ? 'Memuat data kurs…'
              : error
                ? 'Data mungkin belum terbaru'
                : 'Kurs diperbarui otomatis'}
          </span>
          {timestamp && !loading && (
            <span className="text-xs text-text-muted">
              Diperbarui {formatTimestamp(timestamp)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isStale && (
            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold text-warm-500">
              STALE
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-navy-50 hover:text-navy-700 disabled:opacity-50"
          >
            {loading ? 'Memuat…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Hero pair: USD/IDR prominently */}
      {rates && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 rounded-2xl border border-navy-200 bg-navy-600 p-6 text-white"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🇺🇸</span>
            <svg className="h-4 w-4 text-cream/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="text-3xl">🇮🇩</span>
            <span className="ml-2 text-sm font-semibold text-cream/60">USD → IDR</span>
            <button
              onClick={() => handleToggleFavorite('USD', 'IDR')}
              className={`ml-auto text-xl transition-all duration-200 hover:scale-110 ${
                isFavoritePair('USD', 'IDR', favorites) ? 'text-warm-400' : 'text-cream/40 hover:text-warm-300'
              }`}
            >
              {isFavoritePair('USD', 'IDR', favorites) ? '★' : '☆'}
            </button>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-sm text-cream/60">1 USD ≈</span>
            <AnimatedNumber
              value={rates.USD}
              format={(v) => (Number.isFinite(v) ? formatIDR(v) : '—')}
              size="xl"
              showIndicator
              className="text-white"
            />
          </div>
          {rates.previousRates?.USD && (
            <HeroChange current={rates.USD} previous={rates.previousRates.USD} />
          )}
        </motion.div>
      )}

      {/* Loading skeleton for hero */}
      {loading && !rates && (
        <div className="mt-6 animate-pulse rounded-2xl border border-navy-200 bg-navy-600 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-white/10" />
            <div className="h-4 w-20 bg-white/10 rounded" />
          </div>
          <div className="h-10 w-48 bg-white/10 rounded" />
        </div>
      )}

      {/* Main grid: currency cards + converter */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Left: Currency cards */}
        <div className="lg:col-span-2">
          {/* Favorites section */}
          {favoritePairs.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-text-secondary">
                Mata Uang Favorit
              </h2>
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {favoritePairs.map((p, i) => (
                  <motion.div key={p.label} variants={fadeUp}>
                    <CurrencyCard
                      from={p.from}
                      to={p.to}
                      rate={p.rate}
                      prevRate={rates.previousRates?.[p.from]}
                      delay={i * 0.05}
                      onStar={handleToggleFavorite}
                      isStarred
                      showStar
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {/* Popular currencies grid */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary">
              Mata Uang Populer
            </h2>
            {loading && !rates ? (
              <LoadingGrid />
            ) : error && !rates ? (
              <ErrorState error={error} onRetry={refresh} />
            ) : rates ? (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                {DEFAULT_PAIRS.map((p, i) => (
                  <motion.div key={`${p.from}-${p.to}`} variants={fadeUp}>
                    <CurrencyCard
                      from={p.from}
                      to={p.to}
                      rate={rates[p.from]}
                      prevRate={rates.previousRates?.[p.from]}
                      delay={i * 0.04}
                      onStar={handleToggleFavorite}
                      isStarred={isFavoritePair(p.from, p.to, favorites)}
                      showStar
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-6 text-center">
                <p className="text-sm text-text-secondary">Data kurs belum tersedia</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Converter */}
        <div>
          <CurrencyConverter rates={rates} />
        </div>
      </div>
    </div>
  )
}

function HeroChange({ current, previous }) {
  const change = calcChange(current, previous)
  if (change.direction === 'flat') return null
  const isUp = change.direction === 'up'
  return (
    <div className="mt-2 flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          isUp ? 'bg-profit-500/20 text-profit-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        <span className="text-[10px]">{isUp ? '▲' : '▼'}</span>
        {change.value.toFixed(2)}%
      </span>
      <span className="text-xs text-cream/40">hari ini</span>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-5 rounded-full bg-navy-100" />
            <div className="h-3 w-3 bg-navy-100 rounded" />
            <div className="h-5 w-5 rounded-full bg-navy-100" />
            <div className="h-3 w-12 bg-navy-100 rounded ml-2" />
          </div>
          <div className="h-6 w-32 rounded bg-navy-100 mb-2" />
          <div className="h-4 w-16 rounded bg-navy-50" />
        </div>
      ))}
    </div>
  )
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <p className="text-sm font-medium text-red-700">Gagal mengambil nilai tukar terbaru.</p>
      <p className="mt-1 text-xs text-red-500">{error}</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700"
      >
        Coba Lagi
      </button>
    </div>
  )
}

// Helper: convert foreign → IDR using "1 [C] = X IDR" rates
function convertForeignToIDR(amount, code, rates) {
  if (!rates || !Number.isFinite(amount)) return null
  const rate = rates[code]
  if (!rate || !Number.isFinite(rate)) return null
  return amount * rate
}

function formatTimestamp(ts) {
  if (!ts) return '—'
  try {
    const date = new Date(ts)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '—'
  }
}
