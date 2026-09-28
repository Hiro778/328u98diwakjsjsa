/**
 * footerSocialLinksService.js
 * Service layer for Footer & Social Links Management
 * Conforms strictly to @42.md:
 * - All mutations via SECURITY DEFINER RPCs (server-side auth) with table fallback
 * - Public read via get_footer_social_links() (anon + authenticated)
 * - Admin read/write via admin_* RPCs (is_admin() enforced in DB)
 * - URL validation happens client-side and server-side; rejects dangerous schemes
 */

import { supabase } from '../lib/supabase.js'

/**
 * Validates link URL for dangerous schemes (javascript:, data:, vbscript:)
 * and ensures valid format based on platform.
 */
export function validateClientUrl(url, platform) {
  if (!url || typeof url !== 'string') {
    return { valid: false, message: 'URL wajib diisi.' }
  }
  const trimmed = url.trim()
  if (!trimmed) {
    return { valid: false, message: 'URL tidak boleh kosong.' }
  }
  const lower = trimmed.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return { valid: false, message: 'URL berbahaya (javascript:, data:, dll.) ditolak demi keamanan.' }
  }

  if (platform === 'email') {
    const emailVal = trimmed.replace(/^mailto:/i, '').trim()
    if (!emailVal || !emailVal.includes('@') || emailVal.length < 5) {
      return { valid: false, message: 'Format alamat email tidak valid.' }
    }
  } else if (platform === 'phone') {
    const phoneVal = trimmed.replace(/^tel:/i, '').trim()
    if (!phoneVal || !/^[\d\s\+\-\(\)]{6,20}$/.test(phoneVal)) {
      return { valid: false, message: 'Format nomor telepon tidak valid (contoh: +6281234567890).' }
    }
  } else {
    try {
      const parseTarget = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      const parsed = new URL(parseTarget)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, message: 'Hanya protokol HTTP atau HTTPS yang diizinkan.' }
      }
    } catch {
      return { valid: false, message: 'Format URL tidak valid.' }
    }
  }

  return { valid: true }
}

/**
 * Normalizes link URL into appropriate scheme format (mailto:, tel:, https://).
 */
