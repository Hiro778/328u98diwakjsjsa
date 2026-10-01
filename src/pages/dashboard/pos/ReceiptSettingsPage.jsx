import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../../context/AuthContext'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import ReceiptView from '../../../components/pos/ReceiptView'
import BackButton from '../../../components/BackButton'
import {
  getReceiptSettings,
  saveReceiptSettings,
  DEFAULT_RECEIPT_SETTINGS,
} from '../../../services/receiptSettingsService'

// Sample order for deterministic live preview based on struk.json
const PREVIEW_SAMPLE_ORDER = {
  id: 'preview-sample',
  order_number: 'INV-20260925-001',
  order_source: 'pos',
  order_status: 'selesai',
  payment_method: 'cash',
  payment_status: 'paid',
  created_at: new Date().toISOString(),
  customer_name: 'Budi Santoso (Member)',
  table: { name: '05' },
  items: [
    {
      id: '1',
      category: 'Minuman Kopi',
      product_name: 'Kopi Susu Gula Aren Spesial',
      variant: 'Dingin / Less Sugar',
      unit: 'Cup',
      quantity: 2,
      unit_price: 18000,
      subtotal: 36000,
    },
    {
      id: '2',
      category: 'Camilan',
      product_name: 'Roti Bakar Cokelat Keju Melted',
      unit: 'Pcs',
      quantity: 1,
      unit_price: 22000,
      subtotal: 22000,
      discount: 2000,
      discount_label: 'Diskon Menu (10%)',
    },
  ],
  subtotal: 58000,
  discount_amount: 5000,
  tax_amount: 0,
  service_fee: 0,
  total: 53000,
  cash_received: 60000,
  change: 7000,
}

