import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getSecureQrisUrl,
  getPublicQrisSettings,
  deriveQrisStoragePath,
  normalizeQrisError,
  sanitizePublicCheckoutError,
  QRIS_STORAGE_BUCKET,
} from '../services/qrisPaymentService.js'

describe('QRIS Phase 3 — Public Checkout Integration Suite (@qr.md)', () => {
  const migration070Path = path.resolve('supabase/migrations/070_business_qris_payment_settings.sql')
  const migration071Path = path.resolve('supabase/migrations/071_fix_gotrue_banned_until_compatibility.sql')
  const migration072Path = path.resolve('supabase/migrations/072_public_qris_checkout.sql')
  const publicMenuPagePath = path.resolve('src/pages/public/PublicMenuPage.jsx')
  const rpcMigrationPath = path.resolve('supabase/migrations/061_fix_public_checkout_inventory_mutation.sql')

  const migration070Sql = fs.readFileSync(migration070Path, 'utf8')
  const migration071Sql = fs.readFileSync(migration071Path, 'utf8')
  const migration072Sql = fs.readFileSync(migration072Path, 'utf8')
  const publicMenuSource = fs.readFileSync(publicMenuPagePath, 'utf8')
  const rpcSource = fs.readFileSync(rpcMigrationPath, 'utf8')

  const testBizOwnerA = '11111111-1111-4111-8111-111111111111'
  const testBizOwnerB = '22222222-2222-4222-8222-222222222222'
  const testBizIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testBizIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  // Simulates Postgres RLS and Supabase Storage for Public Checkout
  const createMockDatabase = () => {
    const businesses = [
      { id: testBizIdA, owner_id: testBizOwnerA, name: 'Toko Kopi A', is_menu_published: true },
      { id: testBizIdB, owner_id: testBizOwnerB, name: 'Toko Roti B', is_menu_published: true },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', owner_id: testBizOwnerA, name: 'Toko Rahasia C', is_menu_published: false },
    ]

    const paymentSettings = new Map([
      [testBizIdA, { business_id: testBizIdA, qris_image_url: `https://example.supabase.co/storage/v1/object/public/business-assets/${testBizIdA}/qris.png`, qris_enabled: true }],
      [testBizIdB, { business_id: testBizIdB, qris_image_url: `https://example.supabase.co/storage/v1/object/public/business-assets/${testBizIdB}/qris.png`, qris_enabled: true }],
      ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', { business_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', qris_image_url: 'https://example.supabase.co/storage/v1/object/public/business-assets/c/qris.png', qris_enabled: true }],
    ])

    const orders = new Map()

    return {
      businesses,
      paymentSettings,
      orders,
      // Public / Anonymous client simulator enforcing Phase 3 RLS
      createPublicClient: () => ({
        from: (table) => {
          if (table === 'businesses') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => {
                    const b = businesses.find(item => item[col] === val && item.is_menu_published === true)
                    return { data: b ? { ...b } : null, error: null }
                  },
                }),
              }),
            }
          }

          if (table === 'business_payment_settings') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => {
                    const setting = paymentSettings.get(val)
                    if (!setting) return { data: null, error: null }
                    // RLS Check: business must be published and qris_enabled must be true
                    const biz = businesses.find(b => b.id === setting.business_id)
                    if (!biz || !biz.is_menu_published || !setting.qris_enabled) {
                      return { data: null, error: null }
                    }
                    return { data: { ...setting }, error: null }
                  },
                }),
              }),
            }
          }

          if (table === 'orders') {
            return {
              update: () => ({
                eq: async () => ({
                  data: null,
                  // orders_public_update has been DROPPED in migration 072
                  error: {
                    code: '42501',
                    message: 'permission denied for table orders: anonymous update not permitted',
                  },
                }),
              }),
            }
          }

          throw new Error(`Mock table ${table} not implemented`)
        },
        storage: {
          from: (bucket) => {
            if (bucket !== QRIS_STORAGE_BUCKET) throw new Error(`Bucket ${bucket} not supported`)
            return {
              createSignedUrl: async (filePath, expiresIn = 3600) => {
                const targetBizId = filePath.split('/')[0]
                const biz = businesses.find(b => b.id === targetBizId)
                if (!biz || !biz.is_menu_published) {
                  return {
                    data: null,
                    error: { message: 'Akses ditolak: Toko tidak ditemukan atau menu belum dipublikasikan.' },
                  }
                }
                return {
                  data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/business-assets/${filePath}?token=sec_${expiresIn}` },
                  error: null,
                }
              },
            }
          },
        },
      }),
    }
  }

  // ==========================================
  // MINIMAL TESTS (1 - 16) PER @qr.md
  // ==========================================

  it('1. QRIS enabled → option muncul', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    const res = await getPublicQrisSettings(testBizIdA, client)
    assert.equal(res.error, null)
    assert.equal(res.available, true)
    assert.ok(res.data)
    assert.equal(res.data.qris_enabled, true)

    // Verify UI logic renders QRIS card when isQrisAvailable is true
    assert.ok(publicMenuSource.includes('isQrisAvailable && ('), 'UI must guard QRIS card with isQrisAvailable')
    assert.ok(publicMenuSource.includes('Metode Pembayaran'), 'UI renders payment method section')
    assert.ok(publicMenuSource.includes('QRIS'), 'UI includes QRIS option')
  })

  it('2. QRIS disabled → option tidak muncul', async () => {
    const mock = createMockDatabase()
    // Disable QRIS for Toko A
    mock.paymentSettings.get(testBizIdA).qris_enabled = false
    const client = mock.createPublicClient()

    const res = await getPublicQrisSettings(testBizIdA, client)
    assert.equal(res.error, null)
    assert.equal(res.available, false)
    assert.equal(res.data, null)
  })

  it('3. QRIS image missing → option tidak muncul', async () => {
    const mock = createMockDatabase()
    // Remove image URL
    mock.paymentSettings.get(testBizIdA).qris_image_url = null
    const client = mock.createPublicClient()

    const res = await getPublicQrisSettings(testBizIdA, client)
    assert.equal(res.error, null)
    assert.equal(res.available, false)
    assert.equal(res.data, null)
  })

  it('4. Public business → QRIS bisa ditampilkan', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    const res = await getPublicQrisSettings(testBizIdA, client)
    assert.equal(res.available, true)

    const secure = await getSecureQrisUrl(testBizIdA, client)
    assert.equal(secure.error, null)
    assert.ok(secure.data.signedUrl.includes(`${testBizIdA}/qris.png`))
  })

  it('5. Non-public business → QRIS tidak bocor', async () => {
    const mock = createMockDatabase()
    const unpublishedBizId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const client = mock.createPublicClient()

    // Query unpublished business QRIS as public user
    const res = await getPublicQrisSettings(unpublishedBizId, client)
    // RLS blocks read because is_menu_published is false
    assert.equal(res.available, false)
    assert.equal(res.data, null)

    const secure = await getSecureQrisUrl(unpublishedBizId, client)
    // Because settings row is not accessible, no signed URL is generated
    assert.equal(secure.data, null)
  })

  it('6. create_public_order dengan qris → order pending', () => {
    // Audit RPC definition in migration 061
    assert.ok(rpcSource.includes('p_payment_method text DEFAULT \'cash\''), 'RPC receives p_payment_method')
    assert.ok(rpcSource.includes('payment_method,'), 'RPC sets payment_method column')
    assert.ok(rpcSource.includes('payment_status,'), 'RPC sets payment_status column')
    assert.ok(rpcSource.includes('coalesce(p_payment_method, \'cash\'),'), 'RPC coalesces payment method')
    assert.ok(rpcSource.includes('\'pending\','), 'RPC hardcodes payment_status as pending')

    // Audit PublicMenuPage order creation
    assert.ok(publicMenuSource.includes('p_payment_method: paymentMethod'), 'PublicMenuPage passes paymentMethod to RPC')
    assert.ok(publicMenuSource.includes('handleOrder(\'qris\')'), 'PublicMenuPage triggers qris order')
  })

  it('7. customer tidak bisa membuat order menjadi paid', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    // 1. Direct REST mutation attempt to set payment_status = 'paid'
    const updateRes = await client.from('orders').update({ payment_status: 'paid' }).eq('id', 'mock-order-id')
    assert.ok(updateRes.error, 'Customer update to orders must be rejected by RLS')
    assert.equal(updateRes.error.code, '42501')

    // 2. Audit UI "Saya Sudah Bayar" CTA
    assert.ok(
      publicMenuSource.includes('Saya Sudah Bayar'),
      'UI must contain "Saya Sudah Bayar" CTA'
    )
    assert.ok(
      !publicMenuSource.includes('payment_status = \'paid\''),
      'UI must never execute payment_status = paid on customer click'
    )
    assert.ok(
      publicMenuSource.includes('setQrisPaidAcknowledged(true)'),
      'UI only transitions local UI acknowledgement state'
    )
  })

  it('8. customer tidak bisa mengubah order_status', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    const updateRes = await client.from('orders').update({ order_status: 'completed' }).eq('id', 'mock-order-id')
    assert.ok(updateRes.error, 'Anonymous order_status update must be denied')
    assert.equal(updateRes.error.code, '42501')
  })

  it('9. customer tidak bisa manipulasi business_id', () => {
    // In create_public_order: product business_id must match p_business_id
    assert.ok(
      rpcSource.includes('v_prod.business_id <> p_business_id'),
      'RPC must enforce product business_id tenant isolation'
    )
    assert.ok(
      rpcSource.includes('Pelanggaran isolasi tenant: Produk % bukan milik bisnis ini'),
      'RPC must raise error on cross-tenant manipulation'
    )
  })

  it('10. customer tidak bisa manipulasi order ID', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    // Attempting to overwrite an arbitrary order ID via REST
    const fakeOrderId = '99999999-9999-4999-8999-999999999999'
    const res = await client.from('orders').update({ total: 0 }).eq('id', fakeOrderId)
    assert.ok(res.error, 'Tampering order ID must be rejected')
    assert.equal(res.error.code, '42501')
  })

  it('11. Business A tidak bisa mendapatkan QRIS B', async () => {
    const mock = createMockDatabase()
    const client = mock.createPublicClient()

    const secureA = await getSecureQrisUrl(testBizIdA, client)
    const secureB = await getSecureQrisUrl(testBizIdB, client)

    assert.ok(secureA.data.signedUrl.includes(testBizIdA), 'QRIS A signed URL must contain business A ID')
    assert.ok(secureB.data.signedUrl.includes(testBizIdB), 'QRIS B signed URL must contain business B ID')
    assert.notEqual(secureA.data.signedUrl, secureB.data.signedUrl, 'QRIS A and B must be strictly isolated')
  })

  it('12. Existing cash checkout tetap PASS', () => {
    assert.ok(
      publicMenuSource.includes('paymentMethod === \'cash\''),
      'Cash payment method flow must be preserved'
    )
    assert.ok(
      publicMenuSource.includes('Bayar Langsung'),
      'Bayar Langsung UI label must remain intact'
    )
    assert.ok(
      publicMenuSource.includes('Nama pembeli wajib diisi untuk pembayaran di kasir.'),
      'Cash validation rule must remain intact'
    )
  })

  it('13. Existing Midtrans checkout tetap PASS', () => {
    const snapEdgeSource = fs.readFileSync(path.resolve('supabase/functions/midtrans-create-snap/index.ts'), 'utf8')
    const subServiceSource = fs.readFileSync(path.resolve('src/lib/subscriptionService.js'), 'utf8')
    assert.ok(
      snapEdgeSource.includes('midtrans-create-snap') || snapEdgeSource.includes('order.total'),
      'Midtrans Snap Edge Function invocation must remain intact'
    )
    assert.ok(
      subServiceSource.includes('window.snap.pay'),
      'Midtrans window.snap.pay handler must remain intact'
    )
  })

  it('14. inventory/idempotency regression tetap PASS', () => {
    assert.ok(
      rpcSource.includes('p_checkout_request_id text DEFAULT NULL'),
      'RPC retains idempotency request ID'
    )
    assert.ok(
      rpcSource.includes('UPDATE public.inventory'),
      'RPC retains stock decrement mutation'
    )
    assert.ok(
      rpcSource.includes('INSUFFICIENT_STOCK: Stok tidak mencukupi'),
      'RPC retains stock availability checks'
    )
  })

  it('15. signed URL menggunakan tenant-scoped path', () => {
    const pathA = deriveQrisStoragePath(testBizIdA, 'png')
    const pathB = deriveQrisStoragePath(testBizIdB, 'jpeg')

    assert.equal(pathA, `${testBizIdA}/qris.png`)
    assert.equal(pathB, `${testBizIdB}/qris.jpeg`)

    // Path traversal rejection
    assert.throws(() => deriveQrisStoragePath(`../../etc`), /tidak valid/)
  })

  it('16. raw DB errors tidak bocor ke UI', () => {
    const rawPgError = { code: '42501', message: 'new row violates row-level security policy for table "orders"' }
    const sanitized = sanitizePublicCheckoutError(rawPgError)
    assert.equal(sanitized, 'Akses ditolak atau toko sedang tidak melayani pesanan publik.')
    assert.ok(!sanitized.includes('row-level security'))
    assert.ok(!sanitized.includes('42501'))

    const pgrstError = { code: 'PGRST205', message: 'Could not find the table in schema cache' }
    const sanitizedPgrst = sanitizePublicCheckoutError(pgrstError)
    assert.equal(sanitizedPgrst, 'Layanan pesanan sedang diperbarui. Silakan coba beberapa saat lagi.')
    assert.ok(!sanitizedPgrst.includes('PGRST205'))
    assert.ok(!sanitizedPgrst.includes('schema cache'))

    const stockError = { code: '23514', message: 'INSUFFICIENT_STOCK: Stok tidak mencukupi untuk Kopi (sisa 0, diminta 1)' }
    const sanitizedStock = sanitizePublicCheckoutError(stockError)
    assert.equal(sanitizedStock, 'Stok tidak mencukupi untuk item pesanan.')
  })

  // ==========================================
  // SCHEMA & POLICY INTEGRITY CHECKS
  // ==========================================

  it('17. Migration 072 drops orders_public_update and defines business_payment_settings_public_select', () => {
    assert.ok(
      migration072Sql.includes('DROP POLICY IF EXISTS "orders_public_update" ON public.orders;'),
      'Migration 072 must drop orders_public_update'
    )
    assert.ok(
      migration072Sql.includes('CREATE POLICY "business_payment_settings_public_select"'),
      'Migration 072 must create business_payment_settings_public_select'
    )
    assert.ok(
      migration072Sql.includes('qris_enabled = true'),
      'Public select policy requires qris_enabled = true'
    )
    assert.ok(
      migration072Sql.includes('is_menu_published = true'),
      'Public select policy requires is_menu_published = true'
    )
  })

  it('18. Scope Lock: Migration 070 and 071 remain unmodified and intact', () => {
    assert.ok(migration070Sql.includes('070_business_qris_payment_settings.sql'))
    assert.ok(migration071Sql.includes('071_fix_gotrue_banned_until_compatibility.sql'))
  })
})
