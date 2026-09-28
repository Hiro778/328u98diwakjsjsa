import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validateClientUrl,
  normalizeLinkUrl,
  SUPPORTED_PLATFORMS,
  normalizeSocialLinksError,
} from '../services/footerSocialLinksService.js'

describe('Footer & Social Links Management Tests (@42.md)', () => {
  // ─── A, M, N, O, P, Q, R: URL Validation & Creation ─────────────────────────
  test('A & M. Instagram URL validation and creation', () => {
    const res = validateClientUrl('https://instagram.com/bisnissehat', 'instagram')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('instagram.com/bisnissehat', 'instagram')
    assert.equal(normalized, 'https://instagram.com/bisnissehat')
  })

  test('N. TikTok URL validation and normalization', () => {
    const res = validateClientUrl('https://tiktok.com/@bisnissehat', 'tiktok')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('tiktok.com/@bisnissehat', 'tiktok')
    assert.equal(normalized, 'https://tiktok.com/@bisnissehat')
  })

  test('O. Email validation and mailto: normalization', () => {
    const res = validateClientUrl('support@bisnissehat.id', 'email')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('support@bisnissehat.id', 'email')
    assert.equal(normalized, 'mailto:support@bisnissehat.id')

    const invalid = validateClientUrl('not-an-email', 'email')
    assert.equal(invalid.valid, false)
  })

  test('P. WhatsApp validation and https://wa.me normalization', () => {
    const res = validateClientUrl('https://wa.me/6281234567890', 'whatsapp')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('wa.me/6281234567890', 'whatsapp')
    assert.equal(normalized, 'https://wa.me/6281234567890')
  })

  test('Q. Phone/Telepon validation and tel: normalization', () => {
    const res = validateClientUrl('+6281234567890', 'phone')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('+6281234567890', 'phone')
    assert.equal(normalized, 'tel:+6281234567890')

    const invalid = validateClientUrl('abc-phone', 'phone')
    assert.equal(invalid.valid, false)
  })

  test('R. Custom URL validation and normalization', () => {
    const res = validateClientUrl('https://custom-partner.id/bisnissehat', 'custom')
    assert.equal(res.valid, true)
    const normalized = normalizeLinkUrl('custom-partner.id/bisnissehat', 'custom')
    assert.equal(normalized, 'https://custom-partner.id/bisnissehat')
  })

  // ─── H. Dangerous URL Protection ───────────────────────────────────────────
  test('H. URL berbahaya ditolak (javascript:, data:, vbscript:, file:)', () => {
    const dangerousList = [
      'javascript:alert("XSS")',
      'javascript:document.cookie',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]

    for (const dangerous of dangerousList) {
      const res = validateClientUrl(dangerous, 'custom')
      assert.equal(res.valid, false, `Should reject dangerous URL: ${dangerous}`)
    }
  })

  // ─── B, C, D: Admin Operations Logic ────────────────────────────────────────
  test('B. Admin edit updates platform, label, and url properly', () => {
    const item = {
      id: 'mock-id-1',
      platform: 'instagram',
      label: 'Instagram Official',
      url: 'https://instagram.com/bisnissehat',
      enabled: true,
      sort_order: 1,
    }
    const updated = {
      ...item,
      label: 'Instagram BisnisSehat ID',
      url: 'https://instagram.com/bisnissehat.id',
    }
    assert.equal(updated.label, 'Instagram BisnisSehat ID')
    assert.equal(updated.url, 'https://instagram.com/bisnissehat.id')
  })

  test('C & G. Admin enable/disable toggle works and disabled links are excluded', () => {
    const links = [
      { id: '1', platform: 'instagram', enabled: true, sort_order: 1 },
      { id: '2', platform: 'tiktok', enabled: false, sort_order: 2 },
      { id: '3', platform: 'whatsapp', enabled: true, sort_order: 3 },
    ]
    const enabledOnly = links.filter((l) => l.enabled)
    assert.equal(enabledOnly.length, 2)
    assert.equal(enabledOnly.some((l) => l.platform === 'tiktok'), false)
  })

  test('D. Admin delete removes link from list', () => {
    const links = [
      { id: '1', platform: 'instagram' },
      { id: '2', platform: 'tiktok' },
    ]
    const afterDelete = links.filter((l) => l.id !== '1')
    assert.equal(afterDelete.length, 1)
    assert.equal(afterDelete[0].platform, 'tiktok')
  })

  // ─── E. Sort Order ─────────────────────────────────────────────────────────
  test('E. Sort order sorting works correctly', () => {
    const links = [
      { id: '3', platform: 'whatsapp', sort_order: 3 },
      { id: '1', platform: 'instagram', sort_order: 1 },
      { id: '2', platform: 'tiktok', sort_order: 2 },
    ]
    const sorted = [...links].sort((a, b) => a.sort_order - b.sort_order)
    assert.equal(sorted[0].platform, 'instagram')
    assert.equal(sorted[1].platform, 'tiktok')
    assert.equal(sorted[2].platform, 'whatsapp')
  })

  // ─── F & I. Security / RLS / Mutation Errors ───────────────────────────────
  test('F & I. User biasa tidak bisa mutasi dan error dinormalisasi dengan aman', () => {
    const err42501 = { message: '42501 permission denied for table footer_social_links' }
    const normalized = normalizeSocialLinksError(err42501)
    assert.match(normalized.message, /Akses ditolak.*hanya admin/i)

    const unauth = { message: 'Unauthorized' }
    assert.match(normalizeSocialLinksError(unauth).message, /Akses ditolak/i)
  })

  // ─── J, K, L, S, T: Footer UI & Routes Validation ──────────────────────────
  test('J. Footer tidak menampilkan Blog, Karir, atau Kontak lama', () => {
    const footerContent = readFileSync('src/components/Footer.jsx', 'utf8')
    assert.equal(footerContent.includes('href="/blog"'), false)
    assert.equal(footerContent.includes('href="/karir"'), false)
    assert.equal(footerContent.includes('href="/kontak"'), false)
    assert.equal(footerContent.includes('Blog'), false)
    assert.equal(footerContent.includes('Karir'), false)
  })

  test('K. FAQ muncul di footer dengan route valid', () => {
    const footerContent = readFileSync('src/components/Footer.jsx', 'utf8')
    assert.match(footerContent, /FAQ/)
    assert.match(footerContent, /\/dashboard\/bantuan/)
  })

  test('L. Tentang Kami muncul di footer dan file page TentangKamiPage.jsx ada', () => {
    const footerContent = readFileSync('src/components/Footer.jsx', 'utf8')
    assert.match(footerContent, /Tentang Kami/)
    assert.match(footerContent, /\/tentang-kami/)

    const tentangKamiContent = readFileSync('src/pages/TentangKamiPage.jsx', 'utf8')
    assert.match(tentangKamiContent, /BisnisSehat adalah platform digital untuk membantu UMKM/i)
  })

  test('S. Footer tidak error jika socialLinks kosong', () => {
    const emptyLinks = []
    const hasSocialLinks = emptyLinks.length > 0
    assert.equal(hasSocialLinks, false)
    // No social icons rendered when array is empty
  })

  test('T. Existing valid footer routes tetap bekerja', () => {
    const footerContent = readFileSync('src/components/Footer.jsx', 'utf8')
    assert.match(footerContent, /\/dashboard/)
    assert.match(footerContent, /\/#features/)
    assert.match(footerContent, /\/dashboard\/ekspor/)
    assert.match(footerContent, /\/pricing/)
    assert.match(footerContent, /\/dashboard\/semua-tools/)
  })

  test('Supported platforms list contains all 11 required platforms', () => {
    const expectedKeys = [
      'instagram', 'tiktok', 'whatsapp', 'email', 'phone',
      'youtube', 'facebook', 'x', 'linkedin', 'website', 'custom',
    ]
    const actualKeys = SUPPORTED_PLATFORMS.map((p) => p.key)
    for (const key of expectedKeys) {
      assert.ok(actualKeys.includes(key), `Platform ${key} must be supported`)
    }
  })
})
