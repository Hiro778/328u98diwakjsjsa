import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'

export default function RequireAuth() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/auth" replace />

  return <Outlet />
}
