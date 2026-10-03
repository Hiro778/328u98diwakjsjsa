import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { usePlatformSettings } from '../../hooks/usePlatformSettings'
import BackButton from '../../components/BackButton'
import { supabase } from '../../lib/supabase'
import { processAiBusinessOperatorQuery } from '../../services/aiBusinessOperator'
import SubscriptionGate from '../../components/SubscriptionGate'

// ── AI SHORTCUT OFFER — localStorage keys ──
const LS_OFFER_DISMISSED = 'bs_ai_shortcut_offer_dismissed'
const LS_SHORTCUT_PINNED = 'bs_ai_shortcut_pinned'

// Core suggested prompt questions per specification
const CORE_SUGGESTED_PROMPTS = [
  {
    id: 'top-product',
    label: 'Produk paling laku bulan ini?',
    query: 'Produk apa paling laku bulan ini?',
    icon: '🏆',
  },
  {
    id: 'monthly-revenue',
    label: 'Berapa omzet saya bulan ini?',
    query: 'Berapa omzet saya bulan ini?',
    icon: '💰',
  },
  {
    id: 'margin-check',
    label: 'Berapa margin saya?',
    query: 'Berapa margin saya?',
    icon: '📊',
  },
  {
    id: 'restock-time',
    label: 'Kapan harus restock?',
    query: 'Kapan saya harus restock?',
    icon: '📦',
  },
]

// Additional business questions
const EXTENDED_PROMPTS = [
  'Produk mana yang marginnya paling kecil?',
  'Kenapa penjualan turun?',
  'Bandingkan penjualan bulan ini dengan bulan lalu.',
]

const INITIAL_GREETING = {
  id: 'msg-initial',
  sender: 'assistant',
  text: 'Halo! Saya AI BisnisSehat.\n"Tanya atau minta saya melakukan sesuatu untuk bisnis kamu."',
  timestamp: 'Baru saja',
  isInitial: true,
}

// Mock responses for UI testing & demonstration (strictly UI-only, no real database claim)
function getMockAssistantResponse(query, businessName) {
  const q = (query || '').toLowerCase()

  let body = ''
  if (q.includes('laku') || q.includes('terlaris')) {
    body = `Berdasarkan simulasi data penjualan produk:\n\n` +
      `1. **Kopi Susu Aren** — 312 transaksi (Kontribusi omzet 42%)\n` +
      `2. **Roti Bakar Cokelat** — 164 transaksi (Kontribusi omzet 24%)\n` +
      `3. **Es Teh Lemon** — 128 transaksi (Kontribusi omzet 15%)\n\n` +
      `Saran: Tingkatkan ketersediaan bahan baku Kopi Susu Aren untuk akhir pekan.`
  } else if (q.includes('omzet') || q.includes('pendapatan')) {
    body = `Simulasi total omzet bulan berjalan untuk ${businessName || 'toko Anda'}:\n\n` +
      `• Total Omzet: **Rp 14.850.000**\n` +
      `• Total Transaksi: **648 pesanan**\n` +
      `• Rata-rata Nilai Pesanan: **Rp 22.900**\n\n` +
      `Tren: Penjualan stabil dengan lonjakan transaksi pada jam makan siang.`
  } else if (q.includes('margin') || q.includes('profit')) {
    body = `Simulasi evaluasi margin bisnis:\n\n` +
      `• Rata-rata margin kotor: **52%** (Kategori Sehat)\n` +
      `• Margin tertinggi: Minuman kopi (65%)\n` +
      `• Margin terendah: Makanan berat (32%)\n\n` +
      `Saran: Evaluasi supplier bahan baku makanan berat untuk menaikkan margin.`
  } else if (q.includes('restock') || q.includes('stok')) {
    body = `Simulasi peringatan inventori:\n\n` +
      `⚠️ Item mendekati batas minimum:\n` +
      `• Biji Kopi Blend (Sisa 1.5 kg, estimasi habis: 2 hari)\n` +
      `• Susu Fresh Milk (Sisa 4 liter, estimasi habis: 1 hari)\n\n` +
      `Jadwal restock direkomendasikan sebelum akhir pekan.`
  } else {
    body = `Terima kasih atas pertanyaannya: "${query}".\n\n` +
      `Sebagai asisten analisis bisnis, saya siap membantu mengevaluasi tren kasir POS, ` +
      `margin HPP, dan manajemen inventori toko ${businessName || 'Anda'}.`
  }

  return {
    text: body,
    disclaimer: '⚠️ Simulasi Respons UI — Data hanya contoh pratinjau antarmuka (belum terhubung ke live LLM).',
  }
}

