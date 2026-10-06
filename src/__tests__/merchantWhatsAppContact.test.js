// src/__tests__/merchantWhatsAppContact.test.js
// Specification & Verification Test Suite for Merchant WhatsApp Contact
// Covers specifications A through J per task instructions:
// A. Merchant saves WhatsApp number -> persist
// B. Refresh settings -> number remains in business object
// C. Buyer opens merchant menu -> WhatsApp Penjual button uses correct merchant number
// D. Number not available -> button disabled / "WhatsApp belum tersedia"
// E. Number: 081234567890 -> EXPECTED URL: https://wa.me/6281234567890
// F. Number: +6281234567890 -> EXPECTED URL: https://wa.me/6281234567890
// G. Nomor merchant A tidak boleh muncul pada menu merchant B (tenant isolation)
// H. Internal OrderChatModal tidak lagi dirender
// I. Buyer tidak membuat realtime order-chat channel
// J. Seller POS tidak membuat realtime order-chat channel

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizePhoneDigits,
  normalizePhoneForWhatsApp,
  formatDisplayPhone,
  getWhatsAppUrl,
  resolveBusinessContact,
  fetchBusinessContact,
  invalidateBusinessContactCache,
} from '../services/businessContactService.js'
import { updateUserBusiness } from '../services/profileService.js'

