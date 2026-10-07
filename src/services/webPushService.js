import { supabase } from '../lib/supabase.js'

const VAPID_STORAGE_KEY = 'bisnissehat_push_prompted'

/**
 * Check if Web Push & Service Workers are supported in the current browser environment
 */
export function isWebPushSupported() {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Get current browser notification permission status
 */
export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/**
 * Register the Service Worker for Push
 */
export async function registerServiceWorker() {
  if (!isWebPushSupported()) return null

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    })
    return registration
  } catch (error) {
    console.warn('[WebPush] Service Worker registration failed:', error)
    return null
  }
}

/**
 * Request notification permission gracefully
 * Returns boolean indicating if permission is granted
 */
export async function requestNotificationPermission() {
  if (!isWebPushSupported()) return false

  // If already denied, do not spam user
  if (Notification.permission === 'denied') {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch (error) {
    console.warn('[WebPush] Permission request error:', error)
    return false
  }
}

/**
 * Subscribe to Web Push and save subscription in Supabase
 */
export async function subscribeToPush(businessId, userId) {
  if (!isWebPushSupported() || !businessId || !userId) return null

  try {
    const registration = await registerServiceWorker()
    if (!registration) return null

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription()
    
    // If not subscribed yet, and user hasn't granted permission, don't force
    if (!subscription) {
      const granted = await requestNotificationPermission()
      if (!granted) return null

      // Get VAPID public key if configured, or create subscription
      const vapidPublicKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VAPID_PUBLIC_KEY) || (typeof process !== 'undefined' && process.env?.VITE_VAPID_PUBLIC_KEY)
      const options = {
        userVisibleOnly: true,
      }
      if (vapidPublicKey) {
        options.applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
      }

      // If no VAPID key is provided in environment, browser-level Notification API will serve as client fallback
      if (options.applicationServerKey) {
        subscription = await registration.pushManager.subscribe(options)
      }
    }

    // If we have an active Web Push subscription, sync to Supabase
    if (subscription) {
      const subJson = subscription.toJSON()
      if (subJson.endpoint && subJson.keys) {
        await supabase
          .from('web_push_subscriptions')
          .upsert({
            business_id: businessId,
            user_id: userId,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            user_agent: navigator.userAgent || '',
            updated_at: new Date().toISOString()
          }, { onConflict: 'endpoint' })
      }
    }

    return subscription
  } catch (error) {
    console.warn('[WebPush] Subscription error (graceful fallback active):', error)
    return null
  }
}

/**
 * Trigger local browser notification as immediate fallback if tab is in background
 */
export function showLocalNotification(title, message, actionUrl) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const notif = new Notification(title, {
      body: message,
      icon: '/pwa-192x192.png',
      badge: '/favicon-32x32.png'
    })

    if (actionUrl) {
      notif.onclick = () => {
        window.focus()
        window.location.href = actionUrl
        notif.close()
      }
    }
  } catch (e) {
    // Fallback quietly on restricted environments
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
