import { useState } from 'react'
import { motion } from 'framer-motion'
import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { getFriendlyOAuthErrorMessage } from '../lib/oauthUtils'
import LoadingScreen from '../components/LoadingScreen'
import BannedAccountScreen from '../components/BannedAccountScreen'

function isSafeReturnTo(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}


export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const { signInWithGoogle, isAuthenticated, isAccessDenied, isBanned, isSuspended, banReason, signOut, loading } = useAuth()
  const { platformName, isRegistrationEnabled } = usePlatformSettings()
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [clientError, setClientError] = useState(null)

  const returnTo = searchParams.get('returnTo')
  const safeReturnTo = isSafeReturnTo(returnTo) ? returnTo : null

  const urlError = searchParams.get('error') || searchParams.get('error_code')
  const urlErrorDesc = searchParams.get('error_description')
  const errorMessage = clientError || getFriendlyOAuthErrorMessage(urlError, urlErrorDesc)


  if (loading) return <LoadingScreen />
  if (isAccessDenied || isBanned || isSuspended) return <BannedAccountScreen banReason={banReason} onSignOut={signOut} />
  if (isAuthenticated) return <Navigate to={safeReturnTo || '/dashboard'} replace />

  async function handleLogin() {
    if (isLoggingIn || loading) return
    setIsLoggingIn(true)
    setClientError(null)

    if (safeReturnTo) {
      try { localStorage.setItem('authReturnTo', safeReturnTo) } catch {}
    }

    try {
      const result = await signInWithGoogle()
      if (result?.error) {
        setIsLoggingIn(false)
        setClientError(result.error.message || 'Gagal memulai login dengan Google.')
      }
    } catch (err) {
      setIsLoggingIn(false)
      setClientError(err?.message || 'Terjadi gangguan saat menghubungkan ke Google.')
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 sm:px-5 py-8 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-600">
            <span className="text-lg font-extrabold text-white">{platformName.slice(0, 2).toUpperCase()}</span>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-navy-700">
            Masuk ke {platformName}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Kelola bisnis lo dengan lebih pintar.
          </p>
        </div>

        {/* OAuth Error Alert Banner */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="oauth-error-banner"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 leading-relaxed shadow-sm"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none select-none">⚠️</span>
              <div className="flex-1">
                <p className="font-semibold text-rose-900 mb-0.5">Kendala Masuk Akun</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          </motion.div>
        )}

        {!isRegistrationEnabled && (
          <div
            data-testid="registration-disabled-notice"
            className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-center text-xs text-amber-800"
          >
            <p className="font-bold">Pendaftaran Ditutup Sementara</p>
            <p className="mt-0.5">Pendaftaran pengguna baru sedang dinonaktifkan. Pengguna yang sudah terdaftar tetap dapat masuk.</p>
          </div>
        )}

        {/* Google button with single-flight locking & visual loading feedback */}
        <motion.button
          type="button"
          onClick={handleLogin}
          disabled={isLoggingIn || loading}
          whileHover={isLoggingIn ? {} : { scale: 1.02 }}
          whileTap={isLoggingIn ? {} : { scale: 0.98 }}
          className={`flex w-full items-center justify-center gap-3 rounded-xl border border-navy-100 bg-white px-6 py-3.5 text-[15px] font-semibold text-navy-700 shadow-sm transition-all ${
            isLoggingIn ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
          }`}
        >
          {isLoggingIn ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-navy-600 border-t-transparent" />
              <span>Menghubungkan ke Google...</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </motion.button>

        <p className="mt-6 text-center text-xs text-text-muted">
          Dengan masuk, kamu setuju Syarat &amp; Ketentuan.
        </p>
      </motion.div>
    </div>
  )
}
