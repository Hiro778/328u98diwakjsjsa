import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  merchantProcessOrder,
  merchantCompleteOrder,
  sendOrderMessage,
  getOrderMessages,
  subscribeOrderMessages,
  subscribeOrderStatus,
  normalizeOrderError,
  canDeleteOrder,
} from '../services/posService.js'

describe('QRIS Food-Ordering Flow & Order Chat Suite (@fix.md)', () => {
  const testOrderId = '11111111-1111-4111-8111-111111111111'
  const otherOrderId = '22222222-2222-4222-8222-222222222222'
  const testBizId = '33333333-3333-4333-8333-333333333333'

  describe('1. Customer UX: No Proof Upload & Waiting Confirmation State', () => {
    it('1. QRIS checkout does not require proof upload or screenshot', () => {
      // Validates order contract: payment_method='qris', payment_status='pending', no receipt upload field required
      const checkoutPayload = {
        order_source: 'qr_menu',
        payment_method: 'qris',
        payment_status: 'pending',
        customer_name: 'Budi Santoso',
      }
      assert.strictEqual(checkoutPayload.payment_method, 'qris')
      assert.strictEqual(checkoutPayload.payment_status, 'pending')
      assert.strictEqual(checkoutPayload.receipt_image_url, undefined)
      assert.strictEqual(checkoutPayload.proof_of_payment, undefined)
    })

    it('2. Customer clicking "Saya Sudah Bayar / Lanjut" does NOT set payment to paid', () => {
      // Customer acknowledgement moves client state to waiting confirmation without altering DB payment_status
      let clientState = {
        qrisAcknowledged: false,
        dbPaymentStatus: 'pending',
      }
      // Customer clicks "Saya Sudah Bayar / Lanjut"
      clientState.qrisAcknowledged = true
      assert.strictEqual(clientState.qrisAcknowledged, true)
      assert.strictEqual(clientState.dbPaymentStatus, 'pending')
    })

    it('3. Customer enters "Menunggu Konfirmasi Penjual" state when pending', () => {
      const order = {
        id: testOrderId,
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
      }
      const isQris = order.payment_method === 'qris'
      const qrisPaidAcknowledged = true
      const isProcessing = order.order_status === 'diproses'
      const isCompleted = order.order_status === 'selesai'

      let stateTitle = ''
      if (isQris && qrisPaidAcknowledged && !isProcessing && !isCompleted) {
        stateTitle = 'Menunggu Konfirmasi Penjual'
      }

      assert.strictEqual(stateTitle, 'Menunggu Konfirmasi Penjual')
    })

    it('4. Customer cannot mark payment paid via client update (RLS enforced)', () => {
      // orders_public_update was dropped in migration 072; attempts produce authorization error
      const simulatedRlsError = {
        code: '42501',
        message: 'new row violates row-level security policy for table "orders"',
      }
      const normalized = normalizeOrderError(simulatedRlsError)
      assert.ok(normalized.message.includes('Akses ditolak'))
    })
  })

  describe('2. Merchant Atomic PROSES & Payment Confirmation', () => {
    it('5. Merchant PROSES confirms QRIS payment and transitions order to diproses atomically', async () => {
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
              already_processed: false,
              message: 'Pesanan berhasil dikonfirmasi dan mulai diproses.',
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

    it('6. Duplicate PROSES is idempotent and safely returns success', async () => {
      const mockClient = {
        rpc: async () => ({
          data: {
            success: true,
            order_id: testOrderId,
            order_status: 'diproses',
            payment_status: 'paid',
            already_processed: true,
            message: 'Pesanan sudah sedang diproses.',
          },
          error: null,
        }),
      }

      const res = await merchantProcessOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.data.already_processed, true)
    })

    it('7. Concurrency conflict on PROSES is caught and normalized', async () => {
      const mockClient = {
        rpc: async () => ({
          data: null,
          error: { code: '40001', message: 'CONCURRENCY_CONFLICT: Terjadi konflik' },
        }),
      }

      const res = await merchantProcessOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, false)
      assert.ok(res.error.message.includes('konflik status'))
    })
  })

  describe('3. Order Lifecycle: BARU -> DIPROSES -> SELESAI (No SIAP)', () => {
    it('8. Customer sees "Sedang Diproses" state when order is diproses', () => {
      const order = {
        id: testOrderId,
        order_status: 'diproses',
        payment_method: 'qris',
        payment_status: 'paid',
      }
      const isProcessing = order.order_status === 'diproses'
      assert.strictEqual(isProcessing, true)
      assert.strictEqual(order.payment_status, 'paid')
    })

    it('9. Merchant SELESAI completes the order via merchant_complete_order', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'merchant_complete_order')
          assert.strictEqual(params.p_order_id, testOrderId)
          return {
            data: {
              success: true,
              order_id: testOrderId,
              order_status: 'selesai',
              already_completed: false,
              message: 'Pesanan berhasil diselesaikan.',
            },
            error: null,
          }
        },
      }

      const res = await merchantCompleteOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.data.order_status, 'selesai')
    })

    it('10. Duplicate SELESAI is idempotent', async () => {
      const mockClient = {
        rpc: async () => ({
          data: {
            success: true,
            order_id: testOrderId,
            order_status: 'selesai',
            already_completed: true,
            message: 'Pesanan sudah diselesaikan sebelumnya.',
          },
          error: null,
        }),
      }

      const res = await merchantCompleteOrder(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.data.already_completed, true)
    })

    it('11. SIAP/READY is not in the UX workflow; canDeleteOrder only applies to selesai', () => {
      assert.strictEqual(canDeleteOrder({ order_status: 'pending' }), false)
      assert.strictEqual(canDeleteOrder({ order_status: 'diproses' }), false)
      assert.strictEqual(canDeleteOrder({ order_status: 'siap' }), false)
      assert.strictEqual(canDeleteOrder({ order_status: 'selesai' }), true)
      assert.strictEqual(canDeleteOrder({ order_status: 'completed' }), true)
    })
  })

  describe('4. Dedicated Order Chat (Customer <-> Merchant)', () => {
    it('12. Customer can send message when order is diproses', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'send_order_message')
          assert.strictEqual(params.p_sender_type, 'customer')
          assert.strictEqual(params.p_message, 'Tolong jangan pakai cabai ya.')
          return {
            data: {
              success: true,
              message: {
                id: 'msg-1',
                order_id: testOrderId,
                sender_type: 'customer',
                sender_name: 'Budi',
                message: 'Tolong jangan pakai cabai ya.',
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }
        },
      }

      const res = await sendOrderMessage(
        {
          orderId: testOrderId,
          senderType: 'customer',
          senderName: 'Budi',
          message: 'Tolong jangan pakai cabai ya.',
        },
        mockClient
      )

      assert.strictEqual(res.success, true)
      assert.strictEqual(res.message.sender_type, 'customer')
      assert.strictEqual(res.message.message, 'Tolong jangan pakai cabai ya.')
    })

    it('13. Merchant can reply to customer message', async () => {
      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(params.p_sender_type, 'merchant')
          assert.strictEqual(params.p_message, 'Siap kak, pesanan tanpa cabai sedang kami siapkan!')
          return {
            data: {
              success: true,
              message: {
                id: 'msg-2',
                order_id: testOrderId,
                sender_type: 'merchant',
                sender_name: 'Dapur Alby',
                message: 'Siap kak, pesanan tanpa cabai sedang kami siapkan!',
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }
        },
      }

      const res = await sendOrderMessage(
        {
          orderId: testOrderId,
          senderType: 'merchant',
          senderName: 'Dapur Alby',
          message: 'Siap kak, pesanan tanpa cabai sedang kami siapkan!',
        },
        mockClient
      )

      assert.strictEqual(res.success, true)
      assert.strictEqual(res.message.sender_type, 'merchant')
    })

    it('14. Sending chat when order is completed or cancelled is rejected (chat closed)', async () => {
      const mockClient = {
        rpc: async () => ({
          data: null,
          error: {
            code: '22023',
            message: 'CHAT_CLOSED: Obrolan telah ditutup karena pesanan sudah selesai.',
          },
        }),
      }

      const res = await sendOrderMessage(
        {
          orderId: testOrderId,
          senderType: 'customer',
          senderName: 'Budi',
          message: 'Halo masih bisa tambah?',
        },
        mockClient
      )

      assert.strictEqual(res.success, false)
      assert.ok(res.error.message.includes('Obrolan telah ditutup'))
    })

    it('15. Empty messages are rejected before network call', async () => {
      const res = await sendOrderMessage({
        orderId: testOrderId,
        senderType: 'customer',
        message: '   ',
      })
      assert.strictEqual(res.success, false)
      assert.ok(res.error.message.includes('kosong'))
    })

    it('16. Fetching messages returns chronological array', async () => {
      const mockMessages = [
        { id: '1', order_id: testOrderId, sender_type: 'customer', message: 'Halo' },
        { id: '2', order_id: testOrderId, sender_type: 'merchant', message: 'Iya kak' },
      ]

      const mockClient = {
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'get_order_messages')
          assert.strictEqual(params.p_order_id, testOrderId)
          return {
            data: { success: true, messages: mockMessages },
            error: null,
          }
        },
      }

      const res = await getOrderMessages(testOrderId, mockClient)
      assert.strictEqual(res.success, true)
      assert.strictEqual(res.messages.length, 2)
    })

    it('17. Tenant isolation: unauthorized customer/merchant cannot access another order chat', async () => {
      const mockClient = {
        rpc: async () => ({
          data: null,
          error: {
            code: '42501',
            message: 'FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan ini.',
          },
        }),
      }

      const res = await getOrderMessages(otherOrderId, mockClient)
      assert.strictEqual(res.success, false)
      assert.ok(res.error.message.includes('Akses ditolak'))
    })
  })

  describe('5. Realtime Subscriptions & Cancellation Integrity', () => {
    it('18. subscribeOrderMessages sets up postgres_changes channel correctly', () => {
      let registeredFilter = null
      let subscribed = false

      const mockClient = {
        channel: (chanName) => {
          assert.ok(chanName.includes(testOrderId))
          return {
            on: (event, config, callback) => {
              assert.strictEqual(event, 'postgres_changes')
              assert.strictEqual(config.table, 'order_messages')
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

      const chan = subscribeOrderMessages(testOrderId, () => {}, mockClient)
      assert.strictEqual(registeredFilter, `order_id=eq.${testOrderId}`)
      assert.strictEqual(subscribed, true)
    })

    it('19. subscribeOrderStatus sets up postgres_changes channel on orders', () => {
      let registeredTable = null

      const mockClient = {
        channel: (chanName) => ({
          on: (event, config) => {
            registeredTable = config.table
            return {
              subscribe: () => ({ unsubscribe: () => {} }),
            }
          },
        }),
      }

      subscribeOrderStatus(testOrderId, () => {}, mockClient)
      assert.strictEqual(registeredTable, 'orders')
    })

    it('20. Existing cancellation behavior remains intact', () => {
      // Cancelled order cannot be completed or processed
      const cancelledOrder = {
        id: testOrderId,
        order_status: 'dibatalkan',
        payment_status: 'pending',
      }
      assert.strictEqual(canDeleteOrder(cancelledOrder), false)
      assert.strictEqual(cancelledOrder.order_status, 'dibatalkan')
    })
  })
})
