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
import BusinessQrisSettings from '../../components/pos/BusinessQrisSettings'

const DEFAULT_BUSINESS_TYPES = [
  'UMKM', 'Exportir', 'Manufaktur', 'Peternakan', 'Perikanan', 'Pertanian', 'Jasa', 'Lainnya',
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
  })

  // Avatar states
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarImgError, setAvatarImgError] = useState(false)

  // Form saving state
  const [saving, setSaving] = useState(false)

  // Sync form state when profile or business data loads/changes
  useEffect(() => {
    setForm({
      full_name: profile?.full_name || '',
      business_name: business?.name || '',
      business_type: business?.business_type || '',
      business_category: business?.business_category || '',
      location: business?.location || '',
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
        }),
      ])

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

