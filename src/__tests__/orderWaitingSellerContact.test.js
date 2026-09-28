// src/__tests__/orderWaitingSellerContact.test.js
// Specification & Verification Test Suite for Order Waiting Screen Seller Contact (@2.md)
// Tests:
// 1. Order with WhatsApp available
// 2. Order with Telephone only available
// 3. Order without contact (fallback "Kontak penjual belum tersedia", zero dummy data)
// 4. Contact strictly belongs to the correct business/order (tenant isolation)
// 5. Zero leakage of private profile email, user ID, or internal credentials
// 6. WhatsApp and tel URLs correctly generated and normalized
// 7. Status flow preservation (BARU / Menunggu Konfirmasi -> DIPROSES -> SELESAI)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import {
  normalizePhoneDigits,
  normalizePhoneForWhatsApp,
  formatDisplayPhone,
  getWhatsAppUrl,
  getTelUrl,
  resolveBusinessContact,
} from '../services/businessContactService.js'

describe('Order Waiting Screen — Seller Contact Specification Suite (@2.md)', () => {
  // ────────────────────────────────────────────────────────────
  // 1. PHONE & WHATSAPP NORMALIZATION
  // ────────────────────────────────────────────────────────────
  describe('1. Phone & WhatsApp Normalization', () => {
    it('normalizes local Indonesian number to E.164 without plus for wa.me', () => {
      const waUrl = getWhatsAppUrl('081234567890')
      assert.equal(waUrl, 'https://wa.me/6281234567890')
    })

    it('normalizes +62 international format correctly', () => {
      const waUrl = getWhatsAppUrl('+62 812-3456-7890')
      assert.equal(waUrl, 'https://wa.me/6281234567890')
    })

    it('handles pre-formatted wa.me URL gracefully', () => {
      const waUrl = getWhatsAppUrl('https://wa.me/62895329390610?text=halo')
      assert.equal(waUrl, 'https://wa.me/62895329390610')
    })

    it('generates normalized tel: URL with clean digits', () => {
      const telUrl = getTelUrl('(021) 789-0123')
      assert.equal(telUrl, 'tel:0217890123')
    })

    it('formats display phone back to familiar 08... format for Indonesian users', () => {
      assert.equal(formatDisplayPhone('62895329390610'), '0895329390610')
      assert.equal(formatDisplayPhone('081234567890'), '081234567890')
    })
  })

  // ────────────────────────────────────────────────────────────
  // 2. ORDER WITH WHATSAPP CONTACT AVAILABLE
  // ────────────────────────────────────────────────────────────
  describe('2. Order with WhatsApp Contact Available', () => {
    const mockBusiness = {
      id: 'biz-cafe-101',
      name: 'Kopi Sehat Nusantara',
      is_menu_published: true,
    }

    const mockDesignSettingsWithWa = {
      layout: [
        {
          id: 'social',
          type: 'social',
          props: {
            links: [
              {
                id: 'link-wa',
                platform: 'whatsapp',
                url: 'https://wa.me/6281234567890',
              },
            ],
          },
        },
      ],
    }

    it('resolves WhatsApp contact from QR Menu Designer layout social block', () => {
      const contact = resolveBusinessContact({
        business: mockBusiness,
        designSettings: mockDesignSettingsWithWa,
      })

      assert.equal(contact.hasContact, true)
      assert.equal(contact.type, 'whatsapp')
      assert.equal(contact.businessName, 'Kopi Sehat Nusantara')
      assert.equal(contact.displayPhone, '081234567890')
      assert.equal(contact.actionUrl, 'https://wa.me/6281234567890')
      assert.equal(contact.actionLabel, 'Hubungi Penjual')
    })

    it('prioritizes WhatsApp when both WhatsApp and telephone are provided', () => {
      const contact = resolveBusinessContact({
        business: mockBusiness,
        designSettings: mockDesignSettingsWithWa,
        extraContact: {
          phone: '0217890123',
          whatsapp: '081987654321',
        },
      })

      assert.equal(contact.hasContact, true)
      assert.equal(contact.type, 'whatsapp')
      assert.equal(contact.displayPhone, '081987654321')
      assert.equal(contact.actionUrl, 'https://wa.me/6281987654321')
    })
  })

  // ────────────────────────────────────────────────────────────
  // 3. ORDER WITH TELEPHONE ONLY AVAILABLE
  // ────────────────────────────────────────────────────────────
  describe('3. Order with Telephone Only Available', () => {
    const mockBusiness = {
      id: 'biz-resto-202',
      name: 'Resto Padang Modern',
      is_menu_published: true,
    }

    it('resolves phone contact and generates tel: action URL when only phone is set', () => {
      const contact = resolveBusinessContact({
        business: mockBusiness,
        designSettings: { layout: [] },
        extraContact: {
          phone: '0217654321',
          whatsapp: '',
        },
      })

      assert.equal(contact.hasContact, true)
      assert.equal(contact.type, 'phone')
      assert.equal(contact.businessName, 'Resto Padang Modern')
      assert.equal(contact.phone, '0217654321')
      assert.equal(contact.actionUrl, 'tel:0217654321')
      assert.equal(contact.actionLabel, 'Hubungi Penjual')
    })
  })

  // ────────────────────────────────────────────────────────────
  // 4. ORDER WITHOUT CONTACT (ZERO DUMMY DATA)
  // ────────────────────────────────────────────────────────────
  describe('4. Order Without Contact (Fallback & Zero Dummy Data)', () => {
    const mockBusinessNoContact = {
      id: 'biz-empty-303',
      name: 'Usaha Baru',
      is_menu_published: true,
    }

    it('returns "Kontak penjual belum tersedia" without creating fake or dummy numbers', () => {
      const contact = resolveBusinessContact({
        business: mockBusinessNoContact,
        designSettings: { layout: [] },
        extraContact: {},
      })

      assert.equal(contact.hasContact, false)
      assert.equal(contact.type, null)
      assert.equal(contact.phone, '')
      assert.equal(contact.actionUrl, '')
      assert.equal(contact.message, 'Kontak penjual belum tersedia')
      assert.equal(contact.businessName, 'Usaha Baru')
    })
  })

  // ────────────────────────────────────────────────────────────
  // 5. TENANT ISOLATION & ACCIDENTAL CROSS-USER LEAK PREVENTION
  // ────────────────────────────────────────────────────────────
  describe('5. Security, Tenant Isolation & Privacy Verification', () => {
    it('strictly isolates contact to target business and rejects global active business leakage', () => {
      const bizA = { id: 'biz-a', name: 'Toko A' }
      const bizB = { id: 'biz-b', name: 'Toko B' }

      const contactA = resolveBusinessContact({
        business: bizA,
        extraContact: { whatsapp: '081111111111' },
      })
      const contactB = resolveBusinessContact({
        business: bizB,
        extraContact: { whatsapp: '082222222222' },
      })

      assert.equal(contactA.businessName, 'Toko A')
      assert.equal(contactA.displayPhone, '081111111111')

      assert.equal(contactB.businessName, 'Toko B')
      assert.equal(contactB.displayPhone, '082222222222')
    })

    it('never exposes private profile email, user_id, or internal database secrets', () => {
      const rawPayload = {
        business: {
          id: 'biz-secret',
          name: 'Toko Rahasia',
          owner_id: 'user-uuid-12345',
          email: 'pribadi@owner.com',
          user_metadata: { secret_token: 'xyz' },
        },
        extraContact: {
          whatsapp: '081234567890',
          owner_email: 'pribadi@owner.com',
        },
      }

      const contact = resolveBusinessContact(rawPayload)

      assert.equal('email' in contact, false)
      assert.equal('owner_id' in contact, false)
      assert.equal('owner_email' in contact, false)
      assert.equal('user_metadata' in contact, false)
      assert.equal('secret_token' in contact, false)
    })
  })

  // ────────────────────────────────────────────────────────────
  // 6. CODEBASE & LIFECYCLE INTEGRITY AUDIT
  // ────────────────────────────────────────────────────────────
  describe('6. Codebase & Flow Integrity Audit', () => {
    const publicMenuCode = readFileSync('src/pages/public/PublicMenuPage.jsx', 'utf8')

    it('PublicMenuPage renders "Kontak Penjual" card', () => {
      assert.ok(publicMenuCode.includes('Kontak Penjual'), 'Must render Kontak Penjual section')
      assert.ok(publicMenuCode.includes('activeSellerContact'), 'Must bind activeSellerContact')
    })

    it('PublicMenuPage renders "Kontak penjual belum tersedia" fallback notice', () => {
      assert.ok(
        publicMenuCode.includes('Kontak penjual belum tersedia'),
        'Must render fallback message when no contact is configured'
      )
    })

    it('PublicMenuPage renders wa.me link with Hubungi Penjual action', () => {
      assert.ok(publicMenuCode.includes('activeSellerContact.actionUrl'), 'Must render action URL')
      assert.ok(publicMenuCode.includes('Hubungi Penjual'), 'Must provide Hubungi Penjual button')
    })

    it('Strictly retains order status flow (BARU -> DIPROSES -> SELESAI)', async () => {
      const { mapCustomerOrderStatus } = await import('../services/posService.js')
      const waiting = mapCustomerOrderStatus('baru', { isQris: true, qrisPaidAcknowledged: true })
      assert.equal(waiting.title, 'Menunggu Konfirmasi Penjual')

      const diproses = mapCustomerOrderStatus('diproses')
      assert.equal(diproses.title, 'Sedang Diproses')

      const selesai = mapCustomerOrderStatus('selesai')
      assert.equal(selesai.title, 'Pesanan Selesai')
    })

    it('Strictly preserves QRIS payment mechanism and does not tamper with merchant flow', () => {
      assert.ok(publicMenuCode.includes('qrisPaidAcknowledged'))
      assert.ok(publicMenuCode.includes('Saya Sudah Bayar / Lanjut'))
      assert.ok(!publicMenuCode.includes('merchant_process_order = null'))
    })
  })
})
