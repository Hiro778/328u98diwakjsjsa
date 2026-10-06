import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../../services/notificationService'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import { canDeleteOrder, deleteCompletedOrder, createPosOrder, merchantProcessOrder, merchantCompleteOrder } from '../../../services/posService'
// confirmQrisPayment removed — QRIS payment confirmation now handled atomically by merchantProcessOrder RPC (@11.md)
import { getReceiptSettings } from '../../../services/receiptSettingsService'
import ReceiptView from '../../../components/pos/ReceiptView'
import BusinessQrisSettings from '../../../components/pos/BusinessQrisSettings'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'

const ORDER_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Baru' },
  { key: 'diproses', label: 'Diproses' },
  { key: 'selesai', label: 'Selesai' },
]

export default function POSPage() {
  const { business, profile } = useAuth()
  const { toast, showToast } = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [receiptSettings, setReceiptSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)
  const checkoutRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  )

  // Cart state
  const [cart, setCart] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [discountType, setDiscountType] = useState('')
  const [discountValue, setDiscountValue] = useState(0)

  // UI state
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [activeTab, setActiveTab] = useState('pending')
  const [showReceipt, setShowReceipt] = useState(null)
  const [processingOrder, setProcessingOrder] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [deletingOrder, setDeletingOrder] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // PAYMENT AUTHORITY (@11.md): qrisConfirmOrder/qrisConfirmLoading state removed.
  // QRIS payment is confirmed atomically via merchantProcessOrder RPC when POS/Kasir clicks "Proses".
  const [showQrisSettingsModal, setShowQrisSettingsModal] = useState(false)
  const [mobileTab, setMobileTab] = useState('catalog') // 'catalog' | 'cart'

  useEffect(() => {
    if (business?.id) {
      loadProducts()
      loadTables()
      loadOrders()
      loadReceiptSettings()
    }
  }, [business?.id])

  async function loadReceiptSettings() {
    try {
      const data = await getReceiptSettings(business.id, business)
      setReceiptSettings(data)
    } catch (err) {
      console.warn('[POS] Error loading receipt settings:', err)
    }
  }

  // Real-time order updates
  useEffect(() => {
    if (!business?.id) return

    // Clean up any stale channels before subscribing to avoid 'cannot add postgres_changes callbacks after subscribe()'
    if (typeof supabase.getChannels === 'function') {
      const channels = supabase.getChannels() || []
      ;['pos-orders', 'pos-inventory-realtime'].forEach((name) => {
        const existing = channels.find(
          (c) => c && (c.topic === `realtime:${name}` || c.topic === name || c.subTopic === name)
        )
        if (existing) {
          try {
            if (typeof supabase.removeChannel === 'function') {
              supabase.removeChannel(existing)
            }
          } catch {}
          try {
            if (supabase.realtime && Array.isArray(supabase.realtime.channels)) {
              supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== existing)
            }
          } catch {}
          try {
            if (supabase.realtime && typeof supabase.realtime._remove === 'function') {
              supabase.realtime._remove(existing)
            }
          } catch {}
          try {
            if (typeof existing.teardown === 'function') {
              existing.teardown()
            }
          } catch {}
        }
      })
    }

    let channel = null
    let invChannel = null

    try {
      channel = supabase
        .channel('pos-orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `business_id=eq.${business.id}`,
          },
          (payload) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              loadOrders()
              loadProducts()
              if (payload.eventType === 'INSERT') {
                showToast('Pesanan baru masuk!', 'info')
              }
            }, 300)
          }
        )
        .subscribe()

      invChannel = supabase
        .channel('pos-inventory-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'inventory',
          },
          () => {
            loadProducts()
          }
        )
        .subscribe()
    } catch (realtimeErr) {
      console.warn('[PosPage] Realtime subscription error (graceful fallback):', realtimeErr)
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {}
      }
      if (invChannel) {
        try {
          supabase.removeChannel(invChannel)
        } catch {}
      }
    }
  }, [business?.id])

  async function loadProducts() {
    const [{ data: prodData }, { data: catData }] = await Promise.all([
      supabase
        .from('products')
        .select('*, inventory ( quantity )')
        .eq('business_id', business.id)
        .eq('is_available', true)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_categories')
        .select('name')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
    ])
    setProducts(prodData || [])

    const names = [
      ...new Set([
        ...(catData || []).map(c => c.name?.trim()).filter(Boolean),
        ...(prodData || []).map(p => p.category?.trim()).filter(Boolean)
      ])
    ]
    setCategories(names.sort())

    setLoading(false)
  }

  async function loadTables() {
    const { data } = await supabase
      .from('tables')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    setTables(data || [])
  }

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*), table:tables(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setOrders(data || [])
  }

  // Cart functions
  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id)
      if (existing) {
        return prev.map(c =>
          c.product_id === product.id
            ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unit_price }
            : c
        )
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.unit_price,
        subtotal: product.unit_price,
      }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev => {
      return prev.map(c => {
        if (c.product_id !== productId) return c
        const newQty = c.quantity + delta
        if (newQty <= 0) return null
        return { ...c, quantity: newQty, subtotal: newQty * c.unit_price }
      }).filter(Boolean)
    })
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  const cartSubtotal = cart.reduce((sum, c) => sum + c.subtotal, 0)
  const discountAmount = discountType === 'percent'
    ? cartSubtotal * (discountValue / 100)
    : discountType === 'nominal'
      ? Math.min(discountValue, cartSubtotal)
      : 0
  const cartTotal = cartSubtotal - discountAmount

  // Submit order — atomic & idempotent via createPosOrder
  async function handleSubmitOrder() {
    if (cart.length === 0 || processingOrder) return
    setProcessingOrder(true)

    try {
      const tableObj = tables.find(t => t.name === selectedTable)
      const reqId = checkoutRequestIdRef.current

      const { order, idempotent } = await createPosOrder({
        businessId: business.id,
        items: cart,
        tableId: tableObj?.id || null,
        customerId: selectedCustomerId || null,
        discountType,
        discountValue,
        paymentMethod: 'cash', // payment_method: 'cash' per POS contract
        checkoutRequestId: reqId,
      })

      // Generate a new idempotency key for subsequent checkout
      checkoutRequestIdRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // Reset cart and UI only upon confirmed success
      setCart([])
      setSelectedTable('')
      setDiscountType('')
      setDiscountValue(0)
      setSelectedCustomerId(null)
      showToast(
        idempotent ? 'Pesanan sudah tercatat sebelumnya.' : 'Pesanan berhasil dibuat!',
        'success'
      )

      // Create persistent notification
      try {
        const totalFmt = Number(order.total || 0).toLocaleString('id-ID')
        const tableLabel = tableObj?.name ? ` (Meja ${tableObj.name})` : ''
        await createNotification({
          business_id: business.id,
          title: 'Pesanan Baru Masuk',
          message: `Pesanan #${order.order_number || ''}${tableLabel} sebesar Rp ${totalFmt} berhasil dibuat.`,
          category: 'order',
          priority: 'high',
          action_url: '/dashboard/pos',
          dedup_key: `order_created_${order.id}`,
        })
      } catch (notifErr) {
        console.warn('[POS] Notification creation caught:', notifErr)
      }

      await loadOrders()
    } catch (err) {
      console.error('[POS] Submit order error:', err)
      showToast(err.message || 'Gagal membuat pesanan. Coba lagi.', 'error')
    } finally {
      setProcessingOrder(false)
    }
  }

  // Process order (Atomic: QRIS payment confirmed if pending + order status -> diproses)
  async function handleProcessOrder(orderId) {
    const res = await merchantProcessOrder(orderId)
    if (!res.success) {
      showToast(res.error?.message || 'Gagal memproses pesanan.', 'error')
      return
    }
    showToast('Pesanan mulai diproses.', 'success')
    loadOrders()
  }

  // Complete order (Order status -> selesai)
  async function handleCompleteOrder(orderId) {
    const res = await merchantCompleteOrder(orderId)
    if (!res.success) {
      showToast(res.error?.message || 'Gagal menyelesaikan pesanan.', 'error')
      return
    }
    showToast('Pesanan berhasil diselesaikan.', 'success')
    loadOrders()
  }

  // Update order status (for other transitions like dibatalkan)
  async function updateOrderStatus(orderId, status) {
    const { error } = await supabase
      .from('orders')
      .update({ order_status: status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) {
      showToast('Gagal mengubah status pesanan.', 'error')
      return
    }
    loadOrders()
  }

  // PAYMENT AUTHORITY (@11.md):
  // Perubahan payment_status HANYA melalui RPC server-side (merchantProcessOrder / merchantCompleteOrder).
  // Direct client-side update payment_status DILARANG — dihapus per 11.md requirement #1 dan #2.
  // confirmPayment legacy dihapus — mutasi payment_status dilakukan via server-side RPC.
  // Semua konfirmasi pembayaran (cash maupun QRIS) cukup melalui handleProcessOrder() → merchantProcessOrder RPC.

  // Delete completed order from POS history
  async function handleConfirmDelete() {
    if (!deletingOrder || !business?.id) return

    setDeleteLoading(true)
    try {
      await deleteCompletedOrder(deletingOrder.id, business.id)
      setOrders(prev => prev.filter(o => o.id !== deletingOrder.id))
      showToast('Pesanan berhasil dihapus dari riwayat.', 'success')
      setDeletingOrder(null)
      loadOrders()
    } catch (err) {
      console.error('[POS] Delete order error:', err)
      showToast(err.message || 'Gagal menghapus pesanan.', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }



  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCategory = filterCategory === 'all' || p.category === filterCategory
    return matchSearch && matchCategory
  })

  // Filtered orders
  const filteredOrders = orders.filter(o =>
    activeTab === 'all' || o.order_status === activeTab
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row max-lg:min-h-[calc(100dvh-64px)] lg:h-[calc(100vh-64px)] gap-0 w-full min-w-0">
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />

      {/* Mobile Tab Switcher (< lg) */}
      <div className="lg:hidden shrink-0 flex items-center justify-around border-b border-border bg-surface px-2 py-2 shadow-2xs gap-2">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            mobileTab === 'catalog'
              ? 'bg-warm-400 text-white shadow-xs'
              : 'text-text-secondary hover:bg-cream border border-border/50'
          }`}
        >
          <span>🛍️</span>
          <span>Katalog Produk</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            mobileTab === 'cart'
              ? 'bg-warm-400 text-white shadow-xs'
              : 'text-text-secondary hover:bg-cream border border-border/50'
          }`}
        >
          <span>🛒</span>
          <span>Pesanan ({cart.reduce((s, i) => s + (i.quantity || 1), 0)})</span>
        </button>
      </div>

      {/* Left: Products */}
      <div className={`w-full flex-1 flex-col border-r border-border min-w-0 ${mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="border-b border-border p-3 sm:p-4">
          <BackButton fallbackUrl="/dashboard" label="Kembali" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h1 className="text-base sm:text-lg font-extrabold text-navy-700">POS / Kasir</h1>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Link
                to="/dashboard/pos/receipt-settings"
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-navy-700 transition-colors shadow-2xs"
                title="Atur profil toko dan format struk"
              >
                <svg className="h-3.5 w-3.5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Pengaturan Struk
              </Link>
              <button
                type="button"
                onClick={() => setShowQrisSettingsModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-navy-700 transition-colors shadow-2xs"
                title="Kelola QRIS toko merchant"
              >
                <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                QRIS Toko
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk..."
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterCategory('all')}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold transition-colors ${
                filterCategory === 'all'
                  ? 'bg-navy-700 text-white'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              Semua
            </button>
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold transition-colors ${
                  filterCategory === c
                    ? 'bg-navy-700 text-white'
                    : 'bg-surface border border-border text-text-secondary'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="h-10 w-10 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="mt-3 text-sm font-semibold text-navy-700">Produk tidak ditemukan</p>
              <p className="mt-1 text-xs text-text-muted">Coba kata kunci atau kategori lain.</p>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map(p => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="flex flex-col items-center rounded-xl border border-border bg-surface p-3 text-center transition-all hover:border-warm-200 hover:shadow-sm active:scale-[0.97]"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-cream">
                    <svg className="h-6 w-6 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  </div>
                )}
                <p className="mt-2 text-xs font-bold text-navy-700 truncate w-full">{p.name}</p>
                <div className="flex items-center justify-between w-full mt-1">
                  <p className="text-[10px] font-bold text-warm-500">{formatCurrency(p.unit_price)}</p>
                  <span className={`text-[10px] font-medium px-1 rounded ${
                    (p.inventory?.[0]?.quantity ?? p.inventory?.quantity ?? 0) <= 0
                      ? 'text-red-600 bg-red-50'
                      : 'text-text-muted bg-slate-50'
                  }`}>
                    Stok: {p.inventory?.[0]?.quantity ?? p.inventory?.quantity ?? 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* Right: Cart + Orders */}
      <div className={`w-full lg:w-[380px] flex-col bg-surface shrink-0 min-w-0 ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
        {/* Cart */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-700">Pesanan</h2>
            {cart.length > 0 && (
              <button
                onClick={() => { setCart([]); setDiscountType(''); setDiscountValue(0) }}
                className="text-xs text-red-500"
              >
                Reset
              </button>
            )}
          </div>

          {/* Table select */}
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {tables.slice(0, 8).map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTable(selectedTable === t.name ? '' : t.name)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  selectedTable === t.name
                    ? 'bg-warm-400 text-white'
                    : 'bg-cream text-text-secondary hover:bg-cream-dark'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-text-muted">Belum ada pesanan.</p>
            ) : (
              cart.map(c => (
                <div key={c.product_id} className="flex items-center gap-2 rounded-lg bg-cream px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-navy-700 truncate">{c.product_name}</p>
                    <p className="text-[10px] text-text-muted">{formatCurrency(c.unit_price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(c.product_id, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs text-text-muted hover:bg-surface"
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-xs font-bold">{c.quantity}</span>
                    <button
                      onClick={() => updateQty(c.product_id, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs text-text-muted hover:bg-surface"
                    >
                      +
                    </button>
                  </div>
                  <p className="w-16 text-right text-xs font-bold text-navy-700">{formatCurrency(c.subtotal)}</p>
                </div>
              ))
            )}
          </div>

          {/* Discount */}
          {cart.length > 0 && (
            <div className="mt-3 flex gap-2">
              <select
                value={discountType}
                onChange={(e) => { setDiscountType(e.target.value); setDiscountValue(0) }}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-navy-700"
              >
                <option value="">Tanpa Diskon</option>
                <option value="nominal">Nominal (Rp)</option>
                <option value="percent">Persen (%)</option>
              </select>
              {discountType && (
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  min="0"
                  max={discountType === 'percent' ? 100 : cartSubtotal}
                  placeholder={discountType === 'percent' ? '%' : 'Rp'}
                  className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Totals */}
          {cart.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-border pt-3">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(cartSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Diskon</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-navy-700">
                <span>Total</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <button
              onClick={handleSubmitOrder}
              disabled={processingOrder}
              className="mt-3 w-full rounded-xl bg-warm-400 py-3 text-sm font-bold text-white transition-all hover:shadow-md disabled:opacity-60"
            >
              {processingOrder ? 'Memproses...' : 'Buat Pesanan'}
            </button>
          )}
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-hidden">
          <div className="flex gap-1 border-b border-border px-4 pt-2 overflow-x-auto">
            {ORDER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-t-lg px-3 py-2 text-[10px] font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-warm-50 text-warm-500 border-b-2 border-warm-400'
                    : 'text-text-muted hover:text-navy-700'
                }`}
              >
                {tab.label}
                {tab.key !== 'all' && (
                  <span className="ml-1">
                    {orders.filter(o => o.order_status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ maxHeight: 'calc(100vh - 500px)' }}>
            {filteredOrders.length === 0 ? (
              <p className="py-8 text-center text-xs text-text-muted">Tidak ada pesanan.</p>
            ) : (
              filteredOrders.map(o => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onStatusChange={updateOrderStatus}
                  onProcess={handleProcessOrder}
                  onComplete={handleCompleteOrder}
                  onViewReceipt={setShowReceipt}
                  onDeleteOrder={setDeletingOrder}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceipt && (
          <ReceiptView
            order={showReceipt}
            settings={receiptSettings || {}}
            business={business}
            cashierName={profile?.full_name || 'Kasir'}
            isModal={true}
            onClose={() => setShowReceipt(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-xs p-5"
            onClick={() => !deleteLoading && setDeletingOrder(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-navy-700">Hapus pesanan ini?</h2>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                Pesanan <span className="font-mono font-bold text-navy-700">#{deletingOrder.order_number}</span> akan dihapus dari riwayat POS. Tindakan ini tidak dapat dibatalkan.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingOrder(null)}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-cream disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteLoading}
                  className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-60 shadow-xs"
                >
                  {deleteLoading ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QRIS Payment Confirmation Modal removed (@11.md):
          QRIS payment is confirmed atomically via merchantProcessOrder RPC when POS/Kasir clicks "Proses".
          No separate confirmation modal is needed. */}

      {/* QRIS Merchant Settings Modal */}
      <AnimatePresence>
        {showQrisSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border shadow-xl p-4 relative"
            >
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setShowQrisSettingsModal(false)}
                  className="rounded-lg p-1.5 text-text-muted hover:text-navy-700 hover:bg-cream transition-colors"
                  aria-label="Tutup pengaturan QRIS"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <BusinessQrisSettings
                businessId={business?.id}
                onToast={showToast}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function OrderCard({ order, onStatusChange, onProcess, onComplete, onViewReceipt, onDeleteOrder }) {
  const statusColors = {
    pending: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    diproses: 'bg-blue-50 text-blue-600 border-blue-200',
    selesai: 'bg-surface text-text-muted border-border',
    dibatalkan: 'bg-red-50 text-red-500 border-red-200',
    // Legacy statuses for backward compat
    siap: 'bg-profit-50 text-profit-600 border-profit-200',
    confirmed: 'bg-blue-50 text-blue-600 border-blue-200',
    preparing: 'bg-purple-50 text-purple-600 border-purple-200',
    ready: 'bg-profit-50 text-profit-600 border-profit-200',
    completed: 'bg-surface text-text-muted border-border',
    cancelled: 'bg-red-50 text-red-500 border-red-200',
  }

  const statusLabels = {
    pending: 'MENUNGGU',
    diproses: 'DIPROSES',
    selesai: 'SELESAI',
    dibatalkan: 'DIBATALKAN',
    // Legacy statuses for backward compat
    siap: 'SIAP',
    confirmed: 'DIKONFIRMASI',
    preparing: 'DIPROSES',
    ready: 'SIAP',
    completed: 'SELESAI',
    cancelled: 'DIBATALKAN',
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-navy-700">
            #{order.order_number}{order.customer_name ? ` — ${order.customer_name}` : ''}
          </p>
          {order.table && (
            <p className="text-[10px] text-text-muted">{order.table.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusColors[order.order_status] || ''}`}>
            {statusLabels[order.order_status] || order.order_status}
          </span>
          {(order.payment_method || '').toLowerCase() === 'qris' && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
              order.payment_status === 'paid'
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-warm-50 text-warm-600 border-warm-200'
            }`}>
              {order.payment_status === 'paid' ? 'QRIS: LUNAS' : 'QRIS: MENUNGGU'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        {(order.items || []).map(item => (
          <p key={item.id} className="text-[11px] text-text-secondary">
            {item.quantity}x {item.product_name}
          </p>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <p className="text-xs font-bold text-warm-500">{formatCurrency(order.total)}</p>
        <div className="flex gap-1 flex-wrap justify-end">
          {/* BARU / PENDING: Merchant clicks Proses or Batal */}
          {(order.order_status === 'pending' || order.order_status === 'baru') && (
            <>
              <button
                onClick={() => onProcess(order.id)}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-[9px] font-bold text-white shadow-2xs transition-colors"
                title="Proses pesanan"
              >
                Proses
              </button>
              <button
                onClick={() => onStatusChange(order.id, 'dibatalkan')}
                className="rounded-lg bg-red-50 hover:bg-red-100 px-2.5 py-1 text-[9px] font-bold text-red-500 transition-colors"
              >
                Batal
              </button>
            </>
          )}

          {/* DIPROSES: Merchant clicks Selesai or Batal */}
          {order.order_status === 'diproses' && (
            <>
              <button
                onClick={() => onComplete(order.id)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[9px] font-bold text-white shadow-2xs transition-colors"
              >
                Selesai
              </button>
              <button
                onClick={() => onStatusChange(order.id, 'dibatalkan')}
                className="rounded-lg bg-red-50 hover:bg-red-100 px-2.5 py-1 text-[9px] font-bold text-red-500 transition-colors"
              >
                Batal
              </button>
            </>
          )}

          {/* Legacy historical statuses (siap / ready / preparing) — safe transitions only, NO payment mutation */}
          {(order.order_status === 'siap' || order.order_status === 'ready') && (
            <button
              onClick={() => onComplete(order.id)}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[9px] font-bold text-white shadow-2xs transition-colors"
            >
              Selesai
            </button>
          )}
          {order.order_status === 'confirmed' && (
            <button
              onClick={() => onProcess(order.id)}
              className="rounded-lg bg-blue-600 px-2 py-1 text-[9px] font-bold text-white"
            >
              Proses
            </button>
          )}
          {order.order_status === 'preparing' && (
            <button
              onClick={() => onComplete(order.id)}
              className="rounded-lg bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white"
            >
              Selesai
            </button>
          )}

          {/* View receipt if paid */}
          {order.payment_status === 'paid' && (
            <button
              onClick={() => onViewReceipt(order)}
              className="rounded-lg bg-cream px-2 py-1 text-[9px] font-semibold text-text-secondary"
            >
              Struk
            </button>
          )}

          {/* Action Hapus: ONLY for completed / selesai orders per struk.md */}
          {canDeleteOrder(order) && (
            <button
              onClick={() => onDeleteOrder(order)}
              className="rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-2 py-1 text-[9px] font-bold transition-colors"
              title="Hapus pesanan selesai"
            >
              Hapus
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

