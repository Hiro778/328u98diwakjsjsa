/**
 * src/services/aiCreditPurchaseService.js
 * AI Credit Purchase via WhatsApp Admin Flow.
 * Strictly conforms to load.md and credit.md specifications:
 * - Directs user to WhatsApp Admin for manual/secure top up coordination.
 * - No auto-credit mutation on frontend click.
 * - Reuses existing platform settings WhatsApp (support_phone) or centralized config.
 * - Proper Indonesian E.164 phone normalization without plus sign for wa.me.
 * - Standardized message format with encodeURIComponent.
 * - Clear error handling when WhatsApp number is unconfigured (no invalid wa.me URLs).
 */

/**
 * Normalizes phone number into clean wa.me format (digits only, 62 prefix).
 * Returns null if empty, invalid, or dummy placeholder.
 *
 * @param {string|null|undefined} rawPhone
 * @returns {string|null}
 */
export function normalizeWhatsAppNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null

  // Remove non-digit characters except leading plus if any
  let digits = rawPhone.replace(/\D/g, '')

  // Reject dummy placeholders or too short numbers
  if (!digits || digits.length < 9) return null
  if (/^0+$/.test(digits) || /^628000/.test(digits) || digits.includes('xxxx')) return null

  // Indonesian local format conversion: 08xxx -> 628xxx
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1)
  }

  // Already 62xxx
  if (digits.startsWith('62')) {
    return digits
  }

  return digits
}

/**
 * Retrieves configured Admin WhatsApp phone number.
 * Reads from centralized env: VITE_AI_CREDIT_WHATSAPP_NUMBER
 *
 * @returns {string|null}
 */
export function getAiCreditWhatsAppNumber() {
  const envNumber =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_CREDIT_WHATSAPP_NUMBER) ||
    (typeof process !== 'undefined' && process.env?.VITE_AI_CREDIT_WHATSAPP_NUMBER) ||
    ''

  return normalizeWhatsAppNumber(envNumber)
}

/**
 * Formats the AI credit purchase message according to load.md Section 2 / credit.md Part B.
 *
 * @param {Object} params
 * @param {string} params.packageName - e.g. "Starter" or "Starter Pack"
 * @param {number|string} params.credits - e.g. 100
 * @param {number|string} params.priceIdr - e.g. 25000
 * @param {string} [params.userEmail] - Authenticated user email
 * @param {string} [params.businessName] - User's business name
 * @param {string} [params.accountIdentifier] - User email or ID
 * @returns {string} Plaintext message before URL encoding
 */
export function generateAiCreditWhatsAppMessage({
  packageName,
  credits,
  priceIdr,
  userEmail,
  businessName,
  accountIdentifier,
}) {
  const formattedPrice = Number(priceIdr || 0).toLocaleString('id-ID')
  const emailText = accountIdentifier || (userEmail && userEmail.trim() ? userEmail.trim() : '-')
  const bizText = businessName && businessName.trim() ? businessName.trim() : '-'
  const pkgLabel = packageName ? `${packageName} (${credits} AI Credits)` : `${credits} AI Credits`

  // Format per load.md Section 2 when businessName or accountIdentifier is specified
  if (businessName !== undefined || accountIdentifier !== undefined) {
    return (
      `Halo Admin BisnisSehat,\n\n` +
      `Saya ingin membeli AI Credit:\n\n` +
      `Paket: ${packageName || pkgLabel}\n` +
      `Credit: ${credits}\n` +
      `Harga: Rp${formattedPrice}\n\n` +
      `Akun: ${emailText}\n` +
      `Business: ${bizText}\n\n` +
      `Mohon konfirmasi pembayaran.`
    )
  }

  // Legacy fallback format per credit.md Part B
  return (
    `Halo Admin BisnisSehat,\n\n` +
    `Saya ingin membeli AI Credit.\n\n` +
    `Paket: ${pkgLabel}\n` +
    `Harga: Rp${formattedPrice}\n` +
    `User email: ${emailText}\n\n` +
    `Mohon informasi pembayaran dan proses top up credit.\n\n` +
    `Terima kasih.`
  )
}

/**
 * Builds the complete wa.me URL with encoded message.
 * Returns null if the phone number is not configured or invalid.
 *
 * @param {Object} params
 * @param {string} params.packageName
 * @param {number|string} params.credits
 * @param {number|string} params.priceIdr
 * @param {string} [params.userEmail]
 * @param {string} [params.businessName]
 * @param {string} [params.accountIdentifier]
 * @param {string} [params.phoneOverride]
 * @returns {string|null}
 */
export function buildAiCreditWhatsAppUrl({
  packageName,
  credits,
  priceIdr,
  userEmail,
  businessName,
  accountIdentifier,
  phoneOverride,
}) {
  const targetNumber = phoneOverride ? normalizeWhatsAppNumber(phoneOverride) : getAiCreditWhatsAppNumber()

  if (!targetNumber) {
    return null
  }

  const message = generateAiCreditWhatsAppMessage({
    packageName,
    credits,
    priceIdr,
    userEmail,
    businessName,
    accountIdentifier,
  })

  return `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`
}

/**
 * Executes the WhatsApp purchase flow for a package.
 * Opens WhatsApp in a new tab without mutating frontend credits.
 *
 * @param {Object} params
 * @param {Object} params.packageData - The package object from CREDIT_PACKAGES
 * @param {string} [params.userEmail]
 * @param {string} [params.businessName]
 * @param {string} [params.accountIdentifier]
 * @param {string} [params.phoneOverride]
 * @returns {{ success: boolean, url?: string, error?: string }}
 */
export function handleAiCreditWhatsAppPurchase({
  packageData,
  userEmail,
  businessName,
  accountIdentifier,
  phoneOverride,
}) {
  if (!packageData) {
    return { success: false, error: 'Paket kredit tidak ditemukan.' }
  }

  const url = buildAiCreditWhatsAppUrl({
    packageName: packageData.name,
    credits: packageData.credits,
    priceIdr: packageData.priceIdr,
    userEmail,
    businessName,
    accountIdentifier,
    phoneOverride,
  })

  if (!url) {
    return {
      success: false,
      error:
        'Nomor WhatsApp admin belum dikonfigurasi. Harap tentukan VITE_AI_CREDIT_WHATSAPP_NUMBER atau atur nomor WhatsApp di pengaturan platform.',
    }
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return { success: true, url }
}
