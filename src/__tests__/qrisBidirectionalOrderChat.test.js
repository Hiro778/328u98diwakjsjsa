import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  sendOrderMessage,
  getOrderMessages,
  subscribeOrderMessages,
} from '../services/posService.js'

describe('Bidirectional Buyer ↔ Seller Chat After QRIS Payment Suite', () => {
  const testOrderId = '11111111-2222-3333-4444-555555555555'
  const otherOrderId = '99999999-8888-7777-6666-555555555555'

  it('1. Buyer can send chat message right after QRIS payment when order is pending/baru', async () => {
    let capturedParams = null
    const mockClient = {
      rpc: async (fnName, params) => {
        assert.strictEqual(fnName, 'send_order_message')
        capturedParams = params
        return {
          data: {
            success: true,
            message: {
              id: 'msg-pending-1',
              order_id: testOrderId,
              sender_type: 'customer',
              sender_name: 'Budi Santoso',
              message: 'Halo kak, saya sudah transfer via QRIS BCA ya.',
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
        senderName: 'Budi Santoso',
        message: 'Halo kak, saya sudah transfer via QRIS BCA ya.',
      },
      mockClient
    )

    assert.strictEqual(res.success, true)
    assert.strictEqual(capturedParams.p_sender_type, 'customer')
    assert.strictEqual(capturedParams.p_sender_name, 'Budi Santoso')
    assert.strictEqual(capturedParams.p_message, 'Halo kak, saya sudah transfer via QRIS BCA ya.')
    assert.strictEqual(res.message.id, 'msg-pending-1')
  })

  it('2. Merchant can reply to buyer when order is pending/baru (prior to clicking Proses)', async () => {
    let capturedParams = null
    const mockClient = {
      rpc: async (fnName, params) => {
        assert.strictEqual(fnName, 'send_order_message')
        capturedParams = params
        return {
          data: {
            success: true,
            message: {
              id: 'msg-pending-2',
              order_id: testOrderId,
              sender_type: 'merchant',
              sender_name: 'Hazzeon Kitchen',
              message: 'Baik kak, pembayaran QRIS sudah masuk. Sedang kami siapkan!',
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
        senderName: 'Hazzeon Kitchen',
        message: 'Baik kak, pembayaran QRIS sudah masuk. Sedang kami siapkan!',
      },
      mockClient
    )

    assert.strictEqual(res.success, true)
    assert.strictEqual(capturedParams.p_sender_type, 'merchant')
    assert.strictEqual(capturedParams.p_sender_name, 'Hazzeon Kitchen')
    assert.strictEqual(res.message.id, 'msg-pending-2')
  })

  it('3. Bidirectional chat remains fully functional during diproses status', async () => {
    const mockClient = {
      rpc: async (fnName, params) => ({
        data: {
          success: true,
          message: {
            id: 'msg-proc-1',
            order_id: testOrderId,
            sender_type: params.p_sender_type,
            sender_name: params.p_sender_name,
            message: params.p_message,
            created_at: new Date().toISOString(),
          },
        },
        error: null,
      }),
    }

    // Buyer sends during processing
    const buyerRes = await sendOrderMessage(
      {
        orderId: testOrderId,
        senderType: 'customer',
        senderName: 'Budi Santoso',
        message: 'Bisa tolong pisah sambal ya kak?',
      },
      mockClient
    )
    assert.strictEqual(buyerRes.success, true)
    assert.strictEqual(buyerRes.message.sender_type, 'customer')

    // Merchant replies during processing
    const merchantRes = await sendOrderMessage(
      {
        orderId: testOrderId,
        senderType: 'merchant',
        senderName: 'Hazzeon Kitchen',
        message: 'Siap kak, sambal kami pisah di cup kecil.',
      },
      mockClient
    )
    assert.strictEqual(merchantRes.success, true)
    assert.strictEqual(merchantRes.message.sender_type, 'merchant')
  })

  it('4. Chat is disabled when order is selesai or dibatalkan', async () => {
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

  it('5. Resilient table insert fallback succeeds if RPC returns recoverable error', async () => {
    const mockClient = {
      rpc: async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Function not found' },
      }),
      from: (tableName) => {
        assert.strictEqual(tableName, 'order_messages')
        return {
          insert: (payload) => ({
            select: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'fallback-msg-1',
                  ...payload,
                  created_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }
      },
    }

    const res = await sendOrderMessage(
      {
        orderId: testOrderId,
        senderType: 'customer',
        senderName: 'Budi',
        message: 'Tes fallback langsung ke tabel',
      },
      mockClient
    )

    assert.strictEqual(res.success, true)
    assert.strictEqual(res.message.id, 'fallback-msg-1')
    assert.strictEqual(res.message.message, 'Tes fallback langsung ke tabel')
  })

  it('6. Migration 103 defines send_order_message supporting pending/baru and replica identity full', () => {
    const migPath = path.resolve(process.cwd(), 'supabase/migrations/103_fix_bidirectional_order_chat.sql')
    assert.ok(fs.existsSync(migPath), 'Migration 103 file must exist')
    const migContent = fs.readFileSync(migPath, 'utf8')

    // Must allow pending and baru in status whitelist
    assert.ok(
      migContent.includes("'pending'") && migContent.includes("'baru'"),
      'Migration 103 must whitelist pending and baru statuses for order chat'
    )
    // Must update RLS policy
    assert.ok(
      migContent.includes('order_messages_customer_insert'),
      'Migration 103 must update order_messages_customer_insert policy'
    )
    // Must set REPLICA IDENTITY FULL
    assert.ok(
      migContent.includes('ALTER TABLE public.order_messages REPLICA IDENTITY FULL;'),
      'Migration 103 must set REPLICA IDENTITY FULL on order_messages'
    )
    // Must add to supabase_realtime
    assert.ok(
      migContent.includes('supabase_realtime'),
      'Migration 103 must ensure order_messages is in supabase_realtime publication'
    )
  })

  it('7. PublicMenuPage renders WhatsApp Penjual button (replaces Chat Penjual) for buyer on active order screen', () => {
    const menuPath = path.resolve(process.cwd(), 'src/pages/public/PublicMenuPage.jsx')
    const menuContent = fs.readFileSync(menuPath, 'utf8')

    // Must show WhatsApp Penjual button and NOT internal chat
    assert.ok(
      menuContent.includes('buyer-whatsapp-penjual-btn'),
      'PublicMenuPage must render buyer-whatsapp-penjual-btn on active order'
    )
    assert.ok(
      menuContent.includes('WhatsApp Penjual'),
      'PublicMenuPage must render WhatsApp Penjual button label'
    )
    assert.ok(
      !menuContent.includes('OrderChatModal'),
      'PublicMenuPage must NOT include OrderChatModal component'
    )
    assert.ok(
      !menuContent.includes('subscribeOrderMessages'),
      'PublicMenuPage must NOT subscribe to order chat messages in real-time'
    )
    assert.ok(
      !menuContent.includes('Chat Penjual'),
      'PublicMenuPage must NOT render Chat Penjual label'
    )
  })

  it('8. PosPage removes internal Chat Pembeli and does not create order chat realtime channel', () => {
    const posPath = path.resolve(process.cwd(), 'src/pages/dashboard/pos/PosPage.jsx')
    const posContent = fs.readFileSync(posPath, 'utf8')

    // Must handle pending and baru orders
    assert.ok(
      posContent.includes("order.order_status === 'pending' || order.order_status === 'baru'"),
      'PosPage OrderCard must handle pending and baru orders'
    )
    assert.ok(
      !posContent.includes('Chat Pembeli'),
      'PosPage must NOT render Chat Pembeli button'
    )
    assert.ok(
      !posContent.includes('pos-order-messages-realtime'),
      'PosPage must NOT subscribe to pos-order-messages-realtime'
    )
    assert.ok(
      !posContent.includes('OrderChatModal'),
      'PosPage must NOT render OrderChatModal'
    )
  })
})
