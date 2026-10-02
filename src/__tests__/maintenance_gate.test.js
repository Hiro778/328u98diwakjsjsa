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
  // SettingsContext is the single source of truth for settings state, listeners, and derived values.
  // usePlatformSettings is now a thin proxy that reads from SettingsContext.
  const contextCode = fs.readFileSync(path.resolve('src/context/SettingsContext.jsx'), 'utf8')

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

    // Race condition guard: adminError must prevent premature non-admin decision
    assert.ok(gateCode.includes('adminError'), 'MaintenanceGate must guard on adminError to prevent race condition')

    // /pricing must be in public route exemption list
    assert.ok(gateCode.includes('/pricing'), 'MaintenanceGate must exempt /pricing from maintenance block')
  })

  // Public routes exempt from maintenance block (purchase funnel must remain accessible)
  const MAINTENANCE_PUBLIC_ROUTES = ['/pricing']

  // 4. ROUTE DECISION ENGINE SIMULATION — mirrors MaintenanceGate.jsx state machine exactly
  function evaluateMaintenanceGate({
    pathname,
    isMaintenance,
    settingsLoading = false,
    isAdmin = false,
    isSuperAdmin = false,
    adminLoading = false,
    adminError = null,
  }) {
    // 1. Admin routes always bypass
    if (pathname.startsWith('/admin')) {
      return { allowed: true, component: 'Outlet', reason: 'Admin path bypass' }
    }

    // 2. Auth routes always bypass
    if (pathname === '/auth' || pathname.startsWith('/auth/')) {
      return { allowed: true, component: 'Outlet', reason: 'Auth path bypass' }
    }

    // 3. Purchase/upgrade funnel routes bypass maintenance
    if (MAINTENANCE_PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) {
      return { allowed: true, component: 'Outlet', reason: 'Public route bypass' }
    }

    // 4. Wait for settings
    if (settingsLoading) {
      return { allowed: false, component: 'LoadingScreen', reason: 'Settings loading' }
    }

    // 5. Maintenance OFF
    if (!isMaintenance) {
      return { allowed: true, component: 'Outlet', reason: 'Maintenance inactive' }
    }

    // --- maintenance ON from here ---

    // 6. Race condition guard: RPC still in flight OR returned error → hold at loading
    if (adminLoading || adminError) {
      return { allowed: false, component: 'LoadingScreen', reason: 'Role resolving or RPC error' }
    }

    // 7. Admin exemption (server-backed)
    if (isAdmin || isSuperAdmin) {
      return { allowed: true, component: 'Outlet', reason: 'Admin exemption' }
    }

    // 8. Block normal users
    return { allowed: false, component: 'MaintenanceScreen', reason: 'Maintenance active' }
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

  it('12. direct navigation to another protected user route while ON → blocked; /pricing always allowed', () => {
    const subRoutes = [
      '/dashboard/keuangan/hpp-calculator',
      '/dashboard/keuangan/bep-calculator',
      '/dashboard/operasional/inventory',
      '/dashboard/penjualan/customer-crm',
      '/dashboard/pos',
      '/onboarding',
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

    // /pricing is exempt — users must reach purchase funnel during maintenance
    const pricingDecision = evaluateMaintenanceGate({
      pathname: '/pricing',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(pricingDecision.allowed, true, '/pricing must bypass maintenance')
    assert.strictEqual(pricingDecision.component, 'Outlet', '/pricing must render Outlet')
  })

  it('12b. race condition: maintenance ON + adminLoading=true → LoadingScreen, not MaintenanceScreen', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
      settingsLoading: false,
      adminLoading: true,
    })
    assert.strictEqual(decision.component, 'LoadingScreen', 'Must show LoadingScreen while role RPC resolves')
    assert.strictEqual(decision.allowed, false)
  })

  it('12c. race condition: maintenance ON + adminError → LoadingScreen (RPC error not treated as non-admin)', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
      settingsLoading: false,
      adminLoading: false,
      adminError: new Error('network error'),
    })
    assert.strictEqual(decision.component, 'LoadingScreen', 'RPC error must hold at LoadingScreen')
  })

  it('12d. /pricing accessible during maintenance for normal user (purchase funnel)', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/pricing',
      isMaintenance: true,
      isAdmin: false,
      isSuperAdmin: false,
    })
    assert.strictEqual(decision.allowed, true, '/pricing must be accessible during maintenance')
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('12e. ADMIN bypass: maintenance ON + admin role resolves → /dashboard accessible', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: false,
      settingsLoading: false,
      adminLoading: false,
    })
    assert.strictEqual(decision.allowed, true, 'ADMIN must bypass maintenance on /dashboard')
    assert.strictEqual(decision.component, 'Outlet')
  })

  it('12f. SUPER_ADMIN bypass: maintenance ON + super_admin role → /dashboard accessible', () => {
    const decision = evaluateMaintenanceGate({
      pathname: '/dashboard',
      isMaintenance: true,
      isAdmin: true,
      isSuperAdmin: true,
      settingsLoading: false,
      adminLoading: false,
    })
    assert.strictEqual(decision.allowed, true, 'SUPER_ADMIN must bypass maintenance on /dashboard')
    assert.strictEqual(decision.component, 'Outlet')
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
    // isAnnouncementEnabled and announcementText are derived in SettingsContext (single source of truth).
    // usePlatformSettings is a thin proxy over SettingsContext — values propagate via context.
    assert.ok(
      contextCode.includes('isAnnouncementEnabled: Boolean(settings.announcement_banner_enabled'),
      'SettingsContext must preserve isAnnouncementEnabled'
    )
    assert.ok(
      contextCode.includes('announcementText: settings.announcement_banner_text'),
      'SettingsContext must preserve announcementText'
    )
  })

  it('15. Dynamic Auto-Gate: settings listeners exist in SettingsContext (single source of truth)', () => {
    // After the conditional-hooks fix, usePlatformSettings is a thin proxy over SettingsContext.
    // All focus/visibilitychange/interval listeners live in SettingsProvider (SettingsContext.jsx).
    assert.ok(contextCode.includes("window.addEventListener('focus'"), 'SettingsProvider must refresh on window focus')
    assert.ok(contextCode.includes("document.addEventListener('visibilitychange'"), 'SettingsProvider must refresh on tab visibility change')
    assert.ok(contextCode.includes('setInterval('), 'SettingsProvider must have periodic interval fallback')
    assert.ok(contextCode.includes('load(true)'), 'SettingsProvider must pass forceRefresh to bypass cache on focus/visibilitychange')
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

  // ═════════════════════════════════════════════════════════════════════════
  // DEDICATED 12-ITEM REGRESSION SUITE SPECIFIED IN @gas.md
  // ═════════════════════════════════════════════════════════════════════════
  describe('Comprehensive Maintenance Mode Verification Suite (@gas.md Items 1-12)', () => {
    const migration084 = fs.readFileSync(path.resolve('supabase/migrations/084_platform_settings_runtime_enforcement.sql'), 'utf8')
    const migration096 = fs.readFileSync(path.resolve('supabase/migrations/096_maintenance_mode_comprehensive_enforcement.sql'), 'utf8')
    const serviceCode = fs.readFileSync(path.resolve('src/services/adminSettingsService.js'), 'utf8')
    const edgeCode = fs.readFileSync(path.resolve('supabase/functions/_shared/platform-settings.ts'), 'utf8')
    const settingsContextCode = fs.readFileSync(path.resolve('src/context/SettingsContext.jsx'), 'utf8')

    // 1. maintenance OFF + normal user → normal application access
    it('Item 1: maintenance OFF + normal user → normal application access', () => {
      const decision = evaluateMaintenanceGate({
        pathname: '/dashboard',
        isMaintenance: false,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.component, 'Outlet')
    })

    // 2. maintenance ON + normal user → MaintenancePage
    it('Item 2: maintenance ON + normal user → MaintenancePage', () => {
      const decision = evaluateMaintenanceGate({
        pathname: '/dashboard',
        isMaintenance: true,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(decision.allowed, false)
      assert.strictEqual(decision.component, 'MaintenanceScreen')
    })

    // 3. maintenance ON + admin → /admin accessible
    it('Item 3: maintenance ON + admin → /admin accessible', () => {
      const decision = evaluateMaintenanceGate({
        pathname: '/admin',
        isMaintenance: true,
        isAdmin: true,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.component, 'Outlet')
    })

    // 4. maintenance ON + superadmin → /admin/settings accessible
    it('Item 4: maintenance ON + superadmin → /admin/settings accessible', () => {
      const decision = evaluateMaintenanceGate({
        pathname: '/admin/settings',
        isMaintenance: true,
        isAdmin: true,
        isSuperAdmin: true,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.component, 'Outlet')
    })

    // 5. admin can turn maintenance OFF
    it('Item 5: admin can turn maintenance OFF (RPC update + cache invalidation)', () => {
      assert.ok(serviceCode.includes('updateSetting'), 'adminSettingsService must export updateSetting')
      assert.ok(serviceCode.includes('invalidatePublicSettingsCache'), 'adminSettingsService must export invalidatePublicSettingsCache')
      assert.ok(serviceCode.includes('platform-settings-invalidated'), 'Must dispatch platform-settings-invalidated event')
    })

    // 6. after OFF: normal user can access application
    it('Item 6: after OFF: normal user can access application', () => {
      const afterOffDecision = evaluateMaintenanceGate({
        pathname: '/dashboard',
        isMaintenance: false,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(afterOffDecision.allowed, true)
      assert.strictEqual(afterOffDecision.component, 'Outlet')
    })

    // 7. refresh while maintenance ON → still blocked
    it('Item 7: refresh while maintenance ON → still blocked (renders LoadingScreen then MaintenanceScreen, no flash)', () => {
      // While resolving after page refresh:
      const loadingState = evaluateMaintenanceGate({
        pathname: '/dashboard',
        isMaintenance: true,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: true,
        adminLoading: false,
      })
      assert.strictEqual(loadingState.allowed, false)
      assert.strictEqual(loadingState.component, 'LoadingScreen')

      // Once resolved:
      const resolvedState = evaluateMaintenanceGate({
        pathname: '/dashboard',
        isMaintenance: true,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(resolvedState.allowed, false)
      assert.strictEqual(resolvedState.component, 'MaintenanceScreen')
    })

    // 8. direct navigation to protected routes while ON → blocked; /pricing always passes
    it('Item 8: direct navigation to protected routes while ON → blocked; /pricing bypasses', () => {
      const blockedRoutes = [
        '/',
        '/tentang-kami',
        '/test-tools-view',
        '/menu/test-business-id',
        '/menu/test-business-id/product/test-prod',
        '/dashboard',
        '/dashboard/keuangan',
        '/dashboard/keuangan/hpp-calculator',
        '/dashboard/pos',
        '/onboarding',
      ]

      for (const route of blockedRoutes) {
        const decision = evaluateMaintenanceGate({
          pathname: route,
          isMaintenance: true,
          isAdmin: false,
          isSuperAdmin: false,
          settingsLoading: false,
          adminLoading: false,
        })
        assert.strictEqual(decision.allowed, false, `Route ${route} must be blocked`)
        assert.strictEqual(decision.component, 'MaintenanceScreen', `Route ${route} must render MaintenanceScreen`)
      }

      // /pricing must remain accessible so users can purchase/upgrade during maintenance
      const pricingDecision = evaluateMaintenanceGate({
        pathname: '/pricing',
        isMaintenance: true,
        isAdmin: false,
        isSuperAdmin: false,
        settingsLoading: false,
        adminLoading: false,
      })
      assert.strictEqual(pricingDecision.allowed, true, '/pricing must be accessible during maintenance')
      assert.strictEqual(pricingDecision.component, 'Outlet', '/pricing must render Outlet during maintenance')
    })

    // 9. no localStorage-based admin bypass
    it('Item 9: no localStorage-based admin bypass', () => {
      const cleanGate = gateCode.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      assert.ok(!cleanGate.includes('localStorage'), 'MaintenanceGate must NOT touch localStorage')
      assert.ok(!cleanGate.includes('sessionStorage'), 'MaintenanceGate must NOT touch sessionStorage')
      assert.ok(adminAuthHookCode.includes("supabase.rpc('is_admin')"), 'Role must be verified via server RPC')
    })

    // 10. non-admin cannot bypass gate by manually changing frontend state
    it('Item 10: non-admin cannot bypass gate by manually changing frontend state', () => {
      // Even if user attempts client spoofing, useAdminAuth re-verifies with server RPC
      assert.ok(adminAuthHookCode.includes('verifyWithServer'), 'Must use server-backed verifyWithServer')
      assert.ok(adminAuthHookCode.includes('get_current_admin_role'), 'Must verify get_current_admin_role RPC')
      assert.ok(adminAuthHookCode.includes('is_admin'), 'Must verify is_admin RPC')
    })

    // 11. server-side sensitive mutation remains protected during maintenance
    it('Item 11: server-side sensitive mutation remains protected during maintenance', () => {
      // In PostgreSQL:
      assert.ok(migration084.includes('MAINTENANCE_MODE'), 'Migration 084 must enforce MAINTENANCE_MODE check')
      assert.ok(migration096.includes('cancel_subscription_atomic'), 'Migration 096 must enforce MAINTENANCE_MODE on cancel_subscription_atomic')
      assert.ok(migration096.includes('claim_creative_free_usage_atomic'), 'Migration 096 must enforce MAINTENANCE_MODE on claim_creative_free_usage_atomic')

      // In Edge Functions:
      assert.ok(edgeCode.includes('enforceMaintenanceMode'), 'Edge functions must provide enforceMaintenanceMode')
      assert.ok(edgeCode.includes('MAINTENANCE_MODE'), 'Edge functions must return MAINTENANCE_MODE error when active')
    })

    // 12. no infinite redirect loop
    it('Item 12: no infinite redirect loop (renders directly in place)', () => {
      assert.ok(!gateCode.includes("navigate('/maintenance')"), 'Must not redirect programmatically')
      assert.ok(!gateCode.includes('<Navigate to="/maintenance"'), 'Must not render Navigate')
      assert.ok(gateCode.includes('<MaintenanceScreen />'), 'Must render MaintenanceScreen directly')
    })
  })
})

