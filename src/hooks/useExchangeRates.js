import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchExchangeRates, clearRateCache } from '../lib/currencyService'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * React hook for live exchange rates.
 *
 * Returns { rates, source, timestamp, loading, error, refresh, isStale }
 */
export default function useExchangeRates({ autoRefresh = true, intervalMs = POLL_INTERVAL_MS } = {}) {
  const [state, setState] = useState({
    rates: null,
    source: null,
    timestamp: null,
    loading: true,
    error: null,
    isStale: false,
  })

  const mountedRef = useRef(true)
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchExchangeRates()
      if (!mountedRef.current) return

      setState({
        rates: data.rates,
        source: data.source,
        timestamp: data.timestamp,
        loading: false,
        error: data.error,
        isStale: data.isStale,
      })
    } catch {
      if (!mountedRef.current) return
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Gagal memuat data kurs.',
      }))
    }
  }, [])

  const refresh = useCallback(() => {
    clearRateCache()
    setState((prev) => ({ ...prev, loading: true, error: null }))
    load()
  }, [load])

  // Initial fetch + auto-refresh polling
  // eslint-disable-next-line react/set-state-in-effect -- async data fetch setState is correct here
  useEffect(() => {
    mountedRef.current = true
    load()

    if (autoRefresh) {
      timerRef.current = setInterval(load, intervalMs)
    }

    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [load, autoRefresh, intervalMs])

  return { ...state, refresh }
}
