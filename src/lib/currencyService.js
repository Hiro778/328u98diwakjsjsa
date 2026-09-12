/**
 * Currency exchange rate service.
 *
 * RATE DIRECTION (CRITICAL):
 *   All rates are stored as "1 [CURRENCY] = X IDR".
 *   Example: { USD: 16500, EUR: 17920, JPY: 110.5 }
 *   This means: 1 USD = Rp16.500, 1 EUR = Rp17.920, 1 JPY = Rp110,5
 *
 * SOURCES (tried in order, first success wins):
 *   1. open.er-api.com  – free, no key, ECB-based, includes IDR
 *   2. frankfurter.app   – free, no key, ECB-based (USD base)
 */

import CURRENCY_METADATA from './currencyMetadata.json'

const SOURCES = [
  {
    name: 'ExchangeRate-API',
    url: 'https://open.er-api.com/v6/latest/IDR',
    transform: (json) => {
      if (!json?.rates) return null
      // API gives: 1 IDR = X [CURRENCY], e.g. USD: 0.0000606
      // We invert to: 1 [CURRENCY] = X IDR, e.g. USD: 16500
      const rates = {}
      for (const [code, idrRate] of Object.entries(json.rates)) {
        if (idrRate > 0) {
          rates[code] = 1 / idrRate
        }
      }
      return {
        rates,
        source: 'ExchangeRate-API',
        timestamp: json.time_last_update_utc || new Date().toISOString(),
      }
    },
  },
  {
    name: 'Frankfurter (ECB)',
    url: 'https://api.frankfurter.app/latest?from=USD&to=IDR,EUR,GBP,JPY,SGD,MYR,AUD,CNY,KRW',
    transform: (json) => {
      if (!json?.rates) return null
      const idrPerUsd = json.rates.IDR
      if (!idrPerUsd || idrPerUsd <= 0) return null

      const rates = { USD: idrPerUsd } // 1 USD = X IDR
      for (const [code, usdRate] of Object.entries(json.rates)) {
        if (code === 'USD') continue
        // usdRate = how many [code] per 1 USD
        // idrPerUsd = how many IDR per 1 USD
        // so 1 [code] = idrPerUsd / usdRate IDR
        rates[code] = idrPerUsd / usdRate
      }
      return {
        rates,
        source: 'Frankfurter (ECB)',
        timestamp: json.date
          ? new Date(json.date + 'T12:00:00Z').toISOString()
          : new Date().toISOString(),
      }
    },
  },
]

// ---------------------------------------------------------------------------
// Popular currencies (for "Mata Uang Populer" section cards)
// ---------------------------------------------------------------------------

export const POPULAR_CURRENCIES = [
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩', locale: 'id-ID', symbol: 'Rp', country: 'Indonesia' },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸', locale: 'en-US', symbol: '$', country: 'United States' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', locale: 'de-DE', symbol: '€', country: 'Eurozone' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧', locale: 'en-GB', symbol: '£', country: 'United Kingdom' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵', locale: 'ja-JP', symbol: '¥', country: 'Japan' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬', locale: 'en-SG', symbol: 'S$', country: 'Singapore' },
  { code: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾', locale: 'ms-MY', symbol: 'RM', country: 'Malaysia' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺', locale: 'en-AU', symbol: 'A$', country: 'Australia' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳', locale: 'zh-CN', symbol: '¥', country: 'China' },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷', locale: 'ko-KR', symbol: '₩', country: 'South Korea' },
]

// Backward-compatible alias (used by CurrencyCard and other consumers)
export const CURRENCIES = POPULAR_CURRENCIES

// ---------------------------------------------------------------------------
// All supported currencies (built dynamically from API rates + metadata)
// ---------------------------------------------------------------------------

/**
 * Build the full list of supported currencies from API rates + metadata.
 * rates keys are currency codes (e.g. { USD: 16500, EUR: 17920, ... }).
 * Always includes popular currencies even if rates haven't loaded yet.
 */
