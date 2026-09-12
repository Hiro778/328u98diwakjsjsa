import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { label: 'Dashboard', href: '#dashboard' },
  { label: 'Fitur', href: '#features' },
  { label: 'Kurs', href: '#export' },
  { label: 'Harga', href: '#pricing' },
]

export default function Navbar() {
  const { user, profile, isAuthenticated, signOut } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { scrollY } = useScroll()
  const bgOpacity = useTransform(scrollY, [0, 80], [0, 0.92])
  const blur = useTransform(scrollY, [0, 80], [0, 16])
  const height = useTransform(scrollY, [0, 80], [72, 56])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const initials = (profile?.full_name || profile?.email || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <motion.nav
      style={{ height }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* Background */}
      <motion.div
        className="absolute inset-0 border-b border-navy-100/50"
        style={{
          opacity: bgOpacity,
          backgroundColor: 'rgba(251,248,241,0.95)',
          backdropFilter: blur,
        }}
      />

      <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center justify-between px-5 sm:px-8">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-600">
            <span className="text-sm font-extrabold text-white">BS</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-navy-700">
            BisnisSehat
          </span>
        </a>

        {/* Center links — desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative rounded-lg px-4 py-2 text-sm font-medium text-navy-500 transition-colors hover:text-navy-700"
            >
              {link.label}
              <span className="absolute inset-x-4 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-warm-400 transition-transform duration-200 group-hover:scale-x-100" />
            </a>
          ))}
        </div>

        {/* Right actions — desktop */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-lg px-4 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50"
              >
                Dashboard
              </Link>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-600">
                  <span className="text-xs font-bold text-white">{initials}</span>
                </div>
                <button
                  onClick={signOut}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
                >
                  Keluar
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="rounded-lg px-4 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50"
              >
                Masuk
              </Link>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/auth"
                  className="block rounded-lg bg-warm-400 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-warm-500 hover:shadow-md hover:shadow-warm-400/25"
                >
                  Mulai Sekarang
                </Link>
              </motion.div>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg md:hidden"
          aria-label="Toggle menu"
        >
          <div className="flex flex-col gap-1.5">
            <span
              className={`h-0.5 w-5 bg-navy-600 transition-transform duration-200 ${
                mobileOpen ? 'translate-y-1 rotate-45' : ''
              }`}
            />
            <span
              className={`h-0.5 w-5 bg-navy-600 transition-opacity duration-200 ${
                mobileOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`h-0.5 w-5 bg-navy-600 transition-transform duration-200 ${
                mobileOpen ? '-translate-y-1.5 -rotate-45' : ''
              }`}
            />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute inset-x-0 top-full border-b border-navy-100/50 bg-cream/95 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto max-w-7xl px-5 py-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-4 py-3 text-base font-medium text-navy-600 transition-colors hover:bg-navy-50"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex gap-3 border-t border-navy-100 pt-4">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-navy-600"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => { signOut(); setMobileOpen(false) }}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-muted"
                  >
                    Keluar
                  </button>
                </>
              ) : (
                <>
                  <Link to="/auth" onClick={() => setMobileOpen(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-navy-600">
                    Masuk
                  </Link>
                  <Link to="/auth" onClick={() => setMobileOpen(false)} className="rounded-lg bg-warm-400 px-5 py-2.5 text-sm font-semibold text-white">
                    Mulai Sekarang
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.nav>
  )
}
