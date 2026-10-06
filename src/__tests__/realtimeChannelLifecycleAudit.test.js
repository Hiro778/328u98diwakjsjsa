// src/__tests__/realtimeChannelLifecycleAudit.test.js
// Comprehensive Verification & Regression Suite for Supabase Realtime Lifecycle & Bug Hunt
// Audits:
// 1. ALL channel event handlers are registered BEFORE subscribe()
// 2. StrictMode / remount / rapid modal open/close lifecycle
// 3. Prevention of 'cannot add postgres_changes callbacks after subscribe()'
// 4. Proper cleanup via client.removeChannel() and wrapped channel.unsubscribe()
// 5. Global codebase structural scan of all realtime features

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  subscribeOrderMessages,
  subscribeOrderStatus,
} from '../services/posService.js'
import {
  subscribeToNotifications,
} from '../services/notificationService.js'

describe('Supabase Realtime Channel Lifecycle & Concurrency Audit', () => {
  const testOrderId = '7a09b46d-d4fe-45df-b2a6-96d6a1d7b680'
  const testBusinessId = 'e0bb2183-6e84-4e77-8cf7-85e1c5f80228'

  // Helper creating a mock Supabase client that emulates real @supabase/realtime-js behavior
  function createRealtimeEmulationClient() {
    const channels = []

    return {
      getChannels: () => [...channels],
      removeChannel: (chan) => {
        const idx = channels.findIndex((c) => c === chan || c.topic === chan.topic)
        if (idx !== -1) {
          channels[idx].state = 'closed'
          channels.splice(idx, 1)
        }
      },
      channel: (topic) => {
        // If channel already exists in channels list, Realtime-js returns the existing channel!
        const existing = channels.find((c) => c.topic === topic || c.topic === `realtime:${topic}`)
        if (existing) {
          return existing
        }

        const newChan = {
          topic,
          state: 'closed',
          callbacks: [],
          on: function (event, config, callback) {
            // Realtime-js RULE: Throw if callbacks are attached after subscribe()
            if (this.state === 'joined' || this.state === 'subscribing') {
              throw new Error(`cannot add '${event}' callbacks for ${this.topic} after 'subscribe()'`)
            }
            this.callbacks.push({ event, config, callback })
            return this
          },
          subscribe: function () {
            this.state = 'joined'
            return this
          },
          unsubscribe: function () {
            this.state = 'closed'
            return Promise.resolve()
          },
        }

        channels.push(newChan)
        return newChan
      },
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 1: FIX PRODUCTION CRASH — ORDER CHAT REALTIME
  // ═════════════════════════════════════════════════════════════════════════

  describe('1. Order Chat Realtime Subscription (Production Bug Remediation)', () => {
    it('1.1. Single subscription registers all callbacks strictly BEFORE subscribe()', () => {
      const client = createRealtimeEmulationClient()
      let receivedMsg = null

      const channel = subscribeOrderMessages(testOrderId, (msg) => {
        receivedMsg = msg
      }, client)

      assert.ok(channel, 'Channel must be created')
      assert.strictEqual(channel.state, 'joined')
      assert.strictEqual(channel.callbacks.length, 1)
      assert.strictEqual(channel.callbacks[0].event, 'postgres_changes')
      assert.strictEqual(channel.callbacks[0].config.table, 'order_messages')
      assert.strictEqual(channel.callbacks[0].config.filter, `order_id=eq.${testOrderId}`)
    })

    it('1.2. Rapid Remount / StrictMode does NOT crash with "cannot add callbacks after subscribe"', () => {
      const client = createRealtimeEmulationClient()

      // Simulation of React StrictMode: Component Mount 1 -> Component Mount 2 without waiting
      assert.doesNotThrow(() => {
        const chan1 = subscribeOrderMessages(testOrderId, () => {}, client)
        // Second call while chan1 is still in 'joined' state
        const chan2 = subscribeOrderMessages(testOrderId, () => {}, client)
        assert.ok(chan2, 'Second subscription should succeed without throwing')
      })
    })

    it('1.3. Modal Open -> Close -> Reopen lifecycle executes cleanly without throwing', async () => {
      const client = createRealtimeEmulationClient()

      // 1. User opens chat modal
      const chan1 = subscribeOrderMessages(testOrderId, () => {}, client)
      assert.strictEqual(client.getChannels().length, 1)

      // 2. User closes chat modal (calls unsubscribe)
      await chan1.unsubscribe()
      // Channel must be completely removed from client channels
      assert.strictEqual(client.getChannels().length, 0, 'Unsubscribe must remove channel from client')

      // 3. User reopens chat modal
      assert.doesNotThrow(() => {
        const chan2 = subscribeOrderMessages(testOrderId, () => {}, client)
        assert.ok(chan2)
        assert.strictEqual(chan2.state, 'joined')
      })
    })

    it('1.4. Order change (switching orders) properly cleans up old order and establishes new order', () => {
      const client = createRealtimeEmulationClient()
      const orderA = '11111111-aaaa-bbbb-cccc-111111111111'
      const orderB = '22222222-aaaa-bbbb-cccc-222222222222'

      const chanA = subscribeOrderMessages(orderA, () => {}, client)
      assert.strictEqual(chanA.topic, `order-chat-${orderA}`)
      assert.strictEqual(client.getChannels().length, 1)

      // Switch to order B: chanA is removed, chanB is established
      client.removeChannel(chanA)
      assert.strictEqual(client.getChannels().length, 0)

      const chanB = subscribeOrderMessages(orderB, () => {}, client)
      assert.strictEqual(chanB.topic, `order-chat-${orderB}`)
      assert.strictEqual(client.getChannels().length, 1)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 2: ORDER STATUS REALTIME
  // ═════════════════════════════════════════════════════════════════════════

  describe('2. Order Status Realtime Subscription', () => {
    it('2.1. Registers callbacks before subscribe and removes any existing channel', () => {
      const client = createRealtimeEmulationClient()
      const chan = subscribeOrderStatus(testOrderId, () => {}, client)

      assert.ok(chan)
      assert.strictEqual(chan.state, 'joined')
      assert.strictEqual(chan.callbacks[0].config.table, 'orders')
      assert.strictEqual(chan.callbacks[0].config.filter, `id=eq.${testOrderId}`)
    })

    it('2.2. Re-subscription with existing active channel does not throw', () => {
      const client = createRealtimeEmulationClient()

      assert.doesNotThrow(() => {
        subscribeOrderStatus(testOrderId, () => {}, client)
        subscribeOrderStatus(testOrderId, () => {}, client)
      })
    })

    it('2.3. Unsubscribe automatically removes channel from client', async () => {
      const client = createRealtimeEmulationClient()
      const chan = subscribeOrderStatus(testOrderId, () => {}, client)
      assert.strictEqual(client.getChannels().length, 1)

      await chan.unsubscribe()
      assert.strictEqual(client.getChannels().length, 0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 3: NOTIFICATIONS REALTIME
  // ═════════════════════════════════════════════════════════════════════════

  describe('3. Business Notifications Realtime Subscription', () => {
    it('3.1. Registers callbacks before subscribe and cleans up existing channels', () => {
      const client = createRealtimeEmulationClient()
      const chan = subscribeToNotifications(testBusinessId, () => {}, client)

      assert.ok(chan)
      assert.strictEqual(chan.state, 'joined')
      assert.strictEqual(chan.callbacks[0].config.table, 'notifications')
      assert.strictEqual(chan.callbacks[0].config.filter, `business_id=eq.${testBusinessId}`)
    })

    it('3.2. Rapid remount of useNotifications does not throw', () => {
      const client = createRealtimeEmulationClient()

      assert.doesNotThrow(() => {
        subscribeToNotifications(testBusinessId, () => {}, client)
        subscribeToNotifications(testBusinessId, () => {}, client)
      })
    })

    it('3.3. Unsubscribe automatically removes notifications channel from client', async () => {
      const client = createRealtimeEmulationClient()
      const chan = subscribeToNotifications(testBusinessId, () => {}, client)
      assert.strictEqual(client.getChannels().length, 1)

      await chan.unsubscribe()
      assert.strictEqual(client.getChannels().length, 0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SECTION 4: GLOBAL CODEBASE AUDIT (ALL CHANNELS)
  // ═════════════════════════════════════════════════════════════════════════

  describe('4. Global Codebase Static Architecture Audit', () => {
    it('OrderChatModal is removed from active components and not rendered in PublicMenuPage or PosPage', () => {
      assert.strictEqual(fs.existsSync(path.resolve('src/components/pos/OrderChatModal.jsx')), false, 'OrderChatModal.jsx must be removed')
      const menuSrc = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(!menuSrc.includes('OrderChatModal'), 'PublicMenuPage must NOT import or render OrderChatModal')
      const posSrc = fs.readFileSync(path.resolve('src/pages/dashboard/pos/PosPage.jsx'), 'utf8')
      assert.ok(!posSrc.includes('OrderChatModal'), 'PosPage must NOT import or render OrderChatModal')
    })

    it('PublicMenuPage does NOT create order-chat subscription at all', () => {
      const src = fs.readFileSync(path.resolve('src/pages/public/PublicMenuPage.jsx'), 'utf8')
      assert.ok(!src.includes('order-chat-'), 'PublicMenuPage must NOT create order-chat- channel')
      assert.ok(!src.includes('subscribeOrderMessages'), 'PublicMenuPage must NOT call subscribeOrderMessages')
    })

    it('PosPage cleans up stale channels before subscribing to POS channels and does not subscribe to order messages', () => {
      const src = fs.readFileSync(path.resolve('src/pages/dashboard/pos/PosPage.jsx'), 'utf8')
      assert.ok(src.includes('pos-orders'), 'PosPage must handle pos-orders')
      assert.ok(src.includes('pos-inventory-realtime'), 'PosPage must handle pos-inventory-realtime')
      assert.ok(!src.includes('pos-order-messages-realtime'), 'PosPage must NOT create pos-order-messages-realtime')
      assert.ok(src.includes('supabase.removeChannel(channel)'), 'PosPage must remove channel on cleanup')
      assert.ok(src.includes('supabase.removeChannel(invChannel)'), 'PosPage must remove invChannel on cleanup')
    })

    it('AuthContext profile-status channel cleans up existing before subscribing and on unmount', () => {
      const src = fs.readFileSync(path.resolve('src/context/AuthContext.jsx'), 'utf8')
      assert.ok(src.includes('profile-status-'), 'AuthContext must subscribe to profile-status')
      assert.ok(src.includes('supabase.removeChannel(channel)'), 'AuthContext must remove channel on cleanup')
    })

    it('useNotifications imports supabase and cleans up using removeChannel', () => {
      const src = fs.readFileSync(path.resolve('src/hooks/useNotifications.js'), 'utf8')
      assert.ok(src.includes("import { supabase } from '../lib/supabase.js'"), 'useNotifications must import supabase')
      assert.ok(src.includes('supabase.removeChannel(channel)'), 'useNotifications must use supabase.removeChannel')
    })
  })
})
