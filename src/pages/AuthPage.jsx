import { useState } from 'react'
import { Navigate, useSearchParams, Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { getFriendlyOAuthErrorMessage } from '../lib/oauthUtils'
import { validateEmail, validatePassword, validatePasswordConfirmation, getFriendlyAuthErrorMessage } from '../lib/authErrorUtils'
import LoadingScreen from '../components/LoadingScreen'
import BannedAccountScreen from '../components/BannedAccountScreen'

function isSafeReturnTo(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return false
  }
  if (path === '/auth' || path.startsWith('/auth/') || path.startsWith('/auth?')) {
    return false
  }
  return true
}

export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    user,
    isAuthenticated,
    isAccessDenied,
    isBanned,
    isSuspended,
    banReason,
    signOut,
    loading,
    isLoggingOut,
  } = useAuth()
  const { platformName, isRegistrationEnabled } = usePlatformSettings()

  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState(initialMode) // 'login' | 'register'

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const isGoogleLoading = isLoggingIn
  const setIsGoogleLoading = setIsLoggingIn
  const [clientError, setClientError] = useState(null)
  const [verificationSentEmail, setVerificationSentEmail] = useState(null)

  const returnTo = searchParams.get('returnTo')
  const safeReturnTo = isSafeReturnTo(returnTo) ? returnTo : null

  // URL alerts
  const urlError = searchParams.get('error') || searchParams.get('error_code')
  const urlErrorDesc = searchParams.get('error_description')
  const errorMessage = clientError || getFriendlyOAuthErrorMessage(urlError, urlErrorDesc)

  const resetSuccess = searchParams.get('reset_success') === '1'
  const verifiedSuccess = searchParams.get('verified') === '1'

  if ((user || isAuthenticated) && !isLoggingOut && !isAccessDenied) return <Navigate to={safeReturnTo || '/dashboard'} replace />
  if (isAccessDenied || isBanned || isSuspended) return <BannedAccountScreen banReason={banReason} onSignOut={signOut} />

  function switchMode(newMode) {
    setMode(newMode)
    setClientError(null)
    setPassword('')
    setConfirmPassword('')
    setVerificationSentEmail(null)
    const newParams = new URLSearchParams(searchParams)
    if (newMode === 'register') {
      newParams.set('mode', 'register')
    } else {
      newParams.delete('mode')
    }
    newParams.delete('reset_success')
    newParams.delete('verified')
    newParams.delete('error')
    newParams.delete('error_code')
    newParams.delete('error_description')
    setSearchParams(newParams, { replace: true })
  }

  async function handleGoogleLogin() {
    if (isGoogleLoading || isSubmitting || loading) return
    setIsGoogleLoading(true)
    setClientError(null)

    if (safeReturnTo) {
      try { localStorage.setItem('authReturnTo', safeReturnTo) } catch {}
    }

    try {
      const result = await signInWithGoogle()
      if (result?.error) {
        setIsGoogleLoading(false)
        setClientError(result.error.message || 'Gagal memulai login dengan Google.')
      }
    } catch (err) {
      setIsGoogleLoading(false)
      setClientError(err?.message || 'Terjadi gangguan saat menghubungkan ke Google.')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (isSubmitting || isGoogleLoading || loading) return

    setClientError(null)
    const trimmedEmail = email.trim()

    // 1. Client-side Validation
    if (!trimmedEmail) {
      setClientError('Email wajib diisi.')
      return
    }

    if (!validateEmail(trimmedEmail)) {
      setClientError('Format email tidak valid.')
      return
    }

    if (!password) {
      setClientError('Password wajib diisi.')
      return
    }

    if (mode === 'register') {
      if (!isRegistrationEnabled) {
        setClientError('Pendaftaran akun baru sedang dinonaktifkan sementara.')
        return
      }

      if (!validatePassword(password)) {
        setClientError('Password minimal harus 6 karakter.')
        return
      }

      if (!validatePasswordConfirmation(password, confirmPassword)) {
        setClientError('Konfirmasi password tidak cocok dengan password yang dimasukkan.')
        return
      }
    }

    setIsSubmitting(true)

    if (safeReturnTo) {
      try { localStorage.setItem('authReturnTo', safeReturnTo) } catch {}
    }

    try {
      if (mode === 'login') {
        const { data, error } = await signInWithEmail(trimmedEmail, password)
        if (error) {
          setIsSubmitting(false)
          setClientError(getFriendlyAuthErrorMessage(error))
          return
        }
        // Success: AuthContext onAuthStateChange will update user/session
      } else {
        // Mode: register
        const { data, error } = await signUpWithEmail(trimmedEmail, password)
        if (error) {
          setIsSubmitting(false)
          setClientError(getFriendlyAuthErrorMessage(error))
          return
        }

        // If email confirmation is required, Supabase returns session: null
        if (!data?.session) {
          setIsSubmitting(false)
          setVerificationSentEmail(trimmedEmail)
          return
        }
        // If session was returned immediately (e.g. email confirm disabled), user will be logged in
      }
    } catch (err) {
      setIsSubmitting(false)
      setClientError(getFriendlyAuthErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 sm:px-5 py-8 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
      <div className="w-full max-w-sm transition-all duration-300">
        {/* Brand */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <img src="/brand-logo.png" alt={platformName} className="mx-auto h-12 w-12 object-contain" />
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold text-navy-700">
            {verificationSentEmail
              ? 'Periksa email kamu'
              : mode === 'register'
              ? 'Buat akun baru'
              : `Masuk ke ${platformName}`}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {verificationSentEmail
              ? 'Link verifikasi telah dikirimkan ke kotak masuk kamu.'
              : mode === 'register'
              ? 'Mulai kelola bisnis lo dengan lebih pintar.'
              : 'Kelola bisnis lo dengan lebih pintar.'}
          </p>
        </div>

        {/* Verification Sent Success Notice */}
        {verificationSentEmail ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✉️
            </div>
            <h2 className="mt-4 text-base font-bold text-navy-800">
              Verifikasi Email Dikirim
            </h2>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              Kami sudah mengirim link verifikasi ke <span className="font-semibold text-navy-700">{verificationSentEmail}</span>. Silakan klik link tersebut untuk mengaktifkan akun kamu.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors cursor-pointer"
              >
                Kembali ke Masuk
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Success Alert Banners */}
            {resetSuccess && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 leading-relaxed shadow-sm flex items-start gap-2.5">
                <span className="text-base select-none">✅</span>
                <div>
                  <p className="font-semibold text-emerald-900 mb-0.5">Password Berhasil Diperbarui</p>
                  <p>Silakan masuk menggunakan password baru kamu.</p>
                </div>
              </div>
            )}

            {verifiedSuccess && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 leading-relaxed shadow-sm flex items-start gap-2.5">
                <span className="text-base select-none">🎉</span>
                <div>
                  <p className="font-semibold text-emerald-900 mb-0.5">Email Terverifikasi</p>
                  <p>Akun kamu sudah aktif. Silakan masuk untuk melanjutkan.</p>
                </div>
              </div>
            )}

            {/* Error Alert Banner */}
            {errorMessage && (
              <div
                data-testid="oauth-error-banner"
                className="oauth-error-banner mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 leading-relaxed shadow-sm flex items-start gap-2.5"
              >
                <span className="text-base leading-none select-none">⚠️</span>
                <div className="flex-1">
                  <p className="font-semibold text-rose-900 mb-0.5">Kendala Masuk Akun</p>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}

            {!isRegistrationEnabled && mode === 'register' && (
              <div
                data-testid="registration-disabled-notice"
                className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-center text-xs text-amber-800"
              >
                <p className="font-bold">Pendaftaran Ditutup Sementara</p>
                <p className="mt-0.5">Pendaftaran pengguna baru sedang dinonaktifkan. Pengguna yang sudah terdaftar tetap dapat masuk.</p>
              </div>
            )}

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold text-navy-700 mb-1.5">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-navy-50 disabled:cursor-not-allowed transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-navy-700">
                    Password
                  </label>
                  {mode === 'login' && (
                    <Link
                      to="/auth/forgot-password"
                      className="text-[11px] font-semibold text-navy-600 hover:text-navy-800 transition-colors"
                    >
                      Lupa password?
                    </Link>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimal 6 karakter' : 'Password kamu'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  disabled={isSubmitting || isGoogleLoading}
                  className="w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-navy-50 disabled:cursor-not-allowed transition-colors"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-confirm-password" className="block text-xs font-semibold text-navy-700 mb-1.5">
                    Konfirmasi password
                  </label>
                  <input
                    id="auth-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password"
                    autoComplete="new-password"
                    disabled={isSubmitting || isGoogleLoading}
                    className="w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-navy-50 disabled:cursor-not-allowed transition-colors"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading || (mode === 'register' && !isRegistrationEnabled)}
                className={`w-full rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all ${
                  isSubmitting || (mode === 'register' && !isRegistrationEnabled)
                    ? 'opacity-70 cursor-not-allowed'
                    : 'hover:bg-navy-700 active:scale-[0.99] cursor-pointer'
                }`}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{mode === 'register' ? 'Mendaftar...' : 'Memverifikasi...'}</span>
                  </span>
                ) : mode === 'register' ? (
                  'Daftar'
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-navy-100" />
              </div>
              <span className="relative bg-cream px-3 text-xs text-text-muted">
                atau
              </span>
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoggingIn || loading}
              className={`flex w-full items-center justify-center gap-3 rounded-xl border border-navy-100 bg-white px-6 py-3 text-[14px] font-semibold text-navy-700 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] ${
                isGoogleLoading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
              }`}
            >
              {isGoogleLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-navy-600 border-t-transparent" />
                  <span>Menghubungkan ke Google...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Toggle Login / Register */}
            <div className="mt-6 text-center text-xs text-text-secondary">
              {mode === 'register' ? (
                <span>
                  Sudah punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-navy-700 hover:text-navy-900 underline transition-colors cursor-pointer"
                  >
                    Masuk
                  </button>
                </span>
              ) : (
                <span>
                  Belum punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-bold text-navy-700 hover:text-navy-900 underline transition-colors cursor-pointer"
                  >
                    Daftar
                  </button>
                </span>
              )}
            </div>

            <p className="mt-6 text-center text-[11px] text-text-muted">
              Dengan melanjutkan, kamu menyetujui Syarat &amp; Ketentuan BisnisSehat.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
