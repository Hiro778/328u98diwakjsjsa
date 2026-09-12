import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function RequireSubscription() {
  const { hasActiveSubscription, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!hasActiveSubscription) return <Navigate to="/pricing" replace />

  return <Outlet />
}
