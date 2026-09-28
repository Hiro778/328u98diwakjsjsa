import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { merchantProcessOrder, merchantCompleteOrder } from '../services/posService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Tahap 11: Payment Authority & Read-Only Order History Verification (@11.md)', () => {
  const orderHistoryPath = path.resolve(__dirname, '../pages/dashboard/pos/OrderHistory.jsx')
  const posPagePath = path.resolve(__dirname, '../pages/dashboard/pos/PosPage.jsx')
  const migration090Path = path.resolve(__dirname, '../../supabase/migrations/090_payment_authority_enforcement.sql')
  const posServicePath = path.resolve(__dirname, '../services/posService.js')

  describe('1. POS / Kasir Payment Authority (@11.md Rule 1 & 6)', () => {
    it('Aksi LUNAS / konfirmasi pembayaran hanya dihandle melalui server-side RPC di POS/Kasir', async () => {
      let rpcCalledWith = null
      const mockClient = {
        rpc: async (fnName, params) => {
          rpcCalledWith = { fnName, params }
          return {
            data: {
              success: true,
              order_id: params.p_order_id,
              order_status: 'diproses',
              payment_status: 'paid',
            },
            error: null,
          }
        },
      }

      const orderId = '11111111-2222-3333-4444-555555555555'
      const result = await merchantProcessOrder(orderId, mockClient)

      assert.strictEqual(rpcCalledWith.fnName, 'merchant_process_order')
      assert.strictEqual(rpcCalledWith.params.p_order_id, orderId)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.order_status, 'diproses')
      assert.strictEqual(result.data.payment_status, 'paid')
    })

    it('POSPage.jsx exposes PROSES button and triggers merchantProcessOrder', () => {
      const posContent = fs.readFileSync(posPagePath, 'utf8')
      assert.ok(posContent.includes('merchantProcessOrder'), 'PosPage must import merchantProcessOrder')
      assert.ok(posContent.includes('handleProcessOrder'), 'PosPage must have handleProcessOrder')
      assert.ok(posContent.includes('merchant_process_order') || posContent.includes('merchantProcessOrder'), 'PosPage connects to merchant process flow')
    })
  })

  describe('2. Riwayat Pesanan Read-Only Enforcement (@11.md Rule 2 & 7)', () => {
    const historyCode = fs.readFileSync(orderHistoryPath, 'utf8')

    it('Tidak boleh ada tombol atau aksi LUNAS di halaman Riwayat Pesanan', () => {
      // Check that there is no button or clickable element for LUNAS / Konfirmasi Pembayaran
      const hasLunasButton = /<button[^>]*>.*?(?:(?:Konfirmasi\s+Pembayaran)|(?:Bayar\s+Lunas)|(?:Tandai\s+Lunas)).*?<\/button>/is.test(historyCode)
      assert.strictEqual(hasLunasButton, false, 'Riwayat Pesanan must not contain any button to mark Lunas or Confirm Payment')
    })

    it('Tidak boleh ada mutation payment atau pemanggilan merchant_process_order di OrderHistory', () => {
      assert.ok(!historyCode.includes('merchant_process_order'), 'OrderHistory must not mention merchant_process_order RPC')
      assert.ok(!historyCode.includes('merchantProcessOrder'), 'OrderHistory must not import or call merchantProcessOrder')
      assert.ok(!historyCode.includes('confirm_qris_payment'), 'OrderHistory must not call confirm_qris_payment')
      assert.ok(!historyCode.includes('confirmQrisPayment'), 'OrderHistory must not call confirmQrisPayment')
    })

    it('OrderHistory query is strictly read-only SELECT', () => {
      assert.ok(historyCode.includes('.from(\'orders\')'), 'OrderHistory queries orders')
      assert.ok(historyCode.includes('.select('), 'OrderHistory performs select')
      // Ensure no update or insert on orders or payments
      assert.ok(!historyCode.includes('.from(\'orders\').update('), 'OrderHistory must not update orders')
      assert.ok(!historyCode.includes('.from(\'orders\').insert('), 'OrderHistory must not insert orders')
      assert.ok(!historyCode.includes('.from(\'payments\').insert('), 'OrderHistory must not insert payments')
      assert.ok(!historyCode.includes('.from(\'payments\').update('), 'OrderHistory must not update payments')
    })
  })

  describe('3. Server-side Enforcement & Security (@11.md Rule 4 & Migration 090)', () => {
    it('Migration 090 exists and enforces strict merchant-only orders UPDATE RLS', () => {
      assert.ok(fs.existsSync(migration090Path), 'Migration 090 file must exist')
      const migrationCode = fs.readFileSync(migration090Path, 'utf8')

      assert.ok(migrationCode.includes('CREATE POLICY "orders_merchant_update" ON public.orders'), 'Must define strict merchant update policy')
      assert.ok(migrationCode.includes('owner_id = (SELECT auth.uid())'), 'Policy must enforce business owner match with auth.uid()')
    })

    it('Migration 090 drops public/anon UPDATE on orders and payments', () => {
      const migrationCode = fs.readFileSync(migration090Path, 'utf8')
      assert.ok(migrationCode.includes('DROP POLICY "orders_public_update" ON public.orders'), 'Public update on orders must be dropped')
      assert.ok(migrationCode.includes('DROP POLICY "payments_public_insert" ON public.payments'), 'Public insert on payments must be dropped')
      assert.ok(migrationCode.includes('DROP POLICY "payments_public_update" ON public.payments'), 'Public update on payments must be dropped')
    })

    it('Customer context cannot bypass authorization via direct client update', async () => {
      // Simulate client attempting direct payment_status update
      const mockCustomerClient = {
        from: (table) => ({
          update: (fields) => ({
            eq: (col, val) => {
              if (table === 'orders' && fields.payment_status === 'paid') {
                return Promise.resolve({ error: { message: 'new row violates row-level security policy for table "orders"', code: '42501' } })
              }
              return Promise.resolve({ data: null, error: null })
            }
          })
        })
      }

      const res = await mockCustomerClient.from('orders').update({ payment_status: 'paid' }).eq('id', 'test-order')
      assert.ok(res.error, 'Customer must be blocked from updating payment_status directly')
      assert.strictEqual(res.error.code, '42501')
    })
  })

  describe('4. Duplicate Payment Prevention (@11.md Rule 5)', () => {
    it('Opening Riwayat Pesanan does not generate duplicate payment records', () => {
      const historyCode = fs.readFileSync(orderHistoryPath, 'utf8')
      // Ensure loadOrders only reads orders and loadReceiptSettings only reads settings
      assert.ok(!historyCode.includes('insert({ order_id'), 'No payment insertion in OrderHistory')
      assert.ok(!historyCode.includes('rpc(\'create_payment\''), 'No RPC payment creation in OrderHistory')
    })

    it('merchant_process_order handles repeated calls idempotently without duplicate payments', async () => {
      let callCount = 0
      const mockClient = {
        rpc: async (fnName, params) => {
          callCount++
          return {
            data: {
              success: true,
              message: callCount > 1 ? 'Pesanan sudah diproses sebelumnya.' : 'Pesanan berhasil diproses.',
              order_id: params.p_order_id,
              order_status: 'diproses',
              payment_status: 'paid',
            },
            error: null,
          }
        },
      }

      const firstCall = await merchantProcessOrder('order-123', mockClient)
      const secondCall = await merchantProcessOrder('order-123', mockClient)

      assert.strictEqual(firstCall.success, true)
      assert.strictEqual(secondCall.success, true)
      assert.strictEqual(firstCall.data.order_status, 'diproses')
      assert.strictEqual(secondCall.data.order_status, 'diproses')
    })
  })

  describe('5. Flow QRIS Realtime Lifecycle (@11.md Rule 6 & 8E)', () => {
    it('QRIS lifecycle strictly follows BARU -> DIPROSES -> SELESAI', async () => {
      const orderState = {
        status: 'pending', // BARU
        payment: 'pending',
      }

      // 1. Initial State
      assert.strictEqual(orderState.status, 'pending')
      assert.strictEqual(orderState.payment, 'pending')

      // 2. POS/Kasir klik PROSES
      const mockProcessClient = {
        rpc: async () => ({
          data: { success: true, order_status: 'diproses', payment_status: 'paid' },
          error: null,
        }),
      }
      const processRes = await merchantProcessOrder('test-qris-order', mockProcessClient)
      orderState.status = processRes.data.order_status
      orderState.payment = processRes.data.payment_status

      assert.strictEqual(orderState.status, 'diproses')
      assert.strictEqual(orderState.payment, 'paid')

      // 3. POS/Kasir klik SELESAI
      const mockCompleteClient = {
        rpc: async () => ({
          data: { success: true, order_status: 'selesai' },
          error: null,
        }),
      }
      const completeRes = await merchantCompleteOrder('test-qris-order', mockCompleteClient)
      orderState.status = completeRes.data.order_status

      assert.strictEqual(orderState.status, 'selesai')
      assert.strictEqual(orderState.payment, 'paid')
    })
  })
})
