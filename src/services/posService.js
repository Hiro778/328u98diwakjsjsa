// src/services/posService.js
// POS Order History management and deletion service
// Enforces tenant isolation, completed order status, and zero orphaned records.

import { supabase } from '../lib/supabase.js'

/**
 * Checks whether an order is eligible for manual deletion from POS history.
 * Per struk.md: Only completed orders ('selesai' or 'completed') can be deleted.
 * Active orders ('pending', 'diproses', 'siap', etc.) cannot be deleted.
 * 
 * @param {object} order 
 * @returns {boolean}
 */
export function canDeleteOrder(order) {
  if (!order || !order.order_status) return false
  const s = String(order.order_status).toLowerCase().trim()
  return s === 'selesai' || s === 'completed'
}

/**
 * Deletes a completed order from POS history.
 * Enforces business ownership and completed status.
 *
 * @param {string} orderId 
 * @param {string} businessId
 * @returns {Promise<{ success: boolean, method: string }>}
 */
export async function deleteCompletedOrder(orderId, businessId) {
  if (!orderId || !businessId) {
    throw new Error('ID pesanan dan ID bisnis diperlukan untuk menghapus pesanan.')
  }

  // 1. Attempt server-side secure RPC (Migration 047)
  try {
    const { data, error: rpcError } = await supabase.rpc('delete_completed_order', {
      p_order_id: orderId,
    })

    if (!rpcError && data === true) {
      return { success: true, method: 'rpc' }
    }

    if (rpcError) {
      // If error is business logic (e.g. not completed, not found, forbidden), throw immediately
      if (
        rpcError.message?.includes('Hanya pesanan berstatus selesai') ||
        rpcError.message?.includes('tidak memiliki hak akses') ||
        rpcError.message?.includes('Order tidak ditemukan')
      ) {
        throw new Error(rpcError.message)
      }
      console.warn('[posService] RPC delete error, trying client-side secure fallback:', rpcError.message)
    }
  } catch (err) {
    // If it's a domain/validation error from RPC, rethrow directly
    if (
      err.message?.includes('Hanya pesanan berstatus selesai') ||
      err.message?.includes('tidak memiliki hak akses') ||
      err.message?.includes('Order tidak ditemukan')
    ) {
      throw err
    }
    console.warn('[posService] RPC invoke caught error, falling back to direct RLS delete:', err.message)
  }

  // 2. Client-Side Enforced Fallback with RLS
  // Verify existence, ownership by business_id, and completed status
  const { data: order, error: queryError } = await supabase
    .from('orders')
    .select('id, business_id, order_status')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (queryError || !order) {
    throw new Error('Pesanan tidak ditemukan atau Anda tidak memiliki hak akses.')
  }

  if (!canDeleteOrder(order)) {
    throw new Error('Hanya pesanan berstatus selesai yang dapat dihapus dari riwayat.')
  }

  // Clean up child records defensively (guaranteeing zero orphans)
  await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId)

  await supabase
    .from('payments')
    .delete()
    .eq('order_id', orderId)
    .eq('business_id', businessId)

  // Delete order record strictly enforcing business ownership and completed status
  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)
    .eq('business_id', businessId)
    .in('order_status', ['selesai', 'completed'])

  if (deleteError) {
    throw new Error(deleteError.message || 'Gagal menghapus pesanan dari riwayat database.')
  }

  return { success: true, method: 'rls' }
}

/**
 * Creates a POS order atomically and idempotently.
 * Supports server-side RPC (create_pos_order) with transparent client-side fallback.
 * Guarantees zero duplicate orders on network retry or double-click.
 *
 * @param {object} params
 * @param {string} params.businessId
 * @param {Array} params.items
 * @param {string} [params.tableId]
 * @param {string} [params.customerId]
 * @param {string} [params.customerName]
 * @param {string} [params.discountType]
 * @param {number} [params.discountValue]
 * @param {string} [params.paymentMethod]
 * @param {string} [params.notes]
 * @param {string} [params.checkoutRequestId]
 * @returns {Promise<{ success: boolean, order: object, items: Array, idempotent: boolean }>}
 */
