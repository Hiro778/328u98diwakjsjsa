import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { supabase } from '../lib/supabase'
import { parseOAuthError } from '../lib/oauthUtils'
import { validatePassword, validatePasswordConfirmation, getFriendlyAuthErrorMessage } from '../lib/authErrorUtils'
import LoadingScreen from '../components/LoadingScreen'

export default function ResetPasswordPage() {
  const { updatePassword, signOut, user } = useAuth()
  const { platformName } = usePlatformSettings()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientError, setClientError] = useState(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [sessionError, setSessionError] = useState(null)

  // Verify recovery link & session on mount
  useEffect(() => {
    let isMounted = true

    async function checkRecoverySession() {
      if (typeof window === 'undefined') return

      // 1. Check for URL errors (e.g. otp_expired, access_denied)
      const urlError = parseOAuthError(window.location.search, window.location.hash)
      if (urlError) {
        if (isMounted) {
          setSessionError('Link reset password sudah tidak valid atau sudah kedaluwarsa.')
          setIsCheckingSession(false)
        }
        return
      }

      // 2. Check for active session established by Supabase recovery link
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!isMounted) return

        if (session?.user) {
          setHasValidSession(true)
          setIsCheckingSession(false)
          return
        }

        // If PKCE / hash is currently being exchanged, give Supabase a brief grace window
        const hasTokenInUrl =
          window.location.search.includes('code=') ||
          window.location.hash.includes('access_token=') ||
          window.location.hash.includes('type=recovery')

        if (hasTokenInUrl) {
          const timeout = setTimeout(async () => {
            if (!isMounted) return
            const { data: { session: retrySession } } = await supabase.auth.getSession()
            if (retrySession?.user) {
              setHasValidSession(true)
            } else {
              setSessionError('Link reset password sudah tidak valid atau sudah kedaluwarsa.')
            }
            setIsCheckingSession(false)
          }, 1500)
          return () => clearTimeout(timeout)
        } else {
          setSessionError('Tidak ada sesi reset password aktif. Silakan minta link reset baru.')
          setIsCheckingSession(false)
        }
      } catch (err) {
        if (isMounted) {
          setSessionError('Terjadi kendala saat memverifikasi link reset password.')
          setIsCheckingSession(false)
        }
      }
    }

    checkRecoverySession()

    return () => {
      isMounted = false
    }
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    if (isSubmitting) return

    setClientError(null)

    if (!validatePassword(password)) {
      setClientError('Password baru minimal harus 6 karakter.')
      return
    }

    if (!validatePasswordConfirmation(password, confirmPassword)) {
      setClientError('Konfirmasi password tidak cocok dengan password baru.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await updatePassword(password)
      if (result?.error) {
        setClientError(getFriendlyAuthErrorMessage(result.error))
        setIsSubmitting(false)
        return
      }

      setResetSuccess(true)

      // Safely wipe recovery session to prevent unexpected dashboard drops and guarantee clean login
      try {
        await signOut()
      } catch {}

      // Automatically return to login after 2 seconds
      setTimeout(() => {
        navigate('/auth?reset_success=1', { replace: true })
      }, 2000)
    } catch (err) {
      setClientError(getFriendlyAuthErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  if (isCheckingSession) {
    return <LoadingScreen />
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
            Buat password baru
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Masukkan password baru yang aman untuk akun kamu.
          </p>
        </div>

        {resetSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✅
            </div>
            <h2 className="mt-4 text-base font-bold text-navy-800">
              Password Berhasil Diperbarui!
            </h2>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              Password kamu telah berhasil disimpan. Mengalihkan kamu ke halaman login...
            </p>
            <div className="mt-6">
              <Link
                to="/auth?reset_success=1"
                className="inline-flex w-full items-center justify-center rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors"
              >
                Masuk Sekarang
              </Link>
            </div>
          </div>
        ) : sessionError || !hasValidSession ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl">
              ⚠️
            </div>
            <h2 className="mt-4 text-base font-bold text-navy-800">
              Link Tidak Valid
            </h2>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              {sessionError || 'Link reset password sudah tidak valid atau sudah kedaluwarsa.'}
            </p>
            <div className="mt-6 space-y-2.5">
              <Link
                to="/auth/forgot-password"
                className="inline-flex w-full items-center justify-center rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors"
              >
                Minta Link Baru
              </Link>
              <Link
                to="/auth"
                className="inline-flex w-full items-center justify-center rounded-xl border border-navy-200 bg-white px-5 py-2.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 transition-colors"
              >
                Kembali ke Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {clientError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 shadow-sm">
                <span className="text-sm select-none">⚠️</span>
                <span>{clientError}</span>
              </div>
            )}

            <div>
              <label htmlFor="reset-new-password" className="block text-xs font-semibold text-navy-700 mb-1.5">
                Password baru
              </label>
              <input
                id="reset-new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-navy-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="block text-xs font-semibold text-navy-700 mb-1.5">
                Konfirmasi password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 disabled:bg-navy-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-navy-700 active:scale-[0.99] cursor-pointer'
              }`}
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Menyimpan password...
                </span>
              ) : (
                'Simpan password'
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-800 transition-colors"
              >
                <span>←</span> Batal dan kembali ke login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
