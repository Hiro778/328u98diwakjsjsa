import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { handleOAuthCallback } from '../../../lib/marketplaceService'

export default function MarketplaceCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [status, setStatus] = useState('processing') // 'processing' | 'success' | 'error'
  const [shopName, setShopName] = useState('')
  const [marketplace, setMarketplace] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    // Handle error from marketplace
    if (errorParam) {
      setStatus('error')
      setError(searchParams.get('error_description') || 'Otorisasi dibatalkan atau gagal.')
      return
    }

    // Handle missing params
    if (!code || !state) {
      setStatus('error')
      setError('Parameter callback tidak valid.')
      return
    }

    // Exchange code for tokens
    async function exchangeCode() {
      try {
        const result = await handleOAuthCallback(code, state)

        if (result.success) {
          setStatus('success')
          setShopName(result.shop_name || 'Toko')
          setMarketplace(result.marketplace || '')

          // Auto-redirect after 3 seconds
          setTimeout(() => {
            navigate('/dashboard/operasional/marketplace', { replace: true })
          }, 3000)
        } else {
          setStatus('error')
          setError(result.error || 'Gagal menghubungkan marketplace.')
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
              Sedang menghubungkan akun marketplace Anda...
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
            <h2 className="mt-6 text-lg font-bold text-navy-700">✅ {marketplace} berhasil terhubung!</h2>
            <div className="mt-3 rounded-xl bg-profit-50 border border-profit-200 p-4">
              <p className="text-sm text-profit-600">
                <span className="font-semibold">Toko:</span> {shopName}
              </p>
            </div>
            <p className="mt-4 text-sm text-text-secondary">
              Mengarahkan ke halaman Marketplace Integration...
            </p>
            <button
              onClick={() => navigate('/dashboard/operasional/marketplace', { replace: true })}
              className="mt-4 rounded-xl bg-profit-500 px-6 py-3 text-sm font-bold text-white hover:bg-profit-600"
            >
              Mulai Sinkronisasi
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
                onClick={() => navigate('/dashboard/operasional/marketplace', { replace: true })}
                className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-cream"
              >
                Kembali
              </button>
              <button
                onClick={() => navigate('/dashboard/operasional/marketplace', { replace: true })}
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
