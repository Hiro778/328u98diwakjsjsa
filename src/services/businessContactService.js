// src/services/businessContactService.js
// Dedicated service for resolving, normalizing, and formatting business seller contacts
// Strictly adheres to tenant isolation, zero dummy data, and privacy protection.

/**
 * Normalizes any raw phone input or wa.me URL into clean digits.
 * Handles:
 * - Direct digits: "081234567890" -> "081234567890"
 * - International prefix: "+62 812-3456-7890" -> "6281234567890"
 * - wa.me links: "https://wa.me/6281234567890?text=..." -> "6281234567890"
 * - Dashes/spaces/parentheses: "(021) 789-0123" -> "0217890123"
 *
 * @param {string} raw
 * @returns {string} Digits only
 */
export function normalizePhoneDigits(raw) {
  if (!raw || typeof raw !== 'string') return ''
  let cleaned = raw.trim()

  // If input is a wa.me URL
  if (cleaned.includes('wa.me/')) {
    const afterWa = cleaned.split('wa.me/')[1] || ''
    cleaned = afterWa.split('?')[0].split('/')[0] || ''
  }

  // Strip all non-digit characters
  return cleaned.replace(/\D/g, '')
}

/**
 * Normalizes phone digits specifically for WhatsApp (wa.me) links.
 * In Indonesia, numbers starting with '0' (e.g. 0812...) are converted to country code '62' (62812...).
 *
 * @param {string} raw
 * @returns {string} E.164-compatible digits for WhatsApp (no leading +)
 */
export function normalizePhoneForWhatsApp(raw) {
  const digits = normalizePhoneDigits(raw)
  if (!digits) return ''

  if (digits.startsWith('0')) {
    return '62' + digits.slice(1)
  }
  return digits
}

/**
 * Formats a phone number for user-friendly display.
 * Converts international "628..." back to local "08..." for familiar Indonesian display.
 *
 * @param {string} raw
 * @returns {string} Display phone number
 */
export function formatDisplayPhone(raw) {
  const digits = normalizePhoneDigits(raw)
  if (!digits) return ''

  if (digits.startsWith('62') && digits.length >= 10) {
    return '0' + digits.slice(2)
  }
  return digits
}

/**
 * Generates normalized wa.me URL.
 *
 * @param {string} raw
 * @param {string} [text]
 * @returns {string} https://wa.me/<digits>
 */
