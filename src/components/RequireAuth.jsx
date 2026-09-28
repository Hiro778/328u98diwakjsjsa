import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import BannedAccountScreen from './BannedAccountScreen'

export default function RequireAuth() {
  const { isAuthenticated, isAccessDenied, isBanned, isSuspended, banReason, loading, authLoading, signOut } = useAuth()

  if (loading || authLoading) return <LoadingScreen />

  // Strict Security Hardening: Banned or suspended user has ZERO app access
  if (isAccessDenied || isBanned || isSuspended) {
    return <BannedAccountScreen banReason={banReason} onSignOut={signOut} />
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />

  return <Outlet />
}
