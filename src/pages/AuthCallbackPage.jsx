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
    const sessionStored = sessionStorage.getItem('authReturnTo')
    const localStored = localStorage.getItem('authReturnTo')
    const stored = sessionStored || localStored
    if (isSafeReturnTo(stored)) {
      redirectTo = stored
    }
    sessionStorage.removeItem('authReturnTo')
    localStorage.removeItem('authReturnTo')
  } catch {}

  if (loading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to={redirectTo} replace />
  return <LoadingScreen />
}
