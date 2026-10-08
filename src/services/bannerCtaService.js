import { supabase } from '../lib/supabase.js'

/**
 * Sanitizes custom URLs, rejecting dangerous protocols like javascript:, data:, vbscript:.
 *
 * @param {string} url
 * @returns {string} Sanitized URL or empty string if dangerous/invalid.
 */
export function sanitizeCustomUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  // Disallow javascript:, data:, vbscript:, and control characters
  const normalized = trimmed.replace(/[\s\u0000-\u001F\u007F-\u009F]+/g, '').toLowerCase()
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vbscript:') ||
    /^(?:javascript|data|vbscript):/i.test(trimmed)
  ) {
    return ''
  }

  return trimmed
}

/**
 * Checks whether a given URL is considered dangerous.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isDangerousUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  const normalized = trimmed.replace(/[\s\u0000-\u001F\u007F-\u009F]+/g, '').toLowerCase()
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vbscript:') ||
    /^(?:javascript|data|vbscript):/i.test(trimmed)
  )
}

/**
 * Resolves a destination public URL from a banner or structured CTA target.
 *
 * Product: /menu/{businessId}/product/{productId}
 * Category: /menu/{businessId}#category-{categoryIdOrName}
 * Page: /menu/{businessId} or /menu/{businessId}?checkout=true
 * Custom: sanitized custom link
 *
 * @param {object|string} bannerOrTarget
 * @param {string} businessId
 * @returns {string}
 */
export function resolveBannerCtaUrl(bannerOrTarget, businessId = '') {
  if (!bannerOrTarget) return ''

  // If a string was passed directly
  if (typeof bannerOrTarget === 'string') {
    return sanitizeCustomUrl(bannerOrTarget)
  }

  const target = bannerOrTarget.ctaTarget || (bannerOrTarget.type ? bannerOrTarget : null)

  if (target && typeof target === 'object' && target.type) {
    switch (target.type) {
      case 'product': {
        const prodId = target.id || target.productId
        if (!prodId) return businessId ? `/menu/${businessId}` : ''
        return businessId
          ? `/menu/${businessId}/product/${prodId}`
          : `/product/${prodId}`
      }
      case 'category': {
        const catKey = target.name || target.id || ''
        const anchor = encodeURIComponent(catKey)
        return businessId
          ? `/menu/${businessId}#category-${anchor}`
          : `#category-${anchor}`
      }
      case 'page': {
        const val = (target.value || '').toLowerCase()
        if (val === 'orders' || val === 'pesanan' || val === 'cart') {
          return businessId ? `/menu/${businessId}?checkout=true` : '?checkout=true'
        }
        return businessId ? `/menu/${businessId}` : '/'
      }
      case 'custom': {
        return sanitizeCustomUrl(target.value || target.url || '')
      }
      default:
        break
    }
  }

  // Fallback to legacy raw ctaUrl string
  const rawUrl = bannerOrTarget.ctaUrl || ''
  return sanitizeCustomUrl(rawUrl)
}

/**
 * Parses/resolves a raw CTA URL into a structured target object for the picker.
 * Preserves legacy targets without overwriting them.
 *
 * @param {string} rawUrl
 * @param {object} context
 * @param {Array} [context.products]
 * @param {Array} [context.categories]
 * @param {string} [context.businessId]
 * @returns {object|null} Structured target or null if empty
 */
