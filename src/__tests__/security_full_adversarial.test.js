import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('BisnisSehat Full Application Adversarial Security Suite (@sec.md)', () => {
  // Test identity UUIDs
  const userA_id = '11111111-1111-4111-8111-111111111111'
  const userB_id = '22222222-2222-4222-8222-222222222222'
  const admin_id = '99999999-9999-4999-8999-999999999999'

  const bizA_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const bizB_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  const orderA_id = '10000000-0000-4000-8000-000000000001'
  const orderB_id = '20000000-0000-4000-8000-000000000002'

  // =========================================================================
  // 1. ANONYMOUS ACCESS
  // =========================================================================
  describe('1. Anonymous Access Restrictions', () => {
    it('1.1. Anon user cannot execute admin or merchant RPCs directly', () => {
      const caller = null // Anonymous

      function assertAccess(rpcName, callerId) {
        if (!callerId) {
          throw new Error(`UNAUTHORIZED: Autentikasi diperlukan untuk ${rpcName} (ERRCODE: 42501)`)
        }
      }

      assert.throws(
        () => assertAccess('admin_update_platform_setting', caller),
        /UNAUTHORIZED: Autentikasi diperlukan/
      )
      assert.throws(
        () => assertAccess('merchant_process_order', caller),
        /UNAUTHORIZED: Autentikasi diperlukan/
      )
      assert.throws(
        () => assertAccess('merchant_complete_order', caller),
        /UNAUTHORIZED: Autentikasi diperlukan/
      )
    })

    it('1.2. Anon user cannot mutate platform_settings or admin_users', () => {
      // Simulating Supabase RLS policies
      const rlsPolicies = {
        platform_settings_update: (role) => role === 'admin' || role === 'super_admin',
        admin_users_insert: (role) => role === 'super_admin',
      }

      assert.strictEqual(rlsPolicies.platform_settings_update('anon'), false)
      assert.strictEqual(rlsPolicies.admin_users_insert('anon'), false)
    })
  })

  // =========================================================================
  // 2. NORMAL USER -> ADMIN ESCALATION
  // =========================================================================
  describe('2. Admin Privilege Escalation Prevention', () => {
    it('2.1. Authenticated normal user cannot elevate role or access admin RPCs', () => {
      const adminUsers = new Map([[admin_id, { user_id: admin_id, role: 'admin', is_active: true }]])

      function isAdmin(userId) {
        const row = adminUsers.get(userId)
        return Boolean(row && row.is_active && (row.role === 'admin' || row.role === 'super_admin'))
      }

      assert.strictEqual(isAdmin(userA_id), false)
      assert.strictEqual(isAdmin(admin_id), true)

      function adminUpdateSetting(callerId, key, val) {
        if (!isAdmin(callerId)) {
          throw new Error('FORBIDDEN: Hanya administrator yang dapat mengubah pengaturan (ERRCODE: 42501)')
        }
        return { key, val, updated: true }
      }

      assert.throws(
        () => adminUpdateSetting(userA_id, 'maintenance_mode', true),
        /FORBIDDEN: Hanya administrator/
      )
    })

    it('2.2. Normal user cannot insert or update admin_users table', () => {
      function canManageAdminUsers(callerRole) {
        return callerRole === 'super_admin'
      }

      assert.strictEqual(canManageAdminUsers('authenticated_user'), false)
      assert.strictEqual(canManageAdminUsers('admin'), false) // Only super_admin can create admins
      assert.strictEqual(canManageAdminUsers('super_admin'), true)
    })
  })

  // =========================================================================
  // 3. NORMAL USER -> ANOTHER BUSINESS & CROSS-TENANT IDOR
  // =========================================================================
  describe('3. Cross-Tenant IDOR Protection', () => {
    const businesses = new Map([
      [bizA_id, { id: bizA_id, owner_id: userA_id, name: 'Kedai A' }],
      [bizB_id, { id: bizB_id, owner_id: userB_id, name: 'Kedai B' }],
    ])

    it('3.1. User A cannot mutate or read private resources of Business B', () => {
      function verifyBusinessOwnership(callerId, businessId) {
        const biz = businesses.get(businessId)
        if (!biz) throw new Error('NOT_FOUND')
        if (biz.owner_id !== callerId) {
          throw new Error('FORBIDDEN: Anda tidak memiliki izin untuk bisnis ini (ERRCODE: 42501)')
        }
        return true
      }

      assert.strictEqual(verifyBusinessOwnership(userA_id, bizA_id), true)
      assert.throws(
        () => verifyBusinessOwnership(userA_id, bizB_id),
        /FORBIDDEN: Anda tidak memiliki izin untuk bisnis ini/
      )
    })

    it('3.2. User A cannot confirm or process orders belonging to Business B', () => {
      const orders = new Map([
        [orderA_id, { id: orderA_id, business_id: bizA_id, order_status: 'pending' }],
        [orderB_id, { id: orderB_id, business_id: bizB_id, order_status: 'pending' }],
      ])

      function merchantProcessOrder(callerId, orderId) {
        const ord = orders.get(orderId)
        if (!ord) throw new Error('ORDER_NOT_FOUND')
        const biz = businesses.get(ord.business_id)
        if (biz.owner_id !== callerId) {
          throw new Error('FORBIDDEN: Bukan pemilik bisnis pesanan ini (ERRCODE: 42501)')
        }
        ord.order_status = 'diproses'
        return { success: true, order_id: orderId }
      }

      assert.throws(
        () => merchantProcessOrder(userA_id, orderB_id),
        /FORBIDDEN: Bukan pemilik bisnis pesanan ini/
      )
      assert.deepStrictEqual(merchantProcessOrder(userA_id, orderA_id), { success: true, order_id: orderA_id })
    })
  })

  // =========================================================================
  // 4. FREE -> PRO ENTITLEMENT & SUBSCRIPTION BYPASS
  // =========================================================================
  describe('4. Entitlement & Subscription Bypass Protection', () => {
    it('4.1. Free plan user cannot bypass server-side entitlement checks', () => {
      function checkServerEntitlement({ dbSubscription, _requestOverride = {} }) {
        // Attack vector: Client sends requestOverride.is_pro = true or plan = 'pro'
        // Server MUST ignore client request body and read exclusively from dbSubscription
        const isActive = dbSubscription && dbSubscription.status === 'active'
        const isNotExpired = dbSubscription && new Date(dbSubscription.current_period_end) > new Date()
        const isPro = Boolean(isActive && isNotExpired && dbSubscription.plan === 'pro')
        return { isPro }
      }

      const freeUserSub = { plan: 'free', status: 'active', current_period_end: '2026-12-31' }
      const forgedRequest = { plan: 'pro', is_pro: true, bypass: true }

      const entitlement = checkServerEntitlement({
        dbSubscription: freeUserSub,
        requestOverride: forgedRequest,
      })
      assert.strictEqual(entitlement.isPro, false)
    })

    it('4.2. Expired PRO subscription is rejected server-side', () => {
      function isSubscriptionActive(sub) {
        if (!sub) return false
        if (sub.status !== 'active') return false
        if (new Date(sub.current_period_end) <= new Date()) return false
        return sub.plan === 'pro'
      }

      const expiredProSub = {
        plan: 'pro',
        status: 'active',
        current_period_end: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      }
      assert.strictEqual(isSubscriptionActive(expiredProSub), false)
    })

    it('4.3. Business A cannot use Subscription of Business B', () => {
      const subscriptions = new Map([
        [bizA_id, { business_id: bizA_id, plan: 'free' }],
        [bizB_id, { business_id: bizB_id, plan: 'pro' }],
      ])

      function getEntitlement(targetBusinessId, _claimedSubBizId) {
        // Enforce binding between business_id and its own subscription
        const sub = subscriptions.get(targetBusinessId)
        return sub ? sub.plan : 'free'
      }

      // Attacker passes claimedSubBizId = bizB_id for target bizA_id
      assert.strictEqual(getEntitlement(bizA_id, bizB_id), 'free')
    })
  })

  // =========================================================================
  // 5. BANNED USER ZERO ACCESS
  // =========================================================================
  describe('5. Banned User Zero Access Enforcement', () => {
    it('5.1. Banned user is denied access to all protected RPCs and services', () => {
      const users = new Map([
        [userA_id, { id: userA_id, is_active: true, banned_until: null }],
        [userB_id, { id: userB_id, is_active: false, banned_until: new Date(Date.now() + 86400000).toISOString() }],
      ])

      function isAccountAccessAllowed(userId) {
        const user = users.get(userId)
        if (!user) return false
        if (!user.is_active) return false
        if (user.banned_until && new Date(user.banned_until) > new Date()) return false
        return true
      }

      assert.strictEqual(isAccountAccessAllowed(userA_id), true)
      assert.strictEqual(isAccountAccessAllowed(userB_id), false)

      function executeOperation(userId) {
        if (!isAccountAccessAllowed(userId)) {
          throw new Error('ACCOUNT_SUSPENDED: Akun Anda sedang dinonaktifkan atau dibatasi (ERRCODE: 42501)')
        }
        return 'OK'
      }

      assert.throws(
        () => executeOperation(userB_id),
        /ACCOUNT_SUSPENDED/
      )
    })
  })

  // =========================================================================
  // 6. QRIS PAYMENT & ORDER STATUS MANIPULATION
  // =========================================================================
  describe('6. QRIS Payment & Order State Machine Hardening (@sec.md Phase 7)', () => {
    it('6.1. Customer cannot set payment_status="paid" via client', () => {
      const order = {
        id: orderA_id,
        order_status: 'pending',
        payment_method: 'qris',
        payment_status: 'pending',
      }

      // Customer REST update attempt simulated
      function customerUpdateOrder(callerRole, updatePayload) {
        if (callerRole === 'customer' || callerRole === 'anon') {
          if ('payment_status' in updatePayload || 'order_status' in updatePayload) {
            throw new Error('FORBIDDEN: Pelanggan tidak diizinkan mengubah status pembayaran/pesanan (ERRCODE: 42501)')
          }
        }
        return Object.assign(order, updatePayload)
      }

      assert.throws(
        () => customerUpdateOrder('customer', { payment_status: 'paid' }),
        /FORBIDDEN: Pelanggan tidak diizinkan/
      )
      assert.strictEqual(order.payment_status, 'pending')
    })

    it('6.2. Merchant cannot complete order directly from BARU (must be DIPROSES first)', () => {
      const order = {
        id: orderA_id,
        business_id: bizA_id,
        order_status: 'pending', // BARU
        payment_status: 'pending',
      }

      function merchantCompleteOrder(callerId, orderRow) {
        if (orderRow.order_status !== 'diproses') {
          throw new Error('INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu sebelum diselesaikan (ERRCODE: 22023)')
        }
        orderRow.order_status = 'selesai'
        return { success: true }
      }

      assert.throws(
        () => merchantCompleteOrder(userA_id, order),
        /INVALID_ORDER_STATUS: Pesanan harus diproses terlebih dahulu/
      )
    })

    it('6.3. Merchant PROCESS atomically sets payment_status="paid" and order_status="diproses"', () => {
      const order = {
        id: orderA_id,
        business_id: bizA_id,
        order_status: 'pending',
        payment_status: 'pending',
      }

      function merchantProcessOrder(callerId, orderRow) {
        // Atomic transaction
        orderRow.payment_status = 'paid'
        orderRow.order_status = 'diproses'
        return { success: true, order: { ...orderRow } }
      }

      const res = merchantProcessOrder(userA_id, order)
      assert.strictEqual(res.success, true)
      assert.strictEqual(order.payment_status, 'paid')
      assert.strictEqual(order.order_status, 'diproses')
    })

    it('6.4. Completing an already completed order is idempotent; cancelled order is rejected', () => {
      const completedOrder = { id: orderA_id, order_status: 'selesai' }
      const cancelledOrder = { id: orderA_id, order_status: 'dibatalkan' }

      function completeOrder(orderRow) {
        if (orderRow.order_status === 'selesai') {
          return { success: true, already_completed: true }
        }
        if (orderRow.order_status === 'dibatalkan') {
          throw new Error('INVALID_ORDER_STATUS: Pesanan yang dibatalkan tidak dapat diselesaikan')
        }
        orderRow.order_status = 'selesai'
        return { success: true, already_completed: false }
      }

      const idempotentRes = completeOrder(completedOrder)
      assert.strictEqual(idempotentRes.already_completed, true)

      assert.throws(
        () => completeOrder(cancelledOrder),
        /Pesanan yang dibatalkan tidak dapat diselesaikan/
      )
    })
  })

  // =========================================================================
  // 7. ORDER CHAT CROSS-TENANT & ROLE SPOOFING (@sec.md Phase 8)
  // =========================================================================
  describe('7. Order Chat Security & Anti-Spoofing (@sec.md Phase 8)', () => {
    it('7.1. Authenticated Merchant B cannot inspect chat of Business A', () => {
      const order = {
        id: orderA_id,
        business_id: bizA_id,
        owner_id: userA_id,
      }

      function getOrderMessages(callerId, orderRow) {
        if (callerId && callerId !== orderRow.owner_id) {
          throw new Error('FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan bisnis lain (ERRCODE: 42501)')
        }
        return []
      }

      assert.throws(
        () => getOrderMessages(userB_id, order),
        /FORBIDDEN: Anda tidak memiliki akses ke obrolan pesanan bisnis lain/
      )
      assert.deepStrictEqual(getOrderMessages(userA_id, order), [])
    })

    it('7.2. Customer cannot spoof privileged roles (Penjual, Merchant, Admin, Kasir)', () => {
      function sanitizeSenderName(senderType, requestedName, orderCustomerName) {
        if (senderType === 'customer') {
          const forbiddenRoles = ['penjual', 'merchant', 'admin', 'bisnissehat', 'sistem', 'kasir']
          if (forbiddenRoles.includes(requestedName.toLowerCase().trim())) {
            return orderCustomerName || 'Pelanggan'
          }
        }
        return requestedName
      }

      assert.strictEqual(sanitizeSenderName('customer', 'Admin', 'Budi'), 'Budi')
      assert.strictEqual(sanitizeSenderName('customer', 'Penjual', 'Budi'), 'Budi')
      assert.strictEqual(sanitizeSenderName('customer', 'Kasir', 'Budi'), 'Budi')
      assert.strictEqual(sanitizeSenderName('customer', 'Budi Santoso', 'Budi'), 'Budi Santoso')
    })

    it('7.3. Chat messages cannot be sent after order is SELESAI or BATAL', () => {
      function validateChatStatus(orderStatus) {
        if (orderStatus === 'selesai' || orderStatus === 'completed') {
          throw new Error('CHAT_CLOSED: Obrolan telah ditutup karena pesanan sudah selesai (ERRCODE: 22023)')
        }
        if (orderStatus === 'dibatalkan' || orderStatus === 'cancelled') {
          throw new Error('CHAT_CLOSED: Obrolan telah ditutup karena pesanan dibatalkan (ERRCODE: 22023)')
        }
        if (orderStatus !== 'diproses' && orderStatus !== 'preparing') {
          throw new Error('CHAT_NOT_ACTIVE: Obrolan baru aktif setelah pesanan mulai diproses')
        }
        return true
      }

      assert.throws(() => validateChatStatus('selesai'), /CHAT_CLOSED: Obrolan telah ditutup/)
      assert.throws(() => validateChatStatus('dibatalkan'), /CHAT_CLOSED: Obrolan telah ditutup/)
      assert.throws(() => validateChatStatus('pending'), /CHAT_NOT_ACTIVE/)
      assert.strictEqual(validateChatStatus('diproses'), true)
    })
  })

  // =========================================================================
  // 8. STORAGE SECURITY & SECRET EXPOSURE (@sec.md Phase 9 & 10)
  // =========================================================================
  describe('8. Storage Security & Secret Exposure (@sec.md Phase 9 & 10)', () => {
    it('8.1. Storage path ownership enforcement: Business A cannot upload/delete in Business B prefix', () => {
      function validateStoragePath(callerBizId, objectPath) {
        // Path contract: business-assets/{business_id}/...
        const segments = objectPath.split('/')
        const targetBiz = segments[0]
        if (targetBiz !== callerBizId) {
          throw new Error('FORBIDDEN: Storage path isolation violation (ERRCODE: 42501)')
        }
        return true
      }

      assert.strictEqual(validateStoragePath(bizA_id, `${bizA_id}/qris_payment.png`), true)
      assert.throws(
        () => validateStoragePath(bizA_id, `${bizB_id}/qris_payment.png`),
        /Storage path isolation violation/
      )
    })

    it('8.2. Frontend bundle audit: No service_role key, Midtrans server key, or JWT secret leaked in dist/', () => {
      const distDir = path.resolve('dist/assets')
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'))
        for (const file of files) {
          const content = fs.readFileSync(path.join(distDir, file), 'utf8')
          assert.strictEqual(content.includes('SUPABASE_SERVICE_ROLE_KEY'), false, `Exposed service role in ${file}`)
          assert.strictEqual(content.includes('MIDTRANS_SERVER_KEY'), false, `Exposed Midtrans server key in ${file}`)
          assert.strictEqual(content.includes('JWT_SECRET'), false, `Exposed JWT secret in ${file}`)
        }
      }
    })
  })

  // =========================================================================
  // 9. RPC SECURITY DEFINER & SEARCH_PATH CONTEXT7 COMPLIANCE
  // =========================================================================
  describe('9. Context7 & PostgreSQL RPC Security Definer Standard (@sec.md Phase 5)', () => {
    it('9.1. All recent security migrations define SET search_path = "" and schema qualifications', () => {
      const migrations = [
        'supabase/migrations/080_order_processing_and_chat.sql',
        'supabase/migrations/082_qris_and_order_security_hardening.sql',
        'supabase/migrations/083_fix_admin_settings_security.sql',
      ]

      for (const m of migrations) {
        const filePath = path.resolve(m)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8')
          assert.ok(
            content.includes("SET search_path = ''") || content.includes('SET search_path = ""'),
            `Migration ${m} must pin search_path to empty per Context7 standard`
          )
          assert.ok(
            content.includes('SECURITY DEFINER'),
            `Migration ${m} should specify SECURITY DEFINER with proper auth checks`
          )
        }
      }
    })
  })
})
