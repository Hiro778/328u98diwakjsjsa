import { useState } from 'react'
import { formatCurrency } from '../../lib/orderNumber'
import { formatReceiptWhatsAppText, getWhatsAppShareUrl } from '../../services/receiptSettingsService'
import { printThermalReceipt } from '../../lib/receiptPrinter'

/**
 * Unified ReceiptView Component (struk.json)
 * Used for:
 * 1. Live Preview in ReceiptSettingsPage
 * 2. PosPage Receipt Modal after payment or viewing order
 * 3. Thermal Printing (58mm / 80mm) with isolated @media print styling
 * 4. WhatsApp Receipt generation & direct wa.me link
 */
export default function ReceiptView({
  order,
  settings = {},
  business = {},
  cashierName = '',
  onClose,
  isModal = false,
}) {
  const [selectedPaperSize, setSelectedPaperSize] = useState(settings.paper_size || '58mm')
  const [customerPhone, setCustomerPhone] = useState(order?.customer_phone || '')
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!order) return null

  // Synchronize paper size if parent settings change
  const paperSize = selectedPaperSize === '80mm' ? '80mm' : '58mm'
  const is80 = paperSize === '80mm'

  const storeName = settings.store_name || business?.name || order.business_name || 'Bisnis'
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

  const items = order.items || order.order_items || []
  const totalItemQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
  const subtotalVal = order.subtotal ?? items.reduce((s, i) => s + (i.subtotal ?? ((i.unit_price || 0) * (i.quantity || 1))), 0)
  const discountVal = Number(order.discount_amount || 0)
  const taxVal = Number(order.tax_amount ?? order.tax ?? 0)
  const serviceFeeVal = Number(order.service_fee ?? order.service_charge ?? 0)
  const totalVal = order.total ?? (subtotalVal - discountVal + taxVal + serviceFeeVal)

  // Customer resolution (struk.json: Pelanggan: Umum / Member)
  const customerName = order.customer_name || order.customer?.name || order.customer?.full_name || order.member_name || (typeof order.customer === 'string' ? order.customer : '')

  // Category rule (struk.json: Tampilkan kategori hanya jika data kategori memang tersedia)
  const hasCategories = items.some((i) => Boolean(i.category || i.category_name || i.kategori))
  let lastCategory = null

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

  // Contact line
  const contactParts = []
  if (storePhone) contactParts.push(`Telp/WA: ${storePhone}`)
  if (storeInstagram) contactParts.push(`IG: ${storeInstagram}`)
  const contactLine = contactParts.join(' | ')

  // Format receipt text for WhatsApp
  const waReceiptText = formatReceiptWhatsAppText({
    order,
    settings: { ...settings, paper_size: paperSize },
    business,
    cashierName,
  })

  const handlePrint = () => {
    printThermalReceipt({
      order,
      settings: { ...settings, paper_size: paperSize },
      business,
      cashierName,
    })
  }

  const handleCopyWaText = async () => {
    try {
      await navigator.clipboard.writeText(waReceiptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  const handleSendWhatsApp = () => {
    const waUrl = getWhatsAppShareUrl({ phone: customerPhone, text: waReceiptText })
    window.open(waUrl, '_blank')
  }

  const receiptContent = (
    <div
      id="pos-thermal-receipt"
      style={{
        width: is80 ? '80mm' : '58mm',
        maxWidth: is80 ? '80mm' : '58mm',
        minWidth: is80 ? '80mm' : '58mm',
        padding: is80 ? '3mm 2.5mm' : '2mm 1.5mm',
        fontFamily: 'monospace, "Courier New", Courier, sans-serif',
        fontSize: is80 ? '12px' : '11px',
        lineHeight: 1.25,
      }}
      className={`receipt receipt--${paperSize} mx-auto bg-white text-slate-900 transition-all rounded-xl border border-dashed border-slate-300 shadow-sm print:m-0 print:border-none print:p-0 print:shadow-none`}
    >
      {/* 1. HEADER (struk.json) */}
      <div className="text-center">
        {showLogo && (
          <img
            src={logoUrl}
            alt={storeName}
            className="mx-auto mb-1.5 h-10 w-10 rounded-full object-cover border border-slate-200"
          />
        )}
        <h2
          style={{ fontSize: is80 ? '16px' : '14px', lineHeight: 1.2 }}
          className="font-bold uppercase tracking-wider text-slate-950"
        >
          {storeName}
        </h2>
        {headerText && (
          <p
            style={{ fontSize: is80 ? '10px' : '9.5px' }}
            className="mt-0.5 italic text-slate-600"
          >
            {headerText}
          </p>
        )}
        {storeAddress && (
          <p
            style={{ fontSize: is80 ? '10px' : '9.5px' }}
            className="mt-0.5 text-slate-700 leading-snug break-words"
          >
            {storeAddress}
          </p>
        )}
        {contactLine && (
          <p
            style={{ fontSize: is80 ? '10px' : '9.5px' }}
            className="text-slate-700"
          >
            {contactLine}
          </p>
        )}
      </div>

      <div className="my-1.5 border-t border-dashed border-slate-400" />

      {/* 2. TRANSACTION INFO (struk.json) */}
      <div
        style={{ fontSize: is80 ? '10px' : '9.5px', lineHeight: 1.35 }}
        className="space-y-0.5"
      >
        {showOrderNumber && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">No. Nota :</span>
            <span className="font-bold text-slate-950">#{order.order_number || '-'}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-slate-600">Tanggal  :</span>
          <span className="text-slate-900">
            {order.created_at
              ? new Date(order.created_at).toLocaleString('id-ID', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : '-'}
          </span>
        </div>
        {showCashier && cashierName && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">Kasir    :</span>
            <span className="text-slate-900">{cashierName}</span>
          </div>
        )}
        {customerName && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">Pelanggan:</span>
            <span className="text-slate-900">{customerName}</span>
          </div>
        )}
        {showTable && order.table?.name && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">Meja     :</span>
            <span className="font-bold text-slate-950">{order.table.name}</span>
          </div>
        )}
      </div>

      <div className="my-1.5 border-t border-dashed border-slate-400" />

      {/* 3. ITEMS (struk.json) */}
      <div className="space-y-1.5">
        {items.map((item, idx) => {
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
          let showCategoryHeader = false
          if (hasCategories && currentCategory && currentCategory !== lastCategory) {
            lastCategory = currentCategory
            showCategoryHeader = true
          }

          return (
            <div key={item.id || idx}>
              {showCategoryHeader && (
                <div
                  style={{ fontSize: is80 ? '10px' : '9.5px' }}
                  className="font-bold uppercase tracking-wider text-slate-900 pt-1 pb-0.5"
                >
                  [ {currentCategory} ]
                </div>
              )}
              <div className="space-y-0.5">
                {/* Line 1: Nama Produk (wrap) */}
                <div className="font-bold text-slate-950 break-words leading-tight">
                  {name}
                </div>
                {/* Variant if any */}
                {variant && (
                  <div
                    style={{ fontSize: is80 ? '10px' : '9.5px' }}
                    className="text-slate-600 pl-0.5 break-words"
                  >
                    {variant}
                  </div>
                )}
                {/* Line 2: Qty x Price & Subtotal */}
                <div className="flex justify-between items-baseline pl-0.5">
                  <span className="text-slate-700 whitespace-nowrap">
                    {qty}{unit ? ` ${unit}` : ''} x {formatCurrency(unitPrice)}
                  </span>
                  <span className="font-medium text-slate-950 text-right shrink-0">
                    {formatCurrency(itemSubtotal)}
                  </span>
                </div>
                {/* Line 3: Item Discount if any */}
                {itemDiscountVal > 0 && (
                  <div
                    style={{ fontSize: is80 ? '10px' : '9.5px' }}
                    className="flex justify-between items-baseline pl-0.5 text-red-600"
                  >
                    <span className="break-words">*{itemDiscountLabel}</span>
                    <span className="text-right shrink-0">-{formatCurrency(itemDiscountVal)}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="my-1.5 border-t border-dashed border-slate-400" />

      {/* 4. SUMMARY (struk.json) */}
      <div className="space-y-0.5">
        <div
          style={{ fontSize: is80 ? '10px' : '9.5px' }}
          className="flex justify-between items-baseline text-slate-600"
        >
          <span>Total Item</span>
          <span>{totalItemQty}</span>
        </div>
        <div className="flex justify-between items-baseline text-slate-700">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotalVal)}</span>
        </div>
        {discountVal > 0 && (
          <div className="flex justify-between items-baseline text-red-600">
            <span>Diskon Nota</span>
            <span>-{formatCurrency(discountVal)}</span>
          </div>
        )}
        {taxVal > 0 && (
          <div className="flex justify-between items-baseline text-slate-700">
            <span>Pajak{taxRate ? ` (${taxRate}%)` : ''}</span>
            <span>{formatCurrency(taxVal)}</span>
          </div>
        )}
        {serviceFeeVal > 0 && (
          <div className="flex justify-between items-baseline text-slate-700">
            <span>Biaya Layanan</span>
            <span>{formatCurrency(serviceFeeVal)}</span>
          </div>
        )}
        <div
          style={{
            fontSize: is80 ? '15px' : '13px',
            borderTop: '1px solid #000',
            paddingTop: '3px',
            marginTop: '3px',
          }}
          className="flex justify-between items-baseline font-bold text-slate-950"
        >
          <span>TOTAL AKHIR</span>
          <span>{formatCurrency(totalVal)}</span>
        </div>
      </div>

      <div className="my-1.5 border-t border-dashed border-slate-400" />

      {/* 5. PAYMENT (struk.json) */}
      <div
        style={{ fontSize: is80 ? '10px' : '9.5px', lineHeight: 1.35 }}
        className="space-y-0.5"
      >
        <div className="flex justify-between items-baseline">
          <span className="text-slate-600">Metode Pembayaran</span>
          <span className="font-bold text-slate-900">
            {paymentMethodLabel}{paymentProvider ? ` (${paymentProvider})` : ''}
          </span>
        </div>
        {cashReceived != null && Number(cashReceived) > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">Bayar</span>
            <span>{formatCurrency(Number(cashReceived))}</span>
          </div>
        )}
        {changeVal != null && Number(changeVal) >= 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-slate-600">Kembali</span>
            <span>{formatCurrency(Number(changeVal))}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-slate-600">Status</span>
          <span
            className={`font-bold ${
              order.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {order.payment_status === 'paid' ? 'LUNAS' : 'MENUNGGU'}
          </span>
        </div>
      </div>

      {/* 6. TAX BREAKDOWN (struk.json) */}
      {showTaxSection && (
        <>
          <div className="my-1.5 border-t border-dashed border-slate-400" />
          <div
            style={{ fontSize: is80 ? '10px' : '9.5px' }}
            className="text-center font-bold text-slate-900 pb-0.5"
          >
            [ RINCIAN PAJAK &amp; TRANSAKSI ]
          </div>
          <div
            style={{ fontSize: is80 ? '10px' : '9.5px' }}
            className="space-y-0.5"
          >
            {dppVal && (
              <div className="flex justify-between items-baseline">
                <span className="text-slate-600">DPP</span>
                <span>{formatCurrency(dppVal)}</span>
              </div>
            )}
            {taxVal > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-slate-600">PPN{taxRate ? ` (${taxRate}%)` : ''}</span>
                <span>{formatCurrency(taxVal)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* 7. QR CODE IF AVAILABLE (struk.json) */}
      {qrPayload && (
        <>
          <div className="my-1.5 border-t border-dashed border-slate-400" />
          <div className="text-center py-1">
            <p
              style={{ fontSize: is80 ? '10px' : '9.5px' }}
              className="font-bold text-slate-800 mb-1"
            >
              {rawPaymentMethod === 'qris' ? 'QRIS Pembayaran' : 'Scan QR'}
            </p>
            <img
              src={qrPayload}
              alt="QR Code"
              style={{
                width: is80 ? '160px' : '120px',
                height: is80 ? '160px' : '120px',
                aspectRatio: '1 / 1',
              }}
              className="mx-auto block bg-white p-1 border border-slate-200"
            />
          </div>
        </>
      )}

      {/* 8. FOOTER (struk.json) */}
      <div
        style={{ fontSize: is80 ? '10px' : '9.5px', lineHeight: 1.3 }}
        className="mt-2.5 border-t border-dotted border-slate-400 pt-1.5 text-center text-slate-700 break-words"
      >
        <div className="font-bold uppercase tracking-wider text-slate-950 mb-0.5">
          {greetingText}
        </div>
        {returnPolicy && (
          <div className="mb-0.5">{footerText}</div>
        )}
        {csContact && (
          <div>Kontak CS: {csContact}</div>
        )}
        {appInfo && (
          <div className="mt-0.5 italic text-slate-600">{appInfo}</div>
        )}
      </div>
    </div>
  )

  const actionButtons = (
    <div className="mt-4 space-y-2.5 print:hidden">
      {/* Paper Size Selector (struk.json) */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs">
        <label className="font-semibold text-navy-700">Ukuran Struk:</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedPaperSize('58mm')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              paperSize === '58mm'
                ? 'bg-warm-400 text-white shadow-xs'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            58 mm
          </button>
          <button
            type="button"
            onClick={() => setSelectedPaperSize('80mm')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              paperSize === '80mm'
                ? 'bg-warm-400 text-white shadow-xs'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            80 mm
          </button>
        </div>
      </div>

      {/* WhatsApp Section */}
      <div className="rounded-xl border border-border bg-surface p-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowPhoneInput(!showPhoneInput)}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
            Kirim WhatsApp
          </button>
          <button
            type="button"
            onClick={handleCopyWaText}
            className="text-[11px] font-medium text-text-muted hover:text-text-primary"
          >
            {copied ? 'Tersalin!' : 'Salin Teks'}
          </button>
        </div>

        {showPhoneInput && (
          <div className="mt-2 flex gap-1.5">
            <input
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              Kirim
            </button>
          </div>
        )}
      </div>

      {/* Main Actions: Print & Close */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-navy-700 hover:bg-cream transition-colors"
        >
          <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print ({paperSize})
        </button>

        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-xs font-bold text-white hover:bg-warm-500 transition-colors"
          >
            Tutup
          </button>
        )}
      </div>
    </div>
  )

  if (!isModal) {
    return (
      <div>
        {receiptContent}
        {actionButtons}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
          <h3 className="text-sm font-bold text-navy-700">Struk Pembayaran</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1"
          >
            &times;
          </button>
        </div>
        {receiptContent}
        {actionButtons}
      </div>
    </div>
  )
}

