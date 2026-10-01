import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router'
import {
  getSettings,
  updateSetting,
  updateSettings,
  normalizeSettingsError,
} from '../../services/adminSettingsService.js'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState([])
  const [formValues, setFormValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [activeTab, setActiveTab] = useState('general')

  // High-impact confirmation modal state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    key: null,
    targetValue: null,
    title: '',
    description: '',
    reason: '',
  })

  // Load settings from server
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSettings()
      setSettings(data)

      // Initialize form values map: { [key]: value }
      const initialMap = {}
      for (const item of data) {
        initialMap[item.key] = item.value
      }
      setFormValues(initialMap)
    } catch (err) {
      setError(normalizeSettingsError(err).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Track unsaved changes
  const unsavedKeys = useMemo(() => {
    const changed = []
    for (const item of settings) {
      if (JSON.stringify(formValues[item.key]) !== JSON.stringify(item.value)) {
        changed.push(item.key)
      }
    }
    return changed
  }, [settings, formValues])

  const hasUnsavedChanges = unsavedKeys.length > 0

  // Handle simple input change
  const handleChange = (key, value) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }))
    if (successMsg) setSuccessMsg(null)
  }

  // Handle toggle for boolean values
  const handleToggle = (key) => {
    const currentValue = Boolean(formValues[key])
    const nextValue = !currentValue

    // High impact check: maintenance_mode
    if (key === 'maintenance_mode') {
      setConfirmModal({
        isOpen: true,
        key: 'maintenance_mode',
        targetValue: nextValue,
        title: nextValue ? 'Aktifkan Maintenance Mode?' : 'Nonaktifkan Maintenance Mode?',
        description: nextValue
          ? 'PERINGATAN: Mengaktifkan Maintenance Mode akan menonaktifkan operasional publik dan membatasi akses UMKM. Hanya admin yang dapat mengakses sistem.'
          : 'Sistem akan kembali dibuka untuk publik dan pengguna UMKM. Pastikan seluruh pemeliharaan telah tuntas.',
        reason: nextValue ? 'Pemeliharaan sistem berkala' : 'Pemeliharaan sistem selesai',
      })
      return
    }

    handleChange(key, nextValue)
  }

  // Confirm high-impact mutation
  const handleConfirmHighImpact = async () => {
    const { key, targetValue, reason } = confirmModal
    setConfirmModal((prev) => ({ ...prev, isOpen: false }))
    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      await updateSetting(key, targetValue, reason || 'Pembaruan konfigurasi penting oleh admin')
      setSuccessMsg(`Konfigurasi "${key}" berhasil diperbarui.`)
      await loadSettings()
    } catch (err) {
      setError(normalizeSettingsError(err).message)
    } finally {
      setSaving(false)
    }
  }

  // Save regular changes
  const handleSaveAll = async (e) => {
    if (e) e.preventDefault()
    if (!hasUnsavedChanges) return

    setSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const updates = {}
      for (const key of unsavedKeys) {
        updates[key] = formValues[key]
      }

      await updateSettings(updates, 'Admin menyimpan pembaruan konfigurasi massal')
      setSuccessMsg(`Berhasil menyimpan ${unsavedKeys.length} pengaturan platform.`)
      await loadSettings()
    } catch (err) {
      setError(normalizeSettingsError(err).message)
    } finally {
      setSaving(false)
    }
  }

  // Reset to original database values
  const handleReset = () => {
    const originalMap = {}
    for (const item of settings) {
      originalMap[item.key] = item.value
    }
    setFormValues(originalMap)
    setError(null)
    setSuccessMsg(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Admin Settings</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Stage 10 Active
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Konfigurasi parameter platform, jam operasional CS, kontak support, dan feature flags.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSettings}
            disabled={loading || saving}
            className="px-3.5 py-2 text-sm font-medium rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white transition disabled:opacity-50 flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Muat Ulang
          </button>

          {hasUnsavedChanges && (
            <button
              onClick={handleSaveAll}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Menyimpan...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Simpan Perubahan ({unsavedKeys.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">
              Anda memiliki {unsavedKeys.length} perubahan yang belum disimpan.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="text-xs text-zinc-400 hover:text-zinc-200 underline transition"
            >
              Batalkan Perubahan
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 transition"
            >
              Simpan Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 animate-fadeIn">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-zinc-400 hover:text-zinc-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={loadSettings}
            className="px-3 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white transition"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 gap-2">
        <div className="flex space-x-2">
          {[
            { id: 'general', label: 'Platform Umum' },
            { id: 'support', label: 'Support & Kontak' },
            { id: 'feature_flags', label: 'Feature Flags' },
            { id: 'operational', label: 'Operasional' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Link
          to="/admin/footer-social-links"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-1.5 text-xs font-semibold rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Kelola Footer & Social Links &rarr;
        </Link>
      </div>

      {/* Skeleton Loading State */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse">
              <div className="h-5 w-48 bg-zinc-800 rounded mb-2" />
              <div className="h-4 w-72 bg-zinc-800/60 rounded mb-6" />
              <div className="h-10 w-full bg-zinc-800/40 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSaveAll} className="space-y-6">
          {/* TAB 1: General Platform */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Platform Name */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-platform-name" className="text-base font-semibold text-zinc-100">
                    Nama Platform
                  </label>
                  {formValues.platform_name !== settings.find((s) => s.key === 'platform_name')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Nama identitas aplikasi yang ditampilkan pada judul halaman, email notifikasi, dan struk.
                </p>
                <input
                  id="setting-platform-name"
                  type="text"
                  value={formValues.platform_name || ''}
                  onChange={(e) => handleChange('platform_name', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  placeholder="BisnisSehat"
                />
              </div>

              {/* Maintenance Mode (High-impact) */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-zinc-100">Maintenance Mode</span>
                    {formValues.maintenance_mode && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        AKTIF
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 max-w-xl">
                    Mengunci akses publik dan UMKM sementara selama pemeliharaan server atau migrasi darurat. Tindakan ini memerlukan konfirmasi admin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('maintenance_mode')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    formValues.maintenance_mode ? 'bg-rose-600' : 'bg-zinc-700'
                  }`}
                  role="switch"
                  aria-checked={Boolean(formValues.maintenance_mode)}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      formValues.maintenance_mode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Announcement Banner */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-base font-semibold text-zinc-100">Banner Pengumuman Global</span>
                    <p className="text-xs text-zinc-400">
                      Tampilkan bilah pengumuman di bagian atas seluruh dashboard pengguna.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('announcement_banner_enabled')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      formValues.announcement_banner_enabled ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                    role="switch"
                    aria-checked={Boolean(formValues.announcement_banner_enabled)}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        formValues.announcement_banner_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <label htmlFor="setting-banner-text" className="text-xs font-medium text-zinc-300">
                    Teks Pengumuman
                  </label>
                  <textarea
                    id="setting-banner-text"
                    rows={2}
                    value={formValues.announcement_banner_text || ''}
                    onChange={(e) => handleChange('announcement_banner_text', e.target.value)}
                    placeholder="Contoh: Pemeliharaan terjadwal akan dilaksanakan pada hari Minggu pukul 01:00 WIB."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Support & Kontak */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              {/* Support Email */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-support-email" className="text-base font-semibold text-zinc-100">
                    Email Customer Support
                  </label>
                  {formValues.support_email !== settings.find((s) => s.key === 'support_email')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Alamat email tujuan pelaporan bug dan pusat bantuan resmi pengguna.
                </p>
                <input
                  id="setting-support-email"
                  type="email"
                  value={formValues.support_email || ''}
                  onChange={(e) => handleChange('support_email', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  placeholder="support@bisnissehat.id"
                />
              </div>

              {/* Support Phone / WA */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-support-phone" className="text-base font-semibold text-zinc-100">
                    Nomor WhatsApp Support
                  </label>
                  {formValues.support_phone !== settings.find((s) => s.key === 'support_phone')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Nomor WhatsApp CS yang dihubungkan pada widget bantuan dan tombol kontak.
                </p>
                <input
                  id="setting-support-phone"
                  type="text"
                  value={formValues.support_phone || ''}
                  onChange={(e) => handleChange('support_phone', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  placeholder="+62 812-3456-7890"
                />
              </div>

              {/* Support Operating Hours */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-operating-hours" className="text-base font-semibold text-zinc-100">
                    Jam Operasional Layanan
                  </label>
                  {formValues.support_operating_hours !== settings.find((s) => s.key === 'support_operating_hours')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Informasi jadwal ketersediaan layanan agen support bagi pengguna.
                </p>
                <input
                  id="setting-operating-hours"
                  type="text"
                  value={formValues.support_operating_hours || ''}
                  onChange={(e) => handleChange('support_operating_hours', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  placeholder="Senin - Jumat, 09:00 - 18:00 WIB"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Feature Flags */}
          {activeTab === 'feature_flags' && (
            <div className="space-y-4">
              {[
                {
                  key: 'enable_user_registration',
                  title: 'Registrasi Pengguna Baru',
                  desc: 'Mengizinkan pendaftaran akun UMKM baru ke dalam platform.',
                },
                {
                  key: 'enable_ai_features',
                  title: 'Modul Kecerdasan Buatan (AI)',
                  desc: 'Mengaktifkan generator konten, analitik cerdas, dan asisten bisnis AI.',
                },
                {
                  key: 'enable_qris_checkout',
                  title: 'Pembayaran Mandiri QRIS',
                  desc: 'Mengizinkan pelanggan restoran/toko scan QRIS mandiri via POS publik.',
                },
                {
                  key: 'enable_pos_module',
                  title: 'Modul Point of Sale (POS)',
                  desc: 'Mengaktifkan fitur kasir POS dan menu pemesanan digital.',
                },
              ].map((flag) => {
                const isEnabled = Boolean(formValues[flag.key])
                return (
                  <div
                    key={flag.key}
                    className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-zinc-100">{flag.title}</span>
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded ${
                            isEnabled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {isEnabled ? 'AKTIF' : 'NONAKTIF'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{flag.desc}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggle(flag.key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        isEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
                      }`}
                      role="switch"
                      aria-checked={isEnabled}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* TAB 4: Operational */}
          {activeTab === 'operational' && (
            <div className="space-y-6">
              {/* Max Items Per Order */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-max-items" className="text-base font-semibold text-zinc-100">
                    Batas Maksimum Item per Transaksi POS
                  </label>
                  {formValues.pos_max_items_per_order !== settings.find((s) => s.key === 'pos_max_items_per_order')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Melindungi integritas transaksi kasir dari pesanan yang tidak wajar atau memory exhaustion.
                </p>
                <input
                  id="setting-max-items"
                  type="number"
                  min="1"
                  max="1000"
                  value={formValues.pos_max_items_per_order || 100}
                  onChange={(e) => handleChange('pos_max_items_per_order', Number(e.target.value))}
                  className="w-full sm:w-64 px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Session Idle Timeout */}
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-session-timeout" className="text-base font-semibold text-zinc-100">
                    Batas Waktu Idle Sesi (Menit)
                  </label>
                  {formValues.session_idle_timeout_minutes !== settings.find((s) => s.key === 'session_idle_timeout_minutes')?.value && (
                    <span className="text-xs text-amber-400 font-medium">Belum disimpan</span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">
                  Durasi waktu tidak aktif sebelum pengguna diminta memperbarui kredensial autentikasi.
                </p>
                <input
                  id="setting-session-timeout"
                  type="number"
                  min="5"
                  max="1440"
                  value={formValues.session_idle_timeout_minutes || 60}
                  onChange={(e) => handleChange('session_idle_timeout_minutes', Number(e.target.value))}
                  className="w-full sm:w-64 px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>
          )}
        </form>
      )}

      {/* Confirmation Modal for Destructive / High-Impact Settings */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-4 animate-scaleUp max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-zinc-100">{confirmModal.title}</h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">
              {confirmModal.description}
            </p>

            <div className="space-y-1.5 pt-2">
              <label htmlFor="confirm-modal-reason" className="text-xs font-medium text-zinc-400">
                Alasan Perubahan (Terekam di Audit Log)
              </label>
              <input
                id="confirm-modal-reason"
                type="text"
                value={confirmModal.reason}
                onChange={(e) => setConfirmModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Masukkan alasan perubahan..."
                className="w-full px-3 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmHighImpact}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition flex items-center gap-2"
              >
                {saving ? 'Memproses...' : 'Ya, Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