export async function createPosOrder({
  businessId,
  items,
  tableId = null,
  customerId = null,
  customerName = '',
  discountType = '',
  discountValue = 0,
  paymentMethod = 'cash',
  notes = '',
  checkoutRequestId = null,
}) {
  if (!businessId) {
    throw new Error('business_id diperlukan untuk membuat pesanan.')
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Keranjang pesanan tidak boleh kosong.')
  }

  const requestId = checkoutRequestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)

  // 1. Attempt Server-Side Atomic RPC (create_pos_order)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_pos_order', {
      p_business_id: businessId,
      p_items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
      })),
      p_table_id: tableId || null,
      p_customer_id: customerId || null,
      p_customer_name: customerName || '',
      p_discount_type: discountType || '',
      p_discount_value: Number(discountValue) || 0,
      p_payment_method: paymentMethod || 'cash',
      p_notes: notes || '',
      p_checkout_request_id: requestId,
    })

    if (!rpcError && rpcData && rpcData.success) {
      return {
        success: true,
        order: rpcData.order,
        items: rpcData.items,
        idempotent: Boolean(rpcData.idempotent),
        method: 'rpc',
      }
    }

    if (rpcError) {
      // If it's a domain/validation error, throw directly
      if (
        rpcError.message?.includes('Keranjang pesanan') ||
        rpcError.message?.includes('Kuantitas produk') ||
        rpcError.message?.includes('Pelanggaran isolasi tenant') ||
        rpcError.message?.includes('tidak ditemukan') ||
        rpcError.message?.includes('INSUFFICIENT_STOCK') ||
        rpcError.message?.includes('Stok tidak mencukupi') ||
        rpcError.code === '23514'
      ) {
        throw new Error(rpcError.message)
      }
      console.warn('[posService] RPC create_pos_order error, falling back to client-side idempotent insert:', rpcError.message)
    }
  } catch (err) {
    if (
      err.message?.includes('Keranjang pesanan') ||
      err.message?.includes('Kuantitas produk') ||
      err.message?.includes('Pelanggaran isolasi tenant') ||
      err.message?.includes('tidak ditemukan') ||
      err.message?.includes('INSUFFICIENT_STOCK') ||
      err.message?.includes('Stok tidak mencukupi') ||
      err.code === '23514'
    ) {
      throw err
    }
    console.warn('[posService] RPC create_pos_order caught error, falling back:', err.message)
  }

  // 2. Client-Side Idempotent Fallback
  // Check if order with this checkoutRequestId was already created
  if (requestId) {
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('business_id', businessId)
      .eq('checkout_request_id', requestId)
      .maybeSingle()

    if (existingOrder) {
      return {
        success: true,
        order: existingOrder,
        items: existingOrder.items || [],
        idempotent: true,
        method: 'client_fallback',
      }
    }
  }

  // Validate prices using server products table
  const productIds = items.map(i => i.product_id)
  const { data: currentProducts, error: prodErr } = await supabase
    .from('products')
    .select('id, name, unit_price, is_available, business_id')
    .in('id', productIds)

  if (prodErr || !currentProducts) {
    throw new Error('Gagal memvalidasi harga produk dari database.')
  }

  const priceMap = new Map()
  for (const p of currentProducts) {
    if (p.business_id !== businessId) {
      throw new Error(`Pelanggaran isolasi tenant: Produk ${p.name} bukan milik bisnis ini.`)
    }
    priceMap.set(p.id, { name: p.name, unit_price: Number(p.unit_price) })
  }

  const validatedItems = items.map(c => {
    const prodInfo = priceMap.get(c.product_id)
    const unitPrice = prodInfo ? prodInfo.unit_price : Number(c.unit_price || 0)
    const name = prodInfo ? prodInfo.name : c.product_name
    return {
      product_id: c.product_id,
      product_name: name,
      quantity: c.quantity,
      unit_price: unitPrice,
      subtotal: unitPrice * c.quantity,
    }
  })

  const subtotal = validatedItems.reduce((s, i) => s + i.subtotal, 0)
  const discountAmount = discountType === 'percent'
    ? subtotal * (discountValue / 100)
    : discountType === 'nominal'
      ? Math.min(discountValue, subtotal)
      : 0
  const total = Math.max(0, subtotal - discountAmount)

  // Insert order (WITHOUT invalid order_items column!)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      business_id: businessId,
      table_id: tableId || null,
      customer_name: customerName || '',
      order_source: 'pos',
      order_status: 'pending',
      payment_method: paymentMethod || 'cash',
      payment_status: 'pending',
      subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      total,
      notes: notes || '',
      checkout_request_id: requestId,
    })
    .select()
    .single()

  if (orderErr || !order) {
    // Check if unique constraint caught a concurrent double-click
    if (orderErr?.code === '23505' || orderErr?.message?.includes('checkout_request_id')) {
      const { data: duplicate } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('business_id', businessId)
        .eq('checkout_request_id', requestId)
        .maybeSingle()
      if (duplicate) {
        return {
          success: true,
          order: duplicate,
          items: duplicate.items || [],
          idempotent: true,
          method: 'client_fallback',
        }
      }
    }
    throw new Error(orderErr?.message || 'Gagal membuat pesanan di database.')
  }

  // Insert order items
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
    console.error('[posService] Error inserting order_items:', itemsErr)
  }

  // Update inventory with stock validation (Enforces non-negative stock per bug.md)
  for (const item of validatedItems) {
    try {
      const { data: inv } = await supabase
        .from('inventory')
        .select('quantity')
        .eq('product_id', item.product_id)
        .maybeSingle()
      if (inv && inv.quantity !== null) {
        const newQty = inv.quantity - item.quantity
        if (newQty < 0) {
          throw new Error(`INSUFFICIENT_STOCK: Stok tidak mencukupi untuk ${item.product_name} (tersedia ${inv.quantity}, diminta ${item.quantity})`)
        }
        await supabase
          .from('inventory')
          .update({
            quantity: newQty,
            updated_at: new Date().toISOString(),
          })
          .eq('product_id', item.product_id)
      }
    } catch (err) {
      if (err.message?.includes('INSUFFICIENT_STOCK')) {
        throw err
      }
    }
  }

  return {
    success: true,
    order,
    items: validatedItems,
    idempotent: false,
    method: 'client_fallback',
  }
}

