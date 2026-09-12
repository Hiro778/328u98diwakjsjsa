import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'

// ── Midtrans Snap Loader ──
let snapScriptLoaded = false
let snapScriptLoading = false

function loadSnapScript() {
  return new Promise((resolve, reject) => {
    if (snapScriptLoaded) { resolve(); return }
    if (snapScriptLoading) {
      const check = setInterval(() => {
        if (snapScriptLoaded) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    snapScriptLoading = true
    const script = document.createElement('script')
    script.src = 'https://app.sandbox.midtrans.com/snap/snap.js'
    script.setAttribute('data-client-key', import.meta.env.VITE_MIDTRANS_CLIENT_KEY || '')
    script.onload = () => { snapScriptLoaded = true; resolve() }
    script.onerror = () => { snapScriptLoading = false; reject(new Error('Failed to load Midtrans Snap')) }
    document.head.appendChild(script)
  })
}

export default function PublicMenuPage() {
  const { businessId } = useParams()
  const [searchParams] = useSearchParams()
  const tableParam = searchParams.get('table') || ''

  const [business, setBusiness] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [selectedTable, setSelectedTable] = useState(tableParam)
  const [ordering, setOrdering] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [orderError, setOrderError] = useState('')

  useEffect(() => {
    loadBusiness()
  }, [businessId])

  useEffect(() => {
    if (business?.id) {
      loadProducts()
      loadTables()
    }
  }, [business?.id])

  useEffect(() => {
    if (tableParam) setSelectedTable(tableParam)
  }, [tableParam])

  async function loadBusiness() {
    const { data, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, slogan, description, cover_url, logo_url, is_menu_published')
      .eq('id', businessId)
      .single()

    if (bizErr || !data) {
      setError('Bisnis tidak ditemukan.')
      setLoading(false)
      return
    }

    if (!data.is_menu_published) {
      setError('Menu bisnis ini belum dipublikasikan.')
      setLoading(false)
      return
    }

    setBusiness(data)
    setLoading(false)
  }

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
    setShowCart(true)
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

  const cartTotal = cart.reduce((sum, c) => sum + c.subtotal, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0)

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory)

  async function handleOrder(paymentMethod) {
    if (cart.length === 0 || ordering) return
    setOrdering(true)
    setOrderError('')

    const tableObj = tables.find(t => t.name === selectedTable)

    // Server-side price validation
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

    // Step 1: Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        business_id: business.id,
        table_id: tableObj?.id || null,
        customer_name: '',
        order_source: 'qr_menu',
        order_status: 'pending',
        payment_method: paymentMethod,
        payment_status: 'pending',
        subtotal: serverSubtotal,
        total: serverSubtotal,
      })
      .select()
      .single()

    if (orderErr) {
      console.error('[QR Menu] Order insert failed:', orderErr)
      setOrderError(orderErr.message || 'Gagal mengirim pesanan. Coba lagi.')
      setOrdering(false)
      return
    }

    // Step 2: Insert order_items
    const itemsToInsert = validatedItems.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }))

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(itemsToInsert)

    if (itemsErr) {
      console.error('[QR Menu] Order items insert failed:', itemsErr)
      setOrderError('Pesanan dibuat tapi item gagal disimpan. Hubungi kasir.')
      setOrdering(false)
      return
    }

    // ── Bayar di Kasir: done, show success ──
    if (paymentMethod === 'cash') {
      setOrderSuccess(order)
      setOrdering(false)
      setShowCheckout(false)
      setCart([])
      return
    }

    // ── Bayar Online: create Midtrans Snap ──
    if (paymentMethod === 'online') {
      try {
        // Call Edge Function to create Snap transaction
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token

        const snapRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/midtrans-create-snap`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ order_id: order.id }),
          },
        )

        const snapData = await snapRes.json()

        if (!snapRes.ok || snapData.error) {
          setOrderError(snapData.error || 'Gagal membuat pembayaran online.')
          setOrdering(false)
          return
        }

        // Load Midtrans Snap JS and open popup
        await loadSnapScript()

        window.snap.pay(snapData.data.snap_token, {
          onSuccess: () => {
            // Payment succeeded — status confirmed via webhook
            setOrderSuccess({ ...order, payment_status: 'paid' })
            setOrdering(false)
            setShowCheckout(false)
            setCart([])
          },
          onPending: () => {
            // Waiting for payment (e.g. bank transfer)
            setOrderSuccess({ ...order, payment_status: 'pending' })
            setOrdering(false)
            setShowCheckout(false)
            setCart([])
          },
          onError: (err) => {
            console.error('[QR Menu] Snap error:', err)
            setOrderError('Pembayaran gagal. Silakan coba lagi.')
            setOrdering(false)
          },
          onClose: () => {
            // User closed popup without paying — order still pending
            setOrderError('Pembayaran dibatalkan. Pesanan masih pending.')
            setOrdering(false)
          },
        })
      } catch (err) {
        console.error('[QR Menu] Online payment error:', err)
        setOrderError('Gagal menghubungi layanan pembayaran.')
        setOrdering(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-5">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-600">
            <span className="text-xl font-extrabold text-white">BS</span>
          </div>
          <p className="mt-6 text-lg font-semibold text-navy-700">{error}</p>
          <p className="mt-2 text-sm text-text-muted">Pastikan link yang kamu buka sudah benar.</p>
        </div>
      </div>
    )
  }

  // Order success view
  if (orderSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-profit-100">
            <svg className="h-8 w-8 text-profit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-6 text-xl font-extrabold text-navy-700">Pesanan Terkirim!</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {orderSuccess.payment_method === 'cash'
              ? 'Silakan bayar di kasir.'
              : 'Silakan selesaikan pembayaran online.'}
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-left">
            <p className="text-xs font-bold text-text-muted uppercase">Nomor Pesanan</p>
            <p className="mt-1 text-lg font-extrabold text-navy-700">#{orderSuccess.order_number || 'BS-NEW'}</p>
            {selectedTable && (
              <>
                <p className="mt-3 text-xs font-bold text-text-muted uppercase">Meja</p>
                <p className="mt-1 text-sm font-bold text-navy-700">{selectedTable}</p>
              </>
            )}
            <p className="mt-3 text-xs font-bold text-text-muted uppercase">Total</p>
            <p className="mt-1 text-lg font-extrabold text-warm-500">{formatCurrency(orderSuccess.total)}</p>
          </div>
          <button
            onClick={() => { setOrderSuccess(null); setSelectedTable(tableParam) }}
            className="mt-6 w-full rounded-xl bg-warm-400 px-6 py-3 text-sm font-bold text-white"
          >
            Kembali ke Menu
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3">
          {business?.logo_url ? (
            <img src={business.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-600">
              <span className="text-xs font-bold text-white">BS</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy-700 truncate">{business?.name}</p>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-warm-400 text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121 0 2.09-.773 2.34-1.872l1.836-8.046A1.125 1.125 0 0018.963 3H5.106" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Hero */}
      {(business?.slogan || business?.cover_url) && (
        <div className="px-4 pt-5 pb-2">
          {business?.cover_url && (
            <div className="overflow-hidden rounded-2xl">
              <img src={business.cover_url} alt="" className="h-40 w-full object-cover sm:h-52" />
            </div>
          )}
          {business?.slogan && (
            <p className="mt-4 text-center text-lg font-extrabold text-navy-700">{business.slogan}</p>
          )}
          {business?.description && (
            <p className="mt-1 text-center text-sm text-text-secondary">{business.description}</p>
          )}
        </div>
      )}

      {/* Table Selection */}
      {!tableParam && tables.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-xs font-bold text-text-muted uppercase">Pilih Meja</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTable('')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedTable === ''
                  ? 'bg-warm-400 text-white'
                  : 'bg-surface border border-border text-text-secondary hover:bg-cream'
              }`}
            >
              Bawa Pulang
            </button>
            {tables.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTable(t.name)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  selectedTable === t.name
                    ? 'bg-warm-400 text-white'
                    : 'bg-surface border border-border text-text-secondary hover:bg-cream'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedTable && (
        <div className="px-4 pt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-3 py-1 text-xs font-semibold text-warm-500">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            {selectedTable}
          </span>
        </div>
      )}

      {/* Category Navigation */}
      <div className="sticky top-[57px] z-30 bg-cream">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              activeCategory === 'all'
                ? 'bg-navy-700 text-white'
                : 'bg-surface border border-border text-text-secondary hover:bg-cream'
            }`}
          >
            Semua
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                activeCategory === c
                  ? 'bg-navy-700 text-white'
                  : 'bg-surface border border-border text-text-secondary hover:bg-cream'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="px-4 pb-32">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-navy-700">Belum ada produk</p>
            <p className="mt-2 text-sm text-text-muted">Menu akan segera tersedia.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredProducts.map(p => (
              <motion.div
                key={p.id}
                layout
                className="flex gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-cream">
                    <svg className="h-6 w-6 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-navy-700 truncate">{p.name}</p>
                    {p.is_best_seller && (
                      <span className="shrink-0 rounded-full bg-warm-50 px-2 py-0.5 text-[9px] font-bold text-warm-500">
                        Best Seller
                      </span>
                    )}
                  </div>
                  {p.slogan && (
                    <p className="mt-0.5 text-[11px] text-text-muted truncate">{p.slogan}</p>
                  )}
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <p className="text-sm font-bold text-warm-500">{formatCurrency(p.unit_price)}</p>
                    <button
                      onClick={() => addToCart(p)}
                      className="flex h-8 items-center gap-1 rounded-lg bg-warm-400 px-3 text-[11px] font-bold text-white transition-all hover:shadow-md"
                    >
                      + Tambah
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Bar */}
      <AnimatePresence>
        {cartCount > 0 && !showCheckout && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface p-4 shadow-lg"
          >
            <button
              onClick={() => { setShowCheckout(true); setOrderError('') }}
              className="flex w-full items-center justify-between rounded-xl bg-warm-400 px-5 py-3 text-white"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                  {cartCount}
                </span>
                <span className="text-sm font-bold">Lihat Pesanan</span>
              </div>
              <span className="text-sm font-bold">{formatCurrency(cartTotal)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-navy-900/40"
            onClick={() => setShowCart(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 h-full w-full max-w-sm bg-surface shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <h2 className="text-lg font-bold text-navy-700">Pesanan Saya</h2>
                <button onClick={() => setShowCart(false)} className="text-text-muted">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                {cart.length === 0 ? (
                  <p className="py-12 text-center text-sm text-text-muted">Belum ada pesanan.</p>
                ) : (
                  <div className="space-y-3">
                    {cart.map(c => (
                      <div key={c.product_id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy-700 truncate">{c.product_name}</p>
                          <p className="text-xs text-text-muted">{formatCurrency(c.unit_price)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(c.product_id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-cream"
                          >
                            -
                          </button>
                          <span className="w-5 text-center text-sm font-bold text-navy-700">{c.quantity}</span>
                          <button
                            onClick={() => updateQty(c.product_id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-cream"
                          >
                            +
                          </button>
                        </div>
                        <p className="w-20 text-right text-sm font-bold text-navy-700">{formatCurrency(c.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="border-t border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-navy-700">Total</p>
                    <p className="text-lg font-extrabold text-warm-500">{formatCurrency(cartTotal)}</p>
                  </div>
                  <button
                    onClick={() => { setShowCart(false); setShowCheckout(true); setOrderError('') }}
                    className="mt-3 w-full rounded-xl bg-warm-400 py-3 text-sm font-bold text-white"
                  >
                    Lanjut Checkout
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout Drawer */}
      <AnimatePresence>
        {showCheckout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-navy-900/40"
            onClick={() => setShowCheckout(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-surface"
            >
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-navy-700">Checkout</h2>
                  <button onClick={() => { setShowCheckout(false); setOrderError('') }} className="text-text-muted">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {selectedTable && (
                  <div className="mb-4 rounded-xl bg-warm-50 px-4 py-2.5 text-sm font-semibold text-warm-500">
                    Meja: {selectedTable}
                  </div>
                )}

                <div className="space-y-2">
                  {cart.map(c => (
                    <div key={c.product_id} className="flex justify-between text-sm">
                      <span className="text-text-secondary">{c.quantity}x {c.product_name}</span>
                      <span className="font-semibold text-navy-700">{formatCurrency(c.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex justify-between">
                    <span className="text-sm font-bold text-navy-700">Total</span>
                    <span className="text-lg font-extrabold text-warm-500">{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                {orderError && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                    {orderError}
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => handleOrder('cash')}
                    disabled={ordering}
                    className="w-full rounded-xl border-2 border-warm-400 bg-warm-400 py-3.5 text-sm font-bold text-white transition-all hover:shadow-lg disabled:opacity-60"
                  >
                    {ordering ? 'Memproses...' : 'Bayar di Kasir'}
                  </button>
                  <button
                    onClick={() => handleOrder('online')}
                    disabled={ordering}
                    className="w-full rounded-xl border border-border py-3.5 text-sm font-bold text-navy-700 transition-all hover:bg-cream disabled:opacity-60"
                  >
                    {ordering ? 'Memproses...' : 'Bayar Online'}
                  </button>
                </div>

                <p className="mt-4 text-center text-[11px] text-text-muted">
                  Pembayaran online akan diproses melalui Midtrans.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
