/**
 * OAuth & Authentication Utilities for BisnisSehat.
 * Handles parsing of OAuth callback parameters, error detection (including bad_oauth_state),
 * and provides localized user-facing recovery guidance.
 */

/**
 * Parses OAuth error from URL query string or hash fragment.
 * Supports both PKCE query params (?error=...) and implicit flow hash fragments (#error=...).
 */
export function parseOAuthError(urlSearch = '', urlHash = '') {
  const searchParams = new URLSearchParams(urlSearch || '')
  let errorCode = searchParams.get('error_code') || searchParams.get('error')
  let errorDescription = searchParams.get('error_description')

  if (!errorCode && urlHash) {
    const hash = urlHash.startsWith('#') ? urlHash.slice(1) : urlHash
    const hashParams = new URLSearchParams(hash)
    errorCode = hashParams.get('error_code') || hashParams.get('error')
    errorDescription = hashParams.get('error_description')
  }

  if (errorCode) {
    return {
      errorCode,
      errorDescription: errorDescription || errorCode,
    }
  }
  return null
}

/**
 * Maps standard OAuth error codes to friendly, actionable Indonesian error messages.
 */
export function getFriendlyOAuthErrorMessage(errorCode, errorDesc) {
  if (!errorCode) return null
  const code = errorCode.toLowerCase()

  if (code === 'bad_oauth_state') {
    return 'Sesi login Google telah kedaluwarsa atau terjadi gangguan koneksi. Silakan klik tombol di bawah untuk mencoba masuk kembali.'
  }
  if (code === 'access_denied') {
    return 'Otorisasi akun Google dibatalkan. Silakan pilih akun Google untuk masuk ke BisnisSehat.'
  }
  if (code === 'auth_timeout') {
    return 'Proses masuk memerlukan waktu terlalu lama. Silakan coba masuk kembali.'
  }
  if (errorDesc) {
    return `Gagal masuk dengan Google: ${errorDesc}. Silakan coba lagi.`
  }
  return 'Gagal masuk dengan Google. Silakan periksa koneksi internet Anda dan coba lagi.'
}
