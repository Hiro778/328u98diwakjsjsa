import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotifications } from '../hooks/useNotifications'

const CATEGORY_LABELS = {
  invoice: { label: 'Invoice', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  order: { label: 'Pesanan', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  inventory: { label: 'Stok', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  content_calendar: { label: 'Konten', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
  legalitas: { label: 'Legalitas', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  marketplace: { label: 'Marketplace', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  whatsapp: { label: 'WhatsApp', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
  creative: { label: 'Creative', bg: 'bg-pink-50 text-pink-700 border-pink-200' },
  subscription: { label: 'Langganan', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  general: { label: 'Info', bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  sales: { label: 'Penjualan', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  customer: { label: 'Pelanggan', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  supplier: { label: 'Pemasok', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now - date) / 1000)

  if (diffInSeconds < 60) return 'Baru saja'
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) return `${diffInMinutes} mnt lalu`
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours} jam lalu`
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays === 1) return 'Kemarin'
  if (diffInDays < 7) return `${diffInDays} hari lalu`

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}

export default function NotificationDropdown() {
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications()

  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      markAsRead(item.id)
    }
    if (item.action_url) {
      setOpen(false)
      navigate(item.action_url)
    }
  }

  const handleDelete = (e, id) => {
    e.stopPropagation()
    deleteNotification(id)
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* 🔔 Notification Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Pusat Notifikasi"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-700"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow-sm ring-2 ring-surface animate-in fade-in zoom-in duration-150">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Box */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full mt-2 w-auto sm:w-96 rounded-2xl border border-border bg-surface shadow-xl z-50 overflow-hidden flex flex-col max-h-[calc(100dvh-5rem)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-navy-700">Notifikasi</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs font-medium text-navy-600 hover:text-navy-800 transition-colors"
                  >
                    Tandai dibaca
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-md text-text-muted hover:text-text-primary text-xs cursor-pointer sm:hidden"
                  aria-label="Tutup notifikasi"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-400 mb-3">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-navy-700">Belum ada notifikasi</p>
                  <p className="text-xs text-text-muted mt-1 max-w-[200px]">
                    Semua update dan informasi penting bisnis Anda akan muncul di sini.
                  </p>
                </div>
              ) : (
                notifications.map((item) => {
                  const catConfig = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.general
                  const isUrgent = item.priority === 'urgent'

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`group relative flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                        item.is_read
                          ? 'bg-surface hover:bg-cream/40 opacity-80 hover:opacity-100'
                          : 'bg-navy-50/40 hover:bg-navy-50/70'
                      }`}
                    >
                      {/* Unread dot */}
                      <div className="mt-1.5 shrink-0">
                        {!item.is_read ? (
                          <span
                            className={`block h-2 w-2 rounded-full ${
                              isUrgent ? 'bg-rose-500' : 'bg-navy-600'
                            }`}
                          />
                        ) : (
                          <span className="block h-2 w-2 rounded-full bg-transparent" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${catConfig.bg}`}
                          >
                            {catConfig.label}
                          </span>
                          {isUrgent && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              Penting
                            </span>
                          )}
                          <span className="text-[11px] text-text-muted">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        </div>

                        <h4
                          className={`text-xs font-semibold leading-snug ${
                            item.is_read ? 'text-navy-600' : 'text-navy-800'
                          }`}
                        >
                          {item.title}
                        </h4>

                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>
                      </div>

                      {/* Delete X Button (Persistent) */}
                      <button
                        onClick={(e) => handleDelete(e, item.id)}
                        aria-label="Hapus notifikasi"
                        title="Hapus"
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 text-text-muted hover:text-rose-600 transition-all p-1 rounded-md hover:bg-black/5 shrink-0 cursor-pointer"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
