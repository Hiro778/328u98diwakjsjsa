import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/orderNumber.js'

/**
 * Default POS Receipt Settings fallback
 */
export const DEFAULT_RECEIPT_SETTINGS = {
  store_name: '',
  store_address: '',
  store_phone: '',
  header_text: 'Terima kasih atas kunjungan Anda',
  footer_text: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.',
  show_logo: false,
  show_table: true,
  show_cashier: true,
  show_order_number: true,
  paper_size: '58mm', // '58mm' | '80mm'
}

/**
 * Fetch receipt settings for a given business.
 * Tenant isolation is strictly enforced via Supabase RLS.
 * Falls back to business profile data if no custom settings exist yet.
 *
 * @param {string} businessId
 * @param {object} businessProfile - Current business profile from auth context
 * @returns {Promise<object>}
 */
export async function getReceiptSettings(businessId, businessProfile = {}) {
  if (!businessId) {
    throw new Error('business_id is required to fetch receipt settings')
  }

  // Base fallback derived from current business profile
  const baseSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    store_name: businessProfile?.name || DEFAULT_RECEIPT_SETTINGS.store_name,
    store_address: businessProfile?.location || DEFAULT_RECEIPT_SETTINGS.store_address,
    store_phone: businessProfile?.phone || DEFAULT_RECEIPT_SETTINGS.store_phone,
    show_logo: Boolean(businessProfile?.logo_url),
  }

  try {
    const { data, error } = await supabase
      .from('pos_receipt_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()

    if (error) {
      // If table doesn't exist yet or permission denied, log warning and use fallback
      console.warn('[ReceiptSettings] Supabase query notice:', error.message)
      return baseSettings
    }

    if (!data) {
      return baseSettings
    }

    return {
      ...baseSettings,
      ...data,
      // If store_name in settings is empty, fallback to business profile name
      store_name: data.store_name || baseSettings.store_name,
      store_address: data.store_address ?? baseSettings.store_address,
      store_phone: data.store_phone ?? baseSettings.store_phone,
    }
  } catch (err) {
    console.error('[ReceiptSettings] Unexpected error fetching settings:', err)
    return baseSettings
  }
}

/**
 * Save receipt settings for a business (upsert).
 * Tenant isolation is enforced by Supabase RLS (owner_id = auth.uid()).
 *
 * @param {string} businessId
 * @param {object} settings
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function saveReceiptSettings(businessId, settings) {
  if (!businessId) {
    return { data: null, error: new Error('business_id is required') }
  }

  const payload = {
    business_id: businessId,
    store_name: (settings.store_name || '').trim(),
    store_address: (settings.store_address || '').trim(),
    store_phone: (settings.store_phone || '').trim(),
    header_text: (settings.header_text || '').trim(),
    footer_text: (settings.footer_text || '').trim(),
    show_logo: Boolean(settings.show_logo),
    show_table: settings.show_table !== false,
    show_cashier: settings.show_cashier !== false,
    show_order_number: settings.show_order_number !== false,
    paper_size: settings.paper_size === '80mm' ? '80mm' : '58mm',
    updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await supabase
      .from('pos_receipt_settings')
      .upsert(payload, { onConflict: 'business_id' })
      .select()
      .single()

    if (error) {
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Formats order and receipt settings into a standardized WhatsApp text receipt.
 * Ensures strict consistency between preview, print, and WhatsApp output.
 *
 * @param {object} params
 * @param {object} params.order
 * @param {object} params.settings
 * @param {object} [params.business]
 * @param {string} [params.cashierName]
 * @returns {string} Plain text formatted for WhatsApp
 */
export function formatReceiptWhatsAppText({ order, settings = {}, business = {}, cashierName = '' }) {
  if (!order) return ''

  const storeName = settings.store_name || business?.name || order.business_name || 'Bisnis'
  const storeAddress = settings.store_address || business?.location || ''
  const storePhone = settings.store_phone || business?.phone || ''
  const headerText = settings.header_text || ''
  const footerText = settings.footer_text || ''

  const showTable = settings.show_table !== false
  const showCashier = settings.show_cashier !== false
  const showOrderNumber = settings.show_order_number !== false

  const lines = []

  // Store Header
  lines.push(`*${storeName.toUpperCase()}*`)
  if (storeAddress) lines.push(storeAddress)
  if (storePhone) lines.push(`Telp/WA: ${storePhone}`)
  if (headerText) lines.push(`_${headerText}_`)
  lines.push('--------------------------------')

  // Order Details
  if (showOrderNumber && order.order_number) {
    lines.push(`No. Pesanan : #${order.order_number}`)
  }
  if (showTable && order.table?.name) {
    lines.push(`Meja        : ${order.table.name}`)
  }
  if (showCashier && cashierName) {
    lines.push(`Kasir       : ${cashierName}`)
  }
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '-'
  lines.push(`Waktu       : ${dateStr}`)
  lines.push('--------------------------------')

  // Items
  const items = order.items || order.order_items || []
  items.forEach((item) => {
    const qty = item.quantity || 1
    const name = item.product_name || item.name || 'Item'
    const subtotal = item.subtotal ?? ((item.unit_price || 0) * qty)
    lines.push(`${qty}x ${name}`)
    lines.push(`   ${formatCurrency(subtotal)}`)
  })
  lines.push('--------------------------------')

  // Subtotal & Discounts
  const subtotalVal = order.subtotal ?? items.reduce((s, i) => s + (i.subtotal ?? ((i.unit_price || 0) * (i.quantity || 1))), 0)
  lines.push(`Subtotal    : ${formatCurrency(subtotalVal)}`)

  if (order.discount_amount && Number(order.discount_amount) > 0) {
    lines.push(`Diskon      : -${formatCurrency(order.discount_amount)}`)
  }

  const totalVal = order.total ?? subtotalVal
  lines.push(`*TOTAL       : ${formatCurrency(totalVal)}*`)

  // Payment Status
  const paymentMethodStr = order.payment_method === 'cash' ? 'Tunai' : (order.payment_method || 'Online')
  const paymentStatusStr = order.payment_status === 'paid' ? 'LUNAS' : 'MENUNGGU PEMBAYARAN'
  lines.push(`Metode Bayar: ${paymentMethodStr}`)
  lines.push(`Status      : *${paymentStatusStr}*`)

  // Footer
  if (footerText) {
    lines.push('--------------------------------')
    lines.push(`_${footerText}_`)
  }

  return lines.join('\n')
}

/**
 * Generates direct WhatsApp share URL (wa.me)
 *
 * @param {object} params
 * @param {string} [params.phone]
 * @param {string} params.text
 * @returns {string}
 */
export function getWhatsAppShareUrl({ phone = '', text }) {
  let cleanPhone = (phone || '').replace(/\D/g, '')
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1)
  }
  const encodedText = encodeURIComponent(text || '')
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`
  }
  return `https://wa.me/?text=${encodedText}`
}