export function resolveTargetFromRawUrl(rawUrl, { products = [], categories = [], businessId = '' } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  // 1. Check Product Deep Link: /menu/[biz]/product/[id] or /product/[id]
  const productMatch = trimmed.match(/(?:\/menu\/[^/?#]+)?\/product\/([^/?#]+)/i)
  if (productMatch && productMatch[1]) {
    const prodId = productMatch[1]
    const matched = products.find((p) => p.id === prodId)
    return {
      type: 'product',
      id: prodId,
      name: matched?.name || 'Produk Terpilih',
      category: matched?.category || '',
      price: matched?.unit_price,
    }
  }

  // 2. Check Category Anchor: #category-[key], #kategori-[key], ?category=[key]
  const catAnchorMatch = trimmed.match(/#(?:category|kategori)-([^/?#]+)/i)
  const catQueryMatch = trimmed.match(/[?&]category=([^&#]+)/i)
  const catKey = catAnchorMatch ? decodeURIComponent(catAnchorMatch[1]) : catQueryMatch ? decodeURIComponent(catQueryMatch[1]) : null

  if (catKey) {
    const matched = categories.find((c) => {
      const cName = typeof c === 'string' ? c : c.name
      const cId = typeof c === 'object' ? c.id : ''
      return (
        (cName && cName.toLowerCase() === catKey.toLowerCase()) ||
        (cId && cId.toLowerCase() === catKey.toLowerCase())
      )
    })

    const resolvedName = typeof matched === 'string' ? matched : matched?.name || catKey
    const resolvedId = typeof matched === 'object' && matched?.id ? matched.id : catKey

    return {
      type: 'category',
      id: resolvedId,
      name: resolvedName,
    }
  }

  // 3. Check Page Target: Menu
  if (
    trimmed === '/menu' ||
    (businessId && (trimmed === `/menu/${businessId}` || trimmed === `/menu/${businessId}/`)) ||
    trimmed === '#menu' ||
    trimmed === '/'
  ) {
    return {
      type: 'page',
      value: 'menu',
      name: 'Menu',
    }
  }

  // 4. Check Page Target: Pesanan / Orders
  if (
    trimmed.includes('checkout=true') ||
    trimmed === '#pesanan' ||
    trimmed === '#cart' ||
    trimmed === '#orders'
  ) {
    return {
      type: 'page',
      value: 'orders',
      name: 'Pesanan',
    }
  }

  // 5. Fallback: Custom Target
  return {
    type: 'custom',
    value: trimmed,
    name: trimmed,
  }
}

/**
 * Returns user-facing display details for a structured CTA target.
 *
 * @param {object} target
 * @returns {object}
 */
export function getTargetDisplayInfo(target) {
  if (!target || typeof target !== 'object') {
    return {
      icon: '🔗',
      typeLabel: 'Belum Dipilih',
      name: '',
      secondaryLabel: '',
      resolvedType: 'none',
    }
  }

  switch (target.type) {
    case 'product':
      return {
        icon: '📦',
        typeLabel: 'Produk',
        name: target.name || 'Produk',
        secondaryLabel: `Target: Produk • ${target.name || 'Produk'}`,
        resolvedType: 'product',
      }
    case 'category':
      return {
        icon: '📂',
        typeLabel: 'Kategori',
        name: target.name || 'Kategori',
        secondaryLabel: `Target: Kategori • ${target.name || 'Kategori'}`,
        resolvedType: 'category',
      }
    case 'page': {
      const isOrders = target.value === 'orders' || target.value === 'pesanan'
      return {
        icon: isOrders ? '🛒' : '🏠',
        typeLabel: 'Halaman',
        name: target.name || (isOrders ? 'Pesanan' : 'Menu'),
        secondaryLabel: `Target: Halaman • ${target.name || (isOrders ? 'Pesanan' : 'Menu')}`,
        resolvedType: 'page',
      }
    }
    case 'custom':
      return {
        icon: '🔗',
        typeLabel: 'Custom',
        name: target.value || 'Link Custom',
        secondaryLabel: `Target: Custom • ${target.value || 'Link Custom'}`,
        resolvedType: 'custom',
      }
    default:
      return {
        icon: '🔗',
        typeLabel: 'Target',
        name: target.name || target.value || 'Target CTA',
        secondaryLabel: `Target: ${target.name || target.value || 'Target CTA'}`,
        resolvedType: 'unknown',
      }
  }
}

/**
 * Searches business-scoped products, categories, and pages for the CTA picker.
 * Strictly verifies business isolation by scoping every query to businessId.
 *
 * @param {object} options
 * @param {string} options.businessId - Currently authenticated business ID
 * @param {string} [options.query] - Search term
 * @param {Array} [options.cachedProducts] - Pre-fetched business products
 * @param {Array} [options.cachedCategories] - Pre-fetched business categories
 * @param {object} [options.supabaseClient] - Supabase client instance
 * @param {number} [options.limit=8] - Maximum items to return per section
 * @returns {Promise<{ products: Array, categories: Array, pages: Array }>}
 */
export async function searchBannerTargets({
  businessId,
  query = '',
  cachedProducts = [],
  cachedCategories = [],
  supabaseClient = supabase,
  limit = 8,
}) {
  if (!businessId) {
    return { products: [], categories: [], pages: [] }
  }

  const cleanQuery = (query || '').trim().toLowerCase()

  // 1. Internal Pages
  const staticPages = [
    {
      type: 'page',
      value: 'menu',
      name: 'Menu',
      description: 'Halaman utama katalog menu publik',
      icon: '🏠',
    },
    {
      type: 'page',
      value: 'orders',
      name: 'Pesanan',
      description: 'Halaman status pesanan & checkout pelanggan',
      icon: '🛒',
    },
  ]

  const filteredPages = cleanQuery
    ? staticPages.filter(
        (p) =>
          p.name.toLowerCase().includes(cleanQuery) ||
          p.value.toLowerCase().includes(cleanQuery) ||
          p.description.toLowerCase().includes(cleanQuery)
      )
    : staticPages

  // 2. Categories (Scoped to businessId)
  let availableCategories = []
  if (Array.isArray(cachedCategories) && cachedCategories.length > 0) {
    availableCategories = cachedCategories.map((c) =>
      typeof c === 'string' ? { id: c, name: c } : { id: c.id || c.name, name: c.name }
    )
  } else if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from('menu_categories')
        .select('id, name')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(20)

      if (data) {
        availableCategories = data
      }
    } catch {
      // Continue with empty categories
    }
  }

  const filteredCategories = cleanQuery
    ? availableCategories
        .filter((c) => (c.name || '').toLowerCase().includes(cleanQuery))
        .slice(0, limit)
    : availableCategories.slice(0, limit)

  // 3. Products (Scoped to businessId)
  let matchingProducts = []
  if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
    const localMatches = cachedProducts.filter((p) => {
      if (!p) return false
      // Exclude unavailable products
      if (p.is_available === false) return false
      if (!cleanQuery) return true
      return (p.name || '').toLowerCase().includes(cleanQuery)
    })

    matchingProducts = localMatches.slice(0, limit)
  } else if (supabaseClient) {
    // If no local products supplied, query business-scoped products from database
    try {
      let queryBuilder = supabaseClient
        .from('products')
        .select('id, name, category, unit_price, image_url, is_available')
        .eq('business_id', businessId)
        .eq('is_available', true)

      if (cleanQuery) {
        queryBuilder = queryBuilder.ilike('name', `%${cleanQuery}%`)
      } else {
        queryBuilder = queryBuilder.order('sort_order', { ascending: true })
      }

      const { data, error } = await queryBuilder.limit(limit)
      if (!error && Array.isArray(data)) {
        matchingProducts = data
      }
    } catch {
      // Gracefully continue
    }
  }

  return {
    products: matchingProducts.map((p) => ({
      type: 'product',
      id: p.id,
      name: p.name,
      category: p.category || '',
      price: p.unit_price,
      imageUrl: p.image_url || '',
      isAvailable: p.is_available !== false,
    })),
    categories: filteredCategories.map((c) => ({
      type: 'category',
      id: c.id || c.name,
      name: c.name,
    })),
    pages: filteredPages,
  }
}
