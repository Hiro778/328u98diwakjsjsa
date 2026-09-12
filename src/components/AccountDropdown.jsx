import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getPlanDisplay } from '../data/categories'

export default function AccountDropdown() {
  const { user, profile, subscription, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const initials = (profile?.full_name || profile?.email || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const planLabel = getPlanDisplay(subscription?.plan).label

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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-600 transition-colors hover:bg-navy-700"
      >
        <span className="text-xs font-bold text-white">{initials}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-surface shadow-lg"
          >
            {/* Profile header */}
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-navy-700">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-text-muted">{planLabel}</p>
            </div>

            <div className="border-t border-border" />

            {/* Menu items */}
            <div className="py-1">
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-cream hover:text-navy-700"
              >
                Dashboard
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-cream hover:text-navy-700"
              >
                Profil Bisnis
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-cream hover:text-navy-700"
              >
                Langganan
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-cream hover:text-navy-700"
              >
                Pengaturan
              </button>
            </div>

            <div className="border-t border-border" />

            {/* Sign out */}
            <div className="py-1">
              <button
                onClick={() => { signOut(); setOpen(false) }}
                className="w-full px-4 py-2.5 text-left text-sm text-text-muted transition-colors hover:bg-cream hover:text-navy-700"
              >
                Keluar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