export default function ReceiptSettingsPage() {
  const { business, profile } = useAuth()
  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_SETTINGS)

  useEffect(() => {
    if (business?.id) {
      loadSettings()
    }
  }, [business?.id])

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await getReceiptSettings(business.id, business)
      setSettings(data)
    } catch (err) {
      console.error('[ReceiptSettingsPage] Error loading settings:', err)
      showToast('Gagal memuat pengaturan struk', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!business?.id) return

    setSaving(true)
    try {
      const { error } = await saveReceiptSettings(business.id, settings)
      if (error) {
        throw error
      }
      showToast('Pengaturan struk berhasil disimpan!', 'success')
    } catch (err) {
      console.error('[ReceiptSettingsPage] Error saving settings:', err)
      showToast(err.message || 'Gagal menyimpan pengaturan struk', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 min-w-0 w-full">
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />

      <BackButton fallbackUrl="/dashboard/pos" />

      {/* Header & Back Link */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/dashboard/pos" className="hover:text-text-primary">
              POS / Kasir
            </Link>
            <span>/</span>
            <span className="text-text-secondary font-medium">Pengaturan Struk</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-navy-700">Profil & Pengaturan Struk</h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-0.5">
            Atur identitas toko dan format tampilan struk untuk cetak thermal &amp; WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Link
            to="/dashboard/pos"
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Buka Kasir POS
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-warm-400 px-5 py-2 text-xs font-bold text-white hover:bg-warm-500 disabled:opacity-60 transition-all shadow-sm"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Form Settings */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Card 1: Store Identity */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
              <h2 className="text-sm font-bold text-navy-700 mb-4 flex items-center gap-2">
                <svg className="h-4 w-4 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                Identitas Toko pada Struk
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1">
                    Nama Usaha / Toko <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.store_name}
                    onChange={(e) => updateField('store_name', e.target.value)}
                    placeholder="Contoh: Kopi Kenangan Senja"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Ditampilkan sebagai header utama di struk print &amp; WhatsApp.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1">
                    Alamat Usaha
                  </label>
                  <textarea
                    rows={2}
                    value={settings.store_address}
                    onChange={(e) => updateField('store_address', e.target.value)}
                    placeholder="Contoh: Jl. Sudirman No. 45, Jakarta Pusat"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1">
                    Nomor Telepon / WhatsApp Toko
                  </label>
                  <input
                    type="tel"
                    value={settings.store_phone}
                    onChange={(e) => updateField('store_phone', e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                  />
                </div>

                {business?.logo_url ? (
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs font-semibold text-navy-700">Tampilkan Logo Toko</span>
                      <p className="text-[11px] text-text-muted">Gunakan logo profil bisnis di bagian atas struk</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={settings.show_logo}
                        onChange={(e) => updateField('show_logo', e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="peer h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 rounded-full bg-white transition-all content-[''] peer-checked:bg-warm-400 peer-checked:after:translate-x-full peer-focus:outline-none" />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-xl bg-warm-50 p-2.5 text-[11px] text-warm-700">
                    Tips: Unggah logo bisnis Anda di profil agar logo dapat dicetak di struk.
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Layout & Hardware Settings */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
              <h2 className="text-sm font-bold text-navy-700 mb-4 flex items-center gap-2">
                <svg className="h-4 w-4 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Ukuran Kertas Thermal &amp; Elemen Struk
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-2">
                    Ukuran Struk
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('paper_size', '58mm')}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-xs transition-all ${
                        settings.paper_size === '58mm'
                          ? 'border-warm-400 bg-warm-50/50 font-bold text-warm-600'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <span className="text-sm font-bold">58 mm</span>
                      <span className="text-[10px] text-text-muted mt-0.5">Printer Mini / Bluetooth</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('paper_size', '80mm')}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-xs transition-all ${
                        settings.paper_size === '80mm'
                          ? 'border-warm-400 bg-warm-50/50 font-bold text-warm-600'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <span className="text-sm font-bold">80 mm</span>
                      <span className="text-[10px] text-text-muted mt-0.5">Printer Standar / Desktop</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy-700 font-medium">Tampilkan Nomor Order</span>
                    <input
                      type="checkbox"
                      checked={settings.show_order_number}
                      onChange={(e) => updateField('show_order_number', e.target.checked)}
                      className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy-700 font-medium">Tampilkan Nama Meja</span>
                    <input
                      type="checkbox"
                      checked={settings.show_table}
                      onChange={(e) => updateField('show_table', e.target.checked)}
                      className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy-700 font-medium">Tampilkan Nama Kasir</span>
                    <input
                      type="checkbox"
                      checked={settings.show_cashier}
                      onChange={(e) => updateField('show_cashier', e.target.checked)}
                      className="h-4 w-4 rounded border-border text-warm-400 focus:ring-warm-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Header & Footer Notes */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
              <h2 className="text-sm font-bold text-navy-700 mb-4 flex items-center gap-2">
                <svg className="h-4 w-4 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Pesan Header &amp; Footer
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1">
                    Pesan Header (Di bawah nama toko)
                  </label>
                  <input
                    type="text"
                    value={settings.header_text}
                    onChange={(e) => updateField('header_text', e.target.value)}
                    placeholder="Contoh: Selamat menikmati hidangan kami!"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-navy-700 mb-1">
                    Catatan Footer (Di bagian bawah struk)
                  </label>
                  <textarea
                    rows={2}
                    value={settings.footer_text}
                    onChange={(e) => updateField('footer_text', e.target.value)}
                    placeholder="Contoh: Terima kasih atas kunjungan Anda. Kritik & saran hubungi 0812xxx."
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto rounded-xl bg-warm-400 px-6 py-2.5 text-xs font-bold text-white hover:bg-warm-500 disabled:opacity-60 transition-all shadow-sm"
              >
                {saving ? 'Menyimpan...' : 'Simpan Semua Pengaturan'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Interactive Preview */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-navy-700">Preview Struk Kasir</h3>
                <p className="text-[11px] text-text-muted">
                  Tampilan langsung sesuai pengaturan {settings.paper_size || '58mm'}.
                </p>
              </div>
              <span className="rounded-full bg-profit-50 px-2.5 py-1 text-[10px] font-bold text-profit-600 border border-profit-200">
                Live
              </span>
            </div>

            {/* Render Unified Receipt View */}
            <ReceiptView
              order={PREVIEW_SAMPLE_ORDER}
              settings={settings}
              business={business}
              cashierName={profile?.full_name || 'Kasir 01'}
              isModal={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
