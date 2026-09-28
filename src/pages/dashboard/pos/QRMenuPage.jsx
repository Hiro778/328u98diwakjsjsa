import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'
import BusinessQrisSettings from '../../../components/pos/BusinessQrisSettings'

export default function QRMenuPage() {
  const { business, refreshBusiness } = useAuth()
  const { toast, showToast } = useToast()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ products: 0, categories: 0, tables: 0 })
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)

  const menuUrl = business?.id ? `${window.location.origin}/menu/${business.id}` : ''

  useEffect(() => {
    if (business?.id) loadData()
  }, [business?.id])

  async function loadData() {
    const [{ data: prods }, { data: cats }, { data: tbls }] = await Promise.all([
      supabase.from('products').select('category').eq('business_id', business.id),
      supabase.from('menu_categories').select('name').eq('business_id', business.id),
      supabase.from('tables').select('*').eq('business_id', business.id).eq('is_active', true).order('sort_order')
    ])

    const allCatNames = new Set([
      ...(cats || []).map(c => c.name?.trim()).filter(Boolean),
      ...(prods || []).map(p => p.category?.trim()).filter(Boolean)
    ])

    setStats({
      products: (prods || []).length,
      categories: allCatNames.size,
      tables: (tbls || []).length,
    })
    setLoading(false)
  }

  async function handlePublish() {
    setPublishing(true)

    // --- Validation ---
    if (!business?.id) {
      showToast('Data bisnis tidak ditemukan. Silakan refresh halaman.', 'error')
      setPublishing(false)
      return
    }

    if (stats.products === 0) {
      showToast('Tambahkan minimal 1 produk sebelum publish menu.', 'error')
      setPublishing(false)
      return
    }

    // --- Database Update ---
    const { data, error } = await supabase
      .from('businesses')
      .update({
        is_menu_published: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', business.id)
      .select('is_menu_published')
      .single()

    if (error) {
      console.error('Publish failed:', error)
      showToast(
        error.message?.includes('permission') || error.code === '42501'
          ? 'Tidak memiliki izin untuk mengubah menu.'
          : 'Gagal mengubah status menu. Coba lagi.',
        'error'
      )
      setPublishing(false)
      return
    }

    // --- Verify update actually happened ---
    if (!data || data.is_menu_published !== true) {
      showToast('Update tidak berhasil. Menu tidak berubah status.', 'error')
      setPublishing(false)
      return
    }

    // --- Success: refresh & redirect to landing page ---
    await refreshBusiness()
    showToast('Menu berhasil dipublish!', 'success')
    setPublishing(false)
    navigate('/dashboard/pos/qr-menu/published')
  }

  async function handleUnpublish() {
    setPublishing(true)

    if (!business?.id) {
      showToast('Data bisnis tidak ditemukan.', 'error')
      setPublishing(false)
      return
    }

    const { error } = await supabase
      .from('businesses')
      .update({
        is_menu_published: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', business.id)
      .select('is_menu_published')
      .single()

    if (error) {
      console.error('Unpublish failed:', error)
      showToast('Gagal mengubah status menu. Coba lagi.', 'error')
      setPublishing(false)
      return
    }

    await refreshBusiness()
    showToast('Menu berhasil di-unpublish.', 'success')
    setPublishing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <Toast message={toast?.message} type={toast?.type} onDismiss={() => {}} />
      <BackButton fallbackUrl="/dashboard/pos" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-700">QR Menu & Pesanan</h1>
          <p className="mt-1 text-sm text-text-secondary">Buat menu digital, terima pesanan dari meja, dan kelola semuanya dari kasir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/dashboard/pos/qr-menu/designer"
            className="rounded-xl border border-warm-400 bg-warm-50/70 px-4 py-2.5 text-sm font-bold text-warm-600 transition-colors hover:bg-warm-100 flex items-center gap-1.5"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
            </svg>
            Desain Menu
          </Link>
          {business?.is_menu_published && menuUrl && (
            <a
              href={menuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-cream"
            >
              Lihat Menu
            </a>
          )}
          {business?.is_menu_published ? (
            <button
              onClick={handleUnpublish}
              disabled={publishing}
              className="rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-500 transition-all hover:bg-red-100 disabled:opacity-60"
            >
              {publishing ? 'Menyimpan...' : 'Unpublish Menu'}
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-xl bg-warm-400 px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30 disabled:opacity-60"
            >
              {publishing ? 'Menyimpan...' : 'Publish Menu'}
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className={`mt-6 rounded-2xl border p-5 ${
        business?.is_menu_published
          ? 'border-profit-200 bg-profit-50'
          : 'border-border bg-surface'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            business?.is_menu_published ? 'bg-profit-100' : 'bg-cream'
          }`}>
            {business?.is_menu_published ? (
              <svg className="h-5 w-5 text-profit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-navy-700">
              {business?.is_menu_published ? 'Menu Aktif' : 'Menu Belum Dipublish'}
            </p>
            <p className="text-xs text-text-muted">
              {business?.is_menu_published
                ? 'Menu publik lo sudah aktif dan bisa diakses customer.'
                : 'Publish menu agar customer bisa melihat dan memesan.'}
            </p>
          </div>
        </div>
        {business?.is_menu_published && menuUrl && (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white/60 px-3 py-2 text-xs text-navy-600">
              {menuUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(menuUrl)}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-navy-600 transition-colors hover:bg-cream"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Empty state CTA */}
      {stats.products === 0 && !business?.is_menu_published && (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-warm-200 bg-warm-50 p-8 text-center">
          <svg className="mx-auto h-10 w-10 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-3 text-sm font-bold text-navy-700">Belum ada produk</p>
          <p className="mt-1 text-xs text-text-muted">Tambahkan produk sebelum publish menu.</p>
          <Link
            to="/dashboard/pos/products"
            className="mt-4 inline-block rounded-xl bg-warm-400 px-5 py-2.5 text-xs font-bold text-white transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30"
          >
            + Tambah Produk
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link to="/dashboard/pos/products" className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warm-50">
              <svg className="h-5 w-5 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-navy-700">{stats.products}</p>
              <p className="text-xs text-text-muted">Produk</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-warm-500 group-hover:text-warm-600">Kelola Produk &rarr;</p>
        </Link>

        <Link to="/dashboard/pos/categories" className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric-50">
              <svg className="h-5 w-5 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-navy-700">{stats.categories}</p>
              <p className="text-xs text-text-muted">Kategori</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-electric-500 group-hover:text-electric-600">Kelola Kategori &rarr;</p>
        </Link>

        <Link to="/dashboard/pos/tables" className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-profit-50">
              <svg className="h-5 w-5 text-profit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-navy-700">{stats.tables}</p>
              <p className="text-xs text-text-muted">Meja</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-profit-500 group-hover:text-profit-600">Kelola Meja &rarr;</p>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          to="/dashboard/pos"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-600">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-navy-700">POS / Kasir</p>
            <p className="text-xs text-text-muted">Buka mesin kasir untuk pesanan</p>
          </div>
          <svg className="ml-auto h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>

        <Link
          to="/dashboard/pos/orders"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-400">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-navy-700">Riwayat Pesanan</p>
            <p className="text-xs text-text-muted">Lihat semua pesanan masuk</p>
          </div>
          <svg className="ml-auto h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>

        <Link
          to="/dashboard/pos/receipt-settings"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-electric-500">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-navy-700">Pengaturan Struk</p>
            <p className="text-xs text-text-muted">Profil toko &amp; format struk thermal/WA</p>
          </div>
          <svg className="ml-auto h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </Link>

        <a
          href="#qris-settings-section"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:border-warm-200 hover:shadow-sm"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-navy-700">QRIS Toko</p>
            <p className="text-xs text-text-muted">Upload &amp; kelola QRIS merchant</p>
          </div>
          <svg className="ml-auto h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </a>
      </div>

      {/* Dedicated QRIS Merchant Settings Section */}
      <div id="qris-settings-section" className="mt-8">
        <BusinessQrisSettings
          businessId={business?.id}
          onToast={showToast}
        />
      </div>
    </div>
  )
}
