import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  initiateOAuth,
  getConnectionStatus,
  getReviews,
  replyToReview,
  getPosts,
  createPost,
  deletePost,
  getPerformance,
  disconnect,
} from '../../../lib/googleBusinessService'

// ══════════════════════════════════════════════════════════
// Status Display Helpers
// ══════════════════════════════════════════════════════════

const STATUS_LABELS = {
  not_connected: { label: 'Belum Terhubung', color: 'text-text-muted', dot: 'bg-gray-300' },
  connecting: { label: 'Menghubungkan...', color: 'text-warm-500', dot: 'bg-warm-400 animate-pulse' },
  connected: { label: 'Terhubung', color: 'text-profit-600', dot: 'bg-profit-500' },
  token_expired: { label: 'Sesi Expired', color: 'text-warm-500', dot: 'bg-warm-400' },
  error: { label: 'Error', color: 'text-red-500', dot: 'bg-red-400' },
  disconnected: { label: 'Diputuskan', color: 'text-text-muted', dot: 'bg-gray-300' },
}

const CTA_OPTIONS = [
  { value: '', label: 'Tanpa CTA' },
  { value: 'LEARN_MORE', label: 'Pelajari Selengkapnya' },
  { value: 'BOOK', label: 'Pesan' },
  { value: 'ORDER', label: 'Pesan Sekarang' },
  { value: 'SHOP', label: 'Belanja' },
  { value: 'SIGN_UP', label: 'Daftar' },
  { value: 'CALL', label: 'Hubungi' },
]

const TABS = [
  { key: 'profile', label: 'Profil' },
  { key: 'reviews', label: 'Ulasan' },
  { key: 'posts', label: 'Postingan' },
  { key: 'performance', label: 'Performa' },
]

// ══════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════

export default function GoogleBusinessProfilePage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [refreshKey, setRefreshKey] = useState(0)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    const data = await getConnectionStatus()
    setStatus(data)
    if (data?.locations?.length > 0 && !selectedLocation) {
      setSelectedLocation(data.locations[0])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus, refreshKey])

  function handleRefresh() {
    setRefreshKey((k) => k + 1)
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" />
      </div>
    )
  }

  // ── Needs setup (OAuth not configured) ──
  if (status?.status === 'needs_setup' || !status?.configured) {
    return (
      <div>
        <PageHeader />
        <SetupChecklist message={status?.message} />
      </div>
    )
  }

  const isConnected = status?.status === 'connected' && status?.connection
  const locations = status?.locations || []

  return (
    <div>
      <PageHeader />

      {/* Status Bar */}
      {isConnected && (
        <StatusBar
          status={status.connection.status}
          accountName={status.connection.google_account_name}
          onRefresh={handleRefresh}
          onDisconnect={async () => {
            if (window.confirm('Putuskan koneksi Google Business Profile?')) {
              await disconnect()
              handleRefresh()
            }
          }}
        />
      )}

      {/* Not Connected */}
      {!isConnected && (
        <ConnectCard
          onConnect={async () => {
            const result = await initiateOAuth()
            if (result.status === 'needs_setup') {
              alert(result.message)
              return
            }
            if (result.authorization_url) {
              window.location.href = result.authorization_url
            }
          }}
          status={status?.status}
          error={status?.connection?.last_error}
        />
      )}

      {/* Connected: Location Selector + Tabs */}
      {isConnected && locations.length > 0 && (
        <>
          {/* Location Selector */}
          {locations.length > 1 && (
            <LocationSelector
              locations={locations}
              selected={selectedLocation}
              onSelect={setSelectedLocation}
            />
          )}

          {/* Selected Location Info */}
          {selectedLocation && (
            <LocationCard location={selectedLocation} />
          )}

          {/* Tabs */}
          {selectedLocation && (
            <div className="mt-6">
              <TabNav active={activeTab} onChange={setActiveTab} />
              <div className="mt-4">
                {activeTab === 'profile' && <ProfileTab location={selectedLocation} />}
                {activeTab === 'reviews' && <ReviewsTab location={selectedLocation} />}
                {activeTab === 'posts' && <PostsTab location={selectedLocation} />}
                {activeTab === 'performance' && <PerformanceTab location={selectedLocation} />}
              </div>
            </div>
          )}
        </>
      )}

      {/* Connected but no locations */}
      {isConnected && locations.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
          <svg className="mx-auto h-12 w-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="mt-3 text-lg font-bold text-navy-700">Tidak Ada Business Profile</h3>
          <p className="mt-2 text-sm text-text-secondary">
            Akun Google Anda tidak memiliki Business Profile yang dapat diakses.
          </p>
          <div className="mt-4 rounded-xl bg-cream p-4 text-left text-sm text-text-secondary">
            <p className="font-semibold text-navy-700">Yang perlu dilakukan:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Buka <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="text-electric-600 underline">Google Business Profile</a></li>
              <li>Buat atau klaim bisnis Anda</li>
              <li>Lengkapi profil bisnis</li>
              <li>Kembali ke sini dan klik Refresh</li>
            </ol>
          </div>
          <button onClick={handleRefresh} className="mt-4 rounded-xl bg-warm-400 px-6 py-2.5 text-sm font-bold text-white hover:bg-warm-500">
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════

function PageHeader() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-warm-400">Marketing</p>
      <h1 className="text-2xl font-extrabold text-navy-700">Google Business Profile</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Kelola profil bisnis Google langsung dari BisnisSehat.
      </p>
    </motion.div>
  )
}

