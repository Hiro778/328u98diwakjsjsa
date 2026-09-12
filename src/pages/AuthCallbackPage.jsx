import { Navigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from '../components/LoadingScreen'

function isSafeReturnTo(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}

export default function AuthCallbackPage() {
  const { isAuthenticated, loading } = useAuth()

  let redirectTo = '/dashboard'
  try {
    const stored = localStorage.getItem('authReturnTo')
    if (isSafeReturnTo(stored)) {
      redirectTo = stored
      localStorage.removeItem('authReturnTo')
    }
  } catch {}

  if (loading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to={redirectTo} replace />
  return <LoadingScreen />
}