export function buildSupportedCurrencies(rates) {
  const rateCodes = rates ? Object.keys(rates) : []
  const allCodes = new Set([...POPULAR_CURRENCIES.map((c) => c.code), ...rateCodes])

  return [...allCodes].map((code) => {
    const meta = CURRENCY_METADATA[code]
    return {
      code,
      name: meta?.name || code,
      flag: meta?.flag || '💱',
      locale: meta?.locale || 'en-US',
      symbol: meta?.symbol || code,
      country: meta?.country || '',
    }
  })
}

/** Lookup currency metadata for a code. Searches popular list first, then metadata DB. */
export function getCurrencyMeta(code) {
  const popular = POPULAR_CURRENCIES.find((c) => c.code === code)
  if (popular) return popular

  const meta = CURRENCY_METADATA[code]
  if (meta) {
    return {
      code,
      name: meta.name,
      flag: meta.flag,
      locale: meta.locale,
      symbol: meta.symbol,
      country: meta.country,
    }
  }

  return {
    code,
    name: code,
    flag: '💱',
    locale: 'en-US',
    symbol: code,
    country: '',
  }
}

/** Check if a currency is a minor/low-value unit that needs more decimals. */
function isMinorCurrency(code) {
  // Currencies where fractional units are rarely used
  return ['JPY', 'KRW', 'VND', 'IDR', 'CLF'].includes(code)
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedData = null
let lastFetchTime = 0
let inflight = null

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch exchange rates. Returns { rates, source, timestamp, age, error, isStale }
 * or null on total failure. Deduplicates concurrent calls.
 *
 * rates = { USD: 16500, EUR: 17920, ... }  (1 [CURRENCY] = X IDR)
 */
export async function fetchExchangeRates() {
  if (cachedData && Date.now() - lastFetchTime < CACHE_DURATION_MS) {
    return cachedData
  }
  if (inflight) return inflight

  inflight = _doFetch()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

async function _doFetch() {
  for (const source of SOURCES) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(source.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timeoutId)
      if (!res.ok) continue

      const json = await res.json()
      const data = source.transform(json)

      if (data?.rates && Object.keys(data.rates).length > 0) {
        cachedData = {
          rates: data.rates,
          source: data.source,
          timestamp: data.timestamp,
          age: Date.now(),
          isStale: false,
          error: null,
          previousRates: cachedData?.rates || null,
        }
        lastFetchTime = Date.now()
        return cachedData
      }
    } catch {
      continue
    }
  }

  // All sources failed
  const result = {
    rates: null,
    source: null,
    timestamp: null,
    age: cachedData?.age || null,
    isStale: true,
    error: 'Gagal mengambil nilai tukar terbaru.',
    previousRates: cachedData?.rates || null,
  }
  if (cachedData?.rates) {
    result.rates = cachedData.rates
    result.source = cachedData.source
    result.timestamp = cachedData.timestamp
  }
  cachedData = result
  return result
}

export function clearRateCache() {
  cachedData = null
  lastFetchTime = 0
}

// ---------------------------------------------------------------------------
// Conversion (all using "1 [CURRENCY] = X IDR" rates)
// ---------------------------------------------------------------------------

/**
 * Convert amount from one currency to another.
 *
 * rates: { USD: 16500, EUR: 17920, ... } (1 [C] = X IDR)
 *
 * If both are in rates (both foreign): go through IDR.
 *   amount * fromRate = IDR, then IDR / toRate = target.
 */
export function convert(amount, fromCode, toCode, rates) {
  if (!rates || !Number.isFinite(amount)) return null
  if (fromCode === toCode) return amount

  const fromRate = rates[fromCode] // IDR per 1 fromCurrency (or null for IDR)
  const toRate = rates[toCode] // IDR per 1 toCurrency (or null for IDR)

  // IDR → Foreign
  if (fromCode === 'IDR' && toRate) {
    return amount / toRate
  }
  // Foreign → IDR
  if (toCode === 'IDR' && fromRate) {
    return amount * fromRate
  }
  // Foreign → Foreign (via IDR)
  if (fromRate && toRate) {
    const idr = amount * fromRate
    return idr / toRate
  }
  return null
}

