// src/pages/ActivateCreditPage.jsx
// Customer One-Time AI Credit Activation Page
// Strictly conforms to load.md Sections 10, 12, 13, 15

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { redeemCreditActivation } from '../services/creditActivationService'

export default function ActivateCreditPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  const rawToken = searchParams.get('t') || ''

  // State: 'checking' | 'login_required' | 'success' | 'already_used' | 'expired' | 'invalid' | 'wrong_account' | 'cancelled' | 'rate_limited'
  const [status, setStatus] = useState('checking')
  const [resultData, setResultData] = useState(null)
  const [customMessage, setCustomMessage] = useState('')
  const redemptionAttemptedRef = useRef(false)

  useEffect(() => {
    // If auth state is still loading, wait
    if (authLoading) return

    // Validate token presence
    if (!rawToken || !rawToken.trim()) {
      setStatus('invalid')
      setCustomMessage('Link aktivasi tidak valid.')
      return
    }

    // If user is not logged in, prompt login and preserve token in sessionStorage
    if (!isAuthenticated || !user) {
      try {
        const returnUrl = `/activate-credit?t=${encodeURIComponent(rawToken.trim())}`
        sessionStorage.setItem('authReturnTo', returnUrl)
      } catch {}
      setStatus('login_required')
      return
    }

    // Prevent duplicate calls in React StrictMode
    if (redemptionAttemptedRef.current) return
    redemptionAttemptedRef.current = true

    // Execute atomic redemption
    async function executeRedemption() {
      setStatus('checking')
      try {
        const res = await redeemCreditActivation(rawToken)

        if (res.success) {
          setStatus('success')
          setResultData(res)
          // Clean token from URL immediately after processing so it is not visible or re-sent
          try {
            window.history.replaceState({}, document.title, window.location.pathname)
          } catch {}
          return
        }

        const errCode = (res.error || '').toUpperCase()
        if (errCode === 'ALREADY_USED') {
          setStatus('already_used')
        } else if (errCode === 'EXPIRED') {
          setStatus('expired')
        } else if (errCode === 'WRONG_ACCOUNT') {
          setStatus('wrong_account')
        } else if (errCode === 'CANCELLED') {
          setStatus('cancelled')
        } else if (errCode === 'RATE_LIMITED') {
          setStatus('rate_limited')
        } else if (errCode === 'LOGIN_REQUIRED') {
          setStatus('login_required')
        } else {
          setStatus('invalid')
        }
        setCustomMessage(res.message || 'Link aktivasi tidak valid.')
      } catch (err) {
        console.error('Redemption error:', err)
        setStatus('invalid')
        setCustomMessage(err.message || 'Link aktivasi tidak valid.')
      }
    }

    executeRedemption()
  }, [rawToken, isAuthenticated, user, authLoading])

  const handleLoginClick = () => {
    const returnUrl = `/activate-credit?t=${encodeURIComponent(rawToken.trim())}`
    try {
      sessionStorage.setItem('authReturnTo', returnUrl)
      localStorage.setItem('authReturnTo', returnUrl)
    } catch {}
    navigate(`/auth?returnTo=${encodeURIComponent(returnUrl)}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 bg-blue-600/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xl border border-blue-500/30 mb-3">
            BS
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Aktivasi AI Credit BisnisSehat
          </h1>
        </div>

        {/* State 1: Checking */}
        {status === 'checking' && (
          <div className="space-y-4 py-6">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-slate-400 font-medium">
              Memeriksa dan memvalidasi link aktivasi kredit...
            </p>
          </div>
        )}

        {/* State 2: Login Required */}
        {status === 'login_required' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Login Diperlukan</h2>
              <p className="text-sm text-slate-400">
                Silakan login terlebih dahulu untuk menggunakan link aktivasi.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoginClick}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              Login Sekarang
            </button>
          </div>
        )}

        {/* State 3: Success */}
        {status === 'success' && (
          <div className="space-y-5 py-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Aktivasi Berhasil!</h2>
              <p className="text-base font-semibold text-emerald-400">
                {resultData?.credits_added || 0} Creative Credits berhasil ditambahkan.
              </p>
            </div>

            {/* Details Box */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-sm text-left space-y-2">
              <div className="flex justify-between items-center text-slate-400">
                <span>Paket</span>
                <span className="font-semibold text-white">{resultData?.package_name || '-'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Kredit Ditambahkan</span>
                <span className="font-semibold text-emerald-400">+{resultData?.credits_added} Credits</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 border-t border-slate-800 pt-2">
                <span>Total Saldo Kredit Baru</span>
                <span className="font-extrabold text-white text-base">{resultData?.new_balance} Credits</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                to="/dashboard/marketing/credits"
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 text-center text-sm"
              >
                Lihat Saldo Kredit
              </Link>
              <Link
                to="/dashboard/marketing/content-generator"
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors text-center text-sm"
              >
                Gunakan di Creative Studio
              </Link>
            </div>
          </div>
        )}

        {/* State 4: Already Used */}
        {status === 'already_used' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Link Sudah Digunakan</h2>
              <p className="text-sm text-slate-400">
                Link aktivasi ini sudah digunakan.
              </p>
            </div>
            <Link
              to="/dashboard/marketing/credits"
              className="inline-block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Cek Saldo di Dashboard
            </Link>
          </div>
        )}

        {/* State 5: Expired */}
        {status === 'expired' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Link Kedaluwarsa</h2>
              <p className="text-sm text-slate-400">
                Link aktivasi ini sudah kedaluwarsa.
              </p>
            </div>
            <Link
              to="/dashboard/marketing/credits"
              className="inline-block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Hubungi Admin untuk Link Baru
            </Link>
          </div>
        )}

        {/* State 6: Invalid */}
        {status === 'invalid' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Link Tidak Valid</h2>
              <p className="text-sm text-slate-400">
                Link aktivasi tidak valid.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        )}

        {/* State 7: Wrong Account */}
        {status === 'wrong_account' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Akun Tidak Sesuai</h2>
              <p className="text-sm text-slate-400">
                Link aktivasi ini bukan untuk akun Anda.
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Saat ini Anda login sebagai: <span className="font-mono text-slate-300">{user?.email}</span>
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/dashboard"
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-center text-sm"
              >
                Buka Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* State 8: Cancelled */}
        {status === 'cancelled' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Link Dibatalkan</h2>
              <p className="text-sm text-slate-400">
                Link aktivasi sudah dibatalkan.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        )}

        {/* Rate Limited */}
        {status === 'rate_limited' && (
          <div className="space-y-5 py-4">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Percobaan Dibatasi</h2>
              <p className="text-sm text-slate-400">
                {customMessage || 'Terlalu banyak percobaan gagal. Akun dibatasi sementara demi keamanan. Silakan coba lagi nanti.'}
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-block w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