let msgCounter = 0
function createMessageId(prefix) {
  msgCounter += 1
  return `${prefix}-${msgCounter}`
}

function getFormattedTime() {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function AiBusinessAnalystPage({ isStandalone = false }) {
  const { business, isPro } = useAuth()
  const { isAiEnabled } = usePlatformSettings()

  const businessName = business?.name || 'Bisnis Anda'

  const [messages, setMessages] = useState([INITIAL_GREETING])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // ── AI Shortcut Offer state (Pro only, first-use, non-blocking) ──
  const [showShortcutOffer, setShowShortcutOffer] = useState(false)
  const shortcutOfferShownRef = useRef(false) // prevent re-show within session

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSendMessage = async (textToSend = null) => {
    const query = (textToSend !== null ? textToSend : inputValue).trim()
    if (!query || isLoading) return

    const userMsg = {
      id: createMessageId('usr'),
      sender: 'user',
      text: query,
      timestamp: getFormattedTime(),
    }

    setMessages((prev) => [...prev, userMsg])
    if (textToSend === null) setInputValue('')
    setIsLoading(true)

    try {
      // 1. Try invoking the live Supabase Edge Function with TokenKoding Ling
      let result = null
      try {
        const { data, error } = await supabase.functions.invoke('ai-business-analyst', {
          body: {
            message: query,
            history: messages.slice(-4).map((m) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text,
            })),
          },
        })
        if (!error && data && data.text) {
          result = data
        }
      } catch {
        // Fallback to local operator if edge function offline or in local mock
      }

      // 2. Local fallback operator if edge function not reachable
      if (!result) {
        result = await processAiBusinessOperatorQuery({
          query,
          businessId: business?.id,
          businessName,
        })
      }

      const assistantMsg = {
        id: createMessageId('ai'),
        sender: 'assistant',
        text: result.text,
        suggestions: result.suggestions,
        confirmationRequired: result.confirmationRequired,
        confirmationId: result.confirmationId,
        action: result.action,
        target: result.target,
        disclaimer: result.isThreat
          ? null
          : '⚠️ Analisis Berbasis Data Terverifikasi — Selalu tinjau keputusan strategis bisnis.',
        timestamp: getFormattedTime(),
      }
      setMessages((prev) => [...prev, assistantMsg])

      // ── Shortcut Offer: show once after first successful AI interaction (Pro only) ──
      if (
        isPro &&
        !shortcutOfferShownRef.current &&
        !localStorage.getItem(LS_OFFER_DISMISSED) &&
        !localStorage.getItem(LS_SHORTCUT_PINNED)
      ) {
        shortcutOfferShownRef.current = true
        setShowShortcutOffer(true)
      }
    } catch {
      // Fallback in case of client execution error
      const mockResp = getMockAssistantResponse(query, businessName)
      const assistantMsg = {
        id: createMessageId('ai'),
        sender: 'assistant',
        text: mockResp.text,
        disclaimer: mockResp.disclaimer,
        timestamp: getFormattedTime(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmAction = async (confirmationId, confirmed, action, target) => {
    if (isLoading || !confirmationId) return

    const userText = confirmed
      ? `Ya, Hapus Supplier ${target?.name || ''}`.trim()
      : 'Batal'

    const userMsg = {
      id: createMessageId('usr'),
      sender: 'user',
      text: userText,
      timestamp: getFormattedTime(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    try {
      let result = null
      try {
        const { data, error } = await supabase.functions.invoke('ai-business-analyst', {
          body: { confirmationId, confirmed },
        })
        if (!error && data && data.text) {
          result = data
        }
      } catch {
        // Fallback
      }

      if (!result) {
        result = await processAiBusinessOperatorQuery({
          query: userText,
          businessId: business?.id,
          businessName,
          confirmationId,
          confirmed,
        })
      }

      const assistantMsg = {
        id: createMessageId('ai'),
        sender: 'assistant',
        text: result.text,
        timestamp: getFormattedTime(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      const assistantMsg = {
        id: createMessageId('ai'),
        sender: 'assistant',
        text: confirmed
          ? `Gagal memproses penghapusan supplier. Silakan coba kembali.`
          : `Tindakan dibatalkan.`,
        timestamp: getFormattedTime(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleResetChat = () => {
    setMessages([INITIAL_GREETING])
    setInputValue('')
    inputRef.current?.focus()
  }

  // ── Shortcut Offer handlers ──
  const handleShortcutAdd = useCallback(() => {
    localStorage.setItem(LS_SHORTCUT_PINNED, '1')
    setShowShortcutOffer(false)
  }, [])

  const handleShortcutDismiss = useCallback(() => {
    localStorage.setItem(LS_OFFER_DISMISSED, '1')
    setShowShortcutOffer(false)
  }, [])

  // Pro-only entitlement gate
  if (!isPro) {
    return (
      <div className={isStandalone ? 'min-h-screen bg-canvas py-8 px-4 sm:px-6' : 'py-4'}>
        <SubscriptionGate featureName="AI Business Analyst" requiredPlan="pro" />
      </div>
    )
  }

  return (
    <div
      data-testid="ai-business-analyst-page"
      className={`flex flex-col w-full min-w-0 overflow-x-hidden ${
        isStandalone
          ? 'h-screen max-h-screen bg-background'
          : 'h-[calc(100vh-5rem)] min-h-[520px] max-h-[calc(100vh-5rem)]'
      }`}
    >
      {/* ── TOPBAR NAVIGATION (If Standalone) ── */}
      {isStandalone && (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/95 backdrop-blur-md px-3 sm:px-6 pt-[env(safe-area-inset-top,0px)]">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <span className="text-xs font-black">BS</span>
            </div>
            <div className="leading-tight">
              <span className="block text-xs sm:text-sm font-bold text-text-primary">BisnisSehat</span>
              <span className="block text-[10px] text-text-muted">OS UMKM Modern</span>
            </div>
          </Link>

          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden min-[360px]:inline">Ke Dashboard</span>
          </Link>
        </header>
      )}

      {/* ── MAIN WORKSPACE CONTAINER ── */}
      <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto p-2 sm:p-4 lg:p-6 min-h-0 overflow-hidden">
        {/* Back navigation button when in dashboard shell */}
        {!isStandalone && (
          <div className="shrink-0 mb-2">
            <BackButton fallbackUrl="/dashboard" label="Kembali ke Dashboard" />
          </div>
        )}

        {/* ── CHAT SHELL CARD ── */}
        <div className="flex-1 flex flex-col rounded-2xl border border-border bg-surface shadow-xs overflow-hidden min-h-0">
          {/* ── 1. HEADER ── */}
          <div
            data-testid="ai-header"
            className="flex items-center justify-between border-b border-border bg-surface px-3 py-3 sm:px-5 sm:py-3.5 shrink-0"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg">✨</span>
                <h1 className="text-sm sm:text-base font-bold text-text-primary truncate">
                  AI Business Analyst
                </h1>
              </div>
              <p className="text-[11px] sm:text-xs text-text-muted truncate mt-0.5">
                Konsultan Cerdas & Analisis Data Bisnis Anda
              </p>
            </div>

            {/* Status indicator & reset */}
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  className="rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                  Reset
                </button>
              )}

              <div
                data-testid="ai-status-indicator"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                  isAiEnabled !== false
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                    : 'border-amber-500/20 bg-amber-500/10 text-amber-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isAiEnabled !== false ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span>{isAiEnabled !== false ? '● Online' : 'Dinonaktifkan'}</span>
              </div>
            </div>
          </div>

          {/* Feature flag alert if disabled */}
          {isAiEnabled === false && (
            <div
              data-testid="ai-feature-disabled-banner"
              className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-2 text-xs text-amber-700 flex items-center gap-2 shrink-0"
            >
              <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Fitur AI dinonaktifkan sementara oleh pengaturan platform (enable_ai_features).</span>
            </div>
          )}

          {/* ── 2. CHAT CANVAS / MESSAGE STREAM ── */}
          <div
            data-testid="chat-area"
            className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5 min-h-0 bg-background/50"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex items-end gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[85%] ${
                    msg.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {/* Assistant Avatar */}
                  {msg.sender === 'assistant' && (
                    <div className="flex h-6 w-6 sm:h-7 sm:s-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white text-[10px] sm:text-xs mb-1 shadow-xs">
                      ✨
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    data-testid={msg.sender === 'user' ? 'user-message' : 'assistant-message'}
                    className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm leading-relaxed shadow-xs ${
                      msg.sender === 'user'
                        ? 'bg-primary text-white rounded-br-xs'
                        : 'bg-surface border border-border text-text-primary rounded-bl-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                    {/* Interactive Confirmation Box for Destructive Actions */}
                    {msg.confirmationRequired && msg.confirmationId && (
                      <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5">
                        <div className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>Konfirmasi Diperlukan</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            data-testid="confirm-action-btn"
                            disabled={isLoading}
                            onClick={() =>
                              handleConfirmAction(
                                msg.confirmationId,
                                true,
                                msg.action,
                                msg.target
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
                          >
                            <span>Ya, Hapus Supplier</span>
                          </button>
                          <button
                            type="button"
                            data-testid="cancel-action-btn"
                            disabled={isLoading}
                            onClick={() =>
                              handleConfirmAction(
                                msg.confirmationId,
                                false,
                                msg.action,
                                msg.target
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-text-secondary text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <span>Batal</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mock response disclaimer notice */}
                    {msg.disclaimer && (
                      <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-text-muted italic">
                        {msg.disclaimer}
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-text-muted mt-1 px-1">
                  {msg.timestamp}
                </span>
              </motion.div>
            ))}

            {/* Empty State / Suggested Prompts Box shown prominently when only initial greeting is present */}
            {messages.length === 1 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 rounded-xl border border-dashed border-border bg-surface/60 p-3 sm:p-5 space-y-3"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <span>💡</span>
                  <span>Contoh pertanyaan:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CORE_SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      data-testid={`suggested-prompt-${prompt.id}`}
                      onClick={() => handleSendMessage(prompt.query)}
                      className="group flex items-center justify-between p-2.5 sm:p-3 rounded-lg border border-border bg-surface hover:border-primary/50 hover:bg-surface-hover text-left transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <span className="text-sm shrink-0">{prompt.icon}</span>
                        <span className="text-xs font-medium text-text-primary group-hover:text-primary transition-colors truncate">
                          [{prompt.label}]
                        </span>
                      </div>
                      <span className="text-text-muted text-xs shrink-0 group-hover:translate-x-0.5 transition-transform">
                        ➔
                      </span>
                    </button>
                  ))}
                </div>

                {/* Additional quick sample chips */}
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {EXTENDED_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(item)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-surface-hover transition-colors"
                    >
                      <span>•</span>
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Thinking / Loading Animation */}
            {isLoading && (
              <motion.div
                data-testid="loading-indicator"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-text-muted text-xs pl-1"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-white text-[10px]">
                  ✨
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-xs border border-border bg-surface px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-1 text-[11px] text-text-muted">Menganalisis...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── 3. SUGGESTED PROMPTS SCROLL ROW (Always visible above input) ── */}
          <div
            data-testid="suggested-prompts-bar"
            className="border-t border-border bg-surface px-2.5 py-2 sm:px-4 overflow-x-auto no-scrollbar flex items-center gap-2 shrink-0"
          >
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider shrink-0">
              Saran:
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {CORE_SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={`bar-${prompt.id}`}
                  type="button"
                  onClick={() => handleSendMessage(prompt.query)}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover/60 px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-surface-hover disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <span className="text-[10px]">{prompt.icon}</span>
                  <span>{prompt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── 4. CHAT INPUT BAR ── */}
          <div className="border-t border-border bg-surface p-2.5 sm:p-3 pb-[max(0.65rem,env(safe-area-inset-bottom,0.65rem))] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              className="flex items-center gap-2 max-w-full"
            >
              <div className="relative flex-1 min-w-0">
                <input
                  ref={inputRef}
                  type="text"
                  data-testid="chat-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tanya tentang bisnis kamu..."
                  disabled={isLoading}
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-3.5 pr-8 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors disabled:opacity-60"
                />
                {inputValue && (
                  <button
                    type="button"
                    onClick={() => setInputValue('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
                    title="Hapus"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="submit"
                data-testid="chat-submit-button"
                disabled={!inputValue.trim() || isLoading}
                aria-label="Kirim"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none transition-colors text-base"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── AI SHORTCUT OFFER — Non-blocking floating toast (Pro only, first-use) ── */}
      <AnimatePresence>
        {showShortcutOffer && (
          <motion.div
            data-testid="ai-shortcut-offer"
            key="shortcut-offer"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm pointer-events-auto"
          >
            <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-surface shadow-lg shadow-primary/10 px-4 py-3.5">
              {/* Icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-lg mt-0.5">
                ✨
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary leading-snug">
                  Tambahkan AI ke layar utama?
                </p>
                <p className="text-xs text-text-muted mt-0.5 leading-snug">
                  Tambahkan AI Business Analyst ke akses cepat layar utama BisnisSehat.
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    data-testid="shortcut-offer-add"
                    onClick={handleShortcutAdd}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-primary-hover transition-colors"
                  >
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Tambahkan
                  </button>
                  <button
                    type="button"
                    data-testid="shortcut-offer-dismiss"
                    onClick={handleShortcutDismiss}
                    className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    Nanti saja
                  </button>
                </div>
              </div>

              {/* Close ✕ */}
              <button
                type="button"
                aria-label="Tutup tawaran"
                onClick={handleShortcutDismiss}
                className="shrink-0 text-text-muted hover:text-text-primary transition-colors text-sm mt-0.5"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
