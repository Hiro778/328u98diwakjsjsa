import { Outlet, useLocation } from 'react-router'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { useAdminAuth } from '../hooks/useAdminAuth'
import MaintenanceScreen from './MaintenanceScreen'
import LoadingScreen from './LoadingScreen'

/**
 * MaintenanceGate (@gl.md)
 * Global React layout route covering public and authenticated user routes.
 *
 * State machine: AUTH_LOADING → SETTINGS_LOADED → ROLE_CHECK → DECISION
 *
 * Rules:
 * 1. Normal USER accounts:
 *    - when maintenance_mode=true, MUST NOT access /dashboard or other app routes.
 *    - MUST see MaintenanceScreen directly (no redirect loop).
 * 2. ADMIN and SUPER_ADMIN:
 *    - MUST bypass maintenance gate unconditionally (server-verified via RPC).
 *    - /admin/* always passes (guarded downstream by RequireAdmin).
 * 3. Role decision MUST use server-backed RPCs via useAdminAuth.
 *    DO NOT trust localStorage, sessionStorage, or URL params.
 * 4. /auth and /auth/* always pass (admin recovery path).
 * 5. MAINTENANCE_PUBLIC_ROUTES (e.g. /pricing) always pass so normal users can
 *    still reach the purchase/upgrade funnel during maintenance.
 * 6. Race condition guard: while adminLoading=true or adminError≠null and
 *    maintenance=true, hold at LoadingScreen — never decide admin=false prematurely.
 * 7. Dynamic update: maintenance_mode changes propagate on focus/visibilitychange
 *    without requiring logout.
 */
// Public routes that must remain accessible even when maintenance_mode=true,
// so normal users can still reach the purchase/upgrade funnel.
const MAINTENANCE_PUBLIC_ROUTES = ['/pricing']

export default function MaintenanceGate() {
  const { isMaintenance, loading: settingsLoading } = usePlatformSettings()
  const { isAdmin, isSuperAdmin, loading: adminLoading, error: adminError } = useAdminAuth()
  const location = useLocation()

  // 1. Admin routes (/admin/*) always bypass MaintenanceGate.
  // Admin access is independently guarded downstream by RequireAdmin via server-backed RBAC.
  if (location.pathname.startsWith('/admin')) {
    return <Outlet />
  }

  // 2. Public auth routes (/auth, /auth/callback) must remain accessible for admin recovery.
  if (location.pathname === '/auth' || location.pathname.startsWith('/auth/')) {
    return <Outlet />
  }

  // 3. Purchase/upgrade funnel routes must remain accessible during maintenance
  // so normal users can still subscribe or upgrade their plan.
  if (MAINTENANCE_PUBLIC_ROUTES.some(route => location.pathname === route || location.pathname.startsWith(route + '/'))) {
    return <Outlet />
  }

  // 4. Wait for settings to load before making any gate decision.
  if (settingsLoading) {
    return <LoadingScreen />
  }

  // 5. Maintenance is OFF — allow all traffic through.
  if (!isMaintenance) {
    return <Outlet />
  }

  // --- maintenance_mode=true from here ---

  // 6. While maintenance is active and admin role RPC is still resolving (or returned an error),
  // hold at LoadingScreen. This prevents a race condition where an ADMIN/SUPER_ADMIN user
  // would briefly see MaintenanceScreen before verifyWithServer() completes.
  // adminError is treated as "not yet resolved" — a transient network error must not
  // erroneously downgrade an admin to a normal user.
  if (adminLoading || adminError) {
    return <LoadingScreen />
  }

  // 7. Server-verified ADMIN and SUPER_ADMIN accounts are exempt from maintenance mode.
  if (isAdmin || isSuperAdmin) {
    return <Outlet />
  }

  // 8. Normal USER & public visitor: block access and show maintenance screen.
  return <MaintenanceScreen />
}
