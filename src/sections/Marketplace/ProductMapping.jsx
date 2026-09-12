import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  getMarketplaceProducts,
  syncProducts,
  linkProduct,
  importProduct,
} from '../../lib/marketplaceService'
import { getProductsByBusiness } from '../../lib/productService'
import { useAuth } from '../../context/AuthContext'

export default function ProductMapping({ connections }) {
  const { business } = useAuth()
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [marketplaceProducts, setMarketplaceProducts] = useState([])
  const [localProducts, setLocalProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')

  const connectedList = connections.filter((c) => c.status === 'connected')

  useEffect(() => {
    if (connectedList.length > 0 && !selectedConnection) {
      setSelectedConnection(connectedList[0].id)
    }
  }, [connectedList, selectedConnection])

  const loadData = useCallback(async () => {
    if (!selectedConnection) return
    setLoading(true)
    const [mpProducts, local] = await Promise.all([
      getMarketplaceProducts(selectedConnection),
      business?.id ? getProductsByBusiness(business.id) : [],
    ])
    setMarketplaceProducts(mpProducts)
    setLocalProducts(local)
    setLoading(false)
  }, [selectedConnection, business?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSync() {
    if (!selectedConnection) return
    setSyncing(true)
    await syncProducts(selectedConnection, 'pull')
    await loadData()
    setSyncing(false)
  }

  async function handleLink(mappingId, localProductId) {
    await linkProduct(mappingId, localProductId || null)
    await loadData()
  }

  async function handleImport(mappingId) {
    await importProduct(mappingId)
    await loadData()
  }

  const filtered = marketplaceProducts.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.marketplace_name?.toLowerCase().includes(q) ||
      p.marketplace_sku?.toLowerCase().includes(q)
    )
  })

  if (connectedList.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-muted">Hubungkan marketplace terlebih dahulu untuk menyinkronkan produk.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedConnection || ''}
          onChange={(e) => setSelectedConnection(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        >
          {connectedList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shop_name || c.marketplace}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk..."
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-warm-300 focus:outline-none focus:ring-2 focus:ring-warm-200/50"
        />

        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-50"
        >
          {syncing ? 'Sync...' : 'Tarik Produk'}
        </button>
      </div>

      {/* Product Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {loading ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-text-muted">
              {marketplaceProducts.length === 0
                ? 'Belum ada produk dari marketplace. Klik "Tarik Produk" untuk sync.'
                : 'Produk tidak ditemukan.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-cream">
                  <th className="px-4 py-3 font-semibold text-navy-700">Produk Marketplace</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">SKU</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Harga</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Stok</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-navy-700">Mapping</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.marketplace_image_url && (
                          <img
                            src={p.marketplace_image_url}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-navy-700">{p.marketplace_name}</p>
                          {p.marketplace_category && (
                            <p className="text-xs text-text-muted">{p.marketplace_category}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{p.marketplace_sku || '-'}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      Rp{(p.marketplace_price || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{p.marketplace_stock}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.sync_status === 'synced'
                            ? 'bg-profit-100 text-profit-600'
                            : p.sync_status === 'error'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-navy-50 text-navy-300'
                        }`}
                      >
                        {p.sync_status === 'synced'
                          ? 'Synced'
                          : p.sync_status === 'error'
                            ? 'Error'
                            : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.local_product_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-profit-600 font-semibold">Linked</span>
                          <button
                            onClick={() => handleLink(p.id, null)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Unlink
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            onChange={(e) => e.target.value && handleLink(p.id, e.target.value)}
                            className="rounded-lg border border-border bg-cream px-2 py-1 text-xs focus:outline-none"
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Pilih produk lokal
                            </option>
                            {localProducts.map((lp) => (
                              <option key={lp.id} value={lp.id}>
                                {lp.name} ({lp.sku || 'no SKU'})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleImport(p.id)}
                            className="text-xs text-electric-600 hover:underline"
                          >
                            Import
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
