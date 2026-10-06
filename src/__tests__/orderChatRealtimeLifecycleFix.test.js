// src/__tests__/orderChatRealtimeLifecycleFix.test.js
// Regression test suite for Order Chat Realtime Lifecycle (ref: 211.md)
// Verifies:
// 1. Callbacks before subscribe
// 2. Cleanup removes channel
// 3. Reopen chat
// 4. OrderId changes
// 5. Duplicate subscription prevention
// 6. Realtime failure does not crash UI

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subscribeOrderMessages, subscribeOrderStatus } from '../services/posService.js'

function createMockSupabaseClient() {
  const channels = []

  const client = {
    realtime: {
      get channels() {
        return channels
      },
      set channels(val) {
        channels.length = 0
        channels.push(...val)
      },
      _remove: (chan) => {
        const idx = channels.indexOf(chan)
        if (idx !== -1) channels.splice(idx, 1)
      },
    },
    getChannels: () => [...channels],
    removeChannel: (chan) => {
      const idx = channels.findIndex((c) => c === chan || c.topic === chan?.topic)
      if (idx !== -1) {
        channels[idx].state = 'closed'
        channels.splice(idx, 1)
      }
      return Promise.resolve('ok')
    },
    channel: (topic) => {
      // Supabase Realtime returns existing channel if topic matches
      const existing = channels.find((c) => c.topic === topic || c.topic === `realtime:${topic}`)
      if (existing) {
        return existing
      }

      const chan = {
        topic,
        state: 'closed',
        joinedOnce: false,
        callbacksRegistered: 0,
        subscribers: 0,
        events: [],
        teardownCalls: 0,
        teardown: function () {
          this.teardownCalls++
          this.state = 'closed'
        },
        on: function (event, config, callback) {
          if (this.state === 'joined' || this.state === 'joining' || this.joinedOnce) {
            throw new Error(`cannot add postgres_changes callbacks for ${this.topic} after subscribe()`)
          }
          this.callbacksRegistered++
          this.events.push({ event, config, callback })
          return this
        },
        subscribe: function (cb) {
          this.state = 'joined'
          this.joinedOnce = true
          this.subscribers++
          if (typeof cb === 'function') cb('SUBSCRIBED', null)
          return this
        },
        unsubscribe: async function () {
          this.state = 'closed'
          return 'ok'
        },
      }

      channels.push(chan)
      return chan
    },
  }

  return client
}

