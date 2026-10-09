import { useState, Suspense, useEffect } from 'react'
import { Outlet, Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import SidebarNav from './SidebarNav'
import AccountDropdown from './AccountDropdown'
import SubscriptionCard from './SubscriptionCard'
import ThemePicker from './ThemePicker'
import NotificationDropdown from './NotificationDropdown'
import CustomerSupportWidget from './CustomerSupportWidget'
import BannedAccountScreen from './BannedAccountScreen'

function DashboardContentFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </div>
  )
}

export default function DashboardLayout() {
  const { business, isAccessDenied, banReason, signOut } = useAuth()
  const { platformName, isAnnouncementEnabled, announcementText } = usePlatformSettings()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Accessible dismiss: Close mobile drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    if (sidebarOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  // Defense-in-depth: Immediately lockout dashboard if account access is denied
  if (isAccessDenied) {
    return <BannedAccountScreen banReason={banReason} onSignOut={signOut} />
  }

  const brandHeader = (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5 bg-surface">
      <Link to="/" className="flex items-center gap-2.5 group">
        <img src="/brand-logo.png" alt={platformName} className="h-9 w-9 object-contain shrink-0 group-hover:scale-102 transition-transform" />
        <div>
          <span className="block text-sm font-bold text-text-primary leading-none">{platformName}</span>
          <span className="block text-[10px] font-medium text-text-muted mt-1 leading-none">OS UMKM Modern</span>
        </div>
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        {brandHeader}

        <SidebarNav />

        <div className="mt-auto">
          <SubscriptionCard />
          <div className="border-t border-border px-3 py-2.5 bg-surface">
            <ThemePicker />
          </div>
        </div>
      </aside>

      {/* Mobile sidebar drawer overlay (Hardware-accelerated CSS transition) */}
      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!sidebarOpen}
      />
      <aside
        id="mobile-sidebar-drawer"
        role="dialog"
        aria-modal={sidebarOpen ? 'true' : 'false'}
        aria-label="Navigasi Menu Mobile"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100vw-48px)] flex-col border-r border-border bg-surface shadow-2xl lg:hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-200 ease-out will-change-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/brand-logo.png" alt="BisnisSehat" className="h-9 w-9 object-contain shrink-0" />
            <div>
              <span className="block text-sm font-bold text-text-primary leading-none">BisnisSehat</span>
              <span className="block text-[10px] font-medium text-text-muted mt-1 leading-none">OS UMKM Modern</span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            aria-label="Tutup sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <SidebarNav onNavigate={() => setSidebarOpen(false)} />

        <div className="mt-auto">
          <SubscriptionCard />
          <div className="border-t border-border px-3 py-2.5 bg-surface">
            <ThemePicker />
          </div>
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/90 backdrop-blur-md px-3 sm:px-4 lg:px-6 transition-colors pt-[env(safe-area-inset-top,0px)]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              aria-expanded={sidebarOpen}
              aria-controls="mobile-sidebar-drawer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary lg:hidden transition-colors"
              aria-label="Buka navigasi"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Business / Workspace context */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Workspace
              </span>
              <span className="hidden sm:inline-block text-text-muted/40">/</span>
              <span className="text-xs sm:text-sm font-semibold text-text-primary truncate max-w-[95px] min-[360px]:max-w-[125px] min-[390px]:max-w-[170px] sm:max-w-[320px]">
                {business?.name || 'Bisnis Anda'}
              </span>
            </div>
          </div>

          {/* Right actions: Notifications + Account */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <NotificationDropdown />
            <div className="h-5 w-px bg-border hidden sm:block" />
            <AccountDropdown />
          </div>
        </header>

        {/* Global Announcement Banner (@ban.md) */}
        {isAnnouncementEnabled && (
          <div
            data-testid="global-announcement-banner"
            className="bg-primary/10 border-b border-primary/20 px-3 sm:px-4 py-2 text-center text-xs font-medium text-primary flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <span className="truncate">{announcementText}</span>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto min-w-0">
          <Suspense fallback={<DashboardContentFallback />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Floating Customer Support Widget (Atlas Cloud Style UX) */}
        <CustomerSupportWidget />
      </div>
    </div>
  )
}