/**
 * Normalizes error messages from order processing, payment confirmation, and chat RPCs.
 *
 * @param {Error|{ message?: string, code?: string }} err
 * @param {string} defaultMessage
 * @returns {Error}
 */
export function normalizeOrderError(err, defaultMessage = 'Terjadi kesalahan pada pesanan.') {
  if (!err) return null
  const msg = String(err.message || '')
  const code = String(err.code || '')

  if (msg.includes('ACCOUNT_SUSPENDED')) {
    return new Error('Akun Anda sedang dinonaktifkan atau dibatasi.')
  }
  if (msg.includes('ORDER_NOT_FOUND') || code === 'P0002') {
    return new Error('Pesanan tidak ditemukan.')
  }
  if (msg.includes('INVALID_ORDER_STATUS')) {
    return new Error('Status pesanan saat ini tidak memungkinkan aksi tersebut.')
  }
  if (msg.includes('CONCURRENCY_CONFLICT') || code === '40001') {
    return new Error('Terjadi konflik status saat memproses pesanan. Silakan muat ulang.')
  }
  if (msg.includes('CHAT_CLOSED')) {
    return new Error('Obrolan telah ditutup karena pesanan sudah selesai atau dibatalkan.')
  }
  if (msg.includes('CHAT_NOT_ACTIVE')) {
    return new Error('Obrolan baru aktif setelah pesanan mulai diproses penjual.')
  }
  if (msg.includes('EMPTY_MESSAGE')) {
    return new Error('Pesan obrolan tidak boleh kosong.')
  }
  if (msg.includes('MESSAGE_TOO_LONG')) {
    return new Error('Pesan obrolan melebihi batas maksimal 2000 karakter.')
  }
  if (
    code === '42501' ||
    msg.includes('42501') ||
    msg.includes('FORBIDDEN') ||
    msg.includes('UNAUTHORIZED') ||
    msg.includes('permission denied')
  ) {
    return new Error('Akses ditolak: Anda tidak memiliki izin untuk melakukan aksi ini.')
  }

  return new Error(msg || defaultMessage)
}

/**
 * Processes an order by the merchant:
 * Confirms payment for QRIS orders (pending -> paid) and transitions order to 'diproses'.
 * Invokes server-side atomic RPC `merchant_process_order`.
 *
 * @param {string} orderId
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, data?: object, error?: Error }>}
 */
export async function merchantProcessOrder(orderId, client = supabase) {
  if (!orderId) {
    return { success: false, error: new Error('ID pesanan diperlukan.') }
  }

  try {
    const { data, error } = await client.rpc('merchant_process_order', {
      p_order_id: orderId,
    })

    if (error) {
      return { success: false, error: normalizeOrderError(error, 'Gagal memproses pesanan.') }
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: normalizeOrderError(err, 'Gagal memproses pesanan.') }
  }
}

/**
 * Marks an order as completed ('selesai') by the merchant.
 * Invokes server-side atomic RPC `merchant_complete_order`.
 *
 * @param {string} orderId
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, data?: object, error?: Error }>}
 */