function SetupChecklist({ message }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
      className="mt-6 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-50">
          <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-navy-700">Perlu Setup Admin</h3>
          <p className="mt-1 text-sm text-text-secondary">{message || 'Google Business Profile API belum dikonfigurasi.'}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-cream p-4">
        <h4 className="text-sm font-semibold text-navy-700 mb-3">Checklist Konfigurasi Google Cloud:</h4>
        <div className="space-y-3 text-sm text-text-secondary">
          <CheckItem done={false}>Buat atau pilih project di Google Cloud Console</CheckItem>
          <CheckItem done={false}>Aktifkan OAuth Consent Screen (External user type)</CheckItem>
          <CheckItem done={false}>Buat OAuth Client ID (Web Application)</CheckItem>
          <CheckItem done={false}>Set redirect URI: <code className="rounded bg-cream-2 px-1 text-xs">https://&lt;project-ref&gt;.supabase.co/functions/v1/google-business-callback</code></CheckItem>
          <CheckItem done={false}>Enable APIs: My Business Account Management API</CheckItem>
          <CheckItem done={false}>Enable APIs: My Business Business Information API</CheckItem>
          <CheckItem done={false}>Enable APIs: Google My Business API (Reviews & Posts)</CheckItem>
          <CheckItem done={false}>Enable APIs: Business Profile Performance API</CheckItem>
          <CheckItem done={false}>Ajukan akses API ke Google untuk approval</CheckItem>
          <CheckItem done={false}>Set secrets di Supabase: <code className="rounded bg-cream-2 px-1 text-xs">GOOGLE_OAUTH_CLIENT_ID</code>, <code className="rounded bg-cream-2 px-1 text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>, <code className="rounded bg-cream-2 px-1 text-xs">GOOGLE_OAUTH_REDIRECT_URI</code></CheckItem>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-warm-50 border border-warm-200 p-4 text-sm text-warm-600">
        <p className="font-semibold">Catatan Penting:</p>
        <p className="mt-1">Google Business Profile APIs memerlukan approval manual dari Google. OAuth saja tidak cukup — fitur akan menampilkan status yang sesuai jika API belum disetujui.</p>
      </div>
    </motion.div>
  )
}