/**
 * Get the rate display string for a currency pair.
 * Returns { direct, inverse } objects.
 *
 * direct: "1 USD ≈ Rp16.500"
 * inverse: "1 IDR ≈ US$0,0000606"
 */
export function getRateDisplay(fromCode, toCode, rates) {
  if (!rates) return { direct: null, inverse: null }

  const rate = convert(1, fromCode, toCode, rates)
  const invRate = convert(1, toCode, fromCode, rates)

  return {
    direct: rate !== null
      ? { from: fromCode, to: toCode, value: rate }
      : null,
    inverse: invRate !== null
      ? { from: toCode, to: fromCode, value: invRate }
      : null,
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format amount in IDR: Rp16.500 */
export function formatIDR(value) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Format amount in any foreign currency. */
export function formatForeign(value, currencyCode) {
  if (value == null || !Number.isFinite(value)) return '—'
  const meta = getCurrencyMeta(currencyCode)
  const decimals = isMinorCurrency(currencyCode) ? 0 : 2
  const opts = {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }
  // Try primary locale, fallback to language-only, then en-US
  try {
    return new Intl.NumberFormat(meta.locale, opts).format(value)
  } catch {
    try {
      const lang = meta.locale.split('-')[0]
      return new Intl.NumberFormat(lang, opts).format(value)
    } catch {
      return new Intl.NumberFormat('en-US', opts).format(value)
    }
  }
}

/** Format a raw rate number for display (e.g. 16500 → "16.500"). */
export function formatRateNumber(value, currencyCode) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (isMinorCurrency(currencyCode)) {
    return value.toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/**
 * Calculate percentage change between two rates.
 * Returns { value, direction } where direction is 'up', 'down', or 'flat'.
 */
export function calcChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return { value: 0, direction: 'flat' }
  }
  const pct = ((current - previous) / previous) * 100
  const direction = pct > 0.001 ? 'up' : pct < -0.001 ? 'down' : 'flat'
  return { value: Math.abs(pct), direction }
}

// ---------------------------------------------------------------------------
// Favorites (localStorage)
// ---------------------------------------------------------------------------

const FAV_KEY = 'bisnissehat_favorite_pairs'

/**
 * Get favorite pairs from localStorage.
 * Returns array of { from, to } objects.
 */
export function getFavoritePairs() {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p) => p && typeof p.from === 'string' && typeof p.to === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Save favorite pairs to localStorage.
 */
export function saveFavoritePairs(pairs) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(pairs))
  } catch {
    // localStorage full or blocked — fail silently
  }
}

/**
 * Check if a pair is in favorites.
 */
export function isFavoritePair(from, to, favorites) {
  return favorites.some((p) => p.from === from && p.to === to)
}

/**
 * Toggle a pair in favorites. Returns updated list.
 */
export function toggleFavoritePair(from, to, favorites) {
  const exists = favorites.findIndex((p) => p.from === from && p.to === to)
  if (exists >= 0) {
    return favorites.filter((_, i) => i !== exists)
  }
  return [...favorites, { from, to }]
}

/** Default popular pairs to show when user has no favorites. */
export const DEFAULT_PAIRS = [
  { from: 'USD', to: 'IDR' },
  { from: 'EUR', to: 'IDR' },
  { from: 'GBP', to: 'IDR' },
  { from: 'SGD', to: 'IDR' },
  { from: 'JPY', to: 'IDR' },
  { from: 'MYR', to: 'IDR' },
  { from: 'AUD', to: 'IDR' },
  { from: 'CNY', to: 'IDR' },
  { from: 'KRW', to: 'IDR' },
]
