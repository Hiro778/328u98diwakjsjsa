/**
 * Legalitas Service — handles all legal check and logo analysis operations.
 *
 * Calls Supabase Edge Functions for server-side API calls.
 * Credentials and API keys are NEVER exposed to the frontend.
 */

import { supabase } from './supabase'

/**
 * Check business legality across 5 government sources.
 * Calls the legalitas-check Edge Function.
 *
 * @param {{ businessName: string, brandName?: string, nibNumber?: string, productCategory?: string, businessEntityType?: string }} input
 * @returns {{ checkId: string, results: Array } | { error: string }}
 */
export async function checkBusinessLegalitas(input) {
  const FN = 'legalitas-check'
  const payload = {
    businessName: input.businessName ? '(present)' : '(missing)',
    businessEntityType: input.businessEntityType || '(none)',
  }

  // Pre-flight: verify session is valid
  const sessionValid = await ensureValidSession()
  if (!sessionValid) {
    console.error(`[legalitasService] ${FN} — no valid session, requesting login`)
    return { error: 'Sesi Anda telah berakhir. Silakan masuk kembali.' }
  }

  try {
    const { data, error, response } = await supabase.functions.invoke(FN, {
      body: input,
    })

    if (error) {
      const errorName = error?.name || ''
      const errorMsg = error?.message || ''

      console.group(`[legalitasService] ${FN} failed`)
      console.error('function:', FN)
      console.error('payload:', payload)
      console.error('error.name:', errorName)
      console.error('error.message:', errorMsg)
      console.error('error.context:', error?.context)
      console.error('error.status:', error?.status)
      if (response) {
        console.error('response.status:', response.status)
        try {
          const body = await response.clone().text()
          console.error('response.body:', body)
        } catch { /* body already consumed */ }
      }
      console.groupEnd()

      if (errorName === 'FunctionsFetchError') {
        // Network-level failure: DNS, CORS, timeout, or no internet
        return { error: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda dan coba lagi.' }
      }

      if (errorName === 'FunctionsHttpError') {
        const status = response?.status || error?.status
        if (status === 401 || status === 403) {
          return { error: 'Sesi Anda tidak valid. Silakan masuk kembali.' }
        }
        if (status === 500) {
          let serverError = errorMsg
          try {
            if (response) {
              const body = await response.clone().json()
              serverError = body?.error || body?.message || errorMsg
            }
          } catch { /* ignore parse error */ }
          return { error: `Server sedang mengalami masalah. Detail: ${serverError}` }
        }
        return { error: `Pengecekan gagal (HTTP ${status}). Silakan coba lagi.` }
      }

      return { error: 'Gagal menghubungi layanan pengecekan legalitas. Silakan coba lagi.' }
    }

    if (!data?.data) {
      console.warn(`[legalitasService] ${FN} returned empty data:`, data)
      return { error: 'Tidak ada response dari server' }
    }

    return data.data
  } catch (err) {
    console.group(`[legalitasService] ${FN} exception`)
    console.error('function:', FN)
    console.error('payload:', payload)
    console.error('error.name:', err?.name)
    console.error('error.message:', err?.message)
    console.error('full error:', err)
    console.groupEnd()

    if (err?.message?.includes('JWT') || err?.message?.includes('expired') || err?.message?.includes('invalid')) {
      return { error: 'Sesi Anda telah berakhir. Silakan masuk kembali.' }
    }

    return { error: 'Terjadi kesalahan tidak terduga. Silakan coba lagi.' }
  }
}

/**
 * Ensure we have a valid session before calling Edge Functions.
 * Refreshes the session if it's about to expire.
 */
async function ensureValidSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[legalitasService] getSession error:', error.message)
      return false
    }
    if (!session) {
      console.warn('[legalitasService] No active session — user may not be logged in')
      return false
    }
    // Check if token is close to expiry (within 5 minutes)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    const now = Date.now()
    const FIVE_MINUTES = 5 * 60 * 1000
    if (expiresAt && expiresAt - now < FIVE_MINUTES) {
      console.log('[legalitasService] Token near expiry, refreshing...')
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        console.warn('[legalitasService] Session refresh failed:', refreshError.message)
        return false
      }
    }
    return true
  } catch (err) {
    console.warn('[legalitasService] Session check failed:', err.message)
    return false
  }
}

/**
 * Check logo for visual similarity using Google Cloud Vision.
 * Calls the legalitas-logo-check Edge Function.
 *
 * @param {{ imageUrl: string, businessName?: string, imageFilename?: string }} input
 * @returns {{ checkId: string, overallStatus: string, results: Array, error?: string } | { error: string }}
 */
