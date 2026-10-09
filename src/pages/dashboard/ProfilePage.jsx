import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { getPlanDisplay } from '../../data/categories'
import useToast from '../../hooks/useToast'
import Toast from '../../components/Toast'
import {
  validateAvatarFile,
  uploadUserAvatar,
  updateUserProfile,
  updateUserBusiness,
} from '../../services/profileService'
import {
  getDesignSettings,
  uploadDesignAsset,
  updateMenuBackground,
  removeMenuBackground,
} from '../../services/qrMenuDesignService'
import { invalidateBusinessContactCache } from '../../services/businessContactService'
import BusinessQrisSettings from '../../components/pos/BusinessQrisSettings'

const DEFAULT_BUSINESS_TYPES = [
  'UMKM', 'Perdagangan', 'Manufaktur', 'Peternakan', 'Perikanan', 'Pertanian', 'Jasa', 'Lainnya',
]

const DEFAULT_BUSINESS_CATEGORIES = [
  'Kopi', 'Cokelat', 'Rempah', 'Tekstil', 'Kerajinan', 'Pangan', 'Minuman', 'Lainnya',
]

export default function ProfilePage() {
  const { user, profile, business, subscription, refreshProfile, refreshBusiness } = useAuth()
  const { toast, showToast } = useToast()
  const fileInputRef = useRef(null)

  // Form states
  const [form, setForm] = useState({
    full_name: '',
    business_name: '',
    business_type: '',
    business_category: '',
    location: '',
    whatsapp: '',
  })

  // Avatar states
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarImgError, setAvatarImgError] = useState(false)

  // Form saving state
  const [saving, setSaving] = useState(false)

  // Background Menu states
  const [currentBgUrl, setCurrentBgUrl] = useState('')
  const [bgPreview, setBgPreview] = useState('')
  const [selectedBgFile, setSelectedBgFile] = useState(null)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [removingBg, setRemovingBg] = useState(false)
  const bgInputRef = useRef(null)

  // Load existing menu background on business load
  useEffect(() => {
    let isMounted = true
    async function loadBackground() {
      if (!business?.id) return
      try {
        const settings = await getDesignSettings(business.id)
        if (isMounted) {
          const bg = settings?.theme?.backgroundImage || ''
          setCurrentBgUrl(bg)
          setBgPreview(bg)
        }
      } catch (err) {
        console.warn('[ProfilePage] Failed to load menu background:', err)
      }
    }
    loadBackground()
    return () => { isMounted = false }
  }, [business?.id])

  // Cleanup blob URL preview for background
  useEffect(() => {
    return () => {
      if (bgPreview && bgPreview.startsWith('blob:')) {
        URL.revokeObjectURL(bgPreview)
      }
    }
  }, [bgPreview])

  function handleBgFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      showToast(validation.error, 'error')
      if (bgInputRef.current) bgInputRef.current.value = ''
      return
    }

    const preview = URL.createObjectURL(file)
    setBgPreview(preview)
    setSelectedBgFile(file)
  }

  function handleCancelBg() {
    if (bgPreview && bgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(bgPreview)
    }
    setBgPreview(currentBgUrl)
    setSelectedBgFile(null)
    if (bgInputRef.current) bgInputRef.current.value = ''
  }

  async function handleSaveBg() {
    if (!selectedBgFile || !business?.id) return
    setUploadingBg(true)
    try {
      const publicUrl = await uploadDesignAsset(business.id, selectedBgFile, 'background')
      await updateMenuBackground(business.id, publicUrl)
      setCurrentBgUrl(publicUrl)
      setBgPreview(publicUrl)
      setSelectedBgFile(null)
      showToast('Background menu berhasil diperbarui!', 'success')
      if (refreshBusiness) refreshBusiness()
    } catch (err) {
      console.error('[ProfilePage] Error saving background:', err)
      showToast(err.message || 'Gagal menyimpan background menu.', 'error')
    } finally {
      setUploadingBg(false)
    }
  }

  async function handleRemoveBg() {
    if (!business?.id) return
    setRemovingBg(true)
    try {
      await removeMenuBackground(business.id)
      setCurrentBgUrl('')
      setBgPreview('')
      setSelectedBgFile(null)
      if (bgInputRef.current) bgInputRef.current.value = ''
      showToast('Background menu berhasil dihapus.', 'success')
      if (refreshBusiness) refreshBusiness()
    } catch (err) {
      console.error('[ProfilePage] Error removing background:', err)
      showToast(err.message || 'Gagal menghapus background menu.', 'error')
    } finally {
      setRemovingBg(false)
    }
  }

  // Sync form state when profile or business data loads/changes
  useEffect(() => {
    setForm({
      full_name: profile?.full_name || '',
      business_name: business?.name || '',
      business_type: business?.business_type || '',
      business_category: business?.business_category || '',
      location: business?.location || '',
      whatsapp: business?.whatsapp || '',
    })
  }, [profile, business])

  // Reset avatar image error when avatar_url changes
  useEffect(() => {
    setAvatarImgError(false)
  }, [profile?.avatar_url])

  // Cleanup blob URL preview when unmounting or changing preview
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  const initials = (profile?.full_name || user?.email || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const planInfo = getPlanDisplay(subscription?.plan)

  // Combine default and custom categories/types
  const businessTypes = [...new Set([
    ...DEFAULT_BUSINESS_TYPES,
    ...(business?.business_type ? [business.business_type] : []),
  ])]

  const businessCategories = [...new Set([
    ...DEFAULT_BUSINESS_CATEGORIES,
    ...(business?.business_category ? [business.business_category] : []),
  ])]

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      showToast(validation.error, 'error')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview)
    }

    setSelectedFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function handleCancelAvatar() {
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview)
    }
    setAvatarPreview(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSaveAvatar() {
    if (!selectedFile || !user?.id) return

    setUploadingAvatar(true)
    try {
      await uploadUserAvatar(user.id, selectedFile, profile?.avatar_url)
      await refreshProfile()

      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview)
      }
      setAvatarPreview(null)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      showToast('Foto profil berhasil diperbarui!', 'success')
    } catch (err) {
      console.error('[ProfilePage] Error uploading avatar:', err)
      showToast(err.message || 'Gagal mengunggah foto profil.', 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!user?.id) return

    setSaving(true)
    try {
      await Promise.all([
        updateUserProfile(user.id, { fullName: form.full_name }),
        updateUserBusiness(business?.id, user.id, {
          name: form.business_name,
          businessType: form.business_type,
          businessCategory: form.business_category,
          location: form.location,
          whatsapp: form.whatsapp,
        }),
      ])

      if (business?.id) {
        invalidateBusinessContactCache(business.id)
      }

      await Promise.all([
        refreshProfile(),
        refreshBusiness(),
      ])

      showToast('Profil dan informasi bisnis berhasil disimpan!', 'success')
    } catch (err) {
      console.error('[ProfilePage] Error saving profile:', err)
      showToast(err.message || 'Gagal menyimpan perubahan.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const currentDisplayAvatar = avatarPreview || profile?.avatar_url

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />

      {/* Breadcrumb & Page Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
          <span>WORKSPACE</span>
          <span className="text-text-muted/40">/</span>
          <span className="text-text-secondary truncate">{business?.name || profile?.full_name || 'Bisnis Anda'}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary">
          Profil Saya
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola informasi akun dan bisnis Anda
        </p>
      </div>

      {/* Main Container Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden"
      >
        {/* SECTION 1: Avatar Management */}
        <div className="p-6 sm:p-8 border-b border-border flex flex-col items-center justify-center text-center bg-surface-elevated/30">
          <div className="relative group">
            <div className="flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full bg-primary text-white font-extrabold text-3xl shadow-md ring-4 ring-primary/20 overflow-hidden bg-cover bg-center">
              {currentDisplayAvatar && !avatarImgError ? (
                <img
                  src={currentDisplayAvatar}
                  alt={profile?.full_name || 'Foto Profil'}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarImgError(true)}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Avatar Actions */}
          <div className="mt-4 flex flex-col items-center gap-2">
            {!selectedFile ? (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-hover hover:border-primary/50 transition-colors shadow-xs"
                >
                  <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Ganti foto
                </button>
                <p className="mt-1.5 text-[11px] text-text-muted">
                  JPG, JPEG, PNG, atau WebP. Maksimal 5 MB.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-primary">
                  Foto baru terpilih: {selectedFile.name}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {uploadingAvatar ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Menyimpan...
                      </>
                    ) : (
                      'Simpan foto'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAvatar}
                    disabled={uploadingAvatar}
                    className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2 & 3: Form Informasi Akun & Informasi Bisnis */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          {/* SECTION 2: Informasi Akun */}
          <div>
            <h2 className="text-base font-bold text-text-primary mb-4 pb-2 border-b border-border flex items-center gap-2">
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Informasi Akun
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="full_name" className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Nama
                </label>
                <input
                  id="full_name"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Masukkan nama lengkap Anda"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  readOnly
                  disabled
                  value={user?.email || profile?.email || ''}
                  className="w-full rounded-xl border border-border/60 bg-surface-hover/50 px-4 py-2.5 text-sm text-text-muted cursor-not-allowed select-none"
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Email terhubung dengan otentikasi akun Anda dan tidak dapat diubah di sini.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Status
                </label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3.5 py-2 text-xs font-semibold text-text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {planInfo.displayName}
                  </span>
                  {subscription?.plan !== 'pro' && (
                    <a
                      href="/pricing"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Upgrade ke Pro &rarr;
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Informasi Bisnis */}
          <div>
            <h2 className="text-base font-bold text-text-primary mb-4 pb-2 border-b border-border flex items-center gap-2">
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Informasi Bisnis
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="business_name" className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Nama Bisnis
                </label>
                <input
                  id="business_name"
                  type="text"
                  required
                  value={form.business_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
                  placeholder="Contoh: Kopi Sejahtera"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="business_type" className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Jenis Usaha
                  </label>
                  <select
                    id="business_type"
                    value={form.business_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                  >
                    <option value="">Pilih Jenis Usaha</option>
                    {businessTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="business_category" className="block text-xs font-semibold text-text-secondary mb-1.5">
                    Kategori
                  </label>
                  <select
                    id="business_category"
                    value={form.business_category}
                    onChange={(e) => setForm((prev) => ({ ...prev, business_category: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                  >
                    <option value="">Pilih Kategori</option>
                    {businessCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="location" className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Kota
                </label>
                <input
                  id="location"
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Contoh: Jakarta Selatan, Surabaya, Bandung"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                />
              </div>

              <div>
                <label htmlFor="whatsapp" className="block text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                  Nomor WhatsApp
                </label>
                <input
                  id="whatsapp"
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
                  placeholder="Contoh: 081234567890 atau 6281234567890"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 transition-colors"
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Nomor ini digunakan pelanggan untuk menghubungi bisnis Anda melalui WhatsApp.
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Menyimpan...
                </>
              ) : (
                'Simpan Perubahan'
              )}
            </button>
          </div>
        </form>
      </motion.div>

      {/* SECTION: Background Menu */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        id="menu-background-section"
        className="rounded-2xl border border-border bg-surface shadow-xs overflow-hidden"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                Background Menu
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Foto latar belakang untuk halaman menu publik pelanggan Anda.
              </p>
            </div>
            {currentBgUrl && !selectedBgFile && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Background Aktif
              </span>
            )}
          </div>

          {/* Background Preview Area */}
          <div className="space-y-4">
            <div className="relative w-full h-44 sm:h-52 rounded-xl border border-border overflow-hidden bg-slate-50 dark:bg-surface-elevated/40 flex items-center justify-center">
              {bgPreview ? (
                <>
                  <img
                    src={bgPreview}
                    alt="Preview background menu"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                    <span className="rounded-lg bg-black/60 backdrop-blur-xs px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                      Tampilan Menu Pelanggan
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 text-text-muted">
                  <svg className="mx-auto h-10 w-10 opacity-40 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                  <p className="text-xs font-semibold text-text-secondary">Belum ada foto background</p>
                  <p className="text-[11px] mt-0.5">Halaman menu publik saat ini menggunakan warna latar default.</p>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={bgInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleBgFileChange}
                className="hidden"
              />
            </div>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-text-muted">
                Format: JPG, JPEG, PNG, atau WebP. Maksimal 5 MB.
              </p>

              <div className="flex items-center gap-2">
                {!selectedBgFile ? (
                  <>
                    {currentBgUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveBg}
                        disabled={removingBg}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-colors disabled:opacity-50"
                      >
                        {removingBg ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                            Menghapus...
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            Hapus Foto
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-hover hover:border-primary/50 transition-colors shadow-xs"
                    >
                      <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      {currentBgUrl ? 'Ganti Foto' : 'Pilih Foto Background'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelBg}
                      disabled={uploadingBg}
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      Batal
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveBg}
                      disabled={uploadingBg}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-xs"
                    >
                      {uploadingBg ? (
                        <>
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Menyimpan...
                        </>
                      ) : (
                        'Simpan Background'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* SECTION 4: Pengaturan Pembayaran (QRIS Toko) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        id="qris-settings-section"
      >
        <BusinessQrisSettings
          businessId={business?.id}
          onToast={showToast}
        />
      </motion.div>
    </div>
  )
}

