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
} from '../services/qrisPaymentService.js'

describe('QRIS Phase 1 — Business QRIS Payment Settings & Storage Security Suite (@qr.md)', () => {
  const migration070Path = path.resolve('supabase/migrations/070_business_qris_payment_settings.sql')
  const migration070Sql = fs.readFileSync(migration070Path, 'utf8')

  const testBizOwnerA = '11111111-1111-4111-8111-111111111111'
  const testBizOwnerB = '22222222-2222-4222-8222-222222222222'
  const testBizIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testBizIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  // In-memory mock database store simulating Postgres tables & RLS
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
                  // RLS filters out rows that caller does not own
                  return { data: null, error: null }
                }
                return { data: { ...row }, error: null }
              },
            }),
          }),
          upsert: (payload, options = {}) => {
            // Check FK constraint
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

            // RLS check for mutation: must own business
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
          delete: () => ({
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
              settingsStore.delete(val)
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
              // RLS policy: (storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())
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
  // DATABASE TESTS (1 - 10)
  // ==========================================

  it('1. Owner can create settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const res = await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/qris.png', qrisEnabled: true },
      clientA
    )
    assert.equal(res.error, null, 'Upsert should succeed for owner')
    assert.equal(res.data.business_id, testBizIdA)
    assert.equal(res.data.qris_enabled, true)
    assert.equal(res.data.qris_image_url, 'https://cdn.example.com/qris.png')
  })

  it('2. Owner can read own settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/qris.png', qrisEnabled: false },
      clientA
    )

    const res = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.business_id, testBizIdA)
    assert.equal(res.data.qris_image_url, 'https://cdn.example.com/qris.png')
  })

  it('3. Owner can update own settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'old.png', qrisEnabled: false },
      clientA
    )

    const res = await setBusinessQrisEnabled(testBizIdA, true, clientA)
    assert.equal(res.error, null)
    assert.equal(res.data.qris_enabled, true)

    const updated = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(updated.data.qris_enabled, true)
  })

  it('4. Owner can delete own settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'https://cdn.example.com/qris.png', qrisEnabled: true },
      clientA
    )

    const delRes = await deleteBusinessQris(testBizIdA, clientA)
    assert.equal(delRes.success, true)

    const check = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(check.data.qris_image_url, null)
    assert.equal(check.data.qris_enabled, false)
  })

  it('5. Different business owner cannot read settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'secret_a.png', qrisEnabled: true },
      clientA
    )

    // User B attempts to read User A's settings
    const clientB = createMockSupabase(testBizOwnerB)
    clientB._settingsStore = clientA._settingsStore

    const res = await getBusinessQrisSettings(testBizIdA, clientB)
    assert.equal(res.error, null)
    // RLS hides the row, returning fallback null values
    assert.equal(res.data.qris_image_url, null)
    assert.equal(res.data.qris_enabled, false)
  })

  it('6. Different business owner cannot update settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'owner_a.png', qrisEnabled: false },
      clientA
    )

    // User B attempts to update User A's settings
    const clientB = createMockSupabase(testBizOwnerB)
    clientB._settingsStore = clientA._settingsStore

    const res = await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'hacked.png', qrisEnabled: true },
      clientB
    )
    assert.ok(res.error, 'Mutation by non-owner must be rejected by RLS')
    assert.ok(res.error.message.includes('Akses ditolak') || res.error.message.includes('izin'))

    // Verify row was not modified
    const original = await getBusinessQrisSettings(testBizIdA, clientA)
    assert.equal(original.data.qris_image_url, 'owner_a.png')
  })

  it('7. Different business owner cannot delete settings', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    await upsertBusinessQrisSettings(
      { businessId: testBizIdA, qrisImageUrl: 'owner_a.png', qrisEnabled: true },
      clientA
    )

    const clientB = createMockSupabase(testBizOwnerB)
    clientB._settingsStore = clientA._settingsStore

    const delRes = await deleteBusinessQris(testBizIdA, clientB)
    assert.equal(delRes.success, false)
    assert.ok(delRes.error.message.includes('Akses ditolak') || delRes.error.message.includes('izin'))
  })

  it('8. Invalid business_id / FK is rejected', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const nonExistentBizId = '99999999-9999-4999-8999-999999999999'

    const res = await upsertBusinessQrisSettings(
      { businessId: nonExistentBizId, qrisImageUrl: 'foo.png', qrisEnabled: true },
      clientA
    )
    assert.ok(res.error, 'Non-existent business ID must be rejected by FK constraint')
    assert.ok(res.error.message.includes('tidak valid') || res.error.message.includes('tidak ditemukan'))
  })

  it('9. business_id uniqueness works (Primary Key in schema)', () => {
    assert.ok(
      migration070Sql.includes('business_id         uuid PRIMARY KEY') ||
      migration070Sql.includes('business_id uuid PRIMARY KEY'),
      'Migration 070 must enforce business_id as PRIMARY KEY (providing uniqueness)'
    )
    assert.ok(
      migration070Sql.includes('REFERENCES public.businesses(id) ON DELETE CASCADE'),
      'Migration 070 must enforce FK cascade delete to businesses'
    )
  })

  it('10. qris_enabled defaults false', () => {
    assert.ok(
      migration070Sql.includes('qris_enabled        boolean NOT NULL DEFAULT false') ||
      migration070Sql.includes('qris_enabled boolean NOT NULL DEFAULT false'),
      'Migration 070 must default qris_enabled to false'
    )
  })

  // ==========================================
  // STORAGE TESTS (11 - 18)
  // ==========================================

  it('11. Owner can upload QRIS to own business path', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const validFile = {
      name: 'qris.png',
      type: 'image/png',
      size: 1024 * 500, // 500 KB
    }

    const res = await uploadBusinessQris(testBizIdA, validFile, {}, clientA)
    assert.equal(res.error, null)
    assert.equal(res.storagePath, `${testBizIdA}/qris.png`)
    assert.ok(res.publicUrl.includes(testBizIdA))
  })

  it('12. Owner cannot upload to another business path', async () => {
    const clientB = createMockSupabase(testBizOwnerB)
    const validFile = {
      name: 'qris.png',
      type: 'image/png',
      size: 1024 * 500,
    }

    // Owner B tries to upload to Owner A's business path
    const res = await uploadBusinessQris(testBizIdA, validFile, {}, clientB)
    assert.ok(res.error, 'Cross-business upload must be rejected')
    assert.ok(res.error.message.includes('Akses ditolak') || res.error.message.includes('izin'))
  })

  it('13. Owner cannot delete another business QRIS', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const clientB = createMockSupabase(testBizOwnerB)
    clientB._storageStore = clientA._storageStore
    clientB._settingsStore = clientA._settingsStore

    // Owner A uploads QRIS
    clientA._storageStore.set(`${testBizIdA}/qris.png`, { name: 'qris.png' })
    clientA._settingsStore.set(testBizIdA, {
      business_id: testBizIdA,
      qris_image_url: `${testBizIdA}/qris.png`,
      qris_enabled: true,
    })

    // Owner B attempts to delete Owner A's QRIS
    const delRes = await deleteBusinessQris(testBizIdA, clientB)
    assert.equal(delRes.success, false)
    // Storage asset remains intact
    assert.ok(clientA._storageStore.has(`${testBizIdA}/qris.png`))
  })

  it('14. Owner cannot overwrite another business QRIS', async () => {
    const clientA = createMockSupabase(testBizOwnerA)
    const clientB = createMockSupabase(testBizOwnerB)
    clientB._storageStore = clientA._storageStore

    clientA._storageStore.set(`${testBizIdA}/qris.png`, 'original_bytes')

    const file = { name: 'qris.png', type: 'image/png', size: 1024 }
    const overwriteRes = await uploadBusinessQris(testBizIdA, file, {}, clientB)
    assert.ok(overwriteRes.error)
    assert.equal(clientA._storageStore.get(`${testBizIdA}/qris.png`), 'original_bytes')
  })

  it('15. Non-image MIME rejected', () => {
    const pdfFile = { name: 'document.pdf', type: 'application/pdf', size: 1000 }
    const jsonFile = { name: 'payload.json', type: 'application/json', size: 1000 }
    const htmlFile = { name: 'index.html', type: 'text/html', size: 1000 }

    assert.equal(validateQrisFile(pdfFile).valid, false)
    assert.equal(validateQrisFile(jsonFile).valid, false)
    assert.equal(validateQrisFile(htmlFile).valid, false)
  })

  it('16. File > 3 MB rejected', () => {
    const oversizedFile = {
      name: 'large_qris.png',
      type: 'image/png',
      size: 3 * 1024 * 1024 + 1, // 3 MB + 1 byte
    }
    const val = validateQrisFile(oversizedFile)
    assert.equal(val.valid, false)
    assert.ok(val.error.includes('3 MB'))
  })

  it('17. Valid PNG/JPEG/WebP accepted', () => {
    const png = { name: 'qris.png', type: 'image/png', size: 2 * 1024 * 1024 }
    const jpg = { name: 'qris.jpg', type: 'image/jpeg', size: 1024 * 100 }
    const jpeg = { name: 'qris.jpeg', type: 'image/jpeg', size: 1024 * 100 }
    const webp = { name: 'qris.webp', type: 'image/webp', size: 1024 * 200 }

    assert.equal(validateQrisFile(png).valid, true)
    assert.equal(validateQrisFile(jpg).valid, true)
    assert.equal(validateQrisFile(jpeg).valid, true)
    assert.equal(validateQrisFile(webp).valid, true)
  })

  it('18. SVG rejected', () => {
    const svgFile = { name: 'vector_qris.svg', type: 'image/svg+xml', size: 500 }
    const val = validateQrisFile(svgFile)
    assert.equal(val.valid, false)
    assert.ok(val.error.includes('tidak didukung') || val.error.includes('SVG'))
  })

  // ==========================================
  // PATH SECURITY TESTS (19 - 20)
  // ==========================================

  it('19. Client cannot choose an arbitrary tenant path', () => {
    // deriveQrisStoragePath strictly generates {businessId}/qris.{ext}
    const safePath = deriveQrisStoragePath(testBizIdA, 'png')
    assert.equal(safePath, `${testBizIdA}/qris.png`)

    // Attempting directory traversal via extension
    const traversalPath = deriveQrisStoragePath(testBizIdA, '../../etc/passwd')
    assert.ok(!traversalPath.includes('..'), 'Path derivation must strip directory traversal characters')
    assert.equal(traversalPath, `${testBizIdA}/qris.etcpasswd`)
  })

  it('20. Business ID manipulation does not cross tenant boundary', () => {
    assert.equal(isValidUuid('invalid-biz-id'), false)
    assert.equal(isValidUuid('../other-tenant'), false)
    assert.equal(isValidUuid("'; DROP TABLE businesses; --"), false)
    assert.equal(isValidUuid(testBizIdA), true)

    assert.throws(
      () => deriveQrisStoragePath('../other-biz', 'png'),
      /tidak valid/
    )
  })

  // ==========================================
  // ERROR HANDLING (21)
  // ==========================================

  it('21. Database/storage errors are normalized and do not expose sensitive raw internals', () => {
    const rawRlsError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "business_payment_settings" at internal pg_engine:201',
    }
    const normalized = normalizeQrisError(rawRlsError)
    assert.ok(!normalized.message.includes('internal pg_engine'))
    assert.ok(normalized.message.includes('Akses ditolak'))

    const rawFkError = {
      code: '23503',
      message: 'Key (business_id)=(00000000-0000-0000-0000-000000000000) is not present in table "businesses".',
    }
    const normalizedFk = normalizeQrisError(rawFkError)
    assert.ok(!normalizedFk.message.includes('Key (business_id)'))
    assert.ok(normalizedFk.message.includes('tidak valid') || normalizedFk.message.includes('tidak ditemukan'))
  })
})
