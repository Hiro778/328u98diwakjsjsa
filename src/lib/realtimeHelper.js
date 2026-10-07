// src/lib/realtimeHelper.js
// Safe Supabase Realtime Channel Lifecycle Management
// Strictly enforces:
// 1. All callbacks registered BEFORE subscribe()
// 2. Elimination of duplicate / stale channels in client.getChannels()
// 3. Immediate removal of channels on unsubscribe
// 4. Global teardown / removal of all channels on logout

import { supabase } from './supabase.js'

/**
 * Removes and prunes all active Supabase Realtime channels from the client instance.
 * Safe to call during auth signOut or route transitions.
 *
 * @param {object} [client=supabase]
 * @returns {Promise<void>}
 */
export async function cleanupAllRealtimeChannels(client = supabase) {
  if (!client) return

  try {
    if (typeof client.removeAllChannels === 'function') {
      await client.removeAllChannels()
    }
  } catch (err) {
    console.warn('[realtimeHelper] removeAllChannels caught error:', err)
  }

  // Prune any stubborn references in internal realtime list if present
  try {
    if (client.realtime && Array.isArray(client.realtime.channels)) {
      client.realtime.channels.length = 0
    }
  } catch {}
}

/**
 * Creates and initializes a safe Realtime channel, strictly preventing
 * "cannot add postgres_changes callbacks ... after subscribe()" errors.
 *
 * @param {object} client Supabase client instance
 * @param {string} channelName Name/topic of the channel
 * @param {(channel: object) => void} configureCallbacks Function registering all .on() event listeners
 * @returns {object|null} The subscribed channel
 */
export function createSafeRealtimeChannel(client, channelName, configureCallbacks) {
  if (!client || !channelName || typeof client.channel !== 'function') return null

  try {
    // 1. Remove and prune any pre-existing channels with this topic
    if (typeof client.getChannels === 'function') {
      const channels = client.getChannels() || []
      const existingList = channels.filter(
        (c) => c && (c.topic === `realtime:${channelName}` || c.topic === channelName || c.subTopic === channelName)
      )
      for (const existing of existingList) {
        try {
          if (typeof client.removeChannel === 'function') {
            client.removeChannel(existing)
          }
        } catch {}
        try {
          if (client.realtime && Array.isArray(client.realtime.channels)) {
            client.realtime.channels = client.realtime.channels.filter((c) => c !== existing)
          }
        } catch {}
        try {
          if (typeof existing.teardown === 'function') {
            existing.teardown()
          }
        } catch {}
      }
    }

    // 2. Obtain channel instance and ensure it has not already subscribed
    let channel = client.channel(channelName)

    if (
      channel &&
      (channel.state === 'joined' ||
        channel.state === 'joining' ||
        channel.state === 'subscribing' ||
        channel.joinedOnce ||
        (channel.bindings?.postgres_changes && channel.bindings.postgres_changes.length > 0))
    ) {
      try {
        if (typeof client.removeChannel === 'function') client.removeChannel(channel)
        if (client.realtime && Array.isArray(client.realtime.channels)) {
          client.realtime.channels = client.realtime.channels.filter((c) => c !== channel)
        }
        if (typeof channel.teardown === 'function') channel.teardown()
      } catch {}
      channel = client.channel(channelName)
    }

    if (!channel || typeof channel.on !== 'function') return null

    // 3. Register ALL event handlers strictly BEFORE subscribe()
    if (typeof configureCallbacks === 'function') {
      configureCallbacks(channel)
    }

    // 4. Subscribe
    if (typeof channel.subscribe === 'function') {
      channel.subscribe((status, err) => {
        if (err) {
          console.warn(`[realtimeHelper] Channel ${channelName} status error:`, status, err)
        }
      })
    }

    // 5. Disallow adding any further callbacks after subscribe()
    channel.on = () => {
      console.warn(`[realtimeHelper] Cannot add callbacks for ${channelName} after subscribe()`)
      return channel
    }

    // 6. Wrap unsubscribe to guarantee removeChannel is called on the client
    if (typeof channel.unsubscribe === 'function' && typeof client.removeChannel === 'function') {
      const origUnsubscribe = channel.unsubscribe.bind(channel)
      channel.unsubscribe = async () => {
        try {
          return await origUnsubscribe()
        } finally {
          try {
            client.removeChannel(channel)
          } catch {}
          try {
            if (client.realtime && Array.isArray(client.realtime.channels)) {
              client.realtime.channels = client.realtime.channels.filter((c) => c !== channel)
            }
          } catch {}
          try {
            if (typeof channel.teardown === 'function') {
              channel.teardown()
            }
          } catch {}
        }
      }
    }

    return channel
  } catch (err) {
    console.error(`[realtimeHelper] createSafeRealtimeChannel(${channelName}) error:`, err)
    return null
  }
}
