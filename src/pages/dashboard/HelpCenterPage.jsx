// src/pages/dashboard/HelpCenterPage.jsx
// Full page Help Center for BisnisSehat (/dashboard/bantuan)
// Featuring instant search, category filters, tool FAQs, rules, and email bug report CTA.

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BackButton from '../../components/BackButton'
import {
  HELP_CATEGORIES,
  GENERAL_GUIDES,
  TOOL_FAQS,
  USAGE_RULES,
} from '../../data/helpCenterData'
import { SUPPORT_CONFIG } from '../../config/supportConfig'
import BugReportModal from '../../components/help/BugReportModal'

export default function HelpCenterPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [activeTab, setActiveTab] = useState('faq') // 'faq' | 'rules' | 'bug'
  const [isBugModalOpen, setIsBugModalOpen] = useState(false)

  // Aggregate items into unified searchable FAQ structure
  const allFaqItems = useMemo(() => {
    const items = []

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

  const filteredFaqItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return allFaqItems.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="help-center-page">
      <BackButton fallbackUrl="/dashboard" label="Kembali ke Dashboard" />

      {/* Header */}
      <div className="border-b border-border pb-6 space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Pusat Bantuan & FAQ BisnisSehat
            </h1>
            <p className="text-xs sm:text-sm text-text-muted">
              Panduan lengkap 30+ tools operasional, kasir POS, QR Menu, ketentuan layanan, dan solusi kendala.
            </p>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex items-center border-b border-border/80 gap-2 text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => setActiveTab('faq')}
          className={`pb-3 px-3 sm:px-4 font-semibold border-b-2 transition-all ${
            activeTab === 'faq'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-white'
          }`}
          data-testid="page-tab-faq"
        >
          Katalog Bantuan & FAQ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`pb-3 px-3 sm:px-4 font-semibold border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-white'
          }`}
          data-testid="page-tab-rules"
        >
          Ketentuan Penggunaan (Rules)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bug')}
          className={`pb-3 px-3 sm:px-4 font-semibold border-b-2 transition-all ${
            activeTab === 'bug'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-white'
          }`}
          data-testid="page-tab-bug"
        >
          Laporkan Bug via Email
        </button>
      </div>

      {/* TAB 1: FAQ */}
      {activeTab === 'faq' && (
        <div className="space-y-5">
          {/* Search Box */}
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
              placeholder="Cari dari seluruh panduan tools (misal: HPP, BEP, Kasir POS, QR Menu, stok, langganan)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-[#151D2C] py-3 pl-10 pr-9 text-xs sm:text-sm text-white placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
              data-testid="page-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-3.5 -translate-y-1/2 text-sm font-bold text-text-muted hover:text-white"
              >
                &times;
              </button>
            )}
          </div>

          {/* Categories Pill Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none text-xs">
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
                      : 'bg-[#151D2C] text-text-secondary hover:bg-surface-hover hover:text-white border border-border/50'
                  }`}
                  data-testid={`page-cat-${cat.id}`}
                >
                  {cat.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              Menampilkan <strong className="text-white">{filteredFaqItems.length}</strong> topik bantuan
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

          {/* Accordion FAQ list */}
          {filteredFaqItems.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-border/40 bg-surface/30">
              <p className="text-sm font-medium text-text-muted">
                Tidak ada topik bantuan yang cocok dengan &quot;{searchQuery}&quot;
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('bug')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Kirim Laporan via Email Support &rarr;
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFaqItems.map((item) => {
                const isExpanded = expandedId === item.id

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border/80 bg-[#151D2C] hover:border-border transition-colors overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleAccordion(item.id)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left gap-3 focus:outline-none"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {item.entitlement && (
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                              item.entitlement.includes('FREE')
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {item.entitlement}
                          </span>
                        )}
                        <h3 className="text-sm sm:text-base font-semibold text-white">
                          {item.title}
                        </h3>
                      </div>
                      <svg
                        className={`h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 ${
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

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-border/60 bg-[#0B0F19]/50 px-4 sm:px-5 py-4 text-xs sm:text-sm text-slate-300 space-y-4"
                        >
                          {item.type === 'guide' ? (
                            <div className="space-y-2.5 whitespace-pre-line leading-relaxed">
                              {item.content}
                            </div>
                          ) : (
                            <div className="space-y-3.5">
                              <div>
                                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-primary">
                                  Apa fungsi tool ini?
                                </h4>
                                <p className="mt-1 leading-relaxed">{item.apaItu}</p>
                              </div>

                              <div>
                                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-amber-400">
                                  Kapan digunakan?
                                </h4>
                                <p className="mt-1 leading-relaxed">{item.kapanDigunakan}</p>
                              </div>

                              <div>
                                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-emerald-400">
                                  Bagaimana cara menggunakannya?
                                </h4>
                                <ol className="mt-1.5 list-decimal list-inside space-y-1.5 leading-relaxed pl-1">
                                  {item.caraPakai?.map((step, sIdx) => (
                                    <li key={sIdx}>{step}</li>
                                  ))}
                                </ol>
                              </div>

                              <div>
                                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-indigo-400">
                                  Apa arti hasilnya?
                                </h4>
                                <p className="mt-1 leading-relaxed">{item.artiHasil}</p>
                              </div>

                              {item.catatan && (
                                <div className="rounded-xl bg-surface/60 border border-border/50 p-3 text-xs text-text-muted">
                                  <strong>Catatan:</strong> {item.catatan}
                                </div>
                              )}

                              {item.route && (
                                <div className="pt-2 flex items-center justify-between border-t border-border/40">
                                  <span className="text-xs text-text-muted font-mono">
                                    Route: {item.route}
                                  </span>
                                  <a
                                    href={item.route}
                                    className="text-xs sm:text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                                  >
                                    Buka Halaman Tool &rarr;
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

      {/* TAB 2: RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h2 className="text-base font-bold text-white">
              Ketentuan Penggunaan Platform BisnisSehat
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-text-muted leading-relaxed">
              Prinsip operasional, tanggung jawab integritas data bisnis, serta ketentuan keamanan sistem BisnisSehat.
            </p>
          </div>

          <div className="space-y-3">
            {USAGE_RULES.map((rule) => (
              <div
                key={rule.id}
                className="rounded-xl border border-border/70 bg-[#151D2C] p-5 space-y-2.5"
              >
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {rule.title}
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed pl-1">
                  {rule.content.map((point, pIdx) => (
                    <li key={pIdx}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: BUG REPORT */}
      {activeTab === 'bug' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/80 bg-[#151D2C] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Lapor Bug atau Gangguan Sistem</h2>
                <p className="text-xs sm:text-sm text-text-muted">
                  Email resmi pengembang: <strong className="text-white">{SUPPORT_CONFIG.email.address}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Jika Anda menemukan kendala saat mencetak struk, kesalahan hitung kalkulator keuangan,
              atau error saat checkout kasir POS / QR Menu, silakan laporkan langsung melalui email resmi pengembang kami.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsBugModalOpen(true)}
                data-testid="page-native-bug-cta"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg hover:bg-primary-hover transition-colors cursor-pointer"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-hover/30 px-6 py-3 text-xs sm:text-sm font-semibold text-text-secondary hover:text-white hover:bg-surface-hover transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span>Buka Email Support</span>
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-[#0F172A] p-5 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Format Subject & Isi Email Laporan Bug:
            </span>
            <pre className="text-xs font-mono text-slate-300 bg-surface/50 p-4 rounded-xl border border-border/40 overflow-x-auto whitespace-pre leading-relaxed">
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
(Otomatis terisi data perangkat browser Anda)

Terima kasih.`}
            </pre>
            <p className="text-xs text-text-muted">
              * Harap tidak mencantumkan password atau kunci otentikasi akun pada laporan email.
            </p>
          </div>
        </div>
      )}

      {/* Native Bug Report Modal */}
      <BugReportModal
        isOpen={isBugModalOpen}
        onClose={() => setIsBugModalOpen(false)}
      />
    </div>
  )
}
