// src/components/SubscriptionGate.jsx
// In-place gate displayed when user tries to access a Pro feature without an active subscription.
// Per PRD Item 10 & fix.md: does not blindly redirect out of account, lets user navigate normally.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { verifySubscriptionPayment } from '../lib/subscriptionService'
import { formatSyncResultMessage, getFriendlyErrorMessage } from '../lib/subscriptionUtils'

export default function SubscriptionGate({ featureName = 'Fitur ini', requiredPlan = 'pro' }) {
  const navigate = useNavigate()
  const { hasExpiredSubscription, isBasic, refreshSubscription } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  const isBasicReq = requiredPlan === 'basic'

  const handleSyncPayment = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const verifyRes = await verifySubscriptionPayment()
      const sub = await refreshSubscription()

      const isSubActive =
        verifyRes?.is_active === true ||
        (sub?.status === 'active' &&
          (isBasicReq ? ['basic', 'pro'].includes(sub?.plan?.toLowerCase()) : sub?.plan?.toLowerCase() === 'pro') &&
          sub?.expires_at &&
          new Date(sub.expires_at) > new Date())

      const result = formatSyncResultMessage(verifyRes, isSubActive)
      setSyncMsg(result)

      if (isSubActive) {
        setTimeout(() => {
          navigate('/dashboard')
        }, 1200)
      }
    } catch {
      setSyncMsg(getFriendlyErrorMessage())
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="mx-auto max-w-md rounded-2xl border border-warm-300/40 bg-surface p-8 shadow-sm"
      >
        {/* Badge */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-100 text-warm-600 shadow-inner">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-warm-50 px-3 py-1 text-xs font-semibold text-warm-600">
          <span className="h-1.5 w-1.5 rounded-full bg-warm-500 animate-pulse" />
          {hasExpiredSubscription
            ? 'Langganan Telah Berakhir'
            : isBasicReq
            ? 'Khusus Pelanggan BisnisSehat'
            : isBasic
            ? 'Upgrade ke Paket Pro Diperlukan'
            : 'Khusus Paket Pro'}
        </div>

        <h2 className="mt-4 text-xl font-extrabold text-text-primary">
          {featureName} {isBasicReq ? 'Memerlukan Langganan Aktif' : 'Memerlukan BisnisSehat Pro'}
        </h2>

        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          {hasExpiredSubscription
            ? 'Masa aktif langganan kamu telah berakhir. Perpanjang sekarang untuk terus menikmati akses tanpa batas.'
            : isBasicReq
            ? 'Akses kumpulan tools bisnis kalkulasi mandiri dengan paket Basic (Rp35.000/bulan) atau paket lengkap Pro (Rp130.000/bulan).'
            : isBasic
            ? 'Fitur ini membutuhkan koneksi database bisnis, POS kasir, atau modul AI yang tersedia di paket Pro seharga Rp130.000 / bulan.'
            : 'Upgrade ke BisnisSehat Pro seharga Rp130.000 / bulan untuk membuka akses penuh ke analisis, tools ekspor, AI insights, dan manajemen bisnis lanjutan.'}
        </p>

        {/* Feature checklist */}
        <div className="mt-5 rounded-xl bg-surface-hover/70 border border-border/60 p-3.5 text-left text-xs text-text-primary space-y-2">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-profit-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{isBasicReq ? 'Akses tools kalkulasi mandiri (HPP, BEP, Ads, SEO, Kurs)' : 'Semua tools bisnis, POS kasir & AI tanpa batas'}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-profit-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Sistem pembayaran resmi & aman via Midtrans</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-profit-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Data dan riwayat akun tetap aman selamanya</span>
          </div>
        </div>

        {/* Sync loading message */}
        {syncing && !syncMsg && (
          <div className="mt-4 rounded-xl border border-warm-200 bg-warm-50/90 p-3 text-xs font-medium text-warm-800 text-left">
            <p className="font-bold">Memeriksa status langganan...</p>
            <p className="mt-0.5 text-text-secondary">Mohon tunggu sebentar.</p>
          </div>
        )}

        {/* Sync message if any */}
        {syncMsg && (
          <div
            className={`mt-4 rounded-xl p-3 text-xs font-medium text-left ${
              syncMsg.type === 'success'
                ? 'bg-profit-50 text-profit-800 border border-profit-200'
                : syncMsg.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : syncMsg.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {syncMsg.title && <p className="font-bold">{syncMsg.title}</p>}
            <p className={syncMsg.title ? 'mt-0.5 leading-relaxed' : 'leading-relaxed'}>{syncMsg.text}</p>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            to={isBasicReq ? '/pricing?plan=basic' : '/pricing?plan=pro'}
            className="w-full rounded-xl bg-warm-500 px-6 py-3 text-center text-sm font-bold text-white shadow transition-all hover:bg-warm-600 hover:shadow-md"
          >
            {hasExpiredSubscription
              ? (isBasicReq ? 'Perpanjang Langganan Sekarang →' : 'Perpanjang Pro Sekarang →')
              : (isBasicReq ? 'Berlangganan Mulai Rp35.000 / bln →' : 'Upgrade ke Pro (Rp130.000 / bln) →')}
          </Link>

          <button
            onClick={handleSyncPayment}
            disabled={syncing}
            type="button"
            className="w-full rounded-xl border border-warm-300 bg-warm-50/60 px-5 py-2.5 text-xs font-semibold text-warm-700 transition-colors hover:bg-warm-100 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {syncing ? 'Memeriksa status langganan...' : 'Sudah Bayar? Sinkronkan Status Langganan'}
          </button>

          <button
            onClick={() => navigate(-1)}
            type="button"
            className="w-full rounded-xl border border-border bg-white px-5 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface cursor-pointer"
          >
            Kembali ke Halaman Sebelumnya
          </button>
        </div>
      </motion.div>
    </div>
  )
}
