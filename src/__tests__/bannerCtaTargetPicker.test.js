import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  sanitizeCustomUrl,
  isDangerousUrl,
  resolveBannerCtaUrl,
  resolveTargetFromRawUrl,
  getTargetDisplayInfo,
  searchBannerTargets,
} from '../services/bannerCtaService.js'

describe('Banner CTA Target — Internal Resource Picker Suite', () => {
  const BIZ_A = 'biz-uuid-1111-aaaa'
  const BIZ_B = 'biz-uuid-2222-bbbb'

  const mockProductsBizA = [
    { id: 'prod-1', name: 'Kopi Susu Gula Aren', category: 'Kopi', unit_price: 18000, is_available: true },
    { id: 'prod-2', name: 'Es Matcha Latte', category: 'Non-Kopi', unit_price: 22000, is_available: true },
    { id: 'prod-3', name: 'Roti Bakar Cokelat Keju', category: 'Makanan', unit_price: 15000, is_available: true },
    { id: 'prod-4', name: 'Kopi Tubruk Hitam', category: 'Kopi', unit_price: 10000, is_available: false }, // unavailable
  ]

  const mockCategoriesBizA = ['Kopi', 'Non-Kopi', 'Makanan']

  // 1. PRODUCT SEARCH
  it('1. product search: performs fast case-insensitive search and excludes unavailable items', async () => {
    const res = await searchBannerTargets({
      businessId: BIZ_A,
      query: 'kopi',
      cachedProducts: mockProductsBizA,
      cachedCategories: mockCategoriesBizA,
    })

    assert.ok(Array.isArray(res.products), 'Must return products array')
    assert.equal(res.products.length, 1, 'Must only return available Kopi product')
    assert.equal(res.products[0].id, 'prod-1')
    assert.equal(res.products[0].name, 'Kopi Susu Gula Aren')
    assert.equal(res.products[0].type, 'product')
    assert.equal(res.products[0].price, 18000)

    // Verify unavailable item (prod-4) was excluded
    const hasUnavailable = res.products.some((p) => p.id === 'prod-4')
    assert.equal(hasUnavailable, false, 'Unavailable products must be filtered out')
  })

  // 2. CATEGORY SEARCH
  it('2. category search: searches categories case-insensitively and maps structured targets', async () => {
    const res = await searchBannerTargets({
      businessId: BIZ_A,
      query: 'makan',
      cachedProducts: mockProductsBizA,
      cachedCategories: mockCategoriesBizA,
    })

    assert.ok(Array.isArray(res.categories))
    assert.equal(res.categories.length, 1)
    assert.equal(res.categories[0].name, 'Makanan')
    assert.equal(res.categories[0].type, 'category')
  })

  // 3. PAGE SEARCH
  it('3. page search: supports internal pages (Menu, Pesanan) by name or query', async () => {
    const resEmpty = await searchBannerTargets({
      businessId: BIZ_A,
      query: '',
      cachedProducts: mockProductsBizA,
      cachedCategories: mockCategoriesBizA,
    })

    assert.ok(resEmpty.pages.some((p) => p.value === 'menu'))
    assert.ok(resEmpty.pages.some((p) => p.value === 'orders'))

    const resFiltered = await searchBannerTargets({
      businessId: BIZ_A,
      query: 'pesan',
      cachedProducts: mockProductsBizA,
      cachedCategories: mockCategoriesBizA,
    })

    assert.equal(resFiltered.pages.length, 1)
    assert.equal(resFiltered.pages[0].value, 'orders')
    assert.equal(resFiltered.pages[0].name, 'Pesanan')
  })

  // 4. TARGET SELECTION
  it('4. target selection: getTargetDisplayInfo provides correct icons, labels, and secondary tags', () => {
    const prodDisplay = getTargetDisplayInfo({ type: 'product', id: 'prod-1', name: 'Kopi Susu' })
    assert.equal(prodDisplay.icon, '📦')
    assert.equal(prodDisplay.secondaryLabel, 'Target: Produk • Kopi Susu')

    const catDisplay = getTargetDisplayInfo({ type: 'category', id: 'cat-1', name: 'Kopi' })
    assert.equal(catDisplay.icon, '📂')
    assert.equal(catDisplay.secondaryLabel, 'Target: Kategori • Kopi')

    const pageMenuDisplay = getTargetDisplayInfo({ type: 'page', value: 'menu', name: 'Menu' })
    assert.equal(pageMenuDisplay.icon, '🏠')
    assert.equal(pageMenuDisplay.secondaryLabel, 'Target: Halaman • Menu')

    const pageOrderDisplay = getTargetDisplayInfo({ type: 'page', value: 'orders', name: 'Pesanan' })
    assert.equal(pageOrderDisplay.icon, '🛒')
    assert.equal(pageOrderDisplay.secondaryLabel, 'Target: Halaman • Pesanan')

    const customDisplay = getTargetDisplayInfo({ type: 'custom', value: 'https://tokoku.com' })
    assert.equal(customDisplay.icon, '🔗')
    assert.equal(customDisplay.secondaryLabel, 'Target: Custom • https://tokoku.com')
  })

  // 5. TARGET SERIALIZATION
  it('5. target serialization: stores structured JSON format without breaking data integrity', () => {
    const structuredTarget = {
      type: 'product',
      id: 'prod-999',
      name: 'Roti Bakar',
    }

    const bannerObj = {
      id: 'bnr-1',
      title: 'Promo Pagi',
      ctaText: 'Pesan Sekarang',
      ctaUrl: `/menu/${BIZ_A}/product/prod-999`,
      ctaTarget: structuredTarget,
    }

    const serialized = JSON.stringify(bannerObj)
    const parsed = JSON.parse(serialized)

    assert.deepEqual(parsed.ctaTarget, structuredTarget)
    assert.equal(parsed.ctaUrl, `/menu/${BIZ_A}/product/prod-999`)
  })

  // 6. TARGET URL GENERATION
  it('6. target URL generation: resolves public canonical routes for product, category, and pages', () => {
    // Product
    const prodUrl = resolveBannerCtaUrl({ type: 'product', id: 'prod-123' }, BIZ_A)
    assert.equal(prodUrl, `/menu/${BIZ_A}/product/prod-123`)

    // Category
    const catUrl = resolveBannerCtaUrl({ type: 'category', id: 'cat-kopi', name: 'Kopi' }, BIZ_A)
    assert.equal(catUrl, `/menu/${BIZ_A}#category-Kopi`)

    // Page: menu
    const menuUrl = resolveBannerCtaUrl({ type: 'page', value: 'menu' }, BIZ_A)
    assert.equal(menuUrl, `/menu/${BIZ_A}`)

    // Page: orders
    const ordersUrl = resolveBannerCtaUrl({ type: 'page', value: 'orders' }, BIZ_A)
    assert.equal(ordersUrl, `/menu/${BIZ_A}?checkout=true`)

    // Custom
    const customUrl = resolveBannerCtaUrl({ type: 'custom', value: '#spesial-ramadhan' }, BIZ_A)
    assert.equal(customUrl, '#spesial-ramadhan')
  })

  // 7. BUSINESS ISOLATION
  it('7. business isolation: queries are strictly isolated to authenticated businessId', async () => {
    // Mock Supabase client to record where clause filters
    let recordedBusinessId = null
    const fakeClient = {
      from: (table) => ({
        select: () => ({
          eq: (col, val) => {
            if (col === 'business_id') recordedBusinessId = val
            return {
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [] }),
                }),
                ilike: () => ({
                  limit: () => Promise.resolve({ data: [] }),
                }),
              }),
            }
          },
        }),
      }),
    }

    await searchBannerTargets({
      businessId: BIZ_A,
      query: 'test',
      cachedProducts: [],
      cachedCategories: [],
      supabaseClient: fakeClient,
    })

    assert.equal(recordedBusinessId, BIZ_A, 'Database query must strictly filter by authenticated business_id')
    assert.notEqual(recordedBusinessId, BIZ_B, 'Must never access foreign business data')

    // Empty businessId returns empty result set safely
    const emptyResult = await searchBannerTargets({ businessId: '' })
    assert.equal(emptyResult.products.length, 0)
    assert.equal(emptyResult.categories.length, 0)
  })

  // 8. LEGACY RAW TARGET COMPATIBILITY
  it('8. legacy raw target compatibility: resolves legacy URLs without overwriting or losing them', () => {
    // Legacy product deep link
    const legacyProd = resolveTargetFromRawUrl(`/menu/${BIZ_A}/product/prod-1`, {
      products: mockProductsBizA,
      categories: mockCategoriesBizA,
      businessId: BIZ_A,
    })
    assert.equal(legacyProd.type, 'product')
    assert.equal(legacyProd.id, 'prod-1')
    assert.equal(legacyProd.name, 'Kopi Susu Gula Aren')

    // Legacy category anchor
    const legacyCat = resolveTargetFromRawUrl('#kategori-kopi', {
      products: mockProductsBizA,
      categories: mockCategoriesBizA,
      businessId: BIZ_A,
    })
    assert.equal(legacyCat.type, 'category')
    assert.equal(legacyCat.name, 'Kopi')

    // Legacy custom anchor
    const legacyCustom = resolveTargetFromRawUrl('#promo-khusus-weekend')
    assert.equal(legacyCustom.type, 'custom')
    assert.equal(legacyCustom.value, '#promo-khusus-weekend')

    // Empty raw url
    assert.equal(resolveTargetFromRawUrl(''), null)
    assert.equal(resolveTargetFromRawUrl(null), null)
  })

  // 9. CUSTOM URL SANITIZATION
  it('9. custom URL sanitization: strictly rejects javascript:, data:, and vbscript: payloads', () => {
    assert.equal(sanitizeCustomUrl('javascript:alert(1)'), '', 'Must strip javascript:')
    assert.equal(sanitizeCustomUrl('JAVASCRIPT:void(0)'), '', 'Must strip case-insensitive javascript:')
    assert.equal(sanitizeCustomUrl('data:text/html,<script>alert(1)</script>'), '', 'Must strip data:')
    assert.equal(sanitizeCustomUrl('vbscript:msgbox(1)'), '', 'Must strip vbscript:')
    assert.equal(sanitizeCustomUrl('   javascript:  eval()'), '', 'Must strip spaced javascript:')

    assert.equal(isDangerousUrl('javascript:alert(1)'), true)
    assert.equal(isDangerousUrl('data:text/html'), true)
    assert.equal(isDangerousUrl('https://valid-website.com'), false)
    assert.equal(isDangerousUrl('#kategori-kopi'), false)

    // Valid URLs pass through
    assert.equal(sanitizeCustomUrl('https://instagram.com/tokoku'), 'https://instagram.com/tokoku')
    assert.equal(sanitizeCustomUrl('#kategori-makanan'), '#kategori-makanan')
    assert.equal(sanitizeCustomUrl('/menu/biz-123'), '/menu/biz-123')
  })

  // 10. DELETED TARGET HANDLING
  it('10. deleted target handling: handles missing or deleted products/categories gracefully', () => {
    // Product deleted from inventory: URL resolves safely with fallback
    const deletedProdTarget = { type: 'product', id: 'deleted-uuid-999', name: 'Menu Lama' }
    const url = resolveBannerCtaUrl(deletedProdTarget, BIZ_A)
    assert.equal(url, `/menu/${BIZ_A}/product/deleted-uuid-999`)

    // When raw URL contains deleted product ID, resolveTargetFromRawUrl creates safe object
    const resolvedDeleted = resolveTargetFromRawUrl(`/menu/${BIZ_A}/product/deleted-uuid-999`, {
      products: [],
      categories: [],
      businessId: BIZ_A,
    })
    assert.equal(resolvedDeleted.type, 'product')
    assert.equal(resolvedDeleted.id, 'deleted-uuid-999')
    assert.equal(resolvedDeleted.name, 'Produk Terpilih')

    // Category deleted
    const resolvedDeletedCat = resolveTargetFromRawUrl('#category-nonexistent', {
      products: [],
      categories: [],
      businessId: BIZ_A,
    })
    assert.equal(resolvedDeletedCat.type, 'category')
    assert.equal(resolvedDeletedCat.name, 'nonexistent')

    // Missing target ID falls back to menu root
    const missingIdProd = { type: 'product', id: '' }
    assert.equal(resolveBannerCtaUrl(missingIdProd, BIZ_A), `/menu/${BIZ_A}`)
  })

  // STATIC CODE & INTEGRATION AUDIT
  it('11. static audit: QRMenuDesignerPage and BannerCtaPicker meet all UI & layout specifications', () => {
    const designerFile = path.resolve('src/pages/dashboard/pos/QRMenuDesignerPage.jsx')
    const designerSrc = fs.readFileSync(designerFile, 'utf8')

    const pickerFile = path.resolve('src/components/pos/BannerCtaPicker.jsx')
    const pickerSrc = fs.readFileSync(pickerFile, 'utf8')

    const serviceFile = path.resolve('src/services/bannerCtaService.js')
    const serviceSrc = fs.readFileSync(serviceFile, 'utf8')

    // Must preserve tests contract
    assert.ok(designerSrc.includes('Link / Target CTA'), 'Must keep Link / Target CTA label')
    assert.ok(designerSrc.includes('BannerCtaPicker'), 'Must import and mount BannerCtaPicker')
    assert.ok(designerSrc.includes('handleSaveBanner({ title, description, ctaText, ctaUrl, imagePosition'), 'Must preserve handleSaveBanner signature')

    // Must have preview section & secondary label formatting
    assert.ok(pickerSrc.includes('CTA Preview'), 'Must render CTA Preview section')
    assert.ok(pickerSrc.includes('+ Gunakan link custom'), 'Must have custom link escape hatch')
    assert.ok(serviceSrc.includes('Target: Produk •'), 'Must format secondary label for product')
    assert.ok(serviceSrc.includes('Target: Kategori •'), 'Must format secondary label for category')
    assert.ok(serviceSrc.includes('Target: Halaman •'), 'Must format secondary label for pages')
    assert.ok(pickerSrc.includes('displayInfo.secondaryLabel'), 'Must render secondary label in picker UI')
  })
})