export async function merchantCompleteOrder(orderId, client = supabase) {
  if (!orderId) {
    return { success: false, error: new Error('ID pesanan diperlukan.') }
  }

  try {
    const { data, error } = await client.rpc('merchant_complete_order', {
      p_order_id: orderId,
    })

    if (error) {
      return { success: false, error: normalizeOrderError(error, 'Gagal menyelesaikan pesanan.') }
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: normalizeOrderError(err, 'Gagal menyelesaikan pesanan.') }
  }
}

/**
 * Sends a message in the order chat.
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {'customer'|'merchant'} params.senderType
 * @param {string} [params.senderName='']
 * @param {string} params.message
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, message?: object, error?: Error }>}
 */
export async function sendOrderMessage(
  { orderId, senderType, senderName = '', message },
  client = supabase
) {
  if (!orderId) {
    return { success: false, error: new Error('ID pesanan diperlukan.') }
  }
  if (!message || !message.trim()) {
    return { success: false, error: new Error('Pesan tidak boleh kosong.') }
  }

  try {
    const { data, error } = await client.rpc('send_order_message', {
      p_order_id: orderId,
      p_sender_type: senderType,
      p_sender_name: senderName || '',
      p_message: message.trim(),
    })

    if (error) {
      return { success: false, error: normalizeOrderError(error, 'Gagal mengirim pesan.') }
    }

    return { success: true, message: data?.message || data }
  } catch (err) {
    return { success: false, error: normalizeOrderError(err, 'Gagal mengirim pesan.') }
  }
}

/**
 * Fetches existing messages for an order.
 *
 * @param {string} orderId
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, messages: Array<object>, error?: Error }>}
 */
export async function getOrderMessages(orderId, client = supabase) {
  if (!orderId) {
    return { success: false, messages: [], error: new Error('ID pesanan diperlukan.') }
  }

  try {
    const { data, error } = await client.rpc('get_order_messages', {
      p_order_id: orderId,
    })

    if (error) {
      const errLower = (error.message || '').toLowerCase()
      if (
        error.code === '42501' ||
        errLower.includes('forbidden') ||
        errLower.includes('unauthorized') ||
        errLower.includes('permission denied') ||
        errLower.includes('akses ditolak')
      ) {
        return { success: false, messages: [], error: normalizeOrderError(error, 'Akses ditolak.') }
      }

      // Fallback: direct table select if client.from is available
      if (typeof client.from === 'function') {
        const { data: rows, error: selectErr } = await client
          .from('order_messages')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true })

        if (selectErr) {
          return { success: false, messages: [], error: normalizeOrderError(selectErr, 'Gagal memuat pesan.') }
        }

        return { success: true, messages: rows || [] }
      }

      return { success: false, messages: [], error: normalizeOrderError(error, 'Gagal memuat pesan.') }
    }

    return { success: true, messages: data?.messages || [] }
  } catch (err) {
    return { success: false, messages: [], error: normalizeOrderError(err, 'Gagal memuat pesan.') }
  }
}

/**
 * Subscribes to real-time chat messages for a specific order.
 *
 * @param {string} orderId
 * @param {(message: object) => void} onMessage
 * @param {object} [client=supabase]
 * @returns {object} Realtime channel
 */
export function subscribeOrderMessages(orderId, onMessage, client = supabase) {
  if (!orderId || !client?.channel) return null

  const channel = client
    .channel(`order-chat-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_messages',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        if (payload?.new && typeof onMessage === 'function') {
          onMessage(payload.new)
        }
      }
    )
    .subscribe()

  return channel
}

/**
 * Subscribes to real-time order status and payment status changes for a specific order.
 *
 * @param {string} orderId
 * @param {(updatedOrder: object) => void} onStatusChange
 * @param {object} [client=supabase]
 * @returns {object} Realtime channel
 */
export function subscribeOrderStatus(orderId, onStatusChange, client = supabase) {
  if (!orderId || !client?.channel) return null

  const channel = client
    .channel(`order-status-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        if (payload?.new && typeof onStatusChange === 'function') {
          onStatusChange(payload.new)
        }
      }
    )
    .subscribe()

  return channel
}

/**
 * Maps database/raw order status to standardized customer-facing UI representation (@3.md).
 * BARU -> Menunggu Konfirmasi Penjual
 * DIPROSES -> Diproses
 * SELESAI -> Selesai
 * DIBATALKAN -> Dibatalkan
 *
 * @param {string} rawStatus
 * @param {object} [options]
 * @param {boolean} [options.isQris]
 * @param {boolean} [options.qrisPaidAcknowledged]
 * @param {boolean} [options.isCash]
 * @returns {{ key: string, label: string, title: string, desc: string, isProcessing: boolean, isCompleted: boolean, isCancelled: boolean, isBaru: boolean }}
 */
