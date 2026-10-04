// src/services/qrisPaymentService.js
// Centralized QRIS Payment Settings and Storage Service
// Tenant isolation is strictly enforced via Supabase RLS and server-derived storage paths.

import { supabase } from '../lib/supabase.js'

export const QRIS_STORAGE_BUCKET = 'business-assets'
export const MAX_QRIS_FILE_SIZE = 3 * 1024 * 1024 // 3 MB
export const ALLOWED_QRIS_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const ALLOWED_QRIS_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates UUID format for businessId.
 * @param {string} businessId
 * @returns {boolean}
 */
export function isValidUuid(businessId) {
  if (!businessId || typeof businessId !== 'string') return false
  return UUID_REGEX.test(businessId.trim())
}

/**
 * Validates QRIS image file for MIME type, extension, and file size.
 * Strictly rejects SVG, HTML, JavaScript, and executables.
 *
 * @param {File|{ name: string, type: string, size: number }} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateQrisFile(file) {
  if (!file) {
    return { valid: false, error: 'Pilih file gambar QRIS terlebih dahulu.' }
  }

  // Size limit validation (<= 3 MB)
  if (typeof file.size === 'number' && file.size > MAX_QRIS_FILE_SIZE) {
    return { valid: false, error: 'Ukuran file melebihi batas maksimal 3 MB.' }
  }

  // MIME type validation
  const mime = (file.type || '').toLowerCase().trim()
  if (!mime || !ALLOWED_QRIS_MIME_TYPES.includes(mime)) {
    return {
      valid: false,
      error: 'Format file tidak didukung. Harap gunakan format gambar PNG, JPEG, atau WebP (SVG dan format lain tidak diizinkan).',
    }
  }

  // File extension check (guard against mime spoofing with mismatched extensions)
  let ext = ''
  if (file.name && file.name.includes('.')) {
    ext = file.name.split('.').pop().toLowerCase().trim()
  } else if (mime) {
    ext = mime.split('/')[1] || ''
  }
  if (ext === 'jpg') ext = 'jpeg'

  const allowedExts = ['png', 'jpeg', 'webp']
  if (!allowedExts.includes(ext)) {
    return {
      valid: false,
      error: 'Ekstensi file tidak diizinkan. Gunakan ekstensi .png, .jpg, .jpeg, atau .webp.',
    }
  }

  return { valid: true }
}

/**
 * Normalizes Supabase database and storage errors into safe, user-friendly errors
 * without exposing internal table schemas or raw SQL details.
 *
 * @param {Error|{ message?: string, code?: string, details?: string }} err
 * @param {string} defaultMessage
 * @returns {Error|null}
 */
export function normalizeQrisError(err, defaultMessage = 'Terjadi kesalahan pada layanan QRIS.') {
  if (!err) return null
  const message = String(err.message || '')
  const code = String(err.code || '')

  if (message.includes('ACCOUNT_SUSPENDED')) {
    return new Error('Akun Anda sedang dinonaktifkan atau dibatasi.')
  }

  if (message.includes('ORDER_NOT_FOUND') || code === 'P0002') {
    return new Error('Pesanan tidak ditemukan.')
  }

  if (message.includes('INVALID_PAYMENT_METHOD')) {
    return new Error('Hanya pesanan dengan metode pembayaran QRIS yang dapat dikonfirmasi.')
  }

  if (message.includes('INVALID_PAYMENT_STATUS')) {
    return new Error('Status pembayaran pesanan tidak valid untuk dikonfirmasi.')
  }

  if (message.includes('CONCURRENCY_CONFLICT') || code === '40001') {
    return new Error('Terjadi konflik saat memproses konfirmasi pembayaran. Silakan muat ulang halaman.')
  }

  if (
    code === '42501' ||
    message.includes('42501') ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('Unauthorized') ||
    message.includes('UNAUTHORIZED') ||
    message.includes('Forbidden') ||
    message.includes('FORBIDDEN')
  ) {
    if (message.includes('mengonfirmasi') || message.includes('pesanan')) {
      return new Error('Akses ditolak: Anda tidak memiliki izin untuk mengonfirmasi pesanan bisnis ini.')
    }
    return new Error('Akses ditolak: Anda tidak memiliki izin untuk mengelola pengaturan QRIS bisnis ini.')
  }

  if (code === '23503' || message.includes('foreign key constraint') || message.includes('violates foreign key')) {
    return new Error('Bisnis tidak valid atau tidak ditemukan dalam sistem.')
  }

  if (code === '23505' || message.includes('duplicate key value') || message.includes('unique constraint')) {
    return new Error('Pengaturan QRIS untuk bisnis ini sudah terdaftar.')
  }

  if (code === 'PGRST205' || message.includes('schema cache') || message.includes('Could not find the table')) {
    return new Error('Tabel pengaturan QRIS belum tersedia pada database.')
  }

  if (message.includes('Bucket not found')) {
    return new Error('Bucket penyimpanan business-assets tidak ditemukan.')
  }

  return new Error(message || defaultMessage)
}

