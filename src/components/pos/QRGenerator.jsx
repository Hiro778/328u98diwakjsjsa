import { useRef, useEffect } from 'react'
import QRCode from 'qrcode'

/**
 * QR Code generator component.
 * Generates a scannable QR code for the public menu URL.
 *
 * Props:
 * - url: string (the full absolute URL to encode)
 * - printSizeCm: number (print size in cm: 3, 4, or 5. Default 3)
 * - businessId: string (for download filename)
 * - tableName: string (label below QR)
 * - logoUrl: string (DEPRECATED — not used, kept for API compat)
 * - label: string (optional text under QR in export)
 * - downloadFilename: string (override download filename)
 */
export default function QRGenerator({
  url,
  printSizeCm = 3,
  businessId = '',
  tableName = '',
  logoUrl = '',
  label = '',
  downloadFilename = '',
}) {
  const canvasRef = useRef(null)

  // Fixed export resolution — always 900px for crisp print/download
  const EXPORT_SIZE = 900
  const MARGIN_MODULES = 4 // QR spec: minimum 4 modules quiet zone

  useEffect(() => {
    if (canvasRef.current && url) {
      generateQR()
    }
  }, [url])

  async function generateQR() {
    const canvas = canvasRef.current
    if (!canvas) return

    // --- Dev verification ---
    if (import.meta.env.DEV) {
      console.group('%c[QRGenerator] Dev Verification', 'color:#060812;font-weight:bold')
      console.log('Encoded URL:', url)
      console.log('URL valid:', /^https?:\/\/.+/.test(url))
      console.log('Canvas size:', `${EXPORT_SIZE}×${EXPORT_SIZE}`)
      console.log('Quiet zone:', `${MARGIN_MODULES} modules`)
      console.log('Error correction: H')
      console.groupEnd()
    }

    try {
      await QRCode.toCanvas(canvas, url, {
        width: EXPORT_SIZE,
        margin: MARGIN_MODULES,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      })
    } catch (err) {
      console.error('QR generation failed:', err)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
        ctx.fillStyle = '#999999'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Gagal generate QR', EXPORT_SIZE / 2, EXPORT_SIZE / 2)
      }
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return

    // Create export canvas with quiet zone padding + optional label
    const exportCanvas = document.createElement('canvas')
    const padding = 60
    const labelHeight = label ? 80 : 0
    exportCanvas.width = EXPORT_SIZE + padding * 2
    exportCanvas.height = EXPORT_SIZE + padding * 2 + labelHeight
    const ctx = exportCanvas.getContext('2d')

    // White background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)

    // Draw QR
    ctx.drawImage(canvas, padding, padding, EXPORT_SIZE, EXPORT_SIZE)

    // Draw label
    if (label) {
      ctx.fillStyle = '#000000'
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, exportCanvas.width / 2, EXPORT_SIZE + padding * 2 + 30)

      ctx.fillStyle = '#888888'
      ctx.font = '24px system-ui, -apple-system, sans-serif'
      ctx.fillText('Scan untuk melihat menu', exportCanvas.width / 2, EXPORT_SIZE + padding * 2 + 62)
    }

    // Trigger download
    const link = document.createElement('a')
    const filename = downloadFilename || (businessId ? `bisnis-sehat-qr-${businessId}.png` : 'QR-Menu.png')
    link.download = filename
    link.href = exportCanvas.toDataURL('image/png', 1.0)
    link.click()
  }

  function handlePrint() {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')

    const win = window.open('', '_blank')
    win.document.write(`
      <html>
        <head>
          <title>QR ${tableName || 'Menu'}</title>
          <style>
            @media print {
              body { margin: 0 !important; padding: 0 !important; }
              .no-print { display: none !important; }
            }
            @page { size: auto; margin: 10mm; }
          </style>
        </head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0;padding:20px;font-family:system-ui,sans-serif;background:#fff;">
          <img src="${dataUrl}" style="width:${printSizeCm}cm;height:${printSizeCm}cm;image-rendering:pixelated;" />
          <p class="no-print" style="margin-top:16px;font-size:12px;color:#888;">${tableName || 'Menu'} · ${printSizeCm} × ${printSizeCm} cm</p>
        </body>
      </html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Preview — responsive, always fits viewport */}
      <div className="flex w-full items-center justify-center">
        <canvas
          ref={canvasRef}
          className="block max-h-[55vh] w-auto rounded-xl border border-border bg-white p-3"
          style={{ maxWidth: 'min(70vw, 340px)', imageRendering: 'pixelated' }}
        />
      </div>

      {/* Size Label */}
      <p className="text-xs text-text-secondary">
        Ukuran cetak: <span className="font-semibold text-navy-700">{printSizeCm} × {printSizeCm} cm</span>
      </p>

      {/* Business Name */}
      {tableName && (
        <p className="text-sm font-bold text-navy-700">{tableName}</p>
      )}

      {/* Download + Print Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg bg-navy-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-navy-700 hover:shadow-md"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download QR
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-text-secondary transition-all hover:bg-cream"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
          Cetak QR
        </button>
      </div>
    </div>
  )
}
