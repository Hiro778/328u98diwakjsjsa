import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getPlanDisplay } from '../data/categories'

export default function AccountDropdown() {
  const { profile, subscription, signOut, isLoggingOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const ref = useRef(null)

  const initials = (profile?.full_name || profile?.email || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const planLabel = getPlanDisplay(subscription?.plan).displayName

  useEffect(() => {
    setAvatarError(false)
  }, [profile?.avatar_url])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Menu akun"
        className="flex items-center gap-2 rounded-xl p-1 hover:bg-surface-hover transition-colors"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold text-xs shadow-xs ring-2 ring-primary/20 overflow-hidden shrink-0">
          {profile?.avatar_url && !avatarError ? (
            <img
              src={profile.avatar_url}
              alt={profile?.full_name || 'Avatar'}
              className="h-full w-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            initials
          )}
        </div>
        <div className="hidden md:block text-left pr-1">
          <p className="text-xs font-bold text-text-primary leading-none truncate max-w-[120px]">
            {profile?.full_name || 'Pengguna'}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5 leading-none">
            {planLabel}
          </p>
        </div>
        <svg
          className={`h-4 w-4 text-text-muted transition-transform hidden sm:block ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-surface-elevated shadow-xl z-50 overflow-hidden"
          >
            {/* Profile header */}
            <div className="px-4 py-3.5 bg-surface border-b border-border flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white font-bold text-xs shadow-xs ring-2 ring-primary/20 overflow-hidden shrink-0">
                {profile?.avatar_url && !avatarError ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile?.full_name || 'Avatar'}
                    className="h-full w-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary truncate">{profile?.full_name || 'Pengguna'}</p>
                <p className="text-xs text-text-muted truncate mt-0.5">{profile?.email}</p>
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {planLabel}
                </span>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1.5 space-y-0.5">
              <Link
                to="/dashboard/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profil Saya
              </Link>
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                </svg>
                Dashboard
              </Link>
              <Link
                to="/pricing"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                Paket Langganan
              </Link>
            </div>

            <div className="border-t border-border" />

            {/* Sign out */}
            <div className="p-1.5">
              <button
                disabled={isLoggingOut}
                onClick={async () => {
                  try {
                    await signOut()
                  } finally {
                    setOpen(false)
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 transition-colors text-left"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {isLoggingOut ? 'Sedang keluar...' : 'Keluar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
