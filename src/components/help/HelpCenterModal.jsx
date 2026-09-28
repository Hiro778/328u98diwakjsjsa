// src/components/help/HelpCenterModal.jsx
// Help Center Modal featuring instant client-side search, category filtering,
// accordion Q&As, Terms of Use (Rules), and direct Email Bug Report CTA.
// Conforms strictly to bug.md design requirements and dark theme design tokens.

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HELP_CATEGORIES,
  GENERAL_GUIDES,
  TOOL_FAQS,
  USAGE_RULES,
} from '../../data/helpCenterData'
import { SUPPORT_CONFIG } from '../../config/supportConfig'
import BugReportModal from './BugReportModal'

export default function HelpCenterModal({ isOpen, onClose, initialQuery = '' }) {
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [activeTab, setActiveTab] = useState('faq') // 'faq' | 'rules' | 'bug'
  const [isNativeBugOpen, setIsNativeBugOpen] = useState(false)

  // Sync initial query when opened
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) setSearchQuery(initialQuery)
    }
  }, [isOpen, initialQuery])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Aggregate items into unified searchable FAQ structure
  const allFaqItems = useMemo(() => {
    const items = []

    // 1. General Guides
    GENERAL_GUIDES.forEach((guide) => {
      items.push({
        id: guide.id,
        type: 'guide',
        category: guide.category,
        title: guide.title,
        summary: guide.summary,
        content: guide.content,
        keywords: guide.keywords || [],
      })
    })

    // 2. Tool FAQs
    TOOL_FAQS.forEach((tool, idx) => {
      items.push({
        id: `tool-${idx}-${tool.toolName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        type: 'tool',
        toolName: tool.toolName,
        category: tool.category,
        route: tool.route,
        entitlement: tool.entitlement,
        title: `${tool.toolName} — Panduan & Fungsi`,
        summary: tool.apaItu,
        apaItu: tool.apaItu,
        kapanDigunakan: tool.kapanDigunakan,
        caraPakai: tool.caraPakai,
        artiHasil: tool.artiHasil,
        catatan: tool.catatan,
        keywords: tool.keywords || [],
      })
    })

    return items
  }, [])

  // Filter based on active category & search query
  const filteredFaqItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return allFaqItems.filter((item) => {
      // Category check
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }

      // Query check
      if (!q) return true

      const matchTitle = item.title?.toLowerCase().includes(q)
      const matchSummary = item.summary?.toLowerCase().includes(q)
      const matchCategory = item.category?.toLowerCase().includes(q)
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q))
      const matchToolName = item.toolName?.toLowerCase().includes(q)

      return matchTitle || matchSummary || matchCategory || matchKeywords || matchToolName
    })
  }, [allFaqItems, selectedCategory, searchQuery])

  const toggleAccordion = (id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Pusat Bantuan & FAQ BisnisSehat"
      data-testid="help-center-modal"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        data-testid="help-modal-backdrop"
      />

      {/* Modal Dialog Window */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-[#0F172A] text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border/80 bg-surface/80 px-5 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Pusat Bantuan & FAQ
              </h2>
              <p className="text-xs text-text-muted">
                Katalog bantuan instrumen operasional, akun, dan panduan penggunaan BisnisSehat.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-white transition-colors"
              aria-label="Tutup pusat bantuan"
              data-testid="help-close-button"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex items-center border-b border-border/60 bg-surface-hover/30 px-5 sm:px-6 gap-2 pt-2 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              activeTab === 'faq'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
            data-testid="tab-faq"
          >
            FAQ & Panduan Tools
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              activeTab === 'rules'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
            data-testid="tab-rules"
          >
            Ketentuan Penggunaan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bug')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              activeTab === 'bug'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-white'
            }`}
            data-testid="tab-bug"
          >
            Laporkan Bug via Email
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* TAB 1: FAQ & PANDUAN TOOLS */}
          {activeTab === 'faq' && (
            <div className="space-y-5">
              {/* Search Bar */}
              <div className="relative">
                <svg
                  className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Cari pertanyaan, fitur, HPP, kasir, atau nama tool..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-border bg-[#1E293B] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-white placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
                  data-testid="help-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-sm font-bold text-text-muted hover:text-white"
                    aria-label="Bersihkan pencarian"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Category Pills Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                {HELP_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-[#1E293B] text-text-secondary hover:bg-surface-hover hover:text-white border border-border/50'
                      }`}
                      data-testid={`category-pill-${cat.id}`}
                    >
                      {cat.label}
                    </button>
                  )
                })}
              </div>

              {/* Items Counter */}
              <div className="flex items-center justify-between text-xs text-text-muted pt-1">
                <span>
                  Menampilkan <strong className="text-white">{filteredFaqItems.length}</strong> topik bantuan
                  {selectedCategory !== 'all' ? ` pada kategori terpilih` : ''}
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-primary hover:underline"
                  >
                    Reset pencarian
                  </button>
                )}
              </div>

              {/* Accordion FAQ Items List */}
              {filteredFaqItems.length === 0 ? (
                <div className="py-12 text-center rounded-xl border border-border/40 bg-surface/30">
                  <p className="text-sm font-medium text-text-muted">
                    Tidak menemukan jawaban untuk &quot;{searchQuery}&quot;
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Coba gunakan kata kunci lain atau kirimkan pertanyaan melalui laporan email.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bug')}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    Hubungi Email Support &rarr;
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5" data-testid="faq-accordion-list">
                  {filteredFaqItems.map((item) => {
                    const isExpanded = expandedId === item.id

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border/70 bg-[#1E293B]/70 hover:border-border transition-colors overflow-hidden"
                        data-testid={`faq-item-${item.id}`}
                      >
                        {/* Accordion Header */}
                        <button
                          type="button"
                          onClick={() => toggleAccordion(item.id)}
                          className="w-full flex items-center justify-between p-4 text-left gap-3 focus:outline-none"
                          aria-expanded={isExpanded}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {item.entitlement && (
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  item.entitlement.includes('FREE')
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {item.entitlement}
                              </span>
                            )}
                            <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                              {item.title}
                            </h3>
                          </div>

                          <svg
                            className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-primary' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Accordion Content Body */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-border/50 bg-[#0F172A]/50 px-4 py-3.5 text-xs text-slate-300 space-y-3"
                            >
                              {item.type === 'guide' ? (
                                <div className="space-y-2 whitespace-pre-line leading-relaxed">
                                  {item.content}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div>
                                    <h4 className="font-bold text-white text-[11px] uppercase tracking-wider text-primary">
                                      Apa fungsi tool ini?
                                    </h4>
                                    <p className="mt-0.5 leading-relaxed">{item.apaItu}</p>
                                  </div>

                                  <div>
                                    <h4 className="font-bold text-white text-[11px] uppercase tracking-wider text-amber-400">
                                      Kapan digunakan?
                                    </h4>
                                    <p className="mt-0.5 leading-relaxed">{item.kapanDigunakan}</p>
                                  </div>

                                  <div>
                                    <h4 className="font-bold text-white text-[11px] uppercase tracking-wider text-emerald-400">
                                      Bagaimana cara menggunakannya?
                                    </h4>
                                    <ol className="mt-1 list-decimal list-inside space-y-1 leading-relaxed pl-1">
                                      {item.caraPakai?.map((step, sIdx) => (
                                        <li key={sIdx}>{step}</li>
                                      ))}
                                    </ol>
                                  </div>

                                  <div>
                                    <h4 className="font-bold text-white text-[11px] uppercase tracking-wider text-indigo-400">
                                      Apa arti hasilnya?
                                    </h4>
                                    <p className="mt-0.5 leading-relaxed">{item.artiHasil}</p>
                                  </div>

                                  {item.catatan && (
                                    <div className="rounded-lg bg-surface/50 border border-border/40 p-2.5 text-[11px] text-text-muted">
                                      <strong>Catatan:</strong> {item.catatan}
                                    </div>
                                  )}

                                  {item.route && (
                                    <div className="pt-1 flex items-center justify-between">
                                      <span className="text-[11px] text-text-muted font-mono">
                                        Route: {item.route}
                                      </span>
                                      <a
                                        href={item.route}
                                        onClick={onClose}
                                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                      >
                                        Buka Tool Ini &rarr;
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RULES / KETENTUAN PENGGUNAAN */}
          {activeTab === 'rules' && (
            <div className="space-y-4" data-testid="rules-section">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <h3 className="text-sm font-bold text-white">
                  Ketentuan Penggunaan Platform BisnisSehat
                </h3>
                <p className="mt-1 text-xs text-text-muted leading-relaxed">
                  Harap baca ketentuan berikut dengan seksama. Dengan menggunakan aplikasi BisnisSehat,
                  Anda menyetujui prinsip-prinsip operasional, akurasi data bisnis, dan ketentuan keamanan di bawah ini.
                </p>
              </div>

              <div className="space-y-3">
                {USAGE_RULES.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-border/60 bg-[#1E293B]/70 p-4 space-y-2"
                  >
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      {rule.title}
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-300 leading-relaxed pl-1">
                      {rule.content.map((point, pIdx) => (
                        <li key={pIdx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: LAPOR BUG VIA EMAIL */}
          {activeTab === 'bug' && (
            <div className="space-y-5" data-testid="bug-report-section">
              <div className="rounded-xl border border-border/70 bg-[#1E293B]/80 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Laporkan Masalah atau Bug Sistem</h3>
                    <p className="text-xs text-text-muted">
                      Email resmi dukungan pengembang: <strong className="text-white">{SUPPORT_CONFIG.email.address}</strong>
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Menemukan kendala perhitungan, transaksi kasir, anomali tampilan, atau galat sistem?
                  Klik tombol di bawah untuk langsung membuka email client dengan format laporan terstruktur.
                </p>

                {/* Bug Action CTAs: Native Form + Email */}
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsNativeBugOpen(true)}
                    data-testid="native-bug-report-modal-cta"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg hover:bg-primary-hover transition-colors cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Isi Form Lapor Bug</span>
                  </button>

                  <a
                    href={SUPPORT_CONFIG.email.getBugReportUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="email-support-cta"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-hover/30 px-4 py-2.5 text-xs sm:text-sm font-semibold text-text-secondary hover:text-white hover:bg-surface-hover transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Email Support</span>
                  </a>
                </div>
              </div>

              {/* Template Preview */}
              <div className="rounded-xl border border-border/50 bg-[#0F172A] p-4 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                  Format Template Email Resmi:
                </span>
                <pre className="text-[11px] font-mono text-slate-300 bg-surface/50 p-3 rounded-lg border border-border/40 overflow-x-auto whitespace-pre leading-relaxed">
{`Subject: [BisnisSehat Bug Report]

Halo Tim BisnisSehat,

Saya ingin melaporkan bug.

Fitur:
[isi fitur]

Masalah:
[jelaskan masalah]

Langkah reproduksi:
1. 
2. 
3. 

Hasil yang diharapkan:
...

Hasil yang terjadi:
...

Browser/device:
(Otomatis terisi informasi perangkat Anda)

Terima kasih.`}
                </pre>
                <p className="text-[10px] text-text-muted">
                  * Demi keamanan, jangan pernah mencantumkan password atau informasi kredensial akun dalam laporan email.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border/80 bg-surface/60 px-5 sm:px-6 py-3 text-xs text-text-muted">
          <span>BisnisSehat Help Center • Solusi Mandiri UMKM</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 font-medium text-text-secondary hover:bg-surface-hover hover:text-white transition-colors"
          >
            Tutup
          </button>
        </div>
      </motion.div>

      {/* ── Native Bug Report Modal ── */}
      <BugReportModal
        isOpen={isNativeBugOpen}
        onClose={() => setIsNativeBugOpen(false)}
      />
    </div>
  )
}