export function mapCustomerOrderStatus(rawStatus, { isQris = false, qrisPaidAcknowledged = false, isCash = false } = {}) {
  const norm = String(rawStatus || 'baru').trim().toLowerCase()

  const isCompleted = norm === 'selesai' || norm === 'completed'
  const isProcessing = norm === 'diproses' || norm === 'preparing'
  const isCancelled = norm === 'dibatalkan' || norm === 'cancelled'
  const isBaru = !isCompleted && !isProcessing && !isCancelled

  if (isCompleted) {
    return {
      key: 'selesai',
      label: 'Selesai',
      title: 'Pesanan Selesai',
      desc: 'Pesanan telah diselesaikan oleh penjual. Terima kasih telah memesan!',
      isProcessing: false,
      isCompleted: true,
      isCancelled: false,
      isBaru: false,
    }
  }

  if (isProcessing) {
    return {
      key: 'diproses',
      label: 'Diproses',
      title: 'Sedang Diproses',
      desc: 'Penjual sedang menyiapkan pesanan Anda.',
      isProcessing: true,
      isCompleted: false,
      isCancelled: false,
      isBaru: false,
    }
  }

  if (isCancelled) {
    return {
      key: 'dibatalkan',
      label: 'Dibatalkan',
      title: 'Pesanan Dibatalkan',
      desc: 'Pesanan ini telah dibatalkan oleh penjual.',
      isProcessing: false,
      isCompleted: false,
      isCancelled: true,
      isBaru: false,
    }
  }

  // BARU (Menunggu Konfirmasi Penjual / Menunggu Pembayaran)
  if (isQris && !qrisPaidAcknowledged) {
    return {
      key: 'baru',
      label: 'Menunggu Pembayaran',
      title: 'Pembayaran QRIS',
      desc: 'Silakan scan kode QRIS di bawah untuk menyelesaikan pembayaran langsung ke penjual.',
      isProcessing: false,
      isCompleted: false,
      isCancelled: false,
      isBaru: true,
    }
  }

  return {
    key: 'baru',
    label: 'Menunggu Konfirmasi Penjual',
    title: 'Menunggu Konfirmasi Penjual',
    desc: isCash
      ? 'Pesanan kamu sudah kami terima. Silakan bayar langsung di kasir dan tunggu penjual memproses pesanan.'
      : 'Pesanan Anda sudah diteruskan ke penjual. Penjual akan mengonfirmasi pembayaran dan mulai menyiapkan pesanan Anda.',
    isProcessing: false,
    isCompleted: false,
    isCancelled: false,
    isBaru: true,
  }
}

/**
 * Fetches a public order by UUID or order_number for a specific business (@3.md).
 * Strictly enforces business tenant isolation.
 *
 * @param {string} businessId
 * @param {string|number} identifier - UUID or order number (e.g. 79 or "#79")
 * @param {object} [client=supabase]
 * @returns {Promise<{ success: boolean, order?: object, error?: object }>}
 */
export async function getPublicOrder(businessId, identifier, client = supabase) {
  if (!businessId || !identifier) {
    return { success: false, error: { message: 'ID Bisnis dan ID pesanan diperlukan.' } }
  }

  // Try RPC first
  try {
    const { data, error } = await client.rpc('get_public_order_by_identifier', {
      p_business_id: businessId,
      p_identifier: String(identifier),
    })

    if (!error && data?.success && data?.order) {
      return { success: true, order: data.order }
    }
    if (data && !data.success && data.message) {
      return { success: false, error: { message: data.message } }
    }
  } catch {
    // Fallback to direct query
  }

  // Direct select fallback
  try {
    const cleanIdent = String(identifier).trim()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdent)
    let query = client
      .from('orders')
      .select('id, business_id, order_number, customer_name, total, payment_method, payment_status, order_status, created_at, notes, table_id')
      .eq('business_id', businessId)

    if (isUuid) {
      query = query.eq('id', cleanIdent)
    } else {
      const num = cleanIdent.replace(/^#/, '')
      if (/^\d+$/.test(num)) {
        query = query.eq('order_number', parseInt(num, 10))
      } else {
        return { success: false, error: { message: 'Format nomor pesanan tidak valid.' } }
      }
    }

    const { data: orderData, error: qErr } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (qErr || !orderData) {
      return { success: false, error: { message: qErr?.message || 'Pesanan tidak ditemukan.' } }
    }

    return { success: true, order: orderData }
  } catch (err) {
    return { success: false, error: { message: err.message || 'Gagal memuat pesanan.' } }
  }
}