function CheckItem({ children, done }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${done ? 'border-profit-400 bg-profit-50' : 'border-gray-300'}`}>
        {done && <svg className="h-3 w-3 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </span>
      <span>{children}</span>
    </div>
  )
}

function ConnectCard({ onConnect, status, error }) {
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      await onConnect()
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
      className="mt-6 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <svg className="h-8 w-8" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-navy-700">Google Business Profile</h3>
          <p className="text-sm text-text-secondary">
            Kelola profil bisnis Google langsung dari BisnisSehat.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* What happens */}
      <div className="mt-4 rounded-xl bg-cream p-4">
        <h4 className="text-sm font-semibold text-navy-700 mb-2">Yang akan terjadi:</h4>
        <div className="space-y-2">
          {['Anda akan diarahkan ke halaman login Google', 'Login ke akun Google Anda', 'Beri izin akses kepada BisnisSehat', 'Anda akan kembali ke BisnisSehat dengan status terhubung'].map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warm-100 text-[10px] font-bold text-warm-500">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-warm-400 px-6 py-3 text-sm font-bold text-white hover:bg-warm-500 disabled:opacity-50"
      >
        {loading ? 'Mengarahkan ke Google...' : 'Hubungkan Google Business Profile'}
      </button>
    </motion.div>
  )
}

function StatusBar({ status, accountName, onRefresh, onDisconnect }) {
  const info = STATUS_LABELS[status] || STATUS_LABELS.not_connected

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
      className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${info.dot}`} />
          <div>
            <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
            {accountName && <span className="ml-2 text-sm text-text-secondary">· {accountName}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-cream">
            Refresh
          </button>
          <button onClick={onDisconnect} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50">
            Putuskan
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function LocationSelector({ locations, selected, onSelect }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
      className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-navy-700 mb-2">Pilih Lokasi ({locations.length} tersedia)</h3>
      <div className="flex flex-wrap gap-2">
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => onSelect(loc)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
              selected?.id === loc.id
                ? 'border-warm-400 bg-warm-50 text-warm-600'
                : 'border-border bg-cream text-text-secondary hover:border-warm-200'
            }`}
          >
            {loc.location_name}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function LocationCard({ location }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
      className="mt-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-navy-700">{location.location_name}</h3>
          {location.address && <p className="mt-1 text-sm text-text-secondary">{location.address}</p>}
          {location.category && <p className="mt-1 text-sm text-text-muted">{location.category}</p>}
          {location.phone_number && <p className="mt-1 text-sm text-text-muted">{location.phone_number}</p>}
        </div>
        {location.maps_url && (
          <a href={location.maps_url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-electric-600 hover:bg-cream">
            Maps ↗
          </a>
        )}
      </div>
    </motion.div>
  )
}

function TabNav({ active, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl border border-border bg-cream p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
            active === tab.key
              ? 'bg-surface text-navy-700 shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Tab Content Components
// ══════════════════════════════════════════════════════════

function ProfileTab({ location }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-lg font-bold text-navy-700">Informasi Profil</h3>
      <div className="mt-4 space-y-3">
        <InfoRow label="Nama" value={location.location_name} />
        <InfoRow label="Alamat" value={location.address} />
        <InfoRow label="Kategori" value={location.category} />
        <InfoRow label="Telepon" value={location.phone_number} />
        <InfoRow label="Website" value={location.website_uri} />
        <InfoRow label="Maps" value={location.maps_url} isLink />
      </div>
      <div className="mt-4 rounded-xl bg-cream p-4">
        <p className="text-xs text-text-muted">
          Data diambil dari Google Business Profile. Perubahan profil harus dilakukan langsung di Google Business Profile.
        </p>
      </div>
    </div>
  )
}

function InfoRow({ label, value, isLink }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 text-sm font-medium text-text-muted">{label}</span>
      {isLink ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-electric-600 hover:underline break-all">{value}</a>
      ) : (
        <span className="text-sm text-navy-700">{value}</span>
      )}
    </div>
  )
}

function ReviewsTab({ location }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [notApprovedMsg, setNotApprovedMsg] = useState('')
  const [replyModal, setReplyModal] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadReviews()
  }, [location.google_location_id])

  async function loadReviews(pageToken) {
    setLoading(true)
    const data = await getReviews(location.google_location_id, pageToken)
    if (data?.available === false) {
      setAvailable(false)
      setNotApprovedMsg(data.message || '')
    } else {
      setReviews(data?.reviews || [])
      setAvailable(true)
    }
    setLoading(false)
  }

  async function handleReply() {
    if (!replyText.trim() || !replyModal) return
    setSubmitting(true)
    const result = await replyToReview(location.google_location_id, replyModal.reviewId, replyText.trim())
    setSubmitting(false)
    if (result.success) {
      setReplyModal(null)
      setReplyText('')
      loadReviews()
    } else {
      alert(result.error || 'Gagal membalas ulasan')
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" /></div>
  }

  if (!available) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ApiNotAvailable message={notApprovedMsg} apiName="Google My Business API" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h3 className="text-lg font-bold text-navy-700">Ulasan</h3>
      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">Belum ada ulasan.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {reviews.map((review) => (
            <div key={review.reviewId || review.name} className="rounded-xl bg-cream p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy-700">{review.reviewer?.displayName || 'Anonymous'}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg key={star} className={`h-4 w-4 ${star <= (review.starRating || 0) ? 'text-warm-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-text-muted">
                  {review.updateTime ? new Date(review.updateTime).toLocaleDateString('id-ID') : ''}
                </span>
              </div>
              {review.comment && <p className="mt-2 text-sm text-text-secondary">{review.comment}</p>}

              {/* Existing reply */}
              {review.reviewReply && (
                <div className="mt-3 rounded-lg bg-surface p-3 border border-border">
                  <p className="text-xs font-semibold text-text-muted">Balasan Anda:</p>
                  <p className="mt-1 text-sm text-navy-700">{review.reviewReply.comment}</p>
                </div>
              )}

              <button
                onClick={() => {
                  setReplyModal({ reviewId: review.reviewId || review.name, existing: review.reviewReply?.comment || '' })
                  setReplyText(review.reviewReply?.comment || '')
                }}
                className="mt-2 text-xs font-semibold text-electric-600 hover:underline"
              >
                {review.reviewReply ? 'Edit Balasan' : 'Balas'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply Modal */}
      <AnimatePresence>
        {replyModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setReplyModal(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
              <h3 className="text-lg font-bold text-navy-700">Balas Ulasan</h3>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Tulis balasan Anda..."
                className="mt-3 w-full rounded-xl border border-border bg-cream p-3 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                rows={4}
              />
              <div className="mt-4 flex gap-3">
                <button onClick={() => setReplyModal(null)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-cream">
                  Batal
                </button>
                <button onClick={handleReply} disabled={!replyText.trim() || submitting}
                  className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-sm font-bold text-white hover:bg-warm-500 disabled:opacity-50">
                  {submitting ? 'Mengirim...' : 'Kirim Balasan'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PostsTab({ location }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [notApprovedMsg, setNotApprovedMsg] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ summary: '', call_to_action: '', url: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadPosts()
  }, [location.google_location_id])

  async function loadPosts() {
    setLoading(true)
    const data = await getPosts(location.google_location_id)
    if (data?.available === false) {
      setAvailable(false)
      setNotApprovedMsg(data.message || '')
    } else {
      setPosts(data?.posts || [])
      setAvailable(true)
    }
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.summary.trim()) return
    setSubmitting(true)
    const result = await createPost(location.google_location_id, form)
    setSubmitting(false)
    if (result.success) {
      setShowCreate(false)
      setForm({ summary: '', call_to_action: '', url: '' })
      loadPosts()
    } else {
      alert(result.error || 'Gagal membuat postingan')
    }
  }

  async function handleDelete(postId) {
    if (!window.confirm('Hapus postingan ini?')) return
    const result = await deletePost(location.google_location_id, postId)
    if (result.success) {
      loadPosts()
    } else {
      alert(result.error || 'Gagal menghapus postingan')
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" /></div>
  }

  if (!available) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ApiNotAvailable message={notApprovedMsg} apiName="Google My Business API" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy-700">Postingan</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-warm-400 px-4 py-2 text-xs font-bold text-white hover:bg-warm-500">
          + Buat Post
        </button>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="mt-4 rounded-xl bg-cream p-4">
              <textarea
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="Tulis postingan Anda..."
                className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
                rows={3}
              />
              <div className="mt-3 flex gap-3">
                <select
                  value={form.call_to_action}
                  onChange={(e) => setForm((f) => ({ ...f, call_to_action: e.target.value }))}
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-warm-300 focus:outline-none"
                >
                  {CTA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {form.call_to_action && (
                  <input
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="URL"
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none"
                  />
                )}
              </div>
              <div className="mt-3 flex gap-3">
                <button onClick={() => setShowCreate(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-cream">
                  Batal
                </button>
                <button onClick={handleCreate} disabled={!form.summary.trim() || submitting}
                  className="rounded-xl bg-warm-400 px-4 py-2 text-sm font-bold text-white hover:bg-warm-500 disabled:opacity-50">
                  {submitting ? 'Membuat...' : 'Publikasikan'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Posts List */}
      {posts.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">Belum ada postingan.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {posts.map((post) => (
            <div key={post.name} className="rounded-xl bg-cream p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-navy-700 whitespace-pre-wrap">{post.summary}</p>
                  {post.callToAction && (
                    <p className="mt-2 text-xs text-electric-600">
                      {post.callToAction.actionType} → {post.callToAction.url}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-text-muted">
                    {post.createTime ? new Date(post.createTime).toLocaleDateString('id-ID') : ''}
                    {post.state && ` · ${post.state}`}
                  </p>
                </div>
                <button onClick={() => handleDelete(post.name)} className="shrink-0 rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PerformanceTab({ location }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [notApprovedMsg, setNotApprovedMsg] = useState('')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  useEffect(() => {
    loadPerformance()
  }, [location.google_location_id])

  async function loadPerformance() {
    setLoading(true)
    const opts = {}
    if (dateRange.start) opts.start_date = dateRange.start
    if (dateRange.end) opts.end_date = dateRange.end

    const result = await getPerformance(location.google_location_id, opts)
    if (result?.available === false) {
      setAvailable(false)
      setNotApprovedMsg(result.message || '')
    } else {
      setData(result)
      setAvailable(true)
    }
    setLoading(false)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" /></div>
  }

  if (!available) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <ApiNotAvailable message={notApprovedMsg} apiName="Business Profile Performance API" />
      </div>
    )
  }

  const metrics = data?.metrics || []

  // Aggregate metrics into summary cards
  const summaryMetrics = {}
  metrics.forEach((m) => {
    const name = m.dailyMetric
    const total = (m.timeSeries?.datedValues || []).reduce((sum, v) => sum + (parseInt(v.value) || 0), 0)
    summaryMetrics[name] = total
  })

  const metricLabels = {
    BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'Tampilan Desktop (Maps)',
    BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'Tampilan Desktop (Search)',
    BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'Tampilan Mobile (Maps)',
    BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'Tampilan Mobile (Search)',
    CALL_CLICKS: 'Panggilan',
    WEBSITE_CLICKS: 'Klik Website',
    BUSINESS_DIRECTION_REQUESTS: 'Navigasi',
    BUSINESS_CONVERSATIONS: 'Percakapan',
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-navy-700">Performa</h3>
        <button onClick={loadPerformance} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-cream">
          Refresh
        </button>
      </div>

      {Object.keys(summaryMetrics).length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">Belum ada data performa untuk periode ini.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(summaryMetrics).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-cream p-4 text-center">
              <p className="text-2xl font-extrabold text-navy-700">{value.toLocaleString('id-ID')}</p>
              <p className="mt-1 text-xs text-text-muted">{metricLabels[key] || key}</p>
            </div>
          ))}
        </div>
      )}

      {data?.timeFrame && (
        <p className="mt-4 text-xs text-text-muted">
          Periode: {data.timeFrame.startDate} — {data.timeFrame.endDate}
        </p>
      )}
    </div>
  )
}

function ApiNotAvailable({ message, apiName }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-50">
          <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-navy-700">Fitur Belum Tersedia</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {message || `${apiName} belum mendapat akses dari Google.`}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-cream p-4 text-sm text-text-secondary">
        <p className="font-semibold text-navy-700">Yang perlu dilakukan:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Buka Google Cloud Console</li>
          <li>Enable {apiName}</li>
          <li>Ajukan akses API ke Google</li>
          <li>Tunggu approval dari Google</li>
        </ol>
      </div>
    </div>
  )
}
