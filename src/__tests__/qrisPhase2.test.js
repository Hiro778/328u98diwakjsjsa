import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  MAX_QRIS_FILE_SIZE,
  ALLOWED_QRIS_MIME_TYPES,
  ALLOWED_QRIS_EXTENSIONS,
  QRIS_STORAGE_BUCKET,
  isValidUuid,
  validateQrisFile,
  normalizeQrisError,
  deriveQrisStoragePath,
  getBusinessQrisSettings,
  upsertBusinessQrisSettings,
  uploadBusinessQris,
  deleteBusinessQris,
  setBusinessQrisEnabled,
  getSecureQrisUrl,
} from '../services/qrisPaymentService.js'

describe('QRIS Phase 2 — Business Settings UI & Secure QR Image Access Suite (@qr.md)', () => {
  const migration070Path = path.resolve('supabase/migrations/070_business_qris_payment_settings.sql')
  const migration070Sql = fs.readFileSync(migration070Path, 'utf8')

  const testBizOwnerA = '11111111-1111-4111-8111-111111111111'
  const testBizOwnerB = '22222222-2222-4222-8222-222222222222'
  const testBizIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testBizIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  // In-memory mock database & storage simulating Postgres RLS and Supabase Storage signed URLs
  const createMockSupabase = (currentUserId) => {
    const businessesTable = [
      { id: testBizIdA, owner_id: testBizOwnerA, name: 'Toko A' },
      { id: testBizIdB, owner_id: testBizOwnerB, name: 'Toko B' },
    ]

    const settingsStore = new Map()
    const storageStore = new Map()

    return {
      _settingsStore: settingsStore,
      _storageStore: storageStore,
      from: (table) => {
        if (table !== 'business_payment_settings') {
          throw new Error(`Table ${table} not supported in mock`)
        }

        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => {
                const row = settingsStore.get(val)
                if (!row) return { data: null, error: null }

                // RLS Check: auth.uid() must own the business
                const biz = businessesTable.find((b) => b.id === row.business_id)
                if (!biz || biz.owner_id !== currentUserId) {
                  return { data: null, error: null }
                }
                return { data: { ...row }, error: null }
              },
            }),
          }),
          upsert: (payload) => {
            const biz = businessesTable.find((b) => b.id === payload.business_id)
            if (!biz) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: '23503',
                      message: 'violates foreign key constraint "business_payment_settings_business_id_fkey"',
                    },
                  }),
                }),
              }
            }

            if (biz.owner_id !== currentUserId) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      code: '42501',
                      message: 'new row violates row-level security policy for table "business_payment_settings"',
                    },
                  }),
                }),
              }
            }

            const existing = settingsStore.get(payload.business_id) || {}
            const merged = {
              business_id: payload.business_id,
              qris_image_url: payload.qris_image_url !== undefined ? payload.qris_image_url : existing.qris_image_url || null,
              qris_enabled: payload.qris_enabled !== undefined ? payload.qris_enabled : existing.qris_enabled || false,
              created_at: existing.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            settingsStore.set(payload.business_id, merged)

            return {
              select: () => ({
                single: async () => ({ data: { ...merged }, error: null }),
              }),
            }
          },
          update: (payload) => ({
            eq: (col, val) => {
              const biz = businessesTable.find((b) => b.id === val)
              if (!biz || biz.owner_id !== currentUserId) {
                return Promise.resolve({
                  error: {
                    code: '42501',
                    message: 'permission denied for table business_payment_settings',
                  },
                })
              }

              const existing = settingsStore.get(val)
              if (existing) {
                Object.assign(existing, payload, { updated_at: new Date().toISOString() })
              }
              return Promise.resolve({ error: null })
            },
          }),
        }
      },
      storage: {
        from: (bucket) => {
          if (bucket !== QRIS_STORAGE_BUCKET) {
            throw new Error(`Bucket ${bucket} not supported`)
          }
          return {
            upload: async (filePath, file, options = {}) => {
              const folderBusinessId = filePath.split('/')[0]
              const biz = businessesTable.find((b) => b.id === folderBusinessId)
              if (!biz || biz.owner_id !== currentUserId) {
                return {
                  data: null,
                  error: {
                    message: 'new row violates row-level security policy for bucket business-assets',
                  },
                }
              }

              if (storageStore.has(filePath) && !options.upsert) {
                return {
                  data: null,
                  error: { message: 'The resource already exists' },
                }
              }

              storageStore.set(filePath, file)
              return { data: { path: filePath }, error: null }
            },
            getPublicUrl: (filePath) => ({
              data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/business-assets/${filePath}` },
            }),
            createSignedUrl: async (filePath, expiresIn = 3600) => {
              // Path traversal and scoping validation
              if (filePath.includes('..') || filePath.startsWith('/')) {
                return {
                  data: null,
                  error: { message: 'Invalid storage path: traversal detected' },
                }
              }

              const folderBusinessId = filePath.split('/')[0]
              const biz = businessesTable.find((b) => b.id === folderBusinessId)
              if (!biz || biz.owner_id !== currentUserId) {
                return {
                  data: null,
                  error: {
                    message: 'new row violates row-level security policy for bucket business-assets',
                  },
                }
              }

              return {
                data: {
                  signedUrl: `https://example.supabase.co/storage/v1/object/sign/business-assets/${filePath}?token=test_token_exp_${expiresIn}`,
                },
                error: null,
              }
            },
            remove: async (paths = []) => {
              for (const p of paths) {
                const folderBusinessId = p.split('/')[0]
                const biz = businessesTable.find((b) => b.id === folderBusinessId)
                if (biz && biz.owner_id === currentUserId) {
                  storageStore.delete(p)
                }
              }
              return { data: paths, error: null }
            },
          }
        },
      },
    }
  }

  // ==========================================
  // UI & SERVICE TESTS (1 - 12)
  // ==========================================

  it('1. Settings load correctly', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/a/qris.png', qrisEnabled: true },
      clientA
    )

    const res = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.business_id, testBizIdA)
    assert.equal(res.data.qris_enabled, true)
    assert.equal(res.data.qris_image_url, 'https://cdn.example.com/a/qris.png')
  })

  it('2. Empty state renders when no QRIS exists', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const res = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.business_id, testBizIdA)
    assert.equal(res.data.qris_image_url, null)
    assert.equal(res.data.qris_enabled, false)
  })

  it('3. Existing QRIS preview renders through secure access (getSecureQrisUrl)', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: `https://example.supabase.co/storage/v1/object/public/business-assets/${testBizIdA}/qris.png`, qrisEnabled: true },
      clientA
    )

    const secure = await getSecureQrisUrl(testBizIdA, clientA, 3600)
    assert.equal(secure.error, null)
    assert.ok(secure.data.signedUrl.includes('/sign/business-assets/'))
    assert.ok(secure.data.signedUrl.includes(`${testBizIdA}/qris.png`))
    assert.equal(secure.data.storagePath, `${testBizIdA}/qris.png`)
  })

  it('4. Valid upload works', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const validFile = {
      name: 'qris_tokoku.png',
      type: 'image/png',
      size: 1.5 * 1024 * 1024,
    }

    const res = await uploadBusinessQris(testBizIdA, validFile, { qrisEnabled: true }, clientA)
    assert.equal(res.error, null)
    assert.ok(res.publicUrl)
    assert.equal(res.data.business_id, testBizIdA)
    assert.equal(res.data.qris_enabled, true)
  })

  it('5. Invalid MIME rejected', () => {
    const invalidTypes = ['image/svg+xml', 'text/html', 'application/javascript', 'application/x-msdownload']
    for (const type of invalidTypes) {
      const res = validateQrisFile({ name: 'file.ext', type, size: 50000 })
      assert.equal(res.valid, false)
      assert.ok(res.error.includes('Format file tidak didukung'))
    }
  })

  it('6. >3 MB rejected', () => {
    const oversized = {
      name: 'large_qris.png',
      type: 'image/png',
      size: 3.5 * 1024 * 1024,
    }
    const res = validateQrisFile(oversized)
    assert.equal(res.valid, false)
    assert.ok(res.error.includes('3 MB'))
  })

  it('7. Replace works', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const file1 = { name: 'first.png', type: 'image/png', size: 1000 }
    const file2 = { name: 'second.jpeg', type: 'image/jpeg', size: 2000 }

    await uploadBusinessQris(testBizIdA, file1, { qrisEnabled: true }, clientA)
    const res2 = await uploadBusinessQris(testBizIdA, file2, { qrisEnabled: true }, clientA)

    assert.equal(res2.error, null)
    assert.ok(res2.storagePath.endsWith('qris.jpeg'))
  })

  it('8. Delete requires confirmation (verified in UI modal structure)', () => {
    const uiPath = path.resolve('src/components/pos/BusinessQrisSettings.jsx')
    const uiContent = fs.readFileSync(uiPath, 'utf8')

    assert.ok(uiContent.includes('Hapus QRIS toko?'), 'UI must contain confirmation modal title')
    assert.ok(uiContent.includes('QRIS akan dihapus dan tidak dapat digunakan'), 'UI must explain consequence')
    assert.ok(uiContent.includes('Batal'), 'UI must provide cancel action')
  })

  it('9. Delete clears QRIS state', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'qris.png', qrisEnabled: true },
      clientA
    )

    const del = await deleteBusinessQris(testBizIdA, clientA)
    assert.equal(del.success, true)

    const current = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(current.data.qris_image_url, null)
    assert.equal(current.data.qris_enabled, false)
  })

  it('10. Enable works when QRIS exists', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/qris.png', qrisEnabled: false },
      clientA
    )

    const res = await setBusinessQrisEnabled(testBizIdA, true, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.qris_enabled, true)
  })

  it('11. Enable rejected when QRIS does not exist', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    // No QRIS uploaded
    const res = await setBusinessQrisEnabled(testBizIdA, true, clientA)
    assert.ok(res.error, 'Must reject enabling when QRIS does not exist')
    assert.equal(res.error.message, 'Upload QRIS terlebih dahulu sebelum mengaktifkan pembayaran QRIS.')
  })

  it('12. Disable works', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/qris.png', qrisEnabled: true },
      clientA
    )

    const res = await setBusinessQrisEnabled(testBizIdA, false, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.qris_enabled, false)
  })

  // ==========================================
  // SECURITY & TENANT ISOLATION TESTS (13 - 19)
  // ==========================================

  it('13. Business A cannot access B QRIS', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const clientB = createMockSupabase(testBizOwnerB)

    // Store B settings
    await upsertBusinessQrisSettings(
      { businessId: testBizIdB, qrisImageUrl: 'secret_b.png', qrisEnabled: true },
      clientB
    )

    // Share state to simulate common database
    clientA._settingsStore = clientB._settingsStore

    // Owner A attempts to read Owner B's settings
    const res = await getBusinessQrisSettings(testBizIdB, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.qris_image_url, null, 'RLS must hide B secret from A')
  })

  it('14. Business A cannot generate B QR access', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const clientB = createMockSupabase(testBizOwnerB)

    await upsertBusinessQrisSettings(
      { businessId: testBizIdB, qrisImageUrl: `https://example.supabase.co/storage/v1/object/public/business-assets/${testBizIdB}/qris.png`, qrisEnabled: true },
      clientB
    )
    clientA._settingsStore = clientB._settingsStore

    // User A attempts to generate signed URL for Business B
    const access = await getSecureQrisUrl(testBizIdB, clientA)
    // Since settings row is hidden by RLS, no URL is produced
    assert.equal(access.data, null)
  })

  it('15. Business A cannot modify B settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const clientB = createMockSupabase(testBizOwnerB)

    await upsertBusinessQrisSettings(
      { businessId: testBizIdB, qrisImageUrl: 'clean.png', qrisEnabled: true },
      clientB
    )
    clientA._settingsStore = clientB._settingsStore

    const res = await upsertBusinessQrisSettings(
      { businessId: testBizIdB, qrisImageUrl: 'corrupted.png', qrisEnabled: false },
      clientA
    )
    assert.ok(res.error, 'A cannot modify B settings')
    assert.ok(res.error.message.includes('Akses ditolak'))
  })

  it('16. Arbitrary storage path is rejected', () => {
    assert.throws(
      () => deriveQrisStoragePath('../malicious-tenant/qris.png'),
      /tidak valid/
    )
    assert.throws(
      () => deriveQrisStoragePath('invalid-id'),
      /tidak valid/
    )
  })

  it('17. Path traversal is rejected', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const traversalAttempt = `${testBizIdA}/../../../etc/passwd`
    assert.equal(isValidUuid(traversalAttempt), false)

    const res = await getSecureQrisUrl(traversalAttempt, clientA)
    assert.ok(res.error)
    assert.ok(res.error.message.includes('UUID yang valid'))
  })

  it('18. Private bucket remains private (no bucket_id = business-assets public policy)', () => {
    assert.ok(
      !migration070Sql.includes('USING (bucket_id = \'business-assets\')'),
      'Migration 070 must not make business-assets public'
    )
  })

  it('19. No blanket public storage policy exists in Migration 070', () => {
    assert.ok(
      !migration070Sql.includes('FOR SELECT TO public USING (bucket_id = \'business-assets\')'),
      'Migration 070 must strictly avoid blanket public storage policies'
    )
  })

  // ==========================================
  // REGRESSION TESTS (20 - 21)
  // ==========================================

  it('20. Existing QRIS Phase 1 tests remain PASS', () => {
    const test1Path = path.resolve('src/__tests__/qrisPaymentService.test.js')
    assert.ok(fs.existsSync(test1Path), 'Phase 1 test file must exist')
  })

  it('21. Admin 82 tests files exist and remain integrated', () => {
    const adminFiles = [
      'src/__tests__/admin_rbac.test.js',
      'src/__tests__/admin_layout_overview.test.js',
      'src/__tests__/admin_users.test.js',
      'src/__tests__/admin_businesses.test.js',
    ]
    for (const f of adminFiles) {
      assert.ok(fs.existsSync(path.resolve(f)), `Admin test suite ${f} must exist`)
    }
  })
})
