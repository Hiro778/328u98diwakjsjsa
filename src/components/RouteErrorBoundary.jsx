import { useRouteError, useNavigate } from 'react-router'
import { isChunkLoadError, canAutoReload, recordAutoReload, resetAutoReload } from '../lib/chunkRetry'

/**
 * RouteErrorBoundary
 * Handles route-level render and async exceptions gracefully.
 * Prevents unhelpful default "Unexpected Application Error!" screens and leaks zero stack traces.
 */
export default function RouteErrorBoundary() {
  const error = useRouteError()
  const navigate = useNavigate()

  const isChunk = isChunkLoadError(error)

  if (isChunk && canAutoReload()) {
    recordAutoReload()
    window.location.reload()
    return null
  }

  const handleReload = () => {
    resetAutoReload()
    window.location.reload()
  }

  const handleGoHome = () => {
    resetAutoReload()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-2xl ${
          isChunk
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
        }`}
      >
        {isChunk ? '⚡' : '⚠️'}
      </div>
      <p className="text-xs font-semibold tracking-wider uppercase text-emerald-400 mb-2">
        BisnisSehat
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
        {isChunk ? 'Aplikasi baru saja diperbarui.' : 'Halaman Mengalami Kendala'}
      </h1>
      <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
        {isChunk
          ? 'Versi terbaru sistem telah dirilis. Silakan muat ulang halaman untuk melanjutkan.'
          : 'Terjadi kendala saat memuat data halaman. Silakan muat ulang halaman atau kembali ke beranda.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleReload}
          className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/20 transition-colors active:scale-95 cursor-pointer"
        >
          Muat Ulang Halaman
        </button>
        <button
          type="button"
          onClick={handleGoHome}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors active:scale-95 cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </div>
    </div>
  )
}
