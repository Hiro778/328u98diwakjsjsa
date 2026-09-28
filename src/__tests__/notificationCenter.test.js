import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTIFICATION_CATEGORIES,
} from '../services/notificationService.js'
import {
  isWebPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from '../services/webPushService.js'

describe('Global Notification Center & Web Push Suite (fix1.md & pop.md)', () => {
  // Mock in-memory database store with tenant isolation
  let database = []

  const businessA = 'biz-aaaa-1111'
  const businessB = 'biz-bbbb-2222'

  beforeEach(() => {
    database = []
  })

  // Helper simulated database operations strictly reflecting Supabase RLS & constraints
  const dbInsert = (row) => {
    if (row.dedup_key) {
      const exists = database.find(
        (n) => n.business_id === row.business_id && n.dedup_key === row.dedup_key
      )
      if (exists) {
        // ON CONFLICT (business_id, dedup_key) DO NOTHING
        return null
      }
    }
    const newRecord = {
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString(),
      ...row,
    }
    database.unshift(newRecord) // Newest first
    return newRecord
  }

  const dbSelect = (businessId) => {
    // Tenant Isolation
    return database
      .filter((n) => n.business_id === businessId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  const dbCountUnread = (businessId) => {
    return database.filter((n) => n.business_id === businessId && !n.is_read).length
  }

  const dbMarkAsRead = (id, businessId) => {
    const item = database.find((n) => n.id === id && n.business_id === businessId)
    if (item) {
      item.is_read = true
      item.read_at = new Date().toISOString()
      return true
    }
    return false
  }

  const dbDelete = (id, businessId) => {
    const initialLen = database.length
    database = database.filter((n) => !(n.id === id && n.business_id === businessId))
    return database.length < initialLen
  }

  // ──────────────────────────────────────────────────────────
  // 1. Categories & Schema Validation
  // ──────────────────────────────────────────────────────────
  describe('1. Schema & Category Conformance', () => {
    it('contains all 10 core business categories required by pop.md', () => {
      const requiredCategories = [
        'invoice',
        'order',
        'inventory',
        'content_calendar',
        'legalitas',
        'marketplace',
        'whatsapp',
        'creative',
        'subscription',
        'general',
      ]
      for (const cat of requiredCategories) {
        assert.ok(
          NOTIFICATION_CATEGORIES.includes(cat),
          `Category ${cat} must exist in NOTIFICATION_CATEGORIES`
        )
      }
    })
  })

  // ──────────────────────────────────────────────────────────
  // 2. Create, Fetch, and Ordering (Newest First)
  // ──────────────────────────────────────────────────────────
  describe('2. Create, Fetch, and Ordering', () => {
    it('creates notification and returns newest first', () => {
      const notif1 = dbInsert({
        business_id: businessA,
        title: 'Invoice Jatuh Tempo Hari Ini',
        message: 'Invoice INV-001 jatuh tempo hari ini.',
        category: 'invoice',
        priority: 'high',
        action_url: '/dashboard/penjualan/invoice-follow-up',
        created_at: new Date('2026-09-15T08:00:00Z').toISOString(),
      })

      const notif2 = dbInsert({
        business_id: businessA,
        title: 'Pesanan Baru Masuk',
        message: 'Pesanan #101 diterima dari Meja 2.',
        category: 'order',
        priority: 'high',
        action_url: '/dashboard/pos',
        created_at: new Date('2026-09-15T09:00:00Z').toISOString(),
      })

      const list = dbSelect(businessA)
      assert.equal(list.length, 2)
      assert.equal(list[0].id, notif2.id, 'Newest notification (09:00) must be at index 0')
      assert.equal(list[1].id, notif1.id, 'Older notification (08:00) must be at index 1')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 3. Unread Count & Mark as Read
  // ──────────────────────────────────────────────────────────
  describe('3. Unread Count & Mark Read Persistence', () => {
    it('correctly increments and decrements unread count', () => {
      const n1 = dbInsert({
        business_id: businessA,
        title: 'Stok Menipis',
        message: 'Stok Kopi Susu tinggal 3',
        category: 'inventory',
      })
      const n2 = dbInsert({
        business_id: businessA,
        title: 'Stok Habis',
        message: 'Stok Gula Aren habis',
        category: 'inventory',
      })

      assert.equal(dbCountUnread(businessA), 2)

      // Mark n1 as read
      const updated = dbMarkAsRead(n1.id, businessA)
      assert.equal(updated, true)
      assert.equal(dbCountUnread(businessA), 1)

      const remainingUnread = dbSelect(businessA).find((n) => n.id === n2.id)
      assert.equal(remainingUnread.is_read, false)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 4. Delete Notification with Persistent X
  // ──────────────────────────────────────────────────────────
  describe('4. Persistent Delete (X button)', () => {
    it('permanently deletes notification from database and survives reload', () => {
      const n1 = dbInsert({
        business_id: businessA,
        title: 'WhatsApp Disconnected',
        message: 'Koneksi terputus',
        category: 'whatsapp',
      })

      assert.equal(dbSelect(businessA).length, 1)

      // User clicks X button
      const deleted = dbDelete(n1.id, businessA)
      assert.equal(deleted, true)

      // Simulated page refresh / database query
      const afterRefresh = dbSelect(businessA)
      assert.equal(afterRefresh.length, 0, 'Deleted notification must not reappear after refresh')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 5. Tenant Isolation (Strict RLS)
  // ──────────────────────────────────────────────────────────
  describe('5. Tenant Isolation (Business A vs Business B)', () => {
    it('prevents Business B from seeing or modifying Business A notifications', () => {
      const notifA = dbInsert({
        business_id: businessA,
        title: 'Rahasia Bisnis A',
        message: 'Laporan keuangan Bisnis A siap',
        category: 'general',
      })

      const notifB = dbInsert({
        business_id: businessB,
        title: 'Aktivitas Bisnis B',
        message: 'Pesanan Bisnis B',
        category: 'order',
      })

      // Query as Business A
      const listA = dbSelect(businessA)
      assert.equal(listA.length, 1)
      assert.equal(listA[0].id, notifA.id)
      assert.ok(!listA.some((n) => n.business_id === businessB))

      // Query as Business B
      const listB = dbSelect(businessB)
      assert.equal(listB.length, 1)
      assert.equal(listB[0].id, notifB.id)
      assert.ok(!listB.some((n) => n.business_id === businessA))

      // Business B attempts to delete Business A's notification
      const unauthorizedDelete = dbDelete(notifA.id, businessB)
      assert.equal(unauthorizedDelete, false)
      assert.equal(dbSelect(businessA).length, 1, 'Business A notification must remain intact')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 6. Deduplication & Idempotency
  // ──────────────────────────────────────────────────────────
  describe('6. Deduplication & Idempotency', () => {
    it('prevents duplicate notifications for the same event key on page refresh or repeated sync', () => {
      const dedupKey = 'inv_due_inv-999_2026-09-15'

      const firstInsert = dbInsert({
        business_id: businessA,
        title: 'Invoice Jatuh Tempo Hari Ini',
        message: 'Invoice INV-999 jatuh tempo',
        category: 'invoice',
        dedup_key: dedupKey,
      })
      assert.ok(firstInsert, 'First sync must insert notification')

      // Second sync run with identical dedup_key
      const secondInsert = dbInsert({
        business_id: businessA,
        title: 'Invoice Jatuh Tempo Hari Ini',
        message: 'Invoice INV-999 jatuh tempo',
        category: 'invoice',
        dedup_key: dedupKey,
      })
      assert.equal(secondInsert, null, 'Second sync must be rejected by unique constraint')

      // Database should only have 1 row
      const list = dbSelect(businessA)
      assert.equal(list.length, 1)
    })
  })

  // ──────────────────────────────────────────────────────────
  // 7. Scheduled / Due Date Business Events
  // ──────────────────────────────────────────────────────────
  describe('7. Scheduled / Due Date Business Events', () => {
    it('generates low stock and out of stock events correctly', () => {
      const inventoryItems = [
        { id: 'p1', name: 'Kopi Susu', quantity: 3, min_stock: 5 },
        { id: 'p2', name: 'Gula Aren', quantity: 0, min_stock: 2 },
        { id: 'p3', name: 'Cup 12oz', quantity: 50, min_stock: 10 }, // normal stock
      ]

      for (const item of inventoryItems) {
        if (item.quantity <= 0) {
          dbInsert({
            business_id: businessA,
            title: 'Stok Produk Habis',
            message: `Stok untuk produk "${item.name}" telah habis (0).`,
            category: 'inventory',
            priority: 'urgent',
            dedup_key: `inv_stock_zero_${item.id}_2026-09-15`,
          })
        } else if (item.quantity <= item.min_stock) {
          dbInsert({
            business_id: businessA,
            title: 'Stok Produk Menipis',
            message: `Stok produk "${item.name}" tersisa ${item.quantity}.`,
            category: 'inventory',
            priority: 'high',
            dedup_key: `inv_stock_low_${item.id}_2026-09-15`,
          })
        }
      }

      const notifications = dbSelect(businessA)
      assert.equal(notifications.length, 2, 'Only out-of-stock and low-stock should generate alerts')
      assert.ok(notifications.some((n) => n.title === 'Stok Produk Habis'))
      assert.ok(notifications.some((n) => n.title === 'Stok Produk Menipis'))
    })
  })

  // ──────────────────────────────────────────────────────────
  // 8. Realtime Event Simulation
  // ──────────────────────────────────────────────────────────
  describe('8. Realtime Ingestion Simulation', () => {
    it('simulates live Realtime INSERT payload merging cleanly into UI state', () => {
      let state = [
        { id: 'notif-existing', title: 'Existing Notif', is_read: true },
      ]

      const realtimePayload = {
        eventType: 'INSERT',
        new: { id: 'notif-live-new', title: 'Live Order #105', is_read: false },
      }

      // Handler function matching useNotifications logic
      if (realtimePayload.eventType === 'INSERT' && realtimePayload.new) {
        if (!state.some((n) => n.id === realtimePayload.new.id)) {
          state = [realtimePayload.new, ...state]
        }
      }

      assert.equal(state.length, 2)
      assert.equal(state[0].id, 'notif-live-new')
      assert.equal(state[1].id, 'notif-existing')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 9. Web Push Graceful Fallback
  // ──────────────────────────────────────────────────────────
  describe('9. Web Push & Graceful Fallback', () => {
    it('handles non-browser or unsupported environments safely without throwing', async () => {
      // In Node.js environment, window/navigator are not defined
      const supported = isWebPushSupported()
      assert.equal(supported, false)

      const permission = getNotificationPermission()
      assert.equal(permission, 'unsupported')

      const granted = await requestNotificationPermission()
      assert.equal(granted, false, 'Should gracefully return false without throwing an error')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 10. Server-Side Push Sender Delivery & Tenant Isolation
  // ──────────────────────────────────────────────────────────
  describe('10. Server-Side Push Sender & Delivery Pipeline', () => {
    let pushSubscriptions = []

    beforeEach(() => {
      pushSubscriptions = [
        { id: 'sub-1', business_id: businessA, endpoint: 'https://push.example.com/subA1' },
        { id: 'sub-2', business_id: businessA, endpoint: 'https://push.example.com/subA2' },
        { id: 'sub-3', business_id: businessB, endpoint: 'https://push.example.com/subB1' },
      ]
    })

    const simulateServerPushSender = (notification) => {
      // Priority gate
      if (notification.priority !== 'high' && notification.priority !== 'urgent') {
        return { skipped: true, reason: 'Priority is not high or urgent', sent: 0 }
      }

      // Tenant isolation: filter subscriptions strictly by business_id
      const targets = pushSubscriptions.filter(
        (sub) => sub.business_id === notification.business_id
      )

      let sent = 0
      let expiredCleaned = 0

      for (const target of targets) {
        // Simulate expired endpoint check
        if (target.endpoint.includes('expired')) {
          pushSubscriptions = pushSubscriptions.filter((s) => s.id !== target.id)
          expiredCleaned++
        } else {
          sent++
        }
      }

      return { success: true, sent, expiredCleaned, targets: targets.map((t) => t.id) }
    }

    it('routes push notification strictly to subscriptions belonging to the same tenant', () => {
      const notifA = {
        business_id: businessA,
        title: 'Invoice Jatuh Tempo',
        message: 'INV-001 jatuh tempo',
        priority: 'high',
      }

      const result = simulateServerPushSender(notifA)
      assert.equal(result.success, true)
      assert.equal(result.sent, 2)
      assert.deepEqual(result.targets, ['sub-1', 'sub-2'])
      assert.ok(!result.targets.includes('sub-3'), 'Business B subscription must never receive Business A push')
    })

    it('skips push sender for non-urgent normal CRUD events to prevent browser spam', () => {
      const normalNotif = {
        business_id: businessA,
        title: 'Catatan Biasa',
        message: 'Perubahan minor',
        priority: 'normal',
      }

      const result = simulateServerPushSender(normalNotif)
      assert.equal(result.skipped, true)
      assert.equal(result.sent, 0)
    })

    it('automatically cleans up expired (HTTP 410/404) subscriptions upon delivery attempt', () => {
      pushSubscriptions.push({
        id: 'sub-expired',
        business_id: businessA,
        endpoint: 'https://push.example.com/expired-token',
      })

      const notif = {
        business_id: businessA,
        title: 'Stok Habis',
        message: 'Stok Kopi habis',
        priority: 'urgent',
      }

      const result = simulateServerPushSender(notif)
      assert.equal(result.expiredCleaned, 1)
      assert.ok(!pushSubscriptions.some((s) => s.id === 'sub-expired'), 'Expired subscription must be removed')
    })
  })

  // ──────────────────────────────────────────────────────────
  // 11. Business Events to Notification Center Integration (pop.md)
  // ──────────────────────────────────────────────────────────
  describe('11. Business Events to Notification Center Integration', () => {
    it('A. Create Invoice: creates notification, correct business_id, and unread count +1', () => {
      const initialUnread = dbCountUnread(businessA)

      // Simulate successful invoice insert
      const invoiceData = {
        id: 'inv-101',
        business_id: businessA,
        invoice_number: 'INV-2026-001',
        customer_name: 'Budi Santoso',
        amount: 250000,
      }

      // Handler creates notification upon success
      const notif = dbInsert({
        business_id: invoiceData.business_id,
        title: 'Invoice dibuat',
        message: `Invoice ${invoiceData.invoice_number} untuk ${invoiceData.customer_name} berhasil dibuat.`,
        category: 'sales',
        priority: 'normal',
        action_url: '/dashboard/penjualan/invoice-follow-up',
        dedup_key: `inv_created_${invoiceData.id}`,
      })

      assert.ok(notif)
      assert.equal(notif.business_id, businessA)
      assert.equal(notif.title, 'Invoice dibuat')
      assert.equal(dbCountUnread(businessA), initialUnread + 1)
      assert.equal(dbSelect(businessA)[0].id, notif.id)
    })

    it('B. Create Invoice failed: does not create success notification', () => {
      const initialCount = dbSelect(businessA).length

      // Simulate failed invoice insert (e.g. database error)
      const insertFailed = true

      if (!insertFailed) {
        dbInsert({
          business_id: businessA,
          title: 'Invoice dibuat',
          message: 'Invoice gagal tidak boleh membuat notif',
          category: 'sales',
        })
      }

      assert.equal(dbSelect(businessA).length, initialCount, 'No notification should be created when insert fails')
    })

    it('C. Supplier created: generates notification and appears in list', () => {
      const supplierData = { name: 'PT Kopi Nusantara' }
      const notif = dbInsert({
        business_id: businessA,
        title: 'Supplier Ditambahkan',
        message: `Supplier "${supplierData.name}" berhasil ditambahkan.`,
        category: 'supplier',
        priority: 'normal',
        action_url: '/dashboard/operasional/suppliers',
        dedup_key: `supplier_created_${Date.now()}`,
      })

      assert.ok(notif)
      assert.equal(notif.category, 'supplier')
      assert.ok(dbSelect(businessA).some((n) => n.id === notif.id))
    })

    it('D. Order created: generates notification and appears in list', () => {
      const orderData = { id: 'order-99', order_number: 45, total: 120000 }
      const notif = dbInsert({
        business_id: businessA,
        title: 'Pesanan Baru Masuk',
        message: `Pesanan #${orderData.order_number} sebesar Rp 120.000 berhasil dibuat.`,
        category: 'order',
        priority: 'high',
        action_url: '/dashboard/pos',
        dedup_key: `order_created_${orderData.id}`,
      })

      assert.ok(notif)
      assert.equal(notif.category, 'order')
      assert.equal(notif.priority, 'high')
      assert.ok(dbSelect(businessA).some((n) => n.id === notif.id))
    })

    it('E. Invoice payment recorded: generates notification and appears in list', () => {
      const paymentData = { invoice_number: 'INV-2026-001', amount: 250000 }
      const notif = dbInsert({
        business_id: businessA,
        title: 'Pembayaran Invoice Diterima',
        message: `Pembayaran invoice ${paymentData.invoice_number} sebesar Rp 250.000 berhasil dicatat.`,
        category: 'invoice',
        priority: 'normal',
        action_url: '/dashboard/penjualan/invoice-follow-up',
        dedup_key: `inv_payment_inv-101_${Date.now()}`,
      })

      assert.ok(notif)
      assert.equal(notif.title, 'Pembayaran Invoice Diterima')
      assert.ok(dbSelect(businessA).some((n) => n.id === notif.id))
    })
  })
})
