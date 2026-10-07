// BisnisSehat - Web Push Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const title = data.title || 'BisnisSehat Notifikasi'
    const options = {
      body: data.message || '',
      icon: '/pwa-192x192.png',
      badge: '/favicon-32x32.png',
      data: {
        url: data.action_url || '/dashboard'
      },
      tag: data.dedup_key || undefined,
      renotify: Boolean(data.dedup_key)
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    console.error('[ServiceWorker] Push event parse error:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          if ('navigate' in client) {
            return client.navigate(targetUrl)
          }
          return client
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
