import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import {
  getTelegramStatus,
  connectTelegramBot,
  generatePairingCode,
  sendTelegramTestMessage,
  updateTelegramPreferences,
  disconnectTelegram,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../../../services/telegramOperasionalClient'

export default function TelegramOperasionalPage() {
  const { business, user } = useAuth()
  const businessId = business?.id || user?.id

  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [statusData, setStatusData] = useState({
    isConfigured: false,
    isConnected: false,
    status: 'disconnected',
    botUsername: null,
    botFirstName: null,
    chatId: null,
    chatTitle: null,
    maskedToken: null,
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  })

  // Connect form state
  const [botTokenInput, setBotTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState(null)

  // Pairing state
  const [pairingCode, setPairingCode] = useState(null)
  const [generatingPairing, setGeneratingPairing] = useState(false)
  const [copiedPairing, setCopiedPairing] = useState(false)

  // Preferences & Test message state
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  // Disconnect confirmation modal
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    if (businessId) {
      loadStatus()
    }
  }, [businessId])

  async function loadStatus() {
    setLoading(true)
    try {
      const data = await getTelegramStatus(businessId)
      setStatusData(data)
      setPreferences(data.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES)

      // If configured but not connected, generate or fetch a pairing code
      if (data.isConfigured && !data.isConnected && !pairingCode) {
        handleCreatePairingCode()
      }
    } catch (err) {
      console.error('[TelegramOperasionalPage] Failed to load status:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect(e) {
    e.preventDefault()
    if (!botTokenInput.trim()) return

    setConnecting(true)
    setConnectError(null)

    try {
      await connectTelegramBot({
        businessId,
        botToken: botTokenInput.trim(),
      })

      showToast('Bot Telegram berhasil diverifikasi!', 'success')
      setBotTokenInput('')
      await loadStatus()
    } catch (err) {
      setConnectError(err.message || 'Bot Token tidak valid. Periksa token dari @BotFather.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleCreatePairingCode() {
    setGeneratingPairing(true)
    try {
      const res = await generatePairingCode(businessId)
      setPairingCode(res.pairingCode)
    } catch (err) {
      console.error('Failed to generate pairing code:', err)
    } finally {
      setGeneratingPairing(false)
    }
  }

  const handleCopyPairingCode = () => {
    if (!pairingCode) return
    navigator.clipboard.writeText(pairingCode)
    setCopiedPairing(true)
    setTimeout(() => setCopiedPairing(false), 2000)
  }

  async function handleSendTestMessage() {
    setSendingTest(true)
    try {
      const res = await sendTelegramTestMessage(businessId)
      showToast(res.message || 'Pesan tes berhasil dikirim.', 'success')
    } catch (err) {
      showToast(err.message || 'Gagal mengirim pesan tes.', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  async function handleSavePreferences() {
    setSavingPrefs(true)
    try {
      await updateTelegramPreferences(businessId, preferences)
      showToast('Preferensi notifikasi berhasil disimpan.', 'success')
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan preferensi notifikasi.', 'error')
    } finally {
      setSavingPrefs(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await disconnectTelegram(businessId)
      showToast('Integrasi Telegram berhasil diputuskan.', 'success')
      setShowDisconnectModal(false)
      setPairingCode(null)
      await loadStatus()
    } catch (err) {
      showToast(err.message || 'Gagal memutuskan Telegram.', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  const isFullyConnected = statusData.isConnected && statusData.chatId

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto">
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />

      <BackButton fallbackUrl="/dashboard/operasional" label="Kembali" />

      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <Link to="/dashboard/operasional" className="hover:text-text-primary">
              Operasional
            </Link>
            <span>/</span>
            <span className="text-text-secondary font-medium">Telegram Operasional</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-text-primary">
              Telegram Operasional
            </h1>
            {isFullyConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-500 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ● Siap Digunakan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-500 border border-amber-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                ● Perlu Konfigurasi
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Terima notifikasi order baru, status pesanan, dan peringatan stok langsung melalui Telegram Bot resmi.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* STATE 1: NOT CONFIGURED (DISCONNECTED) */}
          {!statusData.isConfigured && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Instructions */}
              <div className="lg:col-span-6 rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-text-primary">Panduan Menghubungkan Bot</h2>
                    <p className="text-[11px] text-text-muted">Buat bot gratis di Telegram menggunakan @BotFather</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-text-secondary">
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      1
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">Buka aplikasi Telegram</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Pastikan Anda telah masuk ke akun Telegram Anda di ponsel atau desktop.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      2
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">Cari @BotFather</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Ketik <code>@BotFather</code> di pencarian Telegram atau buka{' '}
                        <a
                          href="https://t.me/BotFather"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          t.me/BotFather
                        </a>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      3
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">Buat bot dengan /newbot</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Kirim perintah <code>/newbot</code>, lalu masukkan nama bot dan username (berakhiran <code>bot</code>).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      4
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">Salin Bot Token</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        BotFather akan memberikan token seperti <code>123456789:ABCdefGHIjklMNO...</code>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      5
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">Masukkan token pada form di samping</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Token akan diverifikasi langsung ke server Telegram Bot API resmi.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Token Input Form */}
              <div className="lg:col-span-6 rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <h2 className="text-sm font-bold text-text-primary mb-1">Hubungkan Bot Telegram</h2>
                <p className="text-xs text-text-secondary mb-4">
                  Masukkan Bot Token resmi untuk menghubungkan toko Anda.
                </p>

                {connectError && (
                  <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                    {connectError}
                  </div>
                )}

                <form onSubmit={handleConnect} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1.5">
                      Bot Token <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        required
                        placeholder="Contoh: 123456789:AAEd88..."
                        value={botTokenInput}
                        onChange={(e) => setBotTokenInput(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface py-2.5 pl-3.5 pr-10 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
                      >
                        {showToken ? 'Sembunyikan' : 'Lihat'}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">
                      🔒 Token disimpan secara aman di server dan tidak pernah diekspos utuh ke browser.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={connecting || !botTokenInput.trim()}
                    className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-60 transition-colors cursor-pointer shadow-xs"
                  >
                    {connecting ? 'Memverifikasi Bot API...' : 'Verifikasi & Hubungkan'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* STATE 2: CONFIGURED BUT NOT PAIRED (WAITING FOR CHAT_ID VIA PAIRING CODE) */}
          {statusData.isConfigured && !statusData.isConnected && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-base font-bold text-text-primary">
                    Bot Terverifikasi: @{statusData.botUsername || 'Bot'}
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Nama Bot: <strong>{statusData.botFirstName}</strong> • Token:{' '}
                    <code>{statusData.maskedToken}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(true)}
                  className="self-start sm:self-auto text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  Ganti Bot
                </button>
              </div>

              {/* Pairing instructions */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[11px]">
                    !
                  </span>
                  Langkah Terakhir: Hubungkan Chat Anda
                </div>
                <p className="text-text-secondary text-[11px]">
                  Agar bot dapat mengirimkan notifikasi ke Anda, kirimkan <strong>Kode Pairing</strong> di bawah ini ke bot Telegram Anda:
                </p>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-border bg-surface px-5 py-3 font-mono text-xl font-black tracking-widest text-primary">
                    {pairingCode || (generatingPairing ? 'MEMUAT...' : 'BS-••••••')}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPairingCode}
                    className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    {copiedPairing ? '✓ Tersalin!' : 'Salin Kode'}
                  </button>
                </div>

                <div className="space-y-1 text-[11px] text-text-muted">
                  <p>1. Buka bot Anda di Telegram: <a href={`https://t.me/${statusData.botUsername}`} target="_blank" rel="noreferrer" className="text-primary hover:underline font-bold">@{statusData.botUsername}</a></p>
                  <p>2. Tekan tombol <strong>Start</strong></p>
                  <p>3. Kirimkan kode <strong>{pairingCode || 'pairing'}</strong> sebagai pesan</p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={loadStatus}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover transition-colors cursor-pointer shadow-xs"
                  >
                    Periksa Status Sambungan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE 3: FULLY CONNECTED */}
          {isFullyConnected && (
            <div className="space-y-6">
              {/* Connection Status Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-text-primary">
                        Bot Terhubung: @{statusData.botUsername}
                      </h2>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Terkoneksi ke Chat: <strong>{statusData.chatTitle || statusData.chatId}</strong> (ID: <code>{statusData.chatId}</code>)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSendTestMessage}
                      disabled={sendingTest}
                      className="rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-text-primary hover:bg-surface-hover transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                    >
                      {sendingTest ? 'Mengirim...' : 'Kirim Pesan Tes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisconnectModal(true)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer shadow-xs"
                    >
                      Putuskan Telegram
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl border border-border bg-surface-hover p-3">
                    <span className="text-[11px] text-text-muted">Username Bot</span>
                    <p className="font-bold text-text-primary mt-0.5">@{statusData.botUsername}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-hover p-3">
                    <span className="text-[11px] text-text-muted">Token Tersimpan</span>
                    <p className="font-mono text-text-primary mt-0.5">{statusData.maskedToken}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-hover p-3">
                    <span className="text-[11px] text-text-muted">Status Sambungan</span>
                    <p className="font-bold text-emerald-500 mt-0.5">Aktif (Realtime Webhook)</p>
                  </div>
                </div>
              </div>

              {/* Notification Preferences Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
                <h3 className="text-sm font-bold text-text-primary mb-1">
                  Pengaturan Notifikasi Operasional
                </h3>
                <p className="text-xs text-text-secondary mb-4">
                  Pilih jenis event operasional toko yang ingin Anda terima di Telegram:
                </p>

                <div className="space-y-3 border-b border-border pb-4 mb-4">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-hover cursor-pointer">
                    <div>
                      <p className="text-xs font-bold text-text-primary">Order Baru</p>
                      <p className="text-[11px] text-text-muted">Kirim notifikasi setiap ada transaksi masuk dari POS atau QR Menu</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.new_order}
                      onChange={(e) =>
                        setPreferences({ ...preferences, new_order: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-hover cursor-pointer">
                    <div>
                      <p className="text-xs font-bold text-text-primary">Perubahan Status Order</p>
                      <p className="text-[11px] text-text-muted">Notifikasi saat status pesanan berubah (Diproses, Siap, Selesai)</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.order_status}
                      onChange={(e) =>
                        setPreferences({ ...preferences, order_status: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-hover cursor-pointer">
                    <div>
                      <p className="text-xs font-bold text-text-primary">Peringatan Stok Rendah</p>
                      <p className="text-[11px] text-text-muted">Peringatan otomatis saat stok produk mendekati batas minimum</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.low_stock}
                      onChange={(e) =>
                        setPreferences({ ...preferences, low_stock: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-hover cursor-pointer">
                    <div>
                      <p className="text-xs font-bold text-text-primary">Peringatan Stok Habis</p>
                      <p className="text-[11px] text-text-muted">Peringatan darurat saat ada produk yang stoknya habis di inventory</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.out_of_stock}
                      onChange={(e) =>
                        setPreferences({ ...preferences, out_of_stock: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    disabled={savingPrefs}
                    className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary-hover transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    {savingPrefs ? 'Menyimpan...' : 'Simpan Pengaturan Notifikasi'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DISCONNECT CONFIRMATION MODAL */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h4 className="mt-3 text-sm font-bold text-text-primary">Putuskan Integrasi Telegram?</h4>
            <p className="mt-1 text-xs text-text-secondary">
              Bot Telegram akan dinonaktifkan dari toko Anda. Notifikasi pesanan dan stok tidak akan dikirimkan ke Telegram lagi.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
              >
                {disconnecting ? 'Memutuskan...' : 'Ya, Putuskan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
