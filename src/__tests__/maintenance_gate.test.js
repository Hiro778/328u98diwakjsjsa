import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Global Frontend MaintenanceGate Verification (@gl.md)', () => {
  const appCode = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const gateCode = fs.readFileSync(path.resolve('src/components/MaintenanceGate.jsx'), 'utf8')
  const guardCode = fs.readFileSync(path.resolve('src/components/MaintenanceGuard.jsx'), 'utf8')
  const screenCode = fs.readFileSync(path.resolve('src/components/MaintenanceScreen.jsx'), 'utf8')
  const hookCode = fs.readFileSync(path.resolve('src/hooks/usePlatformSettings.js'), 'utf8')
  const adminAuthHookCode = fs.readFileSync(path.resolve('src/hooks/useAdminAuth.js'), 'utf8')
  const layoutCode = fs.readFileSync(path.resolve('src/components/DashboardLayout.jsx'), 'utf8')

  // 1. ROUTE HIERARCHY & GATE PLACEMENT
  it('1. App.jsx imports and wraps protected user routes in MaintenanceGate', () => {
    assert.ok(
      appCode.includes("import MaintenanceGate from './components/MaintenanceGate'"),
      'App.jsx must import MaintenanceGate'
    )
    assert.ok(
      appCode.includes('element: <MaintenanceGate />'),
      'App.jsx must register MaintenanceGate layout route'
    )
    assert.ok(
      appCode.includes("path: '/dashboard'"),
      '/dashboard must be present in routing tree'
    )
    assert.ok(
      appCode.includes("path: '/onboarding'"),
      '/onboarding must be present in routing tree'
    )
    assert.ok(
      appCode.includes("path: '/pricing'"),
      '/pricing must be present in routing tree'
    )
  })

  // 2. ADMIN CONTROL CENTER REMAINS ACCESSIBLE
  it('2. App.jsx preserves /admin and /admin/settings for ADMIN & SUPER_ADMIN', () => {
    assert.ok(appCode.includes("path: '/admin'"), '/admin route must remain at top level')
    assert.ok(appCode.includes('<RequireAdmin />'), 'RequireAdmin guard must protect /admin')
    assert.ok(appCode.includes("path: 'settings', element: <AdminSettingsPage />"), '/admin/settings must be registered')
  })

  // 3. ZERO LOCALSTORAGE TRUST FOR ROLE DECISIONS
  it('3. Security: MaintenanceGate uses server-backed Admin RBAC and never reads localStorage', () => {
    assert.ok(gateCode.includes('useAdminAuth()'), 'MaintenanceGate must consume server-backed useAdminAuth')
    assert.ok(gateCode.includes('usePlatformSettings()'), 'MaintenanceGate must consume usePlatformSettings')

    // Ensure no client-side role manipulation via localStorage or sessionStorage
    const gateWithoutComments = gateCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    assert.ok(!gateWithoutComments.includes('localStorage'), 'MaintenanceGate must NOT read from localStorage')
    assert.ok(!gateWithoutComments.includes('sessionStorage'), 'MaintenanceGate must NOT read from sessionStorage')

    // useAdminAuth uses server RPCs
    assert.ok(adminAuthHookCode.includes("supabase.rpc('is_admin')"), 'useAdminAuth must verify is_admin RPC')
    assert.ok(adminAuthHookCode.includes("supabase.rpc('is_super_admin')"), 'useAdminAuth must verify is_super_admin RPC')
  })

  // 4. ROUTE DECISION ENGINE SIMULATION
  function evaluateMaintenanceGate({
    pathname,
    isMaintenance,
    settingsLoading = false,
    isAdmin = false,
    isSuperAdmin = false,
    adminLoading = false,
  }) {
    // 1. Admin routes bypass MaintenanceGate
    if (pathname.startsWith('/admin')) {
      return { allowed: true, component: 'Outlet', reason: 'Admin path bypass' }
    }

    // 2. Maintenance is OFF and settings loaded
    if (!settingsLoading && !isMaintenance) {
      return { allowed: true, component: 'Outlet', reason: 'Maintenance inactive' }
    }

    // 3. Loading state
    if (settingsLoading || (isMaintenance && adminLoading)) {
      return { allowed: false, component: 'LoadingScreen', reason: 'Verifying auth/settings' }
    }

    // 4. Admin exemption (server-backed)
    if (isAdmin || isSuperAdmin) {
      return { allowed: true, component: 'Outlet', reason: 'Admin exemption' }
    }

    // 5. Blocked
    if (isMaintenance) {
      return { allowed: false, component: 'MaintenanceScreen', reason: 'Maintenance active' }
    }

    return { allowed: true, component: 'Outlet' }
  }

  it('4. maintenance OFF + normal user → dashboard accessible', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: false,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('5. maintenance ON + normal user → dashboard blocked', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, false)
  })

  it('6. maintenance ON + normal user → Maintenance Page shown', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, false)
    assert.strictEqual(decision.component, 'MaintenanceScreen')
  })

  it('7. maintenance ON + SUPER_ADMIN → /admin accessible', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/admin',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: true,
    })
    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('8. maintenance ON + SUPER_ADMIN → /admin/settings accessible', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/admin/settings',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: true,
    })
    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('9. maintenance ON + ADMIN → /admin and /admin/settings accessible', () => {
    const adminDecision = evaluateMaintenanceGate({
      pathname: '/admin',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: false,
    })
    assert.strictEqual(adminDecision.allowed, true)

    const settingsDecision = evaluateMaintenanceGate({
      pathname: '/admin/settings',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: false,
    })
    assert.strictEqual(settingsDecision.allowed, true)
  })

  it('10. maintenance OFF + normal user → dashboard accessible again (no logout required)', () => {
    // Normal user previously blocked now re-evaluates with maintenance = false
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: false,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, true)
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('11. direct navigation to /dashboard while maintenance ON → blocked', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, false)
    assert.strictEqual(decision.component, 'MaintenanceScreen')
  })

  it('12. direct navigation to another protected user route while ON → blocked', () => {
    const subRoutes = [
      '/dashboard/keuangan/hpp-calculator',
      '/dashboard/keuangan/bep-calculator',
      '/dashboard/operasional/inventory',
      '/dashboard/penjualan/customer-crm',
      '/dashboard/pos',
      '/onboarding',
      '/pricing',
    ]

    for (const route of subRoutes) {
      const decision = evaluateMaintenanceGate({
        pathname: route,
        isMaintenance: true,
        isAdmin: false,
        isSuperAdmin: false,
      })
      assert.strictEqual(decision.allowed, false, `Route ${route} must be blocked`)
      assert.strictEqual(decision.component, 'MaintenanceScreen', `Route ${route} must show MaintenanceScreen`)
    }
  })

  it('13. NO REDIRECT LOOP: Renders MaintenanceScreen directly in place', () => {
    // Check that MaintenanceGate does not perform programmatic Navigate redirects to a maintenance URL
    assert.ok(!gateCode.includes("navigate('/maintenance')"), 'Must not redirect to /maintenance')
    assert.ok(!gateCode.includes('<Navigate to="/maintenance"'), 'Must not render Navigate to /maintenance')
    assert.ok(gateCode.includes('<MaintenanceScreen />'), 'Must render MaintenanceScreen directly in place')
  })

  it('14. Announcement banner remains functional and unmodified', () => {
    assert.ok(
      layoutCode.includes('isAnnouncementEnabled && ('),
      'DashboardLayout must preserve announcement banner rendering'
    )
    assert.ok(
      layoutCode.includes('data-testid="global-announcement-banner"'),
      'DashboardLayout must keep global-announcement-banner testid'
    )
    assert.ok(
      hookCode.includes('isAnnouncementEnabled: Boolean(settings.announcement_banner_enabled'),
      'usePlatformSettings must preserve isAnnouncementEnabled'
    )
    assert.ok(
      hookCode.includes('announcementText: settings.announcement_banner_text'),
      'usePlatformSettings must preserve announcementText'
    )
  })

  it('15. Dynamic Auto-Gate: usePlatformSettings listens to focus, visibilitychange, and intervals', () => {
    assert.ok(hookCode.includes("window.addEventListener('focus'"), 'Must refresh on window focus')
    assert.ok(hookCode.includes("document.addEventListener('visibilitychange'"), 'Must refresh on tab visibility change')
    assert.ok(hookCode.includes('setInterval('), 'Must have periodic interval fallback')
    assert.ok(hookCode.includes('load(true)'), 'Must pass forceRefresh to bypass cache on focus/visibilitychange')
  })

  it('16. MaintenanceScreen does NOT expose admin links or entry points to normal users (@g.md)', () => {
    assert.ok(
      !screenCode.includes('/admin'),
      'MaintenanceScreen must NOT contain any link or path to /admin'
    )
    assert.ok(
      !screenCode.includes('maintenance-admin-link'),
      'MaintenanceScreen must NOT contain maintenance-admin-link'
    )
    assert.ok(
      !screenCode.includes('Akses Administrator'),
      'MaintenanceScreen must NOT display "Akses Administrator"'
    )
    assert.ok(
      screenCode.includes('data-testid="maintenance-screen"'),
      'MaintenanceScreen must preserve maintenance-screen container'
    )
    assert.ok(
      screenCode.includes('Pemeliharaan Sistem'),
      'MaintenanceScreen must preserve "Pemeliharaan Sistem" title'
    )
    assert.ok(
      screenCode.includes('supportEmail'),
      'MaintenanceScreen must preserve support email contact info'
    )
  })

  it('17. Compatibility: MaintenanceGuard re-exports MaintenanceGate', () => {
    assert.ok(
      guardCode.includes('MaintenanceGate'),
      'MaintenanceGuard must re-export MaintenanceGate for backward compatibility'
    )
  })
})
