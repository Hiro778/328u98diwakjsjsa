// src/services/bugReportService.js
// Client service for Bug Report submission & storage upload
// Conforms strictly to @30.md specifications:
// - User identity strictly bound to authenticated Supabase session
// - Scoped storage path: support/{user_id}/{ticket_id}/{filename}
// - Input validation (Name optional, Description required, Screenshot required with MIME & size check)
// - Transactional integrity with rollback cleanup if database persistence fails
// - Zero admin secrets exposed

import { supabase } from '../lib/supabase.js'

export const MAX_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Validates Bug Report form inputs before network operations.
 *
 * @param {Object} params
 * @param {string} [params.name]
 * @param {string} params.description
 * @param {File|Blob|null} params.screenshotFile
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateBugReportInput({ name, description, screenshotFile }) {
  const errors = {}

  // 1. Nama: Optional (do not reject empty string)
  // 2. Deskripsi Bug: WAJIB, textarea, trim whitespace, cannot submit if empty
  const trimmedDesc = typeof description === 'string' ? description.trim() : ''
  if (!trimmedDesc) {
    errors.description = 'Deskripsi bug wajib diisi.'
  }

  // 3. Foto / Screenshot: WAJIB
  if (!screenshotFile) {
    errors.screenshot = 'Screenshot atau foto bukti bug wajib dilampirkan.'
  } else {
    // Type validation
    const fileType = screenshotFile.type || ''
    if (!ALLOWED_IMAGE_TYPES.includes(fileType)) {
      errors.screenshot = 'Format file tidak didukung. Harap unggah gambar PNG, JPEG, atau WebP.'
    } else if (screenshotFile.size > MAX_SCREENSHOT_SIZE_BYTES) {
      errors.screenshot = `Ukuran gambar terlalu besar (${(screenshotFile.size / (1024 * 1024)).toFixed(1)}MB). Maksimal 5MB.`
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Uploads screenshot to the tenant/user-scoped support storage bucket.
 * Storage path: support/{userId}/{ticketId}/{safeFilename}
 *
 * @param {File|Blob} file
 * @param {Object} context
 * @param {string} context.userId
 * @param {string} context.ticketId
 * @returns {Promise<{ storagePath: string, screenshotUrl: string }>}
 */
export async function uploadBugReportScreenshot(file, { userId, ticketId }) {
  if (!userId || !ticketId) {
    throw new Error('Identitas sesi atau tiket tidak valid.')
  }

  const rawExt = file.name ? file.name.split('.').pop().toLowerCase() : ''
  const ext = ['png', 'jpg', 'jpeg', 'webp'].includes(rawExt) ? rawExt : 'png'
  const safeFilename = `${Date.now()}_screenshot.${ext}`
  const storagePath = `support/${userId}/${ticketId}/${safeFilename}`

  const { error: uploadError } = await supabase.storage
    .from('support-screenshots')
    .upload(storagePath, file, {
      contentType: file.type || 'image/png',
      upsert: false,
    })

  if (uploadError) {
    console.error('[bugReportService] Storage upload error:', uploadError)
    throw new Error(`Gagal mengunggah foto screenshot: ${uploadError.message}`)
  }

  // Generate signed URL (1 year) or fallback to publicUrl
  let screenshotUrl = ''
  try {
    const { data: signedData, error: signError } = await supabase.storage
      .from('support-screenshots')
      .createSignedUrl(storagePath, 31536000) // 1 year expiry

    if (!signError && signedData?.signedUrl) {
      screenshotUrl = signedData.signedUrl
    }
  } catch (err) {
    console.warn('[bugReportService] Signed URL warning, fallback:', err)
  }

  if (!screenshotUrl) {
    const { data: pubData } = supabase.storage
      .from('support-screenshots')
      .getPublicUrl(storagePath)
    screenshotUrl = pubData?.publicUrl || storagePath
  }

  return { storagePath, screenshotUrl }
}

/**
 * Cleans up orphaned screenshot if database persistence fails.
 *
 * @param {string} storagePath
 */
export async function deleteBugReportScreenshot(storagePath) {
  if (!storagePath) return
  try {
    await supabase.storage
      .from('support-screenshots')
      .remove([storagePath])
  } catch (cleanupErr) {
    console.warn('[bugReportService] Cleanup orphaned file warning:', cleanupErr)
  }
}

/**
 * Submits native Bug Report with transactional rollback on failure.
 *
 * @param {Object} params
 * @param {string} [params.name] - Optional reporter name
 * @param {string} params.description - Required bug description
 * @param {File|Blob} params.screenshotFile - Required screenshot file
 * @param {string} [params.pageUrl] - Page URL where bug occurred
 * @param {string|null} [params.businessId] - Business context UUID if available
 * @returns {Promise<{ success: boolean, ticket: Object }>}
 */
export async function submitBugReport({
  name = '',
  description = '',
  screenshotFile = null,
  pageUrl = '',
  businessId = null,
}) {
  // 1. Preflight validation
  const validation = validateBugReportInput({ name, description, screenshotFile })
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0]
    throw new Error(firstMsg || 'Validasi form laporan bug gagal.')
  }

  // 2. Identity Verification: Must come from authenticated Supabase session
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const user = authData?.user

  if (authError || !user) {
    throw new Error('Sesi pengguna tidak valid atau telah berakhir. Harap login kembali.')
  }

  // 3. Generate Ticket ID for deterministic scoped upload
  const ticketId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })

  // 4. Upload screenshot first
  let uploadedPath = null
  let screenshotUrl = null

  try {
    const uploadRes = await uploadBugReportScreenshot(screenshotFile, {
      userId: user.id,
      ticketId,
    })
    uploadedPath = uploadRes.storagePath
    screenshotUrl = uploadRes.screenshotUrl
  } catch (uploadErr) {
    // If upload fails -> ticket is NOT submitted
    throw uploadErr
  }

  // 5. Insert Ticket into public.support_tickets
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  const trimmedDesc = description.trim()
  const finalDescription = trimmedName
    ? `[Pelapor: ${trimmedName}]\n\n${trimmedDesc}`
    : trimmedDesc

  const currentPage = pageUrl || (typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '')

  const payload = {
    id: ticketId,
    user_id: user.id,
    business_id: businessId || null,
    category: 'Bug',
    subject: 'Bug Report',
    description: finalDescription,
    page_url: currentPage,
    screenshot_url: screenshotUrl,
    priority: 'medium',
    status: 'new',
    admin_note: null,
  }

  try {
    const { data: ticket, error: dbError } = await supabase
      .from('support_tickets')
      .insert(payload)
      .select()
      .single()

    if (dbError) {
      throw dbError
    }

    return {
      success: true,
      ticket,
    }
  } catch (dbErr) {
    // 6. Rollback / Cleanup orphaned storage asset on DB failure
    if (uploadedPath) {
      await deleteBugReportScreenshot(uploadedPath)
    }
    console.error('[bugReportService] Database insert error:', dbErr)
    throw new Error(`Gagal menyimpan laporan bug ke sistem: ${dbErr.message || 'Database error'}`)
  }
}
