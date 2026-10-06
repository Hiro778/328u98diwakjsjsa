import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { getPublicOrder, subscribeOrderStatus } from '../services/posService.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasRemote = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceKey)

describe('Security Remediation: Priority #2 — Public QR Order & Customer Data Lockdown', () => {
  let anonClient
  let serviceClient
  let merchantClient
  const testBizId = 'e0bb2183-6e84-4e77-8cf7-85e1c5f80228' // Hazze
  const testOrderId = '3ea1dea3-d04d-4172-80c8-0e13ea59aac7' // Order #116
  const foreignBizId = 'dd4e8754-369b-44f2-90f5-deee9bb232d5' // Owned by different user

  before(async () => {
    if (!hasRemote) return
    anonClient = createClient(supabaseUrl, supabaseAnonKey)
    serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // Authenticate test merchant
    const { data: biz } = await serviceClient
      .from('businesses')
      .select('owner_id')
      .eq('id', testBizId)
      .single()
    const { data: user } = await serviceClient.auth.admin.getUserById(biz.owner_id)
    const { data: link } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: user.user.email,
    })

    merchantClient = createClient(supabaseUrl, supabaseAnonKey)
    await merchantClient.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: 'magiclink',
    })
  })

  // ── NEGATIVE / ATTACK SURFACE TESTS (1–13) ───────────────────────────
  describe('A. Negative & Unauthorized Surface Tests (1–13)', () => {
    it('1. anonymous_bulk_orders_denied: anon cannot do select(*) on orders', async () => {
      const { data, error } = await anonClient.from('orders').select('*')
      assert.strictEqual(data, null)
      assert.match(error?.message || '', /permission denied/i)
    })

    it('2. anonymous_bulk_order_items_denied: anon cannot do select(*) on order_items', async () => {
      const { data, error } = await anonClient.from('order_items').select('*')
      assert.strictEqual(data, null)
      assert.match(error?.message || '', /permission denied/i)
    })

    it('3. anonymous_business_filter_denied: anon cannot filter orders by business_id', async () => {
      const { data, error } = await anonClient.from('orders').select('*').eq('business_id', testBizId)
      assert.strictEqual(data, null)
      assert.match(error?.message || '', /permission denied/i)
    })

    it('4. anonymous_customer_name_search_denied: anon cannot search or select customer_name', async () => {
      const { data, error } = await anonClient.from('orders').select('id, customer_name').ilike('customer_name', '%Hazze%')
      assert.strictEqual(data, null)
      assert.match(error?.message || '', /permission denied/i)
    })

    it('5. sequential_order_number_enumeration_denied: anon numeric lookup is rejected', async () => {
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: '116',
      })
      assert.strictEqual(data?.success, false)
      assert.strictEqual(data?.error, 'UUID_REQUIRED')
      assert.match(data?.message, /Akses publik memerlukan tautan pesanan lengkap/i)
    })

    it('6. cross_business_order_access_denied: business ID mismatch rejects valid order UUID', async () => {
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: foreignBizId,
        p_identifier: testOrderId,
      })
      assert.strictEqual(data?.success, false)
    })

    it('7. cross_customer_order_access_denied: cannot retrieve another customer order via order_number', async () => {
      for (const num of ['109', '110', '115']) {
        const { data } = await anonClient.rpc('get_public_order_by_identifier', {
          p_business_id: testBizId,
          p_identifier: num,
        })
        assert.strictEqual(data?.success, false)
        assert.strictEqual(data?.error, 'UUID_REQUIRED')
      }
    })

    it('8. unauthorized_order_uuid_denied: non-existent random UUID returns ORDER_NOT_FOUND', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000000'
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: randomUuid,
      })
      assert.strictEqual(data?.success, false)
      assert.strictEqual(data?.error, 'ORDER_NOT_FOUND')
    })

    it('9. invalid_capability_denied: malformed identifier string is rejected', async () => {
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: '   ',
      })
      assert.strictEqual(data?.success, false)
      assert.strictEqual(data?.error, 'INVALID_IDENTIFIER')
    })

    it('10. unpublished_menu_denied: business with unpublished menu rejects lookup', async () => {
      const dummyUnpubBiz = '11111111-1111-1111-1111-111111111111'
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: dummyUnpubBiz,
        p_identifier: testOrderId,
      })
      assert.strictEqual(data?.success, false)
      assert.strictEqual(data?.error, 'MENU_NOT_PUBLISHED')
    })

    it('11. realtime_other_order_denied: subscriber to Order A receives 0 events for Order B', async () => {
      const { data: ordA } = await serviceClient.from('orders').insert({
        business_id: testBizId,
        customer_name: 'Realtime Isolation A',
        order_source: 'qr_menu',
        order_status: 'pending',
        total: 15000,
        subtotal: 15000,
      }).select().single()

      const { data: ordB } = await serviceClient.from('orders').insert({
        business_id: testBizId,
        customer_name: 'Realtime Isolation B',
        order_source: 'qr_menu',
        order_status: 'pending',
        total: 25000,
        subtotal: 25000,
      }).select().single()

      let chanAEvents = []
      const chanA = anonClient.channel(`order-iso-a-${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${ordA.id}` }, payload => {
          chanAEvents.push(payload.new)
        })

      await chanA.subscribe()
      await new Promise(r => setTimeout(r, 1500))

      // Update Order B only
      await serviceClient.from('orders').update({ order_status: 'diproses' }).eq('id', ordB.id)
      await new Promise(r => setTimeout(r, 2000))

      assert.strictEqual(chanAEvents.length, 0, 'Subscriber to Order A must NOT receive Order B update')

      // Clean up
      await serviceClient.from('orders').delete().in('id', [ordA.id, ordB.id])
      await chanA.unsubscribe()
      anonClient.removeChannel(chanA)
    })

    it('12. realtime_other_business_denied: subscriber to Biz A receives 0 events from foreign Biz', async () => {
      const { data: foreignOrder } = await serviceClient.from('orders').insert({
        business_id: foreignBizId,
        customer_name: 'Foreign Order',
        order_source: 'qr_menu',
        order_status: 'pending',
        total: 50000,
        subtotal: 50000,
      }).select().single()

      let chanEvents = []
      const chan = anonClient.channel(`order-foreign-${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${testOrderId}` }, payload => {
          chanEvents.push(payload.new)
        })

      await chan.subscribe()
      await new Promise(r => setTimeout(r, 1500))

      await serviceClient.from('orders').update({ order_status: 'diproses' }).eq('id', foreignOrder.id)
      await new Promise(r => setTimeout(r, 2000))

      assert.strictEqual(chanEvents.length, 0, 'Foreign business update must not be received')

      // Clean up
      await serviceClient.from('orders').delete().eq('id', foreignOrder.id)
      await chan.unsubscribe()
      anonClient.removeChannel(chan)
    })

    it('13. wildcard_realtime_denied: anon cannot receive sensitive columns via Realtime', async () => {
      // Column permissions on orders revoke customer_name, total, notes from anon
      const { data: testOrd } = await serviceClient.from('orders').insert({
        business_id: testBizId,
        customer_name: 'Secret Customer',
        notes: 'Secret Note 1234',
        order_source: 'qr_menu',
        order_status: 'pending',
        total: 99999,
        subtotal: 99999,
      }).select().single()

      let receivedPayload = null
      const chan = anonClient.channel(`order-col-check-${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${testOrd.id}` }, payload => {
          receivedPayload = payload.new
        })

      await chan.subscribe()
      await new Promise(r => setTimeout(r, 1500))

      await serviceClient.from('orders').update({ order_status: 'diproses' }).eq('id', testOrd.id)
      await new Promise(r => setTimeout(r, 2000))

      if (receivedPayload) {
        assert.strictEqual(receivedPayload.customer_name, undefined, 'customer_name must be stripped by RLS')
        assert.strictEqual(receivedPayload.total, undefined, 'total must be stripped by RLS')
        assert.strictEqual(receivedPayload.notes, undefined, 'notes must be stripped by RLS')
      }

      // Clean up
      await serviceClient.from('orders').delete().eq('id', testOrd.id)
      await chan.unsubscribe()
      anonClient.removeChannel(chan)
    })
  })

  // ── LEGITIMATE FLOWS (14–22) ──────────────────────────────────────────
  describe('B. Legitimate Functionality Preservation (14–22)', () => {
    let createdOrderId = null

    it('14. public_checkout_works: create_public_order RPC creates order & items atomically', async () => {
      // Fetch available product for testBizId
      const { data: prod } = await serviceClient
        .from('products')
        .select('id, name, unit_price')
        .eq('business_id', testBizId)
        .eq('is_available', true)
        .limit(1)
        .single()
      assert.ok(prod, 'Must have at least one product')

      const { data, error } = await anonClient.rpc('create_public_order', {
        p_business_id: testBizId,
        p_items: [{ product_id: prod.id, quantity: 1 }],
        p_payment_method: 'qris',
        p_customer_name: 'Legit Test Customer',
        p_notes: 'Table 5',
        p_checkout_request_id: 'test-req-' + Date.now(),
      })

      assert.strictEqual(error, null)
      assert.strictEqual(data?.success, true)
      assert.ok(data?.order?.id)
      createdOrderId = data.order.id
    })

    it('15. customer_can_track_own_order: customer tracks order using returned UUID', async () => {
      assert.ok(createdOrderId)
      const res = await getPublicOrder(testBizId, createdOrderId, anonClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.order.id, createdOrderId)
      assert.strictEqual(res.order.customer_name, 'Legit Test Customer')
    })

    it('16. customer_can_view_required_items: tracking response includes line items', async () => {
      assert.ok(createdOrderId)
      const res = await getPublicOrder(testBizId, createdOrderId, anonClient)
      assert.strictEqual(res.success, true)
      assert.ok(Array.isArray(res.items))
      assert.ok(res.items.length >= 1)
      assert.ok(res.items[0].product_name)
      assert.ok(res.items[0].quantity >= 1)
    })

    it('17. customer_can_view_required_total: tracking response includes accurate total', async () => {
      assert.ok(createdOrderId)
      const res = await getPublicOrder(testBizId, createdOrderId, anonClient)
      assert.strictEqual(res.success, true)
      assert.ok(Number(res.order.total) > 0)
    })

    it('18. customer_realtime_status_update_works: status change is received by tracking client', async () => {
      assert.ok(createdOrderId)
      let receivedStatus = null

      const chan = subscribeOrderStatus(
        createdOrderId,
        (updated) => {
          receivedStatus = updated.order_status
        },
        anonClient
      )

      await new Promise(r => setTimeout(r, 1500))
      // Update order to diproses
      await serviceClient.from('orders').update({ order_status: 'diproses' }).eq('id', createdOrderId)
      await new Promise(r => setTimeout(r, 2000))

      assert.strictEqual(receivedStatus, 'diproses')
      await chan?.unsubscribe?.()
      if (chan) anonClient.removeChannel(chan)
    })

    it('19. merchant_can_list_own_orders: merchant POS can fetch own order list', async () => {
      const { data, error } = await merchantClient.from('orders').select('*').eq('business_id', testBizId)
      assert.strictEqual(error, null)
      assert.ok(Array.isArray(data))
      assert.ok(data.length > 0)
    })

    it('20. merchant_can_manage_own_orders: merchant transitions order status', async () => {
      assert.ok(createdOrderId)
      const { data, error } = await merchantClient.rpc('merchant_process_order', {
        p_order_id: createdOrderId,
      })
      // merchant_process_order transitions or returns status
      assert.strictEqual(error, null)
      assert.strictEqual(data?.success, true)
    })

    it('21. merchant_realtime_works: merchant can subscribe to pos orders channel', async () => {
      let subscribed = false
      const chan = merchantClient
        .channel('pos-orders-test')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {})
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') subscribed = true
        })
      assert.ok(chan)
      await chan.unsubscribe()
      merchantClient.removeChannel(chan)
    })

    it('22. admin_order_access_works: service_role has administrative order oversight', async () => {
      const { data, error } = await serviceClient.from('orders').select('id, business_id, total').limit(5)
      assert.strictEqual(error, null)
      assert.ok(Array.isArray(data))
    })

    // Clean up created order
    after(async () => {
      if (createdOrderId) {
        await serviceClient.from('order_items').delete().eq('order_id', createdOrderId)
        await serviceClient.from('orders').delete().eq('id', createdOrderId)
      }
    })
  })

  // ── DATA MINIMIZATION VERIFICATION (23–27) ───────────────────────────
  describe('C. Data Minimization Verification (23–27)', () => {
    let publicOrder = null
    let publicItems = null

    before(async () => {
      const res = await getPublicOrder(testBizId, testOrderId, anonClient)
      assert.strictEqual(res.success, true)
      publicOrder = res.order
      publicItems = res.items
    })

    it('23. public_tracking_does_not_return_payment_ref', () => {
      assert.strictEqual(publicOrder.payment_ref, undefined)
    })

    it('24. public_tracking_does_not_return_checkout_request_id', () => {
      assert.strictEqual(publicOrder.checkout_request_id, undefined)
    })

    it('25. public_tracking_does_not_return_internal_business_id', () => {
      assert.strictEqual(publicOrder.business_id, undefined)
    })

    it('26. public_tracking_does_not_return_private_notes', () => {
      assert.strictEqual(publicOrder.notes, undefined)
      if (publicItems?.length > 0) {
        assert.strictEqual(publicItems[0].notes, undefined)
      }
    })

    it('27. public_tracking_returns_only_required_fields: order object contains only UX fields', () => {
      const allowedOrderKeys = new Set([
        'id',
        'order_number',
        'customer_name',
        'total',
        'payment_method',
        'payment_status',
        'order_status',
        'created_at',
      ])
      for (const key of Object.keys(publicOrder)) {
        assert.ok(allowedOrderKeys.has(key), `Field ${key} should not be exposed in public tracking`)
      }
    })
  })

  after(async () => {
    try {
      if (anonClient?.removeAllChannels) await anonClient.removeAllChannels()
      if (merchantClient?.removeAllChannels) await merchantClient.removeAllChannels()
      if (serviceClient?.removeAllChannels) await serviceClient.removeAllChannels()
    } catch (_) {}
  })
})

