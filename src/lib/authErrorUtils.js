/**
 * Auth Error Normalization & Validation Utilities for BisnisSehat.
 *
 * Guarantees:
 * 1. Friendly, actionable Indonesian error messages without exposing Postgres / internal stack details.
 * 2. Client-side input validation for UX (valid email, minimum password length, confirmation match).
 * 3. Never logs or leaks raw passwords or sensitive credentials.
 */

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false
  const trimmed = email.trim()
  // Standard RFC 5322 simplified email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return false
  return password.length >= 6
}

export function validatePasswordConfirmation(password, confirmPassword) {
  return password === confirmPassword
}

/**
 * Maps Supabase / GoTrue error codes and messages to friendly Indonesian user text.
 */
export function getFriendlyAuthErrorMessage(error) {
  if (!error) return null

  // If error is a string
  if (typeof error === 'string') {
    const lower = error.toLowerCase()
    if (lower === 'invalid_credentials' || lower.includes('invalid login credentials')) {
      return 'Email atau password salah.'
    }
    if (lower === 'user_already_exists' || lower.includes('already registered')) {
      return 'Email ini sudah terdaftar. Silakan masuk menggunakan email dan password, atau gunakan Google.'
    }
    if (lower === 'email_not_confirmed' || lower.includes('not confirmed')) {
      return 'Email belum diverifikasi. Silakan periksa inbox atau spam email kamu untuk link verifikasi.'
    }
    if (lower === 'otp_expired' || lower.includes('expired')) {
      return 'Link verifikasi atau reset password sudah tidak valid atau sudah kedaluwarsa.'
    }
    if (lower === 'over_email_send_rate_limit' || lower.includes('rate limit')) {
      return 'Terlalu banyak permintaan pengiriman email. Silakan tunggu beberapa menit sebelum mencoba lagi.'
    }
    if (lower.includes('network') || lower.includes('failed to fetch')) {
      return 'Koneksi bermasalah. Silakan periksa jaringan internet kamu dan coba lagi.'
    }
    return error
  }

  // If error is an Error / Supabase AuthError object
  const message = error.message || ''
  const code = (error.code || error.error_code || '').toLowerCase()
  const status = error.status || 0

  if (
    code === 'invalid_credentials' ||
    message.includes('Invalid login credentials') ||
    (status === 400 && message.toLowerCase().includes('invalid credentials'))
  ) {
    return 'Email atau password salah.'
  }

  if (
    code === 'user_already_exists' ||
    message.includes('User already registered') ||
    message.includes('already registered')
  ) {
    return 'Email ini sudah terdaftar. Silakan masuk menggunakan email dan password, atau gunakan Google.'
  }

  if (
    code === 'email_not_confirmed' ||
    message.includes('Email not confirmed')
  ) {
    return 'Email belum diverifikasi. Silakan periksa kotak masuk atau spam email kamu untuk link verifikasi.'
  }

  if (
    code === 'otp_expired' ||
    code === 'token_expired' ||
    message.toLowerCase().includes('token has expired') ||
    message.toLowerCase().includes('otp has expired') ||
    message.toLowerCase().includes('link is invalid or has expired')
  ) {
    return 'Link sudah tidak valid atau sudah kedaluwarsa. Silakan minta link baru.'
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429 ||
    message.toLowerCase().includes('rate limit')
  ) {
    return 'Terlalu banyak permintaan pengiriman email. Silakan tunggu beberapa saat sebelum mencoba lagi.'
  }

  if (
    message.toLowerCase().includes('password should be at least') ||
    message.toLowerCase().includes('password is too short')
  ) {
    return 'Password minimal harus 6 karakter.'
  }

  if (
    message.toLowerCase().includes('failed to fetch') ||
    message.toLowerCase().includes('networkerror') ||
    message.toLowerCase().includes('abort')
  ) {
    return 'Koneksi bermasalah. Silakan periksa jaringan internet kamu dan coba lagi.'
  }

  // Graceful fallback without leaking internal database/API traces
  return 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.'
}
