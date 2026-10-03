// src/__tests__/seoProviderGracefulDegradation.test.js
// Verification suite for SEO Provider Graceful Degradation & Zero Public Provider Errors
// Covers all 15 scenarios specified in Section 9 of the reliability requirements.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeSeoError,
  fetchSeoKeywordResearch,
  fetchSeoCompetitors,
  fetchSeoBacklinks,
} from '../lib/seoService.js'
import { runSeoAudit } from '../lib/seoAnalyzer.js'
import { supabase } from '../lib/supabase.js'

function mockFunctionsInvoke(mockFn) {
  const origDesc =
    Object.getOwnPropertyDescriptor(supabase, 'functions') ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(supabase), 'functions')

  Object.defineProperty(supabase, 'functions', {
    value: { invoke: mockFn },
    configurable: true,
    writable: true,
  })

  return () => {
    if (origDesc) {
      Object.defineProperty(supabase, 'functions', origDesc)
    }
  }
}

describe('SEO Provider Graceful Degradation & Zero Public Provider Errors (15 Scenarios)', () => {
  const enginePath = path.resolve('supabase/functions/seo-engine/index.ts')
  const engineSource = fs.readFileSync(enginePath, 'utf8')
  const pagePath = path.resolve('src/pages/dashboard/marketing/SeoOptimizerPage.jsx')
  const pageSource = fs.readFileSync(pagePath, 'utf8')

  // 1. provider success
  it('1. provider success: Keyword research returns real search metrics without degradation', async () => {
    const mockKeywords = [
      { keyword: 'kopi susu gula aren', search_volume: 12500, cpc: 0.25, competition_level: 'MEDIUM' },
      { keyword: 'biji kopi arabika', search_volume: 8100, cpc: 0.32, competition_level: 'HIGH' },
    ]

    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: true,
        source: 'openseo_api',
        data: mockKeywords,
        total: 2,
      },
      error: null,
    }))

    try {
      const res = await fetchSeoKeywordResearch({ businessId: 'biz_01', keywords: ['kopi susu gula aren'] })
      assert.equal(res.ok, true)
      assert.equal(res.isDegraded, false)
      assert.deepEqual(res.data, mockKeywords)
      assert.equal(res.data.length, 2)
      assert.equal(res.data[0].keyword, 'kopi susu gula aren')
      assert.equal(res.data[0].search_volume, 12500)
    } finally {
      restore()
    }
  })

  // 2. SERP success
  it('2. SERP success: Competitor insights returns real SERP rankings and traffic estimates', async () => {
    const mockCompetitors = [
      { domain: 'kompetitor-a.id', avg_position: 1.8, visibility: 1200, etv: 24500, competitor_relevance: 0.92 },
      { domain: 'kompetitor-b.id', avg_position: 3.4, visibility: 850, etv: 8900, competitor_relevance: 0.75 },
    ]

    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: true,
        target: 'tokosaya.id',
        competitors: mockCompetitors,
        source: 'openseo_api',
        total: 2,
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, true)
      assert.equal(res.isDegraded, false)
      assert.deepEqual(res.competitors, mockCompetitors)
      assert.equal(res.competitors.length, 2)
      assert.equal(res.competitors[0].domain, 'kompetitor-a.id')
      assert.equal(res.competitors[0].etv, 24500)
    } finally {
      restore()
    }
  })

  // 3. insufficient funds
  it('3. insufficient funds (40210): degrades gracefully with zero internal error codes shown', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'INSUFFICIENT_FUNDS',
        error: 'Data pencarian sementara tidak tersedia. Silakan gunakan fitur Audit On-Page.',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.equal(res.code, 'INSUFFICIENT_FUNDS')
      assert.ok(!res.error.includes('40210'), 'Must not expose code 40210')
      assert.ok(!res.error.toLowerCase().includes('insufficient funds'), 'Must not expose "insufficient funds"')
      assert.ok(!res.error.toLowerCase().includes('dataforseo'), 'Must not expose "DataForSEO"')
      assert.ok(!res.error.toLowerCase().includes('openseo'), 'Must not expose "OpenSEO"')
      assert.ok(res.fallback?.available)
      assert.equal(res.fallback?.mode, 'on_page_audit')
    } finally {
      restore()
    }
  })

  // 4. payment required
  it('4. payment required (40200 / HTTP 402): degrades gracefully to clean Indonesian message', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'PAYMENT_REQUIRED',
        error: 'Data pencarian sementara tidak tersedia.',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.ok(!res.error.includes('40200'), 'Must not expose code 40200')
      assert.ok(!res.error.toLowerCase().includes('payment required'), 'Must not expose "Payment Required"')
      assert.ok(!res.error.toLowerCase().includes('credit'), 'Must not expose credit exhausted')
      assert.ok(res.fallback?.available)
    } finally {
      restore()
    }
  })

  // 5. provider timeout
  it('5. provider timeout: degrades gracefully without leaking internal endpoints or provider names', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'PROVIDER_TIMEOUT',
        error: 'Koneksi ke layanan data SEO memakan waktu terlalu lama (timeout > 10 detik).',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.ok(res.error.includes('timeout'))
      assert.ok(!res.error.toLowerCase().includes('openseo'))
      assert.ok(!res.error.toLowerCase().includes('dataforseo'))
      assert.ok(res.fallback?.available)
    } finally {
      restore()
    }
  })

  // 6. provider unavailable
  it('6. provider unavailable (50301): degrades gracefully without raw technical details', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'PROVIDER_UNAVAILABLE',
        error: 'Layanan penyedia data SEO sedang tidak dapat diakses atau dalam pemeliharaan berkala.',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.ok(!res.error.includes('50301'))
      assert.ok(!res.error.toLowerCase().includes('dataforseo'))
      assert.ok(!res.error.toLowerCase().includes('openseo'))
      assert.ok(res.fallback?.available)
    } finally {
      restore()
    }
  })

  // 7. network failure
  it('7. network failure: Client invocation failure (FunctionsHttpError) degrades gracefully', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Failed to send a request to the Edge Function',
        context: {
          json: async () => ({
            code: 'FETCH_FAILED',
            error: 'Failed to fetch',
          }),
        },
      },
    }))

    try {
      const res = await fetchSeoKeywordResearch({ businessId: 'biz_01', keywords: ['kopi'] })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.ok(!res.error.includes('OpenSEO'))
      assert.ok(!res.error.includes('DataForSEO'))
      assert.ok(res.fallback?.available)
    } finally {
      restore()
    }
  })

  // 8. no results
  it('8. no results (40102): returns legitimate empty state with notice and zero fake data', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: true,
        source: 'dataforseo',
        targetDomain: 'brand-baru-belum-terkenal.com',
        competitors: [],
        total: 0,
        notice: 'Data belum tersedia.',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'brand-baru-belum-terkenal.com' })
      assert.equal(res.ok, true)
      assert.equal(res.isDegraded, false)
      assert.deepEqual(res.competitors, [])
      assert.equal(res.total, 0)
      assert.equal(res.notice, 'Data belum tersedia.')
    } finally {
      restore()
    }
  })

  // 9. malformed provider response
  it('9. malformed provider response: Non-JSON or invalid schema handled gracefully without client crash', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'MALFORMED_PROVIDER_RESPONSE',
        error: 'Format respon dari layanan penyedia data SEO tidak valid.',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoBacklinks({ businessId: 'biz_01', targetDomain: 'tokokopi.id' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'MALFORMED_PROVIDER_RESPONSE')
      assert.equal(res.isDegraded, true)
      assert.ok(res.fallback?.available)
    } finally {
      restore()
    }
  })

  // 10. SERP failure while non-SERP SEO operation succeeds
  it('10. SERP failure while non-SERP SEO operation succeeds: SERP fails but Keyword Research & On-page audit work', async () => {
    const restore = mockFunctionsInvoke(async (fnName, options) => {
      const action = options?.body?.action
      if (action === 'keyword-research') {
        return {
          data: {
            ok: true,
            keywords: ['sepatu kulit lokal'],
            data: [
              { keyword: 'sepatu kulit lokal', search_volume: 4500, cpc: 0.18, competition_level: 'MEDIUM' }
            ],
            source: 'provider',
          },
          error: null,
        }
      }
      if (action === 'competitor-insights') {
        return {
          data: {
            ok: false,
            code: 'INSUFFICIENT_FUNDS',
            error: 'Data pencarian sementara tidak tersedia.',
            source: 'fallback',
            availability: 'temporarily_unavailable',
          },
          error: null,
        }
      }
      return { data: null, error: new Error('Unknown action') }
    })

    try {
      // 1. Keyword research succeeds
      const kwRes = await fetchSeoKeywordResearch({ businessId: 'biz_01', keywords: ['sepatu kulit lokal'] })
      assert.equal(kwRes.ok, true)
      assert.equal(kwRes.isDegraded, false)
      assert.equal(kwRes.data.length, 1)
      assert.equal(kwRes.data[0].keyword, 'sepatu kulit lokal')
      assert.equal(kwRes.data[0].search_volume, 4500)

      // 2. SERP competitor fails gracefully without crashing or taking down the rest
      const compRes = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosepatu.id' })
      assert.equal(compRes.ok, false)
      assert.equal(compRes.isDegraded, true)
      assert.equal(compRes.code, 'INSUFFICIENT_FUNDS')
      assert.ok(!compRes.error.includes('DataForSEO'))
      assert.ok(!compRes.error.includes('40210'))

      // 3. Local On-Page SEO audit succeeds 100% locally
      const auditRes = runSeoAudit({
        url: 'https://tokosepatu.id',
        html: '<!DOCTYPE html><html><head><title>Toko Sepatu Kulit Asli Lokal Garut</title><meta name="description" content="Toko sepatu lokal berkualitas terpercaya di Garut."/></head><body><h1>Sepatu Lokal</h1><p>Koleksi sepatu lokal asli.</p></body></html>',
        targetKeyword: 'sepatu',
      })
      assert.ok(auditRes.totalScore > 0)
      assert.ok(auditRes.passed.length > 0)
    } finally {
      restore()
    }
  })

  // 11. raw provider error not exposed
  it('11. raw provider error not exposed: normalizeSeoError scrubs provider names, URLs, and HTTP statuses', () => {
    const testCases = [
      { raw: 'Engine OpenSEO mengembalikan respon error (HTTP 500).', forbidden: ['openseo', '500'] },
      { raw: 'Format respon dari engine OpenSEO tidak valid (bukan JSON).', forbidden: ['openseo'] },
      { raw: 'Penyedia SEO eksternal (OpenSEO / DataForSEO) belum dikonfigurasi di server.', forbidden: ['openseo', 'dataforseo'] },
      { raw: 'Gagal terhubung ke api.dataforseo.com setelah 3 percobaan.', forbidden: ['dataforseo', 'api.dataforseo.com'] },
      { raw: 'Task execution failed with status 40103 from DataForSEO.', forbidden: ['dataforseo', '40103'] },
      { raw: 'DataForSEO insufficient funds code 40210', forbidden: ['dataforseo', '40210', 'insufficient funds'] },
      { raw: 'Provider exception at line 42: stack trace', forbidden: ['provider exception', 'stack'] },
    ]

    for (const { raw, forbidden } of testCases) {
      const sanitized = normalizeSeoError(raw, 'PROVIDER_ERROR')
      for (const phrase of forbidden) {
        assert.ok(
          !sanitized.toLowerCase().includes(phrase.toLowerCase()),
          `Sanitized message "${sanitized}" must not include forbidden string "${phrase}"`
        )
      }
    }
  })

  // 12. provider credentials not exposed
  it('12. provider credentials not exposed: Edge function and client responses never expose credentials', () => {
    assert.ok(!engineSource.includes('error: `${DATAFORSEO_LOGIN}'), 'Must not return DATAFORSEO_LOGIN in error')
    assert.ok(!engineSource.includes('error: `${DATAFORSEO_PASSWORD}'), 'Must not return DATAFORSEO_PASSWORD in error')
    assert.ok(!engineSource.includes('error: `${OPENSEO_API_KEY}'), 'Must not return OPENSEO_API_KEY in error')
    assert.ok(!engineSource.includes('details: error'), 'Must not leak raw error object in details')

    const errorMatches = engineSource.match(/error:\s*["`][^"`]+["`]/g) || []
    for (const match of errorMatches) {
      assert.ok(!match.includes('OpenSEO'), `Edge function error string must not contain OpenSEO: ${match}`)
      assert.ok(!match.includes('DataForSEO'), `Edge function error string must not contain DataForSEO: ${match}`)
      assert.ok(!match.includes('${response.status}'), `Edge function error string must not contain HTTP status: ${match}`)
      assert.ok(!match.includes('${d4sResponse.status}'), `Edge function error string must not contain d4s status: ${match}`)
      assert.ok(!match.includes('${task.status_code}'), `Edge function error string must not contain task status: ${match}`)
    }
  })

  // 13. no fake SERP result
  it('13. no fake SERP result: Never invent rankings, competitor positions, or traffic estimates on failure', async () => {
    const restoreEmpty = mockFunctionsInvoke(async () => ({
      data: {
        ok: true,
        target: 'nonexistent-domain.xyz',
        competitors: [],
        total: 0,
        source: 'openseo_api',
        notice: 'Data belum tersedia.',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'nonexistent-domain.xyz' })
      assert.equal(res.ok, true)
      assert.deepEqual(res.competitors, [], 'Competitors must be empty array, NOT mock competitors')
      assert.ok(!res.competitors.some(c => c.etv), 'Must not fabricate traffic estimates on empty results')
      assert.equal(res.notice, 'Data belum tersedia.')
      assert.equal(res.competitors.length, 0)
    } finally {
      restoreEmpty()
    }

    const restoreFail = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'INSUFFICIENT_FUNDS',
        error: 'Data pencarian sementara tidak tersedia.',
        source: 'fallback',
        availability: 'temporarily_unavailable',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_01', targetDomain: 'tokosaya.id' })
      assert.equal(res.ok, false)
      assert.equal(res.isDegraded, true)
      assert.equal(res.competitors, undefined, 'Must not fabricate competitors or traffic estimates on failure')
    } finally {
      restoreFail()
    }
  })

  // 14. frontend graceful unavailable state
  it('14. frontend graceful unavailable state: SeoOptimizerPage renders degradation banner, fallback CTA, and notices', () => {
    const updatedPageSource = fs.readFileSync(pagePath, 'utf8')

    assert.ok(updatedPageSource.includes('researchDegraded'), 'SeoOptimizerPage must track researchDegraded')
    assert.ok(updatedPageSource.includes('competitorDegraded'), 'SeoOptimizerPage must track competitorDegraded')
    assert.ok(updatedPageSource.includes('researchNotice'), 'SeoOptimizerPage must track researchNotice')
    assert.ok(updatedPageSource.includes('competitorNotice'), 'SeoOptimizerPage must track competitorNotice')

    assert.ok(
      updatedPageSource.includes('Layanan Riset Pasar Sedang Dioptimalkan'),
      'Must render user-friendly banner title'
    )
    assert.ok(
      updatedPageSource.includes('Gunakan Audit On-Page SEO (100% Aktif)'),
      'Must render direct fallback CTA to on-page audit'
    )
    assert.ok(
      updatedPageSource.includes('Estimasi Trafik'),
      'Must render Estimasi Trafik column header'
    )
    assert.ok(
      updatedPageSource.includes('Hasil Tidak Ditemukan'),
      'Must render empty state card for keyword research'
    )
    assert.ok(
      updatedPageSource.includes('Pesaing Tidak Ditemukan'),
      'Must render empty state card for competitor insights'
    )

    assert.ok(!updatedPageSource.includes('Informasi Engine:'), 'Must NOT display technical "Informasi Engine:" label')
    assert.ok(!updatedPageSource.includes('DataForSEO'), 'Must NOT hardcode DataForSEO in UI')
  })

  // 15. existing SEO functionality regression
  it('15. existing SEO functionality regression: Local On-Page SEO DOM analysis and audit work independently', () => {
    const htmlSample = `
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <title>Sepatu Kulit Asli Garut Pria Wanita Berkualitas</title>
          <meta name="description" content="Beli sepatu kulit asli Garut untuk pria dan wanita dengan kualitas premium dan garansi resmi. Toko resmi pengrajin lokal.">
          <link rel="canonical" href="https://sepatugarut.id">
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main>
            <h1>Koleksi Sepatu Kulit Asli Pilihan</h1>
            <p>Temukan aneka sepatu kulit lokal dengan jahitan rapi, sol kokoh, dan bahan kulit sapi asli Garut.</p>
            <img src="/img/sepatu-1.jpg" alt="Sepatu kulit model oxford cokelat tua">
            <img src="/img/sepatu-2.jpg" alt="Sepatu kulit boots hitam pria">
          </main>
          <footer><p>&copy; 2026 Sepatu Garut</p></footer>
        </body>
      </html>
    `

    const audit = runSeoAudit({
      url: 'https://sepatugarut.id',
      html: htmlSample,
      targetKeyword: 'sepatu kulit',
    })

    assert.ok(audit.totalScore >= 50, `Audit score should be healthy: ${audit.totalScore}`)
    assert.ok(audit.metadata.title.includes('Sepatu Kulit'), 'Title check should pass')
    assert.ok(audit.metadata.metaDescription.length > 0, 'Meta description check should pass')
    assert.equal(audit.metadata.h1Count, 1, 'H1 tag count check should be 1')
    assert.equal(audit.metadata.totalImages, 2, 'Total images check should be 2')
    assert.equal(audit.metadata.missingAltCount, 0, 'No missing alt text')
    assert.ok(audit.passed.length > 0, 'Audit passed checks should not be empty')
  })
})
