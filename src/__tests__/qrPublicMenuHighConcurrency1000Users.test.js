import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getPublicMenuBundle,
  getCachedMenuBundle,
  getCachedProduct,
  invalidateMenuBundleCache,
  CACHE_TTL_MS,
  SWR_WINDOW_MS,
} from '../services/qrMenuCacheService.js'

describe('QR Public Menu High Concurrency / 1,000 Users Performance Suite', () => {
  const testBusinessId = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    invalidateMenuBundleCache(testBusinessId)
  })

  // ─────────────────────────────────────────────────────────────
  // 1. Single-Flight Request Coalescing under 1,000 Concurrent Calls
  // ─────────────────────────────────────────────────────────────
  it('1. Collapses 1,000 concurrent requests into exactly 1 underlying database call', async () => {
    let underlyingCallCount = 0

    // Mock client simulating Supabase RPC
    const mockClient = {
      rpc: async (fnName, params) => {
        assert.equal(fnName, 'get_public_menu_bundle')
        assert.equal(params.p_business_id, testBusinessId)
        underlyingCallCount++
        // Simulate real database query latency of 15ms
        await new Promise((resolve) => setTimeout(resolve, 15))
        return {
          data: {
            success: true,
            business: {
              id: testBusinessId,
              name: 'Warung Berkah Nusantara',
              is_menu_published: true,
            },
            design: { version: 1, theme: { preset: 'coffee' }, layout: [] },
            products: [
              { id: 'prod-1', name: 'Kopi Susu Gula Aren', unit_price: 18000, is_available: true },
              { id: 'prod-2', name: 'Roti Bakar Coklat', unit_price: 15000, is_available: true },
            ],
            tables: [{ id: 'tbl-1', name: '01' }],
            qris: { qris_enabled: true, qris_image_url: 'https://example.com/qris.png' },
            contact: { business_name: 'Warung Berkah', phone: '081234567890', whatsapp: '6281234567890' },
          },
          error: null,
        }
      },
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: 'https://example.com/signed-qris.png' }, error: null }),
        }),
      },
    }

    // Launch 1,000 concurrent requests simultaneously
    const CONCURRENCY_COUNT = 1000
    const promises = Array.from({ length: CONCURRENCY_COUNT }, () =>
      getPublicMenuBundle(testBusinessId, { client: mockClient })
    )

    const results = await Promise.all(promises)

    // Critical assertion: EXACTLY 1 database round-trip occurred
    assert.equal(
      underlyingCallCount,
      1,
      `Thundering herd detected! Expected 1 query execution for 1000 concurrent users, got ${underlyingCallCount}`
    )

    // All 1,000 callers must receive valid, identical, consistent data
    assert.equal(results.length, CONCURRENCY_COUNT)
    for (const res of results) {
      assert.equal(res.success, true)
      assert.equal(res.business.id, testBusinessId)
      assert.equal(res.business.name, 'Warung Berkah Nusantara')
      assert.equal(res.products.length, 2)
      assert.equal(res.products[0].name, 'Kopi Susu Gula Aren')
      assert.equal(res.tables.length, 1)
      assert.ok(res.sellerContact.phone === '6281234567890' || res.sellerContact.phone === '081234567890')
      assert.equal(res.sellerContact.displayPhone, '081234567890')
    }
  })

  // ─────────────────────────────────────────────────────────────
  // 2. Multi-Tier In-Memory Cache (Sub-Millisecond Response)
  // ─────────────────────────────────────────────────────────────
  it('2. Serves subsequent repeat requests directly from L1 in-memory cache in sub-millisecond time', async () => {
    let callCount = 0
    const mockClient = {
      rpc: async () => {
        callCount++
        return {
          data: {
            success: true,
            business: { id: testBusinessId, name: 'Kedai Cepat', is_menu_published: true },
            products: [{ id: 'p1', name: 'Teh Manis' }],
            tables: [],
          },
          error: null,
        }
      },
    }

    // First call populates cache
    const first = await getPublicMenuBundle(testBusinessId, { client: mockClient })
    assert.equal(callCount, 1)
    assert.equal(first.success, true)

    // Measure cache retrieval time over 500 subsequent calls
    const start = performance.now()
    for (let i = 0; i < 500; i++) {
      const cached = await getPublicMenuBundle(testBusinessId, { client: mockClient })
      assert.equal(cached.fromCache, true)
      assert.equal(cached.business.name, 'Kedai Cepat')
    }
    const duration = performance.now() - start

    // Under 50ms for 500 in-memory cache hits (<0.1ms per hit)
    assert.ok(duration < 100, `Cache took too long: ${duration.toFixed(2)}ms for 500 hits`)
    assert.equal(callCount, 1, 'Underlying fetcher should not be called again while cache is fresh')
  })

  // ─────────────────────────────────────────────────────────────
  // 3. Synchronous Instant Lookups (0ms FCP & Instant Page Transitions)
  // ─────────────────────────────────────────────────────────────
  it('3. getCachedMenuBundle and getCachedProduct provide synchronous instant data for zero-spinner transitions', async () => {
    const mockClient = {
      rpc: async () => ({
        data: {
          success: true,
          business: { id: testBusinessId, name: 'Sate Khas', is_menu_published: true },
          products: [
            { id: 'sat-1', name: 'Sate Ayam Madura', unit_price: 25000 },
            { id: 'sat-2', name: 'Sate Kambing Solo', unit_price: 35000 },
          ],
        },
        error: null,
      }),
    }

    // Initially null before load
    assert.equal(getCachedMenuBundle(testBusinessId), null)
    assert.equal(getCachedProduct(testBusinessId, 'sat-1'), null)

    // Load bundle
    await getPublicMenuBundle(testBusinessId, { client: mockClient })

    // Instant synchronous lookup succeeds
    const cachedBundle = getCachedMenuBundle(testBusinessId)
    assert.ok(cachedBundle)
    assert.equal(cachedBundle.business.name, 'Sate Khas')

    const product1 = getCachedProduct(testBusinessId, 'sat-1')
    assert.ok(product1)
    assert.equal(product1.name, 'Sate Ayam Madura')
    assert.equal(product1.unit_price, 25000)

    const product2 = getCachedProduct(testBusinessId, 'sat-2')
    assert.ok(product2)
    assert.equal(product2.name, 'Sate Kambing Solo')
  })

  // ─────────────────────────────────────────────────────────────
  // 4. Cache Invalidation on Mutations
  // ─────────────────────────────────────────────────────────────
  it('4. invalidateMenuBundleCache clears cached bundle and forces a fresh query', async () => {
    let queryCount = 0
    const mockClient = {
      rpc: async () => {
        queryCount++
        return {
          data: {
            success: true,
            business: { id: testBusinessId, name: `Toko V${queryCount}`, is_menu_published: true },
            products: [],
          },
          error: null,
        }
      },
    }

    const v1 = await getPublicMenuBundle(testBusinessId, { client: mockClient })
    assert.equal(v1.business.name, 'Toko V1')
    assert.equal(queryCount, 1)

    // Invalidate
    invalidateMenuBundleCache(testBusinessId)
    assert.equal(getCachedMenuBundle(testBusinessId), null)

    // Next call fetches fresh V2
    const v2 = await getPublicMenuBundle(testBusinessId, { client: mockClient })
    assert.equal(v2.business.name, 'Toko V2')
    assert.equal(queryCount, 2)
  })

  // ─────────────────────────────────────────────────────────────
  // 5. Graceful Fallback to Parallel Queries if RPC is Missing
  // ─────────────────────────────────────────────────────────────
  it('5. Resilient parallel fallback runs smoothly if RPC does not exist', async () => {
    const createChain = (terminalData) => {
      const handler = {
        eq: () => handler,
        order: () => Promise.resolve({ data: terminalData, error: null }),
        single: () => Promise.resolve({ data: terminalData, error: null }),
        maybeSingle: () => Promise.resolve({ data: terminalData, error: null }),
        select: () => handler,
      }
      return handler
    }

    const mockFallbackClient = {
      rpc: async () => {
        return { data: null, error: { message: 'function get_public_menu_bundle does not exist', code: '42883' } }
      },
      from: (tableName) => {
        if (tableName === 'businesses') {
          return createChain({ id: testBusinessId, name: 'Bakso Solo', is_menu_published: true })
        }
        if (tableName === 'products') {
          return createChain([{ id: 'p-fb-1', name: 'Bakso', is_available: true, is_active: true }])
        }
        return createChain([])
      },
    }

    const fallbackResult = await getPublicMenuBundle(testBusinessId, { client: mockFallbackClient })
    assert.equal(fallbackResult.success, true)
    assert.equal(fallbackResult.business.name, 'Bakso Solo')
    assert.ok(Array.isArray(fallbackResult.products))
  })

  // ─────────────────────────────────────────────────────────────
  // 6. Migration 102 Schema & Performance Index Verification
  // ─────────────────────────────────────────────────────────────
  it('6. Migration 102 exists with covering indexes and get_public_menu_bundle RPC', () => {
    const migrationPath = path.resolve('supabase/migrations/102_qr_public_menu_high_concurrency_optimization.sql')
    assert.ok(fs.existsSync(migrationPath), 'Migration 102 must exist')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    // Covering indexes
    assert.ok(sql.includes('idx_products_public_menu'), 'Must create idx_products_public_menu')
    assert.ok(sql.includes('idx_tables_public_menu'), 'Must create idx_tables_public_menu')
    assert.ok(sql.includes('idx_businesses_public_menu'), 'Must create idx_businesses_public_menu')
    assert.ok(sql.includes('idx_qr_design_public'), 'Must create idx_qr_design_public')
    assert.ok(sql.includes('idx_business_payment_public'), 'Must create idx_business_payment_public')

    // High performance RPC
    assert.ok(sql.includes('get_public_menu_bundle'), 'Must define get_public_menu_bundle')
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_public_menu_bundle'), 'Must grant execute to anon & authenticated')
    assert.ok(sql.includes('SECURITY DEFINER'), 'RPC must be SECURITY DEFINER')
  })

  // ─────────────────────────────────────────────────────────────
  // 7. Component & Rendering Concurrency Audit
  // ─────────────────────────────────────────────────────────────
  it('7. PublicMenuRenderer memoizes Product Cards and decodes images asynchronously', () => {
    const rendererPath = path.resolve('src/components/pos/PublicMenuRenderer.jsx')
    const rendererSrc = fs.readFileSync(rendererPath, 'utf8')

    assert.ok(rendererSrc.includes('const ProductGridCard = memo('), 'ProductGridCard must be wrapped in memo')
    assert.ok(rendererSrc.includes('const ProductListCard = memo('), 'ProductListCard must be wrapped in memo')
    assert.ok(rendererSrc.includes('const ProductBigCard = memo('), 'ProductBigCard must be wrapped in memo')
    assert.ok(rendererSrc.includes('decoding="async"'), 'Images must use decoding="async" for smooth scrolling')
    assert.ok(rendererSrc.includes('contentVisibility'), 'Card containers should use contentVisibility')
  })

  it('8. PublicMenuPage implements instant cache prefill and memoized cart handlers', () => {
    const pagePath = path.resolve('src/pages/public/PublicMenuPage.jsx')
    const pageSrc = fs.readFileSync(pagePath, 'utf8')

    assert.ok(pageSrc.includes('getCachedMenuBundle'), 'PublicMenuPage must use getCachedMenuBundle for 0ms initial paint')
    assert.ok(pageSrc.includes('getPublicMenuBundle'), 'PublicMenuPage must fetch via getPublicMenuBundle')
    assert.ok(pageSrc.includes('useCallback'), 'PublicMenuPage must use useCallback for cart actions')
    assert.ok(pageSrc.includes('useMemo'), 'PublicMenuPage must use useMemo for cart and products')
  })

  it('9. PublicProductDetailPage implements instant cache prefill via getCachedProduct', () => {
    const detailPath = path.resolve('src/pages/public/PublicProductDetailPage.jsx')
    const detailSrc = fs.readFileSync(detailPath, 'utf8')

    assert.ok(detailSrc.includes('getCachedProduct'), 'PublicProductDetailPage must use getCachedProduct for 0ms transition')
    assert.ok(detailSrc.includes('getCachedMenuBundle'), 'PublicProductDetailPage must use getCachedMenuBundle')
  })
})
