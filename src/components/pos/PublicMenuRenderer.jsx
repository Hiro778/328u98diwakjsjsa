import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrency } from '../../lib/orderNumber.js'
import { hasRequiredVariants } from '../../lib/productMetadata.js'
import {
  getNormalizedSocialLinks,
  sanitizeSocialUrl,
  getProductImageUrl,
} from '../../services/qrMenuDesignService.js'

// ─────────────────────────────────────────────────────────────
// Promotional Hero Banner / Carousel Component (ban.md)
// ─────────────────────────────────────────────────────────────
function BannerCarousel({ banners = [], heightPreset = 'compact', overlayOpacity = 0 }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const touchStartXRef = useRef(null)
  const touchDeltaXRef = useRef(0)

  // Height & Aspect Ratio Presets (ban.md Section 2)
  // compact: ~3.2/1 | medium: ~2.6/1 | large: ~2.1/1
  const aspectConfig = useMemo(() => {
    switch (heightPreset) {
      case 'large':
        return {
          aspectRatio: '2.1 / 1',
          aspectClass: 'aspect-[2.1/1]',
          minHeight: '175px',
        }
      case 'medium':
        return {
          aspectRatio: '2.6 / 1',
          aspectClass: 'aspect-[2.6/1]',
          minHeight: '140px',
        }
      case 'compact':
      default:
        return {
          aspectRatio: '3.2 / 1',
          aspectClass: 'aspect-[3.2/1]',
          minHeight: '110px',
        }
    }
  }, [heightPreset])

  const validIndex = banners.length > 0 ? currentIndex % banners.length : 0
  const b = banners[validIndex] || banners[0]

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
  }, [banners.length])

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length)
  }, [banners.length])

  // Auto-slide every 5 seconds if multiple banners, pause on interaction (ban.md Section 4)
  useEffect(() => {
    if (banners.length <= 1 || isPaused) return
    const timer = setInterval(() => {
      handleNext()
    }, 5000)
    return () => clearInterval(timer)
  }, [banners.length, isPaused, handleNext])

  // Mobile Touch / Swipe Handling (ban.md Section 4 & 6)
  const handleTouchStart = (e) => {
    setIsPaused(true)
    touchStartXRef.current = e.touches[0].clientX
    touchDeltaXRef.current = 0
  }

  const handleTouchMove = (e) => {
    if (touchStartXRef.current === null) return
    touchDeltaXRef.current = e.touches[0].clientX - touchStartXRef.current
  }

  const handleTouchEnd = () => {
    setIsPaused(false)
    if (touchDeltaXRef.current < -40) {
      handleNext()
    } else if (touchDeltaXRef.current > 40) {
      handlePrev()
    }
    touchStartXRef.current = null
    touchDeltaXRef.current = 0
  }

  if (!b) return null

  // Image position mapping (ban.md Section 3: center, top, bottom)
  const getObjectPositionClass = (pos) => {
    if (pos === 'top') return 'object-top'
    if (pos === 'bottom') return 'object-bottom'
    return 'object-center'
  }

  const hasOverlayContent = Boolean(b.title || b.description || b.ctaText)
  const overlay = Number(overlayOpacity || 0)

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl shadow-xs select-none group"
      style={{
        aspectRatio: aspectConfig.aspectRatio,
        minHeight: aspectConfig.minHeight,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Banner Slide Frame */}
      <AnimatePresence mode="wait">
        <motion.div
          key={b.id || validIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="absolute inset-0 h-full w-full"
        >
          <img
            src={b.imageUrl || b.image_url}
            alt={b.title || 'Banner'}
            className={`h-full w-full object-cover ${getObjectPositionClass(b.imagePosition)}`}
            style={{ objectPosition: b.imagePosition || 'center' }}
            loading="lazy"
          />

          {/* Banner Content Overlay (ban.md Section 5) */}
          {(hasOverlayContent || overlay > 0) && (
            <div
              className={`absolute inset-0 flex flex-col justify-end p-3.5 sm:p-5 ${
                hasOverlayContent
                  ? 'bg-gradient-to-t from-black/85 via-black/35 to-transparent'
                  : ''
              }`}
              style={overlay > 0 ? { backgroundColor: `rgba(0,0,0,${overlay / 100})` } : {}}
            >
              {b.title && (
                <h4 className="text-white text-xs sm:text-base font-bold drop-shadow-sm leading-snug line-clamp-1">
                  {b.title}
                </h4>
              )}
              {b.description && (
                <p className="text-white/90 text-[11px] sm:text-xs mt-0.5 line-clamp-2 drop-shadow-xs max-w-md">
                  {b.description}
                </p>
              )}
              {b.ctaText && (
                <div className="mt-2">
                  {b.ctaUrl ? (
                    <a
                      href={b.ctaUrl}
                      target={b.ctaUrl.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-bold rounded-lg bg-warm-400 hover:bg-warm-500 text-white shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <span>{b.ctaText}</span>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </a>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-md bg-warm-400 text-white shadow-xs">
                      {b.ctaText}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Multiple Banners Controls (Only rendered if > 1 banner - ban.md Section 4) */}
      {banners.length > 1 && (
        <>
          {/* Previous Arrow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            aria-label="Previous banner"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-xs transition shadow-sm cursor-pointer opacity-80 hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Next Arrow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            aria-label="Next banner"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-xs transition shadow-sm cursor-pointer opacity-80 hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Indicator Dots */}
          <div className="absolute bottom-2.5 inset-x-0 z-20 flex items-center justify-center gap-1.5 pointer-events-none">
            {banners.map((item, idx) => (
              <button
                key={item.id || idx}
                type="button"
                aria-label={`Slide ${idx + 1}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentIndex(idx)
                }}
                className={`pointer-events-auto transition-all duration-300 rounded-full cursor-pointer ${
                  idx === validIndex
                    ? 'w-5 h-1.5 bg-white shadow-xs'
                    : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function PublicMenuRenderer({
  business = {},
  products = [],
  categories = [],
  tables = [],
  theme = {},
  layout = [],
  activeCategory = 'all',
  onSelectCategory = () => {},
  selectedTable = '',
  onSelectTable = () => {},
  cart = [],
  onAddToCart = () => {},
  onSelectProduct = () => {},
  onOpenCart = () => {},
  isInteractive = true,
  isSimulator = false,
}) {
  // Normalize theme tokens with fallbacks
  const primaryColor = theme.primary || '#F5A623'
  const secondaryColor = theme.secondary || '#1E2A5E'
  const bgColor = theme.background || '#FFF9F4'
  const surfaceColor = theme.surface || '#FFFFFF'
  const textColor = theme.text || '#1E2A5E'
  const buttonColor = theme.button || primaryColor
  const buttonStyle = theme.buttonStyle || 'pill'
  const fontHeading = theme.fontHeading || 'Inter'
  const fontBody = theme.fontBody || 'Inter'

  const cartCount = useMemo(() => {
    return (cart || []).reduce((sum, item) => sum + (item.quantity || 1), 0)
  }, [cart])

  const cartTotal = useMemo(() => {
    return (cart || []).reduce((sum, item) => sum + (item.subtotal || ((item.unit_price || 0) * (item.quantity || 1))), 0)
  }, [cart])

  // Filter products by category
  const filteredProducts = useMemo(() => {
    if (!activeCategory || activeCategory === 'all') {
      return products
    }
    return products.filter((p) => (p.category || '').toLowerCase() === activeCategory.toLowerCase())
  }, [products, activeCategory])

  // Button radius helper
  const getButtonRadius = () => {
    if (buttonStyle === 'square') return 'rounded-md'
    if (buttonStyle === 'rounded') return 'rounded-xl'
    return 'rounded-full'
  }

  // Generate CSS style variables
  const containerStyles = {
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: `'${fontBody}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    '--theme-primary': primaryColor,
    '--theme-secondary': secondaryColor,
    '--theme-bg': bgColor,
    '--theme-surface': surfaceColor,
    '--theme-text': textColor,
    '--theme-btn': buttonColor,
    '--qr-primary': primaryColor,
    '--qr-secondary': secondaryColor,
    '--qr-bg': bgColor,
    '--qr-surface': surfaceColor,
    '--qr-text': textColor,
    '--qr-border': `color-mix(in srgb, ${textColor} 12%, transparent)`,
    '--qr-btn': buttonColor,
  }

  // Render individual layout block
  const renderBlock = (block) => {
    if (!block.visible) return null

    switch (block.type) {
      case 'logo': {
        const sizeClass =
          block.props?.size === 'sm'
            ? 'h-14 w-14 text-xl'
            : block.props?.size === 'lg'
            ? 'h-24 w-24 text-3xl'
            : 'h-20 w-20 text-2xl'

        const shapeClass =
          block.props?.shape === 'square'
            ? 'rounded-xl'
            : block.props?.shape === 'rounded'
            ? 'rounded-2xl'
            : 'rounded-full'

        const alignClass =
          block.props?.alignment === 'left'
            ? 'justify-start'
            : block.props?.alignment === 'right'
            ? 'justify-end'
            : 'justify-center'

        const initials = (business?.name || 'K')
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()

        return (
          <div key={block.id} className={`flex px-4 pt-4 pb-2 ${alignClass}`}>
            {business?.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name || 'Logo'}
                className={`${sizeClass} ${shapeClass} object-cover shadow-sm border border-black/5`}
              />
            ) : (
              <div
                style={{ backgroundColor: primaryColor }}
                className={`${sizeClass} ${shapeClass} flex items-center justify-center font-black text-white shadow-md`}
              >
                {initials}
              </div>
            )}
          </div>
        )
      }

      case 'business_info': {
        const align = block.props?.alignment || 'center'
        const textAlign = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'
        const showName = block.props?.showName !== false
        const showSlogan = block.props?.showSlogan !== false
        const showDesc = block.props?.showDescription !== false

        return (
          <div key={block.id} className={`px-4 py-2 ${textAlign}`}>
            {showName && (
              <h1
                style={{ fontFamily: `'${fontHeading}', sans-serif` }}
                className="text-xl font-extrabold tracking-tight leading-tight"
              >
                {business?.name || 'Nama Toko Anda'}
              </h1>
            )}
            {showSlogan && business?.slogan && (
              <p className="mt-1 text-xs font-semibold opacity-85 leading-snug">
                {business.slogan}
              </p>
            )}
            {showDesc && business?.description && (
              <p className="mt-1 text-[11px] opacity-70 line-clamp-2 leading-relaxed max-w-md mx-auto">
                {business.description}
              </p>
            )}
          </div>
        )
      }

      case 'banner': {
        const rawBanners = Array.isArray(block.props?.banners) && block.props.banners.length > 0
          ? block.props.banners
          : (business?.cover_url || block.props?.imageUrl || block.props?.image_url
              ? [{
                  id: 'default-cover',
                  imageUrl: block.props?.imageUrl || block.props?.image_url || business?.cover_url,
                  title: block.props?.title || '',
                  description: block.props?.description || '',
                  ctaText: block.props?.ctaText || '',
                  ctaUrl: block.props?.ctaUrl || '',
                }]
              : [])

        const banners = rawBanners.filter((b) => b && (b.imageUrl || b.image_url))

        if (banners.length === 0) return null

        return (
          <div key={block.id} className="px-4 py-2">
            <BannerCarousel
              banners={banners}
              heightPreset={block.props?.height || 'compact'}
              overlayOpacity={block.props?.overlayOpacity}
            />
          </div>
        )
      }

      case 'categories': {
        if (!categories || categories.length === 0) return null
        const style = block.props?.style || 'pills'

        const allCategories = ['all', ...categories.map((c) => (typeof c === 'string' ? c : c.name))]
        const uniqueCategories = Array.from(new Set(allCategories.filter(Boolean)))

        return (
          <div key={block.id} className="px-4 py-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {uniqueCategories.map((cat) => {
                const isSelected = activeCategory === cat || (cat === 'all' && activeCategory === 'all')
                const label = cat === 'all' ? 'Semua' : cat

                if (style === 'tabs') {
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => isInteractive && onSelectCategory(cat)}
                      style={{
                        backgroundColor: isSelected ? primaryColor : surfaceColor,
                        color: isSelected ? '#FFFFFF' : textColor,
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 shadow-2xs border border-black/5 transition-all"
                    >
                      {label}
                    </button>
                  )
                }

                if (style === 'underline') {
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => isInteractive && onSelectCategory(cat)}
                      style={{
                        borderColor: isSelected ? primaryColor : 'transparent',
                        color: isSelected ? primaryColor : textColor,
                      }}
                      className="px-3 py-1 text-xs font-bold shrink-0 border-b-2 transition-all opacity-90"
                    >
                      {label}
                    </button>
                  )
                }

                // Default: Pills
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => isInteractive && onSelectCategory(cat)}
                    style={{
                      backgroundColor: isSelected ? primaryColor : surfaceColor,
                      color: isSelected ? '#FFFFFF' : textColor,
                    }}
                    className="px-4 py-1.5 text-xs font-bold rounded-full shrink-0 shadow-2xs border border-black/5 transition-all"
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      }

      case 'products': {
        const productLayout = block.props?.layout || 'grid'

        if (filteredProducts.length === 0) {
          return (
            <div key={block.id} className="px-4 py-8 text-center">
              <p className="text-xs opacity-60">Tidak ada produk dalam kategori ini.</p>
            </div>
          )
        }

        return (
          <div key={block.id} className="px-4 py-2">
            {productLayout === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filteredProducts.map((product) => (
                  <ProductGridCard
                    key={product.id}
                    product={product}
                    surfaceColor={surfaceColor}
                    primaryColor={primaryColor}
                    buttonColor={buttonColor}
                    buttonRadius={getButtonRadius()}
                    fontHeading={fontHeading}
                    textColor={textColor}
                    onAddToCart={onAddToCart}
                    onSelectProduct={onSelectProduct}
                    isInteractive={isInteractive}
                  />
                ))}
              </div>
            )}

            {productLayout === 'list' && (
              <div className="space-y-2.5">
                {filteredProducts.map((product) => (
                  <ProductListCard
                    key={product.id}
                    product={product}
                    surfaceColor={surfaceColor}
                    primaryColor={primaryColor}
                    buttonColor={buttonColor}
                    buttonRadius={getButtonRadius()}
                    fontHeading={fontHeading}
                    textColor={textColor}
                    onAddToCart={onAddToCart}
                    onSelectProduct={onSelectProduct}
                    isInteractive={isInteractive}
                  />
                ))}
              </div>
            )}

            {productLayout === 'card' && (
              <div className="space-y-4">
                {filteredProducts.map((product) => (
                  <ProductBigCard
                    key={product.id}
                    product={product}
                    surfaceColor={surfaceColor}
                    primaryColor={primaryColor}
                    buttonColor={buttonColor}
                    buttonRadius={getButtonRadius()}
                    fontHeading={fontHeading}
                    textColor={textColor}
                    onAddToCart={onAddToCart}
                    onSelectProduct={onSelectProduct}
                    isInteractive={isInteractive}
                  />
                ))}
              </div>
            )}
          </div>
        )
      }

      case 'social': {
        // Per qr.md: Social media is consolidated into Footer ("IKUTI KAMI")
        // Standalone social block after products is suppressed on Public Menu
        // to prevent duplicate social links display.
        return null
      }

      case 'footer': {
        const text = block.props?.text || 'Terima kasih sudah mendukung usaha kami ❤️'
        // Read social links from social block in layout if visible
        const socialBlock = layout.find((b) => b.id === 'social' && b.visible !== false)
        const socialLinks = socialBlock ? getNormalizedSocialLinks(socialBlock.props) : []

        return (
          <footer
            key={block.id}
            style={{
              borderColor: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 12%, transparent)',
            }}
            className="mt-6 sm:mt-8 border-t px-4 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-6"
          >
            <div className="max-w-7xl mx-auto">
              {/* Responsive 2-Column Section (qr.md) */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
                {/* KIRI: Nama Usaha & Deskripsi singkat usaha */}
                <div className="max-w-md">
                  <h3
                    style={{
                      fontFamily: `'${fontHeading}', sans-serif`,
                      color: textColor,
                    }}
                    className="text-base sm:text-lg font-bold tracking-tight"
                  >
                    {business?.name || 'Menu Toko'}
                  </h3>
                  {business?.description ? (
                    <p
                      style={{ color: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 70%, transparent)' }}
                      className="mt-1 text-xs sm:text-sm leading-relaxed"
                    >
                      {business.description}
                    </p>
                  ) : business?.slogan ? (
                    <p
                      style={{ color: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 70%, transparent)' }}
                      className="mt-1 text-xs sm:text-sm leading-relaxed"
                    >
                      {business.slogan}
                    </p>
                  ) : null}
                </div>

                {/* KANAN: "Ikuti Kami" + Social Icons (hanya yang diisi user) */}
                {socialLinks.length > 0 && (
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <span
                      style={{ color: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 60%, transparent)' }}
                      className="text-xs font-bold uppercase tracking-wider"
                    >
                      Ikuti Kami
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {socialLinks.map((item) => (
                        <SocialLinkButton
                          key={item.id || item.platform}
                          link={item}
                          isInteractive={isInteractive}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Copyright / Footer closing message */}
              {text && (
                <div
                  style={{
                    borderColor: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 8%, transparent)',
                  }}
                  className="mt-4 sm:mt-5 pt-3 sm:pt-3.5 border-t text-center"
                >
                  <p
                    style={{ color: 'color-mix(in srgb, var(--qr-text, #1E2A5E) 60%, transparent)' }}
                    className="text-xs font-medium leading-relaxed max-w-sm mx-auto"
                  >
                    {text}
                  </p>
                </div>
              )}
            </div>
          </footer>
        )
      }

      default:
        return null
    }
  }

  return (
    <div
      style={containerStyles}
      className={`min-h-screen transition-colors duration-200 ${
        cartCount > 0 ? (isSimulator ? 'pb-24' : 'pb-28') : 'pb-6'
      }`}
    >
      {/* Sticky Top Header Bar */}
      <div
        style={{
          backgroundColor: surfaceColor,
          borderColor: 'rgba(0,0,0,0.06)',
        }}
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 shadow-2xs border-b backdrop-blur-md bg-opacity-90"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {business?.logo_url ? (
            <img
              src={business.logo_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover shrink-0 border border-black/5"
            />
          ) : (
            <div
              style={{ backgroundColor: primaryColor }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
            >
              {(business?.name || 'K')[0]}
            </div>
          )}
          <span
            style={{ fontFamily: `'${fontHeading}', sans-serif` }}
            className="text-sm font-bold truncate leading-tight"
          >
            {business?.name || 'Menu Toko'}
          </span>
        </div>

        {/* Table Badge if selected */}
        {selectedTable && (
          <div
            style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1"
          >
            <span>Meja {selectedTable}</span>
          </div>
        )}
      </div>

      {/* Render Layout Sections */}
      <div className="space-y-1">
        {layout.map((block) => renderBlock(block))}
      </div>

      {/* Sticky Bottom Cart Bar */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className={`${
              isSimulator ? 'absolute bottom-3 inset-x-3' : 'fixed bottom-4 inset-x-4 max-w-md mx-auto'
            } z-40`}
          >
            <div
              style={{
                backgroundColor: surfaceColor,
                borderColor: 'rgba(0,0,0,0.08)',
              }}
              className="flex items-center justify-between p-3 rounded-2xl shadow-xl border backdrop-blur-md"
            >
              <div className="min-w-0 pr-3">
                <p className="text-[11px] opacity-70 font-semibold">{cartCount} Item Pesanan</p>
                <p
                  style={{ color: primaryColor }}
                  className="text-base font-black tracking-tight"
                >
                  {formatCurrency(cartTotal)}
                </p>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => isInteractive && onOpenCart()}
                style={{ backgroundColor: buttonColor }}
                className={`px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 ${getButtonRadius()}`}
              >
                Lihat Keranjang ({cartCount})
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components for Product Layout Variants (Grid, List, Card)
// ─────────────────────────────────────────────────────────────

function ProductGridCard({
  product,
  surfaceColor,
  primaryColor,
  buttonColor,
  buttonRadius,
  fontHeading,
  textColor,
  onAddToCart,
  onSelectProduct,
  isInteractive,
}) {
  const needsVariant = hasRequiredVariants(product)
  const imageUrl = getProductImageUrl(product)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      style={{ backgroundColor: surfaceColor }}
      onClick={() => isInteractive && onSelectProduct(product)}
      className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-black/5 shadow-2xs hover:shadow-md transition-all cursor-pointer"
    >
      {/* 1. Image area proporsional — aspect-square, object-cover */}
      <div className="relative aspect-square w-full overflow-hidden bg-black/3">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs opacity-40 font-medium">
            No Image
          </div>
        )}
      </div>

      {/* 2. Product Information Area */}
      <div className="p-2.5 sm:p-3 flex flex-col justify-between flex-1 min-w-0">
        <div>
          {/* Nama Produk */}
          <h3
            style={{ fontFamily: `'${fontHeading}', sans-serif`, color: textColor }}
            className="text-xs sm:text-sm font-bold line-clamp-2 leading-snug group-hover:opacity-80 transition-opacity"
          >
            {product.name}
          </h3>

          {/* Info/category jika memang sudah ada */}
          {product.category && (
            <p className="text-[10px] sm:text-xs opacity-50 mt-1 truncate">
              {product.category}
            </p>
          )}
        </div>

        {/* Harga & [ + ] CTA */}
        <div className="mt-3 flex items-center justify-between gap-1.5 pt-1 border-t border-black/5">
          <div className="min-w-0">
            <span
              style={{ color: primaryColor }}
              className="text-xs sm:text-sm font-extrabold tabular-nums"
            >
              {formatCurrency(product.unit_price)}
            </span>
            {needsVariant && (
              <p className="text-[10px] opacity-55 mt-0.5">Pilih varian</p>
            )}
          </div>

          {/* CTA +: minimum 40x40px touch target */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation()
              if (!isInteractive) return
              if (needsVariant) {
                onSelectProduct(product)
              } else {
                onAddToCart(product)
              }
            }}
            style={{ backgroundColor: buttonColor }}
            className={`flex h-10 w-10 min-w-[40px] min-h-[40px] items-center justify-center text-white text-base font-bold shadow-xs hover:opacity-90 transition-all shrink-0 ${buttonRadius}`}
            aria-label={`Tambah ${product.name}`}
          >
            +
          </motion.button>
        </div>
      </div>
    </div>
  )
}

function ProductListCard({
  product,
  surfaceColor,
  primaryColor,
  buttonColor,
  buttonRadius,
  fontHeading,
  textColor,
  onAddToCart,
  onSelectProduct,
  isInteractive,
}) {
  const needsVariant = hasRequiredVariants(product)
  const imageUrl = getProductImageUrl(product)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      style={{ backgroundColor: surfaceColor }}
      onClick={() => isInteractive && onSelectProduct(product)}
      className="flex items-center gap-3 p-3 rounded-2xl border border-black/5 shadow-2xs hover:shadow-sm transition-all cursor-pointer group"
    >
      {/* Thumbnail */}
      <div className="relative h-18 w-18 shrink-0 overflow-hidden rounded-xl bg-black/3">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] opacity-40">
            No Image
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3
          style={{ fontFamily: `'${fontHeading}', sans-serif`, color: textColor }}
          className="text-xs sm:text-sm font-bold truncate leading-tight group-hover:opacity-80 transition-opacity"
        >
          {product.name}
        </h3>
        {product.category && (
          <p className="text-[10px] opacity-50 mt-0.5 truncate">{product.category}</p>
        )}
        <p
          style={{ color: primaryColor }}
          className="mt-1 text-xs sm:text-sm font-extrabold tabular-nums"
        >
          {formatCurrency(product.unit_price)}
        </p>
        {needsVariant && (
          <p className="text-[10px] opacity-55 mt-0.5">Pilih varian</p>
        )}
      </div>

      {/* "+" add button — minimum 40x40px touch target */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          e.stopPropagation()
          if (!isInteractive) return
          if (needsVariant) {
            onSelectProduct(product)
          } else {
            onAddToCart(product)
          }
        }}
        style={{ backgroundColor: buttonColor }}
        className={`flex h-10 w-10 min-w-[40px] min-h-[40px] items-center justify-center text-white text-base font-bold shadow-xs hover:opacity-90 transition-all shrink-0 ${buttonRadius}`}
        aria-label={`Tambah ${product.name}`}
      >
        +
      </motion.button>
    </div>
  )
}

function ProductBigCard({
  product,
  surfaceColor,
  primaryColor,
  buttonColor,
  buttonRadius,
  fontHeading,
  textColor,
  onAddToCart,
  onSelectProduct,
  isInteractive,
}) {
  const needsVariant = hasRequiredVariants(product)
  const imageUrl = getProductImageUrl(product)
  const [imgError, setImgError] = useState(false)

  return (
    <div
      style={{ backgroundColor: surfaceColor }}
      onClick={() => isInteractive && onSelectProduct(product)}
      className="overflow-hidden rounded-3xl border border-black/5 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Wide hero image */}
      <div className="relative h-44 w-full overflow-hidden bg-black/3">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={product.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm opacity-40">
            No Image
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3
              style={{ fontFamily: `'${fontHeading}', sans-serif`, color: textColor }}
              className="text-sm sm:text-base font-bold leading-tight group-hover:opacity-80 transition-opacity"
            >
              {product.name}
            </h3>
            {product.category && (
              <p className="text-xs opacity-50 mt-1 truncate">{product.category}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-2 border-t border-black/5">
          <div className="min-w-0">
            <span
              style={{ color: primaryColor }}
              className="text-base font-extrabold tabular-nums"
            >
              {formatCurrency(product.unit_price)}
            </span>
            {needsVariant && (
              <p className="text-[10px] opacity-55 mt-0.5">Pilih varian</p>
            )}
          </div>

          {/* CTA button: minimum 40px height */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation()
              if (!isInteractive) return
              if (needsVariant) {
                onSelectProduct(product)
              } else {
                onAddToCart(product)
              }
            }}
            style={{ backgroundColor: buttonColor }}
            className={`px-5 py-2.5 text-sm font-bold text-white shadow-xs min-h-[40px] hover:opacity-90 transition-all ${buttonRadius}`}
            aria-label={`Tambah ${product.name}`}
          >
            + Tambah
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Social Media Icon & Link Button Helpers (qr.md)
// ─────────────────────────────────────────────────────────────

function PlatformIcon({ platform, className = 'h-4 w-4' }) {
  switch (platform) {
    case 'instagram':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 2.89 3.46 2.79 1.25-.01 2.37-.78 2.87-1.9.23-.46.33-.97.33-1.49V.02z" />
        </svg>
      )
    case 'maps':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      )
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      )
  }
}

function SocialLinkButton({ link, isInteractive }) {
  const safeUrl = sanitizeSocialUrl(link.platform, link.url)
  if (!safeUrl) return null

  const platformConfigs = {
    instagram: {
      title: 'Instagram',
      bgClass: 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white',
    },
    whatsapp: {
      title: 'WhatsApp',
      bgClass: 'bg-emerald-500 text-white',
    },
    facebook: {
      title: 'Facebook',
      bgClass: 'bg-[#1877F2] text-white',
    },
    tiktok: {
      title: 'TikTok',
      bgClass: 'bg-black text-white',
    },
    maps: {
      title: 'Google Maps',
      bgClass: 'bg-rose-500 text-white',
    },
  }

  const config = platformConfigs[link.platform] || {
    title: link.platform,
    bgClass: 'bg-slate-700 text-white',
  }

  return (
    <a
      href={isInteractive ? safeUrl : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex h-9 w-9 min-w-[36px] min-h-[36px] items-center justify-center rounded-full shadow-2xs hover:scale-105 active:scale-95 transition-transform ${config.bgClass}`}
      title={config.title}
      aria-label={config.title}
      onClick={(e) => {
        if (!isInteractive) e.preventDefault()
      }}
    >
      <PlatformIcon platform={link.platform} className="h-4 w-4" />
    </a>
  )
}
