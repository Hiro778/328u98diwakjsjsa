import { Navigate, Outlet } from 'react-router'
import { useAdminAuth } from '../hooks/useAdminAuth.js'
import LoadingScreen from './LoadingScreen'

/**
 * RequireAdmin Guard Component
 * Conforms to @admin.md Section 0, 1, 2, 31:
 * - User biasa → Ditolak (redirect ke /dashboard)
 * - ADMIN → Boleh masuk /admin
 * - SUPER_ADMIN → Boleh masuk seluruh area admin (termasuk requiredRole="SUPER_ADMIN")
 * - Diverifikasi langsung dari database server via useAdminAuth (RPC get_current_admin_role / is_admin / is_super_admin)
 */
export default function RequireAdmin({ requiredRole = 'ADMIN' }) {
  const { role, isAdmin, isSuperAdmin, loading } = useAdminAuth()

  if (loading) {
    return <LoadingScreen />
  }

  // User biasa ditolak
  if (!isAdmin || role === 'USER') {
    return <Navigate to="/dashboard" replace />
  }

  // Jika butuh SUPER_ADMIN tapi role hanya ADMIN biasa
  if (requiredRole === 'SUPER_ADMIN' && !isSuperAdmin) {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}
