/**
 * Helper to safely extract and calculate product variants, discounts,
 * gallery images, and specifications for BisnisSehat public product page.
 */

export function parseProductMetadata(product) {
  if (!product) return null

  let metadata = {}
  if (product.notes && typeof product.notes === 'string') {
    const trimmed = product.notes.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        metadata = JSON.parse(trimmed)
      } catch {
        metadata = {}
      }
    }
  }

  // Also check specifications JSON if column exists
  const specs = metadata.specifications || product.specifications || {}

  // Images: support array in metadata, or fallback to single image_url
  const images = Array.isArray(metadata.images) && metadata.images.length > 0
    ? metadata.images
    : Array.isArray(product.images) && product.images.length > 0
    ? product.images
    : product.image_url
    ? [product.image_url]
    : []

  // Variant groups: dynamic custom variant system with variant-specific images
  const rawVariantGroups = Array.isArray(metadata.variant_groups)
    ? metadata.variant_groups
    : Array.isArray(product.variant_groups)
    ? product.variant_groups
    : []

  const variantGroups = rawVariantGroups.map(group => ({
    ...group,
    options: (group.options || []).map(opt => ({
      ...opt,
      imageUrl: opt.imageUrl || opt.image_url || null,
      image_url: opt.imageUrl || opt.image_url || null,
    })),
  }))

  // Discount configuration
  const discount = metadata.discount || product.discount || null

  return {
    ...product,
    images,
    variantGroups,
    discount,
    specifications: specs,
    customDescription: metadata.description || product.description || '',
    storePolicy: metadata.store_policy || 'Pesanan diproses langsung oleh kasir. Pembayaran dapat dilakukan secara online atau tunai di kasir.',
  }
}

export function hasRequiredVariants(product) {
  const meta = parseProductMetadata(product)
  if (!meta || !meta.variantGroups || meta.variantGroups.length === 0) return false
  return meta.variantGroups.some(g => Array.isArray(g.options) && g.options.length > 0)
}

export function calculateProductPrice(basePrice, selectedVariantOptions = [], discount = null) {
  const base = Number(basePrice) || 0
  const variantSum = (selectedVariantOptions || []).reduce((acc, opt) => {
    return acc + (Number(opt?.price_adjustment) || 0)
  }, 0)

  const originalPrice = base + variantSum

  if (!discount || discount.is_active === false || discount.is_published === false) {
    return {
      finalPrice: originalPrice,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      isDiscounted: false,
    }
  }

  const now = new Date()
  if (discount.start_at && new Date(discount.start_at) > now) {
    return {
      finalPrice: originalPrice,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      isDiscounted: false,
    }
  }

  if (discount.end_at && new Date(discount.end_at) < now) {
    return {
      finalPrice: originalPrice,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      isDiscounted: false,
    }
  }

  let finalPrice = originalPrice
  let discountPercent = 0
  let discountAmount = 0

  if (discount.discount_type === 'percentage') {
    discountPercent = Number(discount.discount_value) || 0
    discountAmount = Math.round((originalPrice * discountPercent) / 100)
    finalPrice = Math.max(0, originalPrice - discountAmount)
  } else if (discount.discount_type === 'fixed') {
    discountAmount = Number(discount.discount_value) || 0
    finalPrice = Math.max(0, originalPrice - discountAmount)
    discountPercent = originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0
  }

  return {
    finalPrice: Math.round(finalPrice),
    originalPrice,
    discountPercent,
    discountAmount,
    isDiscounted: finalPrice < originalPrice,
  }
}
