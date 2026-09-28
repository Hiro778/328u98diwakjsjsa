import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAvatarFile,
  MAX_AVATAR_SIZE,
  ALLOWED_AVATAR_TYPES,
  uploadUserAvatar,
  updateUserProfile,
  updateUserBusiness,
} from '../services/profileService.js'

describe('Profile Service & Validation Suite', () => {
  it('should validate avatar file size limit (5MB)', () => {
    assert.equal(MAX_AVATAR_SIZE, 5 * 1024 * 1024)

    // Valid size <= 5MB
    const validFile = { name: 'avatar.jpg', type: 'image/jpeg', size: 4 * 1024 * 1024 }
    const resultValid = validateAvatarFile(validFile)
    assert.equal(resultValid.valid, true)

    // Oversized > 5MB
    const oversizedFile = { name: 'huge.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }
    const resultOversized = validateAvatarFile(oversizedFile)
    assert.equal(resultOversized.valid, false)
    assert.match(resultOversized.error, /5 MB/i)
  })

  it('should validate supported image formats (JPG, JPEG, PNG, WebP)', () => {
    assert.deepEqual(ALLOWED_AVATAR_TYPES, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

    // Valid formats
    const formats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    for (const fmt of formats) {
      const res = validateAvatarFile({ name: 'test.img', type: fmt, size: 1000 })
      assert.equal(res.valid, true, `Format ${fmt} should be valid`)
    }

    // Invalid formats (PDF, GIF, SVG, text)
    const invalidFormats = ['application/pdf', 'image/gif', 'image/svg+xml', 'text/plain']
    for (const fmt of invalidFormats) {
      const res = validateAvatarFile({ name: 'test.bad', type: fmt, size: 1000 })
      assert.equal(res.valid, false, `Format ${fmt} should be rejected`)
      assert.match(res.error, /Format file tidak didukung/i)
    }
  })

  it('should reject empty or missing file in validation', () => {
    const res = validateAvatarFile(null)
    assert.equal(res.valid, false)
    assert.match(res.error, /Pilih file gambar/i)
  })

  it('should require userId when uploading avatar', async () => {
    await assert.rejects(
      async () => {
        await uploadUserAvatar(null, { name: 'test.png', type: 'image/png', size: 100 })
      },
      /User ID wajib disertakan|User ID tidak tersedia/
    )
  })

  it('should require valid file when uploading avatar', async () => {
    await assert.rejects(
      async () => {
        await uploadUserAvatar('user-123', { name: 'doc.pdf', type: 'application/pdf', size: 100 })
      },
      /Format file tidak didukung/
    )
  })

  it('should require userId when updating user profile', async () => {
    await assert.rejects(
      async () => {
        await updateUserProfile('', { fullName: 'Budi' })
      },
      /User ID wajib disertakan/
    )
  })

  it('should require userId when updating user business', async () => {
    await assert.rejects(
      async () => {
        await updateUserBusiness('biz-123', null, { name: 'Toko Budi' })
      },
      /User ID wajib disertakan/
    )
  })
})

describe('Profile Initials and Fallback Logic', () => {
  function getInitials(fullName, email) {
    return (fullName || email || '?')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  it('generates two-letter initials correctly from multi-word names', () => {
    assert.equal(getInitials('Hilal Abiyu', 'abiyu@gmail.com'), 'HA')
    assert.equal(getInitials('Ahmad Dahlan Putra', 'ahmad@example.com'), 'AD')
    assert.equal(getInitials('Budi Santoso', ''), 'BS')
  })

  it('generates initials for single-word names and email fallbacks', () => {
    assert.equal(getInitials('Budi', ''), 'B')
    assert.equal(getInitials('', 'hilal@example.com'), 'H')
    assert.equal(getInitials('', ''), '?')
  })
})