/**
 * Safely derives storage path from verified business ID and file type.
 * Never trusts a client-supplied path.
 * Path format: {businessId}/qris.{ext}
 *
 * @param {string} businessId
 * @param {string} [ext='png']
 * @returns {string}
 */
export function deriveQrisStoragePath(businessId, ext = 'png') {
  if (!isValidUuid(businessId)) {
    throw new Error('business_id tidak valid untuk membuat path penyimpanan.')
  }
  const cleanExt = (ext === 'jpg' ? 'jpeg' : ext).toLowerCase().replace(/[^a-z]/g, '')
  return `${businessId}/qris.${cleanExt || 'png'}`
}

const qrisSettingsCache = new Map()
const inFlightQrisRequests = new Map()
const secureUrlCache = new Map()
const inFlightUrlRequests = new Map()

export function invalidateQrisPaymentCache(businessId) {
  if (businessId) {
    qrisSettingsCache.delete(businessId)
    inFlightQrisRequests.delete(businessId)
    secureUrlCache.delete(businessId)
    inFlightUrlRequests.delete(businessId)
  } else {
    qrisSettingsCache.clear()
    inFlightQrisRequests.clear()
    secureUrlCache.clear()
    inFlightUrlRequests.clear()
  }
}

/**
 * Fetches QRIS payment settings for a given business.
 * Tenant-isolated via Supabase RLS.
 * Includes in-memory caching and request coalescing for high concurrency.
 *
 * @param {string} businessId
 * @param {object} [client=supabase]
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function getBusinessQrisSettings(businessId, client = supabase) {
  if (!isValidUuid(businessId)) {
    return {
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  const isDefaultClient = client === supabase
  if (isDefaultClient) {
    const cached = qrisSettingsCache.get(businessId)
    if (cached && Date.now() - cached.timestamp < 60000) {
      return { data: cached.data ? { ...cached.data } : null, error: null }
    }

    if (inFlightQrisRequests.has(businessId)) {
      return inFlightQrisRequests.get(businessId)
    }
  }

  const fetchPromise = (async () => {
    try {
      const { data, error } = await client
        .from('business_payment_settings')
        .select('business_id, qris_image_url, qris_enabled, created_at, updated_at')
        .eq('business_id', businessId)
        .maybeSingle()

      if (error) {
        return { data: null, error: normalizeQrisError(error, 'Gagal mengambil pengaturan QRIS.') }
      }

      if (!data) {
        const fallback = {
          business_id: businessId,
          qris_image_url: null,
          qris_enabled: false,
          created_at: null,
          updated_at: null,
        }
        if (isDefaultClient) {
          qrisSettingsCache.set(businessId, { data: fallback, timestamp: Date.now() })
        }
        return { data: fallback, error: null }
      }

      if (isDefaultClient) {
        qrisSettingsCache.set(businessId, { data, timestamp: Date.now() })
      }
      return { data, error: null }
    } catch (err) {
      return { data: null, error: normalizeQrisError(err, 'Gagal mengambil pengaturan QRIS.') }
    } finally {
      if (isDefaultClient) {
        inFlightQrisRequests.delete(businessId)
      }
    }
  })()

  if (isDefaultClient) {
    inFlightQrisRequests.set(businessId, fetchPromise)
  }
  return fetchPromise
}

/**
 * Upserts QRIS payment settings for a business.
 *
 * @param {object} params
 * @param {string} params.businessId
 * @param {string|null} [params.qrisImageUrl]
 * @param {boolean} [params.qrisEnabled=false]
 * @param {object} [client=supabase]
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function upsertBusinessQrisSettings(
  { businessId, qrisImageUrl = null, qrisEnabled = false },
  client = supabase
) {
  if (!isValidUuid(businessId)) {
    return {
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  const payload = {
    business_id: businessId,
    qris_image_url: qrisImageUrl,
    qris_enabled: Boolean(qrisEnabled),
    updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await client
      .from('business_payment_settings')
      .upsert(payload, { onConflict: 'business_id' })
      .select('business_id, qris_image_url, qris_enabled, created_at, updated_at')
      .single()

    if (error) {
      return { data: null, error: normalizeQrisError(error, 'Gagal menyimpan pengaturan QRIS.') }
    }

    invalidateQrisPaymentCache(businessId)
    return { data, error: null }
  } catch (err) {
    return { data: null, error: normalizeQrisError(err, 'Gagal menyimpan pengaturan QRIS.') }
  }
}

/**
 * Uploads a QRIS image file for a business to Supabase Storage ('business-assets' bucket)
 * and updates the business_payment_settings record.
 *
 * @param {string} businessId
 * @param {File|{ name: string, type: string, size: number }} file
 * @param {object} [options={}]
 * @param {object} [client=supabase]
 * @returns {Promise<{ data: object|null, publicUrl?: string, storagePath?: string, error: Error|null }>}
 */
