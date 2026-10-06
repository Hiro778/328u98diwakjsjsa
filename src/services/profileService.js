import { supabase } from '../lib/supabase.js'

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * Validates avatar image file type and size.
 *
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAvatarFile(file) {
  if (!file) {
    return { valid: false, error: 'Pilih file gambar terlebih dahulu.' }
  }

  const fileType = (file.type || '').toLowerCase()
  if (!ALLOWED_AVATAR_TYPES.includes(fileType)) {
    return {
      valid: false,
      error: 'Format file tidak didukung. Gunakan format JPG, JPEG, PNG, atau WebP.',
    }
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return {
      valid: false,
      error: 'Ukuran file melebihi batas maksimal 5 MB.',
    }
  }

  return { valid: true }
}

/**
 * Returns the currently authenticated user from Supabase Auth.
 * This is always fetched from the server-validated session — NOT from frontend state —
 * to ensure the userId used for RLS always matches auth.uid().
 *
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    throw new Error('Avatar upload gagal: Sesi tidak valid. Silakan login kembali.')
  }
  return data.user
}

/**
 * Uploads user avatar to Supabase Storage and updates the profiles table.
 *
 * Security:
 * - User ID is ALWAYS taken from supabase.auth.getUser() (server-validated),
 *   NOT from frontend state, to ensure it always matches auth.uid() in RLS.
 * - Uploads only to the authenticated user's designated directory: {userId}/avatar-{timestamp}.ext
 * - New avatar is uploaded FIRST; database is only updated if upload succeeds.
 *
 * @param {string} hintUserId - Hint from UI state for pre-validation only (actual upload uses server-verified ID)
 * @param {File} file
 * @param {string} [oldAvatarUrl]
 * @returns {Promise<{ avatarUrl: string, profile: object }>}
 */
export async function uploadUserAvatar(hintUserId, file, oldAvatarUrl = '') {
  if (!hintUserId) {
    throw new Error('Avatar upload gagal: User ID tidak tersedia.')
  }

  const validation = validateAvatarFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Always verify from server-side auth — guarantees RLS auth.uid() match
  const authUser = await getAuthenticatedUser()
  const userId = authUser.id

  // Derive file extension
  let ext = 'jpg'
  if (file.name && file.name.includes('.')) {
    ext = file.name.split('.').pop().toLowerCase()
  } else if (file.type) {
    ext = file.type.split('/')[1] || 'jpg'
  }
  if (ext === 'jpeg') ext = 'jpg'

  // Path: {userId}/avatar-{timestamp}.{ext} — matches RLS: foldername(name)[1] = auth.uid()::text
  const fileName = `${userId}/avatar-${Date.now()}.${ext}`

  // 1. Upload new avatar to storage (upsert handles both new and replacement)
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '0',  // No cache — forces browser to fetch fresh avatar
      upsert: true,
    })

  if (uploadError) {
    console.error('[profileService] Avatar storage upload error:', uploadError)
    throw new Error(`Avatar upload gagal: ${uploadError.message}`)
  }

  // 2. Get public URL (add cache-busting query param so browser always fetches the fresh photo)
  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(uploadData.path)

  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

  // 3. Update profile record in database — RLS: auth.uid() = id
  const { data: updatedProfile, error: dbError } = await supabase
    .from('profiles')
    .update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()

  if (dbError) {
    console.error('[profileService] Profile update error (avatar_url):', dbError)
    throw new Error(`Profile update gagal: ${dbError.message}`)
  }

  // 4. Best-effort cleanup of old avatar (non-blocking, non-critical)
  if (oldAvatarUrl) {
    try {
      // Strip query params before parsing path
      const cleanOldUrl = oldAvatarUrl.split('?')[0]
      const storagePathMatch = cleanOldUrl.match(/\/avatars\/(.+)$/)
      if (storagePathMatch && storagePathMatch[1]) {
        const oldPath = storagePathMatch[1]
        // Only delete if it belongs to this user's folder
        if (oldPath.startsWith(`${userId}/`)) {
          supabase.storage.from('avatars').remove([oldPath]).catch(() => {})
        }
      }
    } catch {
      // Non-critical — ignore cleanup errors
    }
  }

  return { avatarUrl: publicUrl, profile: updatedProfile }
}

/**
 * Updates user profile information (full_name).
 * Uses server-verified auth.uid() as an additional guard.
 *
 * @param {string} userId
 * @param {{ fullName: string }} data
 * @returns {Promise<object>}
 */
export async function updateUserProfile(userId, { fullName }) {
  if (!userId) {
    throw new Error('User ID wajib disertakan.')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({
      full_name: (fullName || '').trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('[profileService] updateUserProfile error:', error)
    throw new Error(`Profile update gagal: ${error.message}`)
  }

  return profile
}

/**
 * Updates or creates business details for the user.
 * Tenant isolation enforced via .eq('owner_id', userId) and Supabase RLS.
 *
 * @param {string} businessId
 * @param {string} userId
 * @param {{ name: string, businessType: string, businessCategory: string, location: string, whatsapp?: string }} data
 * @returns {Promise<object>}
 */
export async function updateUserBusiness(businessId, userId, { name, businessType, businessCategory, location, whatsapp }) {
  if (!userId) {
    throw new Error('User ID wajib disertakan.')
  }

  const payload = {
    name: (name || '').trim(),
    business_type: businessType || '',
    business_category: businessCategory || '',
    location: (location || '').trim(),
    updated_at: new Date().toISOString(),
  }

  if (whatsapp !== undefined) {
    payload.whatsapp = (whatsapp || '').trim()
  }

  if (businessId) {
    const { data, error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', businessId)
      .eq('owner_id', userId)
      .select()
      .single()

    if (error) {
      console.error('[profileService] updateUserBusiness error:', error)
      throw new Error(`Business update gagal: ${error.message}`)
    }
    return data
  }

  // Insert new business if none exists
  const { data, error } = await supabase
    .from('businesses')
    .insert({
      ...payload,
      owner_id: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[profileService] insertUserBusiness error:', error)
    throw new Error(`Business insert gagal: ${error.message}`)
  }

  return data
}
