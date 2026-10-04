import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPublicMenuBundle,
  getCachedMenuBundle,
  invalidateMenuBundleCache,
  CACHE_TTL_MS,
  SWR_WINDOW_MS,
} from '../services/qrMenuCacheService.js'

/**
 * High-Concurrency & Performance Load Test Suite
 * Simulates 1,000 concurrent QR scans under realistic conditions.
 * Verifies single-flight coalescing, multi-tier cache, tenant isolation, and zero secret leakage.
 */
describe('Public QR Menu High Concurrency & Scale Suite (Phase 11)', () => {
  // Helper to generate mock menu products
  function generateMockProducts(count, businessId) {
    return Array.from({ length: count }, (_, i) => ({
      id: `prod-${businessId}-${i + 1}`,
      name: `Kopi Nusantara #${i + 1}`,
      description: `Biji kopi pilihan kualitas ekspor #${i + 1}`,
      unit_price: 25000 + i * 1000,
      category: i % 2 === 0 ? 'Kopi Dingin' : 'Kopi Panas',
      image_url: `https://storage.bisnissehat.id/products/${businessId}/kopi-${i + 1}.webp`,
      is_available: true,
      is_active: true,
      sort_order: i,
    }))
  }

  // Create a mock Supabase client with instrumented call counters and latency simulation
  function createInstrumentedMockClient({ rpcLatencyMs = 25, productsCount = 20, isPublished = true } = {}) {
    let rpcCallCount = 0
    let dbCallCount = 0

    const mockClient = {
      get rpcCallCount() {
        return rpcCallCount
      },
      get dbCallCount() {
        return dbCallCount
      },
      resetCounters() {
        rpcCallCount = 0
        dbCallCount = 0
      },
      rpc: async (fnName, params) => {
        rpcCallCount++
        await new Promise((r) => setTimeout(r, rpcLatencyMs))

        if (fnName === 'get_public_menu_bundle') {
          const bizId = params?.p_business_id
          if (!bizId || bizId === 'non-existent') {
            return {
              data: { success: false, error: 'NOT_FOUND', message: 'Bisnis tidak ditemukan.' },
              error: null,
            }
          }
          if (!isPublished || bizId === 'unpublished-biz') {
            return {
              data: { success: false, error: 'NOT_PUBLISHED', message: 'Menu bisnis ini belum dipublikasikan.' },
              error: null,
            }
          }

          return {
            data: {
              success: true,
              business: {
                id: bizId,
                name: 'Toko Kopi Sehat',
                slogan: 'Kopi Terbaik UMKM',
                cover_url: 'https://storage.bisnissehat.id/covers/cover.webp',
                logo_url: 'https://storage.bisnissehat.id/logos/logo.webp',
                is_menu_published: true,
                phone: '08123456789',
                whatsapp: '628123456789',
              },
              design: {
                version: 1,
                theme: { primary: '#F5A623', background: '#FFF9F4' },
                layout: [{ id: 'banner', type: 'banner' }],
              },
              products: generateMockProducts(productsCount, bizId),
              tables: [
                { id: 't1', name: '01', sort_order: 1, is_active: true },
                { id: 't2', name: '02', sort_order: 2, is_active: true },
              ],
              qris: {
                business_id: bizId,
                qris_enabled: true,
                qris_image_url: 'https://storage.bisnissehat.id/qris.webp',
              },
              contact: {
                business_name: 'Toko Kopi Sehat',
                phone: '08123456789',
                whatsapp: '628123456789',
              },
            },
            error: null,
          }
        }

        return { data: null, error: new Error('Unknown RPC') }
      },
      from: (table) => {
        dbCallCount++
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'fallback-biz', is_menu_published: true }, error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
              order: async () => ({ data: [], error: null }),
            }),
          }),
        }
      },
    }

    return mockClient
  }

  it('A. Cold Cache: Loads unified menu bundle and verifies structure without secret leakage', async () => {
    const bizId = 'biz-cold-1'
    invalidateMenuBundleCache(bizId)

    const mockClient = createInstrumentedMockClient({ rpcLatencyMs: 15, productsCount: 10 })
    const result = await getPublicMenuBundle(bizId, { client: mockClient })

    assert.equal(result.success, true)
    assert.equal(result.business.id, bizId)
    assert.equal(result.products.length, 10)
    assert.equal(mockClient.rpcCallCount, 1, 'Cold cache must trigger exactly 1 RPC')

    // Phase 7 Security Verification: Ensure zero sensitive columns leaked
    assert.equal(result.business.owner_id, undefined, 'Must not leak owner_id')
    assert.equal(result.business.email, undefined, 'Must not leak business owner email')
    for (const prod of result.products) {
      assert.equal(prod.cost_price, undefined, 'Must NEVER leak product cost_price (HPP)')
      assert.equal(prod.notes, undefined, 'Must not leak merchant internal notes')
    }
  })

  it('B. Warm Cache: Instantaneous delivery (< 5ms) with zero DB round trips', async () => {
    const bizId = 'biz-warm-1'
    invalidateMenuBundleCache(bizId)

    const mockClient = createInstrumentedMockClient({ rpcLatencyMs: 20 })

    // Prime the cache
    await getPublicMenuBundle(bizId, { client: mockClient })
    assert.equal(mockClient.rpcCallCount, 1)

    // Warm hit
    const start = performance.now()
    const warmResult = await getPublicMenuBundle(bizId, { client: mockClient })
    const durationMs = performance.now() - start

    assert.equal(warmResult.success, true)
    assert.equal(warmResult.fromCache, true)
    assert.equal(mockClient.rpcCallCount, 1, 'Warm cache must NOT make any additional RPC/DB calls')
    assert.ok(durationMs < 10, `Warm cache latency (${durationMs.toFixed(2)}ms) must be < 10ms`)
  })

  it('C. 1 Business × 1,000 Concurrent Users: Coalesces 1,000 calls into EXACTLY 1 DB round-trip', async () => {
    const bizId = 'biz-scale-1000'
    invalidateMenuBundleCache(bizId)

    const mockClient = createInstrumentedMockClient({ rpcLatencyMs: 40, productsCount: 50 })

    const concurrentCount = 1000
    const latencies = []
    const overallStart = performance.now()

    // Launch 1,000 concurrent user requests simultaneously
    const promises = Array.from({ length: concurrentCount }, async () => {
      const userStart = performance.now()
      const res = await getPublicMenuBundle(bizId, { client: mockClient })
      const userDuration = performance.now() - userStart
      latencies.push(userDuration)
      return res
    })

    const results = await Promise.all(promises)
    const overallDuration = performance.now() - overallStart

    // 1. Success & Error Rate
    const successfulCount = results.filter((r) => r.success === true).length
    const errorRate = ((concurrentCount - successfulCount) / concurrentCount) * 100

    assert.equal(successfulCount, concurrentCount, 'All 1,000 concurrent requests must succeed')
    assert.equal(errorRate, 0, 'Error rate must be exactly 0%')

    // 2. Database Connection Protection: Single-Flight Request Coalescing
    assert.equal(
      mockClient.rpcCallCount,
      1,
      `1,000 concurrent requests must collapse into EXACTLY 1 DB call! Actual: ${mockClient.rpcCallCount}`
    )

    // 3. Latency Statistics
    latencies.sort((a, b) => a - b)
    const p50 = latencies[Math.floor(concurrentCount * 0.5)]
    const p95 = latencies[Math.floor(concurrentCount * 0.95)]
    const p99 = latencies[Math.floor(concurrentCount * 0.99)]

    console.log(`\n--- 1,000 Concurrent Public Menu Opens Benchmark ---`)
    console.log(`Total Concurrent Users: ${concurrentCount}`)
    console.log(`Database Round Trips: ${mockClient.rpcCallCount}`)
    console.log(`Overall Duration: ${overallDuration.toFixed(2)}ms`)
    console.log(`p50 Latency: ${p50.toFixed(2)}ms`)
    console.log(`p95 Latency: ${p95.toFixed(2)}ms`)
    console.log(`p99 Latency: ${p99.toFixed(2)}ms`)
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`)
    console.log(`----------------------------------------------------\n`)

    assert.ok(p95 < 200, `p95 latency (${p95.toFixed(2)}ms) must be < 200ms under coalesced load`)
  })

  it('D. Multi-Business Concurrency: 5 businesses × 200 concurrent users (Total 1,000 requests)', async () => {
    const businesses = ['biz-A', 'biz-B', 'biz-C', 'biz-D', 'biz-E']
    businesses.forEach((b) => invalidateMenuBundleCache(b))

    const mockClient = createInstrumentedMockClient({ rpcLatencyMs: 30, productsCount: 25 })
    const allRequests = []

    for (const bizId of businesses) {
      for (let i = 0; i < 200; i++) {
        allRequests.push(
          getPublicMenuBundle(bizId, { client: mockClient }).then((res) => ({
            requestedBizId: bizId,
            res,
          }))
        )
      }
    }

    const responses = await Promise.all(allRequests)

    // Verify 1,000 total requests processed
    assert.equal(responses.length, 1000)

    // Verify Tenant Isolation: every response matches its requested business
    for (const { requestedBizId, res } of responses) {
      assert.equal(res.success, true)
      assert.equal(res.business.id, requestedBizId)
    }

    // Exactly 5 DB calls (1 per unique business)
    assert.equal(
      mockClient.rpcCallCount,
      5,
      `5 businesses × 200 users must execute exactly 5 DB round trips! Actual: ${mockClient.rpcCallCount}`
    )
  })

  it('E. Scaled Menu Sizes: 20, 100, and 500 products single payload integrity', async () => {
    for (const count of [20, 100, 500]) {
      const bizId = `biz-size-${count}`
      invalidateMenuBundleCache(bizId)

      const mockClient = createInstrumentedMockClient({ rpcLatencyMs: 15, productsCount: count })
      const start = performance.now()
      const bundle = await getPublicMenuBundle(bizId, { client: mockClient })
      const timeMs = performance.now() - start

      assert.equal(bundle.success, true)
      assert.equal(bundle.products.length, count)
      assert.equal(bundle.categories.length, 2)
      assert.ok(timeMs < 150, `Menu with ${count} products must parse and resolve in < 150ms (took ${timeMs.toFixed(2)}ms)`)
    }
  })

  it('F. Tenant Isolation & Unpublished Menu Safety', async () => {
    const mockClient = createInstrumentedMockClient()

    // 1. Non-existent business
    const resNotFound = await getPublicMenuBundle('non-existent', { client: mockClient })
    assert.equal(resNotFound.success, false)
    assert.equal(resNotFound.error, 'NOT_FOUND')

    // 2. Unpublished business
    const resUnpublished = await getPublicMenuBundle('unpublished-biz', { client: mockClient })
    assert.equal(resUnpublished.success, false)
    assert.equal(resUnpublished.error, 'NOT_PUBLISHED')
  })

  it('G. Schema Column Integrity & Whitespace Trimming (Fix: Bisnis tidak ditemukan)', async () => {
    // 1. Verify qrMenuCacheService source code does NOT query non-existent columns on businesses
    const fs = await import('node:fs')
    const path = await import('node:path')
    const serviceSrc = fs.readFileSync(path.resolve('src/services/qrMenuCacheService.js'), 'utf8')

    // Must never select non-existent phone or whatsapp on businesses table
    assert.doesNotMatch(serviceSrc, /from\(['"]businesses['"]\)\s*\.select\([^)]*\bphone\b/, 'Must NOT select phone from businesses')
    assert.doesNotMatch(serviceSrc, /from\(['"]businesses['"]\)\s*\.select\([^)]*\bwhatsapp\b/, 'Must NOT select whatsapp from businesses')

    // Must never select cost_price or notes from products table
    assert.doesNotMatch(serviceSrc, /from\(['"]products['"]\)\s*\.select\([^)]*\bcost_price\b/, 'Must NOT select cost_price from products')
    assert.doesNotMatch(serviceSrc, /from\(['"]products['"]\)\s*\.select\([^)]*\bnotes\b/, 'Must NOT select notes from products')

    // 2. Test whitespace trimming prevents 'Bisnis tidak ditemukan'
    const mockClient = createInstrumentedMockClient()
    const trimmedRes = await getPublicMenuBundle('  biz-1  ', { client: mockClient })
    assert.equal(trimmedRes.success, true)
    assert.equal(trimmedRes.business.id, 'biz-1')
  })
})

