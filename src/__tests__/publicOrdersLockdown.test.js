import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { createClient } from '@supabase/supabase-js'
import { getPublicOrder, subscribeOrderStatus } from '../services/posService.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasRemote = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceKey)

describe('Security Remediation: Priority #2 — Public QR Order & Customer Data Lockdown', () => {
  // Unit tests that do not depend on remote DB
  describe('Unit & Interface Tests', () => {
    it('1. getPublicOrder calls get_public_order_by_identifier RPC with exact parameters', async () => {
      const mockBizId = '11111111-1111-1111-1111-111111111111'
      const mockOrderId = '22222222-2222-2222-2222-222222222222'
      let calledRpc = null
      let calledParams = null

      const mockClient = {
        rpc: async (fnName, params) => {
          calledRpc = fnName
          calledParams = params
          return {
            data: {
              success: true,
              order: { id: mockOrderId, order_number: 101, order_status: 'diproses' },
              items: [{ id: 'item-1', product_name: 'Kopi', quantity: 2 }],
            },
            error: null,
          }
        },
      }

      const res = await getPublicOrder(mockBizId, mockOrderId, mockClient)
      assert.strictEqual(calledRpc, 'get_public_order_by_identifier')
      assert.strictEqual(calledParams.p_business_id, mockBizId)
      assert.strictEqual(calledParams.p_identifier, mockOrderId)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.order.id, mockOrderId)
      assert.strictEqual(res.items.length, 1)
    })

    it('2. getPublicOrder propagates UUID_REQUIRED error when sequential integer is rejected', async () => {
      const mockBizId = '11111111-1111-1111-1111-111111111111'
      const mockClient = {
        rpc: async () => ({
          data: {
            success: false,
            error: 'UUID_REQUIRED',
            message: 'Akses publik memerlukan tautan pesanan lengkap (Order ID UUID).',
          },
          error: null,
        }),
      }

      const res = await getPublicOrder(mockBizId, '115', mockClient)
      assert.strictEqual(res.success, false)
      assert.match(res.error.message, /Akses publik memerlukan tautan pesanan lengkap/i)
    })

    it('3. subscribeOrderStatus sets up postgres_changes channel with exact order ID filter', () => {
      const mockOrderId = '33333333-3333-3333-3333-333333333333'
      let registeredChannel = null
      let registeredFilter = null
      let registeredTable = null

      const mockClient = {
        channel: (name) => {
          registeredChannel = name
          return {
            on: (event, config, callback) => {
              registeredTable = config.table
              registeredFilter = config.filter
              return {
                subscribe: () => ({ unsubscribe: () => {} }),
              }
            },
          }
        },
      }

      const chan = subscribeOrderStatus(mockOrderId, () => {}, mockClient)
      assert.strictEqual(registeredChannel, `order-status-${mockOrderId}`)
      assert.strictEqual(registeredTable, 'orders')
      assert.strictEqual(registeredFilter, `id=eq.${mockOrderId}`)
    })
  })

  // Remote Integration Tests against production Supabase
  describe('Remote Production Verification (@Priority #2)', { skip: !hasRemote }, () => {
    let anonClient
    let serviceClient
    const testBizId = 'e0bb2183-6e84-4e77-8cf7-85e1c5f80228'
    const testOrderId = '3ea1dea3-d04d-4172-80c8-0e13ea59aac7' // Order #116

    before(() => {
      anonClient = createClient(supabaseUrl, supabaseAnonKey)
      serviceClient = createClient(supabaseUrl, supabaseServiceKey)
    })

    it('4. Anonymous client CANNOT execute bulk SELECT * on public.orders (Permission Denied)', async () => {
      const { data, error } = await anonClient.from('orders').select('*')
      assert.strictEqual(data, null)
      assert.ok(error, 'Must return error for bulk orders select')
      assert.match(error.message, /permission denied/i)
    })

    it('5. Anonymous client CANNOT select sensitive PII customer_name on public.orders', async () => {
      const { data, error } = await anonClient.from('orders').select('id, customer_name')
      assert.strictEqual(data, null)
      assert.ok(error, 'Must reject selecting customer_name')
      assert.match(error.message, /permission denied/i)
    })

    it('6. Anonymous client CANNOT select financial total on public.orders', async () => {
      const { data, error } = await anonClient.from('orders').select('id, total')
      assert.strictEqual(data, null)
      assert.ok(error, 'Must reject selecting total')
      assert.match(error.message, /permission denied/i)
    })

    it('7. Anonymous client CANNOT select customer order notes on public.orders', async () => {
      const { data, error } = await anonClient.from('orders').select('id, notes')
      assert.strictEqual(data, null)
      assert.ok(error, 'Must reject selecting notes')
      assert.match(error.message, /permission denied/i)
    })

    it('8. Anonymous client CANNOT execute bulk SELECT * on public.order_items (Permission Denied)', async () => {
      const { data, error } = await anonClient.from('order_items').select('*')
      assert.strictEqual(data, null)
      assert.ok(error, 'Must reject bulk select on order_items')
      assert.match(error.message, /permission denied/i)
    })

    it('9. Anonymous client CANNOT harvest orders via sequential numeric order_number enumeration', async () => {
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: '116',
      })
      assert.strictEqual(data?.success, false)
      assert.strictEqual(data?.error, 'UUID_REQUIRED')
      assert.match(data?.message, /Akses publik memerlukan tautan pesanan lengkap/i)
    })

    it('10. Anonymous client CAN lookup legitimate order using 128-bit UUID capability', async () => {
      const { data, error } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: testOrderId,
      })
      assert.strictEqual(error, null)
      assert.strictEqual(data?.success, true)
      assert.strictEqual(data?.order?.id, testOrderId)
      assert.strictEqual(data?.order?.order_number, 116)
      assert.ok(Array.isArray(data?.items), 'Must return line items for valid UUID lookup')
    })

    it('11. UUID lookup rejects cross-tenant substitution (Business ID mismatch)', async () => {
      const foreignBizId = '00000000-0000-0000-0000-000000000000'
      const { data } = await anonClient.rpc('get_public_order_by_identifier', {
        p_business_id: foreignBizId,
        p_identifier: testOrderId,
      })
      assert.strictEqual(data?.success, false)
    })

    it('12. Authenticated business owner CAN lookup by sequential order_number', async () => {
      // Fetch owner of business
      const { data: biz } = await serviceClient
        .from('businesses')
        .select('owner_id')
        .eq('id', testBizId)
        .single()
      assert.ok(biz?.owner_id)

      const { data: user } = await serviceClient.auth.admin.getUserById(biz.owner_id)
      const { data: link } = await serviceClient.auth.admin.generateLink({
        type: 'magiclink',
        email: user.user.email,
      })

      const ownerClient = createClient(supabaseUrl, supabaseAnonKey)
      await ownerClient.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: 'magiclink',
      })

      const { data: ownerRes, error: rpcErr } = await ownerClient.rpc('get_public_order_by_identifier', {
        p_business_id: testBizId,
        p_identifier: '116',
      })

      assert.strictEqual(rpcErr, null)
      assert.strictEqual(ownerRes?.success, true)
      assert.strictEqual(ownerRes?.order?.order_number, 116)
      assert.ok(ownerRes?.order?.customer_name, 'Owner can see customer name')
    })
  })
})
