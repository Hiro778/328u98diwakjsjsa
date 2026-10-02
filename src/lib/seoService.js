/**
 * SEO Service — Client-side communication with BisnisSehat Edge Functions
 *
 * Implements Context7 patterns for @supabase/supabase-js:
 * - Direct invocation via supabase.functions.invoke
 * - Structured error handling with FunctionsHttpError / error.context.json()
 * - Target blocked / bot-protection awareness
 * - Zero direct browser-to-target CORS requests
 */

import { supabase } from './supabase.js'

/**
 * Fetch a target website's HTML through BisnisSehat secure Edge Function.
 * Avoids browser CORS restrictions and enforces server-side SSRF protection.
 *
 * @param {Object} params
 * @param {string} params.url - The public URL to audit
 * @param {string} [params.targetKeyword] - Optional target keyword
 * @returns {Promise<{ ok: boolean, html?: string, finalUrl?: string, httpStatus?: number, error?: string, message?: string, code?: string, isTargetBlocked?: boolean }>}
 */
export async function fetchTargetUrlForSeo({ url, targetKeyword = '' }) {
  const trimmedUrl = String(url || '').trim()
  if (!trimmedUrl) {
    return {
      ok: false,
      code: 'EMPTY_URL',
      error: 'Masukkan URL yang ingin dianalisis terlebih dahulu.',
      message: 'Masukkan URL yang ingin dianalisis terlebih dahulu.'
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('seo-analyze', {
      body: {
        url: trimmedUrl,
        targetKeyword: String(targetKeyword || '').trim()
      }
    })

    // Handle Edge Function HTTP or Network errors
    if (error) {
      let parsedError = null
      if (error.context && typeof error.context.json === 'function') {
        try {
          parsedError = await error.context.json()
        } catch {
          // context already consumed or not JSON
        }
      }

      const errorMessage =
        parsedError?.message ||
        parsedError?.error ||
        error.message ||
        'Gagal mengambil halaman target dari server.'

      const errorCode = parsedError?.code || 'FETCH_FAILED'
      const isBlocked = ['TARGET_BLOCKED', 'TARGET_RATE_LIMITED'].includes(errorCode)

      console.groupCollapsed?.('[seoService] Edge Function Error')
      console.warn('Error name:', error.name)
      console.warn('Error message:', error.message)
      if (parsedError) console.warn('Parsed response:', parsedError)
      console.groupEnd?.()

      return {
        ok: false,
        code: errorCode,
        error: errorMessage,
        message: errorMessage,
        isTargetBlocked: isBlocked,
        targetStatus: parsedError?.targetStatus
      }
    }

    // Handle application-level error response from function
    if (!data || data.ok === false) {
      const code = data?.error?.code || data?.code || 'TARGET_UNREACHABLE'
      const message =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        'Halaman target tidak dapat diambil untuk audit otomatis.'
      const isBlocked = ['TARGET_BLOCKED', 'TARGET_RATE_LIMITED'].includes(code)
      const fallback = data?.fallback || { available: true, mode: 'manual_html' }

      console.groupCollapsed?.('[seoService] Target / Security Response')
      console.info('Code:', code)
      console.info('Message:', message)
      if (data?.targetStatus) console.info('Target Status:', data.targetStatus)
      console.groupEnd?.()

      return {
        ok: false,
        code,
        error: message,
        message,
        fallback,
        isTargetBlocked: isBlocked,
        targetStatus: data?.targetStatus
      }
    }

    return {
      ok: true,
      html: data.html || '',
      finalUrl: data.finalUrl || trimmedUrl,
      httpStatus: data.httpStatus || 200,
      url: data.url || trimmedUrl,
      code: 'SUCCESS'
    }
  } catch (err) {
    const rawMsg = err?.message || ''
    const isHttp2Err =
      rawMsg.includes('http2') ||
      rawMsg.includes('stream error') ||
      rawMsg.includes('SendRequest') ||
      rawMsg.includes('unexpected internal error')

    const code = isHttp2Err ? 'TARGET_UNREACHABLE' : 'CLIENT_INVOKE_ERROR'
    const message = isHttp2Err
      ? 'Halaman target tidak dapat diambil otomatis dari server analisis.'
      : (rawMsg || 'Terjadi kesalahan saat memproses permintaan SEO.')

    return {
      ok: false,
      code,
      error: message,
      message,
      fallback: { available: true, mode: 'manual_html' },
      isTargetBlocked: false
    }
  }
}

/**
 * Invoke external SEO engine for keyword research.
 * Strictly requires businessId for tenant isolation and server-side IDOR defense.
 *
 * @param {Object} params
 * @param {string} params.businessId - Current active business ID
 * @param {string[]|string} params.keywords - Keyword or array of keywords to analyze
 * @param {number} [params.locationCode=2360] - Country location code (default 2360 for ID)
 * @param {string} [params.languageCode='id'] - Language code (default 'id')
 */
export async function fetchSeoKeywordResearch({ businessId, keywords, locationCode = 2360, languageCode = 'id' }) {
  if (!businessId) {
    return { ok: false, code: 'MISSING_BUSINESS_ID', error: 'ID Bisnis aktif diperlukan untuk riset kata kunci.' }
  }

  const keywordList = Array.isArray(keywords)
    ? keywords.map(k => String(k).trim()).filter(Boolean)
    : [String(keywords || '').trim()].filter(Boolean)

  if (keywordList.length === 0) {
    return { ok: false, code: 'EMPTY_KEYWORDS', error: 'Masukkan minimal satu kata kunci.' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('seo-engine', {
      body: {
        action: 'keyword-research',
        business_id: businessId,
        keywords: keywordList,
        locationCode,
        languageCode,
      },
    })

    if (error) {
      let parsed = null
      try {
        if (error.context && typeof error.context.json === 'function') {
          parsed = await error.context.json()
        }
      } catch {}
      return {
        ok: false,
        code: parsed?.code || 'FETCH_FAILED',
        error: parsed?.error || error.message || 'Gagal memproses riset kata kunci.',
      }
    }

    if (!data || data.ok === false) {
      return {
        ok: false,
        code: data?.code || 'FETCH_FAILED',
        error: data?.error || data?.message || 'Gagal memproses riset kata kunci.',
      }
    }

    return data
  } catch (err) {
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: err?.message || 'Terjadi kesalahan saat memanggil engine riset kata kunci.',
    }
  }
}

/**
 * Invoke external SEO engine for SERP competitor insights.
 *
 * @param {Object} params
 * @param {string} params.businessId - Current active business ID
 * @param {string} params.targetDomain - Target domain or website
 * @param {string[]} [params.keywords] - Optional keywords to probe
 */
export async function fetchSeoCompetitors({ businessId, targetDomain, keywords = [] }) {
  if (!businessId) {
    return { ok: false, code: 'MISSING_BUSINESS_ID', error: 'ID Bisnis aktif diperlukan.' }
  }

  const domain = String(targetDomain || '').trim()
  if (!domain) {
    return { ok: false, code: 'EMPTY_DOMAIN', error: 'Domain target tidak boleh kosong.' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('seo-engine', {
      body: {
        action: 'competitor-insights',
        business_id: businessId,
        targetDomain: domain,
        keywords,
      },
    })

    if (error) {
      let parsed = null
      try {
        if (error.context && typeof error.context.json === 'function') {
          parsed = await error.context.json()
        }
      } catch {}
      return {
        ok: false,
        code: parsed?.code || 'FETCH_FAILED',
        error: parsed?.error || error.message || 'Gagal mengambil wawasan kompetitor.',
      }
    }

    if (!data || data.ok === false) {
      return {
        ok: false,
        code: data?.code || 'FETCH_FAILED',
        error: data?.error || data?.message || 'Gagal mengambil wawasan kompetitor.',
      }
    }

    return data
  } catch (err) {
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: err?.message || 'Terjadi kesalahan saat memanggil wawasan kompetitor.',
    }
  }
}

/**
 * Invoke external SEO engine for backlinks summary.
 *
 * @param {Object} params
 * @param {string} params.businessId - Current active business ID
 * @param {string} params.targetDomain - Target domain
 */
export async function fetchSeoBacklinks({ businessId, targetDomain }) {
  if (!businessId) {
    return { ok: false, code: 'MISSING_BUSINESS_ID', error: 'ID Bisnis aktif diperlukan.' }
  }

  const domain = String(targetDomain || '').trim()
  if (!domain) {
    return { ok: false, code: 'EMPTY_DOMAIN', error: 'Domain target tidak boleh kosong.' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('seo-engine', {
      body: {
        action: 'backlinks-overview',
        business_id: businessId,
        targetDomain: domain,
      },
    })

    if (error) {
      let parsed = null
      try {
        if (error.context && typeof error.context.json === 'function') {
          parsed = await error.context.json()
        }
      } catch {}
      return {
        ok: false,
        code: parsed?.code || 'FETCH_FAILED',
        error: parsed?.error || error.message || 'Gagal mengambil profil backlink.',
      }
    }

    return data || { ok: false, code: 'EMPTY_RESPONSE', error: 'Tidak ada data backlink.' }
  } catch (err) {
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: err?.message || 'Terjadi kesalahan saat memanggil ringkasan backlink.',
    }
  }
}

