/**
 * src/lib/receiptPrinter.js
 * High-precision thermal receipt printing engine for web POS.
 * 
 * Solves multi-sheet and duplicate rendering issues in Chrome print preview:
 * 1. Uses an isolated, dedicated invisible iframe — zero pollution from dashboard or modal CSS.
 * 2. Exactly ONE receipt document sent to the print subsystem.
 * 3. Compact thermal layout (58mm or 80mm) with auto-height to match receipt content.
 * 4. Zero arbitrary fixed-position elements that repeat across printed sheets.
 * 5. Preserves custom business branding and footer without legacy hardcoding.
 */

import { formatCurrency } from './orderNumber.js'

/**
 * Converts element height in pixels to thermal paper height in millimeters.
 * Standard CSS: 96px = 1 inch = 25.4mm
 * Includes an optional safety buffer (default: 4mm) to ensure full render
 * without accidental multi-page split.
 */
export function calculateReceiptHeightMm(heightPx, safetyBufferMm = 4) {
  if (!heightPx || heightPx <= 0) return 0
  return Math.ceil((heightPx * 25.4) / 96) + safetyBufferMm
}

/**
 * Generates the clean standalone HTML for thermal receipt printing based on struk.json
 */
export function generateThermalReceiptHtml({
  order,
  settings = {},
  business = {},
  cashierName = 'Kasir',
  heightMm = null,
}) {
  if (!order) return ''

  const storeName = settings.store_name || business?.name || order.business_name || 'Toko'
  const storeAddress = settings.store_address || business?.location || ''
  const storePhone = settings.store_phone || business?.phone || ''
  const storeInstagram = settings.store_instagram || settings.instagram || business?.instagram || business?.social_links?.instagram || ''
  const headerText = settings.header_text || '' // Slogan / tagline
  const footerText = settings.footer_text || ''
  const returnPolicy = settings.return_policy || footerText
  const csContact = settings.cs_contact || ''
  const appInfo = settings.app_info || ''
  const greetingText = settings.footer_greeting || 'TERIMA KASIH & SELAMAT BERBELANJA'

  const logoUrl = business?.logo_url || ''
  const showLogo = Boolean(settings.show_logo && logoUrl)
  const showTable = settings.show_table !== false
  const showCashier = settings.show_cashier !== false
  const showOrderNumber = settings.show_order_number !== false
  const paperSize = settings.paper_size === '80mm' ? '80mm' : '58mm'

  const is80 = paperSize === '80mm'
  const targetWidth = is80 ? '80mm' : '58mm'
  const pageSize = heightMm ? `${targetWidth} ${heightMm}mm` : `${targetWidth} auto`
  const fontSize = is80 ? '12px' : '11px'
  const smallFontSize = is80 ? '10px' : '9.5px'
  const storeFontSize = is80 ? '16px' : '14px'
  const totalFontSize = is80 ? '15px' : '13px'
  const paddingCss = is80 ? '3mm 2.5mm' : '2mm 1.5mm'
  const qrSizePx = is80 ? 160 : 120

  const items = order.items || order.order_items || []
  const totalItemQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
  const subtotalVal = order.subtotal ?? items.reduce((s, i) => s + (i.subtotal ?? ((i.unit_price || 0) * (i.quantity || 1))), 0)
  const discountVal = Number(order.discount_amount || 0)
  const taxVal = Number(order.tax_amount ?? order.tax ?? 0)
  const serviceFeeVal = Number(order.service_fee ?? order.service_charge ?? 0)
  const totalVal = order.total ?? (subtotalVal - discountVal + taxVal + serviceFeeVal)

  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleString('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })

  // Customer resolution (struk.json: Pelanggan: Umum / Member)
  const customerName = order.customer_name || order.customer?.name || order.customer?.full_name || order.member_name || (typeof order.customer === 'string' ? order.customer : '')

  // Category rule (struk.json: Tampilkan kategori hanya jika data kategori memang tersedia)
  const hasCategories = items.some((i) => Boolean(i.category || i.category_name || i.kategori))
  let lastCategory = null

  const itemsHtml = items
    .map((item) => {
      const qty = item.quantity || 1
      const unit = item.unit || ''
      const name = item.product_name || item.name || 'Item'
      const variant = item.variant || item.variant_name || item.selected_variant || ''
      const itemSubtotal = item.subtotal ?? ((item.unit_price || 0) * qty)
      const unitPrice = item.unit_price || (itemSubtotal / qty)
      const itemDiscountVal = Number(item.discount || item.discount_amount || item.item_discount || 0)
      const itemDiscountLabel = item.discount_percent
        ? `Diskon Produk (${item.discount_percent}%)`
        : (item.discount_label || 'Diskon Produk')

      const currentCategory = item.category || item.category_name || item.kategori || ''
      let categoryHeaderHtml = ''
      if (hasCategories && currentCategory && currentCategory !== lastCategory) {
        lastCategory = currentCategory
        categoryHeaderHtml = `
          <div style="font-weight: bold; font-size: ${smallFontSize}; margin-top: 5px; margin-bottom: 2px; text-transform: uppercase; color: #111;">
            [ ${escapeHtml(currentCategory.toUpperCase())} ]
          </div>
        `
      }

      return `
        ${categoryHeaderHtml}
        <div style="margin-bottom: 4px; width: 100%;">
          <div style="font-weight: bold; word-break: break-word; overflow-wrap: break-word; line-height: 1.25;">
            ${escapeHtml(name)}
          </div>
          ${variant ? `
          <div style="font-size: ${smallFontSize}; color: #555; padding-left: 2px; word-break: break-word;">
            ${escapeHtml(variant)}
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: ${fontSize}; padding-left: 2px; width: 100%;">
            <span style="white-space: nowrap; word-break: break-word; padding-right: 4px; flex: 1;">${qty}${unit ? ` ${escapeHtml(unit)}` : ''} x ${formatCurrency(unitPrice)}</span>
            <span style="white-space: nowrap; text-align: right; flex-shrink: 0; font-weight: 500;">${formatCurrency(itemSubtotal)}</span>
          </div>
          ${itemDiscountVal > 0 ? `
          <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: ${smallFontSize}; color: #d00; padding-left: 2px; width: 100%;">
            <span style="word-break: break-word; overflow-wrap: break-word; padding-right: 4px; flex: 1;">*${escapeHtml(itemDiscountLabel)}</span>
            <span style="white-space: nowrap; text-align: right; flex-shrink: 0;">-${formatCurrency(itemDiscountVal)}</span>
          </div>` : ''}
        </div>
      `
    })
    .join('')

  // Payment method & cash calculation (struk.json)
  const rawPaymentMethod = (order.payment_method || '').toLowerCase()
  const paymentMethodLabel = rawPaymentMethod === 'cash' ? 'Tunai' : (rawPaymentMethod === 'qris' ? 'QRIS' : (order.payment_method || 'Online'))
  const paymentProvider = order.payment_provider || order.bank_name || ''
  const cashReceived = order.cash_received ?? order.bayar ?? order.amount_paid ?? order.payment_amount
  const changeVal = order.change ?? order.change_amount ?? order.kembali

  // Tax breakdown (struk.json: DPP & PPN jika tersedia)
  const dppVal = order.dpp ?? order.tax_base
  const taxRate = order.tax_rate
  const showTaxSection = Boolean(dppVal || (taxVal > 0 && taxRate))

  // QR Code payload (struk.json)
  const qrPayload = order.qr_code || order.qr_url || order.payment_qr || order.qris_payload || order.qr_string || ''

  // Contact line (Phone + IG)
  const contactParts = []
  if (storePhone) contactParts.push(`Telp/WA: ${escapeHtml(storePhone)}`)
  if (storeInstagram) contactParts.push(`IG: ${escapeHtml(storeInstagram)}`)
  const contactLine = contactParts.join(' | ')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Struk #${order.order_number || ''}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${targetWidth};
      min-width: ${targetWidth};
      max-width: ${targetWidth};
      margin: 0;
      padding: 0;
      font-family: monospace, 'Courier New', Courier, sans-serif;
      font-size: ${fontSize};
      line-height: 1.25;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt {
      width: ${targetWidth};
      min-width: ${targetWidth};
      max-width: ${targetWidth};
      box-sizing: border-box;
      margin: 0;
      padding: ${paddingCss};
      height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .receipt--58mm {
      width: 58mm;
      min-width: 58mm;
      max-width: 58mm;
    }
    .receipt--80mm {
      width: 80mm;
      min-width: 80mm;
      max-width: 80mm;
    }
    .receipt-container {
      width: 100%;
      height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    @media print {
      @page {
        size: ${pageSize};
        margin: 0;
      }
      html, body {
        width: ${targetWidth} !important;
        min-width: ${targetWidth} !important;
        max-width: ${targetWidth} !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .receipt {
        width: ${targetWidth} !important;
        max-width: ${targetWidth} !important;
        margin: 0 !important;
      }
      .receipt--58mm {
        width: 58mm !important;
        min-width: 58mm !important;
        max-width: 58mm !important;
      }
      .receipt--80mm {
        width: 80mm !important;
        min-width: 80mm !important;
        max-width: 80mm !important;
      }
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .uppercase { text-transform: uppercase; }
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
      width: 100%;
    }
    .flex-between {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
    }
    img.logo {
      max-width: 44px;
      max-height: 44px;
      margin: 0 auto 4px auto;
      display: block;
      border-radius: 50%;
    }
    .footer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dotted #555;
      font-size: ${smallFontSize};
      text-align: center;
      color: #333;
      line-height: 1.3;
      word-break: break-word;
      overflow-wrap: break-word;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="receipt receipt--${targetWidth} receipt-container">
    <!-- 1. HEADER (struk.json) -->
    <div class="text-center">
      ${showLogo ? `<img src="${escapeHtml(logoUrl)}" class="logo" alt="Logo" />` : ''}
      <div class="bold uppercase" style="font-size: ${storeFontSize}; line-height: 1.2;">${escapeHtml(storeName)}</div>
      ${headerText ? `<div style="font-size: ${smallFontSize}; font-style: italic; margin-top: 1px; color: #444;">${escapeHtml(headerText)}</div>` : ''}
      ${storeAddress ? `<div style="font-size: ${smallFontSize}; color: #333; margin-top: 2px; word-break: break-word;">${escapeHtml(storeAddress)}</div>` : ''}
      ${contactLine ? `<div style="font-size: ${smallFontSize}; color: #333;">${contactLine}</div>` : ''}
    </div>

    <div class="divider"></div>

    <!-- 2. TRANSACTION INFO (struk.json) -->
    <div style="font-size: ${smallFontSize}; line-height: 1.35;">
      ${showOrderNumber ? `<div class="flex-between"><span>No. Nota :</span><span class="bold">#${order.order_number || '-'}</span></div>` : ''}
      <div class="flex-between"><span>Tanggal  :</span><span>${dateStr}</span></div>
      ${showCashier && cashierName ? `<div class="flex-between"><span>Kasir    :</span><span>${escapeHtml(cashierName)}</span></div>` : ''}
      ${customerName ? `<div class="flex-between"><span>Pelanggan:</span><span>${escapeHtml(customerName)}</span></div>` : ''}
      ${showTable && order.table?.name ? `<div class="flex-between"><span>Meja     :</span><span class="bold">${escapeHtml(order.table.name)}</span></div>` : ''}
    </div>

    <div class="divider"></div>

    <!-- 3. ITEMS (struk.json) -->
    <div>
      ${itemsHtml}
    </div>

    <div class="divider"></div>

    <!-- 4. SUMMARY (struk.json) -->
    <div style="font-size: ${fontSize};">
      <div class="flex-between" style="font-size: ${smallFontSize}; color: #444;">
        <span>Total Item</span>
        <span>${totalItemQty}</span>
      </div>
      <div class="flex-between" style="color: #333;">
        <span>Subtotal</span>
        <span>${formatCurrency(subtotalVal)}</span>
      </div>
      ${discountVal > 0 ? `
      <div class="flex-between" style="color: #d00;">
        <span>Diskon Nota</span>
        <span>-${formatCurrency(discountVal)}</span>
      </div>` : ''}
      ${taxVal > 0 ? `
      <div class="flex-between" style="color: #333;">
        <span>Pajak${taxRate ? ` (${taxRate}%)` : ''}</span>
        <span>${formatCurrency(taxVal)}</span>
      </div>` : ''}
      ${serviceFeeVal > 0 ? `
      <div class="flex-between" style="color: #333;">
        <span>Biaya Layanan</span>
        <span>${formatCurrency(serviceFeeVal)}</span>
      </div>` : ''}
      <div class="flex-between bold" style="font-size: ${totalFontSize}; border-top: 1px solid #000; padding-top: 3px; margin-top: 3px;">
        <span>TOTAL AKHIR</span>
        <span>${formatCurrency(totalVal)}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- 5. PAYMENT (struk.json) -->
    <div style="font-size: ${smallFontSize}; line-height: 1.35;">
      <div class="flex-between">
        <span>Metode Pembayaran</span>
        <span class="bold">${escapeHtml(paymentMethodLabel)}${paymentProvider ? ` (${escapeHtml(paymentProvider)})` : ''}</span>
      </div>
      ${cashReceived != null && Number(cashReceived) > 0 ? `
      <div class="flex-between">
        <span>Bayar</span>
        <span>${formatCurrency(Number(cashReceived))}</span>
      </div>` : ''}
      ${changeVal != null && Number(changeVal) >= 0 ? `
      <div class="flex-between">
        <span>Kembali</span>
        <span>${formatCurrency(Number(changeVal))}</span>
      </div>` : ''}
      <div class="flex-between">
        <span>Status</span>
        <span class="bold" style="color: ${order.payment_status === 'paid' ? '#000' : '#888'};">
          ${order.payment_status === 'paid' ? 'LUNAS' : 'MENUNGGU'}
        </span>
      </div>
    </div>

    <!-- 6. TAX BREAKDOWN (struk.json: [ RINCIAN PAJAK & TRANSAKSI ]) -->
    ${showTaxSection ? `
    <div class="divider"></div>
    <div class="bold text-center" style="font-size: ${smallFontSize}; margin-bottom: 3px;">
      [ RINCIAN PAJAK &amp; TRANSAKSI ]
    </div>
    ${dppVal ? `
    <div class="flex-between" style="font-size: ${smallFontSize};">
      <span>DPP</span>
      <span>${formatCurrency(dppVal)}</span>
    </div>` : ''}
    ${taxVal > 0 ? `
    <div class="flex-between" style="font-size: ${smallFontSize};">
      <span>PPN${taxRate ? ` (${taxRate}%)` : ''}</span>
      <span>${formatCurrency(taxVal)}</span>
    </div>` : ''}
    ` : ''}

    <!-- 7. QR CODE IF AVAILABLE (struk.json) -->
    ${qrPayload ? `
    <div class="divider"></div>
    <div class="text-center" style="margin: 6px 0;">
      <div style="font-size: ${smallFontSize}; margin-bottom: 4px; font-weight: bold;">
        ${rawPaymentMethod === 'qris' ? 'QRIS Pembayaran' : 'Scan QR'}
      </div>
      <img
        src="${escapeHtml(qrPayload)}"
        alt="QR Code"
        style="width: ${qrSizePx}px; height: ${qrSizePx}px; display: block; margin: 0 auto; background: #fff; padding: 4px; border: 1px solid #ddd; aspect-ratio: 1/1;"
      />
    </div>
    ` : ''}

    <!-- 8. FOOTER (struk.json) -->
    <div class="footer">
      <div class="bold uppercase" style="font-size: 1.05em; margin-bottom: 2px;">
        ${escapeHtml(greetingText)}
      </div>
      ${returnPolicy ? `<div style="margin-bottom: 2px;">${escapeHtml(returnPolicy)}</div>` : ''}
      ${csContact ? `<div>Kontak CS: ${escapeHtml(csContact)}</div>` : ''}
      ${appInfo ? `<div style="margin-top: 2px; font-style: italic;">${escapeHtml(appInfo)}</div>` : ''}
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Triggers thermal receipt print using an isolated invisible iframe.
 * Avoids Chrome print preview duplicating sheets or rendering dashboard chrome.
 */
export function printThermalReceipt({
  order,
  settings = {},
  business = {},
  cashierName = 'Kasir',
}) {
  if (!order) return

  const paperSize = settings.paper_size === '80mm' ? '80mm' : '58mm'
  const targetWidth = paperSize === '80mm' ? '80mm' : '58mm'

  const html = generateThermalReceiptHtml({
    order,
    settings,
    business,
    cashierName,
  })

  // Check if running in browser
  if (typeof document === 'undefined') return

  // Remove any existing print iframe
  const existingIframe = document.getElementById('pos-thermal-print-frame')
  if (existingIframe) {
    existingIframe.remove()
  }

  const iframe = document.createElement('iframe')
  iframe.id = 'pos-thermal-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document || iframe.contentDocument
  if (!doc) {
    console.warn('[ReceiptPrinter] Could not access iframe document, falling back to window.print()')
    window.print()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  // Wait for resources (e.g. logo image, typography) to render before calculating height
  setTimeout(() => {
    try {
      // 1. Measure actual receipt container height
      const receiptEl = doc.querySelector('.receipt') || doc.body
      const heightPx = Math.max(
        receiptEl.scrollHeight || 0,
        receiptEl.offsetHeight || 0,
        Math.ceil(receiptEl.getBoundingClientRect?.().height || 0)
      )

      // 2. Convert to mm with safety buffer
      const safetyBufferMm = 4
      const calculatedHeightMm = calculateReceiptHeightMm(heightPx, safetyBufferMm) || 120

      // 3. Inject dynamic @page rule with exact width and content height
      let dynamicStyle = doc.getElementById('pos-dynamic-page-size')
      if (!dynamicStyle) {
        dynamicStyle = doc.createElement('style')
        dynamicStyle.id = 'pos-dynamic-page-size'
        doc.head.appendChild(dynamicStyle)
      }

      dynamicStyle.textContent = `
        @page {
          size: ${targetWidth} ${calculatedHeightMm}mm !important;
          margin: 0 !important;
        }
        @media print {
          @page {
            size: ${targetWidth} ${calculatedHeightMm}mm !important;
            margin: 0 !important;
          }
          html, body {
            width: ${targetWidth} !important;
            min-width: ${targetWidth} !important;
            max-width: ${targetWidth} !important;
            height: ${calculatedHeightMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .receipt {
            width: ${targetWidth} !important;
            max-width: ${targetWidth} !important;
            margin: 0 !important;
          }
        }
      `

      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (err) {
      console.warn('[ReceiptPrinter] iframe print error, falling back to window.print():', err)
      window.print()
    } finally {
      // Clean up after print dialog finishes
      setTimeout(() => {
        iframe.remove()
      }, 3000)
    }
  }, 250)
}
