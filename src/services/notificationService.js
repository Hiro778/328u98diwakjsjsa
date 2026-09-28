import { supabase } from '../lib/supabase.js'
import { showLocalNotification } from './webPushService.js'
import { loadCalendarItems } from './contentCalendarService.js'

/**
 * Valid notification categories according to BisnisSehat architecture
 */
export const NOTIFICATION_CATEGORIES = [
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
  'sales',
  'customer',
  'supplier',
]

/**
 * Fetch persistent notifications for a business
 */
export async function fetchNotifications(businessId, limit = 50) {
  if (!businessId) return { data: [], error: null }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[NotificationService] Fetch error:', error)
    return { data: [], error }
  }

  return { data: data || [], error: null }
}

/**
 * Fetch unread notification count
 */
export async function getUnreadCount(businessId) {
  if (!businessId) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('is_read', false)

  if (error) {
    console.error('[NotificationService] Count error:', error)
    return 0
  }

  return count || 0
}

/**
 * Create a new notification with deduplication
 */
export async function createNotification({
  business_id,
  title,
  message,
  category = 'general',
  priority = 'normal',
  action_url = null,
  dedup_key = null,
}) {
  if (!business_id || !title || !message) {
    return { data: null, error: new Error('Missing required notification fields') }
  }

  const { data, error } = await supabase
    .from('notifications')
    .upsert(
      {
        business_id,
        title,
        message,
        category,
        priority,
        action_url,
        dedup_key,
        is_read: false,
      },
      {
        onConflict: 'business_id,dedup_key',
        ignoreDuplicates: true,
      }
    )
    .select()
    .maybeSingle()

  if (error) {
    console.error('[NotificationService] Create error:', error)
    return { data: null, error }
  }

  // Trigger Server-Side Web Push & Local Notification fallback if high/urgent priority
  if (priority === 'high' || priority === 'urgent') {
    showLocalNotification(title, message, action_url)
    // Server-side Web Push delivery to all registered endpoints for this business
    supabase.functions
      .invoke('send-web-push', {
        body: {
          notification_id: data?.id,
          business_id,
          title,
          message,
          category,
          priority,
          action_url,
          dedup_key,
        },
      })
      .catch((err) => {
        console.warn('[NotificationService] Server push dispatch caught:', err)
      })
  }

  return { data, error: null }
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(notificationId) {
  if (!notificationId) return { success: false }

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)

  if (error) {
    console.error('[NotificationService] Mark read error:', error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Mark all notifications as read for a business
 */
export async function markAllAsRead(businessId) {
  if (!businessId) return { success: false }

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('business_id', businessId)
    .eq('is_read', false)

  if (error) {
    console.error('[NotificationService] Mark all read error:', error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Delete a notification permanently (Persistent X button)
 */
export async function deleteNotification(notificationId) {
  if (!notificationId) return { success: false }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    console.error('[NotificationService] Delete error:', error)
    return { success: false, error }
  }

  return { success: true }
}

/**
 * Run scheduled & due-date notification sync
 * 1. Invokes the server-side RPC sync_due_notifications(businessId)
 * 2. Syncs client-side Content Calendar due items
 */
export async function syncDueNotifications(businessId) {
  if (!businessId) return { serverCount: 0, calendarCount: 0 }

  let serverCount = 0
  let calendarCount = 0

  // 1. Invoke server-side database sync RPC
  try {
    const { data, error } = await supabase.rpc('sync_due_notifications', {
      p_business_id: businessId,
    })
    if (!error && typeof data === 'number') {
      serverCount = data
    }
  } catch (err) {
    console.warn('[NotificationService] RPC sync_due_notifications error:', err)
  }

  // 2. Sync Content Calendar items due today
  try {
    const calendarItems = loadCalendarItems(businessId)
    const todayStr = new Date().toISOString().split('T')[0]

    for (const item of calendarItems) {
      if (item.publishDate === todayStr && item.status === 'scheduled') {
        const dedupKey = `cal_due_${item.id}_${todayStr}`
        const res = await createNotification({
          business_id: businessId,
          title: 'Jadwal Konten Hari Ini',
          message: `Konten "${item.title}" dijadwalkan tayang hari ini (${item.platform || 'Media Sosial'}).`,
          category: 'content_calendar',
          priority: 'normal',
          action_url: '/dashboard/marketing/content-calendar',
          dedup_key: dedupKey,
        })
        if (res.data) {
          calendarCount++
        }
      }
    }
  } catch (calErr) {
    console.warn('[NotificationService] Calendar sync error:', calErr)
  }

  return { serverCount, calendarCount }
}

/**
 * Subscribe to live Supabase Realtime changes for notifications
 */
export function subscribeToNotifications(businessId, onEvent) {
  if (!businessId) return null

  const channelName = `notifications:${businessId}`

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `business_id=eq.${businessId}`,
      },
      (payload) => {
        if (onEvent) {
          onEvent(payload)
        }
      }
    )
    .subscribe()

  return channel
}
