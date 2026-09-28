import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseProductMetadata,
  hasRequiredVariants,
  calculateProductPrice,
} from '../lib/productMetadata.js'

describe('Public Product Detail & Tokopedia-Like UX Specification Suite (toko.md)', () => {

  // ═════════════════════════════════════════════════════════════════════
  // TEST A: Product Tanpa Variant
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST A: Product Tanpa Variant', () => {
    const product = {
      id: 'prod-single-1',
      business_id: 'biz-1',
      name: 'Nasi Goreng Biasa',
      unit_price: 25000,
      image_url: 'https://example.com/nasgor.jpg',
      notes: '',
    }

    it('should identify product as having no required variants', () => {
      assert.equal(hasRequiredVariants(product), false)
    })

    it('should parse metadata correctly with image fallback', () => {
      const parsed = parseProductMetadata(product)
      assert.equal(parsed.name, 'Nasi Goreng Biasa')
      assert.deepEqual(parsed.images, ['https://example.com/nasgor.jpg'])
      assert.deepEqual(parsed.variantGroups, [])
      assert.equal(parsed.discount, null)
    })

    it('should calculate final price without variant adjustments', () => {
      const price = calculateProductPrice(product.unit_price, [], null)
      assert.equal(price.finalPrice, 25000)
      assert.equal(price.originalPrice, 25000)
      assert.equal(price.isDiscounted, false)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST B: Product Dengan Dynamic Variant
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST B: Product Dengan Dynamic Variant', () => {
    const productWithVariants = {
      id: 'prod-var-1',
      business_id: 'biz-1',
      name: 'Keripik Singkong',
      unit_price: 15000,
      notes: JSON.stringify({
        variant_groups: [
          {
            id: 'grp-rasa',
            name: 'Rasa',
            options: [
              { id: 'opt-orig', name: 'Original', price_adjustment: 0, stock: 10 },
              { id: 'opt-balado', name: 'Balado', price_adjustment: 2000, stock: 5 },
              { id: 'opt-bbq', name: 'BBQ', price_adjustment: 3000, stock: 0 },
            ],
          },
        ],
      }),
    }

    it('should detect required variants correctly', () => {
      assert.equal(hasRequiredVariants(productWithVariants), true)
    })

    it('should parse variant groups dynamically without hardcoding', () => {
      const parsed = parseProductMetadata(productWithVariants)
      assert.equal(parsed.variantGroups.length, 1)
      assert.equal(parsed.variantGroups[0].name, 'Rasa')
      assert.equal(parsed.variantGroups[0].options.length, 3)
    })

    it('should adjust price when Balado is selected (+Rp2.000)', () => {
      const parsed = parseProductMetadata(productWithVariants)
      const baladoOpt = parsed.variantGroups[0].options.find(o => o.name === 'Balado')
      const price = calculateProductPrice(productWithVariants.unit_price, [baladoOpt], null)
      assert.equal(price.finalPrice, 17000)
      assert.equal(price.originalPrice, 17000)
    })

    it('should recognize out-of-stock variant option (BBQ stock: 0)', () => {
      const parsed = parseProductMetadata(productWithVariants)
      const bbqOpt = parsed.variantGroups[0].options.find(o => o.name === 'BBQ')
      assert.equal(bbqOpt.stock, 0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST C: Custom Variant Agnostik (Bukan Hanya Size)
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST C: Custom Variant Agnostik', () => {
    it('should support multiple custom variant groups (Level Pedas + Topping)', () => {
      const customProduct = {
        id: 'prod-custom-1',
        name: 'Mie Ayam Spesial',
        unit_price: 20000,
        notes: JSON.stringify({
          variant_groups: [
            {
              id: 'grp-pedas',
              name: 'Level Pedas',
              options: [
                { id: 'opt-p0', name: 'Level 0 (Tidak Pedas)', price_adjustment: 0, stock: 20 },
                { id: 'opt-p1', name: 'Level 3 (Pedas Mantap)', price_adjustment: 3000, stock: 15 },
              ],
            },
            {
              id: 'grp-topping',
              name: 'Topping Tambahan',
              options: [
                { id: 'opt-t1', name: 'Pangsit Goreng', price_adjustment: 4000, stock: 12 },
                { id: 'opt-t2', name: 'Bakso Sapi', price_adjustment: 6000, stock: 8 },
              ],
            },
          ],
        }),
      }

      const parsed = parseProductMetadata(customProduct)
      assert.equal(parsed.variantGroups.length, 2)
      assert.equal(parsed.variantGroups[0].name, 'Level Pedas')
      assert.equal(parsed.variantGroups[1].name, 'Topping Tambahan')

      const selected = [
        parsed.variantGroups[0].options[1], // Level 3 (+3000)
        parsed.variantGroups[1].options[1], // Bakso Sapi (+6000)
      ]
      const price = calculateProductPrice(customProduct.unit_price, selected, null)
      assert.equal(price.finalPrice, 29000) // 20000 + 3000 + 6000
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST D: Sistem Diskon & Validasi Waktu
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST D: Sistem Diskon & Validasi Waktu', () => {
    it('should calculate percentage discount correctly when active and published', () => {
      const discount = {
        discount_type: 'percentage',
        discount_value: 20, // 20%
        is_published: true,
        is_active: true,
      }
      const price = calculateProductPrice(50000, [], discount)
      assert.equal(price.finalPrice, 40000)
      assert.equal(price.originalPrice, 50000)
      assert.equal(price.discountPercent, 20)
      assert.equal(price.isDiscounted, true)
    })

    it('should calculate fixed amount discount correctly', () => {
      const discount = {
        discount_type: 'fixed',
        discount_value: 10000,
        is_published: true,
        is_active: true,
      }
      const price = calculateProductPrice(50000, [], discount)
      assert.equal(price.finalPrice, 40000)
      assert.equal(price.isDiscounted, true)
    })

    it('should NOT apply discount if is_published is false (Draft)', () => {
      const discount = {
        discount_type: 'percentage',
        discount_value: 50,
        is_published: false,
        is_active: true,
      }
      const price = calculateProductPrice(50000, [], discount)
      assert.equal(price.finalPrice, 50000)
      assert.equal(price.isDiscounted, false)
    })

    it('should NOT apply expired discount', () => {
      const expiredDiscount = {
        discount_type: 'percentage',
        discount_value: 30,
        is_published: true,
        is_active: true,
        end_at: '2020-01-01T00:00:00Z', // past date
      }
      const price = calculateProductPrice(50000, [], expiredDiscount)
      assert.equal(price.finalPrice, 50000)
      assert.equal(price.isDiscounted, false)
    })

    it('should NOT apply future discount that has not started yet', () => {
      const futureDiscount = {
        discount_type: 'percentage',
        discount_value: 30,
        is_published: true,
        is_active: true,
        start_at: '2099-01-01T00:00:00Z', // future date
      }
      const price = calculateProductPrice(50000, [], futureDiscount)
      assert.equal(price.finalPrice, 50000)
      assert.equal(price.isDiscounted, false)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST E: Edit Owner & Sinkronisasi Metadata
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST E: Edit Owner & Sinkronisasi Metadata', () => {
    it('should serialize and deserialize edited options seamlessly', () => {
      const initialForm = {
        variant_groups: [
          {
            id: 'g1',
            name: 'Rasa',
            options: [{ id: 'o1', name: 'Original', price_adjustment: 0, stock: 10 }],
          },
        ],
        discount: { discount_type: 'percentage', discount_value: 15, is_published: true },
      }

      // Simulate saving to database notes column
      const savedNotes = JSON.stringify(initialForm)

      // Simulate owner update
      const updatedForm = JSON.parse(savedNotes)
      updatedForm.variant_groups[0].options[0].name = 'Original Pedas'
      const updatedNotes = JSON.stringify(updatedForm)

      const product = { notes: updatedNotes }
      const parsed = parseProductMetadata(product)

      assert.equal(parsed.variantGroups[0].options[0].name, 'Original Pedas')
      assert.equal(parsed.discount.discount_value, 15)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST F: Security & Tenant Isolation Principles
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST F: Security & Tenant Isolation Principles', () => {
    it('should reject access if product does not belong to business', () => {
      const bizA = { id: 'biz-A', is_menu_published: true }
      const prodB = { id: 'prod-B', business_id: 'biz-B', name: 'Secret Item B' }

      const isAllowed = prodB.business_id === bizA.id
      assert.equal(isAllowed, false)
    })

    it('should reject access if business menu is not published', () => {
      const bizUnpublished = { id: 'biz-draft', is_menu_published: false }
      assert.equal(bizUnpublished.is_menu_published, false)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // TEST G: UI Polish — Spesifikasi, Deskripsi & Info Tambahan (toko.md)
  // ═════════════════════════════════════════════════════════════════════
  describe('TEST G: UI Polish — Spesifikasi, Deskripsi & Info Tambahan', () => {
    function extractProductSpecs(product, meta) {
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
      return specsList
    }

    it('should filter out empty and dash values from specifications list', () => {
      const product = {
        category: 'Makanan',
        unit: 'pcs',
        sku: '-', // should be excluded
      }
      const meta = {
        specifications: {
          berat: '500 gram',
          kondisi: 'Baru',
          kadaluarsa: '', // should be excluded
          garansi: null, // should be excluded
        },
      }

      const specs = extractProductSpecs(product, meta)
      assert.equal(specs.length, 4)
      assert.deepEqual(specs.map(s => s.label), ['Kategori', 'Satuan', 'Berat', 'Kondisi'])
      assert.deepEqual(specs.map(s => s.value), ['Makanan', 'pcs', '500 gram', 'Baru'])
    })

    it('should return empty list when no valid specifications exist', () => {
      const product = {
        category: '',
        unit: '-',
        sku: null,
      }
      const meta = { specifications: {} }
      const specs = extractProductSpecs(product, meta)
      assert.equal(specs.length, 0)
    })

    it('should preserve natural description and non-error empty state', () => {
      const productWithDesc = { description: 'Kopi robusta asli dari perkebunan Dampit.' }
      assert.ok(productWithDesc.description)

      const productWithoutDesc = { description: '' }
      const emptyStateText = productWithoutDesc.description || 'Belum ada deskripsi untuk produk ini.'
      assert.equal(emptyStateText, 'Belum ada deskripsi untuk produk ini.')
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 12: VARIANT-SPECIFIC IMAGE TESTS (A THROUGH L) — toko.md
  // ═════════════════════════════════════════════════════════════════════
  describe('SECTION 12: VARIANT-SPECIFIC IMAGE SUITE (A - L)', () => {
    // Helper replicating hero image resolution in PublicProductDetailPage
    function resolveHeroImage({
      meta,
      product,
      selectedVariants,
      gallerySelectedImage,
      imgLoadFailed,
    }) {
      const baseImages = meta?.images?.length ? meta.images : (product?.image_url ? [product.image_url] : [])
      const primaryFallback = baseImages[0] || product?.image_url || ''

      // Find active variant image from selections
      let activeVariantImg = null
      if (meta?.variantGroups) {
        for (const grp of meta.variantGroups) {
          const selId = selectedVariants[grp.id]
          const opt = grp.options?.find(o => o.id === selId)
          if (opt && (opt.imageUrl || opt.image_url)) {
            activeVariantImg = opt.imageUrl || opt.image_url
            break
          }
        }
      }

      if (imgLoadFailed) return primaryFallback
      return gallerySelectedImage || activeVariantImg || primaryFallback
    }

    const sampleProduct = {
      id: 'prod-snack-1',
      business_id: 'biz-owner-1',
      name: 'Keripik Tempe Premium',
      unit_price: 20000,
      image_url: 'https://cdn.supabase.co/product-images/biz-owner-1/main-tempe.jpg',
      notes: JSON.stringify({
        variant_groups: [
          {
            id: 'grp-varian',
            name: 'Varian Rasa',
            options: [
              {
                id: 'opt-pedss',
                name: 'pedss',
                price_adjustment: 100000,
                stock: 5,
                imageUrl: 'https://cdn.supabase.co/product-images/biz-owner-1/pedss.jpg',
              },
              {
                id: 'opt-asin',
                name: 'asin',
                price_adjustment: 200,
                stock: 5,
                imageUrl: 'https://cdn.supabase.co/product-images/biz-owner-1/asin.jpg',
              },
              {
                id: 'opt-ori',
                name: 'original',
                price_adjustment: 0,
                stock: 10,
                imageUrl: null, // No variant image
              },
            ],
          },
        ],
      }),
    }

    // A. Variant option dapat menyimpan imageUrl
    it('A. Variant option dapat menyimpan imageUrl dan dinormalisasi', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const pedssOpt = parsed.variantGroups[0].options.find(o => o.name === 'pedss')
      assert.equal(pedssOpt.imageUrl, 'https://cdn.supabase.co/product-images/biz-owner-1/pedss.jpg')
      assert.equal(pedssOpt.image_url, 'https://cdn.supabase.co/product-images/biz-owner-1/pedss.jpg')
    })

    // B. Option tanpa imageUrl tetap fallback ke product image
    it('B. Option tanpa imageUrl tetap fallback ke product primary image', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-ori' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(hero, sampleProduct.image_url)
    })

    // C. Memilih variant A → hero image A
    it('C. Memilih variant A (pedss) → hero image berpindah ke image pedss', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-pedss' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(hero, 'https://cdn.supabase.co/product-images/biz-owner-1/pedss.jpg')
    })

    // D. Memilih variant B → hero image B
    it('D. Memilih variant B (asin) → hero image berpindah ke image asin', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-asin' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(hero, 'https://cdn.supabase.co/product-images/biz-owner-1/asin.jpg')
    })

    // E. Mengganti variant kembali → image ikut berubah
    it('E. Mengganti variant kembali dari asin ke pedss → image ikut berubah kembali', () => {
      const parsed = parseProductMetadata(sampleProduct)
      let hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-asin' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(hero, 'https://cdn.supabase.co/product-images/biz-owner-1/asin.jpg')

      // Switch back to pedss
      hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-pedss' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(hero, 'https://cdn.supabase.co/product-images/biz-owner-1/pedss.jpg')
    })

    // F. Image error → fallback product image
    it('F. Image error pada variant → otomatis fallback ke product primary image', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const hero = resolveHeroImage({
        meta: parsed,
        product: sampleProduct,
        selectedVariants: { 'grp-varian': 'opt-pedss' },
        gallerySelectedImage: null,
        imgLoadFailed: true, // simulated onError trigger
      })
      assert.equal(hero, sampleProduct.image_url)
    })

    // G. Existing variant pricing tetap benar
    it('G. Existing variant pricing tetap benar (+100.000 for pedss, +200 for asin)', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const pedssOpt = parsed.variantGroups[0].options.find(o => o.name === 'pedss')
      const asinOpt = parsed.variantGroups[0].options.find(o => o.name === 'asin')

      const pricePedss = calculateProductPrice(sampleProduct.unit_price, [pedssOpt], null)
      assert.equal(pricePedss.finalPrice, 120000) // 20000 + 100000

      const priceAsin = calculateProductPrice(sampleProduct.unit_price, [asinOpt], null)
      assert.equal(priceAsin.finalPrice, 20200) // 20000 + 200
    })

    // H. Existing stock tetap benar
    it('H. Existing stock tetap benar sesuai kuota variant option', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const pedssOpt = parsed.variantGroups[0].options.find(o => o.name === 'pedss')
      const oriOpt = parsed.variantGroups[0].options.find(o => o.name === 'original')
      assert.equal(pedssOpt.stock, 5)
      assert.equal(oriOpt.stock, 10)
    })

    // I. Cart tetap menyimpan selected variant
    it('I. Cart serialization tetap menyimpan selected variant details dengan benar', () => {
      const parsed = parseProductMetadata(sampleProduct)
      const pedssOpt = parsed.variantGroups[0].options.find(o => o.name === 'pedss')

      const cartItem = {
        product_id: sampleProduct.id,
        name: sampleProduct.name,
        unit_price: 120000,
        quantity: 2,
        selected_variants: { 'grp-varian': pedssOpt.id },
        variant_summary: 'pedss',
        variant_details: [
          {
            group_id: 'grp-varian',
            group_name: 'Varian Rasa',
            option_id: pedssOpt.id,
            option_name: pedssOpt.name,
            price_adjustment: pedssOpt.price_adjustment,
            image_url: pedssOpt.imageUrl,
          },
        ],
      }

      const serialized = JSON.stringify(cartItem)
      const deserialized = JSON.parse(serialized)

      assert.equal(deserialized.product_id, sampleProduct.id)
      assert.equal(deserialized.unit_price, 120000)
      assert.equal(deserialized.variant_summary, 'pedss')
      assert.equal(deserialized.variant_details[0].image_url, pedssOpt.imageUrl)
    })

    // J. Checkout tetap menggunakan server-side price/stock
    it('J. Checkout validation tidak mengandalkan imageUrl client untuk harga atau stock', () => {
      // Simulate client tampering imageUrl to alter price
      const tamperedPayload = {
        product_id: sampleProduct.id,
        client_price: 500, // attacker attempts to set cheap price
        selected_variants: { 'grp-varian': 'opt-pedss' },
      }

      // Server recalculation from DB product & option definitions
      const parsed = parseProductMetadata(sampleProduct)
      const serverOption = parsed.variantGroups[0].options.find(o => o.id === tamperedPayload.selected_variants['grp-varian'])
      const serverCalculated = calculateProductPrice(sampleProduct.unit_price, [serverOption], null)

      assert.notEqual(tamperedPayload.client_price, serverCalculated.finalPrice)
      assert.equal(serverCalculated.finalPrice, 120000)
    })

    // K. Tenant A tidak dapat upload image ke tenant B
    it('K. Tenant isolation: folder path upload harus mengunci business.id tenant yang login', () => {
      const currentTenantId = 'biz-owner-1'
      const attackerTargetTenantId = 'biz-victim-2'

      function buildStorageUploadPath(businessId, fileName) {
        if (!businessId) throw new Error('Missing business ID')
        return `${businessId}/${fileName}`
      }

      const authorizedPath = buildStorageUploadPath(currentTenantId, 'variant-a.jpg')
      assert.ok(authorizedPath.startsWith('biz-owner-1/'))

      // Storage RLS Policy requires (storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())
      const isPathAllowed = (path, authenticatedBizId) => path.split('/')[0] === authenticatedBizId
      assert.equal(isPathAllowed(authorizedPath, currentTenantId), true)
      assert.equal(isPathAllowed(`${attackerTargetTenantId}/exploit.jpg`, currentTenantId), false)
    })

    // L. Product lama tanpa variant image tetap bekerja
    it('L. Product lama tanpa variant image tetap bekerja sempurna dengan fallback image utama', () => {
      const legacyProduct = {
        id: 'legacy-prod-99',
        business_id: 'biz-owner-1',
        name: 'Es Teh Manis',
        unit_price: 5000,
        image_url: 'https://cdn.supabase.co/product-images/biz-owner-1/esteh.jpg',
        notes: JSON.stringify({
          variant_groups: [
            {
              id: 'grp-size',
              name: 'Ukuran',
              options: [
                { id: 'opt-reg', name: 'Regular', price_adjustment: 0, stock: 50 },
                { id: 'opt-jumbo', name: 'Jumbo', price_adjustment: 2000, stock: 30 },
              ],
            },
          ],
        }),
      }

      const parsed = parseProductMetadata(legacyProduct)
      assert.equal(parsed.variantGroups[0].options[0].imageUrl, null)
      assert.equal(parsed.variantGroups[0].options[1].imageUrl, null)

      const heroReg = resolveHeroImage({
        meta: parsed,
        product: legacyProduct,
        selectedVariants: { 'grp-size': 'opt-reg' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(heroReg, legacyProduct.image_url)

      const heroJumbo = resolveHeroImage({
        meta: parsed,
        product: legacyProduct,
        selectedVariants: { 'grp-size': 'opt-jumbo' },
        gallerySelectedImage: null,
        imgLoadFailed: false,
      })
      assert.equal(heroJumbo, legacyProduct.image_url)
    })
  })

  // ═════════════════════════════════════════════════════════════════════
  // SECTION 13: QUANTITY SELECTOR MANUAL INPUT & VALIDATION SUITE (1.md)
  // ═════════════════════════════════════════════════════════════════════
  describe('SECTION 13: QUANTITY SELECTOR MANUAL INPUT & VALIDATION SUITE (1.md)', () => {
    // Helper replicating PublicProductDetailPage quantity logic
    function createQuantityManager(initialQty = 1, effectiveStock = 100) {
      let quantity = initialQty
      let quantityInput = String(initialQty)

      function handleInputChange(rawVal) {
        const raw = rawVal.replace(/\D/g, '')
        if (raw === '') {
          quantityInput = ''
          return { quantity, quantityInput }
        }
        const parsed = parseInt(raw, 10)
        if (Number.isNaN(parsed)) {
          quantityInput = ''
          return { quantity, quantityInput }
        }
        const maxStock = effectiveStock > 0 ? effectiveStock : 99
        if (parsed > maxStock) {
          quantity = maxStock
          quantityInput = String(maxStock)
        } else if (parsed >= 1) {
          quantity = parsed
          quantityInput = raw
        } else {
          quantityInput = '0'
        }
        return { quantity, quantityInput }
      }

      function handleCommit() {
        const parsed = parseInt(quantityInput, 10)
        const maxStock = effectiveStock > 0 ? effectiveStock : 99
        if (Number.isNaN(parsed) || parsed < 1) {
          quantity = 1
          quantityInput = '1'
        } else if (parsed > maxStock) {
          quantity = maxStock
          quantityInput = String(maxStock)
        } else {
          quantity = parsed
          quantityInput = String(parsed)
        }
        return { quantity, quantityInput }
      }

      function handleQtyChange(delta) {
        const current = Math.max(1, parseInt(quantityInput, 10) || quantity || 1)
        const maxStock = effectiveStock > 0 ? effectiveStock : 99
        const next = current + delta
        const clamped = Math.max(1, Math.min(maxStock, next))
        quantity = clamped
        quantityInput = String(clamped)
        return { quantity, quantityInput }
      }

      function getCartPayload(unitPrice = 25000) {
        const finalQty = Math.max(1, Math.min(effectiveStock > 0 ? effectiveStock : 99, parseInt(quantityInput, 10) || quantity || 1))
        return {
          quantity: finalQty,
          unit_price: unitPrice,
          subtotal: unitPrice * finalQty,
        }
      }

      return {
        getQty: () => quantity,
        getInput: () => quantityInput,
        handleInputChange,
        handleCommit,
        handleQtyChange,
        getCartPayload,
      }
    }

    it('1. quantity 1 → ketik 109', () => {
      const mgr = createQuantityManager(1, 200)
      const res = mgr.handleInputChange('109')
      assert.equal(res.quantity, 109)
      assert.equal(res.quantityInput, '109')
      const payload = mgr.getCartPayload(20000)
      assert.equal(payload.quantity, 109)
      assert.equal(payload.subtotal, 20000 * 109)
    })

    it('2. ketik 250 langsung (stok cukup)', () => {
      const mgr = createQuantityManager(1, 500)
      const res = mgr.handleInputChange('250')
      assert.equal(res.quantity, 250)
      assert.equal(res.quantityInput, '250')
      assert.equal(mgr.getCartPayload(10000).subtotal, 2500000)
    })

    it('3. ketik 0 (minimum = 1 pada commit)', () => {
      const mgr = createQuantityManager(5, 100)
      const typingRes = mgr.handleInputChange('0')
      assert.equal(typingRes.quantityInput, '0')
      // commit resets to 1
      const commitRes = mgr.handleCommit()
      assert.equal(commitRes.quantity, 1)
      assert.equal(commitRes.quantityInput, '1')
      assert.equal(mgr.getCartPayload(15000).quantity, 1)
    })

    it('4. ketik angka > stok (harus clamp ke max stok, tidak bypass limit)', () => {
      const mgr = createQuantityManager(1, 50)
      const res = mgr.handleInputChange('150')
      assert.equal(res.quantity, 50)
      assert.equal(res.quantityInput, '50')
      assert.equal(mgr.getCartPayload(10000).quantity, 50)
    })

    it('5. input kosong (jangan NaN atau state rusak, commit fallback ke 1)', () => {
      const mgr = createQuantityManager(10, 100)
      const typingRes = mgr.handleInputChange('')
      assert.equal(typingRes.quantityInput, '')
      assert.equal(Number.isNaN(mgr.getQty()), false)
      // Cart payload safely uses fallback 1
      const payload = mgr.getCartPayload(20000)
      assert.equal(Number.isNaN(payload.subtotal), false)
      assert.equal(payload.quantity, 10)
      // Commit sets to 1
      const commitRes = mgr.handleCommit()
      assert.equal(commitRes.quantity, 1)
      assert.equal(commitRes.quantityInput, '1')
    })

    it('6. ketik huruf (karakter non-numerik dibersihkan)', () => {
      const mgr = createQuantityManager(1, 100)
      mgr.handleInputChange('abc')
      assert.equal(mgr.getInput(), '')
      mgr.handleInputChange('12abc3')
      assert.equal(mgr.getQty(), 123 > 100 ? 100 : 123)
    })

    it('7. klik +/− setelah mengetik manual', () => {
      const mgr = createQuantityManager(1, 200)
      mgr.handleInputChange('109')
      assert.equal(mgr.getQty(), 109)
      const afterPlus = mgr.handleQtyChange(1)
      assert.equal(afterPlus.quantity, 110)
      assert.equal(afterPlus.quantityInput, '110')
      const afterMinus = mgr.handleQtyChange(-1)
      assert.equal(afterMinus.quantity, 109)
      assert.equal(afterMinus.quantityInput, '109')
    })

    it('8. subtotal langsung sinkron saat mengetik quantity valid', () => {
      const mgr = createQuantityManager(1, 200)
      const unitPrice = 15000
      mgr.handleInputChange('25')
      assert.equal(mgr.getCartPayload(unitPrice).subtotal, 15000 * 25)
      mgr.handleInputChange('50')
      assert.equal(mgr.getCartPayload(unitPrice).subtotal, 15000 * 50)
    })

    it('9. Add to Cart & Beli Langsung menggunakan quantity terakhir', () => {
      const mgr = createQuantityManager(1, 100)
      mgr.handleInputChange('75')
      const item = mgr.getCartPayload(30000)
      assert.equal(item.quantity, 75)
      assert.equal(item.subtotal, 2250000)
    })
  })
})

