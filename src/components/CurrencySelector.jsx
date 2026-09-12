import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { buildSupportedCurrencies, getCurrencyMeta } from '../lib/currencyService'

/**
 * Custom searchable currency selector dropdown.
 *
 * Props:
 *   value      – selected currency code
 *   onChange   – (code) => void
 *   exclude    – codes to hide (e.g. the other selector's value)
 *   compact    – smaller variant
 *   rates      – current rates object (used to build full currency list)
 */
export default function CurrencySelector({ value, onChange, exclude, compact = false, rates }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const searchRef = useRef(null)
  const meta = getCurrencyMeta(value)

  // Build full currency list from API rates + metadata
  const allCurrencies = useMemo(() => buildSupportedCurrencies(rates), [rates])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  // Keyboard: Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allCurrencies.filter((c) => {
      if (exclude && exclude === c.code) return false
      if (!q) return true
      return (
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q) ||
        (c.country && c.country.toLowerCase().includes(q))
      )
    })
  }, [search, exclude, allCurrencies])

  const handleSelect = (code) => {
    onChange(code)
    setOpen(false)
    setSearch('')
  }

  if (compact) {
    return (
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:border-navy-200 hover:bg-navy-50"
        >
          <span className="text-base">{meta.flag}</span>
          <span>{meta.code}</span>
          <svg className={`h-3.5 w-3.5 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <DropdownList open={open} filtered={filtered} search={search} searchRef={searchRef} setSearch={setSearch} onSelect={handleSelect} currentValue={value} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-navy-200 hover:bg-navy-50"
      >
        <span className="text-2xl">{meta.flag}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy-700">{meta.code}</p>
          <p className="truncate text-xs text-text-muted">{meta.name}</p>
        </div>
        <svg className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <DropdownList open={open} filtered={filtered} search={search} searchRef={searchRef} setSearch={setSearch} onSelect={handleSelect} currentValue={value} />
    </div>
  )
}

function DropdownList({ open, filtered, search, searchRef, setSearch, onSelect, currentValue }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari mata uang (kode, nama, negara)…"
                className="w-full rounded-lg border border-border bg-cream py-2 pl-9 pr-3 text-sm text-navy-700 outline-none placeholder:text-text-muted focus:border-warm-400 focus:ring-1 focus:ring-warm-400/30"
              />
            </div>
          </div>

          {/* Currency list */}
          <div className="overflow-y-auto max-h-56">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-text-muted">
                Tidak ditemukan
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  onClick={() => onSelect(c.code)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    c.code === currentValue
                      ? 'bg-warm-400/10 text-warm-500'
                      : 'text-navy-700 hover:bg-navy-50'
                  }`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{c.code}</span>
                    <span className="ml-2 text-xs text-text-muted">{c.name}</span>
                    {c.country && (
                      <span className="ml-1.5 text-[10px] text-text-muted/60">· {c.country}</span>
                    )}
                  </div>
                  {c.code === currentValue && (
                    <svg className="h-4 w-4 shrink-0 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