describe('Order Chat Realtime Lifecycle Regression Tests (211.md)', () => {
  const testOrderId = 'ord-test-uuid-9999'

  it('1. Callbacks before subscribe: registers all callbacks strictly before subscribe and blocks callbacks afterwards', () => {
    const client = createMockSupabaseClient()
    let callbackExecuted = false

    const channel = subscribeOrderMessages(
      testOrderId,
      (msg) => {
        callbackExecuted = true
      },
      client
    )

    assert.ok(channel, 'Channel must be created and returned')
    assert.strictEqual(channel.state, 'joined', 'Channel should be subscribed')
    assert.strictEqual(channel.callbacksRegistered, 1, 'Exactly one callback registered before subscribe')
    assert.strictEqual(channel.events[0].config.table, 'order_messages')
    assert.strictEqual(channel.events[0].config.filter, `order_id=eq.${testOrderId}`)

    // Test callback execution
    channel.events[0].callback({ new: { id: 'msg-1', message: 'Halo penjual' } })
    assert.strictEqual(callbackExecuted, true)

    // Test that adding callback after subscribe is safely prevented without throwing
    assert.doesNotThrow(() => {
      const res = channel.on('postgres_changes', {}, () => {})
      assert.strictEqual(res, channel)
    })
  })

  it('2. Cleanup removes channel: unsubscribe removes channel from client channels and cleans up', async () => {
    const client = createMockSupabaseClient()
    const channel = subscribeOrderMessages(testOrderId, () => {}, client)

    assert.strictEqual(client.getChannels().length, 1, 'Should have 1 active channel')

    await channel.unsubscribe()

    assert.strictEqual(client.getChannels().length, 0, 'Channel must be removed from client on unsubscribe')
    assert.strictEqual(channel.state, 'closed', 'Channel state must be closed')
  })

  it('3. Reopen chat: modal open -> close -> reopen lifecycle without "cannot add postgres_changes callbacks after subscribe()"', async () => {
    const client = createMockSupabaseClient()

    // First open
    const chan1 = subscribeOrderMessages(testOrderId, () => {}, client)
    assert.ok(chan1)
    assert.strictEqual(client.getChannels().length, 1)

    // Close
    await chan1.unsubscribe()
    assert.strictEqual(client.getChannels().length, 0)

    // Reopen immediately
    let chan2
    assert.doesNotThrow(() => {
      chan2 = subscribeOrderMessages(testOrderId, () => {}, client)
    })
    assert.ok(chan2)
    assert.strictEqual(chan2.state, 'joined')
    assert.strictEqual(client.getChannels().length, 1)
  })

  it('4. OrderId changes: switching orders removes previous channel and subscribes to new order channel', async () => {
    const client = createMockSupabaseClient()
    const orderA = 'ord-1111-aaaa'
    const orderB = 'ord-2222-bbbb'

    const chanA = subscribeOrderMessages(orderA, () => {}, client)
    assert.ok(chanA)
    assert.strictEqual(client.getChannels().length, 1)

    // User switches to Order B: cleanup order A
    await chanA.unsubscribe()
    assert.strictEqual(client.getChannels().length, 0)

    // Subscribe to order B
    const chanB = subscribeOrderMessages(orderB, () => {}, client)
    assert.ok(chanB)
    assert.strictEqual(chanB.events[0].config.filter, `order_id=eq.${orderB}`)
    assert.strictEqual(client.getChannels().length, 1)
  })

  it('5. Duplicate subscription prevention: calling subscribe twice with existing channel cleans up previous and does not crash', () => {
    const client = createMockSupabaseClient()

    // First subscription
    const chan1 = subscribeOrderMessages(testOrderId, () => {}, client)
    assert.ok(chan1)
    assert.strictEqual(chan1.state, 'joined')

    // Second subscription without explicit unsubscribe (e.g. StrictMode or double-invocation)
    let chan2
    assert.doesNotThrow(() => {
      chan2 = subscribeOrderMessages(testOrderId, () => {}, client)
    })

    assert.ok(chan2, 'Second subscription must succeed')
    assert.strictEqual(chan2.state, 'joined')
    assert.strictEqual(chan2.callbacksRegistered, 1, 'Callbacks were safely registered on fresh channel')
  })

  it('6. Realtime failure does not crash UI: graceful fallback on client errors and callback exceptions', () => {
    // 6a. Null client or missing channel method
    const nullResult = subscribeOrderMessages(testOrderId, () => {}, null)
    assert.strictEqual(nullResult, null, 'Should return null when client is missing')

    const emptyClient = {}
    const emptyResult = subscribeOrderMessages(testOrderId, () => {}, emptyClient)
    assert.strictEqual(emptyResult, null, 'Should return null when client.channel is missing')

    // 6b. Client throwing error during channel creation
    const throwingClient = {
      getChannels: () => [],
      channel: () => {
        throw new Error('Supabase websocket connection failed')
      },
    }
    let errorResult
    assert.doesNotThrow(() => {
      errorResult = subscribeOrderMessages(testOrderId, () => {}, throwingClient)
    })
    assert.strictEqual(errorResult, null, 'Should catch error and return null gracefully')

    // 6c. onMessage callback throwing error does not bubble out
    const normalClient = createMockSupabaseClient()
    const safeChannel = subscribeOrderMessages(
      testOrderId,
      () => {
        throw new Error('Crash in UI callback!')
      },
      normalClient
    )
    assert.ok(safeChannel)

    // Trigger message event - must not throw
    assert.doesNotThrow(() => {
      safeChannel.events[0].callback({ new: { id: 'm-err', message: 'test' } })
    })
  })
})
