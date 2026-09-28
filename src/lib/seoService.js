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