export function normalizeLinkUrl(url, platform) {
  const trimmed = (url || '').trim()
  if (platform === 'email') {
    return /^mailto:/i.test(trimmed) ? trimmed : `mailto:${trimmed}`
  }
  if (platform === 'phone') {
    return /^tel:/i.test(trimmed) ? trimmed : `tel:${trimmed}`
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

/**
 * Normalizes RPC/PostgREST errors into safe, user-friendly messages.
 */
export function normalizeSocialLinksError(err, defaultMessage = 'Terjadi kesalahan pada social links.') {
  if (!err) return null
  const msg = String(err?.message || '')
  if (msg.includes('ADMIN_REQUIRED') || msg.includes('42501') || msg.includes('Unauthorized')) {
    return new Error('Akses ditolak: hanya admin yang dapat mengelola footer social links.')
  }
  if (msg.includes('INVALID_PLATFORM')) {
    return new Error('Platform tidak valid.')
  }
  if (msg.includes('INVALID_LABEL')) {
    return new Error('Label tidak valid atau terlalu panjang (maks 80 karakter).')
  }
  if (msg.includes('INVALID_URL') || msg.includes('berbahaya')) {
    return new Error('URL tidak valid atau menggunakan skema berbahaya (javascript:, data:, dll. tidak diizinkan).')
  }
  if (msg.includes('NOT_FOUND')) {
    return new Error('Social link tidak ditemukan.')
  }
  return new Error(defaultMessage)
}

/**
 * Public: Fetch enabled footer social links (anon + authenticated).
 * Used by Footer component to render social icons.
 */
export async function getEnabledFooterSocialLinks() {
  try {
    const { data, error } = await supabase.rpc('get_footer_social_links')
    if (!error && Array.isArray(data)) return data

    // Table fallback if RPC not deployed yet
    const { data: tableData, error: tableErr } = await supabase
      .from('footer_social_links')
      .select('id, platform, label, url, enabled, sort_order')
      .eq('enabled', true)
      .order('sort_order', { ascending: true })

    if (!tableErr && Array.isArray(tableData)) return tableData
    return []
  } catch {
    return []
  }
}

/**
 * Admin: Fetch ALL footer social links (including disabled).
 * Used by admin management page.
 */
export async function adminGetAllFooterSocialLinks() {
  try {
    const { data, error } = await supabase.rpc('admin_get_all_footer_social_links')
    if (!error && Array.isArray(data)) return data

    // Table fallback
    const { data: tableData, error: tableErr } = await supabase
      .from('footer_social_links')
      .select('id, platform, label, url, enabled, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })

    if (tableErr) throw tableErr
    return tableData || []
  } catch (err) {
    throw normalizeSocialLinksError(err, 'Gagal memuat semua footer social links.')
  }
}

/**
 * Admin: Create a new footer social link.
 * @param {{ platform: string, label: string, url: string, enabled: boolean, sort_order: number }} payload
 */
export async function adminCreateFooterSocialLink({ platform, label, url, enabled = true, sort_order = 0 }) {
  const validation = validateClientUrl(url, platform)
  if (!validation.valid) throw new Error(validation.message)

  const normalizedUrl = normalizeLinkUrl(url, platform)
  const trimmedLabel = (label || '').trim()
  if (!trimmedLabel || trimmedLabel.length > 80) {
    throw new Error('Label wajib diisi dan maksimal 80 karakter.')
  }

  try {
    const { data, error } = await supabase.rpc('admin_create_footer_social_link', {
      p_platform: platform,
      p_label: trimmedLabel,
      p_url: normalizedUrl,
      p_enabled: enabled,
      p_sort_order: Number(sort_order) || 0,
    })
    if (!error && data) return data
    if (error && error.code !== 'PGRST202') throw error

    // Fallback direct table insert
    const { data: insData, error: insErr } = await supabase
      .from('footer_social_links')
      .insert({
        platform,
        label: trimmedLabel,
        url: normalizedUrl,
        enabled: Boolean(enabled),
        sort_order: Number(sort_order) || 0,
      })
      .select('id')
      .single()

    if (insErr) throw insErr
    return insData?.id
  } catch (err) {
    throw normalizeSocialLinksError(err, 'Gagal membuat social link baru.')
  }
}

/**
 * Admin: Update an existing footer social link.
 * @param {string} id
 * @param {{ platform: string, label: string, url: string, enabled: boolean, sort_order: number }} payload
 */
export async function adminUpdateFooterSocialLink(id, { platform, label, url, enabled, sort_order }) {
  const validation = validateClientUrl(url, platform)
  if (!validation.valid) throw new Error(validation.message)

  const normalizedUrl = normalizeLinkUrl(url, platform)
  const trimmedLabel = (label || '').trim()
  if (!trimmedLabel || trimmedLabel.length > 80) {
    throw new Error('Label wajib diisi dan maksimal 80 karakter.')
  }

  try {
    const { error } = await supabase.rpc('admin_update_footer_social_link', {
      p_id: id,
      p_platform: platform,
      p_label: trimmedLabel,
      p_url: normalizedUrl,
      p_enabled: Boolean(enabled),
      p_sort_order: Number(sort_order) || 0,
    })
    if (!error) return
    if (error && error.code !== 'PGRST202') throw error

    // Fallback direct table update
    const { error: updErr } = await supabase
      .from('footer_social_links')
      .update({
        platform,
        label: trimmedLabel,
        url: normalizedUrl,
        enabled: Boolean(enabled),
        sort_order: Number(sort_order) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) throw updErr
  } catch (err) {
    throw normalizeSocialLinksError(err, 'Gagal memperbarui social link.')
  }
}

/**
 * Admin: Toggle enabled/disabled for a social link.
 */
export async function adminToggleFooterSocialLink(id, enabled) {
  try {
    const { error } = await supabase.rpc('admin_toggle_footer_social_link', {
      p_id: id,
      p_enabled: Boolean(enabled),
    })
    if (!error) return
    if (error && error.code !== 'PGRST202') throw error

    const { error: updErr } = await supabase
      .from('footer_social_links')
      .update({
        enabled: Boolean(enabled),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) throw updErr
  } catch (err) {
    throw normalizeSocialLinksError(err, 'Gagal mengubah status social link.')
  }
}

/**
 * Admin: Delete a footer social link.
 */
export async function adminDeleteFooterSocialLink(id) {
  try {
    const { error } = await supabase.rpc('admin_delete_footer_social_link', {
      p_id: id,
    })
    if (!error) return
    if (error && error.code !== 'PGRST202') throw error

    const { error: delErr } = await supabase
      .from('footer_social_links')
      .delete()
      .eq('id', id)

    if (delErr) throw delErr
  } catch (err) {
    throw normalizeSocialLinksError(err, 'Gagal menghapus social link.')
  }
}

/**
 * Supported platforms with metadata for UI rendering.
 */
export const SUPPORTED_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telepon' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X / Twitter' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'website', label: 'Website' },
  { key: 'custom', label: 'Custom' },
]
