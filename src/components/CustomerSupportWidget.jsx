// src/components/CustomerSupportWidget.jsx
// Floating Customer Support & Help Center Widget for BisnisSehat
// Conforming to bug.md specification:
// - Removes all WhatsApp CTA and live chat claims
// - Provides direct buttons for "Cari Bantuan", "Pusat Bantuan & FAQ", and "Lapor Bug via Email"
// - Opens HelpCenterModal with search, full tool guides, usage rules, and bug reporting
// - Ergonomic floating circular button (Escape to close, outside click dismissal, accessible dialog)

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import HelpCenterModal from './help/HelpCenterModal'
import BugReportModal from './help/BugReportModal'

export default function CustomerSupportWidget() {
  const { supportPhone, supportHours } = usePlatformSettings()
  const [isOpen, setIsOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false)
  const [isBugReportOpen, setIsBugReportOpen] = useState(false)
  const [initialSearchQuery, setInitialSearchQuery] = useState('')
  const widgetRef = useRef(null)

  // Close panel when pressing Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const toggleOpen = () => {
    setIsOpen((prev) => !prev)
    setShowTooltip(false)
  }

  const handleOpenHelpCenter = (query = '') => {
    setInitialSearchQuery(query)
    setIsHelpCenterOpen(true)
    setIsOpen(false)
  }

  const handleOpenBugReport = () => {
    setIsBugReportOpen(true)
    setIsOpen(false)
  }

  return (
    <>
      <div
        ref={widgetRef}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-35 flex flex-col items-end select-none"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
          right: 'max(1rem, env(safe-area-inset-right, 1rem))',
        }}
        data-testid="customer-support-widget"
      >
        {/* ── Support Panel Popover ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="cs-popover"
              role="dialog"
              aria-label="Customer Support Panel"
              aria-modal="false"
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="mb-3 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl text-text-primary"
              data-testid="customer-support-panel"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border bg-surface-hover/50 px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary leading-tight">Customer Support</h3>
                    <p className="text-[11px] font-medium text-text-muted">Pusat bantuan BisnisSehat</p>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                  aria-label="Tutup panel bantuan"
                  data-testid="cs-close-button"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content Body */}
              <div className="p-4 space-y-3">
                <p className="text-xs text-text-secondary leading-relaxed">
                  Temukan panduan penggunaan tools, akun, subscription, dan troubleshooting.
                </p>

                {/* Action 1: Search Help Center */}
                <button
                  type="button"
                  onClick={() => handleOpenHelpCenter('')}
                  data-testid="cs-search-channel"
                  className="w-full group flex items-center justify-between p-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors">
                        Cari Bantuan
                      </h4>
                      <p className="text-[11px] text-text-muted">Ketik nama tool atau kendala</p>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Action 2: FAQ & Help Center Modal */}
                <button
                  type="button"
                  onClick={() => handleOpenHelpCenter('')}
                  data-testid="cs-faq-channel"
                  className="w-full group flex items-center justify-between p-3 rounded-xl border border-border bg-surface-hover/30 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors">
                        Pusat Bantuan & FAQ
                      </h4>
                      <p className="text-[11px] text-text-muted truncate max-w-[180px]">Panduan 30+ tools & solusi</p>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Action 3: Laporkan Bug (Native Form Modal) */}
                <button
                  type="button"
                  onClick={handleOpenBugReport}
                  data-testid="cs-bug-report-channel"
                  className="w-full group flex items-center justify-between p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-rose-400 transition-colors">
                        Laporkan Bug
                      </h4>
                      <p className="text-[11px] text-text-muted truncate max-w-[180px]">Form lapor kendala & screenshot</p>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-text-muted group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Dynamic Operating Hours & Phone Metadata */}
                {(supportPhone || supportHours) && (
                  <div className="pt-2 px-1 text-[10px] text-text-muted flex flex-col gap-0.5 border-t border-border/50">
                    {supportPhone && <div>Kontak: <span className="font-semibold text-text-secondary">{supportPhone}</span></div>}
                    {supportHours && <div>Jam Layanan: <span className="text-text-secondary">{supportHours}</span></div>}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Floating Main Button ── */}
        <div className="relative">
          {/* Hover Tooltip */}
          <AnimatePresence>
            {showTooltip && !isOpen && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-xs font-semibold rounded-lg shadow-md pointer-events-none whitespace-nowrap hidden sm:block z-40"
                data-testid="cs-tooltip"
              >
                Customer Support
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={toggleOpen}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            aria-label="Customer Support"
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            data-testid="customer-support-button"
            className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl hover:shadow-2xl hover:bg-primary-hover focus:outline-none focus:ring-4 focus:ring-primary/25 transition-all duration-200"
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.svg
                  key="icon-close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </motion.svg>
              ) : (
                <motion.svg
                  key="icon-support"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* ── Help Center Modal Dialog ── */}
      <HelpCenterModal
        isOpen={isHelpCenterOpen}
        onClose={() => setIsHelpCenterOpen(false)}
        initialQuery={initialSearchQuery}
      />

      {/* ── Native Bug Report Modal Dialog ── */}
      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
      />
    </>
  )
}
