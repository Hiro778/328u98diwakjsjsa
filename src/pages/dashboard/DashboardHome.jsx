import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { getPlanDisplay } from '../../data/categories'
import { fetchBusinessSalesData, aggregateSalesMetrics } from '../../services/excelSalesService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/orderNumber'

// ── AI Shortcut: same key as AiBusinessAnalystPage ──
const LS_SHORTCUT_PINNED = 'bs_ai_shortcut_pinned'

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function DashboardHome() {
  const { profile, business, subscription, isPro } = useAuth()
  const firstName = profile?.full_name?.split(' ')[0] || 'Anda'
  const planInfo = getPlanDisplay(subscription?.plan)

  // ── AI Shortcut pin state (read from localStorage, same key as offer) ──
  const isAiShortcutPinned = Boolean(localStorage.getItem(LS_SHORTCUT_PINNED))

  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    inventoryCount: 0,
    customerCount: 0,
  })

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      if (!business?.id) return

      try {
        const [salesData, custResult] = await Promise.all([
          fetchBusinessSalesData(business.id),
          supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id)
        ])

        if (!isMounted) return

        const salesMetrics = aggregateSalesMetrics(salesData.orders || [])
        const invCount = salesData.inventory?.length || 0
        const custCount = custResult?.count || 0

        setMetrics({
          totalRevenue: salesMetrics.totalRevenue || 0,
          totalOrders: salesMetrics.totalTransaksi || 0,
          inventoryCount: invCount,
          customerCount: custCount,
        })
      } catch (err) {
        console.error('[DashboardHome] Load metrics error:', err)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [business?.id])

  const primaryKpis = [
    {
      label: 'Total Revenue',
      value: formatCurrency(metrics.totalRevenue),
      subtitle: metrics.totalOrders > 0 ? `${metrics.totalOrders} transaksi tercatat` : 'Belum ada transaksi tercatat',
      accentColor: 'text-secondary',
      bgBadge: 'bg-secondary/10 text-secondary',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
    },
    {
      label: 'Net Profit',
      value: formatCurrency(Math.round(metrics.totalRevenue * 0.3)),
      subtitle: 'Margin estimasi otomatis',
      accentColor: 'text-success',
      bgBadge: 'bg-success/10 text-success',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
  ]

  const secondaryKpis = [
    {
      label: 'Status Inventori',
      value: `${metrics.inventoryCount} Item`,
      subtitle: 'Katalog produk & bahan',
      accentColor: 'text-info',
      bgBadge: 'bg-info/10 text-info',
      link: '/dashboard/operasional/inventory',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: 'Basis Pelanggan',
      value: `${metrics.customerCount} Kontak`,
      subtitle: 'CRM & riwayat pesanan',
      accentColor: 'text-primary',
      bgBadge: 'bg-primary/10 text-primary',
      link: '/dashboard/penjualan/customer-crm',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {planInfo.displayName}
            </span>
            {business?.category && (
              <span className="text-xs font-medium text-text-muted capitalize">
                &middot; {business.category}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-primary">
            Selamat datang, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Ringkasan operasional dan kesehatan bisnis {business?.name ? <strong>{business.name}</strong> : 'Anda'} hari ini.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/dashboard/pos"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors"
          >
            Buka Kasir POS
          </Link>
          <Link
            to="/dashboard/semua-tools"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text-primary shadow-xs hover:bg-surface-hover transition-colors"
          >
            Semua Tools
          </Link>
        </div>
      </motion.div>

      {/* ── AI BUSINESS ANALYST QUICK ACCESS (shown when user pinned via offer) ── */}
      {isPro && isAiShortcutPinned && (
        <motion.div
          data-testid="ai-dashboard-shortcut"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            to="/ai"
            className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 px-5 py-4 shadow-xs hover:border-primary/50 hover:from-primary/10 hover:to-primary/15 transition-all"
          >
            {/* Icon */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary text-xl shadow-xs">
              ✨
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                AI Business Analyst
              </p>
              <p className="text-xs text-text-muted mt-0.5 truncate">
                Tanya kondisi bisnis, analisis omzet, margin, atau stok sekarang
              </p>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden sm:inline rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Pro
              </span>
              <svg
                className="h-4 w-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </motion.div>
      )}

      {/* KPI Cards Grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {/* Primary KPIs */}
        {primaryKpis.map((kpi) => (
          <motion.div
            key={kpi.label}
            variants={item}
            className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {kpi.label}
              </span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpi.bgBadge}`}>
                {kpi.icon}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
                {kpi.value}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {kpi.subtitle}
              </p>
            </div>
          </motion.div>
        ))}

        {/* Secondary KPIs */}
        {secondaryKpis.map((kpi) => (
          <motion.div
            key={kpi.label}
            variants={item}
            className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {kpi.label}
              </span>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpi.bgBadge}`}>
                {kpi.icon}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
                {kpi.value}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {kpi.subtitle}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Section: Performance & Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Business Performance */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface p-6 shadow-xs lg:col-span-2"
        >
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-base font-bold text-text-primary">Performa Bisnis</h2>
              <p className="text-xs text-text-muted mt-0.5">Pantau tren finansial dan pergerakan stok real-time</p>
            </div>
            <span className="rounded-full bg-surface-hover px-2.5 py-1 text-[11px] font-semibold text-text-muted">
              Bulan Ini
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {[
              { label: 'Tren Pendapatan Harian', desc: 'Total penjualan dari POS & pesanan', path: '/dashboard/pos' },
              { label: 'Kalkulator HPP & Biaya', desc: 'Hitung HPP produk & bahan baku', path: '/dashboard/keuangan/hpp-calculator' },
              { label: 'Perputaran Inventori', desc: 'Monitoring bahan baku & stok habis', path: '/dashboard/operasional/inventory' },
            ].map((row) => (
              <Link
                key={row.label}
                to={row.path}
                className="group flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-4 transition-all hover:bg-surface-hover hover:border-primary/20"
              >
                <div>
                  <span className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
                    {row.label}
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">{row.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-muted">Buka</span>
                  <svg className="h-4 w-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>

          <p className="mt-4 text-xs text-text-muted">
            Data grafik tren otomatis diperbarui setiap ada transaksi kasir atau perubahan persediaan.
          </p>
        </motion.div>

        {/* Action Center / Business Health Insights */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface p-6 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="border-b border-border pb-4">
              <h2 className="text-base font-bold text-text-primary">Insight Bisnis</h2>
              <p className="text-xs text-text-muted mt-0.5">Rekomendasi tindakan cerdas</p>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-border p-5 text-center bg-background/40">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="mt-3 text-xs font-bold text-text-primary">Mulai Catat Transaksi Pertama</p>
              <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
                Gunakan Kasir POS atau QR Menu untuk mengaktifkan AI rekomendasi penghematan dan skor kesehatan bisnis.
              </p>
              <Link
                to="/dashboard/pos"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-primary-hover transition-colors"
              >
                Mulai Sekarang &rarr;
              </Link>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <Link
              to="/dashboard/analytics"
              className="text-xs font-semibold text-primary hover:underline flex items-center justify-between"
            >
              Lihat Analisis Mendalam &rarr;
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
