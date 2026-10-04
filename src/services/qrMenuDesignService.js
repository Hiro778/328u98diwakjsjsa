// src/services/qrMenuDesignService.js
// Custom QR Menu Designer Presentation Layer Service
// Manages themes, layout sections, drag-and-drop hierarchy, and asset uploads.

import { supabase } from '../lib/supabase.js'

export const THEME_PRESETS = {
  default: {
    id: 'default',
    name: 'Warm Amber',
    primary: '#F5A623',
    secondary: '#1E2A5E',
    background: '#FFF9F4',
    surface: '#FFFFFF',
    text: '#1E2A5E',
    button: '#F5A623',
  },
  coffee: {
    id: 'coffee',
    name: 'Earthy Coffee',
    primary: '#8C5338',
    secondary: '#3E2723',
    background: '#FBF7F4',
    surface: '#FFFFFF',
    text: '#2C1810',
    button: '#8C5338',
  },
  food: {
    id: 'food',
    name: 'Fresh Bistro',
    primary: '#E53E3E',
    secondary: '#742A2A',
    background: '#FFFBF7',
    surface: '#FFFFFF',
    text: '#2D3748',
    button: '#E53E3E',
  },
  minimal: {
    id: 'minimal',
    name: 'Clean Minimal',
    primary: '#18181B',
    secondary: '#71717A',
    background: '#FAFAFA',
    surface: '#FFFFFF',
    text: '#09090B',
    button: '#18181B',
  },
  elegant: {
    id: 'elegant',
    name: 'Royal Navy',
    primary: '#1E2A5E',
    secondary: '#D97706',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    text: '#0F172A',
    button: '#1E2A5E',
  },
  fresh: {
    id: 'fresh',
    name: 'Green Emerald',
    primary: '#059669',
    secondary: '#064E3B',
    background: '#F0FDF4',
    surface: '#FFFFFF',
    text: '#064E3B',
    button: '#059669',
  },
  dark: {
    id: 'dark',
    name: 'Modern Dark',
    primary: '#F59E0B',
    secondary: '#6366F1',
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F8FAFC',
    button: '#F59E0B',
  },
}

export const FONT_PRESETS = [
  { id: 'Inter', name: 'Inter (Modern Sans)', family: "'Inter', sans-serif" },
  { id: 'Poppins', name: 'Poppins (Geometric)', family: "'Poppins', sans-serif" },
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans (Clean)', family: "'Plus Jakarta Sans', sans-serif" },
  { id: 'DM Sans', name: 'DM Sans (Friendly)', family: "'DM Sans', sans-serif" },
  { id: 'Lora', name: 'Lora (Elegant Serif)', family: "'Lora', serif" },
]

export const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', prefix: 'https://instagram.com/', placeholder: 'https://instagram.com/username' },
  { id: 'whatsapp', label: 'WhatsApp', prefix: 'https://wa.me/', placeholder: 'https://wa.me/62812xxxxxx' },
  { id: 'facebook', label: 'Facebook', prefix: 'https://facebook.com/', placeholder: 'https://facebook.com/username' },
  { id: 'tiktok', label: 'TikTok', prefix: 'https://tiktok.com/@', placeholder: 'https://tiktok.com/@username' },
  { id: 'maps', label: 'Google Maps', prefix: 'https://maps.google.com/', placeholder: 'https://maps.google.com/...' },
]

/**
 * Validates and sanitizes a social media URL for a given platform.
 * Rejects javascript:, data:, vbscript: protocols.
 */
