import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'
import { parseProductMetadata, calculateProductPrice } from '../../lib/productMetadata'
import { getDesignSettings, DEFAULT_DESIGN_SETTINGS } from '../../services/qrMenuDesignService'
import { getCachedMenuBundle, getCachedProduct, normalizeBusinessId } from '../../services/qrMenuCacheService'

export default function PublicProductDetailPage() {
  const { businessId: rawBusinessId, productId: rawProductId } = useParams()
  const businessId = normalizeBusinessId(rawBusinessId)
  const productId = normalizeBusinessId(rawProductId)
  const navigate = useNavigate()

  const [business, setBusiness] = useState(null)
  const [designSettings, setDesignSettings] = useState(DEFAULT_DESIGN_SETTINGS)
  const [product, setProduct] = useState(null)
  const [meta, setMeta] = useState(null)
  const [baseStock, setBaseStock] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Gallery & Variant Image states
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [selectedVariantImage, setSelectedVariantImage] = useState(null)
  const [gallerySelectedImage, setGallerySelectedImage] = useState(null)
  const [imgLoadFailed, setImgLoadFailed] = useState(false)

  // Variants selection: { [groupId]: optionId }
  const [selectedVariants, setSelectedVariants] = useState({})

  // Quantity
  const [quantity, setQuantity] = useState(1)
  const [quantityInput, setQuantityInput] = useState('1')

  useEffect(() => {
    setQuantityInput(String(quantity))
  }, [quantity])

  // Tabs: 'deskripsi' | 'spesifikasi' | 'informasi'
  const [activeTab, setActiveTab] = useState('deskripsi')

  // Feedback notification
  const [addedToast, setAddedToast] = useState(false)

  // Instant synchronous cache check (L1 memory / L2 storage) for 0ms First Contentful Paint
  useEffect(() => {
    if (!businessId || !productId) return
    const cachedProd = getCachedProduct(businessId, productId)
    const cachedBundle = getCachedMenuBundle(businessId)

    if (cachedBundle?.business && cachedProd) {
      setBusiness(cachedBundle.business)
      if (cachedBundle.designSettings) setDesignSettings(cachedBundle.designSettings)
      setProduct(cachedProd)
      const parsed = parseProductMetadata(cachedProd)
      setMeta(parsed)
      setLoading(false)
    }
  }, [businessId, productId])

  useEffect(() => {
    let isMounted = true

    async function loadProductDetail() {
      setError('')

      // 1. Parallel loading of business, design, product, and inventory
      try {
        const cachedBundle = getCachedMenuBundle(businessId)
        let biz = cachedBundle?.business

        if (!biz) {
          const { data: fetchedBiz, error: bizErr } = await supabase
            .from('businesses')
            .select('id, name, slogan, description, cover_url, logo_url, is_menu_published')
            .eq('id', businessId)
            .single()

          if (!isMounted) return

          if (bizErr || !fetchedBiz) {
            setError('Bisnis tidak ditemukan.')
            setLoading(false)
            return
          }
          biz = fetchedBiz
        }

        if (!isMounted) return

        if (!biz.is_menu_published) {
          setError('Menu bisnis ini belum dipublikasikan.')
          setLoading(false)
          return
        }

        setBusiness(biz)

        // Parallelize design settings and product query
        const designPromise = cachedBundle?.designSettings
          ? Promise.resolve(cachedBundle.designSettings)
          : getDesignSettings(biz.id).catch(() => DEFAULT_DESIGN_SETTINGS)

        const cachedProd = getCachedProduct(businessId, productId)
        const prodPromise = cachedProd
          ? Promise.resolve({ data: cachedProd, error: null })
          : supabase
              .from('products')
              .select('*')
              .eq('id', productId)
              .eq('business_id', biz.id)
              .eq('is_available', true)
              .eq('is_active', true)
              .single()

        const [design, { data: prod, error: prodErr }] = await Promise.all([
          designPromise,
          prodPromise,
        ])

        if (!isMounted) return

        if (design) setDesignSettings(design)

        if (prodErr || !prod) {
          setError('Produk tidak ditemukan atau tidak tersedia.')
          setLoading(false)
          return
        }

        // 3. Load product inventory stock
        const { data: inv } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('product_id', prod.id)
          .maybeSingle()

        if (!isMounted) return

        const currentStock = inv?.quantity != null ? Number(inv.quantity) : 99
        setBaseStock(currentStock)

        const parsed = parseProductMetadata(prod)
        setProduct(prod)
        setMeta(parsed)

        // Default select first available option in each variant group
        const initialSelections = {}
        let initialOptImage = null
        if (parsed.variantGroups && parsed.variantGroups.length > 0) {
          parsed.variantGroups.forEach(group => {
            if (group.options && group.options.length > 0) {
              const firstAvailable = group.options.find(o => (o.stock ?? currentStock) > 0) || group.options[0]
              if (firstAvailable) {
                initialSelections[group.id] = firstAvailable.id
                if (!initialOptImage && (firstAvailable.imageUrl || firstAvailable.image_url)) {
                  initialOptImage = firstAvailable.imageUrl || firstAvailable.image_url
                }
              }
            }
          })
        }
        setSelectedVariants(initialSelections)
        if (initialOptImage) {
          setSelectedVariantImage(initialOptImage)
        }
        setLoading(false)
      } catch (err) {
        console.warn('[PublicProductDetailPage] Load detail error:', err)
        if (isMounted) {
          setError('Gagal memuat detail produk.')
          setLoading(false)
        }
      }
    }

    loadProductDetail()
    return () => {
      isMounted = false
    }
  }, [businessId, productId])

  // Calculate selected variant options
  const selectedOptionsList = meta?.variantGroups?.map(group => {
    const selectedOptId = selectedVariants[group.id]
    return group.options?.find(opt => opt.id === selectedOptId)
  }).filter(Boolean) || []

  // Real-time calculated price with discounts
  const priceCalculation = meta
    ? calculateProductPrice(product?.unit_price, selectedOptionsList, meta?.discount)
    : { finalPrice: 0, originalPrice: 0, discountPercent: 0, isDiscounted: false }

  // Effective stock based on selected variants or base stock
  const effectiveStock = selectedOptionsList.length > 0
    ? Math.min(...selectedOptionsList.map(opt => (opt.stock != null ? Number(opt.stock) : baseStock)))
    : baseStock

  const isOutOfStock = effectiveStock <= 0

  function handleSelectVariant(groupId, option) {
    if (option.stock != null && option.stock <= 0) return // disabled
    setSelectedVariants(prev => ({
      ...prev,
      [groupId]: option.id,
    }))

    const optImage = option.imageUrl || option.image_url
    if (optImage) {
      setSelectedVariantImage(optImage)
      setGallerySelectedImage(optImage)
    } else {
      // If clicked option has no image, find if another currently selected option has an image
      const otherGroup = meta?.variantGroups?.find(g => g.id !== groupId)
      const otherSelectedOptId = otherGroup ? selectedVariants[otherGroup.id] : null
      const otherOpt = otherGroup?.options?.find(o => o.id === otherSelectedOptId)
      const fallbackOptImage = otherOpt?.imageUrl || otherOpt?.image_url || null

      setSelectedVariantImage(fallbackOptImage)
      setGallerySelectedImage(fallbackOptImage)
    }
    setImgLoadFailed(false)
  }

  function handleQtyChange(delta) {
    const current = Math.max(1, parseInt(quantityInput, 10) || quantity || 1)
    const maxStock = effectiveStock > 0 ? effectiveStock : 99
    const next = current + delta
    const clamped = Math.max(1, Math.min(maxStock, next))
    setQuantity(clamped)
    setQuantityInput(String(clamped))
  }

  function handleQuantityInputChange(e) {
    const raw = e.target.value.replace(/\D/g, '')

    if (raw === '') {
      setQuantityInput('')
      return
    }

    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed)) {
      setQuantityInput('')
      return
    }

    const maxStock = effectiveStock > 0 ? effectiveStock : 99

    if (parsed > maxStock) {
      setQuantity(maxStock)
      setQuantityInput(String(maxStock))
    } else if (parsed >= 1) {
      setQuantity(parsed)
      setQuantityInput(raw)
    } else {
      setQuantityInput('0')
    }
  }

  function handleQuantityCommit() {
    const parsed = parseInt(quantityInput, 10)
    const maxStock = effectiveStock > 0 ? effectiveStock : 99

    if (Number.isNaN(parsed) || parsed < 1) {
      setQuantity(1)
      setQuantityInput('1')
    } else if (parsed > maxStock) {
      setQuantity(maxStock)
      setQuantityInput(String(maxStock))
    } else {
      setQuantity(parsed)
      setQuantityInput(String(parsed))
    }
  }

  function handleQuantityKeyDown(e) {
    if (e.key === 'Enter') {
      handleQuantityCommit()
      e.target.blur()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      handleQtyChange(1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      handleQtyChange(-1)
    }
  }

  // Build cart item payload with full variant configuration
  function getCartItemPayload() {
    const finalQty = Math.max(1, Math.min(effectiveStock > 0 ? effectiveStock : 99, parseInt(quantityInput, 10) || quantity || 1))
    const variantSummary = selectedOptionsList.map(opt => opt.name).join(', ')
    return {
      product_id: product.id,
      product_name: product.name,
      variant_summary: variantSummary || null,
      selected_variants: selectedOptionsList.map(opt => ({
        group_id: opt.group_id,
        option_id: opt.id,
        option_name: opt.name,
        price_adjustment: opt.price_adjustment,
      })),
      quantity: finalQty,
      unit_price: priceCalculation.finalPrice,
      original_price: priceCalculation.originalPrice,
      subtotal: priceCalculation.finalPrice * finalQty,
      image_url: meta?.images?.[activeImageIndex] || product.image_url || '',
    }
  }

  // Save to shared localStorage cart
  function saveCartItem(cartItem, andRedirect = false) {
    try {
      const storageKey = `bs_cart_${businessId}`
      const existingStr = localStorage.getItem(storageKey)
      let currentCart = []
      if (existingStr) {
        currentCart = JSON.parse(existingStr)
      }

      // Find item with same product_id AND same variant configuration
      const existingIdx = currentCart.findIndex(item => {
        if (item.product_id !== cartItem.product_id) return false
        return (item.variant_summary || '') === (cartItem.variant_summary || '')
      })

      if (existingIdx >= 0) {
        const existing = currentCart[existingIdx]
        const updatedQty = existing.quantity + cartItem.quantity
        currentCart[existingIdx] = {
          ...existing,
          quantity: updatedQty,
          subtotal: updatedQty * existing.unit_price,
        }
      } else {
        currentCart.push(cartItem)
      }

      localStorage.setItem(storageKey, JSON.stringify(currentCart))

      // Trigger custom storage event for other components if on same tab
      window.dispatchEvent(new Event('cart_updated'))

      if (andRedirect) {
        navigate(`/menu/${businessId}?checkout=true`)
      } else {
        setAddedToast(true)
        setTimeout(() => setAddedToast(false), 3000)
      }
    } catch (e) {
      console.error('Failed to save to cart storage:', e)
    }
  }

  function handleAddToCart() {
    if (isOutOfStock) return
    handleQuantityCommit()
    const item = getCartItemPayload()
    saveCartItem(item, false)
  }

  function handleBuyNow() {
    if (isOutOfStock) return
    handleQuantityCommit()
    const item = getCartItemPayload()
    saveCartItem(item, true)
  }

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: designSettings?.theme?.background || '#FFF9F4',
          color: designSettings?.theme?.text || '#1E2A5E',
        }}
        className="flex min-h-screen items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: designSettings?.theme?.primary || '#F5A623',
              borderTopColor: 'transparent',
            }}
          />
          <p className="text-xs font-medium opacity-70">Memuat detail produk...</p>
        </div>
      </div>
    )
  }

  if (error || !product) {
    const errorTheme = designSettings?.theme || DEFAULT_DESIGN_SETTINGS.theme
    return (
      <div
        style={{
          backgroundColor: errorTheme.background || '#FFF9F4',
          color: errorTheme.text || '#1E2A5E',
        }}
        className="flex min-h-screen items-center justify-center px-4 text-center"
      >
        <div
          style={{
            backgroundColor: errorTheme.surface || '#FFFFFF',
            borderColor: 'color-mix(in srgb, ' + (errorTheme.text || '#1E2A5E') + ' 12%, transparent)',
          }}
          className="max-w-md rounded-2xl border p-8 shadow-lg"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Produk Tidak Tersedia</h2>
          <p className="mt-2 text-sm opacity-70">{error || 'Produk tidak ditemukan.'}</p>
          <Link
            to={`/menu/${businessId}`}
            className="mt-6 inline-block w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: errorTheme.button || errorTheme.primary || '#F5A623' }}
          >
            Kembali ke Daftar Menu
          </Link>
        </div>
      </div>
    )
  }

  const theme = designSettings?.theme || DEFAULT_DESIGN_SETTINGS.theme
  const primaryColor = theme.primary || '#F5A623'
  const secondaryColor = theme.secondary || '#1E2A5E'
  const bgColor = theme.background || '#FFF9F4'
  const surfaceColor = theme.surface || '#FFFFFF'
  const textColor = theme.text || '#1E2A5E'
  const buttonColor = theme.button || primaryColor
  const buttonStyle = theme.buttonStyle || 'pill'
  const fontHeading = theme.fontHeading || 'Inter'
  const fontBody = theme.fontBody || 'Inter'

  const buttonRadiusClass =
    buttonStyle === 'square'
      ? 'rounded-md'
      : buttonStyle === 'rounded'
      ? 'rounded-xl'
      : 'rounded-full'

  const containerStyles = {
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: `'${fontBody}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    '--qr-primary': primaryColor,
    '--qr-secondary': secondaryColor,
    '--qr-bg': bgColor,
    '--qr-surface': surfaceColor,
    '--qr-text': textColor,
    '--qr-border': 'color-mix(in srgb, ' + textColor + ' 12%, transparent)',
    '--qr-btn': buttonColor,
    '--theme-primary': primaryColor,
    '--theme-bg': bgColor,
    '--theme-surface': surfaceColor,
    '--theme-text': textColor,
    '--theme-btn': buttonColor,
  }

  const baseImages = meta?.images?.length ? meta.images : (product?.image_url ? [product.image_url] : [])
  const primaryFallback = baseImages[0] || product?.image_url || ''

  // Collect unique variant option images as contextual gallery images (toko.md Section 4)
  const variantImages = []
  if (meta?.variantGroups) {
    meta.variantGroups.forEach(grp => {
      grp.options?.forEach(opt => {
        const url = opt.imageUrl || opt.image_url
        if (url && !variantImages.includes(url) && !baseImages.includes(url)) {
          variantImages.push(url)
        }
      })
    })
  }
  const allGalleryImages = [...baseImages, ...variantImages]

  // Active hero image:
  // 1. Gallery thumbnail or selected variant image
  // 2. Primary fallback
  // 3. Fallback on load error
  let activeImage = gallerySelectedImage || selectedVariantImage || primaryFallback
  if (imgLoadFailed) {
    activeImage = primaryFallback
  }

  return (
    <div
      style={containerStyles}
      className="min-h-screen antialiased pb-28 sm:pb-16 transition-colors duration-200"
    >
      {/* Top Header / Breadcrumbs with QR theme propagation */}
      <header
        style={{
          backgroundColor: surfaceColor,
          borderColor: 'var(--qr-border)',
        }}
        className="sticky top-0 z-30 border-b backdrop-blur-md bg-opacity-95"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            to={`/menu/${businessId}`}
            className="group flex items-center gap-2 text-xs font-semibold transition hover:opacity-80"
            style={{ color: 'color-mix(in srgb, var(--qr-text) 75%, transparent)' }}
          >
            <span
              style={{
                backgroundColor: 'color-mix(in srgb, var(--qr-surface) 90%, var(--qr-text) 10%)',
                borderColor: 'var(--qr-border)',
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border text-sm transition group-hover:scale-105"
            >
              ←
            </span>
            <span className="truncate">Kembali ke Menu {business?.name ? `(${business.name})` : ''}</span>
          </Link>

          {/* Cart link */}
          <Link
            to={`/menu/${businessId}`}
            className="flex items-center gap-2 text-xs font-bold transition hover:opacity-80 shrink-0"
            style={{ color: primaryColor }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.09-.773 2.34-1.872l1.836-8.046A1.125 1.125 0 0018.963 3H5.106" />
            </svg>
            <span>Lihat Keranjang</span>
          </Link>
        </div>
      </header>

      {/* Main Content Layout (Desktop: 2 Columns, Mobile: Stacked) */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">

          {/* ══════════════════════════════════════════════════════════
              KOLOM KIRI: STICKY GALLERY (5 Kolom di Desktop)
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 space-y-4">
              {/* Main Image */}
              <div
                style={{
                  backgroundColor: surfaceColor,
                  borderColor: 'var(--qr-border)',
                }}
                className="relative aspect-square w-full overflow-hidden rounded-2xl border shadow-sm"
              >
                <div className="absolute inset-0 bg-black/5 animate-pulse" />
                <AnimatePresence mode="wait">
                  {activeImage ? (
                    <motion.img
                      key={activeImage}
                      src={activeImage}
                      alt={product.name}
                      onError={() => {
                        if (!imgLoadFailed && primaryFallback && activeImage !== primaryFallback) {
                          setImgLoadFailed(true)
                        }
                      }}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="relative z-10 h-full w-full object-cover"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center opacity-40">
                      <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                      </svg>
                      <span className="mt-2 text-xs">Belum ada foto produk</span>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Thumbnails Row */}
              {allGalleryImages.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                  {allGalleryImages.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setGallerySelectedImage(img)
                        setImgLoadFailed(false)
                      }}
                      className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                        activeImage === img ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        borderColor: activeImage === img ? primaryColor : 'var(--qr-border)',
                        boxShadow: activeImage === img ? `0 0 0 2px color-mix(in srgb, ${primaryColor} 25%, transparent)` : 'none',
                      }}
                      aria-label={`Lihat gambar ${idx + 1}`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              KOLOM KANAN: PRODUCT INFO & ORDER SECTION (7 Kolom)
             ══════════════════════════════════════════════════════════ */}
          <div className="space-y-6 lg:col-span-7">

            {/* Header: Kategori & Judul */}
            <div>
              {product.category && (
                <span
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--qr-primary) 12%, transparent)',
                    color: primaryColor,
                    borderColor: 'color-mix(in srgb, var(--qr-primary) 22%, transparent)',
                  }}
                  className="inline-block rounded-md px-2.5 py-1 text-[11px] font-bold border uppercase tracking-wider"
                >
                  {product.category}
                </span>
              )}
              <h1
                style={{ fontFamily: `'${fontHeading}', sans-serif`, color: textColor }}
                className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight"
              >
                {product.name}
              </h1>
              {product.slogan && (
                <p
                  style={{ color: primaryColor }}
                  className="mt-1.5 text-sm font-semibold"
                >
                  {product.slogan}
                </p>
              )}
            </div>

            {/* Harga & Diskon (Section 3 & 6) */}
            <div
              style={{
                backgroundColor: surfaceColor,
                borderColor: 'var(--qr-border)',
              }}
              className="rounded-2xl border p-4 sm:p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span
                  style={{ color: textColor }}
                  className="text-3xl font-extrabold tracking-tight"
                >
                  {formatCurrency(priceCalculation.finalPrice)}
                </span>
                {priceCalculation.isDiscounted && (
                  <>
                    <span className="text-base font-medium opacity-50 line-through">
                      {formatCurrency(priceCalculation.originalPrice)}
                    </span>
                    <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500">
                      {priceCalculation.discountPercent}% OFF
                    </span>
                  </>
                )}
              </div>

              {/* Status Stok */}
              <div className="mt-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isOutOfStock ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span className={`text-xs font-semibold ${isOutOfStock ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {isOutOfStock ? 'Stok Habis' : `Stok tersedia: ${effectiveStock}`}
                </span>
              </div>
            </div>

            {/* Sistem Varian Dinamis (Section 4) */}
            {meta?.variantGroups && meta.variantGroups.length > 0 && (
              <div
                style={{
                  backgroundColor: surfaceColor,
                  borderColor: 'var(--qr-border)',
                }}
                className="space-y-4 rounded-2xl border p-4 sm:p-5 shadow-xs"
              >
                <p className="text-xs font-bold uppercase tracking-wider opacity-60">
                  Pilih Varian
                </p>
                {meta.variantGroups.map(group => (
                  <div key={group.id} className="space-y-2.5">
                    <p className="text-xs font-bold opacity-85">
                      {group.name}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.options?.map(option => {
                        const isSelected = selectedVariants[group.id] === option.id
                        const optionStock = option.stock != null ? Number(option.stock) : baseStock
                        const isSoldOut = optionStock <= 0
                        const optImg = option.imageUrl || option.image_url

                        return (
                          <motion.button
                            key={option.id}
                            type="button"
                            disabled={isSoldOut}
                            onClick={() => handleSelectVariant(group.id, option)}
                            whileTap={isSoldOut ? {} : { scale: 0.97 }}
                            style={
                              isSelected && !isSoldOut
                                ? {
                                    borderWidth: '2px',
                                    borderColor: primaryColor,
                                    backgroundColor: `color-mix(in srgb, ${primaryColor} 10%, transparent)`,
                                    color: textColor,
                                  }
                                : {
                                    borderColor: 'var(--qr-border)',
                                    color: textColor,
                                  }
                            }
                            className={`group relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all min-h-[42px] border ${
                              isSoldOut
                                ? 'cursor-not-allowed opacity-40 line-through'
                                : isSelected
                                ? 'shadow-xs'
                                : 'hover:opacity-80'
                            }`}
                          >
                            {optImg && (
                              <img
                                src={optImg}
                                alt={`${product.name} ${option.name}`}
                                className="h-7 w-7 rounded-lg object-cover shrink-0 border"
                                style={{ borderColor: 'var(--qr-border)' }}
                              />
                            )}
                            <span className="truncate">{option.name}</span>
                            {option.price_adjustment > 0 && (
                              <span
                                style={{ color: primaryColor }}
                                className="text-[11px] font-bold"
                              >
                                (+{formatCurrency(option.price_adjustment)})
                              </span>
                            )}
                            {isSelected && (
                              <motion.div
                                layoutId={`variantHighlight-${group.id}`}
                                className="absolute inset-0 rounded-xl pointer-events-none"
                                style={{
                                  boxShadow: `inset 0 0 0 2px ${primaryColor}`,
                                }}
                              />
                            )}
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Desktop Action Area: Quantity, Subtotal & Dual CTA (Section 9 & 10) */}
            <div
              style={{
                backgroundColor: surfaceColor,
                borderColor: 'var(--qr-border)',
              }}
              className="hidden sm:block rounded-2xl border p-5 space-y-5 shadow-xs"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-60">Atur Jumlah</p>
                  <div className="mt-2.5 flex items-center gap-3">
                    {/* Quantity Stepper — minimum 40px touch targets */}
                    <div
                      style={{
                        borderColor: 'var(--qr-border)',
                        backgroundColor: 'color-mix(in srgb, var(--qr-surface) 92%, var(--qr-text) 8%)',
                      }}
                      className="inline-flex items-center overflow-hidden rounded-xl border"
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleQtyChange(-1)}
                        disabled={quantity <= 1 || isOutOfStock}
                        style={{
                          borderColor: 'var(--qr-border)',
                          color: textColor,
                        }}
                        className="flex h-10 w-10 items-center justify-center border-r text-xl font-light transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Kurangi jumlah"
                      >
                        −
                      </motion.button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quantityInput}
                        onChange={handleQuantityInputChange}
                        onBlur={handleQuantityCommit}
                        onKeyDown={handleQuantityKeyDown}
                        onFocus={(e) => e.target.select()}
                        disabled={isOutOfStock}
                        style={{ color: textColor }}
                        className="h-10 w-14 bg-transparent text-center text-base font-bold tabular-nums outline-none transition focus:bg-black/5 dark:focus:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Jumlah quantity"
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleQtyChange(1)}
                        disabled={quantity >= effectiveStock || isOutOfStock}
                        style={{
                          borderColor: 'var(--qr-border)',
                          color: textColor,
                        }}
                        className="flex h-10 w-10 items-center justify-center border-l text-xl font-light transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Tambah jumlah"
                      >
                        +
                      </motion.button>
                    </div>
                    <span className="text-xs opacity-50 font-medium">
                      Maks. {effectiveStock}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-60">Subtotal</p>
                  <p
                    style={{ color: primaryColor }}
                    className="mt-1 text-2xl font-black tabular-nums"
                  >
                    {formatCurrency(priceCalculation.finalPrice * quantity)}
                  </p>
                </div>
              </div>

              {/* Dual CTA Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* "+ Keranjang": Outlined */}
                <motion.button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  whileHover={{ scale: 1.01 }}
                  whileTap={isOutOfStock ? {} : { scale: 0.97 }}
                  style={{
                    borderColor: primaryColor,
                    color: primaryColor,
                    backgroundColor: `color-mix(in srgb, ${primaryColor} 8%, transparent)`,
                  }}
                  className={`flex items-center justify-center gap-2 border py-3 min-h-[48px] text-sm font-bold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${buttonRadiusClass}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  + Keranjang
                </motion.button>

                {/* "Beli Langsung": Filled */}
                <motion.button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  whileHover={{ scale: 1.01 }}
                  whileTap={isOutOfStock ? {} : { scale: 0.97 }}
                  style={{
                    backgroundColor: buttonColor,
                    color: '#FFFFFF',
                    boxShadow: `0 4px 14px color-mix(in srgb, ${buttonColor} 30%, transparent)`,
                  }}
                  className={`flex items-center justify-center py-3 min-h-[48px] text-sm font-bold shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${buttonRadiusClass}`}
                >
                  Beli Langsung
                </motion.button>
              </div>

              {addedToast && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center text-xs font-bold text-emerald-500"
                >
                  ✓ Produk berhasil ditambahkan ke keranjang!
                </motion.div>
              )}
            </div>

            {/* Tab Informasi Produk (Section 12) */}
            <div
              style={{
                backgroundColor: surfaceColor,
                borderColor: 'var(--qr-border)',
              }}
              className="rounded-2xl border p-5 sm:p-6 shadow-xs"
            >
              {/* Tab Navigation */}
              <div
                style={{ borderColor: 'var(--qr-border)' }}
                className="flex border-b overflow-x-auto scrollbar-none"
              >
                {[
                  { id: 'deskripsi', label: 'Deskripsi' },
                  { id: 'spesifikasi', label: 'Spesifikasi' },
                  { id: 'informasi', label: 'Info Tambahan' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-4 py-3 text-xs sm:text-sm transition-colors duration-150 whitespace-nowrap ${
                      activeTab === tab.id ? 'font-bold' : 'font-medium opacity-60 hover:opacity-100'
                    }`}
                    style={activeTab === tab.id ? { color: primaryColor } : { color: textColor }}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabUnderline"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                        style={{ backgroundColor: primaryColor }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="pt-5 text-xs sm:text-sm">
                {/* 1. Tab Deskripsi */}
                {activeTab === 'deskripsi' && (
                  <div className="max-w-2xl leading-relaxed opacity-85">
                    {product.description ? (
                      <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
                    ) : (
                      <p className="opacity-50 text-xs sm:text-sm">Belum ada deskripsi untuk produk ini.</p>
                    )}
                  </div>
                )}

                {/* 2. Tab Spesifikasi */}
                {activeTab === 'spesifikasi' && (
                  <div className="max-w-2xl">
                    {(() => {
                      const specsList = []
                      if (product.category && String(product.category).trim() && String(product.category).trim() !== '-') {
                        specsList.push({ label: 'Kategori', value: String(product.category).trim() })
                      }
                      if (product.unit && String(product.unit).trim() && String(product.unit).trim() !== '-') {
                        specsList.push({ label: 'Satuan', value: String(product.unit).trim() })
                      }
                      if (product.sku && String(product.sku).trim() && String(product.sku).trim() !== '-') {
                        specsList.push({ label: 'SKU', value: String(product.sku).trim() })
                      }
                      if (meta?.specifications && typeof meta.specifications === 'object') {
                        for (const [key, val] of Object.entries(meta.specifications)) {
                          if (val != null && String(val).trim() && String(val).trim() !== '-') {
                            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1)
                            specsList.push({ label: formattedKey, value: String(val).trim() })
                          }
                        }
                      }

                      if (specsList.length === 0) {
                        return (
                          <p className="opacity-50 text-xs sm:text-sm">
                            Belum ada spesifikasi untuk produk ini.
                          </p>
                        )
                      }

                      return (
                        <dl
                          style={{ borderColor: 'var(--qr-border)' }}
                          className="divide-y"
                        >
                          {specsList.map((item, idx) => (
                            <div
                              key={idx}
                              style={{ borderColor: 'var(--qr-border)' }}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 py-3 text-xs sm:text-sm"
                            >
                              <dt className="opacity-60 font-medium">{item.label}</dt>
                              <dd className="sm:col-span-2 font-bold break-words">
                                {item.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )
                    })()}
                  </div>
                )}

                {/* 3. Tab Info Tambahan */}
                {activeTab === 'informasi' && (
                  <div className="max-w-2xl">
                    {(() => {
                      const infoList = []
                      if (meta?.storePolicy && String(meta.storePolicy).trim()) {
                        infoList.push({ label: 'Kebijakan Pemesanan', value: String(meta.storePolicy).trim() })
                      }
                      if (business?.name && String(business.name).trim()) {
                        infoList.push({ label: 'Penjual Resmi', value: String(business.name).trim() })
                      }
                      infoList.push({
                        label: 'Metode Transaksi',
                        value: 'Pesanan diproses langsung oleh kasir. Tersedia opsi bayar di kasir atau pembayaran online.',
                      })

                      return (
                        <dl
                          style={{ borderColor: 'var(--qr-border)' }}
                          className="divide-y"
                        >
                          {infoList.map((item, idx) => (
                            <div
                              key={idx}
                              style={{ borderColor: 'var(--qr-border)' }}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 py-3 text-xs sm:text-sm"
                            >
                              <dt className="opacity-60 font-medium">{item.label}</dt>
                              <dd className="sm:col-span-2 font-semibold leading-relaxed break-words">
                                {item.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MOBILE STICKY ACTION BAR (Section 14)
         ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          backgroundColor: surfaceColor,
          borderColor: 'var(--qr-border)',
        }}
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md bg-opacity-95 shadow-lg"
      >
        {/* Toast notification */}
        {addedToast && (
          <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-center text-[11px] font-bold text-emerald-500">
            ✓ Ditambahkan ke keranjang!
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold opacity-60">Total Harga</p>
            <p
              style={{ color: primaryColor }}
              className="text-lg font-black truncate tabular-nums"
            >
              {formatCurrency(priceCalculation.finalPrice * quantity)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile "+ Keranjang" — minimum 44px touch target */}
            <motion.button
              type="button"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              whileTap={isOutOfStock ? {} : { scale: 0.96 }}
              style={{
                borderColor: primaryColor,
                color: primaryColor,
                backgroundColor: `color-mix(in srgb, ${primaryColor} 8%, transparent)`,
              }}
              className={`flex min-h-[44px] items-center justify-center border px-3.5 text-xs font-bold transition hover:opacity-85 disabled:opacity-40 ${buttonRadiusClass}`}
            >
              + Keranjang
            </motion.button>

            {/* Mobile "Beli Langsung" — minimum 44px touch target */}
            <motion.button
              type="button"
              onClick={handleBuyNow}
              disabled={isOutOfStock}
              whileTap={isOutOfStock ? {} : { scale: 0.96 }}
              style={{
                backgroundColor: buttonColor,
                color: '#FFFFFF',
              }}
              className={`flex min-h-[44px] items-center justify-center px-4 text-xs font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-40 ${buttonRadiusClass}`}
            >
              Beli Langsung
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
