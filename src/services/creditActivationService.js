// src/services/creditActivationService.js
// Client service for BisnisSehat Manual AI Credit Sales & Activation System
// Strictly conforms to load.md: server-side authority, 256-bit CSPRNG, no raw tokens in storage/logs.

import { supabase } from '../lib/supabase.js'

/**
 * Normalizes error messages from database/RPC into user-friendly Indonesian messages.
 */
export function normalizeCreditActivationError(err, defaultMessage = 'Terjadi kesalahan pada aktivasi kredit') {
  if (!err) return null
  const message = String(err.message || '')

  if (message.includes('42501') || message.includes('Unauthorized')) {
    return new Error('Sesi login telah berakhir atau Anda belum login. Silakan login terlebih dahulu.')
  }
  if (message.includes('ALREADY_USED') || message.includes('sudah digunakan')) {
    return new Error('Link aktivasi ini sudah digunakan.')
  }
  if (message.includes('EXPIRED') || message.includes('kedaluwarsa')) {
    return new Error('Link aktivasi ini sudah kedaluwarsa.')
  }
  if (message.includes('CANCELLED') || message.includes('dibatalkan')) {
    return new Error('Link aktivasi sudah dibatalkan.')
  }
  if (message.includes('WRONG_ACCOUNT') || message.includes('bukan untuk akun')) {
    return new Error('Link aktivasi ini bukan untuk akun Anda.')
  }
  if (message.includes('RATE_LIMITED') || message.includes('dibatasi sementara') || message.includes('percobaan gagal')) {
    return new Error('Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.')
  }
  if (message.includes('INVALID_TOKEN') || message.includes('tidak valid')) {
    return new Error('Link aktivasi tidak valid.')
  }
  return new Error(defaultMessage)
}

/**
 * Admin: Generate a new one-time credit activation link.
 * Plaintext token is returned ONLY ONCE in this response.
 *
 * @param {Object} params
 * @param {string} params.profileId Target user UUID
 * @param {string} params.businessId Target business UUID
 * @param {string} params.packageKey Package key: 'starter' | 'growth' | 'pro' | 'business'
 * @param {Object} [params.metadata]
 * @returns {Promise<{ success: boolean, id: string, token: string, activation_path: string, package_key: string, package_name: string, credit_amount: number, price_idr: number, expires_at: string }>}
 */
export async function adminGenerateCreditActivation({
  profileId,
  userId,
  businessId,
  packageKey,
  metadata = {},
}) {
  const targetId = profileId || userId
  if (!targetId) throw new Error('Pengguna wajib dipilih.')
  if (!businessId) throw new Error('Bisnis wajib dipilih.')
  if (!packageKey) throw new Error('Paket kredit wajib dipilih.')

  const { data, error } = await supabase.rpc('admin_generate_credit_activation', {
    p_profile_id: targetId,
    p_business_id: businessId,
    p_package_key: packageKey,
    p_metadata: metadata || {},
  })

  if (error) {
    throw new Error(error.message || 'Gagal membuat link aktivasi kredit')
  }

  return data
}

/**
 * Admin: Fetch paginated list of credit activation records.
 *
 * @param {Object} params
 * @param {string} [params.search]
 * @param {string} [params.status='all']
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @returns {Promise<{ total: number, limit: number, offset: number, items: Array }>}
 */
export async function getAdminCreditActivations({
  search = null,
  status = 'all',
  limit = 20,
  offset = 0,
} = {}) {
  const cleanSearch = typeof search === 'string' && search.trim() ? search.trim() : null
  const { data, error } = await supabase.rpc('get_admin_credit_activations', {
    p_search: cleanSearch,
    p_status: status || 'all',
    p_limit: typeof limit === 'number' ? limit : 20,
    p_offset: typeof offset === 'number' ? offset : 0,
  })

  if (error) {
    throw new Error(error.message || 'Gagal memuat daftar aktivasi kredit')
  }

  return data
}

/**
 * Admin: Get businesses belonging to a user for generation selection.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, name: string, created_at: string }>>}
 */
export async function getAdminUserBusinesses(userId) {
  if (!userId) return []

  const { data, error } = await supabase.rpc('get_admin_user_businesses', {
    p_user_id: userId,
  })

  if (error) {
    console.error('Error fetching user businesses:', error)
    return []
  }

  return data || []
}

/**
 * Admin: Cancel a pending credit activation.
 *
 * @param {string} activationId
 * @returns {Promise<{ success: boolean, id: string, status: string }>}
 */
export async function adminCancelCreditActivation(activationId) {
  if (!activationId) throw new Error('ID aktivasi wajib diisi.')

  const { data, error } = await supabase.rpc('admin_cancel_credit_activation', {
    p_activation_id: activationId,
  })

  if (error) {
    throw new Error(error.message || 'Gagal membatalkan aktivasi kredit')
  }

  return data
}

/**
 * Customer: Redeem a credit activation link.
 * Sends raw token to server RPC for cryptographic verification and atomic grant.
 *
 * @param {string} token Raw token from URL query (?t=...)
 * @returns {Promise<{ success: boolean, credits_added?: number, package_name?: string, new_balance?: number, message: string, error?: string }>}
 */
export async function redeemCreditActivation(token) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Link aktivasi tidak valid.',
    }
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.user) {
    return {
      success: false,
      error: 'LOGIN_REQUIRED',
      message: 'Silakan login terlebih dahulu untuk menggunakan link aktivasi.',
    }
  }

  const cleanToken = token.trim()

  const { data, error } = await supabase.rpc('redeem_credit_activation', {
    p_token: cleanToken,
  })

  if (error) {
    const norm = normalizeCreditActivationError(error)
    return {
      success: false,
      error: error.message || 'REDEMPTION_FAILED',
      message: norm.message,
    }
  }

  if (data && !data.success) {
    return {
      success: false,
      error: data.error || 'REDEMPTION_FAILED',
      message: data.message || 'Gagal mengaktifkan kredit.',
    }
  }

  return data
}

/**
 * Builds the complete activation URL from token.
 *
 * @param {string} token
 * @returns {string}
 */
export function buildCreditActivationUrl(token) {
  if (!token) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://bisnissehat.my.id'

  return `${origin}/activate-credit?t=${encodeURIComponent(token)}`
}
