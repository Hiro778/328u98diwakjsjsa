import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const BUSINESS_TYPES = [
  'UMKM', 'Exportir', 'Manufaktur', 'Peternakan', 'Perikanan', 'Pertanian', 'Jasa', 'Lainnya',
]

const BUSINESS_CATEGORIES = [
  'Kopi', 'Cokelat', 'Rempah', 'Tekstil', 'Kerajinan', 'Pangan', 'Minuman', 'Lainnya',
]

const SOURCE_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'Teman / Rekomendasi' },
  { value: 'other', label: 'Lainnya' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, refreshBusiness, refreshSubscription } = useAuth()

  const [form, setForm] = useState({
    business_name: user?.user_metadata?.full_name || '',
    business_type: '',
    business_category: '',
    location: '',
    source: '',
    source_other: '',
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.business_name.trim() || !form.business_type) {
      setError('Nama bisnis dan jenis bisnis wajib diisi.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: bizErr } = await supabase
      .from('businesses')
      .insert({
        owner_id: user.id,
        name: form.business_name.trim(),
        business_type: form.business_type,
        business_category: form.business_category,
        location: form.location.trim(),
      })

    if (bizErr) {
      setError(bizErr.message)
      setSubmitting(false)
      return
    }

    const { error: profErr } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (profErr) {
      setError(profErr.message)
      setSubmitting(false)
      return
    }

    await refreshBusiness()
    await refreshSubscription()
    navigate('/pricing', { replace: true })
  }

  const inputClass = 'w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50'

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg"
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-600">
            <span className="text-lg font-extrabold text-white">BS</span>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-navy-700">
            Selamat datang di BisnisSehat
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Kenalin bisnis lo dulu, biar semua tools bisa bekerja berdasarkan data bisnis lo.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-600">Nama Bisnis</label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) => set('business_name', e.target.value)}
              placeholder="Contoh: Kopi Gayo Heritage"
              className={inputClass}
            />
          </div>

          {/* Business Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-600">Jenis Bisnis</label>
            <select
              value={form.business_type}
              onChange={(e) => set('business_type', e.target.value)}
              className={inputClass}
            >
              <option value="">Pilih jenis bisnis</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Business Category */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-600">Kategori Produk</label>
            <select
              value={form.business_category}
              onChange={(e) => set('business_category', e.target.value)}
              className={inputClass}
            >
              <option value="">Pilih kategori</option>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-600">Kota</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Contoh: Banda Aceh"
              className={inputClass}
            />
          </div>

          {/* Source */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-600">Tahu BisnisSehat dari mana? <span className="text-text-muted">(opsional)</span></label>
            <select
              value={form.source}
              onChange={(e) => set('source', e.target.value)}
              className={inputClass}
            >
              <option value="">Pilih sumber</option>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {form.source === 'other' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy-600">Masukkan sumber lainnya</label>
              <input
                type="text"
                value={form.source_other}
                onChange={(e) => set('source_other', e.target.value)}
                placeholder="Contoh: Komunitas lokal"
                className={inputClass}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* CTA */}
          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={!submitting ? { scale: 1.02 } : {}}
            whileTap={!submitting ? { scale: 0.98 } : {}}
            className="w-full rounded-xl bg-warm-400 px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30 disabled:opacity-60"
          >
            {submitting ? 'Menyimpan...' : 'Lanjut ke Paket Bisnis →'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
