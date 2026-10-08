/**
 * adminSettingsService.js
 * Service for Admin Control Center — Stage 10: Settings Management
 * Conforms strictly to @10.md & Context7 Supabase Guidelines:
 * - Server-side authorization via PostgreSQL RPCs and RLS.
 * - Strict whitelist validation and sanitization of secret keys.
 * - Zero secrets exposed: passwords, tokens, API keys, private credentials never returned or logged.
 * - Centralized settings service layer for admin platform configuration.
 */

import { supabase } from '../lib/supabase.js'

export const ALLOWED_SETTING_KEYS = [
  'platform_name',
  'support_email',
  'support_phone',
  'support_operating_hours',
  'maintenance_mode',
  'announcement_banner_enabled',
  'announcement_banner_text',
  'enable_user_registration',
  'enable_ai_features',
  'enable_qris_checkout',
  'enable_pos_module',
  'pos_max_items_per_order',
  'session_idle_timeout_minutes',
]

/**
 * Normalizes raw PostgreSQL / PostgREST errors into clean, safe user messages.
 */
export function normalizeSettingsError(err, defaultMessage = 'Terjadi kesalahan saat memproses konfigurasi platform') {
  if (!err) return null
  const message = String(err.message || '')
  if (message.includes('42501') || message.includes('Unauthorized') || message.includes('Forbidden') || message.includes('Akses ditolak')) {
    return new Error('Akses ditolak: Anda tidak memiliki izin administratif untuk mengelola konfigurasi platform.')
  }
  if (message.includes('P0002') || message.includes('SETTING_NOT_FOUND')) {
    return new Error('Kunci konfigurasi tidak ditemukan dalam database sistem.')
  }
  if (message.includes('FORBIDDEN_SETTING')) {
    return new Error('Kunci konfigurasi rahasia atau kredensial tidak diizinkan untuk dikelola melalui pengaturan admin.')
  }
  if (message.includes('INVALID_SETTING_KEY')) {
    return new Error('Kunci konfigurasi tidak valid atau tidak terdaftar dalam whitelist platform.')
  }
  if (message.includes('INVALID_SETTING_VALUE')) {
    return new Error('Format atau tipe nilai konfigurasi tidak valid.')
  }
  return new Error(defaultMessage)
}

/**
 * Strips sensitive keys (tokens, passwords, server keys) from any setting object.
 */
export function sanitizeSettingRow(row) {
  if (!row || typeof row !== 'object') return null
  const sanitized = { ...row }
  const sensitivePatterns = ['secret', 'token', 'password', 'key', 'cred', 'auth']

  if (typeof sanitized.key === 'string') {
    const lowerKey = sanitized.key.toLowerCase()
    if (sensitivePatterns.some(p => lowerKey.includes(p) && !['enable_qris_checkout', 'enable_pos_module'].includes(lowerKey))) {
      return null // drop secret rows entirely
    }
  }

  return sanitized
}

/**
 * Validates a setting key and value before mutation.
 */
export function validateSettingInput(key, value) {
  if (!key || typeof key !== 'string' || !key.trim()) {
    throw new Error('Kunci konfigurasi wajib diisi.')
  }
  const cleanKey = key.trim()

  const lowerKey = cleanKey.toLowerCase()
  if (lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('password') || lowerKey.includes('api_key')) {
    throw new Error('Kunci konfigurasi rahasia tidak boleh dimodifikasi.')
  }

  if (!ALLOWED_SETTING_KEYS.includes(cleanKey)) {
    throw new Error(`Kunci konfigurasi "${cleanKey}" tidak diizinkan atau tidak terdaftar.`)
  }

  // Type & format validation
  if (['maintenance_mode', 'announcement_banner_enabled', 'enable_user_registration', 'enable_ai_features', 'enable_qris_checkout', 'enable_pos_module'].includes(cleanKey)) {
    if (typeof value !== 'boolean') {
      throw new Error(`Nilai untuk "${cleanKey}" harus bertipe boolean.`)
    }
  } else if (cleanKey === 'support_email') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim())) {
      throw new Error('Format email customer support tidak valid.')
    }
  } else if (['platform_name', 'support_phone', 'support_operating_hours', 'announcement_banner_text'].includes(cleanKey)) {
    if (typeof value !== 'string') {
      throw new Error(`Nilai untuk "${cleanKey}" harus bertipe teks.`)
    }
  } else if (['pos_max_items_per_order', 'session_idle_timeout_minutes'].includes(cleanKey)) {
    const num = Number(value)
    if (isNaN(num) || num <= 0) {
      throw new Error(`Nilai untuk "${cleanKey}" harus berupa angka positif.`)
    }
  }

  return true
}

/**
 * Fetch all platform settings.
 * Uses RPC get_admin_settings with fallback to direct table select.
 */
