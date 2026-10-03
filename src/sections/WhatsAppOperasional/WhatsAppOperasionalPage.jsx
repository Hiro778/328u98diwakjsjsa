import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { getConnectionStatus, checkConnectorHealth, initiateConnection, disconnectConnection, listenForUpdates, requestPairingCode } from '../../lib/whatsappService'
import { generateQrDataUrl, logQrDiagnostic } from '../../lib/whatsappQrHelper'
import BackButton from '../../components/BackButton'

function formatDate(dateStr) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

const STATUS_CONFIG = {
  disconnected: {
    label: 'Belum Terhubung',
    color: 'bg-navy-50 text-navy-300',
    dotColor: 'bg-navy-300',
    description: 'Hubungkan WhatsApp untuk memulai menerima pesanan.',
  },
  connecting: {
    label: 'Menghubungkan...',
    color: 'bg-warm-100 text-warm-600',
    dotColor: 'bg-warm-400',
    description: 'Menghubungkan ke server WhatsApp...',
  },
  reconnecting: {
    label: 'Menyambungkan Ulang...',
    color: 'bg-warm-100 text-warm-600',
    dotColor: 'bg-warm-400',
    description: 'Koneksi sementara terputus. WhatsApp sedang menyambungkan ulang.',
  },
  qr: {
    label: 'Scan QR Code',
    color: 'bg-orange-100 text-orange-600',
    dotColor: 'bg-orange-400',
    description: 'Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat',
  },
  connected: {
    label: 'Terhubung',
    color: 'bg-profit-100 text-profit-600',
    dotColor: 'bg-profit-500',
    description: 'WhatsApp aktif dan siap menerima pesanan.',
  },
  error: {
    label: 'Koneksi Bermasalah',
    color: 'bg-red-100 text-red-600',
    dotColor: 'bg-red-500',
    description: 'Terjadi kesalahan pada koneksi.',
  },
}

