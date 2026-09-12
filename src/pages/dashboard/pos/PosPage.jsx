import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { formatCurrency } from '../../../lib/orderNumber'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'

const ORDER_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Baru' },
  { key: 'diproses', label: 'Diproses' },
  { key: 'siap', label: 'Siap' },
  { key: 'selesai', label: 'Selesai' },
]

export default function POSPage() {
  const { business } = useAuth()
  const { toast, showToast } = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef(null)

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

  useEffect(() => {
    if (business?.id) {
      loadProducts()
      loadTables()
      loadOrders()
    }
  }, [business?.id])

  // Real-time order updates
  useEffect(() => {
    if (!business?.id) return

    const channel = supabase
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
            if (payload.eventType === 'INSERT') {
              showToast('Pesanan baru masuk!', 'info')
            }
          }, 300)
        }
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [business?.id])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_available', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    setProducts(data || [])

    // Derive categories from products
    const names = [...new Set((data || []).map(p => p.category).filter(Boolean))]
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

  // Submit order — atomic: order + items inserted in one relational insert
  async function handleSubmitOrder() {
    if (cart.length === 0 || processingOrder) return
    setProcessingOrder(true)

    const tableObj = tables.find(t => t.name === selectedTable)

    // Server-side price validation: fetch current product prices
    const productIds = cart.map(c => c.product_id)
    const { data: currentProducts } = await supabase
      .from('products')
      .select('id, unit_price')
      .in('id', productIds)

    const priceMap = {}
    for (const p of (currentProducts || [])) {
      priceMap[p.id] = Number(p.unit_price)
    }

    // Recalculate using server-side prices
    const validatedItems = cart.map(c => {
      const serverPrice = priceMap[c.product_id] ?? c.unit_price
      return {
        product_id: c.product_id,
        product_name: c.product_name,
        quantity: c.quantity,
        unit_price: serverPrice,
        subtotal: serverPrice * c.quantity,
      }
    })

    const serverSubtotal = validatedItems.reduce((s, i) => s + i.subtotal, 0)
    const serverDiscount = discountType === 'percent'
      ? serverSubtotal * (discountValue / 100)
      : discountType === 'nominal'
        ? Math.min(discountValue, serverSubtotal)
        : 0
    const serverTotal = serverSubtotal - serverDiscount

    // Atomic insert: order + order_items in one relational insert
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        business_id: business.id,
        table_id: tableObj?.id || null,
        order_source: 'pos',
        order_status: 'pending',
        payment_method: 'cash',
        payment_status: 'pending',
        subtotal: serverSubtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: serverDiscount,
        total: serverTotal,
        order_items: validatedItems,
      })
      .select()
      .single()

    if (orderErr) {
      showToast('Gagal membuat pesanan. Coba lagi.', 'error')
      setProcessingOrder(false)
      return
    }

    // Reset
    setCart([])
    setSelectedTable('')
    setDiscountType('')
    setDiscountValue(0)
    setProcessingOrder(false)
    showToast('Pesanan berhasil dibuat!', 'success')
    loadOrders()
  }

  // Update order status
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

  // Confirm payment
  async function confirmPayment(orderId) {
    const { error: orderErr } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'cash',
        order_status: 'selesai',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (orderErr) {
      showToast('Gagal memproses pembayaran.', 'error')
      return
    }

    // Create payment record
    const order = orders.find(o => o.id === orderId)
    if (order) {
      await supabase.from('payments').insert({
        order_id: orderId,
        business_id: business.id,
        payment_provider: 'manual',
        payment_method: 'cash',
        gross_amount: order.total,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
      })

      // Insert into sales for dashboard integration
      for (const item of (order.items || [])) {
        let salesData = {
          business_id: business.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.subtotal,
          sale_date: new Date().toISOString().split('T')[0],
          notes: `POS Order #${order.order_number}`,
        }

        // Add customer_id if a customer is selected (not walk-in)
        // customer_id will be null for walk-in transactions
        // Only set if customer_id exists and belongs to this business
        if (selectedCustomerId && selectedCustomerId !== 'walk-in') {
          // Verify customer belongs to this business via auth context
          salesData.customer_id = selectedCustomerId
        }

        await supabase.from('sales').insert(salesData)
      }
    }

    loadOrders()
    showToast('Pembayaran berhasil!', 'success')
    setShowReceipt(order)
  }

  // Filtered products
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
    <div className="flex h-[calc(100vh-64px)] gap-0">
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />
      {/* Left: Products */}
      <div className="flex flex-1 flex-col border-r border-border">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-extrabold text-navy-700">POS / Kasir</h1>
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
                <p className="text-[10px] font-bold text-warm-500">{formatCurrency(p.unit_price)}</p>
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* Right: Cart + Orders */}
      <div className="flex w-[380px] flex-col bg-surface">
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
                  onPayment={confirmPayment}
                  onViewReceipt={setShowReceipt}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceipt && (
          <ReceiptModal order={showReceipt} onClose={() => setShowReceipt(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function OrderCard({ order, onStatusChange, onPayment, onViewReceipt }) {
  const statusColors = {
    pending: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    diproses: 'bg-blue-50 text-blue-600 border-blue-200',
    siap: 'bg-profit-50 text-profit-600 border-profit-200',
    selesai: 'bg-surface text-text-muted border-border',
    dibatalkan: 'bg-red-50 text-red-500 border-red-200',
    // Legacy statuses for backward compat
    confirmed: 'bg-blue-50 text-blue-600 border-blue-200',
    preparing: 'bg-purple-50 text-purple-600 border-purple-200',
    ready: 'bg-profit-50 text-profit-600 border-profit-200',
    completed: 'bg-surface text-text-muted border-border',
    cancelled: 'bg-red-50 text-red-500 border-red-200',
  }

  const statusLabels = {
    pending: 'MENUNGGU',
    diproses: 'DIPROSES',
    siap: 'SIAP',
    selesai: 'SELESAI',
    dibatalkan: 'DIBATALKAN',
    // Legacy statuses for backward compat
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
          <p className="text-xs font-bold text-navy-700">#{order.order_number}</p>
          {order.table && (
            <p className="text-[10px] text-text-muted">{order.table.name}</p>
          )}
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusColors[order.order_status] || ''}`}>
          {statusLabels[order.order_status] || order.order_status}
        </span>
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
        <div className="flex gap-1">
          {order.order_status === 'pending' && (
            <>
              <button
                onClick={() => onStatusChange(order.id, 'diproses')}
                className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-600"
              >
                Proses
              </button>
              <button
                onClick={() => onStatusChange(order.id, 'dibatalkan')}
                className="rounded-lg bg-red-50 px-2 py-1 text-[9px] font-bold text-red-500"
              >
                Batal
              </button>
            </>
          )}
          {order.order_status === 'diproses' && (
            <>
              <button
                onClick={() => onStatusChange(order.id, 'siap')}
                className="rounded-lg bg-profit-50 px-2 py-1 text-[9px] font-bold text-profit-600"
              >
                Siap
              </button>
              <button
                onClick={() => onStatusChange(order.id, 'dibatalkan')}
                className="rounded-lg bg-red-50 px-2 py-1 text-[9px] font-bold text-red-500"
              >
                Batal
              </button>
            </>
          )}
          {order.order_status === 'siap' && order.payment_status !== 'paid' && (
            <button
              onClick={() => onPayment(order.id)}
              className="rounded-lg bg-warm-400 px-2 py-1 text-[9px] font-bold text-white"
            >
              Bayar
            </button>
          )}
          {order.payment_status === 'paid' && (
            <button
              onClick={() => onViewReceipt(order)}
              className="rounded-lg bg-cream px-2 py-1 text-[9px] font-semibold text-text-secondary"
            >
              Struk
            </button>
          )}
          {/* Legacy status backward compat */}
          {order.order_status === 'confirmed' && (
            <button
              onClick={() => onStatusChange(order.id, 'preparing')}
              className="rounded-lg bg-purple-50 px-2 py-1 text-[9px] font-bold text-purple-600"
            >
              Dapur
            </button>
          )}
          {order.order_status === 'preparing' && (
            <button
              onClick={() => onStatusChange(order.id, 'siap')}
              className="rounded-lg bg-profit-50 px-2 py-1 text-[9px] font-bold text-profit-600"
            >
              Siap
            </button>
          )}
          {order.order_status === 'ready' && order.payment_status !== 'paid' && (
            <button
              onClick={() => onPayment(order.id)}
              className="rounded-lg bg-warm-400 px-2 py-1 text-[9px] font-bold text-white"
            >
              Bayar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReceiptModal({ order, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="text-center">
          <p className="text-lg font-extrabold text-navy-700">{order.business_name || 'BisnisSehat'}</p>
          <p className="text-xs text-text-muted">Struk Pembayaran</p>
        </div>

        <div className="mt-4 space-y-1 border-t border-dashed border-border pt-4">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">No. Pesanan</span>
            <span className="font-bold text-navy-700">#{order.order_number}</span>
          </div>
          {order.table && (
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Meja</span>
              <span className="font-bold text-navy-700">{order.table.name}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Waktu</span>
            <span className="text-navy-700">{new Date(order.created_at).toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-dashed border-border pt-3">
          {(order.items || []).map(item => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="text-text-secondary">{item.quantity}x {item.product_name}</span>
              <span className="text-navy-700">{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 border-t border-dashed border-border pt-3">
          {order.discount_amount > 0 && (
            <div className="flex justify-between text-xs text-red-500">
              <span>Diskon</span>
              <span>-{formatCurrency(order.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-navy-700">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-text-muted">Pembayaran</span>
            <span className="font-semibold text-navy-700">{order.payment_method === 'cash' ? 'Tunai' : 'Online'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Status</span>
            <span className={`font-bold ${order.payment_status === 'paid' ? 'text-profit-600' : 'text-yellow-600'}`}>
              {order.payment_status === 'paid' ? 'LUNAS' : 'MENUNGGU'}
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-cream"
          >
            Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-warm-400 px-4 py-2.5 text-xs font-bold text-white"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
