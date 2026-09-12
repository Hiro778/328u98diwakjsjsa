import { motion } from 'framer-motion'

const MARKETPLACE_INFO = {
  shopee: {
    name: 'Shopee',
    color: '#EE4D2D',
    description: 'Marketplace terbesar di Indonesia dengan jutaan pengunjung aktif.',
    benefits: ['Akses ke jutaan pembeli aktif', 'Program gratis ongkir', 'Fitur flash sale & promosi'],
  },
  tokopedia: {
    name: 'Tokopedia',
    color: '#42B549',
    description: 'Platform e-commerce lokal terkemuka dengan ekosistem lengkap.',
    benefits: ['Integrasi dengan GoTo ecosystem', 'Promosi melalui TopAds', 'Fitur TokoCabang'],
  },
  tiktokshop: {
    name: 'TikTok Shop',
    color: '#000000',
    description: 'Jualan langsung dari konten video TikTok dengan fitur live shopping.',
    benefits: ['Jualan melalui konten video', 'Live shopping interaktif', 'Akses creator marketplace'],
  },
}

function formatDate(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export default function ConnectionCard({ marketplaceKey, connection, onConnect }) {
  const info = MARKETPLACE_INFO[marketplaceKey]
  if (!info) return null

  const status = connection?.status || 'disconnected'
  const isConnected = status === 'connected'
  const isError = status === 'error'
  const lastSync = formatDate(connection?.last_sync_at)

  function handleConnect() {
    onConnect(marketplaceKey)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-6 transition-all ${
        isConnected
          ? 'border-profit-200 bg-profit-50'
          : isError
            ? 'border-red-200 bg-red-50'
            : 'border-border bg-surface'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Marketplace Icon */}
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-white font-bold text-lg"
            style={{ backgroundColor: info.color }}
          >
            {info.name.charAt(0)}
          </div>
          <div>
            <h3 className="text-lg font-bold text-navy-700">{info.name}</h3>
            <p className="text-sm text-text-secondary">{info.description}</p>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isConnected
              ? 'bg-profit-100 text-profit-600'
              : isError
                ? 'bg-red-100 text-red-600'
                : 'bg-navy-50 text-navy-300'
          }`}
        >
          {isConnected ? 'Terhubung' : isError ? 'Error' : 'Belum terhubung'}
        </span>
      </div>

      {/* Shop Info (when connected) */}
      {isConnected && connection?.shop_name && (
        <div className="mt-4 rounded-xl bg-white/60 p-3">
          <p className="text-xs font-semibold text-text-muted">Toko</p>
          <p className="text-sm font-semibold text-navy-700">{connection.shop_name}</p>
          {lastSync && (
            <p className="mt-1 text-xs text-text-muted">Terakhir sync: {lastSync}</p>
          )}
        </div>
      )}

      {/* Error Message */}
      {isError && connection?.last_error && (
        <div className="mt-4 rounded-xl bg-red-100/60 p-3">
          <p className="text-xs font-semibold text-red-600">Error</p>
          <p className="mt-1 text-xs text-red-500">{connection.last_error}</p>
        </div>
      )}

      {/* Benefits */}
      <div className="mt-4 space-y-2">
        {info.benefits.map((benefit, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm text-text-secondary">
            <svg className="h-4 w-4 text-profit-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {benefit}
          </div>
        ))}
      </div>

      {/* Action Button */}
      <div className="mt-6">
        {isConnected ? (
          <button
            onClick={handleConnect}
            className="w-full rounded-xl border border-profit-200 bg-white px-4 py-3 text-sm font-semibold text-profit-600 transition-all hover:bg-profit-50"
          >
            Kelola Koneksi
          </button>
        ) : (
          <button
            onClick={handleConnect}
            className="w-full rounded-xl bg-warm-400 px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-md hover:bg-warm-500"
          >
            Hubungkan
          </button>
        )}
      </div>
    </motion.div>
  )
}
