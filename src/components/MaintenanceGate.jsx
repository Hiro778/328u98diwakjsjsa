import { Outlet, useLocation } from 'react-router'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { useAdminAuth } from '../hooks/useAdminAuth'
import MaintenanceScreen from './MaintenanceScreen'
import LoadingScreen from './LoadingScreen'

/**
 * MaintenanceGate (@gl.md)
 * Global React MaintenanceGate covering authenticated user routes.
 *
 * Rules:
 * 1. Normal USER accounts:
 *    - when maintenance_mode=true, MUST NOT access /dashboard or other normal application routes.
 *    - MUST see a dedicated Maintenance Page.
 * 2. ADMIN and SUPER_ADMIN:
 *    - MUST still be able to access /admin and /admin/settings while maintenance_mode=true.
 *    - Have full exemption based on server-backed Admin RBAC.
 * 3. Role decision MUST use the existing server-backed Admin RBAC/auth state (useAdminAuth RPCs).
 *    DO NOT trust localStorage or a client-editable role.
 * 4. Public routes necessary for authentication/maintenance handling remain accessible.
 * 5. Prevents redirect loops by rendering MaintenanceScreen directly in place.
 * 6. Dynamic update: When maintenance_mode changes true <-> false, normal user regains/loses
 *    access on settings refresh/focus/reload without requiring logout.
 */
export default function MaintenanceGate() {
  const { isMaintenance, loading: settingsLoading } = usePlatformSettings()
  const { isAdmin, isSuperAdmin, loading: adminLoading } = useAdminAuth()
  const location = useLocation()

  // 1. Admin routes (/admin/*) always bypass MaintenanceGate
  // Admin access is independently guarded downstream by RequireAdmin via server-backed RBAC
  if (location.pathname.startsWith('/admin')) {
    return <Outlet />
  }

  // 2. If maintenance mode is OFF and settings loaded, allow normal traffic
  if (!settingsLoading && !isMaintenance) {
    return <Outlet />
  }

  // 3. When maintenance is active, wait for role verification if admin auth is still loading
  // to avoid flashing protected content before server RPC returns
  if (settingsLoading || (isMaintenance && adminLoading)) {
    return <LoadingScreen />
  }

  // 4. Server-verified ADMIN and SUPER_ADMIN accounts are exempt from maintenance mode
  if (isAdmin || isSuperAdmin) {
    return <Outlet />
  }

  // 5. Normal USER: Block all access to protected routes and render MaintenanceScreen
  if (isMaintenance) {
    return <MaintenanceScreen />
  }

  return <Outlet />
}
