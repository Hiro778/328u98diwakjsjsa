import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext'
import {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  syncDueNotifications,
  subscribeToNotifications,
} from '../services/notificationService.js'
import { subscribeToPush } from '../services/webPushService.js'

export function useNotifications() {
  const { business, user } = useAuth()
  const businessId = business?.id
  const userId = user?.id

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const isSyncingRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!businessId) {
      setNotifications([])
      setLoading(false)
      return
    }

    const { data } = await fetchNotifications(businessId)
    setNotifications(data || [])
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    loadData()

    if (!businessId) return

    // Background scheduled sync & Web Push setup (graceful, non-blocking, deferred)
    let syncTimer = null
    if (!isSyncingRef.current) {
      syncTimer = setTimeout(() => {
        isSyncingRef.current = true
        syncDueNotifications(businessId)
          .then(() => loadData())
          .catch((err) => console.warn('[useNotifications] Initial sync caught:', err))
          .finally(() => {
            isSyncingRef.current = false
          })

        if (userId) {
          subscribeToPush(businessId, userId).catch((err) =>
            console.warn('[useNotifications] Web Push subscription caught:', err)
          )
        }
      }, 1500)
    }

    // Subscribe to Realtime Postgres changes
    const channel = subscribeToNotifications(businessId, (payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload

      if (eventType === 'INSERT' && newRecord) {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === newRecord.id)) return prev
          return [newRecord, ...prev]
        })
      } else if (eventType === 'UPDATE' && newRecord) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === newRecord.id ? { ...n, ...newRecord } : n))
        )
      } else if (eventType === 'DELETE' && oldRecord) {
        setNotifications((prev) => prev.filter((n) => n.id !== oldRecord.id))
      }
    })

    return () => {
      if (syncTimer) clearTimeout(syncTimer)
      if (channel) {
        if (typeof supabase.removeChannel === 'function') {
          supabase.removeChannel(channel)
        } else if (channel.unsubscribe) {
          channel.unsubscribe()
        }
      }
    }
  }, [businessId, userId, loadData])

  const handleMarkAsRead = useCallback(async (id) => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    )
    await markAsRead(id)
  }, [])

  const handleMarkAllAsRead = useCallback(async () => {
    if (!businessId) return
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    )
    await markAllAsRead(businessId)
  }, [businessId])

  const handleDelete = useCallback(async (id) => {
    // Optimistic UI update
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await deleteNotification(id)
  }, [])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDelete,
    refetch: loadData,
  }
}
