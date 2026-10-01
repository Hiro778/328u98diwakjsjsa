import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeWhatsAppNumber,
  generateAiCreditWhatsAppMessage,
  buildAiCreditWhatsAppUrl,
  handleAiCreditWhatsAppPurchase,
} from '../services/aiCreditPurchaseService.js'

describe('AI Credit WhatsApp Purchase Flow (@credit.md Part B)', () => {
  test('1. Normalizes Indonesian phone numbers into clean wa.me format (628...)', () => {
    assert.equal(normalizeWhatsAppNumber('081234567890'), '6281234567890')
    assert.equal(normalizeWhatsAppNumber('+6281234567890'), '6281234567890')
    assert.equal(normalizeWhatsAppNumber('6281234567890'), '6281234567890')
    assert.equal(normalizeWhatsAppNumber('+62 812-3456-7890'), '6281234567890')
    assert.equal(normalizeWhatsAppNumber('0812-3456-7890'), '6281234567890')
  })

  test('2. Missing, empty, or placeholder WhatsApp number handling', () => {
    assert.equal(normalizeWhatsAppNumber(null), null)
    assert.equal(normalizeWhatsAppNumber(undefined), null)
    assert.equal(normalizeWhatsAppNumber(''), null)
    assert.equal(normalizeWhatsAppNumber('   '), null)
    assert.equal(normalizeWhatsAppNumber('12345'), null) // too short
    assert.equal(normalizeWhatsAppNumber('628xxxxxxxxxx'), null) // placeholder
    assert.equal(normalizeWhatsAppNumber('0000000000'), null) // all zeros
  })

  test('3. Generates correct message with package name, credits, price, and email', () => {
    const message = generateAiCreditWhatsAppMessage({
      packageName: 'Starter Pack',
      credits: 100,
      priceIdr: 49000,
      userEmail: 'owner@warungmaju.com',
    })

    assert.ok(message.includes('Halo Admin BisnisSehat,'))
    assert.ok(message.includes('Saya ingin membeli AI Credit.'))
    assert.ok(message.includes('Paket: Starter Pack (100 AI Credits)'))
    assert.ok(message.includes('Harga: Rp49.000'))
    assert.ok(message.includes('User email: owner@warungmaju.com'))
    assert.ok(message.includes('Mohon informasi pembayaran dan proses top up credit.'))
  })

  test('4. Message falls back to "-" when user email is absent', () => {
    const message = generateAiCreditWhatsAppMessage({
      packageName: 'Pro Creator',
      credits: 500,
      priceIdr: 199000,
      userEmail: null,
    })

    assert.ok(message.includes('User email: -'))
    assert.ok(message.includes('Harga: Rp199.000'))
  })

  test('5. WhatsApp URL encodes message completely with encodeURIComponent', () => {
    const url = buildAiCreditWhatsAppUrl({
      packageName: 'Starter Pack',
      credits: 100,
      priceIdr: 49000,
      userEmail: 'user@test.com',
      phoneOverride: '081234567890',
    })

    assert.ok(url.startsWith('https://wa.me/6281234567890?text='))
    const rawQuery = url.split('?text=')[1]
    const decoded = decodeURIComponent(rawQuery)
    assert.ok(decoded.includes('Starter Pack (100 AI Credits)'))
    assert.ok(decoded.includes('user@test.com'))
    assert.ok(!url.includes(' '), 'URL must not contain raw unencoded spaces')
    assert.ok(!url.includes('\n'), 'URL must not contain raw unencoded newlines')
  })

  test('6. Returns null when building URL if WhatsApp destination is unconfigured', () => {
    const url = buildAiCreditWhatsAppUrl({
      packageName: 'Starter Pack',
      credits: 100,
      priceIdr: 49000,
      phoneOverride: null,
    })

    // If env is empty/not set in test runner, returns null
    if (!process.env.VITE_AI_CREDIT_WHATSAPP_NUMBER) {
      assert.equal(url, null)
    }
  })

  test('7. handleAiCreditWhatsAppPurchase returns clear error when number unconfigured without opening URL', () => {
    const res = handleAiCreditWhatsAppPurchase({
      packageData: { name: 'Starter Pack', credits: 100, priceIdr: 49000 },
      userEmail: 'test@example.com',
      phoneOverride: '',
    })

    if (!process.env.VITE_AI_CREDIT_WHATSAPP_NUMBER) {
      assert.equal(res.success, false)
      assert.ok(res.error.includes('VITE_AI_CREDIT_WHATSAPP_NUMBER'))
    }
  })

  test('8. Source audit: CreativeCreditsPage.jsx button uses "Beli Credit" and does not mutate credits on click', () => {
    const pageSrc = fs.readFileSync(
      path.resolve('src/pages/dashboard/marketing/CreativeCreditsPage.jsx'),
      'utf8'
    )

    assert.ok(pageSrc.includes('Beli Credit'), 'Button text must be Beli Credit per credit.md')
    assert.ok(pageSrc.includes('handleAiCreditWhatsAppPurchase'), 'Must invoke WhatsApp purchase handler')
    // Ensure no direct balance mutation in handleTopup
    assert.ok(!pageSrc.includes('overview.balance.available +='), 'Must not mutate balance directly')
    assert.ok(!pageSrc.includes('overview.balance.available ='), 'Must not mutate balance directly')
  })
})