export default function WhatsAppOperasionalPage() {
  const { business } = useAuth()

  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrLoadError, setQrLoadError] = useState(false)
  const [connectorAvailable, setConnectorAvailable] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [pairingError, setPairingError] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [wsConnectionStatus, setWsConnectionStatus] = useState('disconnected')

  const wsRef = useRef(null)
  const qrExpireTimerRef = useRef(null)

  // ── Clear QR State ──
  const clearQrState = useCallback(() => {
    if (qrExpireTimerRef.current) {
      clearTimeout(qrExpireTimerRef.current)
      qrExpireTimerRef.current = null
    }
    setQrDataUrl(null)
    setQrExpired(false)
    setQrLoading(false)
    setQrLoadError(false)
  }, [])

  // ── Handle Incoming QR Payload (Baileys string / DataURL / Base64) ──
  const handleIncomingQr = useCallback(async (rawQr) => {
    if (!rawQr) return

    if (qrExpireTimerRef.current) {
      clearTimeout(qrExpireTimerRef.current)
      qrExpireTimerRef.current = null
    }

    setQrLoading(true)
    setQrExpired(false)
    setQrLoadError(false)

    try {
      const dataUrl = await generateQrDataUrl(rawQr)
      if (dataUrl) {
        setQrDataUrl(dataUrl)
        setQrExpired(false)
        setQrLoadError(false)

        // QR from Baileys typically valid for ~60s
        qrExpireTimerRef.current = setTimeout(() => {
          logQrDiagnostic('qr_timer_expired', rawQr, null)
          setQrExpired(true)
          setQrDataUrl(null)
        }, 60000)
      } else {
        setQrLoadError(true)
        setQrDataUrl(null)
      }
    } catch (err) {
      console.error('[QR] Failed to process QR payload:', err?.message || err)
      setQrLoadError(true)
      setQrDataUrl(null)
    } finally {
      setQrLoading(false)
    }
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (qrExpireTimerRef.current) {
        clearTimeout(qrExpireTimerRef.current)
      }
    }
  }, [])

  // ── Load status ──
  const loadStatus = useCallback(async (showLoadingSpinner = true) => {
    const id = business?.id
    if (!id) {
      setLoading(false)
      return
    }
    if (showLoadingSpinner) setLoading(true)
    setError(null)

    try {
      const [data, isHealthy] = await Promise.all([
        getConnectionStatus(id),
        checkConnectorHealth()
      ])

      const isAvailable = Boolean(isHealthy || data?.connectorAvailable)
      setConnectorAvailable(isAvailable)

      if (data && isAvailable) {
        const effectiveStatus = data.status === 'syncing' ? 'connected' : data.status
        setStatus(prev => ({
          ...prev,
          ...data,
          status: effectiveStatus,
          connected: effectiveStatus === 'connected'
        }))
        setSyncing(Boolean(data.syncing))
        setPhoneNumber(data.phoneNumber || '')
        if (effectiveStatus === 'qr' && data.qrcode) {
          handleIncomingQr(data.qrcode)
        } else if (effectiveStatus !== 'qr') {
          clearQrState()
        }
      }
    } catch {
      // Keep existing state on transient check failure
    } finally {
      if (showLoadingSpinner) setLoading(false)
    }
  }, [business?.id, handleIncomingQr, clearQrState])

  useEffect(() => {
    loadStatus(true)
  }, [loadStatus])

  // ── WebSocket listener ──
  // Dependency: business?.id (primitive string) — NOT the business object.
  useEffect(() => {
    const id = business?.id
    if (!id) return

    let active = true
    let wsReconnectTimeout = null

    function connectWs() {
      if (!active) return

      // Close any previous socket
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'Replaced by listener') } catch {}
        wsRef.current = null
      }

      console.log(`[WS] OPEN businessId=${id}`)

      function onQr(qrData) {
        if (!active) return
        setPairingCode(null)
        setStatus(prev => ({ ...prev, status: 'qr', connected: false }))
        handleIncomingQr(qrData)
      }

      function onQrExpired() {
        if (!active) return
        setQrExpired(true)
        setQrDataUrl(null)
      }

      function onStatus(newStatus, phone, extra) {
        if (!active) return
        const effectiveStatus = newStatus === 'syncing' ? 'connected' : newStatus
        setStatus(prev => ({ ...prev, status: effectiveStatus, connected: effectiveStatus === 'connected' }))
        if (typeof extra?.syncing === 'boolean') {
          setSyncing(extra.syncing)
        } else if (effectiveStatus === 'disconnected' || effectiveStatus === 'reconnecting') {
          setSyncing(false)
        }
        if (phone) setPhoneNumber(phone)
        if (effectiveStatus === 'connected') {
          setSuccess('WhatsApp berhasil terhubung!')
          clearQrState()
          setPairingCode(null)
        }
        if (effectiveStatus === 'disconnected' || effectiveStatus === 'reconnecting') {
          clearQrState()
          setPairingCode(null)
        }
      }

      function onError(msg) {
        if (!active) return
        setError(msg)
      }

      function onPairingCode(code) {
        if (!active) return
        setPairingCode(code)
        setPairingLoading(false)
        setPairingError(null)
      }

      function onPairingCodeError(msg) {
        if (!active) return
        setPairingError(msg)
        setPairingLoading(false)
      }

      function onWsStateChange(wsState, code) {
        if (!active) return
        if (wsState === 'connected') {
          setWsConnectionStatus('connected')
          setConnectorAvailable(true)
        } else if (wsState === 'disconnected') {
          setWsConnectionStatus('reconnecting')
          // Reconcile status via HTTP GET /status; NEVER call POST /connect here
          loadStatus(false)
          // Reconnect WS transport with delay
          if (active && !wsReconnectTimeout) {
            wsReconnectTimeout = setTimeout(() => {
              wsReconnectTimeout = null
              if (active) connectWs()
            }, 3000)
          }
        }
      }

      try {
        wsRef.current = listenForUpdates(id, {
          onQr, onStatus, onError, onPairingCode, onPairingCodeError, onQrExpired, onWsStateChange
        })
      } catch {
        console.debug('[WS] WebSocket creation failed')
      }
    }

    connectWs()

    return () => {
      active = false
      if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout)
        wsReconnectTimeout = null
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted')
        wsRef.current = null
      }
    }
  }, [business?.id, handleIncomingQr, clearQrState, loadStatus])

  // ── Auto-clear messages ──
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => { setError(null); setSuccess(null) }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  // ── Connect ──
  async function handleConnect() {
    if (!business?.id) {
      setError('Business ID tidak ditemukan')
      return
    }
    if (connecting || disconnecting) return
    console.log('[WA] CONNECT BUTTON CLICKED')
    setConnecting(true)
    setError(null)
    setPairingError(null)

    // Reconcile before asking the connector to connect. A persisted database
    // row is not treated as connected; only the connector's live socket is.
    const liveStatus = await getConnectionStatus(business.id)
    if (liveStatus) {
      const effectiveStatus = liveStatus.status === 'syncing' ? 'connected' : liveStatus.status
      setStatus(prev => ({ ...prev, ...liveStatus, status: effectiveStatus, connected: effectiveStatus === 'connected' }))
      setSyncing(Boolean(liveStatus.syncing))
      setConnectorAvailable(liveStatus.connectorAvailable)
      if (effectiveStatus === 'connected' || effectiveStatus === 'reconnecting') {
        clearQrState()
        setPairingCode(null)
      }
      if (effectiveStatus === 'connected') {
        setSuccess('WhatsApp sudah terhubung.')
        setConnecting(false)
        return
      }
      if (effectiveStatus === 'connecting' || effectiveStatus === 'reconnecting') {
        setSuccess('WhatsApp sedang menyambungkan...')
        setConnecting(false)
        return
      }
    }

    console.log('[WA] calling POST /connect')
    const result = await initiateConnection(business.id)
    console.log('[WA] POST /connect returned', result.success ? 'OK' : result.error)

    if (result.success) {
      if (result.status === 'connected') {
        setSuccess('WhatsApp sudah terhubung.')
      } else if (result.status === 'reconnecting') {
        setSuccess('WhatsApp sedang menyambungkan ulang.')
      } else if (result.status === 'qr') {
        setSuccess('QR Code siap dipindai.')
      } else {
        setSuccess('WhatsApp connector aktif. Menunggu QR code...')
      }
    } else {
      setError(result.error || 'Gagal memulai koneksi')
    }

    setConnecting(false)
  }

  // ── Disconnect ──
  async function handleDisconnect() {
    if (!business?.id) return
    setDisconnecting(true)
    setShowDisconnectModal(false)

    const result = await disconnectConnection(business.id)

    if (result.success) {
      setSuccess('WhatsApp telah diputuskan.')
      setStatus({ status: 'disconnected', connected: false })
      setSyncing(false)
      clearQrState()
      setPhoneNumber('')
      setPairingCode(null)
      setPairingPhone('')
    } else {
      setError(result.error || 'Gagal memutuskan koneksi')
    }

    setDisconnecting(false)
  }

  // ── Pairing Code ──
  function handleRequestPairingCode() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setPairingError('Koneksi WebSocket tidak aktif. Muat ulang halaman.')
      return
    }
    // Normalize phone: strip non-digits, convert 08... to 628...
    let digits = pairingPhone.replace(/\D/g, '')
    if (digits.startsWith('0')) digits = '62' + digits.slice(1)
    if (digits.length < 10 || digits.length > 15) {
      setPairingError('Nomor telepon tidak valid. Gunakan format internasional (contoh: 6281234567890).')
      return
    }
    setPairingLoading(true)
    setPairingError(null)
    setPairingCode(null)
    requestPairingCode(wsRef.current, digits)
  }

  async function handleCopyPairingCode() {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Fallback: select text
      const el = document.getElementById('pairing-code-display')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }
  }

  // ── Derived state ──
  const rawStatus = status?.status || 'disconnected'
  const currentStatus = rawStatus === 'syncing' ? 'connected' : rawStatus
  const isConnected = currentStatus === 'connected'
  // Only block button when OUR connect is in progress (not stale server status)
  const isConnecting = connecting || currentStatus === 'reconnecting'
  const isQr = currentStatus === 'qr'
  const statusConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.disconnected

  return (
    <div>
      <BackButton fallbackUrl="/dashboard/operasional" label="Kembali" />
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-warm-400">
          Operasional
        </p>
        <h1 className="text-2xl font-extrabold text-navy-700">WhatsApp Operasional</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Hubungkan WhatsApp untuk mengelola pesanan dan pelanggan.
        </p>
      </motion.div>

      {/* Error/Success Messages */}
      {(error || success) && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-4 rounded-xl p-4 text-sm font-medium ${
            error ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-profit-50 text-profit-600 border border-profit-200'
          }`}
        >
          {error || success}
        </motion.div>
      )}

      {/* Connector Unavailable Warning */}
      {!loading && !connectorAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 rounded-2xl border border-warm-200 bg-warm-50 p-6"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-100">
              <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-navy-700">WhatsApp Connector Service Tidak Tersedia</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Fitur WhatsApp memerlukan Node.js service berjalan secara terpisah.
                Pastikan WhatsApp connector berjalan atau hubungi admin.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Connection Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className={`mt-6 rounded-2xl border p-6 transition-all ${
          isConnected
            ? 'border-profit-200 bg-profit-50'
            : currentStatus === 'error'
              ? 'border-red-200 bg-red-50'
              : isQr
                ? 'border-orange-200 bg-orange-50'
                : 'border-border bg-surface'
        }`}
      >
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366] text-white">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy-700">WhatsApp Business</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`h-2 w-2 rounded-full ${statusConfig.dotColor}`} />
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {isConnected && syncing && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warm-100 px-2.5 py-0.5 text-[11px] font-medium text-warm-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warm-500" />
                    Sinkronisasi...
                  </span>
                )}
                {isConnected && wsConnectionStatus === 'reconnecting' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                    Menjaga koneksi...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Description */}
        <p className="mt-3 text-sm text-text-secondary">{statusConfig.description}</p>

        {/* QR Code Display */}
        {isQr && (
          <div className="mt-4 rounded-xl bg-white p-6 text-center shadow-sm">
            <p className="text-xs font-semibold text-text-muted uppercase">Scan QR Code</p>
            <p className="mt-2 text-sm text-text-secondary">
              WhatsApp &rarr; Perangkat Tertaut &rarr; Tautkan Perangkat
            </p>

            {qrExpired ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-6">
                <p className="text-sm font-semibold text-warm-700">
                  QR Code telah kedaluwarsa. Klik Hubungkan ulang.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#20BD5A] disabled:opacity-50"
                >
                  Hubungkan Ulang
                </button>
              </div>
            ) : qrLoadError ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6">
                <p className="text-sm font-semibold text-red-600">
                  Gagal memuat gambar QR Code.
                </p>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#20BD5A] disabled:opacity-50"
                >
                  Coba Lagi
                </button>
              </div>
            ) : qrDataUrl ? (
              <div className="mt-4 flex justify-center">
                <img
                  src={qrDataUrl}
                  alt="WhatsApp QR Code"
                  onError={() => {
                    console.warn('[QR] Image failed to render')
                    setQrLoadError(true)
                  }}
                  className="rounded-lg border border-border shadow-sm"
                  style={{ maxWidth: '256px', width: '100%' }}
                />
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center p-8">
                <svg className="mb-2 h-8 w-8 animate-spin text-warm-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm font-medium text-text-secondary">Menyiapkan QR Code...</p>
              </div>
            )}

            <p className="mt-3 text-xs text-text-muted">QR berlaku ~60 detik. Jika expired, klik Hubungkan ulang.</p>
          </div>
        )}

        {/* Pairing Code Section - show when QR is active (not connected) */}
        {isQr && !isConnected && (
          <div className="mt-4 rounded-xl bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-text-muted">ATAU</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {!pairingCode ? (
              <>
                <p className="text-sm font-semibold text-navy-700 mb-3">Gunakan Pairing Code</p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={pairingPhone}
                    onChange={(e) => { setPairingPhone(e.target.value); setPairingError(null) }}
                    placeholder="6281234567890"
                    className="flex-1 rounded-xl border border-border bg-cream/50 px-4 py-2.5 text-sm text-navy-700 placeholder:text-text-muted focus:border-warm-400 focus:outline-none focus:ring-1 focus:ring-warm-400"
                  />
                  <button
                    onClick={handleRequestPairingCode}
                    disabled={pairingLoading || !pairingPhone.trim()}
                    className="shrink-0 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#20BD5A] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pairingLoading ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : 'Dapatkan Kode'}
                  </button>
                </div>
                {pairingError && (
                  <p className="mt-2 text-xs text-red-500">{pairingError}</p>
                )}
                <p className="mt-2 text-[11px] text-text-muted">
                  Nomor harus dalam format internasional. Contoh Indonesia: 6281234567890
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-navy-700 mb-2">Pairing Code</p>
                <div className="flex items-center gap-3">
                  <div
                    id="pairing-code-display"
                    className="flex-1 rounded-xl border-2 border-dashed border-[#25D366] bg-[#25D366]/5 px-4 py-3 text-center"
                  >
                    <span className="text-xl font-extrabold tracking-[0.2em] text-navy-700">
                      {pairingCode}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyPairingCode}
                    className="shrink-0 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-navy-700 transition-all hover:bg-cream"
                  >
                    {copySuccess ? '✓ Tersalin' : 'Salin'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-text-secondary">
                  Buka WhatsApp di HP &rarr; Perangkat Tertaut &rarr; Tautkan dengan nomor telepon &rarr; Masukkan kode di atas.
                </p>
                <button
                  onClick={() => { setPairingCode(null); setPairingLoading(false) }}
                  className="mt-2 text-xs font-semibold text-warm-500 hover:text-warm-600"
                >
                  Minta kode baru
                </button>
              </>
            )}
          </div>
        )}

        {/* Connection Details (when connected) */}
        {isConnected && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-white/60 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-text-muted">Nomor Telepon</p>
                  <p className="mt-1 text-sm font-semibold text-navy-700">{phoneNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-muted">Status</p>
                  <p className="mt-1 text-sm font-semibold text-profit-600">Aktif</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Details */}
        {currentStatus === 'error' && status?.lastError && (
          <div className="mt-4 rounded-xl bg-red-100/60 p-4">
            <p className="text-xs font-semibold text-red-600">Detail Error</p>
            <p className="mt-1 text-sm text-red-500">{status.lastError}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          {isConnected ? (
            <>
              <button
                onClick={loadStatus}
                className="flex-1 rounded-xl border border-profit-200 bg-white px-4 py-3 text-sm font-semibold text-profit-600 transition-all hover:bg-profit-50"
              >
                Refresh Status
              </button>
              <button
                onClick={() => setShowDisconnectModal(true)}
                disabled={disconnecting}
                className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 disabled:opacity-50"
              >
                {disconnecting ? 'Memutuskan...' : 'Putuskan WhatsApp'}
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex-1 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white transition-all hover:shadow-md hover:bg-[#20BD5A] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Menghubungkan...
                </span>
              ) : isQr ? (
                'Tampilkan QR Ulang'
              ) : (
                'Hubungkan WhatsApp'
              )}
            </button>
          )}
        </div>
      </motion.div>

      {/* Panduan Cara Menggunakan WhatsApp - Tampil saat WhatsApp terhubung */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit-100 text-profit-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-700">Cara Menggunakan WhatsApp</h3>
              <p className="text-xs text-text-secondary">Pencatatan operasional kini dilakukan langsung melalui chat WhatsApp</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-cream/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white">
                  1
                </span>
                <h4 className="text-sm font-semibold text-navy-700">Kirim /hai</h4>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Kirim <code className="rounded bg-navy-100 px-1.5 py-0.5 font-mono text-navy-800 font-semibold">/hai</code> ke nomor WhatsApp yang terhubung.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-cream/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white">
                  2
                </span>
                <h4 className="text-sm font-semibold text-navy-700">Pilih Layanan</h4>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Pilih <strong>AI BisnisSehat</strong> atau <strong>Formulir Operasional</strong>.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-cream/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-bold text-white">
                  3
                </span>
                <h4 className="text-sm font-semibold text-navy-700">Isi Formulir di Chat</h4>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                Formulir diisi langsung melalui chat WhatsApp. Data otomatis tersimpan ke sistem.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-profit-200 bg-profit-50/50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-profit-600 font-bold mt-0.5">✓</span>
              <p className="text-xs text-profit-800 leading-relaxed">
                <span className="font-semibold">Operasional Terintegrasi:</span> Catat produk, stok, supplier, pelanggan, penjualan, pengeluaran, dan pelunasan invoice langsung dari smartphone Anda tanpa perlu membuka form di web.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Info Section - Show when not connected and not loading */}
      {!isConnected && !isQr && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 space-y-6"
        >
          {/* Cara Menggunakan WhatsApp (Preview) */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit-100 text-profit-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-navy-700">Cara Menggunakan WhatsApp</h3>
                <p className="text-xs text-text-secondary">Setelah terhubung, Anda dapat mencatat operasional langsung dari chat</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-cream/30 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[11px] font-bold text-white">
                    1
                  </span>
                  <h4 className="text-xs font-semibold text-navy-700">Kirim /hai</h4>
                </div>
                <p className="text-xs text-text-secondary">
                  Kirim <code className="rounded bg-navy-100 px-1 py-0.5 font-mono text-[11px] text-navy-800 font-semibold">/hai</code> ke nomor WhatsApp yang terhubung.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-cream/30 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[11px] font-bold text-white">
                    2
                  </span>
                  <h4 className="text-xs font-semibold text-navy-700">Pilih Layanan</h4>
                </div>
                <p className="text-xs text-text-secondary">
                  Pilih AI BisnisSehat atau Formulir Operasional.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-cream/30 p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[11px] font-bold text-white">
                    3
                  </span>
                  <h4 className="text-xs font-semibold text-navy-700">Isi di Chat</h4>
                </div>
                <p className="text-xs text-text-secondary">
                  Formulir diisi langsung melalui chat WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-lg font-bold text-navy-700">Apa yang Bisa Dilakukan?</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Feature icon="chat" color="#25D366" title="Terima Pesan" desc="Terima pesan WhatsApp pelanggan secara real-time" />
              <Feature icon="bolt" color="#F97316" title="Respon Cepat" desc="Balas pesan dengan cepat dari dashboard" />
              <Feature icon="chart" color="#6366F1" title="Lacak Pesanan" desc="Monitor status pesanan dari WhatsApp" />
              <Feature icon="lock" color="#10B981" title="Aman & Privat" desc="Data tersimpan aman, hanya Anda yang bisa akses" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="mt-6 flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-text-muted">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Memuat status koneksi...</span>
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-navy-700">Putuskan Koneksi?</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Setelah diputuskan, WhatsApp tidak akan bisa menerima pesan.
              Anda perlu menghubungkan ulang (scan QR) untuk menggunakan fitur ini lagi.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-navy-700 transition-all hover:bg-cream"
              >
                Batal
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {disconnecting ? 'Memutuskan...' : 'Ya, Putuskan'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ── Feature Card ──
function Feature({ color, title, desc }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}15` }}>
        <div className="h-5 w-5 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-navy-700">{title}</h4>
        <p className="text-sm text-text-secondary">{desc}</p>
      </div>
    </div>
  )
}