export function sanitizeSocialUrl(platform, rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return ''
  }

  if (platform === 'whatsapp') {
    if (trimmed.startsWith('https://wa.me/') || trimmed.startsWith('http://wa.me/')) {
      return trimmed
    }
    const digits = trimmed.replace(/\D/g, '')
    if (digits) {
      const normalizedDigits = digits.startsWith('0') ? '62' + digits.slice(1) : digits
      return `https://wa.me/${normalizedDigits}`
    }
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  }

  if (platform === 'instagram') {
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed
    const cleanUsername = trimmed.replace(/^@/, '').replace(/^instagram\.com\//, '')
    return `https://instagram.com/${cleanUsername}`
  }

  if (platform === 'facebook') {
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed
    return `https://facebook.com/${trimmed}`
  }

  if (platform === 'tiktok') {
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed
    const clean = trimmed.startsWith('@') ? trimmed : `@${trimmed}`
    return `https://tiktok.com/${clean}`
  }

  if (platform === 'maps') {
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed
    return `https://${trimmed}`
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`
  }

  return trimmed
}

/**
 * Extracts and normalizes social links array from block props.
 * Strictly limits to max 5 items.
 */
export function getNormalizedSocialLinks(props = {}) {
  if (!props || typeof props !== 'object') return []

  if (Array.isArray(props.links)) {
    return props.links
      .filter((item) => item && item.platform && item.url && String(item.url).trim() !== '')
      .map((item, idx) => ({
        id: item.id || `link-${idx}`,
        platform: item.platform,
        url: String(item.url).trim(),
      }))
      .slice(0, 5)
  }

  // Fallback from legacy props
  const legacy = []
  if (props.instagram && String(props.instagram).trim()) {
    const raw = String(props.instagram).trim()
    const url = raw.startsWith('http') ? raw : `https://instagram.com/${raw.replace('@', '')}`
    legacy.push({ id: 'legacy-ig', platform: 'instagram', url })
  }
  if (props.whatsapp && String(props.whatsapp).trim()) {
    const raw = String(props.whatsapp).trim()
    const url = raw.startsWith('http') ? raw : `https://wa.me/${raw.replace(/\D/g, '')}`
    legacy.push({ id: 'legacy-wa', platform: 'whatsapp', url })
  }
  if (props.facebook && String(props.facebook).trim()) {
    const raw = String(props.facebook).trim()
    const url = raw.startsWith('http') ? raw : `https://facebook.com/${raw}`
    legacy.push({ id: 'legacy-fb', platform: 'facebook', url })
  }
  if (props.tiktok && String(props.tiktok).trim()) {
    const raw = String(props.tiktok).trim()
    const url = raw.startsWith('http') ? raw : `https://tiktok.com/@${raw.replace('@', '')}`
    legacy.push({ id: 'legacy-tt', platform: 'tiktok', url })
  }
  if (props.maps && String(props.maps).trim()) {
    const raw = String(props.maps).trim()
    const url = raw.startsWith('http') ? raw : `https://maps.google.com/?q=${encodeURIComponent(raw)}`
    legacy.push({ id: 'legacy-maps', platform: 'maps', url })
  } else if (props.website && String(props.website).trim()) {
    const raw = String(props.website).trim()
    const url = raw.startsWith('http') ? raw : `https://${raw}`
    legacy.push({ id: 'legacy-maps', platform: 'maps', url })
  }

  return legacy.slice(0, 5)
}

/**
 * Resolves a product's primary image URL across all potential schema fields:
 * image_url (snake_case column), imageUrl (camelCase), image, or first item of images array.
 */
export function getProductImageUrl(product) {
  if (!product) return ''
  return (
    product.image_url ||
    product.imageUrl ||
    product.image ||
    (Array.isArray(product.images) && product.images[0]) ||
    ''
  )
}

export const DEFAULT_DESIGN_SETTINGS = {
  version: 1,
  theme: {
    preset: 'default',
    primary: '#F5A623',
    secondary: '#1E2A5E',
    background: '#FFF9F4',
    surface: '#FFFFFF',
    text: '#1E2A5E',
    button: '#F5A623',
    buttonStyle: 'pill', // 'pill' | 'rounded' | 'square'
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  layout: [
    {
      id: 'logo',
      type: 'logo',
      label: 'Logo Bisnis',
      visible: true,
      props: { size: 'md', shape: 'circle', alignment: 'center' }, // size: sm, md, lg | shape: circle, rounded, square
    },
    {
      id: 'business_info',
      type: 'business_info',
      label: 'Info & Tagline Bisnis',
      visible: true,
      props: { alignment: 'center', showName: true, showSlogan: true, showDescription: true },
    },
    {
      id: 'banner',
      type: 'banner',
      label: 'Banner / Hero Cover',
      visible: true,
      props: { height: 'compact', overlayOpacity: 0, banners: [] }, // height: compact, medium, large
    },
    {
      id: 'categories',
      type: 'categories',
      label: 'Navigasi Kategori',
      visible: true,
      props: { style: 'pills' }, // style: pills, tabs, underline
    },
    {
      id: 'products',
      type: 'products',
      label: 'Daftar Produk',
      visible: true,
      props: { layout: 'grid' }, // layout: grid, list, card
    },
    {
      id: 'social',
      type: 'social',
      label: 'Media Sosial & Kontak',
      visible: true,
      props: { links: [], whatsapp: '', instagram: '', facebook: '', tiktok: '', maps: '' },
    },
    {
      id: 'footer',
      type: 'footer',
      label: 'Footer & Ucapan Penutup',
      visible: true,
      props: { text: 'Terima kasih sudah mendukung usaha kami ❤️' },
    },
  ],
}

/**
 * Normalizes and merges incoming stored settings with the standard default structure.
 */
export function normalizeDesignSettings(stored = {}) {
  if (!stored || typeof stored !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS))
  }

  const mergedTheme = {
    ...DEFAULT_DESIGN_SETTINGS.theme,
    ...(stored.theme || {}),
  }

  // Ensure all standard blocks exist in layout even if user saved partial
  const existingLayout = Array.isArray(stored.layout) ? stored.layout : []
  const defaultLayout = DEFAULT_DESIGN_SETTINGS.layout

  const layoutMap = new Map(existingLayout.map(item => [item.id, item]))
  const mergedLayout = []

  // Add existing items in saved order
  for (const item of existingLayout) {
    const defaultDef = defaultLayout.find(d => d.id === item.id)
    if (defaultDef) {
      mergedLayout.push({
        ...defaultDef,
        ...item,
        props: { ...(defaultDef.props || {}), ...(item.props || {}) },
      })
    }
  }

  // Append any missing default blocks
  for (const def of defaultLayout) {
    if (!layoutMap.has(def.id)) {
      mergedLayout.push(JSON.parse(JSON.stringify(def)))
    }
  }

  return {
    version: stored.version || 1,
    theme: mergedTheme,
    layout: mergedLayout,
  }
}