export function getWhatsAppUrl(raw, text = '') {
  const waDigits = normalizePhoneForWhatsApp(raw)
  if (!waDigits) return ''

  const baseUrl = `https://wa.me/${waDigits}`
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`
  }
  return baseUrl
}

/**
 * Generates normalized tel: URL.
 *
 * @param {string} raw
 * @returns {string} tel:<digits>
 */
export function getTelUrl(raw) {
  const digits = normalizePhoneDigits(raw)
  if (!digits) return ''
  return `tel:${digits}`
}

/**
 * Resolves the official seller contact for a specific business.
 * Strictly prioritizes:
 * 1. WhatsApp business number
 * 2. Regular telephone
 * 3. Fallback when neither is available
 *
 * Never uses dummy or fake contact data.
 * Never exposes private user profile email or user_id.
 *
 * @param {object} params
 * @param {object} [params.business] - Business object { id, name, ... }
 * @param {object} [params.designSettings] - Custom QR Menu design settings { layout: [...] }
 * @param {object} [params.extraContact] - Optional contact from DB { whatsapp, phone }
 * @returns {object} Standardized seller contact object
 */
export function resolveBusinessContact({ business = {}, designSettings = null, extraContact = {} } = {}) {
  const businessName = business?.name || extraContact?.business_name || 'Penjual'

  let whatsappCandidate = ''
  let phoneCandidate = ''

  // 1. Check extraContact (from database queries/RPC)
  if (extraContact?.whatsapp && String(extraContact.whatsapp).trim()) {
    whatsappCandidate = String(extraContact.whatsapp).trim()
  }
  if (extraContact?.phone && String(extraContact.phone).trim()) {
    phoneCandidate = String(extraContact.phone).trim()
  }

  // 2. Check designSettings layout social block
  if (designSettings && Array.isArray(designSettings.layout)) {
    const socialBlock = designSettings.layout.find(
      (b) => b && (b.id === 'social' || b.type === 'social')
    )
    if (socialBlock && socialBlock.props) {
      const props = socialBlock.props

      // Check props.links
      if (Array.isArray(props.links)) {
        for (const item of props.links) {
          if (!item || !item.url) continue
          const platform = String(item.platform || '').toLowerCase()
          if (platform === 'whatsapp' && !whatsappCandidate) {
            whatsappCandidate = String(item.url).trim()
          } else if ((platform === 'phone' || platform === 'tel') && !phoneCandidate) {
            phoneCandidate = String(item.url).trim()
          }
        }
      }

      // Check legacy/direct props
      if (!whatsappCandidate && props.whatsapp && String(props.whatsapp).trim()) {
        whatsappCandidate = String(props.whatsapp).trim()
      }
      if (!phoneCandidate && props.phone && String(props.phone).trim()) {
        phoneCandidate = String(props.phone).trim()
      }
    }
  }

  // 3. Check business object (if properties exist)
  if (!whatsappCandidate && business?.whatsapp && String(business.whatsapp).trim()) {
    whatsappCandidate = String(business.whatsapp).trim()
  }
  if (!phoneCandidate && business?.phone && String(business.phone).trim()) {
    phoneCandidate = String(business.phone).trim()
  }

  // Evaluate candidate validity
  const validWhatsAppDigits = normalizePhoneDigits(whatsappCandidate)
  const validPhoneDigits = normalizePhoneDigits(phoneCandidate)

  // Priority 1: WhatsApp
  if (validWhatsAppDigits && validWhatsAppDigits.length >= 7) {
    return {
      businessName,
      type: 'whatsapp',
      hasContact: true,
      rawContact: whatsappCandidate,
      phone: validWhatsAppDigits,
      displayPhone: formatDisplayPhone(whatsappCandidate),
      actionUrl: getWhatsAppUrl(whatsappCandidate),
      actionLabel: 'Hubungi Penjual',
    }
  }

  // Priority 2: Telephone
  if (validPhoneDigits && validPhoneDigits.length >= 7) {
    return {
      businessName,
      type: 'phone',
      hasContact: true,
      rawContact: phoneCandidate,
      phone: validPhoneDigits,
      displayPhone: formatDisplayPhone(phoneCandidate),
      actionUrl: getTelUrl(phoneCandidate),
      actionLabel: 'Hubungi Penjual',
    }
  }

  // Priority 3: No contact available
  return {
    businessName,
    type: null,
    hasContact: false,
    rawContact: '',
    phone: '',
    displayPhone: '',
    actionUrl: '',
    actionLabel: '',
    message: 'Kontak penjual belum tersedia',
  }
}

/**
 * Fetches contact info from Supabase for a specific business, ensuring strict tenant isolation.
 *
 * @param {string} businessId
 * @param {object} supabaseClient
 * @param {object} [designSettings]
 * @returns {Promise<object>} Resolved seller contact
 */
export async function fetchBusinessContact(businessId, supabaseClient, designSettings = null) {
  if (!businessId || !supabaseClient) {
    return resolveBusinessContact({ designSettings })
  }

  let extraContact = {}

  try {
    // 1. Try public RPC if available
    const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('get_public_business_contact', {
      p_business_id: businessId,
    })

    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      extraContact = {
        business_name: rpcData.business_name || '',
        whatsapp: rpcData.whatsapp || '',
        phone: rpcData.phone || '',
      }
    } else {
      // 2. Direct query fallback: pos_receipt_settings
      const { data: receiptData } = await supabaseClient
        .from('pos_receipt_settings')
        .select('store_phone, store_name')
        .eq('business_id', businessId)
        .maybeSingle()

      if (receiptData?.store_phone) {
        extraContact.phone = receiptData.store_phone
        if (receiptData.store_name) extraContact.business_name = receiptData.store_name
      }

      // 3. Direct query fallback: whatsapp_business_connections
      const { data: waData } = await supabaseClient
        .from('whatsapp_business_connections')
        .select('display_phone_number')
        .eq('business_id', businessId)
        .eq('status', 'connected')
        .maybeSingle()

      if (waData?.display_phone_number) {
        extraContact.whatsapp = waData.display_phone_number
      }
    }
  } catch (err) {
    console.warn('[businessContactService] Query notice:', err?.message || err)
  }

  // Get business name if not already set
  let business = {}
  try {
    const { data: bizData } = await supabaseClient
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .maybeSingle()
    if (bizData) business = bizData
  } catch {}

  return resolveBusinessContact({
    business,
    designSettings,
    extraContact,
  })
}
