import React from 'react'

/**
 * Production-safe Global Error Boundary for BisnisSehat.
 * Catches unhandled React render errors and displays a branded recovery screen
 * instead of a blank page, without leaking sensitive internals or stack traces.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[BisnisSehat ErrorBoundary] Uncaught render error:', error, errorInfo)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F19] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-6 text-2xl text-amber-400">
            ⚠️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Terjadi Kesalahan Aplikasi
          </h1>
          <p className="text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
            Halaman mengalami gangguan sesaat saat memuat data. Silakan muat ulang halaman atau kembali ke beranda.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              Muat Ulang Halaman
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors active:scale-95"
            >
              Kembali ke Beranda
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
