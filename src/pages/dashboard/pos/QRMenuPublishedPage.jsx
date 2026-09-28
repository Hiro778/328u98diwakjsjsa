import { useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import QRGenerator from '../../../components/pos/QRGenerator'
import BackButton from '../../../components/BackButton'

const SIZE_OPTIONS = [
  { cm: 3, label: '3 × 3 cm' },
  { cm: 4, label: '4 × 4 cm' },
  { cm: 5, label: '5 × 5 cm' },
]

export default function QRMenuPublishedPage() {
  const { business } = useAuth()
  const [showQR, setShowQR] = useState(false)
  const [selectedCm, setSelectedCm] = useState(3)

  const menuUrl = business?.id
    ? `${window.location.origin}/menu/${business.id}`
    : ''

  // Redirect if menu is not published
  if (!business?.is_menu_published) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cream">
          <svg className="h-8 w-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-bold text-navy-700">Menu belum dipublish</p>
        <p className="mt-1 text-xs text-text-muted">Publish menu terlebih dahulu.</p>
        <Link
          to="/dashboard/pos/qr-menu"
          className="mt-4 rounded-xl bg-warm-400 px-5 py-2.5 text-xs font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
        >
          Kembali
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 sm:px-0">
      <BackButton fallbackUrl="/dashboard/pos/qr-menu" label="Kembali ke QR Menu" />
      {/* Success Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-profit-100">
          <svg className="h-10 w-10 text-profit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-6 text-xl sm:text-2xl font-extrabold text-navy-700">Menu Anda Sudah Siap!</h1>
        <p className="mt-2 text-xs sm:text-sm text-text-secondary">Menu publik berhasil dipublish dan siap diakses customer.</p>
      </motion.div>

      {/* Business Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8 rounded-2xl border border-profit-200 bg-profit-50 p-4 sm:p-6"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {business?.logo_url ? (
            <img src={business.logo_url} alt="" className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-navy-600 shrink-0">
              <span className="text-base sm:text-lg font-extrabold text-white">
                {(business?.name || 'BS').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base sm:text-lg font-extrabold text-navy-700 truncate">{business?.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-profit-100 px-2.5 py-0.5 text-xs font-bold text-profit-700">
                <span className="h-1.5 w-1.5 rounded-full bg-profit-500" />
                Published
              </span>
            </div>
          </div>
        </div>

        {/* Public URL */}
        {menuUrl && (
          <div className="mt-4 flex items-center gap-2 min-w-0">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-white/70 px-3 py-2.5 text-xs text-navy-600">
              {menuUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(menuUrl)}
              className="shrink-0 rounded-lg bg-white px-3 py-2.5 text-xs font-medium text-navy-600 transition-colors hover:bg-cream"
            >
              Copy
            </button>
          </div>
        )}
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 grid gap-3"
      >
        {/* Lihat Halaman Menu */}
        {menuUrl && (
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-400">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-navy-700">Lihat Halaman Menu</p>
              <p className="text-xs text-text-muted">Buka menu publik yang dilihat customer</p>
            </div>
            <svg className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        )}

        {/* Kustomisasi Desain Menu */}
        <Link
          to="/dashboard/pos/qr-menu/designer"
          className="group flex items-center gap-4 rounded-2xl border border-warm-200 bg-warm-50/60 p-5 transition-all hover:bg-warm-100/60 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-400 text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-navy-700">Kustomisasi Desain Menu</p>
            <p className="text-xs text-text-muted">Atur logo toko, tema warna, banner, dan tata letak produk</p>
          </div>
          <svg className="h-5 w-5 text-warm-500 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </Link>

        {/* QR Code */}
        <button
          onClick={() => setShowQR(!showQR)}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-600">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-navy-700">QR Code</p>
            <p className="text-xs text-text-muted">Download QR untuk dicetak di meja</p>
          </div>
          <svg
            className={`h-5 w-5 text-text-muted transition-transform ${showQR ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </motion.div>

      {/* QR Panel (expandable) */}
      {showQR && menuUrl && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <div className="p-6">
            {/* Size Selection */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-navy-700 mb-2">Ukuran Cetak</p>
              <div className="flex gap-2">
                {SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.cm}
                    onClick={() => setSelectedCm(opt.cm)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      selectedCm === opt.cm
                        ? 'bg-navy-600 text-white shadow-sm'
                        : 'bg-white border border-border text-text-secondary hover:border-navy-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* QR Generator */}
            <QRGenerator
              url={menuUrl}
              printSizeCm={selectedCm}
              businessId={business?.id || ''}
              tableName={business?.name || 'Menu'}
              label={business?.name || ''}
              downloadFilename={`bisnis-sehat-qr-${business?.id || 'menu'}.png`}
            />
          </div>
        </motion.div>
      )}

      {/* Back Link */}
      <div className="mt-8 text-center">
        <Link
          to="/dashboard/pos/qr-menu"
          className="text-xs font-medium text-text-muted transition-colors hover:text-navy-700"
        >
          &larr; Kembali ke QR Menu
        </Link>
      </div>
    </div>
  )
}