export async function checkLogoSimilarity(input) {
  const FN = 'legalitas-logo-check'
  const payload = { imageUrl: input.imageUrl ? '(present)' : '(missing)', businessName: input.businessName || '' }

  // Pre-flight: verify session is valid
  const sessionValid = await ensureValidSession()
  if (!sessionValid) {
    console.error(`[legalitasService] ${FN} — no valid session, requesting login`)
    return { error: 'Sesi Anda telah berakhir. Silakan masuk kembali.' }
  }

  try {
    const { data, error, response } = await supabase.functions.invoke(FN, {
      body: input,
    })

    if (error) {
      const errorName = error?.name || ''
      const errorMsg = error?.message || ''

      // Detailed technical log — never log tokens or API keys
      console.group(`[legalitasService] ${FN} failed`)
      console.error('function:', FN)
      console.error('payload:', payload)
      console.error('error.name:', errorName)
      console.error('error.message:', errorMsg)
      console.error('error.context:', error?.context)
      console.error('error.status:', error?.status)
      if (response) {
        console.error('response.status:', response.status)
        try {
          const body = await response.clone().text()
          console.error('response.body:', body)
        } catch { /* body already consumed */ }
      }
      console.groupEnd()

      // Differentiate error types for better user messaging
      if (errorName === 'FunctionsFetchError') {
        // Network-level failure — fetch itself failed
        // Could be: CORS, DNS, blocked by extension, no internet
        console.error(`[legalitasService] ${FN} — FunctionsFetchError (network failure)`)
        return { error: 'Gagal menghubungi server. Periksa koneksi internet Anda dan coba lagi.' }
      }

      if (errorName === 'FunctionsHttpError') {
        // Server responded with non-2xx
        const status = response?.status || error?.status
        if (status === 401 || status === 403) {
          return { error: 'Sesi Anda tidak valid. Silakan masuk kembali.' }
        }
        if (status === 500) {
          // Try to extract the actual error from response body
          let serverError = errorMsg
          try {
            if (response) {
              const body = await response.clone().json()
              serverError = body?.error || body?.message || errorMsg
            }
          } catch { /* ignore parse error */ }
          return { error: `Server error: ${serverError}` }
        }
        return { error: `Request gagal (HTTP ${status}). Silakan coba lagi.` }
      }

      // Generic error fallback
      return { error: 'Gagal menghubungi layanan pemeriksaan logo. Silakan coba lagi.' }
    }

    if (!data?.data) {
      console.warn(`[legalitasService] ${FN} returned empty data:`, data)
      return { error: 'Tidak ada response dari server' }
    }

    return data.data
  } catch (err) {
    console.group(`[legalitasService] ${FN} exception`)
    console.error('function:', FN)
    console.error('payload:', payload)
    console.error('error.name:', err?.name)
    console.error('error.message:', err?.message)
    console.error('full error:', err)
    console.groupEnd()

    // Check if it's an auth-related error
    if (err?.message?.includes('JWT') || err?.message?.includes('expired') || err?.message?.includes('invalid')) {
      return { error: 'Sesi Anda telah berakhir. Silakan masuk kembali.' }
    }

    return { error: 'Terjadi kesalahan tidak terduga. Silakan coba lagi.' }
  }
}

/**
 * Confirm a check result (user manually verified on portal).
 *
 * @param {string} resultId - legal_check_results id
 * @param {string|null} confirmedNumber - registration number if any
 */
export async function confirmCheckResult(resultId, confirmedNumber) {
  const { error } = await supabase
    .from('legal_check_results')
    .update({
      user_confirmed: true,
      confirmed_number: confirmedNumber || null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', resultId)

  if (error) {
    console.error('[legalitasService] confirmCheckResult error:', error)
    return { error: error.message }
  }

  return { success: true }
}

/**
 * Upload logo image to Supabase Storage.
 * Returns the public URL.
 *
 * @param {File} file - JPG/PNG, max 5MB
 * @param {string} businessId - business UUID for folder path
 * @returns {{ url: string, filename: string } | { error: string }}
 */
export async function uploadLogoImage(file, businessId) {
  if (!file) return { error: 'Tidak ada file' }

  const ALLOWED_TYPES = ['image/jpeg', 'image/png']
  const MAX_SIZE = 5 * 1024 * 1024

  const ext = file.name.split('.').pop().toLowerCase()
  if (!ALLOWED_TYPES.includes(file.type) && !['jpg', 'jpeg', 'png'].includes(ext)) {
    return { error: 'Format tidak didukung. Hanya JPG atau PNG.' }
  }

  if (file.size > MAX_SIZE) {
    return { error: 'Ukuran file melebihi batas maksimal 5MB.' }
  }

  const folder = businessId || 'temp'
  const fileName = `logo-check/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
  const filePath = `${folder}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('business-assets')
    .upload(filePath, file, { upsert: true })

  if (uploadError) {
    console.error('[legalitasService] uploadLogoImage error:', uploadError)
    return { error: `Gagal mengupload: ${uploadError.message}` }
  }

  const { data } = supabase.storage.from('business-assets').getPublicUrl(filePath)
  return { url: data.publicUrl, filename: file.name }
}
