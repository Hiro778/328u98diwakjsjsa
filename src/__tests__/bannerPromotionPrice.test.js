import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePromotion,
  calculatePromoPrice,
  formatPromoDiscountBadge,
  resolveBannerPromotion,
} from '../services/bannerPromotionService.js'

describe('Banner Promotional Price & Discount Specification Suite', () => {
  // ────────────────────────────────────────────────────────────
  // 1. Percentage Discounts
  // ────────────────────────────────────────────────────────────
  describe('1. Percentage Discounts Calculation', () => {
    test('20% discount on Rp20.000 produces Rp16.000', () => {
      const basePrice = 20000
      const discountType = 'percentage'
      const discountValue = 20

      const promoPrice = calculatePromoPrice({ basePrice, discountType, discountValue })
      assert.strictEqual(promoPrice, 16000)

      const badge = formatPromoDiscountBadge({ discountType, discountValue })
      assert.strictEqual(badge, '20% OFF')
    })

    test('50% discount on Rp20.000 produces Rp10.000', () => {
      const basePrice = 20000
      const discountType = 'percentage'
      const discountValue = 50

      const promoPrice = calculatePromoPrice({ basePrice, discountType, discountValue })
      assert.strictEqual(promoPrice, 10000)

      const badge = formatPromoDiscountBadge({ discountType, discountValue })
      assert.strictEqual(badge, '50% OFF')
    })

    test('100% discount on Rp20.000 produces Rp0', () => {
      const basePrice = 20000
      const discountType = 'percentage'
      const discountValue = 100

      const promoPrice = calculatePromoPrice({ basePrice, discountType, discountValue })
      assert.strictEqual(promoPrice, 0)

      const badge = formatPromoDiscountBadge({ discountType, discountValue })
      assert.strictEqual(badge, '100% OFF')
    })

    test('Rounding convention: handles fractional amounts cleanly', () => {
      // 15% off 12.350 = 12.350 - 1.852,5 = 10.497,5 -> rounds to 10.498
      const promoPrice = calculatePromoPrice({
        basePrice: 12350,
        discountType: 'percentage',
        discountValue: 15,
      })
      assert.strictEqual(promoPrice, 10498)
    })
  })

  // ────────────────────────────────────────────────────────────
  // 2. Fixed Nominal Discounts
  // ────────────────────────────────────────────────────────────
  describe('2. Fixed Nominal Discounts Calculation', () => {
    test('fixed Rp5.000 discount on Rp20.000 produces Rp15.000', () => {
      const basePrice = 20000
      const discountType = 'fixed'
      const discountValue = 5000

      const promoPrice = calculatePromoPrice({ basePrice, discountType, discountValue })
      assert.strictEqual(promoPrice, 15000)

      const badge = formatPromoDiscountBadge({ discountType, discountValue })
      assert.ok(badge.includes('5.000') && badge.includes('OFF'))
    })

    test('fixed discount equal to base price produces Rp0', () => {
      const promoPrice = calculatePromoPrice({
        basePrice: 20000,
        discountType: 'fixed',
        discountValue: 20000,
      })
      assert.strictEqual(promoPrice, 0)
    })
  })

  // ────────────────────────────────────────────────────────────
  // 3. Validation & Boundary Guardrails
  // ────────────────────────────────────────────────────────────
  describe('3. Validation & Boundary Enforcement', () => {
    test('discount greater than price is rejected and clamped', () => {
      // Fixed discount greater than price
      const validation = validatePromotion({
        basePrice: 20000,
        discountType: 'fixed',
        discountValue: 25000,
      })
      assert.strictEqual(validation.valid, false)
      assert.ok(validation.error.includes('melebihi'))

      // Calculation clamps promo price to 0 (cannot be negative)
      const clampedPromo = calculatePromoPrice({
        basePrice: 20000,
        discountType: 'fixed',
        discountValue: 25000,
      })
      assert.strictEqual(clampedPromo, 0)
    })

    test('percentage greater than 100% is rejected and clamped', () => {
      const validation = validatePromotion({
        basePrice: 20000,
        discountType: 'percentage',
        discountValue: 120,
      })
      assert.strictEqual(validation.valid, false)
      assert.ok(validation.error.includes('100%'))

      const clampedPromo = calculatePromoPrice({
        basePrice: 20000,
        discountType: 'percentage',
        discountValue: 120,
      })
      assert.strictEqual(clampedPromo, 0)
    })

    test('negative discount is rejected and clamped to base price', () => {
      const validation = validatePromotion({
        basePrice: 20000,
        discountType: 'percentage',
        discountValue: -10,
      })
      assert.strictEqual(validation.valid, false)
      assert.ok(validation.error.includes('negatif'))

      const clampedPromo = calculatePromoPrice({
        basePrice: 20000,
        discountType: 'percentage',
        discountValue: -10,
      })
      assert.strictEqual(clampedPromo, 20000)
    })

    test('zero price product produces Rp0 without NaN or infinity', () => {
      const validation = validatePromotion({
        basePrice: 0,
        discountType: 'percentage',
        discountValue: 20,
      })
      assert.strictEqual(validation.valid, true)

      const promoPrice = calculatePromoPrice({
        basePrice: 0,
        discountType: 'percentage',
        discountValue: 20,
      })
      assert.strictEqual(promoPrice, 0)
      assert.ok(!isNaN(promoPrice))
      assert.ok(isFinite(promoPrice))
    })

    test('handles invalid inputs (NaN, null, undefined) gracefully', () => {
      assert.strictEqual(calculatePromoPrice({ basePrice: null, discountType: 'percentage', discountValue: 20 }), 0)
      assert.strictEqual(calculatePromoPrice({ basePrice: NaN, discountType: 'percentage', discountValue: 20 }), 0)
      assert.strictEqual(calculatePromoPrice({ basePrice: 20000, discountType: 'percentage', discountValue: NaN }), 20000)
      assert.strictEqual(calculatePromoPrice({ basePrice: 20000, discountType: 'percentage', discountValue: null }), 20000)
    })
  })

  // ────────────────────────────────────────────────────────────
  // 4. Banner Promotion Resolution & Lifecycle Tests
  // ────────────────────────────────────────────────────────────
  describe('4. Banner Promotion Resolution & Lifecycle', () => {
    const mockProducts = [
      { id: 'prod-1', name: 'Kopi Susu', unit_price: 20000 },
      { id: 'prod-2', name: 'Roti Bakar', unit_price: 15000 },
      { id: 'prod-free', name: 'Air Putih', unit_price: 0 },
    ]

    test('resolves active promotion for target product', () => {
      const banner = {
        id: 'bnr-1',
        title: 'Promo Spesial Kopi Susu',
        targetType: 'product',
        targetId: 'prod-1',
        promotion: {
          enabled: true,
          discount_type: 'percentage',
          discount_value: 20,
        },
      }

      const res = resolveBannerPromotion(banner, mockProducts)
      assert.ok(res)
      assert.strictEqual(res.enabled, true)
      assert.strictEqual(res.product.id, 'prod-1')
      assert.strictEqual(res.basePrice, 20000)
      assert.strictEqual(res.promoPrice, 16000)
      assert.strictEqual(res.discountBadge, '20% OFF')
    })

    test('disabled promotion returns regular base price without promo discount', () => {
      const banner = {
        id: 'bnr-2',
        title: 'Kopi Susu Favorit',
        targetType: 'product',
        targetId: 'prod-1',
        promotion: {
          enabled: false,
          discount_type: 'percentage',
          discount_value: 20,
        },
      }

      const res = resolveBannerPromotion(banner, mockProducts)
      assert.ok(res)
      assert.strictEqual(res.enabled, false)
      assert.strictEqual(res.basePrice, 20000)
      assert.strictEqual(res.promoPrice, 20000)
      assert.strictEqual(res.discountBadge, '')
    })

    test('legacy banners without promotion return null gracefully', () => {
      const legacyBanner = {
        id: 'bnr-legacy',
        title: 'Banner Lama',
        ctaUrl: 'https://instagram.com/warung',
      }

      const res = resolveBannerPromotion(legacyBanner, mockProducts)
      assert.strictEqual(res, null)
    })

    test('product deleted returns null gracefully without throwing an error', () => {
      const bannerWithDeletedProduct = {
        id: 'bnr-3',
        title: 'Menu yang sudah dihapus',
        targetType: 'product',
        targetId: 'deleted-product-999',
        promotion: {
          enabled: true,
          discount_type: 'percentage',
          discount_value: 50,
        },
      }

      const res = resolveBannerPromotion(bannerWithDeletedProduct, mockProducts)
      assert.strictEqual(res, null)
    })

    test('product price changed after banner creation dynamically recomputes promo price', () => {
      // Originally Kopi Susu was 20.000 (promo: 16.000 with 20% off)
      // Now merchant changed Kopi Susu to 25.000 in database
      const updatedProducts = [
        { id: 'prod-1', name: 'Kopi Susu', unit_price: 25000 },
      ]

      const banner = {
        id: 'bnr-1',
        targetType: 'product',
        targetId: 'prod-1',
        promotion: {
          enabled: true,
          discount_type: 'percentage',
          discount_value: 20,
        },
      }

      const res = resolveBannerPromotion(banner, updatedProducts)
      assert.ok(res)
      assert.strictEqual(res.basePrice, 25000)
      // 25.000 - 20% = 20.000
      assert.strictEqual(res.promoPrice, 20000)
    })
  })
})