export async function getSettings() {
  try {
    // Try RPC first (enforces security definer & admin check)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_admin_settings')

    if (!rpcErr && Array.isArray(rpcData)) {
      return (rpcData || []).map(sanitizeSettingRow).filter(Boolean)
    }

    if (rpcErr && (rpcErr.code === '42501' || rpcErr.message?.includes('Akses ditolak') || rpcErr.message?.includes('Unauthorized'))) {
      throw normalizeSettingsError(rpcErr)
    }

    // Fallback to direct query on public.platform_settings (guarded by RLS)
    const { data: tblData, error: tblErr } = await supabase
      .from('platform_settings')
      .select('id, key, value, category, description, updated_by, created_at, updated_at')
      .order('category', { ascending: true })
      .order('key', { ascending: true })

    if (tblErr) {
      throw normalizeSettingsError(tblErr)
    }

    return (tblData || []).map(sanitizeSettingRow).filter(Boolean)
  } catch (err) {
    throw normalizeSettingsError(err)
  }
}

/**
 * Fetch a single platform setting by key.
 */
export async function getSetting(key) {
  if (!key || typeof key !== 'string') return null
  try {
    const all = await getSettings()
    return all.find(s => s.key === key.trim()) || null
  } catch (err) {
    throw normalizeSettingsError(err)
  }
}

export function invalidatePublicSettingsCache() {
  cachedPublicSettings = null
  cacheTimestamp = 0
  publicSettingsPromise = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('platform-settings-invalidated'))
  }
}

/**
 * Update a single platform setting by key.
 *
 * @param {string} key - Setting key (must be in whitelist)
 * @param {any} value - Value to store (JSON serializable)
 * @param {string} [reason] - Optional reason for audit log
 */
export async function updateSetting(key, value, reason = '') {
  validateSettingInput(key, value)

  try {
    // Call RPC update_admin_setting
    const { data: rpcData, error: rpcErr } = await supabase.rpc('update_admin_setting', {
      p_key: key.trim(),
      p_value: value,
      p_reason: reason ? reason.trim() : `Admin memperbarui konfigurasi ${key.trim()}`,
    })

    if (rpcErr) {
      throw normalizeSettingsError(rpcErr)
    }

    // Invalidate cached public settings immediately so gates & UI reflect change instantly
    invalidatePublicSettingsCache()

    return sanitizeSettingRow(rpcData)
  } catch (err) {
    throw normalizeSettingsError(err)
  }
}

/**
 * Update multiple platform settings in a sequence.
 *
 * @param {Object} settingsMap - Object with key-value pairs { key: value }
 * @param {string} [reason] - Reason for audit logging
 */
export async function updateSettings(settingsMap, reason = '') {
  if (!settingsMap || typeof settingsMap !== 'object') {
    throw new Error('Data konfigurasi pembaruan tidak valid.')
  }

  const entries = Object.entries(settingsMap)
  if (entries.length === 0) return []

  // Pre-validate all inputs before executing any updates
  for (const [key, value] of entries) {
    validateSettingInput(key, value)
  }

  const results = []
  for (const [key, value] of entries) {
    const res = await updateSetting(key, value, reason)
    results.push(res)
  }

  invalidatePublicSettingsCache()

  return results
}

export const DEFAULT_PUBLIC_SETTINGS = {
  platform_name: 'BisnisSehat',
  support_email: 'support@bisnissehat.id',
  support_phone: '+62 812-3456-7890',
  support_operating_hours: 'Senin - Jumat, 09:00 - 18:00 WIB',
  maintenance_mode: false,
  announcement_banner_enabled: false,
  announcement_banner_text: '',
  enable_user_registration: true,
  enable_ai_features: true,
  enable_qris_checkout: true,
  enable_pos_module: true,
  pos_max_items_per_order: 100,
  session_idle_timeout_minutes: 60,
}

let cachedPublicSettings = null
let cacheTimestamp = 0
let publicSettingsPromise = null
const CACHE_TTL_MS = 30000

/**
 * Safely fetches public non-sensitive platform settings (@ban.md & @gas.md).
 * Accessible by anonymous visitors, normal users, and admins.
 */
export async function fetchPublicPlatformSettings(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && cachedPublicSettings && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedPublicSettings
  }

  if (!forceRefresh && publicSettingsPromise) {
    return publicSettingsPromise
  }

  publicSettingsPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_public_platform_settings')
      if (error) {
        console.warn('[adminSettingsService] Could not fetch public settings, using defaults/cached:', error.message)
        if (cachedPublicSettings) return cachedPublicSettings
        return DEFAULT_PUBLIC_SETTINGS
      }
      const merged = { ...DEFAULT_PUBLIC_SETTINGS, ...(data || {}) }
      cachedPublicSettings = merged
      cacheTimestamp = Date.now()
      return merged
    } catch (err) {
      console.warn('[adminSettingsService] Error loading public settings, using defaults/cached:', err)
      if (cachedPublicSettings) return cachedPublicSettings
      return DEFAULT_PUBLIC_SETTINGS
    } finally {
      publicSettingsPromise = null
    }
  })()

  return publicSettingsPromise
}


