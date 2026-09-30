// src/lib/activationCodeService.js
// Client service for BisnisSehat PRO Activation Code & QR system
// Strictly enforces server-side validation and authentication

import { supabase } from './supabase.js'

/**
 * Redeem a PRO activation code.
 * Sends the plaintext code to the server RPC for secure validation,
 * row locking, single-use enforcement, and atomic subscription update.
 *
 * @param {string} code Plaintext activation code (e.g. BS-PRO-XXXX-...)
 * @returns {Promise<{ success: boolean, plan: string, status: string, duration_days: number, expires_at: string, message: string }>}
 */
export async function redeemActivationCode(code) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    throw new Error('Kode aktivasi wajib diisi.')
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.user) {
    throw new Error('Sesi login telah berakhir atau Anda belum login. Silakan login terlebih dahulu.')
  }

  const cleanCode = code.trim().toUpperCase()

  const { data, error } = await supabase.rpc('redeem_pro_activation_code', {
    p_code: cleanCode,
  })

  if (error) {
    // Check for rate limit or specific message
    const msg = error.message || ''
    if (msg.includes('Terlalu banyak percobaan gagal') || msg.includes('dibatasi sementara')) {
      throw new Error('Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.')
    }
    if (msg.includes('Unauthorized') || msg.includes('login')) {
      throw new Error('Sesi login tidak valid. Silakan login terlebih dahulu.')
    }
    // Generic safe error for invalid/expired/already used code
    throw new Error(msg || 'Kode aktivasi tidak valid atau sudah tidak dapat digunakan.')
  }

  return data
}

/**
 * Admin: Generate a new PRO activation code bound to recipient email with 128-bit CSPRNG entropy.
 * Plaintext code is returned ONLY once in this response and NEVER saved in plaintext in the database.
 *
 * @param {string} targetEmail Recipient email address (required)
 * @param {number} [durationDays=30]
 * @param {object} [metadata={}]
 * @returns {Promise<{ success: boolean, id: string, code: string, target_email: string, plan: string, duration_days: number, created_at: string }>}
 */
export async function adminGenerateActivationCode(targetEmail, durationDays = 30, metadata = {}) {
  if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.trim()) {
    throw new Error('Email penerima wajib diisi.')
  }

  const cleanEmail = targetEmail.trim().toLowerCase()

  const { data, error } = await supabase.rpc('admin_generate_pro_activation_code', {
    p_target_email: cleanEmail,
    p_duration_days: durationDays,
    p_metadata: metadata,
  })

  if (error) {
    throw new Error(error.message || 'Gagal membuat kode aktivasi PRO')
  }

  return data
}

/**
 * Admin: Revoke an unused PRO activation code.
 *
 * @param {string} codeId UUID of activation code record
 * @param {string} [reason='Dicabut oleh admin']
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function adminRevokeActivationCode(codeId, reason = 'Dicabut oleh admin') {
  if (!codeId) {
    throw new Error('ID kode aktivasi wajib diisi.')
  }

  const { data, error } = await supabase.rpc('admin_revoke_pro_activation_code', {
    p_code_id: codeId,
    p_reason: reason || 'Dicabut oleh admin',
  })

  if (error) {
    throw new Error(error.message || 'Gagal mencabut kode aktivasi PRO')
  }

  return data
}

/**
 * Admin (SUPER_ADMIN only): Permanently delete history of revoked or expired PRO activation codes.
 *
 * @param {string} codeId UUID of activation code record
 * @param {string} [reason] Non-empty deletion reason (required)
 * @returns {Promise<{ success: boolean, id: string, message: string }>}
 */
export async function deleteProActivationCode(codeId, reason) {
  if (!codeId) {
    throw new Error('ID kode aktivasi wajib diisi.')
  }

  const cleanReason = (reason || '').trim()
  if (!cleanReason) {
    throw new Error('Alasan penghapusan wajib diisi.')
  }

  const { data, error } = await supabase.rpc('admin_delete_pro_activation_code', {
    p_code_id: codeId,
    p_reason: cleanReason,
  })

  if (error) {
    const msg = error.message || ''
    if (msg.includes('Hanya Super Admin')) {
      throw new Error('Akses ditolak: Hanya Super Admin yang diizinkan menghapus riwayat kode aktivasi.')
    }
    if (msg.includes('tidak ditemukan')) {
      throw new Error('Kode aktivasi tidak ditemukan atau sudah dihapus sebelumnya.')
    }
    if (msg.includes('sudah digunakan')) {
      throw new Error('Kode aktivasi yang sudah digunakan tidak dapat dihapus.')
    }
    if (msg.includes('masih aktif')) {
      throw new Error('Kode aktivasi masih aktif. Cabut (revoke) kode terlebih dahulu sebelum menghapus.')
    }
    if (msg.includes('Unauthorized') || msg.includes('Autentikasi')) {
      throw new Error('Sesi login tidak valid. Silakan login terlebih dahulu.')
    }
    throw new Error(msg || 'Gagal menghapus riwayat kode aktivasi.')
  }

  return data
}

/**
 * Admin: Fetch list of activation codes (masked codes only).
 *
 * @param {object} params
 * @param {string} [params.search]
 * @param {string} [params.status='all']
 * @param {number} [params.limit=20]
 * @param {number} [params.offset=0]
 * @returns {Promise<{ total: number, limit: number, offset: number, items: Array }>}
 */
export async function getAdminActivationCodes({
  search = null,
  status = 'all',
  limit = 20,
  offset = 0,
} = {}) {
  const { data, error } = await supabase.rpc('get_admin_pro_activation_codes', {
    p_search: search || null,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    throw new Error(error.message || 'Gagal memuat daftar kode aktivasi')
  }

  return data
}

/**
 * Format standard activation URL for QR code & direct link
 * @param {string} code
 * @returns {string}
 */
export function buildActivationUrl(code) {
  if (!code) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://bisnissehat.my.id'
  return `${origin}/pricing?activate=${encodeURIComponent(code)}`
}
