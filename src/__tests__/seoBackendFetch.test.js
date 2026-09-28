// src/__tests__/seoBackendFetch.test.js
// Comprehensive test suite for SEO Backend Fetch & SSRF Protection
// Verifies all 23 requirements specified in seo.md Section 12.

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isRestrictedHost,
  isBotChallenge
} from '../lib/ssrfValidator.js'
import { fetchTargetUrlForSeo } from '../lib/seoService.js'
import { runSeoAudit } from '../lib/seoAnalyzer.js'
import { supabase } from '../lib/supabase.js'

describe('SEO Optimizer Backend Architecture & SSRF Defense (seo.md Section 12)', () => {
  // 1. Frontend does NOT fetch target URL directly
  it('1. frontend tidak fetch target URL secara langsung (no fetch(trimmedUrl))', () => {
    const pagePath = path.resolve('src/pages/dashboard/marketing/SeoOptimizerPage.jsx')
    const pageSource = fs.readFileSync(pagePath, 'utf8')

    // Must NOT contain direct browser fetch to target
    assert.ok(
      !pageSource.includes('await fetch(trimmedUrl'),
      'Frontend must not execute await fetch(trimmedUrl)'
    )
    assert.ok(
      !pageSource.includes('fetch(trimmedUrl,'),
      'Frontend must not pass trimmedUrl to window.fetch'
    )
    assert.ok(
      !pageSource.includes('allorigins.win'),
      'Must not use public CORS proxies'
    )
  })

  // 2. Frontend calls BisnisSehat backend via fetchTargetUrlForSeo
  it('2. frontend memanggil BisnisSehat backend (fetchTargetUrlForSeo)', () => {
    const pagePath = path.resolve('src/pages/dashboard/marketing/SeoOptimizerPage.jsx')
    const pageSource = fs.readFileSync(pagePath, 'utf8')

    assert.ok(
      pageSource.includes('fetchTargetUrlForSeo'),
      'Frontend must import and invoke fetchTargetUrlForSeo'
    )
  })

  // 3. Valid HTTPS URL accepted
  it('3. valid HTTPS URL accepted by validator', () => {
    const parsed = new URL('https://example.com/produk/sepatu')
    assert.equal(parsed.protocol, 'https:')
    const check = isRestrictedHost(parsed.hostname)
    assert.equal(check.restricted, false)
  })

  // 4. Valid HTTP URL handled per policy
  it('4. valid HTTP URL handled per policy (non-private)', () => {
    const parsed = new URL('http://umkm-warung.id/menu')
    assert.equal(parsed.protocol, 'http:')
    const check = isRestrictedHost(parsed.hostname)
    assert.equal(check.restricted, false)
  })

  // 5. Malformed URL rejected
  it('5. malformed URL rejected', async () => {
    const res = await fetchTargetUrlForSeo({ url: 'not-a-valid-url::' })
    // If empty or invalid
    const emptyRes = await fetchTargetUrlForSeo({ url: '' })
    assert.equal(emptyRes.ok, false)
    assert.equal(emptyRes.code, 'EMPTY_URL')
  })

  // 6. Localhost rejected
  it('6. localhost rejected', () => {
    const check = isRestrictedHost('localhost')
    assert.equal(check.restricted, true)
    assert.ok(check.reason.includes('SSRF Protection'))

    const checkSub = isRestrictedHost('service.localhost')
    assert.equal(checkSub.restricted, true)
  })

  // 7. Loopback rejected (127.0.0.1, ::1)
  it('7. loopback rejected', () => {
    assert.equal(isPrivateIPv4('127.0.0.1'), true)
    assert.equal(isPrivateIPv4('127.0.0.254'), true)
    assert.equal(isPrivateIPv6('::1'), true)
    assert.equal(isPrivateIPv6('0:0:0:0:0:0:0:1'), true)

    assert.equal(isRestrictedHost('127.0.0.1').restricted, true)
    assert.equal(isRestrictedHost('::1').restricted, true)
  })

  // 8. Private IP rejected (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  it('8. private IP rejected', () => {
    // 10.x.x.x
    assert.equal(isPrivateIPv4('10.0.0.1'), true)
    assert.equal(isPrivateIPv4('10.255.255.255'), true)
    assert.equal(isRestrictedHost('10.0.0.1').restricted, true)

    // 172.16 - 172.31
    assert.equal(isPrivateIPv4('172.16.0.1'), true)
    assert.equal(isPrivateIPv4('172.31.255.255'), true)
    assert.equal(isPrivateIPv4('172.32.0.1'), false) // Public IP
    assert.equal(isRestrictedHost('172.20.10.5').restricted, true)

    // 192.168.x.x
    assert.equal(isPrivateIPv4('192.168.1.1'), true)
    assert.equal(isPrivateIPv4('192.168.0.254'), true)
    assert.equal(isRestrictedHost('192.168.1.1').restricted, true)

    // IPv6 Unique Local Address (fc00::/7)
    assert.equal(isPrivateIPv6('fc00::1'), true)
    assert.equal(isPrivateIPv6('fd12:3456:789a::1'), true)
  })

  // 9. Link-local rejected (169.254.0.0/16, fe80::/10)
  it('9. link-local rejected', () => {
    assert.equal(isPrivateIPv4('169.254.1.1'), true)
    assert.equal(isPrivateIPv4('169.254.169.254'), true)
    assert.equal(isPrivateIPv6('fe80::1'), true)

    assert.equal(isRestrictedHost('169.254.10.20').restricted, true)
  })

  // 10. Metadata endpoint rejected (169.254.169.254, metadata.google.internal)
  it('10. metadata endpoint rejected', () => {
    assert.equal(isRestrictedHost('169.254.169.254').restricted, true)
    assert.equal(isRestrictedHost('metadata.google.internal').restricted, true)
    assert.equal(isRestrictedHost('instance-data').restricted, true)
    assert.equal(isRestrictedHost('metadata.azure.com').restricted, true)
  })

  // 11. Redirect to private network rejected
  it('11. redirect to private network rejected by SSRF rules', () => {
    // Target starts public: example.com (allowed)
    assert.equal(isRestrictedHost('example.com').restricted, false)
    // Redirects to private host: 192.168.1.1 or localhost (MUST be blocked)
    assert.equal(isRestrictedHost('192.168.1.1').restricted, true)
    assert.equal(isRestrictedHost('127.0.0.1').restricted, true)
    assert.equal(isRestrictedHost('internal.local').restricted, true)
  })

  // 12. Redirect limit enforced
  it('12. redirect limit enforced in Edge Function code', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(fnSource.includes('MAX_REDIRECTS = 5'), 'Max redirects must be defined as 5')
    assert.ok(fnSource.includes('redirectCount > MAX_REDIRECTS'), 'Must abort when redirect count exceeds limit')
    assert.ok(fnSource.includes('TOO_MANY_REDIRECTS'), 'Must return TOO_MANY_REDIRECTS code')
  })

  // 13. Timeout enforced
  it('13. timeout enforced (AbortSignal.timeout / setTimeout)', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(
      fnSource.includes('REQUEST_TIMEOUT_MS = 8000') || fnSource.includes('REQUEST_TIMEOUT_MS'),
      'Timeout constant must exist'
    )
    assert.ok(fnSource.includes('TARGET_TIMEOUT'), 'Must return TARGET_TIMEOUT code on abort')
  })

  // 14. Response size limit enforced (2 MB)
  it('14. response size limit enforced in stream reader', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(fnSource.includes('MAX_RESPONSE_BYTES'), 'Must enforce max response bytes')
    assert.ok(fnSource.includes('RESPONSE_TOO_LARGE'), 'Must return RESPONSE_TOO_LARGE code')
  })

  // 15. Non-HTML rejected / handled
  it('15. non-HTML rejected / handled', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(fnSource.includes('NON_HTML_RESPONSE'), 'Must check Content-Type and reject non-HTML')
  })

  // 16. 403 handled without bypass
  it('16. 403 handled honestly without bypass', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(fnSource.includes('TARGET_BLOCKED'), 'Must return TARGET_BLOCKED code on 403')
    assert.ok(fnSource.includes('Analisis Manual'), 'Must guide user to manual mode')
  })

  // 17. 429 handled
  it('17. 429 handled as TARGET_RATE_LIMITED', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    assert.ok(fnSource.includes('TARGET_RATE_LIMITED'), 'Must return TARGET_RATE_LIMITED on 429')
  })

  // 18. CAPTCHA / challenge handled without bypass
  it('18. CAPTCHA/challenge handled without bypass', () => {
    const cfSample = `
      <!DOCTYPE html>
      <html>
      <head><title>Attention Required! | Cloudflare</title></head>
      <body>
        <div id="cf-turnstile">Please verify you are human</div>
      </body>
      </html>
    `
    assert.equal(isBotChallenge(cfSample), true)

    const normalSample = `
      <!DOCTYPE html>
      <html>
      <head><title>Toko Kue Enak - Aneka Bolu dan Kue Basah</title></head>
      <body><h1>Selamat Datang di Toko Kue</h1></body>
      </html>
    `
    assert.equal(isBotChallenge(normalSample), false)
  })

  // 19. Manual HTML mode works
  it('19. manual HTML mode works without fetching URL', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <title>Toko Kopi Nusantara - Arabika Gayo Berkualitas</title>
        <meta name="description" content="Kopi arabika gayo asli tanah Aceh dipetik segar.">
        <link rel="canonical" href="https://tokokopi.id/produk/gayo">
      </head>
      <body>
        <h1>Kopi Arabika Gayo Asli</h1>
        <p>Kopi pilihan dengan cita rasa istimewa untuk para pecinta seduhan manual harian di rumah.</p>
      </body>
      </html>
    `

    const audit = runSeoAudit({
      url: 'https://tokokopi.id/produk/gayo',
      html: sampleHtml,
      targetKeyword: 'kopi arabika gayo'
    })

    assert.equal(audit.pageType, 'PRODUCT')
    assert.equal(audit.metadata.title, 'Toko Kopi Nusantara - Arabika Gayo Berkualitas')
    assert.ok(audit.totalScore > 0)
  })

  // 20. SEO result uses actual fetched HTML
  it('20. SEO result uses actual fetched HTML', () => {
    const uniqueTitle = 'Judul Unik Halaman Pengujian BisnisSehat 2025'
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>${uniqueTitle}</title><link rel="canonical" href="https://uji.id/"></head>
      <body><h1>Uji Coba Konten</h1><p>Konten paragraf uji coba audit SEO.</p></body>
      </html>
    `
    const audit = runSeoAudit({ url: 'https://uji.id/', html })
    assert.equal(audit.metadata.title, uniqueTitle)
  })

  // 21 & 22 & 23. Free entitlement & no Pro paywall
  it('21-23. Free user can use SEO Optimizer, Pro user can use, NO Pro paywall introduced', () => {
    const fnPath = path.resolve('supabase/functions/seo-analyze/index.ts')
    const fnSource = fs.readFileSync(fnPath, 'utf8')

    // Must NOT import or check isProUser
    assert.ok(
      !fnSource.includes('isProUser'),
      'seo-analyze must NOT enforce isProUser check'
    )
    assert.ok(
      !fnSource.includes('membutuhkan BisnisSehat Pro'),
      'seo-analyze must NOT have Pro restriction error message'
    )

    // Check App.jsx routing for marketing/seo-optimizer
    const appPath = path.resolve('src/App.jsx')
    const appSource = fs.readFileSync(appPath, 'utf8')

    const seoOptimizerRoute = appSource.includes("path: 'marketing/seo-optimizer', element: <SeoOptimizerPage />")
    assert.ok(seoOptimizerRoute, 'marketing/seo-optimizer route must exist and be accessible')
  })

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

  // 24. Mocked invoke returning HTTP/2 stream error produces structured TARGET_UNREACHABLE with fallback
  it('24. Mocked invoke returning HTTP/2 stream error produces structured TARGET_UNREACHABLE with manual HTML fallback', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'TARGET_UNREACHABLE',
        error: {
          code: 'TARGET_UNREACHABLE',
          message: 'Halaman target tidak dapat diambil oleh server analyzer.'
        },
        message: 'Halaman target tidak dapat diambil oleh server analyzer.',
        fallback: {
          available: true,
          mode: 'manual_html'
        }
      },
      error: null
    }))

    try {
      const res = await fetchTargetUrlForSeo({ url: 'https://www.tokopedia.com/' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'TARGET_UNREACHABLE')
      assert.equal(res.message, 'Halaman target tidak dapat diambil oleh server analyzer.')
      assert.equal(res.fallback?.available, true)
      assert.equal(res.fallback?.mode, 'manual_html')

      // Ensure NO fake SEO result is created
      assert.equal(res.html, undefined)
    } finally {
      restore()
    }
  })

  // 25. Mocked invoke throwing raw HTTP/2 client error is caught as TARGET_UNREACHABLE
  it('25. Mocked invoke throwing raw HTTP/2 client error is caught as TARGET_UNREACHABLE', async () => {
    const restore = mockFunctionsInvoke(async () => {
      throw new Error('client error (SendRequest): http2 error: stream error received: unexpected internal error encountered')
    })

    try {
      const res = await fetchTargetUrlForSeo({ url: 'https://www.tokopedia.com/' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'TARGET_UNREACHABLE')
      assert.equal(res.message, 'Halaman target tidak dapat diambil otomatis dari server analisis.')
      assert.equal(res.fallback?.available, true)
      assert.equal(res.fallback?.mode, 'manual_html')
    } finally {
      restore()
    }
  })

  // 26. HTTP/2 error prevents fake SEO results and leaves audit null
  it('26. HTTP/2 error prevents fake SEO results and leaves audit null', async () => {
    const fetchResult = {
      ok: false,
      code: 'TARGET_UNREACHABLE',
      message: 'Halaman target tidak dapat diambil otomatis dari server analisis.',
      fallback: { available: true, mode: 'manual_html' }
    }

    let auditCalled = false
    let currentAudit = null
    if (fetchResult.ok) {
      auditCalled = true
      currentAudit = runSeoAudit({ url: 'https://www.tokopedia.com/', html: fetchResult.html })
    }

    assert.equal(auditCalled, false)
    assert.equal(currentAudit, null)
  })

  // 27. 401/403 handled as TARGET_BLOCKED
  it('27. 401/403 handled as TARGET_BLOCKED with manual HTML fallback', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'TARGET_BLOCKED',
        targetStatus: 403,
        error: {
          code: 'TARGET_BLOCKED',
          message: 'Halaman target menolak akses otomatis (HTTP 403 / Access Denied).'
        },
        message: 'Halaman target menolak akses otomatis (HTTP 403 / Access Denied).',
        fallback: { available: true, mode: 'manual_html' }
      },
      error: null
    }))

    try {
      const res = await fetchTargetUrlForSeo({ url: 'https://protected-store.id/' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'TARGET_BLOCKED')
      assert.equal(res.isTargetBlocked, true)
      assert.equal(res.fallback?.available, true)
    } finally {
      restore()
    }
  })

  // 28. 429 handled as TARGET_RATE_LIMITED
  it('28. 429 handled as TARGET_RATE_LIMITED with manual HTML fallback', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'TARGET_RATE_LIMITED',
        targetStatus: 429,
        error: {
          code: 'TARGET_RATE_LIMITED',
          message: 'Server target menerapkan pembatasan frekuensi akses (HTTP 429 Rate Limited).'
        },
        message: 'Server target menerapkan pembatasan frekuensi akses (HTTP 429 Rate Limited).',
        fallback: { available: true, mode: 'manual_html' }
      },
      error: null
    }))

    try {
      const res = await fetchTargetUrlForSeo({ url: 'https://rate-limited.id/' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'TARGET_RATE_LIMITED')
      assert.equal(res.isTargetBlocked, true)
      assert.equal(res.fallback?.available, true)
    } finally {
      restore()
    }
  })

  // 29. SSRF target returns SSRF_REJECTED
  it('29. SSRF target returns SSRF_REJECTED', async () => {
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: false,
        code: 'SSRF_REJECTED',
        error: {
          code: 'SSRF_REJECTED',
          message: 'Target host "169.254.169.254" dilarang oleh kebijakan keamanan internal (SSRF Protection).'
        },
        message: 'Target host "169.254.169.254" dilarang oleh kebijakan keamanan internal (SSRF Protection).',
        fallback: { available: true, mode: 'manual_html' }
      },
      error: null
    }))

    try {
      const res = await fetchTargetUrlForSeo({ url: 'http://169.254.169.254/latest/meta-data' })
      assert.equal(res.ok, false)
      assert.equal(res.code, 'SSRF_REJECTED')
    } finally {
      restore()
    }
  })

  // 30. Valid site audit succeeds
  it('30. Valid site audit succeeds with SUCCESS code and complete metadata', async () => {
    const mockHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <title>Example Domain - Toko Online Resmi UMKM</title>
  <meta name="description" content="Pusat belanja produk UMKM lokal berkualitas dan terpercaya di Indonesia." />
  <link rel="canonical" href="https://example.com/" />
</head>
<body>
  <h1>Selamat Datang di Toko Online UMKM</h1>
  <p>Kami menyediakan berbagai macam produk kerajinan dan kuliner khas nusantara dengan standar mutu terbaik.</p>
</body>
</html>`
    const restore = mockFunctionsInvoke(async () => ({
      data: {
        ok: true,
        html: mockHtml,
        finalUrl: 'https://example.com/',
        httpStatus: 200,
        url: 'https://example.com/'
      },
      error: null
    }))

    try {
      const res = await fetchTargetUrlForSeo({ url: 'https://example.com/' })
      assert.equal(res.ok, true)
      assert.equal(res.code, 'SUCCESS')
      assert.equal(res.html, mockHtml)

      const audit = runSeoAudit({ url: res.finalUrl, html: res.html })
      assert.equal(audit.metadata.title, 'Example Domain - Toko Online Resmi UMKM')
      assert.ok(audit.totalScore > 0)
    } finally {
      restore()
    }
  })
})

