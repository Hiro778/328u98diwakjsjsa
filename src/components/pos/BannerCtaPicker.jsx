import { useState, useEffect, useRef, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  searchBannerTargets,
  resolveBannerCtaUrl,
  resolveTargetFromRawUrl,
  getTargetDisplayInfo,
  sanitizeCustomUrl,
  isDangerousUrl,
} from '../../services/bannerCtaService'

export default function BannerCtaPicker({
  businessId,
  ctaUrl = '',
  ctaTarget = null,
  ctaText = '',
  products = [],
  categories = [],
  onChange = () => {},
  onPreviewClick = null,
}) {
  const pickerId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState({
    products: [],
    categories: [],
    pages: [],
  })

  // Custom link state
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customInputValue, setCustomInputValue] = useState('')
  const [customUrlError, setCustomUrlError] = useState('')

  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const customInputRef = useRef(null)

  // Resolve current active target
  const activeTarget = ctaTarget || resolveTargetFromRawUrl(ctaUrl, { products, categories, businessId })
  const displayInfo = getTargetDisplayInfo(activeTarget)

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
        setIsCustomMode(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  // Debounced search
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsSearching(true)

    const timer = setTimeout(async () => {
      try {
        const results = await searchBannerTargets({
          businessId,
          query: searchQuery,
          cachedProducts: products,
          cachedCategories: categories,
          limit: 6,
        })
        if (isMounted) {
          setSearchResults(results)
        }
      } catch (err) {
        console.error('[BannerCtaPicker] Search error:', err)
      } finally {
        if (isMounted) setIsSearching(false)
      }
    }, 180)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isOpen, searchQuery, businessId, products, categories])

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && !isCustomMode) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen, isCustomMode])

  function handleSelectTarget(target) {
    const resolvedUrl = resolveBannerCtaUrl(target, businessId)
    onChange({
      ctaUrl: resolvedUrl,
      ctaTarget: target,
    })
    setIsOpen(false)
    setIsCustomMode(false)
    setSearchQuery('')
    setCustomUrlError('')
  }

  function handleClearTarget(e) {
    e.stopPropagation()
    onChange({
      ctaUrl: '',
      ctaTarget: null,
    })
    setCustomInputValue('')
    setCustomUrlError('')
  }

  function handleOpenCustomMode() {
    setIsCustomMode(true)
    setCustomInputValue(activeTarget?.type === 'custom' ? activeTarget.value : ctaUrl || '')
    setCustomUrlError('')
    setTimeout(() => {
      customInputRef.current?.focus()
    }, 50)
  }

  function handleSaveCustomUrl(e) {
    e?.preventDefault()
    const trimmed = customInputValue.trim()
    if (!trimmed) {
      handleClearTarget(e)
      setIsCustomMode(false)
      setIsOpen(false)
      return
    }

    if (isDangerousUrl(trimmed)) {
      setCustomUrlError('Protokol link berbahaya (javascript:, data:, vbscript:) tidak diizinkan.')
      return
    }

    const sanitized = sanitizeCustomUrl(trimmed)
    const customTarget = {
      type: 'custom',
      value: sanitized,
      name: sanitized,
    }

    onChange({
      ctaUrl: sanitized,
      ctaTarget: customTarget,
    })
    setIsCustomMode(false)
    setIsOpen(false)
    setCustomUrlError('')
  }

  // Format CTA preview button text
  const previewButtonText = (ctaText || 'Pesan Sekarang').trim()
  const previewTargetLabel = displayInfo.name || 'Lihat'

  const hasAnyResults =
    searchResults.products.length > 0 ||
    searchResults.categories.length > 0 ||
    searchResults.pages.length > 0

  return (
    <div ref={containerRef} className="relative w-full space-y-1.5" data-testid="banner-cta-picker">
      <div className="flex items-center justify-between">
        <label
          htmlFor={`cta-trigger-${pickerId}`}
          className="text-xs font-bold text-navy-700 block"
        >
          Link / Target CTA
        </label>
        {activeTarget && (
          <button
            type="button"
            onClick={handleClearTarget}
            className="text-[11px] text-text-muted hover:text-rose-600 transition-colors cursor-pointer"
          >
            Hapus
          </button>
        )}
      </div>

      {/* Main Trigger Input / Box */}
      <div
        id={`cta-trigger-${pickerId}`}
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
        className={`w-full flex items-center justify-between rounded-xl border bg-surface px-3 py-2 text-xs transition-all cursor-pointer ${
          isOpen
            ? 'border-warm-400 ring-2 ring-warm-400/20 shadow-xs'
            : 'border-border hover:border-warm-300'
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-2">
          {activeTarget ? (
            <>
              <span className="text-base shrink-0 leading-none select-none">
                {displayInfo.icon}
              </span>
              <span className="font-semibold text-navy-800 truncate">
                {displayInfo.name}
              </span>
            </>
          ) : (
            <>
              <span className="text-text-muted/70 text-sm select-none">🔎</span>
              <span className="text-text-muted/70 truncate">
                Cari produk, kategori, atau halaman...
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-warm-500 bg-warm-50 px-2 py-0.5 rounded-md border border-warm-200/60">
            {activeTarget ? 'Ganti' : 'Pilih'}
          </span>
          <svg
            className={`h-3.5 w-3.5 text-text-muted transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>

      {/* Small Secondary Label */}
      {activeTarget && displayInfo.secondaryLabel && (
        <div className="flex items-center gap-1.5 px-0.5">
          <span className="text-[11px] font-medium text-text-secondary truncate">
            {displayInfo.secondaryLabel}
          </span>
        </div>
      )}

      {/* Dropdown / Popover Picker */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-50 mt-1 rounded-2xl border border-border bg-surface p-2.5 shadow-xl sm:p-3 max-w-full"
            style={{ width: '100%' }}
          >
            {!isCustomMode ? (
              <div className="space-y-2.5">
                {/* Search Bar */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-text-muted text-xs">
                    🔎
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari produk, kategori, atau halaman..."
                    className="w-full rounded-xl border border-border bg-cream/30 pl-7 pr-7 py-2 text-xs text-navy-800 placeholder:text-text-muted focus:border-warm-400 focus:bg-surface focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-navy-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Results List */}
                <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-3 pr-0.5 scrollbar-thin">
                  {isSearching ? (
                    <div className="py-6 text-center">
                      <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-warm-400 border-t-transparent mb-1.5" />
                      <p className="text-[11px] text-text-muted">Mencari target...</p>
                    </div>
                  ) : !hasAnyResults ? (
                    <div className="py-5 text-center px-3">
                      <p className="text-xs font-semibold text-navy-700">Tidak ada hasil ditemukan</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {searchQuery ? `Untuk "${searchQuery}"` : 'Belum ada data tersedia'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Produk Section */}
                      {searchResults.products.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                            <span>Produk</span>
                            <span className="text-[10px] font-normal text-text-muted">
                              ({searchResults.products.length})
                            </span>
                          </div>
                          <div className="space-y-1 mt-0.5">
                            {searchResults.products.map((p) => {
                              const isSelected = activeTarget?.type === 'product' && activeTarget.id === p.id
                              return (
                                <button
                                  key={`prod-${p.id}`}
                                  type="button"
                                  onClick={() => handleSelectTarget(p)}
                                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-warm-50 text-navy-900 font-semibold border border-warm-300/70'
                                      : 'hover:bg-cream text-navy-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-base shrink-0 select-none">📦</span>
                                    <div className="min-w-0">
                                      <p className="text-xs truncate">{p.name}</p>
                                      {p.category && (
                                        <p className="text-[10px] text-text-muted truncate">
                                          {p.category}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {p.price !== undefined && p.price !== null && (
                                    <span className="text-[11px] text-text-muted shrink-0 font-medium">
                                      Rp {Number(p.price).toLocaleString('id-ID')}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Kategori Section */}
                      {searchResults.categories.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                            <span>Kategori</span>
                            <span className="text-[10px] font-normal text-text-muted">
                              ({searchResults.categories.length})
                            </span>
                          </div>
                          <div className="space-y-1 mt-0.5">
                            {searchResults.categories.map((c, idx) => {
                              const isSelected =
                                activeTarget?.type === 'category' &&
                                (activeTarget.id === c.id || activeTarget.name === c.name)
                              return (
                                <button
                                  key={`cat-${c.id || idx}`}
                                  type="button"
                                  onClick={() => handleSelectTarget(c)}
                                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-warm-50 text-navy-900 font-semibold border border-warm-300/70'
                                      : 'hover:bg-cream text-navy-700'
                                  }`}
                                >
                                  <span className="text-base shrink-0 select-none">📂</span>
                                  <span className="text-xs truncate">{c.name}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Halaman Section */}
                      {searchResults.pages.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                            Halaman
                          </div>
                          <div className="space-y-1 mt-0.5">
                            {searchResults.pages.map((pg) => {
                              const isSelected =
                                activeTarget?.type === 'page' && activeTarget.value === pg.value
                              return (
                                <button
                                  key={`page-${pg.value}`}
                                  type="button"
                                  onClick={() => handleSelectTarget(pg)}
                                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-warm-50 text-navy-900 font-semibold border border-warm-300/70'
                                      : 'hover:bg-cream text-navy-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-base shrink-0 select-none">{pg.icon}</span>
                                    <div className="min-w-0">
                                      <p className="text-xs truncate">{pg.name}</p>
                                      <p className="text-[10px] text-text-muted truncate">
                                        {pg.description}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Custom URL Escape Hatch */}
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleOpenCustomMode}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-warm-500 hover:text-warm-600 px-2 py-1 rounded-lg hover:bg-warm-50 transition-colors cursor-pointer"
                  >
                    <span>+ Gunakan link custom</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-xs text-text-muted hover:text-navy-700 px-2 py-1 rounded-lg hover:bg-cream transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              /* Custom Link Input Form */
              <div className="space-y-3 p-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-navy-800">
                    Gunakan Link / Anchor Custom
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false)
                      setCustomUrlError('')
                    }}
                    className="text-xs text-text-muted hover:text-navy-700 cursor-pointer"
                  >
                    ← Kembali
                  </button>
                </div>

                <div className="space-y-1">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customInputValue}
                    onChange={(e) => {
                      setCustomInputValue(e.target.value)
                      if (customUrlError) setCustomUrlError('')
                    }}
                    placeholder="Contoh: https://... atau #kategori-kopi"
                    className={`w-full rounded-xl border bg-surface px-3 py-2 text-xs text-navy-800 placeholder:text-text-muted focus:outline-none transition-colors ${
                      customUrlError
                        ? 'border-rose-400 focus:border-rose-500 ring-1 ring-rose-400'
                        : 'border-border focus:border-warm-400'
                    }`}
                  />
                  {customUrlError && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      {customUrlError}
                    </p>
                  )}
                  <p className="text-[10px] text-text-muted">
                    Bisa berupa anchor hash (seperti #kategori-kopi) atau tautan URL eksternal (https://...).
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false)
                      setCustomUrlError('')
                    }}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-navy-700 hover:bg-cream transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCustomUrl}
                    className="px-3 py-1.5 rounded-xl bg-warm-400 hover:bg-warm-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    Terapkan Link Custom
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA Preview Section */}
      {activeTarget && (
        <div className="mt-2.5 rounded-xl border border-warm-200/70 bg-warm-50/50 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-navy-700 uppercase tracking-wide">
              CTA Preview
            </span>
            <span className="text-[10px] text-text-muted">
              Tampilan tombol bagi pengunjung
            </span>
          </div>

          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => {
                if (onPreviewClick) {
                  onPreviewClick({
                    target: activeTarget,
                    label: displayInfo.name,
                    buttonText: previewButtonText,
                    url: resolveBannerCtaUrl(activeTarget, businessId),
                  })
                }
              }}
              title="Klik untuk melihat interaksi preview"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-warm-400 hover:bg-warm-500 active:scale-98 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <span>{previewButtonText}</span>
              <span className="opacity-80">→</span>
              <span className="font-medium underline decoration-white/40 underline-offset-2">
                {previewTargetLabel}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
