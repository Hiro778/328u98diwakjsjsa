import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import ConnectionCard from './ConnectionCard'
import ConnectionModal from './ConnectionModal'
import MarketplaceDashboard from './MarketplaceDashboard'
import ProductMapping from './ProductMapping'
import OrderSync from './OrderSync'
import SyncLogs from './SyncLogs'
import { getMarketplaceStatus } from '../../lib/marketplaceService'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'products', label: 'Produk' },
  { key: 'orders', label: 'Pesanan' },
  { key: 'logs', label: 'Log Sync' },
]

export default function MarketplacePage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedMarketplace, setSelectedMarketplace] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    const data = await getMarketplaceStatus()
    setStatus(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus, refreshKey])

  function handleConnect(marketplaceKey) {
    setSelectedMarketplace(marketplaceKey)
    setModalOpen(true)
  }

  function handleCloseModal() {
    setModalOpen(false)
    setSelectedMarketplace(null)
  }

  function handleConnectionSuccess() {
    setRefreshKey((k) => k + 1)
  }

  const connections = status?.connections || []
  const stats = status?.stats || {}
  const connectedCount = stats.connected_count || 0
  const totalMarketplaces = stats.total_marketplaces || 3

  // Build connection map for cards
  const connectionMap = {}
  connections.forEach((c) => {
    connectionMap[c.marketplace] = c
  })

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-warm-400">
          Operasional
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">Marketplace Integration</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Hubungkan dan kelola toko online Anda dari satu tempat.
        </p>
      </motion.div>

      {/* Status Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy-700">Status Koneksi</h2>
            <p className="text-sm text-text-secondary">
              {connectedCount === 0
                ? 'Belum ada marketplace yang terhubung'
                : `${connectedCount} dari ${totalMarketplaces} marketplace terhubung`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-extrabold text-navy-700">{connectedCount}</span>
            <span className="text-sm text-text-muted">/{totalMarketplaces}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-cream">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalMarketplaces > 0 ? (connectedCount / totalMarketplaces) * 100 : 0}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-profit-500"
          />
        </div>
      </motion.div>

      {/* Marketplace Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['shopee', 'tokopedia', 'tiktokshop'].map((key) => (
          <ConnectionCard
            key={key}
            marketplaceKey={key}
            connection={connectionMap[key]}
            onConnect={handleConnect}
          />
        ))}
      </div>

      {/* Tabs - Only show when at least one marketplace is connected */}
      {connectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8"
        >
          {/* Tab Navigation */}
          <div className="flex gap-1 rounded-xl border border-border bg-cream p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeTab === tab.key
                    ? 'bg-surface text-navy-700 shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'dashboard' && <MarketplaceDashboard stats={stats} logs={status?.recent_logs} />}
            {activeTab === 'products' && <ProductMapping connections={connections} />}
            {activeTab === 'orders' && <OrderSync connections={connections} />}
            {activeTab === 'logs' && <SyncLogs />}
          </div>
        </motion.div>
      )}

      {/* Info Section - Show when not connected */}
      {connectedCount === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 rounded-2xl border border-border bg-surface p-6"
        >
          <h3 className="text-lg font-bold text-navy-700">Mengapa Mengintegrasikan Marketplace?</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-profit-50">
                <svg className="h-5 w-5 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-navy-700">Satu Dashboard</h4>
                <p className="text-sm text-text-secondary">Kelola semua toko dari satu tempat</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-50">
                <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-navy-700">Real-time Sync</h4>
                <p className="text-sm text-text-secondary">Stok dan harga terupdate otomatis</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric-50">
                <svg className="h-5 w-5 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-navy-700">Hemat Waktu</h4>
                <p className="text-sm text-text-secondary">Tidak perlu login ke banyak platform</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-navy-700">Kurangi Human Error</h4>
                <p className="text-sm text-text-secondary">Eliminasi input manual yang berulang</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Connection Modal */}
      <ConnectionModal
        show={modalOpen}
        marketplaceKey={selectedMarketplace}
        onClose={handleCloseModal}
        onSuccess={handleConnectionSuccess}
      />
    </div>
  )
}
