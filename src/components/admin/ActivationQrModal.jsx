// src/components/admin/ActivationQrModal.jsx
// Displays newly generated PRO activation code and QR code ONCE.
// Strictly adheres to Context7 node-qrcode documentation and @act.md security requirements.

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { buildActivationUrl } from '../../lib/activationCodeService'

export default function ActivationQrModal({ codeData, onClose }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [renderError, setRenderError] = useState(null)

  const code = codeData?.code || ''
  const activationUrl = buildActivationUrl(code)

  useEffect(() => {
    if (!canvasRef.current || !activationUrl) return

    // Context7 compliant qrcode.toCanvas rendering
    QRCode.toCanvas(canvasRef.current, activationUrl, {
      width: 280,
      margin: 4, // 4 modules minimum quiet zone
      errorCorrectionLevel: 'M', // 15% error correction
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    }).catch((err) => {
      console.error('Failed to render activation QR canvas:', err)
      setRenderError('Gagal merender QR code pada canvas.')
    })
  }, [activationUrl])

  // Handle escape key
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      setCopied(false)
    }
  }

  const handleDownloadQr = async () => {
    try {
      setDownloading(true)
      // Context7 compliant qrcode.toDataURL for high-res download
      const dataUrl = await QRCode.toDataURL(activationUrl, {
        width: 600,
        margin: 4,
        errorCorrectionLevel: 'M',
      })

      const link = document.createElement('a')
      link.download = `QR-PRO-${code.replace(/[^a-zA-Z0-9]/g, '_')}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Download QR failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-xs">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h2 id="activation-modal-title" className="text-xl font-bold tracking-tight">
            Kode Aktivasi PRO Berhasil Dibuat
          </h2>
          <p className="text-emerald-100 text-xs mt-1">
            Masa Aktif: {codeData?.duration_days || 30} Hari
          </p>
        </div>

        {/* Security Warning Banner */}
        <div className="bg-amber-50 border-b border-amber-200 p-3.5 flex items-start gap-2.5 text-amber-900 text-xs">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-bold">PERINGATAN KEAMANAN:</span> Kode plaintext dan QR ini{' '}
            <strong className="underline">hanya dapat dilihat SEKALI</strong>. Setelah modal ini ditutup,
            database hanya menyimpan hash dan tidak dapat menampilkan kembali kode asli.
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* QR Code Canvas */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-2.5 sm:p-3 bg-white border-2 border-slate-200 rounded-xl shadow-inner flex items-center justify-center min-h-[220px] sm:min-h-[290px] w-full max-w-[290px]">
              {renderError ? (
                <div className="text-rose-600 text-xs text-center p-4">{renderError}</div>
              ) : (
                <canvas ref={canvasRef} className="block rounded-lg max-w-full h-auto" style={{ imageRendering: 'pixelated' }} />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Scan dengan kamera HP untuk otomatis mengisi halaman aktivasi PRO
            </p>
          </div>

          {/* Plaintext Code Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Plaintext Kode Aktivasi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={code}
                className="w-full font-mono text-sm tracking-wider font-bold bg-slate-100 border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 select-all focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-black text-white text-xs font-medium rounded-lg shrink-0 transition-colors shadow-xs flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Tersalin!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Salin
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={downloading}
              className="flex-1 py-2.5 px-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? 'Mengunduh...' : 'Unduh Gambar QR (PNG)'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Tutup & Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