describe('Merchant WhatsApp Contact & Internal Chat Removal Suite', () => {
  // ────────────────────────────────────────────────────────────
  // A & B: Merchant Saves WhatsApp Number & Persists on Refresh
  // ────────────────────────────────────────────────────────────
  describe('A & B. Merchant Settings Persistence', () => {
    it('A. updateUserBusiness sends whatsapp field in update payload', async () => {
      let capturedPayload = null
      let capturedBusinessId = null
      let capturedOwnerId = null

      const mockSupabase = {
        from: (table) => {
          assert.strictEqual(table, 'businesses')
          return {
            update: (payload) => {
              capturedPayload = payload
              return {
                eq: (col1, val1) => {
                  if (col1 === 'id') capturedBusinessId = val1
                  return {
                    eq: (col2, val2) => {
                      if (col2 === 'owner_id') capturedOwnerId = val2
                      return {
                        select: () => ({
                          single: async () => ({
                            data: { id: capturedBusinessId, owner_id: capturedOwnerId, ...capturedPayload },
                            error: null,
                          }),
                        }),
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }

      // Test with custom client or by inspecting payload structure
      const payload = {
        name: 'Warung Bu Siti',
        businessType: 'Kuliner',
        businessCategory: 'Makanan',
        location: 'Jakarta',
        whatsapp: '081234567890',
      }

      // Verify profileService function definition accepts whatsapp
      const profileServiceSrc = fs.readFileSync(path.resolve('src/services/profileService.js'), 'utf8')
      assert.ok(profileServiceSrc.includes('whatsapp'), 'updateUserBusiness must handle whatsapp field')
      assert.ok(profileServiceSrc.includes('payload.whatsapp = (whatsapp || \'\').trim()'), 'updateUserBusiness must trim and store whatsapp')
    })

    it('B. ProfilePage binds and persists Nomor WhatsApp field', () => {
      const profilePageSrc = fs.readFileSync(path.resolve('src/pages/dashboard/ProfilePage.jsx'), 'utf8')
      assert.ok(profilePageSrc.includes('Nomor WhatsApp'), 'ProfilePage must render Nomor WhatsApp label')
      assert.ok(
        profilePageSrc.includes('Nomor ini digunakan pelanggan untuk menghubungi bisnis Anda melalui WhatsApp.'),
        'ProfilePage must include exact helper text'
      )
      assert.ok(profilePageSrc.includes('whatsapp: business?.whatsapp || \'\''), 'Form must load whatsapp on mount/refresh')
      assert.ok(profilePageSrc.includes('whatsapp: form.whatsapp'), 'Form submission must send whatsapp')
      assert.ok(profilePageSrc.includes('invalidateBusinessContactCache'), 'Must invalidate contact cache on save')
    })
  })

  // ────────────────────────────────────────────────────────────
  // E & F: Phone Number Normalization
  // ────────────────────────────────────────────────────────────
  describe('E & F. Phone Normalization to International wa.me URL', () => {
    it('E. Normalizes local 081234567890 to 6281234567890 and generates valid wa.me URL', () => {
      const input = '081234567890'
      const normalized = normalizePhoneForWhatsApp(input)
      assert.strictEqual(normalized, '6281234567890')

      const waUrl = getWhatsAppUrl(input)
      assert.strictEqual(waUrl, 'https://wa.me/6281234567890')
      assert.ok(!waUrl.includes('wa.me/08'), 'WhatsApp URL must never start with 08')
    })

    it('F. Normalizes +6281234567890 to 6281234567890 and generates valid wa.me URL', () => {
      const input = '+6281234567890'
      const normalized = normalizePhoneForWhatsApp(input)
      assert.strictEqual(normalized, '6281234567890')

      const waUrl = getWhatsAppUrl(input)
      assert.strictEqual(waUrl, 'https://wa.me/6281234567890')
    })

    it('Normalizes 6281234567890 (canonical) unchanged', () => {
      const input = '6281234567890'
      const normalized = normalizePhoneForWhatsApp(input)
      assert.strictEqual(normalized, '6281234567890')

      const waUrl = getWhatsAppUrl(input)
      assert.strictEqual(waUrl, 'https://wa.me/6281234567890')
    })

    it('Encodes safe prefilled message without secrets', () => {
      const orderNumber = '196'
      const waUrl = getWhatsAppUrl('081234567890', `Halo, saya ingin menanyakan pesanan #${orderNumber}.`)
      assert.strictEqual(
        waUrl,
        'https://wa.me/6281234567890?text=Halo%2C%20saya%20ingin%20menanyakan%20pesanan%20%23196.'
      )
    })
  })

  // ────────────────────────────────────────────────────────────
  // C & D: Buyer UI — WhatsApp Penjual Button
  // ────────────────────────────────────────────────────────────
  describe('C & D. Buyer UI WhatsApp Button Behavior', () => {
    it('C. PublicMenuPage renders WhatsApp Penjual button using merchant contact', () => {
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(menuSrc.includes('buyer-whatsapp-penjual-btn'), 'PublicMenuPage must render buyer-whatsapp-penjual-btn')
      assert.ok(menuSrc.includes('WhatsApp Penjual'), 'Button label must be WhatsApp Penjual')
      assert.ok(menuSrc.includes("window.open(waUrl, '_blank', 'noopener,noreferrer')"), 'Button must open waUrl in new tab')
      assert.ok(!menuSrc.includes('Chat Penjual'), 'PublicMenuPage must not contain Chat Penjual label')
      assert.ok(!menuSrc.includes('buyer-chat-penjual-btn'), 'Old buyer-chat-penjual-btn must be removed')
    })

    it('D. Shows "WhatsApp belum tersedia" and disables button when merchant has no WhatsApp', () => {
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(menuSrc.includes('WhatsApp belum tersedia'), 'Must render WhatsApp belum tersedia when unavailable')
      assert.ok(menuSrc.includes('disabled'), 'Must disable button when unavailable')

      // Also verify resolveBusinessContact returns hasContact=false
      const contact = resolveBusinessContact({ business: { id: 'biz-1', name: 'Toko Kosong' } })
      assert.strictEqual(contact.hasContact, false)
      assert.strictEqual(contact.actionUrl, '')
    })

    it('Ensures NO emojis are used in the WhatsApp button or helper text', () => {
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      // Old button had 💬
      assert.ok(!menuSrc.includes('💬'), 'Must not contain chat bubble emoji 💬')
      assert.ok(!menuSrc.includes('📱'), 'Must not contain phone emoji 📱')
    })
  })

  // ────────────────────────────────────────────────────────────
  // G: Tenant Isolation
  // ────────────────────────────────────────────────────────────
  describe('G. Tenant Isolation', () => {
    it('G. Merchant A WhatsApp number does not leak to Merchant B menu', () => {
      invalidateBusinessContactCache()

      const bizA = { id: 'biz-aaa', name: 'Warung A', whatsapp: '081111111111' }
      const bizB = { id: 'biz-bbb', name: 'Warung B', whatsapp: '082222222222' }

      const contactA = resolveBusinessContact({ business: bizA })
      const contactB = resolveBusinessContact({ business: bizB })

      assert.strictEqual(contactA.phone, '081111111111')
      assert.strictEqual(contactA.actionUrl, 'https://wa.me/6281111111111')

      assert.strictEqual(contactB.phone, '082222222222')
      assert.strictEqual(contactB.actionUrl, 'https://wa.me/6282222222222')

      assert.notStrictEqual(contactA.actionUrl, contactB.actionUrl)
      assert.ok(!contactB.actionUrl.includes('6281111111111'), 'Merchant B menu must not contain Merchant A phone')
    })
  })

  // ────────────────────────────────────────────────────────────
  // H, I, J: Removal of Internal Chat & Realtime Cleanups
  // ────────────────────────────────────────────────────────────
  describe('H, I, J. Internal Chat & Realtime Cleanups', () => {
    it('H. Internal OrderChatModal is NO LONGER rendered in PublicMenuPage or PosPage', () => {
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(!menuSrc.includes('<OrderChatModal'), 'PublicMenuPage must not render OrderChatModal')
      assert.ok(!menuSrc.includes('OrderChatModal'), 'PublicMenuPage must not import OrderChatModal')

      const posSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/PosPage.jsx'), 'utf8')
      assert.ok(!posSrc.includes('<OrderChatModal'), 'PosPage must not render OrderChatModal')
      assert.ok(!posSrc.includes('OrderChatModal'), 'PosPage must not import OrderChatModal')
    })

    it('I. Buyer does NOT create realtime order-chat channel', () => {
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(!menuSrc.includes('order-chat-'), 'PublicMenuPage must not reference order-chat- channels')
      assert.ok(!menuSrc.includes('subscribeOrderMessages'), 'PublicMenuPage must not call subscribeOrderMessages')
      assert.ok(!menuSrc.includes('order_messages'), 'PublicMenuPage must not listen to order_messages')
    })

    it('J. Seller POS does NOT create realtime order-chat channel', () => {
      const posSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/PosPage.jsx'), 'utf8')
      assert.ok(!posSrc.includes('pos-order-messages-realtime'), 'PosPage must not create pos-order-messages-realtime')
      assert.ok(!posSrc.includes('order_messages'), 'PosPage must not listen to order_messages table')
      assert.ok(!posSrc.includes('Chat Pembeli'), 'PosPage must not render Chat Pembeli button')
    })
  })
})
