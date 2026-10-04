import React from 'react'
import { isChunkLoadError, canAutoReload, recordAutoReload, resetAutoReload } from '../lib/chunkRetry'

/**
 * Production-safe Global Error Boundary for BisnisSehat.
 * Catches unhandled React render errors and dynamic import chunk loading failures,
 * displaying a branded recovery screen instead of a blank page without leaking internals.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, isChunkError: false }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      isChunkError: isChunkLoadError(error),
    }
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[BisnisSehat ErrorBoundary] Uncaught render error:', error, errorInfo)
    }

    // Auto-recover from chunk load errors once if safe
    if (isChunkLoadError(error) && canAutoReload()) {
      recordAutoReload()
      window.location.reload()
    }
  }

  handleReload = () => {
    resetAutoReload()
    window.location.reload()
  }

  handleGoHome = () => {
    resetAutoReload()
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      const isChunk = this.state.isChunkError

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
            {isChunk ? 'Aplikasi baru saja diperbarui.' : 'Terjadi Kesalahan Aplikasi'}
          </h1>
          <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
            {isChunk
              ? 'Versi terbaru sistem telah dirilis. Silakan muat ulang halaman untuk melanjutkan.'
              : 'Halaman mengalami gangguan sesaat saat memuat data. Silakan muat ulang halaman atau kembali ke beranda.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-lg active:scale-95 ${
                isChunk
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {isChunk ? 'Muat Ulang' : 'Muat Ulang Halaman'}
            </button>
            {!isChunk && (
              <button
                onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors active:scale-95"
              >
                Kembali ke Beranda
              </button>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
