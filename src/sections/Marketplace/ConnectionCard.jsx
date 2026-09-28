import { motion } from 'framer-motion'
import { PROVIDER_STATUS, MARKETPLACE_REGISTRY } from '../../lib/marketplaceProviders'

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
  const provider = MARKETPLACE_REGISTRY[marketplaceKey]
  if (!provider) return null

  const isReady = provider.status === PROVIDER_STATUS.READY
  const isRequiresApproval = provider.status === PROVIDER_STATUS.REQUIRES_APPROVAL
  const isImplRequired = provider.status === PROVIDER_STATUS.IMPLEMENTATION_REQUIRED

  const status = isReady ? (connection?.status || 'disconnected') : 'unavailable'
  const isConnected = status === 'connected'
  const isError = status === 'error'
  const lastSync = formatDate(connection?.last_sync_at)

  function handleConnect() {
    if (!isReady) return
    onConnect(marketplaceKey)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-200 ${
        isConnected
          ? 'border-emerald-500/30 bg-[#151D2C] shadow-md'
          : isError
          ? 'border-red-500/30 bg-[#151D2C]'
          : isReady
          ? 'border-[#222C3E] bg-[#151D2C] hover:border-indigo-500/40'
          : 'border-[#222C3E]/60 bg-[#111622] opacity-75'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Marketplace Icon / Letter */}
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white font-bold text-base shadow-sm"
              style={{ backgroundColor: provider.color }}
            >
              {provider.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{provider.name}</h3>
                {provider.id === 'tokopedia_shop' && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Unified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{provider.description}</p>
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-semibold border ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : isError
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : isReady
                ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                : isRequiresApproval
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {isConnected
              ? 'Terhubung'
              : isError
              ? 'Error'
              : isReady
              ? 'Siap Pakai'
              : isRequiresApproval
              ? 'Persetujuan'
              : 'Perlu Connector'}
          </span>
        </div>

        {/* Shop Info (when connected) */}
        {isConnected && connection?.shop_name && (
          <div className="mt-4 rounded-xl bg-[#0B0F19] border border-[#222C3E] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-slate-400">Toko Terhubung</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-sm font-bold text-white mt-0.5">{connection.shop_name}</p>
            {lastSync && (
              <p className="mt-1 text-[11px] font-mono text-slate-400">Terakhir sync: {lastSync}</p>
            )}
          </div>
        )}

        {/* Error Message */}
        {isError && connection?.last_error && (
          <div className="mt-4 rounded-xl bg-red-950/40 border border-red-800/40 p-3">
            <p className="text-xs font-bold text-red-400">Kendala Sinkronisasi</p>
            <p className="mt-1 text-xs text-red-300/90">{connection.last_error}</p>
          </div>
        )}

        {/* Official API / Integration Note */}
        <div className="mt-3.5 pt-3 border-t border-[#222C3E]/80 text-[11px]">
          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
            <span>Official API:</span>
            <span className="text-slate-300 truncate max-w-[170px]" title={provider.officialApi}>
              {provider.officialApi}
            </span>
          </div>

          {/* Capabilities Matrix (Truth-based: NO fake checkmarks) */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 pt-2 border-t border-[#222C3E]/50">
            <div className={`flex items-center gap-1.5 text-[11px] ${provider.capabilities.oauth ? 'text-slate-300' : 'text-slate-500'}`}>
              {provider.capabilities.oauth ? (
                <span className="text-emerald-400">✓</span>
              ) : (
                <span className="text-slate-600">✕</span>
              )}
              <span>OAuth Flow</span>
            </div>
            <div className={`flex items-center gap-1.5 text-[11px] ${provider.capabilities.inventorySync ? 'text-slate-300' : 'text-slate-500'}`}>
              {provider.capabilities.inventorySync ? (
                <span className="text-emerald-400">✓</span>
              ) : (
                <span className="text-slate-600">✕</span>
              )}
              <span>Sync Stok</span>
            </div>
            <div className={`flex items-center gap-1.5 text-[11px] ${provider.capabilities.orderSync ? 'text-slate-300' : 'text-slate-500'}`}>
              {provider.capabilities.orderSync ? (
                <span className="text-emerald-400">✓</span>
              ) : (
                <span className="text-slate-600">✕</span>
              )}
              <span>Tarik Pesanan</span>
            </div>
            <div className={`flex items-center gap-1.5 text-[11px] ${provider.capabilities.webhook ? 'text-slate-300' : 'text-slate-500'}`}>
              {provider.capabilities.webhook ? (
                <span className="text-emerald-400">✓</span>
              ) : (
                <span className="text-slate-600">✕</span>
              )}
              <span>Webhook</span>
            </div>
          </div>
        </div>

        {/* Benefits list */}
        <div className="mt-3.5 space-y-1.5">
          {provider.benefits.map((benefit, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
              <span className={`shrink-0 mt-0.5 ${isReady ? 'text-indigo-400' : 'text-slate-600'}`}>
                &bull;
              </span>
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-5 pt-3 border-t border-[#222C3E]">
        {isConnected ? (
          <button
            type="button"
            onClick={handleConnect}
            className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/20 cursor-pointer"
          >
            Kelola Koneksi & Sync
          </button>
        ) : isReady ? (
          <button
            type="button"
            onClick={handleConnect}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            Hubungkan Toko
          </button>
        ) : isRequiresApproval ? (
          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-slate-800/80 border border-amber-500/20 px-4 py-2.5 text-xs font-semibold text-amber-400/80 cursor-not-allowed text-center"
          >
            Menunggu Persetujuan Partner
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/60 px-4 py-2.5 text-xs font-semibold text-slate-500 cursor-not-allowed text-center"
          >
            Connector Belum Diimplementasikan
          </button>
        )}
      </div>
    </motion.div>
  )
}
