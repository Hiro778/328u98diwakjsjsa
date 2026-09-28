// src/components/ThemePicker.jsx
// Lightweight popover dropdown for theme selection: [ Sistem, Terang, Gelap ]

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'

const THEME_OPTIONS = [
  {
    id: 'system',
    label: 'Sistem',
    description: 'Mengikuti tema perangkat',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
    ),
  },
  {
    id: 'light',
    label: 'Terang',
    description: 'Tampilan terang klasik',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Gelap',
    description: 'Tampilan gelap nyaman di mata',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>
    ),
  },
]

export default function ThemePicker() {
  const { themeMode, setThemeMode } = useTheme()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const activeOption = THEME_OPTIONS.find((opt) => opt.id === themeMode) || THEME_OPTIONS[0]

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Popover Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl border border-border bg-surface-elevated p-2 shadow-xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-border mb-1">
              <p className="text-xs font-bold text-text-primary">Tema Tampilan</p>
              <p className="text-[11px] text-text-muted">Pilih mode tampilan dashboard</p>
            </div>

            <div className="space-y-1">
              {THEME_OPTIONS.map((opt) => {
                const isSelected = themeMode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setThemeMode(opt.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-primary-soft text-primary font-bold'
                        : 'text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={isSelected ? 'text-primary' : 'text-text-muted'}>
                        {opt.icon}
                      </span>
                      <span>{opt.label}</span>
                    </div>

                    {isSelected ? (
                      <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span className="h-2 w-2 rounded-full border border-border" />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger Button: Tampilan */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-text-muted">
            {activeOption.icon}
          </span>
          <span className="font-semibold">Tampilan</span>
        </div>

        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold text-text-muted capitalize">
          {activeOption.label}
        </span>
      </button>
    </div>
  )
}
