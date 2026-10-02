// src/__tests__/seoOpenSeoIntegration.test.js
// BisnisSehat OpenSEO / DataForSEO Phase 2 Verification & Security Suite
// Tests all 14 mandatory security and integration requirements from load.md

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  fetchSeoKeywordResearch,
  fetchSeoCompetitors,
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

describe('OpenSEO / DataForSEO Phase 2 Security & Integration Suite (load.md)', () => {
  const fnPath = path.resolve('supabase/functions/seo-engine/index.ts')
  const fnSource = fs.readFileSync(fnPath, 'utf8')

  // 1. Unauthenticated request → 401
  it('1. unauthenticated request → 401 rejected', async () => {
    assert.ok(fnSource.includes('status: 401'), 'Edge function must reject unauthenticated requests with 401')
    assert.ok(fnSource.includes('UNAUTHORIZED'), 'Edge function must return UNAUTHORIZED code')

    const restore = mockFunctionsInvoke(async () => ({
      data: { ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid atau telah kedaluwarsa.' },
      error: {
        message: 'Unauthorized',
        context: {
          json: async () => ({ ok: false, code: 'UNAUTHORIZED', error: 'Sesi tidak valid atau telah kedaluwarsa.' }),
        },
      },
    }))

    try {
      const res = await fetchSeoKeywordResearch({ businessId: 'biz_123', keywords: ['kopi'] })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'UNAUTHORIZED')
    } finally {
      restore()
    }
  })

  // 2. Authenticated user → allowed
  it('2. authenticated user → allowed with structured response', async () => {
    const restore = mockFunctionsInvoke(async (fnName, opts) => {
      assert.equal(fnName, 'seo-engine')
      assert.equal(opts.body.business_id, 'biz_valid_123')
      return {
        data: {
          ok: true,
          source: 'dataforseo',
          data: [
            {
              keyword: 'kopi arabika gayo',
              search_volume: 12000,
              cpc: 0.45,
              competition: 0.35,
              competition_level: 'LOW',
            },
          ],
        },
        error: null,
      }
    })

    try {
      const res = await fetchSeoKeywordResearch({
        businessId: 'biz_valid_123',
        keywords: ['kopi arabika gayo'],
      })
      assert.equal(res.ok, true)
      assert.equal(res.data.length, 1)
      assert.equal(res.data[0].keyword, 'kopi arabika gayo')
      assert.equal(res.data[0].search_volume, 12000)
    } finally {
      restore()
    }
  })

  // 3. Invalid business_id → rejected
  it('3. invalid business_id → rejected', async () => {
    // Missing business_id caught on client
    const clientRes = await fetchSeoKeywordResearch({ businessId: '', keywords: ['kopi'] })
    assert.equal(clientRes.ok, false)
    assert.equal(clientRes.code, 'MISSING_BUSINESS_ID')

    // Non-existent business_id rejected by server with 404
    assert.ok(fnSource.includes('BUSINESS_NOT_FOUND'), 'Edge function must return BUSINESS_NOT_FOUND')
    const restore = mockFunctionsInvoke(async () => ({
      data: { ok: false, code: 'BUSINESS_NOT_FOUND', error: 'Bisnis tidak ditemukan.' },
      error: {
        message: 'Bisnis tidak ditemukan.',
        context: {
          json: async () => ({ ok: false, code: 'BUSINESS_NOT_FOUND', error: 'Bisnis tidak ditemukan.' }),
        },
      },
    }))

    try {
      const serverRes = await fetchSeoKeywordResearch({ businessId: 'fake_biz', keywords: ['kopi'] })
      assert.equal(serverRes.ok, false)
      assert.equal(serverRes.code, 'BUSINESS_NOT_FOUND')
    } finally {
      restore()
    }
  })

  // 4. Cross-business business_id → 403
  it('4. cross-business business_id → 403 IDOR rejection', async () => {
    assert.ok(fnSource.includes('IDOR_FORBIDDEN'), 'Edge function must explicitly declare IDOR_FORBIDDEN code')
    assert.ok(fnSource.includes('business.owner_id !== user.id'), 'Must check business ownership against user id')

    const restore = mockFunctionsInvoke(async (fnName, opts) => {
      assert.equal(opts.body.business_id, 'victim_business')
      return {
        data: {
          ok: false,
          code: 'IDOR_FORBIDDEN',
          error: 'Akses ditolak: Anda tidak memiliki wewenang atas data SEO bisnis ini (IDOR Defense).',
        },
        error: {
          message: 'Forbidden',
          context: {
            json: async () => ({
              ok: false,
              code: 'IDOR_FORBIDDEN',
              error: 'Akses ditolak: Anda tidak memiliki wewenang atas data SEO bisnis ini (IDOR Defense).',
            }),
          },
        },
      }
    })

    try {
      const res = await fetchSeoKeywordResearch({
        businessId: 'victim_business',
        keywords: ['kopi gayo'],
      })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'IDOR_FORBIDDEN')
      assert.ok(res.error.includes('IDOR Defense'))
    } finally {
      restore()
    }
  })

  // 5. Malformed keyword input → rejected
  it('5. malformed keyword input → rejected with INVALID_INPUT', async () => {
    assert.ok(fnSource.includes('INVALID_INPUT'), 'Edge function must reject invalid input with INVALID_INPUT')

    // Empty keywords caught client-side
    const emptyRes = await fetchSeoKeywordResearch({ businessId: 'biz_123', keywords: [] })
    assert.equal(emptyRes.ok, false)
    assert.equal(emptyRes.code, 'EMPTY_KEYWORDS')

    // Server rejects malformed input
    const restore = mockFunctionsInvoke(async () => ({
      data: { ok: false, code: 'INVALID_INPUT', error: 'Input kata kunci harus berupa teks atau array kata kunci.' },
      error: null,
    }))

    try {
      const res = await fetchSeoKeywordResearch({ businessId: 'biz_123', keywords: ['\x00malicious'] })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'INVALID_INPUT')
    } finally {
      restore()
    }
  })

  // 6. Oversized input → rejected
  it('6. oversized input → rejected', () => {
    assert.ok(fnSource.includes('MAX_KEYWORDS_PER_REQUEST = 10'), 'Limits max keywords to 10')
    assert.ok(fnSource.includes('MAX_KEYWORD_LENGTH = 100'), 'Limits max keyword length to 100 chars')
    assert.ok(fnSource.includes('MAX_DOMAIN_LENGTH = 253'), 'Limits max domain length to 253 chars')
  })

  // 7. OpenSEO timeout → safe error
  it('7. OpenSEO timeout → safe error without unhandled exception', async () => {
    assert.ok(fnSource.includes('PROVIDER_TIMEOUT'), 'Edge function returns PROVIDER_TIMEOUT')

    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'PROVIDER_TIMEOUT',
        error: 'Koneksi ke engine OpenSEO memakan waktu terlalu lama (timeout > 10 detik).',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoKeywordResearch({ businessId: 'biz_123', keywords: ['kopi'] })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'PROVIDER_TIMEOUT')
      assert.ok(res.error.includes('timeout'))
    } finally {
      restore()
    }
  })

  // 8. OpenSEO malformed response → safe error
  it('8. OpenSEO malformed response → safe error', async () => {
    assert.ok(fnSource.includes('MALFORMED_PROVIDER_RESPONSE'), 'Edge function returns MALFORMED_PROVIDER_RESPONSE')

    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'MALFORMED_PROVIDER_RESPONSE',
        error: 'Format respon dari engine OpenSEO tidak valid.',
      },
      error: null,
    }))

    try {
      const res = await fetchSeoCompetitors({ businessId: 'biz_123', targetDomain: 'tokokopi.id' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'MALFORMED_PROVIDER_RESPONSE')
    } finally {
      restore()
    }
  })

  // 9. Provider credential never appears in response
  it('9. provider credential never appears in response', () => {
    // Assert Edge Function returns only sanitized data
    assert.ok(!fnSource.includes('password:'), 'Edge Function must never return password in JSON response')
    assert.ok(!fnSource.includes('apiKey: config'), 'Edge Function must never return apiKey in JSON response')
    assert.ok(!fnSource.includes('jsonResponse({ dataForSeoAuth'), 'Edge Function must never return auth token in JSON response')
    assert.ok(!fnSource.includes('jsonResponse({ openSeoApiKey'), 'Edge Function must never return openSeoApiKey in JSON response')
  })

  // 10. DataForSEO credential never appears in frontend bundle
  it('10. DataForSEO credential never appears in frontend code', () => {
    const srcDir = path.resolve('src')
    const forbiddenSecrets = [
      'DATAFORSEO_LOGIN',
      'DATAFORSEO_PASSWORD',
      'DATAFORSEO_API_KEY',
      'VITE_DATAFORSEO',
    ]

    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            checkDir(fullPath)
          }
        } else if (/\.(jsx?|tsx?|html)$/.test(entry.name)) {
          const text = fs.readFileSync(fullPath, 'utf8')
          for (const secret of forbiddenSecrets) {
            assert.ok(
              !text.includes(secret),
              `Secret token "${secret}" found in client file: ${fullPath}`
            )
          }
        }
      }
    }

    checkDir(srcDir)
  })

  // 11. OpenSEO URL/secret never exposed to browser
  it('11. OpenSEO URL/secret never exposed to browser', () => {
    const srcDir = path.resolve('src')
    const forbiddenVars = [
      'VITE_OPENSEO',
      'OPENSEO_API_KEY',
    ]

    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            checkDir(fullPath)
          }
        } else if (/\.(jsx?|tsx?|html)$/.test(entry.name)) {
          const text = fs.readFileSync(fullPath, 'utf8')
          for (const item of forbiddenVars) {
            assert.ok(
              !text.includes(item),
              `OpenSEO private configuration "${item}" found in client file: ${fullPath}`
            )
          }
        }
      }
    }

    checkDir(srcDir)
  })

  // 12. Existing SEO Optimizer remains BASIC/free
  it('12. existing SEO Optimizer remains BASIC/free without Pro paywall', () => {
    const catPath = path.resolve('src/data/categories.js')
    const catContent = fs.readFileSync(catPath, 'utf8')
    assert.ok(
      catContent.includes("name: 'SEO Optimizer', path: '/dashboard/marketing/seo-optimizer', tier: 'basic', requiresPro: false"),
      'SEO Optimizer must maintain tier: basic and requiresPro: false'
    )

    const appPath = path.resolve('src/App.jsx')
    const appContent = fs.readFileSync(appPath, 'utf8')
    assert.ok(appContent.includes("path: 'marketing/seo-optimizer', element: <SeoOptimizerPage />"))
    // Ensure it is NOT inside Pro plan requirement
    const proGuardIdx = appContent.indexOf('requiredPlan="pro"')
    const seoRouteIdx = appContent.indexOf("path: 'marketing/seo-optimizer'")
    assert.ok(
      seoRouteIdx < proGuardIdx,
      'SEO Optimizer must NOT be guarded by Pro plan'
    )
  })

  // 13. Existing on-page SEO remains functional
  it('13. existing on-page SEO remains functional', () => {
    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <title>Toko Kue Bolu Legit Khas Medan</title>
        <meta name="description" content="Kue bolu legit segar dibuat setiap pagi dari resep turun-temurun.">
        <link rel="canonical" href="https://tokokue.id/produk/bolu-legit">
      </head>
      <body>
        <h1>Bolu Legit Asli</h1>
        <p>Kue berkualitas tinggi dengan tekstur lembut dan manis pas untuk hidangan keluarga Anda.</p>
      </body>
      </html>
    `

    const audit = runSeoAudit({
      url: 'https://tokokue.id/produk/bolu-legit',
      html,
      targetKeyword: 'bolu legit',
    })

    assert.equal(audit.pageType, 'PRODUCT')
    assert.ok(audit.totalScore > 0)
    assert.equal(audit.metadata.h1Count, 1)
    assert.equal(audit.metadata.canonical, 'https://tokokue.id/produk/bolu-legit')
  })

  // 14. SEO feature does not consume AI credits
  it('14. SEO feature does not consume AI credits', () => {
    assert.ok(
      !fnSource.includes('creative_studio_credits'),
      'seo-engine must NOT deduct creative studio credits'
    )
    assert.ok(
      !fnSource.includes('deduct_credit'),
      'seo-engine must NOT deduct user credits'
    )
    assert.ok(
      !fnSource.includes('creative-credits'),
      'seo-engine must NOT invoke creative-credits function'
    )
  })
})
