import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { usePlatformSettings } from '../hooks/usePlatformSettings'
import { validateEmail, getFriendlyAuthErrorMessage } from '../lib/authErrorUtils'

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth()
  const { platformName } = usePlatformSettings()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientError, setClientError] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (isSubmitting) return

    setClientError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setClientError('Email wajib diisi.')
      return
    }

    if (!validateEmail(trimmedEmail)) {
      setClientError('Format email tidak valid.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await resetPasswordForEmail(trimmedEmail)
      if (result?.error) {
        // Only show rate limit or network error specifically; otherwise generic to avoid enumeration
        const msg = result.error.message || ''
        if (msg.toLowerCase().includes('rate limit') || result.error.status === 429) {
          setClientError(getFriendlyAuthErrorMessage(result.error))
          setIsSubmitting(false)
          return
        }
        if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed to fetch')) {
          setClientError(getFriendlyAuthErrorMessage(result.error))
          setIsSubmitting(false)
          return
        }
      }
      // Always show generic success to protect against account enumeration
      setSubmitted(true)
    } catch (err) {
      if (err?.message?.toLowerCase().includes('network')) {
        setClientError(getFriendlyAuthErrorMessage(err))
      } else {
        setSubmitted(true)
      }
    } finally {
      setIsSubmitting(false)
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
            Lupa password?
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Masukkan email akun kamu untuk menerima instruksi reset password.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✉️
            </div>
            <h2 className="mt-4 text-base font-bold text-navy-800">
              Instruksi Terkirim
            </h2>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              Jika email <span className="font-semibold text-navy-700">{email}</span> terdaftar di {platformName}, kami telah mengirim instruksi reset password. Silakan periksa folder Inbox atau Spam kamu.
            </p>
            <div className="mt-6">
              <Link
                to="/auth"
                className="inline-flex w-full items-center justify-center rounded-xl bg-navy-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-700 transition-colors"
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
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-navy-700 mb-1.5">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                autoComplete="email"
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
                  Mengirim link...
                </span>
              ) : (
                'Kirim link reset'
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-800 transition-colors"
              >
                <span>←</span> Kembali ke login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
