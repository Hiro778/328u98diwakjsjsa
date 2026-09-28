import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import BannedAccountScreen from './BannedAccountScreen'

export default function RequireOnboarding() {
  const { hasCompletedOnboarding, isAccessDenied, banReason, signOut, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (isAccessDenied) return <BannedAccountScreen banReason={banReason} onSignOut={signOut} />
  if (!hasCompletedOnboarding) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
