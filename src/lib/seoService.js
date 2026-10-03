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
 * Normalizes SEO engine errors to eliminate all provider names,
 * HTTP status codes, and server implementation details from public view.
 * Guarantees graceful degradation without leaking provider identity.
 */
export function normalizeSeoError(rawError, code) {
  let msg = typeof rawError === 'string' ? rawError : rawError?.message || rawError?.error || ''

  // Eliminate any mentions of third-party providers or internal hostnames
  msg = msg
    .replace(/openseo/gi, '')
    .replace(/dataforseo/gi, '')
    .replace(/api\.dataforseo\.com/gi, '')

  // Eliminate raw codes, payment messages, numbers
  msg = msg
    .replace(/\b(40200|40210|40102|40103|50301)\b/g, '')
    .replace(/insufficient\s+funds/gi, '')
    .replace(/payment\s+required/gi, '')
    .replace(/credit\s+exhausted/gi, '')
    .replace(/provider\s+exception/gi, '')
    .replace(/\(HTTP \d+\)/gi, '')
    .replace(/\(Status \d+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (['PROVIDER_NOT_CONFIGURED', 'PROVIDER_ERROR', 'PROVIDER_UNAVAILABLE', 'INSUFFICIENT_FUNDS', 'PAYMENT_REQUIRED', 'TASK_EXECUTION_FAILED'].includes(code)) {
    return 'Data pencarian sementara tidak tersedia.'
  }
  if (code === 'PROVIDER_TIMEOUT') {
    return 'Koneksi ke layanan data SEO memakan waktu terlalu lama (timeout). Silakan coba lagi.'
  }
  if (code === 'NO_SEARCH_RESULTS') {
    return 'Data belum tersedia.'
  }
  if (code === 'MALFORMED_PROVIDER_RESPONSE') {
    return 'Format data dari layanan SEO sementara tidak sesuai standar. Silakan coba kembali.'
  }
  if (code === 'FETCH_FAILED' && (!msg || msg.includes('Failed to fetch') || msg.includes('Load failed'))) {
    return 'Koneksi ke layanan analisis SEO terputus. Silakan periksa jaringan Anda.'
  }

  // Safety net: if message still contains any provider leaks, return clean message
  if (
    /openseo|dataforseo|40200|40210|40102|40103|50301|insufficient|payment\s*required|stack/i.test(msg)
  ) {
    return 'Data pencarian sementara tidak tersedia.'
  }

  return msg || 'Data pencarian sementara tidak tersedia.'
}

const DEGRADED_CODES = [
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_ERROR',
  'PROVIDER_UNAVAILABLE',
  'INSUFFICIENT_FUNDS',
  'PAYMENT_REQUIRED',
  'TASK_EXECUTION_FAILED',
  'PROVIDER_TIMEOUT',
  'MALFORMED_PROVIDER_RESPONSE',
  'FETCH_FAILED',
]

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
      const code = parsed?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(parsed?.error || error.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    if (!data || data.ok === false) {
      const code = data?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(data?.error || data?.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: data?.fallback || {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    return { ...data, isDegraded: false }
  } catch (err) {
    const cleanError = normalizeSeoError(err?.message, 'CLIENT_ERROR')
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: cleanError,
      message: cleanError,
      isDegraded: true,
      fallback: {
        available: true,
        mode: 'on_page_audit',
        message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
      },
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
      const code = parsed?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(parsed?.error || error.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    if (!data || data.ok === false) {
      const code = data?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(data?.error || data?.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: data?.fallback || {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    return { ...data, isDegraded: false }
  } catch (err) {
    const cleanError = normalizeSeoError(err?.message, 'CLIENT_ERROR')
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: cleanError,
      message: cleanError,
      isDegraded: true,
      fallback: {
        available: true,
        mode: 'on_page_audit',
        message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
      },
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
      const code = parsed?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(parsed?.error || error.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    if (!data || data.ok === false) {
      const code = data?.code || 'FETCH_FAILED'
      const cleanError = normalizeSeoError(data?.error || data?.message, code)
      const isDegraded = DEGRADED_CODES.includes(code)
      return {
        ok: false,
        code,
        error: cleanError,
        message: cleanError,
        isDegraded,
        fallback: data?.fallback || {
          available: true,
          mode: 'on_page_audit',
          message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
        },
      }
    }

    return { ...data, isDegraded: false }
  } catch (err) {
    const cleanError = normalizeSeoError(err?.message, 'CLIENT_ERROR')
    return {
      ok: false,
      code: 'CLIENT_ERROR',
      error: cleanError,
      message: cleanError,
      isDegraded: true,
      fallback: {
        available: true,
        mode: 'on_page_audit',
        message: 'Fitur Audit On-Page SEO lokal tetap aktif dan dapat digunakan sepenuhnya.',
      },
    }
  }
}

