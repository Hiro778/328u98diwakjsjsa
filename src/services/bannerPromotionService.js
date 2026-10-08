// src/services/bannerPromotionService.js
// Dedicated calculation, validation, and resolution service for Banner Promotional Prices / Discounts
// Display-only promotion mechanism: strictly preserves canonical product prices in the database.

import { formatCurrency } from '../lib/orderNumber.js'

/**
 * Validates promotional discount configuration.
 *
 * Rules:
 * - discount >= 0
 * - percentage <= 100
 * - fixed discount <= base price
 * - promotional price cannot be negative
 * - promotional price cannot exceed base price
 * - currency uses existing BisnisSehat IDR formatting
 * - prevent NaN / Infinity
 * - handle zero-priced products correctly
 *
 * @param {object} params
 * @param {number} params.basePrice
 * @param {'percentage' | 'fixed'} params.discountType
 * @param {number} params.discountValue
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validatePromotion({ basePrice, discountType, discountValue }) {
  const price = Number(basePrice)
  if (isNaN(price) || price < 0 || !isFinite(price)) {
    return { valid: false, error: 'Harga normal tidak valid' }
  }

  const val = Number(discountValue)
  if (isNaN(val) || !isFinite(val)) {
    return { valid: false, error: 'Nilai diskon harus berupa angka' }
  }

  if (val < 0) {
    return { valid: false, error: 'Nilai diskon tidak boleh negatif' }
  }

  if (discountType === 'percentage') {
    if (val > 100) {
      return { valid: false, error: 'Diskon persentase tidak boleh melebihi 100%' }
    }
  } else if (discountType === 'fixed') {
    if (val > price) {
      return { valid: false, error: 'Potongan harga tidak boleh melebihi harga normal' }
    }
  } else {
    return { valid: false, error: 'Jenis diskon tidak valid (harus persentase atau nominal)' }
  }

  return { valid: true, error: null }
}

/**
 * Calculates promotional price from base price and discount config.
 *
 * Formula:
 * - percentage: promo_price = base_price - (base_price * discount_percent / 100)
 * - fixed: promo_price = base_price - discount_amount
 *
 * Rounded using standard currency convention (Math.round).
 * Handles zero-priced products, clamps boundaries [0, basePrice], and guards against NaN / Infinity.
 *
 * @param {object} params
 * @param {number} params.basePrice
 * @param {'percentage' | 'fixed'} params.discountType
 * @param {number} params.discountValue
 * @returns {number} promo_price
 */
export function calculatePromoPrice({ basePrice, discountType, discountValue }) {
  const price = Number(basePrice)
  if (isNaN(price) || price <= 0 || !isFinite(price)) {
    return 0
  }

  const val = Number(discountValue)
  if (isNaN(val) || val <= 0 || !isFinite(val)) {
    return Math.round(price)
  }

  let promoPrice = price

  if (discountType === 'percentage') {
    const percent = Math.max(0, Math.min(100, val))
    promoPrice = price - (price * percent) / 100
  } else if (discountType === 'fixed') {
    const amount = Math.max(0, Math.min(price, val))
    promoPrice = price - amount
  }

  promoPrice = Math.round(promoPrice)

  if (promoPrice < 0) promoPrice = 0
  if (promoPrice > price) promoPrice = Math.round(price)

  return isNaN(promoPrice) || !isFinite(promoPrice) ? 0 : promoPrice
}

/**
 * Generates badge label for discount, e.g. "20% OFF" or "Rp5.000 OFF".
 *
 * @param {object} params
 * @param {'percentage' | 'fixed'} params.discountType
 * @param {number} params.discountValue
 * @returns {string}
 */
export function formatPromoDiscountBadge({ discountType, discountValue }) {
  const val = Number(discountValue)
  if (!val || isNaN(val) || val <= 0) return ''

  if (discountType === 'percentage') {
    const pct = Math.round(Math.min(100, Math.max(0, val)))
    return `${pct}% OFF`
  }

  if (discountType === 'fixed') {
    const amt = Math.round(val)
    return `${formatCurrency(amt)} OFF`
  }

  return ''
}

/**
 * Resolves full promotional details for a banner against the current products list.
 *
 * Dynamic resolution:
 * - Uses current product.unit_price from the products list (if product price changed after creation)
 * - Gracefully returns null if product is deleted or not found
 * - Handles disabled promotion / legacy banners without promotion
 *
 * @param {object} banner
 * @param {Array<object>} products
 * @returns {object|null}
 */
export function resolveBannerPromotion(banner, products = []) {
  if (!banner) return null

  // Extract target ID from target or ctaTarget or ctaUrl
  const targetId =
    banner.targetId ||
    banner.target?.id ||
    banner.ctaTarget?.id ||
    banner.ctaTarget?.productId ||
    (banner.targetType === 'product' && banner.ctaUrl
      ? banner.ctaUrl.replace(/^#product-/, '').replace(/.*\/product\//, '')
      : null)

  if (!targetId) return null

  const product = Array.isArray(products)
    ? products.find((p) => p && String(p.id) === String(targetId))
    : null

  // Graceful fallback if product is deleted
  if (!product) return null

  const basePrice = Number(product.unit_price ?? product.price ?? 0)

  // Check promotion config
  const promoConfig = banner.promotion || banner.target?.promotion || banner.ctaTarget?.promotion
  const isEnabled = Boolean(promoConfig?.enabled)

  if (!isEnabled) {
    return {
      enabled: false,
      product,
      basePrice,
      promoPrice: basePrice,
      discountType: null,
      discountValue: 0,
      discountBadge: '',
    }
  }

  const discountType = promoConfig.discount_type || 'percentage'
  const discountValue = Number(promoConfig.discount_value ?? 0)

  const promoPrice = calculatePromoPrice({
    basePrice,
    discountType,
    discountValue,
  })

  const discountBadge = formatPromoDiscountBadge({
    discountType,
    discountValue,
  })

  return {
    enabled: true,
    product,
    basePrice,
    promoPrice,
    discountType,
    discountValue,
    discountBadge,
  }
}
