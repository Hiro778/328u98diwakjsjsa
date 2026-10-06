import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'
import { hasRequiredVariants } from '../../lib/productMetadata'
import { getDesignSettings, DEFAULT_DESIGN_SETTINGS } from '../../services/qrMenuDesignService'
import { getSecureQrisUrl, getPublicQrisSettings, sanitizePublicCheckoutError } from '../../services/qrisPaymentService'
import { getPublicMenuBundle, getCachedMenuBundle, normalizeBusinessId } from '../../services/qrMenuCacheService'
import PublicMenuRenderer from '../../components/pos/PublicMenuRenderer'
import PublicMenuSkeleton from '../../components/pos/PublicMenuSkeleton'
import { usePlatformSettings } from '../../hooks/usePlatformSettings'
import { fetchBusinessContact, resolveBusinessContact, getWhatsAppUrl, normalizePhoneForWhatsApp } from '../../services/businessContactService'
import { subscribeOrderStatus, getPublicOrder, mapCustomerOrderStatus } from '../../services/posService'

export default function PublicMenuPage() {
  const { isPosEnabled, isQrisEnabled, posMaxItems, isMaintenance } = usePlatformSettings()
  const { businessId: rawBusinessId } = useParams()
  const businessId = normalizeBusinessId(rawBusinessId)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tableParam = searchParams.get('table') || ''
  const checkoutParam = searchParams.get('checkout') === 'true'
  const orderParam = searchParams.get('order_id') || searchParams.get('order') || ''

  const initialCached = getCachedMenuBundle(businessId)

  const [business, setBusiness] = useState(initialCached?.business || null)
  const [designSettings, setDesignSettings] = useState(initialCached?.designSettings || DEFAULT_DESIGN_SETTINGS)
  const [categories, setCategories] = useState(initialCached?.categories || [])
  const [products, setProducts] = useState(initialCached?.products || [])
  const [tables, setTables] = useState(initialCached?.tables || [])
  const [loading, setLoading] = useState(!initialCached)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [selectedTable, setSelectedTable] = useState(tableParam)
  const [ordering, setOrdering] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [orderError, setOrderError] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [nameError, setNameError] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(initialCached?.qrisSettings ? 'qris' : 'cash')
  const [qrisSettings, setQrisSettings] = useState(initialCached?.qrisSettings || null)
  const [qrisUrl, setQrisUrl] = useState(initialCached?.qrisUrl || null)
  const [qrisPaidAcknowledged, setQrisPaidAcknowledged] = useState(false)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [sellerContact, setSellerContact] = useState(initialCached?.sellerContact || null)

  // Prefill customer name if customer is logged in / member
  useEffect(() => {
    let isMounted = true
    async function loadLoggedInCustomer() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && isMounted) {
          let name = user.user_metadata?.full_name || user.user_metadata?.name || ''
          if (!name) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .maybeSingle()
            if (prof?.full_name) {
              name = prof.full_name
            }
          }
          if (name && isMounted) {
            setCustomerName(prev => (prev ? prev : name))
          }
        }
      } catch {
        // Guest user or network failure
      }
    }
    loadLoggedInCustomer()
    return () => { isMounted = false }
  }, [])

  // Sync cart with localStorage for seamless navigation between list and detail
  useEffect(() => {
    function loadSavedCart() {
      try {
        const saved = localStorage.getItem(`bs_cart_${businessId}`)
        if (saved) {
          setCart(JSON.parse(saved))
        }
      } catch (e) {
        console.error('Failed to load cart from storage:', e)
      }
    }
    loadSavedCart()

    window.addEventListener('cart_updated', loadSavedCart)
    return () => window.removeEventListener('cart_updated', loadSavedCart)
  }, [businessId])

  useEffect(() => {
    if (checkoutParam) {
      setShowCheckout(true)
    }
  }, [checkoutParam])

  // Unified single-roundtrip public menu loader with request coalescing and SWR cache
  useEffect(() => {
    if (!businessId) return
    let isMounted = true

    async function loadMenu() {
      if (!getCachedMenuBundle(businessId)) {
        setLoading(true)
      }
      setError('')

      try {
        const bundle = await getPublicMenuBundle(businessId, { client: supabase })
        if (!isMounted) return

        if (!bundle || !bundle.success) {
          setError(bundle?.message || 'Bisnis tidak ditemukan atau menu belum dipublikasikan.')
          setLoading(false)
          return
        }

        setBusiness(bundle.business)
        setDesignSettings(bundle.designSettings || DEFAULT_DESIGN_SETTINGS)
        setProducts(bundle.products || [])
        setCategories(bundle.categories || [])
        setTables(bundle.tables || [])
        if (bundle.qrisSettings) {
          setQrisSettings(bundle.qrisSettings)
          setSelectedPaymentMethod((prev) => prev || 'qris')
        } else {
          setQrisSettings(null)
          setSelectedPaymentMethod((prev) => prev || 'cash')
        }
        if (bundle.qrisUrl) {
          setQrisUrl(bundle.qrisUrl)
        }
        if (bundle.sellerContact) {
          setSellerContact(bundle.sellerContact)
        }
      } catch (err) {
        console.warn('[PublicMenuPage] Error loading menu bundle:', err)
        if (isMounted && !business) {
          setError('Gagal memuat menu toko. Periksa koneksi internet Anda.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadMenu()
    return () => {
      isMounted = false
    }
  }, [businessId])

  useEffect(() => {
    if (tableParam) setSelectedTable(tableParam)
  }, [tableParam])

  // Restore active order on mount or URL change (for persistence & refresh support - @3.md)
  useEffect(() => {
    if (!businessId) return
    let isMounted = true

    async function restoreActiveOrder() {
      let activeIdent = orderParam
      if (!activeIdent && typeof sessionStorage !== 'undefined') {
        try {
          activeIdent = sessionStorage.getItem(`bs_active_order_${businessId}`) || ''
        } catch {}
      }
      if (!activeIdent) return

      try {
        const res = await getPublicOrder(businessId, activeIdent, supabase)
        if (isMounted && res?.success && res?.order) {
          const ord = res.order
          setOrderSuccess((prev) => ({
            ...(prev || {}),
            ...ord,
            items: res.items?.length ? res.items : (prev?.items || []),
            payment_method: ord.payment_method || prev?.payment_method || 'qris',
            payment_status: ord.payment_status || prev?.payment_status || 'pending',
            order_status: ord.order_status || prev?.order_status || 'baru',
          }))

          const norm = String(ord.order_status || '').toLowerCase()
          if (norm === 'diproses' || norm === 'selesai' || norm === 'dibatalkan' || ord.payment_status === 'paid') {
            setQrisPaidAcknowledged(true)
          }

          try {
            sessionStorage.setItem(`bs_active_order_${businessId}`, ord.id)
          } catch {}
        }
      } catch (err) {
        console.warn('[PublicMenuPage] Failed to restore active order:', err)
      }
    }

    restoreActiveOrder()
    return () => { isMounted = false }
  }, [businessId, orderParam])

  // Real-time status sync when customer has an active order (e.g., QRIS merchant confirmation - @3.md)
  useEffect(() => {
    if (!orderSuccess?.id) return

    let activeChannel = null

    try {
      activeChannel = subscribeOrderStatus(
        orderSuccess.id,
        (updatedOrder) => {
          if (!updatedOrder) return
          setOrderSuccess((prev) => {
            if (!prev || (prev.id && prev.id !== updatedOrder.id)) return prev
            return {
              ...prev,
              ...updatedOrder,
              payment_status: updatedOrder.payment_status || prev.payment_status,
              order_status: updatedOrder.order_status || prev.order_status,
            }
          })

          const norm = String(updatedOrder.order_status || '').toLowerCase()
          if (norm === 'diproses' || norm === 'selesai' || norm === 'dibatalkan' || updatedOrder.payment_status === 'paid') {
            setQrisPaidAcknowledged(true)
          }
        },
        supabase
      )
    } catch (err) {
      console.warn('[PublicMenuPage] subscribeOrderStatus error (graceful fallback):', err)
    }

    return () => {
      if (activeChannel) {
        try {
          supabase.removeChannel(activeChannel)
        } catch {}
        activeChannel = null
      }
    }
  }, [orderSuccess?.id])

  // Instant synchronous cache check (L1 memory / L2 storage) for 0ms First Contentful Paint
  useEffect(() => {
    if (!businessId) return
    const cached = getCachedMenuBundle(businessId)
    if (cached && cached.business) {
      setBusiness(cached.business)
      if (cached.designSettings) setDesignSettings(cached.designSettings)
      if (Array.isArray(cached.products)) setProducts(cached.products)
      if (Array.isArray(cached.categories)) setCategories(cached.categories)
      if (Array.isArray(cached.tables)) setTables(cached.tables)
      if (cached.qrisSettings) {
        setQrisSettings(cached.qrisSettings)
        setSelectedPaymentMethod(prev => prev || 'qris')
      }
      if (cached.qrisUrl) setQrisUrl(cached.qrisUrl)
      if (cached.sellerContact) setSellerContact(cached.sellerContact)
      setLoading(false)
    }
  }, [businessId])

  async function loadBusiness() {
    try {
      const bundle = await getPublicMenuBundle(businessId, { client: supabase })

      if (!bundle || !bundle.success) {
        if (bundle?.error === 'NOT_PUBLISHED') {
          setError('Menu bisnis ini belum dipublikasikan.')
        } else {
          setError('Bisnis tidak ditemukan.')
        }
        setLoading(false)
        return
      }

      const data = bundle.business
      setBusiness(data)

      // Load custom QR Menu design settings (preserve getDesignSettings for test compatibility)
      let design = bundle.designSettings
      if (!design) {
        try {
          design = await getDesignSettings(businessId)
        } catch (err) {
          console.warn('[PublicMenuPage] Could not load design settings:', err)
        }
      }
      if (design) setDesignSettings(design)

      // Debug trace as specified in p.md
      const bannerBlock = (design?.layout || []).find((b) => b.type === 'banner')
      console.log('[PublicMenu Debug] business ID:', businessId)
      console.log('[PublicMenu Debug] business.cover_url:', data.cover_url)
      console.log('[PublicMenu Debug] layout banner block:', bannerBlock)
      console.log('[PublicMenu Debug] banner.props.banners:', bannerBlock?.props?.banners)

      if (Array.isArray(bundle.products)) {
        setProducts(bundle.products)
      }
      if (Array.isArray(bundle.categories)) {
        setCategories(bundle.categories)
      }
      if (Array.isArray(bundle.tables)) {
        setTables(bundle.tables)
      }

      // Load QRIS payment settings for public checkout (QRIS Phase 3)
      if (bundle.qrisSettings) {
        setQrisSettings(bundle.qrisSettings)
        setSelectedPaymentMethod(prev => prev || 'qris')
        if (bundle.qrisUrl) {
          setQrisUrl(bundle.qrisUrl)
        }
      } else {
        setQrisSettings(null)
        setQrisUrl(null)
        setSelectedPaymentMethod(prev => prev || 'cash')
      }

      // Load platform settings for runtime feature enforcement
      try {
        const { data: pSettings } = await supabase.rpc('get_public_platform_settings')
        if (pSettings) {
          setPlatformSettings(pSettings)
        }
      } catch (sErr) {
        console.warn('[PublicMenuPage] Could not load platform settings:', sErr)
      }

      // Load seller contact for the business
      if (bundle.sellerContact) {
        setSellerContact(bundle.sellerContact)
      } else {
        try {
          const contact = await fetchBusinessContact(businessId, supabase, design)
          setSellerContact(contact)
        } catch (cErr) {
          console.warn('[PublicMenuPage] Could not load seller contact:', cErr)
          setSellerContact(resolveBusinessContact({ business: data, designSettings: design }))
        }
      }
    } catch (err) {
      console.warn('[PublicMenuPage] Failed to load public menu:', err)
      setError('Bisnis tidak ditemukan.')
    } finally {
      setLoading(false)
    }
  }

  // Ensure seller contact strictly belongs to the specific order's business
  useEffect(() => {
    const targetBizId = orderSuccess?.business_id || business?.id || businessId
    if (!targetBizId) return

    let isMounted = true
    fetchBusinessContact(targetBizId, supabase, designSettings)
      .then((contact) => {
        if (isMounted) setSellerContact(contact)
      })
      .catch((err) => {
        console.warn('[PublicMenuPage] Failed to sync seller contact:', err)
      })

    return () => {
      isMounted = false
    }
  }, [orderSuccess?.business_id, business?.id, businessId, designSettings])

  async function loadProducts() {
    if (products.length > 0) return

    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_available', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const prods = data || []
    setProducts(prods)

    // Derive categories from products
    const names = [...new Set(prods.map((p) => p.category).filter(Boolean))]
    setCategories(names.sort())
  }

  async function loadTables() {
    if (tables.length > 0) return

    const { data } = await supabase
      .from('tables')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    setTables(data || [])
  }

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id && !c.variant_summary)
      let nextCart
      if (existing) {
        nextCart = prev.map(c =>
          (c.product_id === product.id && !c.variant_summary)
            ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unit_price }
            : c
        )
      } else {
        nextCart = [...prev, {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: product.unit_price,
          subtotal: product.unit_price,
        }]
      }
      try {
        localStorage.setItem(`bs_cart_${businessId}`, JSON.stringify(nextCart))
      } catch (e) {
        console.error(e)
      }
      return nextCart
    })
    setShowCart(true)
  }, [businessId])

  const updateQty = useCallback((productId, delta, variantSummary = null) => {
    setCart(prev => {
      const nextCart = prev.map(c => {
        const matches = c.product_id === productId && (c.variant_summary || null) === (variantSummary || null)
        if (!matches) return c
        const newQty = c.quantity + delta
        if (newQty <= 0) return null
        return { ...c, quantity: newQty, subtotal: newQty * c.unit_price }
      }).filter(Boolean)
      try {
        localStorage.setItem(`bs_cart_${businessId}`, JSON.stringify(nextCart))
      } catch (e) {
        console.error(e)
      }
      return nextCart
    })
  }, [businessId])

  const removeFromCart = useCallback((productId, variantSummary = null) => {
    setCart(prev => {
      const nextCart = prev.filter(c => {
        const matches = c.product_id === productId && (c.variant_summary || null) === (variantSummary || null)
        return !matches
      })
      try {
        localStorage.setItem(`bs_cart_${businessId}`, JSON.stringify(nextCart))
      } catch (e) {
        console.error(e)
      }
      return nextCart
    })
  }, [businessId])

  const cartTotal = useMemo(() => cart.reduce((sum, c) => sum + c.subtotal, 0), [cart])
  const cartCount = useMemo(() => cart.reduce((sum, c) => sum + c.quantity, 0), [cart])

  const filteredProducts = useMemo(() => {
    return activeCategory === 'all'
      ? products
      : products.filter(p => p.category === activeCategory)
  }, [activeCategory, products])

  const isQrisAvailable = Boolean(
    business?.is_menu_published &&
    qrisSettings?.qris_enabled &&
    qrisSettings?.qris_image_url &&
    platformSettings?.enable_qris_checkout !== false
  )

  async function handleOrder(paymentMethod) {
    if (cart.length === 0 || ordering) return

    // Maintenance Mode UX Guard
    if (platformSettings?.maintenance_mode === true) {
      setOrderError('Sistem sedang dalam mode pemeliharaan (maintenance mode). Pemesanan publik dinonaktifkan sementara.')
      return
    }

    // POS / Menu Ordering Flag UX Guard
    if (platformSettings?.enable_pos_module === false) {
      setOrderError('Modul pemesanan dan POS sedang dinonaktifkan oleh administrator platform.')
      return
    }

    // Guard: QRIS platform flag & business configuration
    if (paymentMethod === 'qris') {
      if (platformSettings?.enable_qris_checkout === false) {
        setOrderError('Pembayaran QRIS sedang dinonaktifkan di seluruh platform oleh administrator.')
        return
      }
      if (!isQrisAvailable) {
        setOrderError('Metode pembayaran QRIS tidak tersedia untuk bisnis ini.')
        return
      }
    }

    // Guard: pos_max_items_per_order
    const maxItems = Number(platformSettings?.pos_max_items_per_order) || 100
    if (cartCount > maxItems) {
      setOrderError(`Batas maksimum kuantitas produk dalam satu transaksi adalah ${maxItems} item (dipesan: ${cartCount} item).`)
      return
    }

    const trimmedCustomerName = (customerName || '').trim()

    // Bayar Langsung / Bayar di Kasir requires Nama Pembeli
    if (paymentMethod === 'cash') {
      if (!trimmedCustomerName) {
        setNameError('Nama pembeli wajib diisi untuk pembayaran di kasir.')
        setSelectedPaymentMethod('cash')
        return
      }
    }
    setNameError('')
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

    // Step 1: Attempt Atomic Server-Side Order Creation (Enforces Stock, Price & Tenant Integrity)
    let order = null
    const checkoutRequestId = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
    const rpcItems = cart.map(c => ({
      product_id: c.product_id,
      quantity: c.quantity,
      selected_variants: c.selected_variants || {},
    }))

    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_public_order', {
      p_business_id: business.id,
      p_items: rpcItems,
      p_payment_method: paymentMethod,
      p_customer_name: trimmedCustomerName,
      p_table_id: tableObj?.id || null,
      p_notes: '',
      p_checkout_request_id: checkoutRequestId,
    })

    if (!rpcErr && rpcData?.success && rpcData?.order) {
      order = rpcData.order
    } else if (rpcErr && (rpcErr.code === '23514' || rpcErr.message?.includes('INSUFFICIENT_STOCK') || rpcErr.message?.includes('Stok tidak mencukupi'))) {
      // Domain validation error (e.g. out of stock / not available)
      setOrderError(sanitizePublicCheckoutError(rpcErr))
      setOrdering(false)
      return
    } else {
      // Step 2 Fallback: Direct Insert with verified RLS policies
      console.warn('[QR Menu] RPC failed, falling back to direct insert:', rpcErr?.message)
      const validatedItems = cart.map(c => {
        const serverPrice = c.unit_price != null ? Number(c.unit_price) : (priceMap[c.product_id] ?? 0)
        const fullName = c.variant_summary ? `${c.product_name} (${c.variant_summary})` : c.product_name
        return {
          product_id: c.product_id,
          product_name: fullName,
          quantity: c.quantity,
          unit_price: serverPrice,
          subtotal: serverPrice * c.quantity,
          variant_details: c.selected_variants || {},
        }
      })

      const serverSubtotal = validatedItems.reduce((s, i) => s + i.subtotal, 0)

      const { data: insertedOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          business_id: business.id,
          table_id: tableObj?.id || null,
          customer_name: trimmedCustomerName,
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
        setOrderError(sanitizePublicCheckoutError(orderErr))
        setOrdering(false)
        return
      }

      order = insertedOrder

      const itemsToInsert = validatedItems.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        variant_details: item.variant_details,
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

      // Synchronize inventory mutation in fallback to prevent stale stock
      for (const item of validatedItems) {
        try {
          const { data: inv } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .maybeSingle()
          if (inv && inv.quantity != null) {
            await supabase
              .from('inventory')
              .update({
                quantity: Math.max(0, inv.quantity - item.quantity),
                updated_at: new Date().toISOString(),
              })
              .eq('id', inv.id)
          }
        } catch (err) {
          console.error('[QR Menu] Error updating inventory in fallback:', err)
        }
      }
    }

    // ── Bayar di Kasir: done, show success ──
    if (paymentMethod === 'cash') {
      const placedOrder = { ...order, customer_name: order.customer_name || trimmedCustomerName }
      setOrderSuccess(placedOrder)
      try {
        sessionStorage.setItem(`bs_active_order_${businessId}`, order.id)
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('order_id', order.id)
        window.history.replaceState(null, '', newUrl.toString())
      } catch {}
      setOrdering(false)
      setShowCheckout(false)
      setCart([])
      try {
        localStorage.removeItem(`bs_cart_${businessId}`)
      } catch {}
      return
    }

    // ── Bayar QRIS: generate secure signed URL & show QRIS screen ──
    if (paymentMethod === 'qris') {
      let finalQrisUrl = qrisUrl
      if (!finalQrisUrl) {
        try {
          const secureRes = await getSecureQrisUrl(business.id, supabase)
          if (secureRes?.data?.signedUrl) {
            finalQrisUrl = secureRes.data.signedUrl
          }
        } catch (err) {
          console.warn('[QR Menu] QRIS signed URL generation error:', err)
        }
      }

      const placedOrder = {
        ...order,
        customer_name: order.customer_name || trimmedCustomerName,
        payment_method: 'qris',
        payment_status: 'pending',
        qris_url: finalQrisUrl,
      }
      setOrderSuccess(placedOrder)
      setQrisPaidAcknowledged(false)
      try {
        sessionStorage.setItem(`bs_active_order_${businessId}`, order.id)
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.set('order_id', order.id)
        window.history.replaceState(null, '', newUrl.toString())
      } catch {}
      setOrdering(false)
      setShowCheckout(false)
      setCart([])
      try {
        localStorage.removeItem(`bs_cart_${businessId}`)
      } catch {}
      return
    }
  }

  if (loading && !business) {
    return <PublicMenuSkeleton />
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-5">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warm-400 text-white shadow-md">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009 9.35c.66 0 1.282-.213 1.79-.577a3.001 3.001 0 003.71 0c.508.364 1.13.577 1.79.577.66 0 1.282-.213 1.79-.577a3.001 3.001 0 003.75.615m-16.5 0a3.001 3.001 0 01-.75-2.025V4.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121.75 4.5v2.824a3.001 3.001 0 01-.75 2.026" />
            </svg>
          </div>
          <p className="mt-6 text-lg font-semibold text-navy-700">{error}</p>
          <p className="mt-2 text-sm text-text-muted">Pastikan link yang kamu buka sudah benar.</p>
        </div>
      </div>
    )
  }

  // Derive theme tokens for consistent propagation (qr.md Section 8)
  const qrTheme = designSettings?.theme || DEFAULT_DESIGN_SETTINGS.theme
  const qrPrimary = qrTheme.primary || '#F5A623'
  const qrBg = qrTheme.background || '#FFF9F4'
  const qrSurface = qrTheme.surface || '#FFFFFF'
  const qrText = qrTheme.text || '#1E2A5E'
  const qrBtn = qrTheme.button || qrPrimary
  const qrBgImage = qrTheme.backgroundImage || business?.menu_background_url || ''
  const qrBorder = `color-mix(in srgb, ${qrText} 12%, transparent)`
  const qrBtnRadius =
    qrTheme.buttonStyle === 'square'
      ? 'rounded-md'
      : qrTheme.buttonStyle === 'rounded'
      ? 'rounded-xl'
      : 'rounded-full'

  const drawerThemeStyles = {
    '--qr-primary': qrPrimary,
    '--qr-bg': qrBg,
    '--qr-surface': qrSurface,
    '--qr-text': qrText,
    '--qr-border': qrBorder,
    '--qr-btn': qrBtn,
    '--theme-primary': qrPrimary,
    '--theme-bg': qrBg,
    '--theme-surface': qrSurface,
    '--theme-text': qrText,
    '--theme-btn': qrBtn,
  }

  // Order success view
  if (orderSuccess) {
    const isPaid = orderSuccess.payment_status === 'paid'
    const isCash = orderSuccess.payment_method === 'cash'
    const isQris = orderSuccess.payment_method === 'qris'

    const statusMeta = mapCustomerOrderStatus(orderSuccess.order_status, {
      isQris,
      qrisPaidAcknowledged,
      isCash,
    })

    const isProcessing = statusMeta.isProcessing
    const isCompleted = statusMeta.isCompleted
    const isCancelled = statusMeta.isCancelled
    const isBaru = statusMeta.isBaru

    const activeSellerContact = sellerContact || resolveBusinessContact({
      business,
      designSettings,
    })

    const rawWhatsApp = (activeSellerContact?.type === 'whatsapp' ? (activeSellerContact?.rawContact || activeSellerContact?.phone) : '') || business?.whatsapp || ''
    const normalizedWhatsApp = normalizePhoneForWhatsApp(rawWhatsApp)
    const hasWhatsApp = Boolean(normalizedWhatsApp && normalizedWhatsApp.length >= 7)
    const orderNumberForWa = orderSuccess?.order_number || (orderSuccess?.id ? String(orderSuccess.id).slice(0, 8) : '')
    const waPrefilledMessage = orderNumberForWa ? `Halo, saya ingin menanyakan pesanan #${orderNumberForWa}.` : ''
    const waUrl = hasWhatsApp ? getWhatsAppUrl(normalizedWhatsApp, waPrefilledMessage) : ''

    // Compute active title and message based on flow (@3.md & @2.md)
    let statusTitle = statusMeta.title
    let statusDesc = statusMeta.desc
    const statusBadgeLabel = statusMeta.label

    return (
      <div
        data-theme="light"
        style={{
          ...drawerThemeStyles,
          backgroundColor: qrBgImage ? 'transparent' : qrBg,
          color: qrText,
        }}
        className="relative min-h-screen flex items-center justify-center px-5 py-12"
      >
        {qrBgImage && (
          <div
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
            style={{
              backgroundImage: `url("${qrBgImage}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px]" />
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-sm"
        >
          {/* Status Icon */}
          <div className="flex flex-col items-center text-center">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full shadow-sm border ${
                isCompleted
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : isProcessing
                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 ring-4 ring-blue-500/10'
                  : isCancelled
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  : isQris && !qrisPaidAcknowledged
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}
            >
              {isCompleted ? (
                <svg className="h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isProcessing ? (
                <svg className="h-10 w-10 text-blue-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5a4.5 4.5 0 00-6.364 6.364l7.879 7.879" />
                </svg>
              ) : isCancelled ? (
                <svg className="h-10 w-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : isQris && !qrisPaidAcknowledged ? (
                <svg className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 15h2.25v2.25H13.5V15zM16.5 18h2.25v2.25H16.5V18zM18.75 15H21v2.25h-2.25V15zM13.5 18.75h2.25V21H13.5v-2.25zM18.75 18.75H21V21h-2.25v-2.25z" />
                </svg>
              ) : (
                <svg className="h-10 w-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            <h1 style={{ color: qrText }} className="mt-5 text-2xl font-extrabold tracking-tight" data-waiting-state="Menunggu Konfirmasi Penjual">
              {statusTitle || 'Menunggu Konfirmasi Penjual'}
            </h1>
            <p style={{ color: 'color-mix(in srgb, var(--qr-text) 70%, transparent)' }} className="mt-2 text-sm max-w-xs leading-relaxed">
              {statusDesc}
            </p>
          </div>

          {/* QRIS Scan Card: ONLY visible before customer clicks "Saya Sudah Bayar / Lanjut" */}
          {isQris && !qrisPaidAcknowledged && (
            <div
              style={{
                backgroundColor: qrSurface,
                borderColor: 'var(--qr-border)',
              }}
              className="mt-6 rounded-2xl border p-4 text-center shadow-sm"
            >
              {/* Business Name Header */}
              <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] font-bold uppercase tracking-wide">
                Pembayaran ke
              </p>
              <h2 style={{ color: qrText }} className="text-base font-extrabold mt-0.5">
                {business?.name || 'Toko'}
              </h2>

              {/* QR Image */}
              <div className="mt-3 flex flex-col items-center justify-center rounded-xl bg-white p-3 border border-gray-100 shadow-inner">
                {orderSuccess.qris_url ? (
                  <img
                    src={orderSuccess.qris_url}
                    alt="QRIS Pembayaran Merchant"
                    className="h-56 w-56 object-contain rounded-md"
                  />
                ) : (
                  <div className="flex h-56 w-56 flex-col items-center justify-center p-4 text-center text-xs text-rose-500">
                    <svg className="h-8 w-8 mb-2 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Gambar QRIS tidak dapat dimuat. Silakan laporkan nomor pesanan ke kasir.
                  </div>
                )}
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                  <span>QRIS</span>
                  <span>•</span>
                  <span>Pembayaran Langsung ke Merchant</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-4 text-left rounded-xl bg-gray-50/80 p-3.5 border border-gray-200/50 space-y-1.5 text-xs text-gray-600">
                <p className="font-bold text-gray-800 text-[11px] uppercase tracking-wide">Instruksi Pembayaran:</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                  <li>Buka aplikasi e-wallet (GoPay, OVO, Dana) atau mobile banking Anda.</li>
                  <li>Scan QRIS di atas dan pastikan nominal sesuai total pesanan.</li>
                  <li>Uang langsung masuk ke rekening merchant. BisnisSehat tidak menerima uang Anda.</li>
                  <li>Setelah transfer berhasil, klik tombol <strong>"Saya Sudah Bayar / Lanjut"</strong> di bawah.</li>
                </ol>
              </div>
            </div>
          )}

          {/* Waiting confirmation notice when customer already continued */}
          {isQris && qrisPaidAcknowledged && !isProcessing && !isCompleted && !isCancelled && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-center">
              <p className="text-xs font-bold text-amber-800">
                Pesanan Anda sudah diteruskan ke penjual.
              </p>
              <p className="text-[11px] text-amber-700/90 mt-0.5">
                Penjual akan mengonfirmasi pembayaran dan mulai menyiapkan pesanan Anda.
              </p>
            </div>
          )}

          {/* Processing Banner */}
          {isProcessing && (
            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-center">
              <p className="text-xs font-bold text-blue-800">
                Penjual telah mengonfirmasi pembayaran dan sedang memproses pesanan.
              </p>
              <p className="text-[11px] text-blue-700/90 mt-0.5">
                Anda dapat menggunakan tombol <strong>WhatsApp Penjual</strong> di bawah untuk berkomunikasi langsung.
              </p>
            </div>
          )}

          {/* Order Detail Card */}
          <div
            style={{
              backgroundColor: qrSurface,
              borderColor: 'var(--qr-border)',
            }}
            className="mt-4 rounded-2xl border overflow-hidden shadow-sm"
          >
            {/* Card Header */}
            <div
              style={{
                backgroundColor: 'color-mix(in srgb, var(--qr-surface) 95%, var(--qr-text) 5%)',
                borderColor: 'var(--qr-border)',
              }}
              className="border-b px-5 py-3 flex justify-between items-center"
            >
              <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] font-bold uppercase tracking-wide">
                Detail Pesanan
              </p>
              {isProcessing && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Sedang Diproses
                </span>
              )}
            </div>

            {/* Card Body */}
            <div style={{ borderColor: 'var(--qr-border)' }} className="divide-y">
              {/* Order Number */}
              <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-sm">Nomor Pesanan</span>
                <span style={{ color: qrText }} className="text-sm font-bold">#{orderSuccess.order_number || orderSuccess.id?.slice(-6)?.toUpperCase() || 'BS-NEW'}</span>
              </div>

              {/* Nama Pembeli */}
              {orderSuccess.customer_name && (
                <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                  <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-sm">Nama Pembeli</span>
                  <span style={{ color: qrText }} className="text-sm font-bold">{orderSuccess.customer_name}</span>
                </div>
              )}

              {/* Table if present */}
              {selectedTable && (
                <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                  <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-sm">Meja</span>
                  <span style={{ color: qrText }} className="text-sm font-bold">{selectedTable}</span>
                </div>
              )}

              {/* Payment Method */}
              <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-sm">Metode Bayar</span>
                <span style={{ color: qrText }} className="text-sm font-semibold">
                  {isQris ? 'QRIS Merchant' : isCash ? 'Bayar Langsung' : 'Bayar Online'}
                </span>
              </div>

              {/* Order Status */}
              <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-sm">Status Pesanan</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isCompleted
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : isProcessing
                    ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                    : isCancelled
                    ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    isCompleted ? 'bg-emerald-500' : isProcessing ? 'bg-blue-500 animate-pulse' : isCancelled ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  {statusBadgeLabel}
                </span>
              </div>

              {/* Total */}
              <div style={{ borderColor: 'var(--qr-border)' }} className="flex justify-between items-center px-5 py-3.5">
                <span style={{ color: qrText }} className="text-sm font-bold">Total</span>
                <span style={{ color: qrPrimary }} className="text-lg font-extrabold tabular-nums">{formatCurrency(orderSuccess.total)}</span>
              </div>
            </div>
          </div>

          {/* Kontak Penjual Card: Visible on Order Status screen / Menunggu Konfirmasi Penjual */}
          {(!isQris || qrisPaidAcknowledged) && (
            <div
              style={{
                backgroundColor: qrSurface,
                borderColor: 'var(--qr-border)',
              }}
              className="mt-4 rounded-2xl border overflow-hidden shadow-sm"
            >
              {/* Card Header */}
              <div
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--qr-surface) 95%, var(--qr-text) 5%)',
                  borderColor: 'var(--qr-border)',
                }}
                className="border-b px-5 py-3 flex justify-between items-center"
              >
                <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] font-bold uppercase tracking-wide">
                  Kontak Penjual
                </p>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-3.5">
                <div>
                  <p style={{ color: qrText }} className="text-sm font-bold">
                    {activeSellerContact?.businessName || business?.name || orderSuccess.business_name || 'Penjual'}
                  </p>
                  {activeSellerContact?.type === 'whatsapp' ? (
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 70%, transparent)' }} className="text-sm font-medium mt-1">
                      WhatsApp: <span style={{ color: qrText }} className="font-semibold tabular-nums">{activeSellerContact.displayPhone}</span>
                    </p>
                  ) : activeSellerContact?.type === 'phone' ? (
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 70%, transparent)' }} className="text-sm font-medium mt-1">
                      Telepon: <span style={{ color: qrText }} className="font-semibold tabular-nums">{activeSellerContact.displayPhone}</span>
                    </p>
                  ) : (
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 50%, transparent)' }} className="text-sm italic mt-1">
                      Kontak penjual belum tersedia
                    </p>
                  )}
                </div>

                {/* Hubungi Penjual Button */}
                {activeSellerContact?.hasContact && activeSellerContact?.actionUrl && (
                  <a
                    href={activeSellerContact.actionUrl}
                    target={activeSellerContact.type === 'whatsapp' ? '_blank' : '_self'}
                    rel={activeSellerContact.type === 'whatsapp' ? 'noopener noreferrer' : undefined}
                    className={`flex w-full items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] ${qrBtnRadius}`}
                    style={{ backgroundColor: activeSellerContact.type === 'whatsapp' ? '#25D366' : qrBtn }}
                  >
                    {activeSellerContact.type === 'whatsapp' ? (
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    )}
                    <span>Hubungi Penjual</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 space-y-2.5">
            {/* QRIS Step 1 Button: Saya Sudah Bayar / Lanjut */}
            {isQris && !qrisPaidAcknowledged && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setQrisPaidAcknowledged(true)}
                className={`w-full py-3.5 text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-[0.98] ${qrBtnRadius}`}
                style={{ backgroundColor: qrBtn }}
              >
                Saya Sudah Bayar / Lanjut
              </motion.button>
            )}

            {/* WhatsApp Penjual Button */}
            {Boolean(orderSuccess) && (
              hasWhatsApp && waUrl ? (
                <motion.button
                  type="button"
                  data-testid="buyer-whatsapp-penjual-btn"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    window.open(waUrl, '_blank', 'noopener,noreferrer')
                  }}
                  className={`w-full py-3.5 text-sm font-bold transition hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2 border border-emerald-500 bg-emerald-600 text-white shadow-xs ${qrBtnRadius}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                  <span>WhatsApp Penjual</span>
                </motion.button>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="buyer-whatsapp-penjual-btn"
                  className={`w-full py-3.5 text-sm font-bold opacity-60 cursor-not-allowed flex items-center justify-center gap-2 border border-gray-300 bg-gray-100 text-gray-500 shadow-xs ${qrBtnRadius}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                  <span>WhatsApp belum tersedia</span>
                </button>
              )
            )}

            {/* Kembali ke Menu Button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setOrderSuccess(null)
                setQrisPaidAcknowledged(false)
                setCart([])
                try {
                  localStorage.removeItem(`bs_cart_${businessId}`)
                  sessionStorage.removeItem(`bs_active_order_${businessId}`)
                  const newUrl = new URL(window.location.href)
                  newUrl.searchParams.delete('order_id')
                  newUrl.searchParams.delete('order')
                  window.history.replaceState(null, '', newUrl.toString())
                } catch {}
                setSelectedTable(tableParam)
              }}
              className={`w-full py-3.5 text-sm font-bold transition hover:opacity-90 active:scale-[0.98] ${
                isQris && !qrisPaidAcknowledged
                  ? 'border border-gray-300 text-gray-700 bg-white shadow-xs'
                  : 'text-white shadow-md'
              } ${qrBtnRadius}`}
              style={(!isQris || qrisPaidAcknowledged) ? { backgroundColor: qrBtn } : {}}
            >
              Kembali ke Menu
            </motion.button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div data-theme="light" className="min-h-screen">
      {/* Brand-First QR Menu Presentation Layer */}
      <PublicMenuRenderer
        business={business}
        products={products}
        categories={categories}
        tables={tables}
        theme={designSettings.theme}
        layout={designSettings.layout}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        selectedTable={selectedTable}
        onSelectTable={setSelectedTable}
        cart={cart}
        onAddToCart={addToCart}
        onSelectProduct={(p) => navigate(`/menu/${businessId}/product/${p.id}`)}
        onOpenCart={() => {
          setShowCart(true)
        }}
        isInteractive={true}
        isSimulator={false}
      />

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
            onClick={() => setShowCart(false)}
          >
            <motion.div
              data-theme="light"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                ...drawerThemeStyles,
                backgroundColor: qrSurface,
                color: qrText,
              }}
              className="absolute right-0 top-0 h-full w-full max-w-sm shadow-2xl flex flex-col"
            >
              {/* Cart Header */}
              <div
                style={{ borderColor: 'var(--qr-border)' }}
                className="flex items-center justify-between border-b px-4 py-4"
              >
                <div>
                  <h2 style={{ color: qrText }} className="text-lg font-bold">Keranjang</h2>
                  {cartCount > 0 && (
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs mt-0.5">{cartCount} item dipilih</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCart(false)}
                  style={{ borderColor: 'var(--qr-border)', color: qrText }}
                  className="flex items-center justify-center rounded-lg border p-1.5 transition hover:opacity-70"
                  aria-label="Tutup keranjang"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto px-4" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--qr-surface) 93%, var(--qr-text) 7%)',
                        color: 'color-mix(in srgb, var(--qr-text) 50%, transparent)',
                      }}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl mb-3"
                    >
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </div>
                    <p style={{ color: qrText }} className="text-sm font-bold">Keranjang masih kosong</p>
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 50%, transparent)' }} className="text-xs mt-1">Tambahkan menu yang kamu suka!</p>
                  </div>
                ) : (
                  <div>
                    {cart.map(c => (
                      <div
                        key={`${c.product_id}-${c.variant_summary || ''}`}
                        style={{ borderColor: 'var(--qr-border)' }}
                        className="flex gap-4 py-4 border-b last:border-0"
                      >
                        {/* Product image thumbnail */}
                        {c.image_url ? (
                          <div
                            style={{
                              borderColor: 'var(--qr-border)',
                              backgroundColor: 'color-mix(in srgb, var(--qr-surface) 93%, var(--qr-text) 7%)',
                            }}
                            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border"
                          >
                            <img src={c.image_url} alt={c.product_name} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div
                            style={{
                              borderColor: 'var(--qr-border)',
                              backgroundColor: 'color-mix(in srgb, var(--qr-surface) 93%, var(--qr-text) 7%)',
                            }}
                            className="h-16 w-16 shrink-0 rounded-xl border flex items-center justify-center opacity-40"
                          >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                            </svg>
                          </div>
                        )}

                        {/* Product details */}
                        <div className="flex flex-1 min-w-0 flex-col justify-between gap-2">
                          <div className="flex justify-between gap-2">
                            <div className="min-w-0">
                              <p style={{ color: qrText }} className="text-sm font-semibold truncate">{c.product_name}</p>
                              {c.variant_summary && (
                                <p style={{ color: qrPrimary }} className="text-xs font-semibold mt-0.5">{c.variant_summary}</p>
                              )}
                              <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs mt-0.5">{formatCurrency(c.unit_price)} / pcs</p>
                            </div>
                            {/* Remove button */}
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.88 }}
                              onClick={() => removeFromCart(c.product_id, c.variant_summary)}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md opacity-40 hover:opacity-100 hover:text-rose-500 transition-colors"
                              aria-label={`Hapus ${c.product_name}`}
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </motion.button>
                          </div>

                          {/* Quantity controls + line total */}
                          <div className="flex items-center justify-between">
                            <div
                              style={{
                                borderColor: 'var(--qr-border)',
                                backgroundColor: 'color-mix(in srgb, var(--qr-surface) 90%, var(--qr-text) 10%)',
                              }}
                              className="inline-flex items-center border rounded-xl overflow-hidden"
                            >
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateQty(c.product_id, -1, c.variant_summary)}
                                style={{ color: qrText }}
                                className="flex h-8 w-8 items-center justify-center hover:opacity-75 transition-colors text-base font-light"
                                aria-label="Kurangi"
                              >−</motion.button>
                              <span
                                style={{ color: qrText, borderColor: 'var(--qr-border)' }}
                                className="min-w-[2.25rem] text-center text-sm font-bold border-x py-1 tabular-nums"
                              >
                                {c.quantity}
                              </span>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => updateQty(c.product_id, 1, c.variant_summary)}
                                style={{ color: qrText }}
                                className="flex h-8 w-8 items-center justify-center hover:opacity-75 transition-colors text-base font-light"
                                aria-label="Tambah"
                              >+</motion.button>
                            </div>
                            <span style={{ color: qrText }} className="text-sm font-bold tabular-nums">{formatCurrency(c.subtotal)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart Summary */}
              {cart.length > 0 && (
                <div
                  style={{
                    borderColor: 'var(--qr-border)',
                    backgroundColor: qrSurface,
                  }}
                  className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] space-y-3"
                >
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }}>Subtotal ({cartCount} item)</span>
                    <span style={{ color: qrText }} className="font-semibold">{formatCurrency(cartTotal)}</span>
                  </div>
                  <div style={{ backgroundColor: 'var(--qr-border)' }} className="h-px" />
                  <div className="flex justify-between">
                    <span style={{ color: qrText }} className="font-bold">Total</span>
                    <span style={{ color: qrPrimary }} className="text-lg font-extrabold tabular-nums">{formatCurrency(cartTotal)}</span>
                  </div>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowCart(false); setShowCheckout(true); setOrderError('') }}
                    style={{ backgroundColor: qrBtn }}
                    className={`mt-1 w-full py-3.5 text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-[0.98] ${qrBtnRadius}`}
                  >
                    Lanjut ke Pembayaran →
                  </motion.button>
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
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
            onClick={() => setShowCheckout(false)}
          >
            <motion.div
              data-theme="light"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                ...drawerThemeStyles,
                backgroundColor: qrSurface,
                color: qrText,
              }}
              className="absolute bottom-0 left-0 right-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl shadow-2xl"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ backgroundColor: 'var(--qr-border)' }} className="h-1.5 w-12 rounded-full" />
              </div>

              <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h2 style={{ color: qrText }} className="text-lg font-bold">Konfirmasi Pesanan</h2>
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs mt-0.5">{cartCount} item · {formatCurrency(cartTotal)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowCheckout(false); setOrderError('') }}
                    style={{ borderColor: 'var(--qr-border)', color: qrText }}
                    className="flex items-center justify-center rounded-lg border p-1.5 transition hover:opacity-75"
                    aria-label="Tutup checkout"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Section A – Order Info */}
                {selectedTable && (
                  <div
                    style={{
                      borderColor: 'var(--qr-border)',
                      backgroundColor: 'color-mix(in srgb, var(--qr-surface) 93%, var(--qr-text) 7%)',
                    }}
                    className="flex items-center gap-3 rounded-2xl border px-4 py-3"
                  >
                    <div
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--qr-primary) 15%, transparent)',
                        color: qrPrimary,
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                      </svg>
                    </div>
                    <div>
                      <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] font-bold uppercase tracking-wide">Meja</p>
                      <p style={{ color: qrText }} className="text-sm font-bold">{selectedTable}</p>
                    </div>
                  </div>
                )}

                {/* Section B – Order Summary */}
                <div
                  style={{
                    borderColor: 'var(--qr-border)',
                    backgroundColor: qrSurface,
                  }}
                  className="rounded-2xl border overflow-hidden"
                >
                  <div
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--qr-surface) 95%, var(--qr-text) 5%)',
                      borderColor: 'var(--qr-border)',
                    }}
                    className="border-b px-4 py-2.5"
                  >
                    <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] font-bold uppercase tracking-wide">Ringkasan Pesanan</p>
                  </div>
                  <div style={{ borderColor: 'var(--qr-border)' }} className="divide-y">
                    {cart.map(c => (
                      <div
                        key={`${c.product_id}-${c.variant_summary || ''}`}
                        style={{ borderColor: 'var(--qr-border)' }}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p style={{ color: qrText }} className="text-sm font-medium truncate">
                            <span
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--qr-primary) 15%, transparent)',
                                color: qrPrimary,
                              }}
                              className="inline-flex items-center justify-center h-5 w-5 rounded-md text-[11px] font-bold mr-1.5 shrink-0"
                            >
                              {c.quantity}
                            </span>
                            {c.product_name}
                          </p>
                          {c.variant_summary && (
                            <p style={{ color: qrPrimary }} className="text-[11px] font-semibold mt-0.5 truncate pl-6">{c.variant_summary}</p>
                          )}
                        </div>
                        <span style={{ color: qrText }} className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(c.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{ borderColor: 'var(--qr-border)' }}
                    className="border-t px-4 py-3 space-y-1.5"
                  >
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }}>Subtotal</span>
                      <span style={{ color: qrText }} className="font-semibold">{formatCurrency(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: qrText }} className="font-bold">Total</span>
                      <span style={{ color: qrPrimary }} className="text-base font-extrabold tabular-nums">{formatCurrency(cartTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Section C – Payment Method */}
                <div className="space-y-3">
                  <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs font-bold uppercase tracking-wide">Metode Pembayaran</p>

                  {/* Card 1 – Bayar Langsung */}
                  <div
                    className="w-full rounded-2xl border-2 transition-all overflow-hidden"
                    style={{
                      borderColor: selectedPaymentMethod === 'cash' ? qrPrimary : 'var(--qr-border)',
                      backgroundColor: selectedPaymentMethod === 'cash' ? 'color-mix(in srgb, var(--qr-primary) 3%, var(--qr-surface))' : 'transparent',
                    }}
                  >
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        setSelectedPaymentMethod('cash')
                        setNameError('')
                      }}
                      disabled={ordering}
                      className="w-full group flex items-start gap-4 p-4 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--qr-primary) 15%, transparent)',
                          color: qrPrimary,
                        }}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009 9.35c.66 0 1.282-.213 1.79-.577a3.001 3.001 0 003.71 0c.508.364 1.13.577 1.79.577.66 0 1.282-.213 1.79-.577a3.001 3.001 0 003.75.615" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p style={{ color: qrText }} className="font-bold">Bayar Langsung</p>
                          <span
                            className="h-4 w-4 rounded-full border flex items-center justify-center transition"
                            style={{
                              borderColor: selectedPaymentMethod === 'cash' ? qrPrimary : 'var(--qr-border)',
                              backgroundColor: selectedPaymentMethod === 'cash' ? qrPrimary : 'transparent',
                            }}
                          >
                            {selectedPaymentMethod === 'cash' && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                        </div>
                        <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs mt-0.5 leading-snug">Bayar di kasir, tempat pickup, atau lokasi yang disepakati.</p>
                      </div>
                    </motion.button>

                    {/* Form Nama Pembeli for Bayar Langsung */}
                    {selectedPaymentMethod === 'cash' && (
                      <div
                        className="px-4 pb-4 pt-1 border-t space-y-3"
                        style={{ borderColor: 'var(--qr-border)' }}
                      >
                        <div>
                          <label
                            htmlFor="customer-name-field"
                            className="block text-xs font-bold"
                            style={{ color: qrText }}
                          >
                            Nama Pembeli <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="customer-name-field"
                            type="text"
                            value={customerName}
                            onChange={(e) => {
                              setCustomerName(e.target.value)
                              if (nameError) setNameError('')
                            }}
                            placeholder="Masukkan nama pembeli"
                            className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2"
                            style={{
                              backgroundColor: 'var(--qr-surface)',
                              borderColor: nameError ? '#ef4444' : 'var(--qr-border)',
                              color: qrText,
                            }}
                          />
                          {nameError ? (
                            <p className="mt-1 text-xs font-semibold text-rose-500">{nameError}</p>
                          ) : (
                            <p
                              className="mt-1 text-[11px] leading-relaxed"
                              style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }}
                            >
                              Nama ini akan digunakan kasir untuk memanggil dan mencocokkan pesanan Anda.
                            </p>
                          )}
                        </div>

                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleOrder('cash')}
                          disabled={ordering}
                          className={`w-full py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${qrBtnRadius}`}
                          style={{ backgroundColor: qrBtn }}
                        >
                          {ordering ? (
                            <span className="inline-flex items-center justify-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Memproses Pesanan...
                            </span>
                          ) : (
                            'Konfirmasi Pesanan'
                          )}
                        </motion.button>
                      </div>
                    )}
                  </div>

                  {/* Card QRIS – Only visible if isQrisAvailable */}
                  {isQrisAvailable && (
                    <div
                      className="w-full rounded-2xl border-2 transition-all overflow-hidden"
                      style={{
                        borderColor: selectedPaymentMethod === 'qris' ? qrPrimary : 'var(--qr-border)',
                        backgroundColor: selectedPaymentMethod === 'qris' ? 'color-mix(in srgb, var(--qr-primary) 3%, var(--qr-surface))' : 'transparent',
                      }}
                    >
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.005 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => {
                          setSelectedPaymentMethod('qris')
                          setNameError('')
                        }}
                        disabled={ordering}
                        className="w-full group flex items-start gap-4 p-4 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--qr-primary) 15%, transparent)',
                            color: qrPrimary,
                          }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 15h2.25v2.25H13.5V15zM16.5 18h2.25v2.25H16.5V18zM18.75 15H21v2.25h-2.25V15zM13.5 18.75h2.25V21H13.5v-2.25zM18.75 18.75H21V21h-2.25v-2.25z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p style={{ color: qrText }} className="font-bold">QRIS</p>
                            <span
                              className="h-4 w-4 rounded-full border flex items-center justify-center transition"
                              style={{
                                borderColor: selectedPaymentMethod === 'qris' ? qrPrimary : 'var(--qr-border)',
                                backgroundColor: selectedPaymentMethod === 'qris' ? qrPrimary : 'transparent',
                              }}
                            >
                              {selectedPaymentMethod === 'qris' && (
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                          </div>
                          <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-xs mt-0.5 leading-snug">
                            Scan QRIS menggunakan e-wallet atau mobile banking.
                          </p>
                        </div>
                      </motion.button>

                      {/* Optional Name & Confirmation button for QRIS */}
                      {selectedPaymentMethod === 'qris' && (
                        <div
                          className="px-4 pb-4 pt-1 border-t space-y-3"
                          style={{ borderColor: 'var(--qr-border)' }}
                        >
                          <div>
                            <label
                              htmlFor="customer-name-qris"
                              className="block text-xs font-bold"
                              style={{ color: qrText }}
                            >
                              Nama Pembeli (Opsional)
                            </label>
                            <input
                              id="customer-name-qris"
                              type="text"
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              placeholder="Masukkan nama pembeli"
                              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2"
                              style={{
                                backgroundColor: 'var(--qr-surface)',
                                borderColor: 'var(--qr-border)',
                                color: qrText,
                              }}
                            />
                          </div>

                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleOrder('qris')}
                            disabled={ordering}
                            className={`w-full py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${qrBtnRadius}`}
                            style={{ backgroundColor: qrBtn }}
                          >
                            {ordering ? (
                              <span className="inline-flex items-center justify-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Menyiapkan QRIS...
                              </span>
                            ) : (
                              'Lanjut Pembayaran QRIS'
                            )}
                          </motion.button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isQrisAvailable && (
                    <div
                      className="rounded-2xl border p-3.5 text-center"
                      style={{
                        borderColor: 'var(--qr-border)',
                        backgroundColor: 'color-mix(in srgb, var(--qr-text) 3%, transparent)',
                      }}
                    >
                      <p style={{ color: qrText }} className="text-xs font-semibold">
                        QRIS Merchant belum diaktifkan oleh penjual.
                      </p>
                      <p style={{ color: 'color-mix(in srgb, var(--qr-text) 60%, transparent)' }} className="text-[11px] mt-0.5">
                        Silakan pilih "Bayar Langsung" untuk memesan dan menyelesaikan pembayaran di kasir.
                      </p>
                    </div>
                  )}
                </div>

                {/* Error Alert */}
                {orderError && (
                  <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                    <div className="shrink-0 mt-0.5">
                      <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-rose-500 leading-snug">{orderError}</p>
                  </div>
                )}

                {/* Security footnote */}
                <div className="flex items-center justify-center gap-1.5 pb-1">
                  <svg style={{ color: 'color-mix(in srgb, var(--qr-text) 50%, transparent)' }} className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <p style={{ color: 'color-mix(in srgb, var(--qr-text) 50%, transparent)' }} className="text-[11px] font-medium">Pembayaran aman & terkonfirmasi otomatis</p>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
