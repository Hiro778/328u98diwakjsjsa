import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { handleOAuthCallback } from '../../../lib/googleBusinessService'

export default function GoogleBusinessCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState('processing') // 'processing' | 'success' | 'error' | 'needs_setup'
  const [locationCount, setLocationCount] = useState(0)
  const [accountName, setAccountName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    // Handle error from Google
    if (errorParam) {
      setStatus('error')
      setError(searchParams.get('error_description') || 'Otorisasi dibatalkan atau gagal.')
      return
    }

    if (!code || !state) {
      setStatus('error')
      setError('Parameter callback tidak valid.')
      return
    }

    async function exchangeCode() {
      try {
        const result = await handleOAuthCallback(code, state)

        if (result.success) {
          setStatus('success')
          setAccountName(result.account_name || '')
          setLocationCount(result.locations?.length || 0)

          setTimeout(() => {
            navigate('/dashboard/marketing/google-business-profile', { replace: true })
          }, 3000)
        } else if (result.status === 'needs_setup') {
          setStatus('needs_setup')
          setError(result.error || 'Konfigurasi belum lengkap.')
        } else {
          setStatus('error')
          setError(result.error || 'Gagal menghubungkan Google Business Profile.')
        }
      } catch (err) {
        setStatus('error')
        setError(err.message || 'Terjadi kesalahan saat memproses otorisasi.')
      }
    }

    exchangeCode()
  }, [searchParams, navigate])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm"
      >
        {status === 'processing' && (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-warm-200 border-t-warm-400" />
            <h2 className="mt-6 text-lg font-bold text-navy-700">Memproses Otorisasi</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Sedang menghubungkan Google Business Profile...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-profit-100">
              <svg className="h-8 w-8 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="mt-6 text-lg font-bold text-navy-700">Google Business Profile berhasil terhubung!</h2>
            {accountName && (
              <div className="mt-3 rounded-xl bg-profit-50 border border-profit-200 p-4">
                <p className="text-sm text-profit-600">
                  <span className="font-semibold">Akun:</span> {accountName}
                </p>
                {locationCount > 0 && (
                  <p className="text-sm text-profit-600">
                    <span className="font-semibold">Lokasi:</span> {locationCount} Business Profile ditemukan
                  </p>
                )}
              </div>
            )}
            <p className="mt-4 text-sm text-text-secondary">
              Mengarahkan ke dashboard...
            </p>
            <button
              onClick={() => navigate('/dashboard/marketing/google-business-profile', { replace: true })}
              className="mt-4 rounded-xl bg-profit-500 px-6 py-3 text-sm font-bold text-white hover:bg-profit-600"
            >
              Lihat Dashboard
            </button>
          </>
        )}

        {status === 'needs_setup' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warm-100">
              <svg className="h-8 w-8 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="mt-6 text-lg font-bold text-navy-700">Perlu Setup</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <button
              onClick={() => navigate('/dashboard/marketing/google-business-profile', { replace: true })}
              className="mt-4 rounded-xl bg-warm-400 px-6 py-3 text-sm font-bold text-white hover:bg-warm-500"
            >
              Kembali
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-6 text-lg font-bold text-navy-700">Koneksi Gagal</h2>
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => navigate('/dashboard/marketing/google-business-profile', { replace: true })}
                className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-cream"
              >
                Kembali
              </button>
              <button
                onClick={() => navigate('/dashboard/marketing/google-business-profile', { replace: true })}
                className="flex-1 rounded-xl bg-warm-400 px-4 py-3 text-sm font-bold text-white hover:bg-warm-500"
              >
                Coba Lagi
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
