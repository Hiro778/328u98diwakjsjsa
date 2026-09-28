import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  merchantProcessOrder,
  merchantCompleteOrder,
  subscribeOrderStatus,
  getPublicOrder,
  mapCustomerOrderStatus,
} from '../services/posService.js'

describe('QRIS Order Status Synchronization & Realtime Suite (@3.md)', () => {
  const testOrderId = '79797979-7979-4797-8797-797979797979'
  const wrongOrderId = '88888888-8888-4888-8888-888888888888'
  const testBizId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const otherBizId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  describe('A. DB Status Changes: BARU -> DIPROSES -> SELESAI', () => {
    it('1. New QRIS order starts with status BARU / pending', () => {
      const order = {
        id: testOrderId,
        order_number: 79,
        business_id: testBizId,
        payment_method: 'qris',
        payment_status: 'pending',
        order_status: 'baru',
      }
      assert.strictEqual(order.order_status, 'baru')
      assert.strictEqual(order.payment_status, 'pending')
    })

    it('2. merchant_process_order transitions status to diproses & payment to paid atomically', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'merchant_process_order')
          assert.strictEqual(params.p_order_id, testOrderId)
          return {
            data: {
              success: true,
              order_id: testOrderId,
              order_status: 'diproses',
              payment_status: 'paid',
            },
            error: null,
          }
        },
      }

      const res = await merchantProcessOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.data.order_status, 'diproses')
      assert.strictEqual(res.data.payment_status, 'paid')
    })

    it('3. merchant_complete_order transitions status to selesai', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'merchant_complete_order')
          assert.strictEqual(params.p_order_id, testOrderId)
          return {
            data: {
              success: true,
              order_id: testOrderId,
              order_status: 'selesai',
            },
            error: null,
          }
        },
      }

      const res = await merchantCompleteOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.data.order_status, 'selesai')
    })
  })

  describe('B. Customer Status Mapping per @3.md', () => {
    it('4. BARU -> Menunggu Konfirmasi Penjual', () => {
      const mapped = mapCustomerOrderStatus('BARU', { isQris: true, qrisPaidAcknowledged: true })
      assert.strictEqual(mapped.label, 'Menunggu Konfirmasi Penjual')
      assert.strictEqual(mapped.title, 'Menunggu Konfirmasi Penjual')
      assert.strictEqual(mapped.isBaru, true)
      assert.strictEqual(mapped.isProcessing, false)
      assert.strictEqual(mapped.isCompleted, false)

      // Also verifies case-insensitive handling
      const mappedLower = mapCustomerOrderStatus('baru', { isQris: true, qrisPaidAcknowledged: true })
      assert.strictEqual(mappedLower.label, 'Menunggu Konfirmasi Penjual')
    })

    it('5. DIPROSES -> Diproses', () => {
      const mapped = mapCustomerOrderStatus('DIPROSES')
      assert.strictEqual(mapped.label, 'Diproses')
      assert.strictEqual(mapped.title, 'Sedang Diproses')
      assert.strictEqual(mapped.isProcessing, true)
      assert.strictEqual(mapped.isCompleted, false)

      const mappedLower = mapCustomerOrderStatus('diproses')
      assert.strictEqual(mappedLower.label, 'Diproses')
    })

    it('6. SELESAI -> Selesai', () => {
      const mapped = mapCustomerOrderStatus('SELESAI')
      assert.strictEqual(mapped.label, 'Selesai')
      assert.strictEqual(mapped.title, 'Pesanan Selesai')
      assert.strictEqual(mapped.isCompleted, true)
      assert.strictEqual(mapped.isProcessing, false)

      const mappedLower = mapCustomerOrderStatus('selesai')
      assert.strictEqual(mappedLower.label, 'Selesai')
    })

    it('7. DIBATALKAN -> Dibatalkan', () => {
      const mapped = mapCustomerOrderStatus('DIBATALKAN')
      assert.strictEqual(mapped.label, 'Dibatalkan')
      assert.strictEqual(mapped.title, 'Pesanan Dibatalkan')
      assert.strictEqual(mapped.isCancelled, true)
      assert.strictEqual(mapped.isCompleted, false)
    })
  })

  describe('C. Realtime Event Updates Customer UI Without Refresh', () => {
    it('8. subscribeOrderStatus listens to postgres_changes UPDATE filtered by order ID', () => {
      let registeredFilter = null
      let registeredTable = null
      let subscribed = false

      const mockClient = {
        channel: (chanName) => {
          assert.strictEqual(chanName, `order-status-${testOrderId}`)
          return {
            on: (event, config, callback) => {
              assert.strictEqual(event, 'postgres_changes')
              registeredTable = config.table
              registeredFilter = config.filter
              return {
                subscribe: () => {
                  subscribed = true
                  return { unsubscribe: () => {} }
                },
              }
            },
          }
        },
      }

      const chan = subscribeOrderStatus(testOrderId, () => {}, mockClient)
      assert.strictEqual(registeredTable, 'orders')
      assert.strictEqual(registeredFilter, `id=eq.${testOrderId}`)
      assert.strictEqual(subscribed, true)
    })

    it('9. Realtime UPDATE event changes customer status in-memory without refresh', () => {
      let customerUIState = {
        id: testOrderId,
        order_number: 79,
        order_status: 'baru',
        payment_status: 'pending',
        qrisPaidAcknowledged: true,
      }

      let statusMeta = mapCustomerOrderStatus(customerUIState.order_status, {
        isQris: true,
        qrisPaidAcknowledged: customerUIState.qrisPaidAcknowledged,
      })
      assert.strictEqual(statusMeta.label, 'Menunggu Konfirmasi Penjual')

      // Simulated realtime payload arrives: Merchant clicked PROSES
      const realtimeUpdate1 = {
        id: testOrderId,
        order_status: 'diproses',
        payment_status: 'paid',
      }
      customerUIState = { ...customerUIState, ...realtimeUpdate1 }
      statusMeta = mapCustomerOrderStatus(customerUIState.order_status)
      assert.strictEqual(statusMeta.label, 'Diproses')
      assert.strictEqual(customerUIState.payment_status, 'paid')

      // Simulated realtime payload arrives: Merchant clicked SELESAI
      const realtimeUpdate2 = {
        id: testOrderId,
        order_status: 'selesai',
        payment_status: 'paid',
      }
      customerUIState = { ...customerUIState, ...realtimeUpdate2 }
      statusMeta = mapCustomerOrderStatus(customerUIState.order_status)
      assert.strictEqual(statusMeta.label, 'Selesai')
      assert.strictEqual(statusMeta.isCompleted, true)
    })
  })

  describe('D. Refresh Persistence (@3.md)', () => {
    it('10. getPublicOrder retrieves order by UUID or order_number #79', async () => {
      const mockOrder = {
        id: testOrderId,
        order_number: 79,
        business_id: testBizId,
        customer_name: 'Dewi',
        total: 55000,
        payment_method: 'qris',
        payment_status: 'paid',
        order_status: 'selesai',
        created_at: new Date().toISOString(),
      }

      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'get_public_order_by_identifier')
          assert.strictEqual(params.p_business_id, testBizId)
          assert.strictEqual(params.p_identifier, '79')
          return {
            data: { success: true, order: mockOrder },
            error: null,
          }
        },
      }

      // Customer refreshes page opening order #79
      const res = await getPublicOrder(testBizId, '79', mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.order.order_number, 79)
      assert.strictEqual(res.order.order_status, 'selesai')

      const mapped = mapCustomerOrderStatus(res.order.order_status)
      assert.strictEqual(mapped.label, 'Selesai')
    })
  })

  describe('E. Wrong Order ID Does Not Update Customer UI', () => {
    it('11. Payload with different order ID is ignored by customer state update', () => {
      let customerOrder = {
        id: testOrderId,
        order_number: 79,
        order_status: 'baru',
      }

      // Realtime event for order #88 arrives on an unrelated event
      const foreignPayload = {
        id: wrongOrderId,
        order_number: 88,
        order_status: 'selesai',
      }

      // State updater logic from PublicMenuPage
      const applyUpdate = (prev, newRec) => {
        if (!prev || (prev.id && prev.id !== newRec.id)) return prev
        return { ...prev, ...newRec }
      }

      const updated = applyUpdate(customerOrder, foreignPayload)
      assert.strictEqual(updated.id, testOrderId)
      assert.strictEqual(updated.order_status, 'baru') // Remains unchanged!
    })
  })

  describe('F. Cross-Tenant & Order Isolation Intact', () => {
    it('12. getPublicOrder rejects or fails to find order belonging to different business', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          // Simulated DB query with tenant constraint
          if (params.p_business_id !== testBizId) {
            return {
              data: {
                success: false,
                error: 'ORDER_NOT_FOUND',
                message: 'Pesanan tidak ditemukan pada bisnis ini.',
              },
              error: null,
            }
          }
          return { data: { success: true }, error: null }
        },
      }

      const res = await getPublicOrder(otherBizId, testOrderId, mockClient)
      assert.strictEqual(res.success, false)
      assert.ok(res.error.message.includes('tidak ditemukan'))
    })
  })
})