const designCache = new Map()
const inFlightDesignRequests = new Map()

export function invalidateDesignSettingsCache(businessId) {
  if (businessId) {
    designCache.delete(businessId)
    inFlightDesignRequests.delete(businessId)
  } else {
    designCache.clear()
    inFlightDesignRequests.clear()
  }
}

/**
 * Loads the QR Menu design settings for a business.
 * If not customized yet, returns the default settings.
 * Includes in-memory caching and single-flight coalescing for high concurrency.
 */
export async function getDesignSettings(businessId, client = supabase) {
  if (!businessId) {
    return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS))
  }

  const isDefaultClient = client === supabase
  if (isDefaultClient) {
    const cached = designCache.get(businessId)
    if (cached && Date.now() - cached.timestamp < 60000) {
      return JSON.parse(JSON.stringify(cached.data))
    }

    if (inFlightDesignRequests.has(businessId)) {
      return inFlightDesignRequests.get(businessId)
    }
  }

  const fetchPromise = (async () => {
    try {
      const { data, error } = await client
        .from('qr_menu_design_settings')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle()

      if (error) {
        console.warn('[qrMenuDesignService] Error reading design settings:', error.message)
        return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS))
      }

      if (!data) {
        return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS))
      }

      const normalized = normalizeDesignSettings(data)
      if (isDefaultClient) {
        designCache.set(businessId, { data: normalized, timestamp: Date.now() })
      }
      return normalized
    } catch (err) {
      console.error('[qrMenuDesignService] Failed to load design settings:', err)
      return JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS))
    } finally {
      if (isDefaultClient) {
        inFlightDesignRequests.delete(businessId)
      }
    }
  })()

  if (isDefaultClient) {
    inFlightDesignRequests.set(businessId, fetchPromise)
  }
  return fetchPromise
}

/**
 * Saves or updates the QR Menu design settings for a business.
 */
export async function saveDesignSettings(businessId, settings) {
  if (!businessId) {
    throw new Error('business_id diperlukan untuk menyimpan pengaturan desain.')
  }

  const normalized = normalizeDesignSettings(settings)

  const payload = {
    business_id: businessId,
    version: normalized.version || 1,
    theme: normalized.theme,
    layout: normalized.layout,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('qr_menu_design_settings')
    .upsert(payload, { onConflict: 'business_id' })
    .select()
    .single()

  if (error) {
    console.error('[qrMenuDesignService] Upsert error:', error)
    throw new Error(error.message || 'Gagal menyimpan pengaturan desain menu.')
  }

  invalidateDesignSettingsCache(businessId)

  return {
    success: true,
    data: normalizeDesignSettings(data),
  }
}

/**
 * Uploads a logo or banner image for the QR Menu to Supabase storage.
 * Strictly uses tenant-isolated path in 'product-images' bucket:
 * product-images/qr-menu/{businessId}/logo/...
 * product-images/qr-menu/{businessId}/banner/...
 */
export async function uploadDesignAsset(businessId, file, type = 'logo') {
  if (!businessId || !file) {
    throw new Error('business_id dan file diperlukan untuk upload asset.')
  }

  // File MIME type validation
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  if (!validTypes.includes(file.type)) {
    throw new Error('Format file tidak didukung. Harap gunakan JPG, PNG, WEBP, atau SVG.')
  }

  // File size validation (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal adalah 5MB.')
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'svg']
  if (!allowedExts.includes(ext)) {
    throw new Error('Ekstensi file tidak diizinkan. Gunakan jpg, jpeg, png, webp, atau svg.')
  }

  const sanitizedType = type === 'banner' ? 'banner' : 'logo'
  const filePath = `qr-menu/${businessId}/${sanitizedType}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) {
    console.error('[qrMenuDesignService] Upload error to product-images:', uploadError)
    throw new Error(uploadError.message || 'Gagal mengunggah gambar ke penyimpanan.')
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(filePath)
  return data.publicUrl
}

