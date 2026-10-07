import { useState, Suspense } from 'react'
import { Outlet, NavLink, Link } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useAdminAuth } from '../../hooks/useAdminAuth.js'
import LoadingScreen from '../LoadingScreen'

const ADMIN_NAV_ITEMS = [
  {
    name: 'Overview',
    path: '/admin',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    name: 'Users',
    path: '/admin/users',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    name: 'Businesses',
    path: '/admin/businesses',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    name: 'Subscriptions',
    path: '/admin/subscriptions',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  {
    name: 'Kode & QR PRO',
    path: '/admin/activation-codes',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    ),
  },
  {
    name: 'Aktivasi Kredit',
    path: '/admin/credit-activations',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
  },
  {
    name: 'AI Usage',
    path: '/admin/ai-usage',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    name: 'Support',
    path: '/admin/support',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    name: 'Payments',
    path: '/admin/payments',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    name: 'Audit Logs',
    path: '/admin/audit-logs',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    name: 'Settings',
    path: '/admin/settings',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    name: 'Footer & Social',
    path: '/admin/footer-social-links',
    enabled: true,
    icon: (
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  // Future stage or experimental module items can be defined with enabled: false to display 'Soon' badge
]

export default function AdminLayout() {
  const { profile, signOut, isLoggingOut } = useAuth()
  const { role, isSuperAdmin } = useAdminAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const adminName = profile?.full_name || profile?.email?.split('@')[0] || 'Admin Operator'
  const adminAvatar = profile?.avatar_url

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] flex flex-col lg:flex-row antialiased">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col shrink-0 bg-[#111827] border-r border-[#1F2937]">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[#1F2937]">
          <Link to="/admin" className="flex items-center gap-3">
            <img src="/brand-logo.png" alt="BisnisSehat" className="w-8 h-8 object-contain shrink-0" />
            <div>
              <span className="block font-bold text-sm tracking-wide text-white">BisnisSehat Admin</span>
              <span className="block text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Control Center</span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {ADMIN_NAV_ITEMS.map((item) => {
            if (item.enabled) {
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#1F2937]/50'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.name}</span>
                  </div>
                </NavLink>
              )
            }

            // Disabled / Coming Soon items
            return (
              <div
                key={item.name}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500/70 cursor-not-allowed select-none"
                title={`${item.name} (Coming Soon)`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.name}</span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1F2937]/80 text-gray-400 border border-[#374151]/50">
                  Soon
                </span>
              </div>
            )
          })}
        </nav>

        {/* Back to User App + Reuse Existing Sign Out */}
        <div className="p-3 border-t border-[#1F2937] space-y-1">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-[#1F2937]/50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Kembali ke App Utama
          </Link>
          <button
            disabled={isLoggingOut}
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors text-left"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {isLoggingOut ? 'Sedang keluar...' : 'Keluar Sesi'}
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Admin Header */}
        <header className="h-16 bg-[#111827]/90 backdrop-blur-md border-b border-[#1F2937] px-3 sm:px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-[#1F2937] text-gray-300 hover:text-white shrink-0"
              aria-label="Toggle Mobile Admin Navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <span className="font-bold text-white text-sm sm:text-base lg:text-lg truncate max-w-[110px] min-[360px]:max-w-[140px] sm:max-w-none">
                BisnisSehat Admin
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                Control Center
              </span>
            </div>
          </div>

          {/* Right Header: Back to main app & Admin Profile & Role Badge */}
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-[#1F2937] hover:bg-[#374151] transition-colors border border-[#374151]"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Kembali ke App Utama
            </Link>

            <div className="flex items-center gap-2.5 pl-2 sm:border-l sm:border-[#1F2937]">
              {adminAvatar ? (
                <img
                  src={adminAvatar}
                  alt={adminName}
                  className="w-8 h-8 rounded-full object-cover border border-[#1F2937]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                  {adminName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold text-white leading-tight">{adminName}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${
                      isSuperAdmin
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {role}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 max-w-[calc(100vw-48px)] bg-[#111827] border-r border-[#1F2937] flex flex-col h-full z-10 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
              <div className="h-16 flex items-center justify-between px-6 border-b border-[#1F2937]">
                <div className="flex items-center gap-3">
                  <img src="/brand-logo.png" alt="BisnisSehat" className="w-8 h-8 object-contain shrink-0" />
                  <span className="font-bold text-sm text-white">BisnisSehat Admin</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {ADMIN_NAV_ITEMS.map((item) => {
                  if (item.enabled) {
                    return (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        end
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1F2937]/50'
                          }`
                        }
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          <span>{item.name}</span>
                        </div>
                      </NavLink>
                    )
                  }

                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500/70 cursor-not-allowed select-none"
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.name}</span>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1F2937]/80 text-gray-400 border border-[#374151]/50">
                        Soon
                      </span>
                    </div>
                  )
                })}
              </nav>

              <div className="p-3 border-t border-[#1F2937] space-y-1">
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-[#1F2937]/50"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Kembali ke App Utama
                </Link>
                <button
                  disabled={isLoggingOut}
                  onClick={async () => {
                    setMobileMenuOpen(false)
                    await signOut()
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-left"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {isLoggingOut ? 'Sedang keluar...' : 'Keluar Sesi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Outlet */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          <Suspense fallback={<LoadingScreen />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
