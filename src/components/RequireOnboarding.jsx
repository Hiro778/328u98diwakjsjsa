import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function RequireOnboarding() {
  const { hasCompletedOnboarding, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!hasCompletedOnboarding) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
