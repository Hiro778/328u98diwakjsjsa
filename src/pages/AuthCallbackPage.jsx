import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { parseOAuthError } from '../lib/oauthUtils'
import LoadingScreen from '../components/LoadingScreen'

function isSafeReturnTo(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return false
  }
  if (path === '/auth' || path.startsWith('/auth/') || path.startsWith('/auth?')) {
    return false
  }
  return true
}


export default function AuthCallbackPage() {
  const { isAuthenticated, loading, isLoggingOut } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  // 1. Forward password recovery requests directly to /auth/reset-password
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash || ''
    const search = window.location.search || ''
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      navigate(`/auth/reset-password${search}${hash}`, { replace: true })
      return
    }

    const oauthError = parseOAuthError(window.location.search, window.location.hash)
    if (oauthError) {
      try {
        sessionStorage.removeItem('authReturnTo')
        localStorage.removeItem('authReturnTo')
      } catch {}

      const params = new URLSearchParams()
      params.set('error', oauthError.errorCode)
      if (oauthError.errorDescription) {
        params.set('error_description', oauthError.errorDescription)
      }
      navigate(`/auth?${params.toString()}`, { replace: true })
      return
    }

    // 2. Prevent infinite loading screen: if not authenticated after 2500ms, redirect to /auth
    const timer = setTimeout(() => {
      setTimedOut(true)
    }, 2500)

    return () => clearTimeout(timer)
  }, [navigate])

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
  if (isAuthenticated && !isLoggingOut) return <Navigate to={redirectTo} replace />

  // If unauthenticated after grace period, redirect to auth with timeout indicator
  if (timedOut) {
    return <Navigate to="/auth?error=auth_timeout" replace />
  }

  return <LoadingScreen />
}