export async function uploadBusinessQris(businessId, file, options = {}, client = supabase) {
  if (!isValidUuid(businessId)) {
    return {
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  const validation = validateQrisFile(file)
  if (!validation.valid) {
    return { data: null, error: new Error(validation.error) }
  }

  // Derive file extension safely
  let ext = 'png'
  if (file.name && file.name.includes('.')) {
    ext = file.name.split('.').pop().toLowerCase().trim()
  } else if (file.type) {
    ext = file.type.split('/')[1] || 'png'
  }
  if (ext === 'jpg') ext = 'jpeg'

  const storagePath = deriveQrisStoragePath(businessId, ext)

  try {
    // 1. Upload to Supabase Storage 'business-assets'
    const { error: uploadError } = await client.storage
      .from(QRIS_STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'image/png',
      })

    if (uploadError) {
      return {
        data: null,
        error: normalizeQrisError(uploadError, 'Gagal mengunggah gambar QRIS ke penyimpanan.'),
      }
    }

    // 2. Get Public URL for the asset
    const { data: urlData } = client.storage
      .from(QRIS_STORAGE_BUCKET)
      .getPublicUrl(storagePath)

    const publicUrl = urlData?.publicUrl || storagePath

    // 3. Upsert settings with the new QRIS image URL, preserving qris_enabled if requested
    const currentEnabled = typeof options.qrisEnabled === 'boolean' ? options.qrisEnabled : true

    const { data: settingsData, error: dbError } = await client
      .from('business_payment_settings')
      .upsert(
        {
          business_id: businessId,
          qris_image_url: publicUrl,
          qris_enabled: currentEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      )
      .select('business_id, qris_image_url, qris_enabled, created_at, updated_at')
      .single()

    if (dbError) {
      try {
        await client.storage.from(QRIS_STORAGE_BUCKET).remove([storagePath])
      } catch {
        console.warn('[qrisPaymentService] Failed to remove orphaned QRIS storage asset:', storagePath)
      }
      return {
        data: null,
        error: normalizeQrisError(dbError, 'Gambar terunggah tetapi gagal memperbarui database.'),
      }
    }

    invalidateQrisPaymentCache(businessId)

    return {
      data: settingsData,
      publicUrl,
      storagePath,
      error: null,
    }
  } catch (err) {
    return { data: null, error: normalizeQrisError(err, 'Terjadi kesalahan saat mengunggah QRIS.') }
  }
}

/**
 * Deletes QRIS asset from Supabase storage and resets business_payment_settings.
 *
 * @param {string} businessId
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, error: Error|null }>}
 */
export async function deleteBusinessQris(businessId, client = supabase) {
  if (!isValidUuid(businessId)) {
    return {
      success: false,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  try {
    // 1. Remove potential files from storage bucket
    const possiblePaths = [
      `${businessId}/qris.png`,
      `${businessId}/qris.jpeg`,
      `${businessId}/qris.jpg`,
      `${businessId}/qris.webp`,
    ]

    await client.storage.from(QRIS_STORAGE_BUCKET).remove(possiblePaths)

    // 2. Update database record to clear qris_image_url and disable qris
    const { error: dbError } = await client
      .from('business_payment_settings')
      .update({
        qris_image_url: null,
        qris_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)

    if (dbError) {
      return {
        success: false,
        error: normalizeQrisError(dbError, 'Gagal memperbarui pengaturan QRIS setelah penghapusan.'),
      }
    }

    invalidateQrisPaymentCache(businessId)
    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: normalizeQrisError(err, 'Gagal menghapus file QRIS.'),
    }
  }
}

/**
 * Toggles the QRIS payment enabled status for a business.
 *
 * @param {string} businessId
 * @param {boolean} enabled
 * @param {object} [client=supabase]
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function setBusinessQrisEnabled(businessId, enabled, client = supabase) {
  if (!isValidUuid(businessId)) {
    return {
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  if (typeof enabled !== 'boolean') {
    return {
      data: null,
      error: new Error('Status aktif harus berupa nilai boolean (true/false).'),
    }
  }

  // Pre-condition: Cannot enable QRIS if no qris_image_url exists
  if (enabled) {
    const { data: currentSettings, error: fetchErr } = await getBusinessQrisSettings(businessId, client)
    if (fetchErr) {
      return { data: null, error: fetchErr }
    }
    if (!currentSettings || !currentSettings.qris_image_url) {
      return {
        data: null,
        error: new Error('Upload QRIS terlebih dahulu sebelum mengaktifkan pembayaran QRIS.'),
      }
    }
  }

  try {
    const { data, error } = await client
      .from('business_payment_settings')
      .upsert(
        {
          business_id: businessId,
          qris_enabled: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      )
      .select('business_id, qris_image_url, qris_enabled, created_at, updated_at')
      .single()

    if (error) {
      return {
        data: null,
        error: normalizeQrisError(error, 'Gagal mengubah status aktif QRIS.'),
      }
    }

    invalidateQrisPaymentCache(businessId)
    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: normalizeQrisError(err, 'Gagal mengubah status aktif QRIS.'),
    }
  }
}

/**
 * Generates a scoped, time-limited signed URL for viewing a business's QRIS image.
 * Targets only: {business_id}/qris.{ext} in the private 'business-assets' bucket.
 * Never accepts arbitrary storage paths from client to prevent path traversal or tenant leakage.
 *
 * @param {string} businessId
 * @param {object} [client=supabase]
 * @param {number} [expiresIn=3600] - Expiry in seconds (default 1 hour)
 * @returns {Promise<{ data: { signedUrl: string, storagePath: string, expiresIn: number }|null, error: Error|null }>}
 */
export async function getSecureQrisUrl(businessId, client = supabase, expiresIn = 3600) {
  if (!isValidUuid(businessId)) {
    return {
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  const isDefaultClient = client === supabase
  if (isDefaultClient) {
    const cached = secureUrlCache.get(businessId)
    if (cached && Date.now() - cached.timestamp < 3000 * 1000) {
      return { data: { ...cached.data }, error: null }
    }

    if (inFlightUrlRequests.has(businessId)) {
      return inFlightUrlRequests.get(businessId)
    }
  }

  const fetchPromise = (async () => {
    try {
      // 1. Fetch settings to ensure QRIS exists and derive extension
      const { data: settings, error: fetchErr } = await getBusinessQrisSettings(businessId, client)
      if (fetchErr) {
        return { data: null, error: fetchErr }
      }

      if (!settings || !settings.qris_image_url) {
        return { data: null, error: null }
      }

      // 2. Extract extension safely from stored URL / filename
      let ext = 'png'
      const cleanUrl = String(settings.qris_image_url).split('?')[0]
      const extMatch = cleanUrl.match(/\.([a-zA-Z0-9]+)$/)
      if (extMatch && ALLOWED_QRIS_EXTENSIONS.includes(extMatch[1].toLowerCase())) {
        ext = extMatch[1].toLowerCase()
      }
      if (ext === 'jpg') ext = 'jpeg'

      // 3. Derive canonical, strict storage path: {businessId}/qris.{ext}
      const storagePath = deriveQrisStoragePath(businessId, ext)

      // Defense-in-depth: Reject any path traversal attempt or non-matching business path
      if (storagePath.includes('..') || !storagePath.startsWith(`${businessId}/`)) {
        return {
          data: null,
          error: new Error('Akses ditolak: Path penyimpanan tidak valid.'),
        }
      }

      // 4. Generate signed URL from private bucket
      const { data: signedData, error: signError } = await client.storage
        .from(QRIS_STORAGE_BUCKET)
        .createSignedUrl(storagePath, expiresIn)

      if (signError) {
        return {
          data: null,
          error: normalizeQrisError(signError, 'Gagal membuat URL akses aman untuk QRIS.'),
        }
      }

      const result = {
        signedUrl: signedData?.signedUrl || signedData,
        storagePath,
        expiresIn,
      }
      if (isDefaultClient) {
        secureUrlCache.set(businessId, { data: result, timestamp: Date.now() })
      }

      return {
        data: result,
        error: null,
      }
    } catch (err) {
      return {
        data: null,
        error: normalizeQrisError(err, 'Gagal memproses akses QRIS aman.'),
      }
    } finally {
      if (isDefaultClient) {
        inFlightUrlRequests.delete(businessId)
      }
    }
  })()

  if (isDefaultClient) {
    inFlightUrlRequests.set(businessId, fetchPromise)
  }
  return fetchPromise
}

/**
 * Loads public QRIS payment settings for public checkout.
 * Enforces that QRIS is enabled and image exists.
 *
 * @param {string} businessId
 * @param {object} [client=supabase]
 * @returns {Promise<{ available: boolean, data: object|null, error: Error|null }>}
 */
export async function getPublicQrisSettings(businessId, client = supabase) {
  if (!isValidUuid(businessId)) {
    return {
      available: false,
      data: null,
      error: new Error('business_id wajib berupa UUID yang valid.'),
    }
  }

  try {
    const { data: settings, error } = await client
      .from('business_payment_settings')
      .select('business_id, qris_image_url, qris_enabled')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      return {
        available: false,
        data: null,
        error: normalizeQrisError(error, 'Gagal memeriksa ketersediaan QRIS.'),
      }
    }

    const available = Boolean(settings && settings.qris_enabled && settings.qris_image_url)

    return {
      available,
      data: available ? settings : null,
      error: null,
    }
  } catch (err) {
    return {
      available: false,
      data: null,
      error: normalizeQrisError(err, 'Gagal memeriksa ketersediaan QRIS.'),
    }
  }
}

/**
 * Sanitizes public checkout and order errors to prevent raw SQL, schema, or Postgres codes
 * from leaking to customers.
 *
 * @param {Error|{ message?: string, code?: string }|string} err
 * @returns {string} User-friendly Indonesian error message
 */
export function sanitizePublicCheckoutError(err) {
  if (!err) return 'Gagal mengirim pesanan. Silakan coba lagi.'
  const message = typeof err === 'string' ? err : String(err.message || '')
  const code = typeof err === 'object' && err?.code ? String(err.code) : ''

  if (code === '23514' || message.includes('INSUFFICIENT_STOCK') || message.includes('Stok tidak mencukupi')) {
    return 'Stok tidak mencukupi untuk item pesanan.'
  }
  if (message.includes('tidak tersedia')) {
    return 'Salah satu produk pilihan Anda sedang tidak tersedia.'
  }
  if (message.includes('Keranjang belanja tidak boleh kosong')) {
    return 'Keranjang belanja tidak boleh kosong.'
  }
  if (message.includes('Pelanggaran isolasi tenant') || message.includes('bukan milik bisnis ini')) {
    return 'Item pesanan tidak valid untuk toko ini.'
  }
  if (message.includes('Menu bisnis belum dipublikasikan')) {
    return 'Menu bisnis ini belum dipublikasikan.'
  }
  if (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('42501')
  ) {
    return 'Akses ditolak atau toko sedang tidak melayani pesanan publik.'
  }
  if (code.startsWith('PGRST') || message.includes('schema cache') || message.includes('PGRST') || code === 'PGRST205') {
    return 'Layanan pesanan sedang diperbarui. Silakan coba beberapa saat lagi.'
  }
  if (message.includes('Failed to fetch') || message.includes('network') || message.includes('NetworkError')) {
    return 'Koneksi internet bermasalah. Periksa jaringan Anda dan coba lagi.'
  }
  return 'Gagal mengirim pesanan. Silakan coba lagi.'
}

/**
 * Confirms payment for a pending QRIS order by the business owner.
 * Invokes server-side PostgreSQL RPC `confirm_qris_payment`.
 *
 * @param {string} orderId
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, data: object|null, error: Error|null }>}
 */
export async function confirmQrisPayment(orderId, client = supabase) {
  if (!isValidUuid(orderId)) {
    return {
      success: false,
      data: null,
      error: new Error('ID pesanan tidak valid.'),
    }
  }

  try {
    const { data, error } = await client.rpc('confirm_qris_payment', {
      p_order_id: orderId,
    })

    if (error) {
      return {
        success: false,
        data: null,
        error: normalizeQrisError(error, 'Gagal mengonfirmasi pembayaran QRIS.'),
      }
    }

    return {
      success: true,
      data,
      error: null,
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: normalizeQrisError(err, 'Gagal mengonfirmasi pembayaran QRIS.'),
    }
  }
}



