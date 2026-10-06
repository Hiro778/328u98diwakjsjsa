import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { getOrderMessages, sendOrderMessage, subscribeOrderMessages, normalizeOrderError } from '../../services/posService'

export default function OrderChatModal({
  isOpen,
  onClose,
  order,
  senderType = 'customer',
  senderName = '',
}) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

  const isCompleted = order?.order_status === 'selesai' || order?.order_status === 'completed'
  const isCancelled = order?.order_status === 'dibatalkan' || order?.order_status === 'cancelled'
  const isChatDisabled = isCompleted || isCancelled

  useEffect(() => {
    if (!isOpen || !order?.id) {
      setMessages([])
      setError('')
      return
    }

    let isMounted = true
    let activeChannel = null
    setLoading(true)
    setError('')

    // 1. Fetch initial message history safely
    async function fetchMessages() {
      try {
        const res = await getOrderMessages(order.id)
        if (isMounted) {
          if (res?.success) {
            setMessages(res.messages || [])
          } else if (res?.error) {
            setError(res.error.message || 'Gagal memuat pesan.')
          }
          setLoading(false)
        }
      } catch (fetchErr) {
        if (isMounted) {
          setError(fetchErr.message || 'Gagal memuat pesan.')
          setLoading(false)
        }
      }
    }
    fetchMessages()

    // 2. Realtime subscription for incoming messages (never crashes UI)
    try {
      activeChannel = subscribeOrderMessages(order.id, (newMsg) => {
        if (!isMounted || !newMsg) return
        setMessages((prev) => {
          // Prevent duplicate append if message already exists
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      })
    } catch (realtimeErr) {
      console.warn('[OrderChatModal] Realtime subscription caught error (graceful fallback):', realtimeErr)
    }

    return () => {
      isMounted = false
      if (activeChannel) {
        try {
          if (typeof supabase.removeChannel === 'function') {
            supabase.removeChannel(activeChannel)
          } else if (activeChannel.unsubscribe) {
            activeChannel.unsubscribe()
          }
        } catch (cleanupErr) {
          console.warn('[OrderChatModal] Channel cleanup error:', cleanupErr)
        }
        activeChannel = null
      }
    }
  }, [isOpen, order?.id])

  // Auto-scroll to bottom on messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  async function handleSend(e) {
    if (e) e.preventDefault()
    const text = inputText.trim()
    if (!text || sending || isChatDisabled) return

    setSending(true)
    setError('')

    const res = await sendOrderMessage({
      orderId: order.id,
      senderType,
      senderName,
      message: text,
    })

    if (res.success) {
      setInputText('')
      // Optimistic update if realtime is delayed
      if (res.message && !messages.some((m) => m.id === res.message.id)) {
        setMessages((prev) => [...prev, res.message])
      }
    } else {
      setError(res.error?.message || 'Gagal mengirim pesan.')
    }
    setSending(false)
  }

  if (!isOpen) return null

  const isMerchant = senderType === 'merchant'
  const title = isMerchant ? 'Chat Pembeli' : 'Chat Penjual'
  const subtitle = isMerchant
    ? `Pesanan #${order?.order_number || order?.id?.slice(-6)?.toUpperCase() || ''} — ${order?.customer_name || 'Pelanggan'}`
    : `Pesanan #${order?.order_number || order?.id?.slice(-6)?.toUpperCase() || ''}`

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex flex-col w-full max-w-[calc(100vw-24px)] sm:max-w-lg h-[560px] max-h-[calc(100dvh-24px)] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/80">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">{title}</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isChatDisabled
                      ? 'bg-gray-200 text-gray-600'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isChatDisabled ? 'bg-gray-500' : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  {isChatDisabled ? 'Selesai' : 'Aktif'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
              aria-label="Tutup Obrolan"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="mt-2 text-xs text-gray-400">Memuat riwayat obrolan...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-10 px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 mb-3">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-gray-700">Belum ada pesan</p>
                <p className="text-[11px] text-gray-400 mt-1 max-w-xs">
                  {isMerchant
                    ? 'Kirim pesan pertama untuk mengabari pembeli mengenai pesanan mereka.'
                    : 'Anda dapat menanyakan status pesanan atau catatan khusus kepada penjual.'}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_type === senderType
                const timeStr = msg.created_at
                  ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  : ''

                return (
                  <div
                    key={msg.id || `${msg.created_at}-${Math.random()}`}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-baseline gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-bold text-gray-500">
                        {isMe ? 'Anda' : msg.sender_name || (msg.sender_type === 'merchant' ? 'Penjual' : 'Pembeli')}
                      </span>
                      <span className="text-[9px] text-gray-400">{timeStr}</span>
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-white text-gray-800 border border-gray-200/80 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error Notice */}
          {error && (
            <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          )}

          {/* Disabled Notice */}
          {isChatDisabled && (
            <div className="px-4 py-2.5 bg-gray-100 border-t border-gray-200 text-center">
              <p className="text-xs font-semibold text-gray-600">
                {isCompleted
                  ? 'Pesanan telah selesai. Obrolan ditutup (mode hanya-baca).'
                  : 'Pesanan telah dibatalkan. Obrolan ditutup.'}
              </p>
            </div>
          )}

          {/* Input Bar */}
          {!isChatDisabled && (
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Tulis pesan..."
                maxLength={2000}
                disabled={sending}
                className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 transition"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition"
              >
                {sending ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span>Kirim</span>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
