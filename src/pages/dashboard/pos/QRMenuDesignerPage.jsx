// src/pages/dashboard/pos/QRMenuDesignerPage.jsx
// Visual Drag & Drop QR Menu Designer with Live Smartphone Simulator

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import useToast from '../../../hooks/useToast'
import Toast from '../../../components/Toast'
import BackButton from '../../../components/BackButton'
import PublicMenuRenderer from '../../../components/pos/PublicMenuRenderer'
import {
  getDesignSettings,
  saveDesignSettings,
  uploadDesignAsset,
  THEME_PRESETS,
  FONT_PRESETS,
  DEFAULT_DESIGN_SETTINGS,
  SOCIAL_PLATFORMS,
  getNormalizedSocialLinks,
  sanitizeSocialUrl,
} from '../../../services/qrMenuDesignService'

// Sample products if the business has not added any products yet
const PREVIEW_SAMPLE_PRODUCTS = [
  {
    id: 'sample-1',
    name: 'Kopi Susu Gula Aren',
    description: 'Espresso robusta dengan susu murni & gula aren asli.',
    unit_price: 18000,
    category: 'Kopi',
    image_url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'sample-2',
    name: 'Croissant Butter Paris',
    description: 'Pastry renyah dengan mentega Prancis berkualitas.',
    unit_price: 24000,
    category: 'Makanan',
    image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'sample-3',
    name: 'Matcha Latte Signature',
    description: 'Teh hijau Uji Kyoto premium dengan fresh milk lembut.',
    unit_price: 22000,
    category: 'Non Kopi',
    image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'sample-4',
    name: 'Americano Double Shot',
    description: 'Espresso murni aromatik disajikan dingin menyegarkan.',
    unit_price: 15000,
    category: 'Kopi',
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=60',
  },
]

export default function QRMenuDesignerPage() {
  const { business, refreshBusiness } = useAuth()
  const { toast, showToast } = useToast()
  const navigate = useNavigate()

  // Business state
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState(null) // 'logo' | 'banner' | null

  // Designer state
  const [theme, setTheme] = useState(DEFAULT_DESIGN_SETTINGS.theme)
  const [layout, setLayout] = useState(DEFAULT_DESIGN_SETTINGS.layout)
  const [selectedSectionId, setSelectedSectionId] = useState('theme') // active inspector tab
  const [deviceMode, setDeviceMode] = useState('mobile') // 'mobile' | 'tablet' | 'desktop'
  const [activeCategory, setActiveCategory] = useState('all')

  // Banner & Social Modal states (qr.md)
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false)
  const [editingBanner, setEditingBanner] = useState(null)
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false)
  const [editingSocial, setEditingSocial] = useState(null)

  // Mobile / Tablet Tab Switcher (bug.md responsive design)
  const [mobileTab, setMobileTab] = useState('preview') // 'sections' | 'preview' | 'inspector'

  // Sample cart for simulator
  const [simulatorCart, setSimulatorCart] = useState([
    {
      id: 'sample-1',
      product_name: 'Kopi Susu Gula Aren',
      quantity: 1,
      unit_price: 18000,
      subtotal: 18000,
    },
  ])

  const fileInputRef = useRef(null)
  const bannerInputRef = useRef(null)

  useEffect(() => {
    if (business?.id) {
      loadDesignerData()
    }
  }, [business?.id])

  async function loadDesignerData() {
    setLoading(true)
    try {
      // 1. Load design settings from database
      const settings = await getDesignSettings(business.id)
      setTheme(settings.theme)
      setLayout(settings.layout)

      // 2. Load business products & categories for live preview
      const [{ data: prodData }, { data: catData }] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, unit_price, category, image_url, is_available')
          .eq('business_id', business.id)
          .eq('is_available', true)
          .limit(10),
        supabase
          .from('menu_categories')
          .select('name')
          .eq('business_id', business.id),
      ])

      const finalProds = prodData && prodData.length > 0 ? prodData : PREVIEW_SAMPLE_PRODUCTS
      setProducts(finalProds)

      const derivedCats = Array.from(
        new Set([
          ...(catData || []).map((c) => c.name),
          ...finalProds.map((p) => p.category).filter(Boolean),
        ])
      )
      setCategories(derivedCats)
    } catch (err) {
      console.error('[QRMenuDesigner] Load error:', err)
      showToast('Gagal memuat konfigurasi desain.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Save changes to database
  async function handleSave() {
    if (!business?.id) return
    setSaving(true)

    try {
      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout,
      })
      showToast('Desain QR Menu berhasil disimpan!', 'success')
    } catch (err) {
      console.error('[QRMenuDesigner] Save error:', err)
      showToast(err.message || 'Gagal menyimpan desain menu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Reset layout to default
  function handleResetLayout() {
    setLayout(JSON.parse(JSON.stringify(DEFAULT_DESIGN_SETTINGS.layout)))
    showToast('Tata letak direset ke default.', 'info')
  }

  // Toggle visibility of a section
  function toggleSectionVisibility(sectionId) {
    setLayout((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, visible: !s.visible } : s))
    )
  }

  // Update specific props of a section
  function updateSectionProps(sectionId, newProps) {
    setLayout((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, props: { ...s.props, ...newProps } } : s
      )
    )
  }

  // Select a preset theme
  function handleSelectPreset(presetKey) {
    const preset = THEME_PRESETS[presetKey]
    if (!preset) return
    setTheme((prev) => ({
      ...prev,
      preset: presetKey,
      primary: preset.primary,
      secondary: preset.secondary,
      background: preset.background,
      surface: preset.surface,
      text: preset.text,
      button: preset.button,
    }))
  }

  // Handle Logo Upload
  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAsset('logo')
    try {
      const publicUrl = await uploadDesignAsset(business.id, file, 'logo')
      // Update business logo in database
      const { error: bizErr } = await supabase
        .from('businesses')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', business.id)

      if (bizErr) throw bizErr
      await refreshBusiness()
      showToast('Logo bisnis berhasil diunggah!', 'success')
    } catch (err) {
      console.error('[QRMenuDesigner] Logo upload error:', err)
      showToast(err.message || 'Gagal mengunggah logo.', 'error')
    } finally {
      setUploadingAsset(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle Banner Upload
  async function handleBannerUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAsset('banner')
    try {
      const publicUrl = await uploadDesignAsset(business.id, file, 'banner')
      // Update business cover in database
      const { error: bizErr } = await supabase
        .from('businesses')
        .update({ cover_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', business.id)

      if (bizErr) throw bizErr

      // Keep layout and design settings in sync with new cover asset
      const bannerSection = layout.find((s) => s.id === 'banner')
      const existingBanners = Array.isArray(bannerSection?.props?.banners) ? [...bannerSection.props.banners] : []
      const newBanner = {
        id: `bnr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        imageUrl: publicUrl,
        title: '',
        description: '',
        ctaText: '',
        ctaUrl: '',
      }
      const updatedBanners = existingBanners.length === 0 ? [newBanner] : existingBanners
      const updatedLayout = layout.map((s) =>
        s.id === 'banner'
          ? {
              ...s,
              props: {
                ...s.props,
                banners: updatedBanners,
                imageUrl: publicUrl,
              },
            }
          : s
      )

      setLayout(updatedLayout)
      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout: updatedLayout,
      })

      await refreshBusiness()
      showToast('Banner bisnis berhasil diunggah!', 'success')
    } catch (err) {
      console.error('[QRMenuDesigner] Banner upload error:', err)
      showToast(err.message || 'Gagal mengunggah banner.', 'error')
    } finally {
      setUploadingAsset(null)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  // Handle Save Banner (from Modal - qr.md)
  async function handleSaveBanner({ title, description, ctaText, ctaUrl, imagePosition = 'center', file, existingUrl }) {
    if (!file && !existingUrl) {
      showToast('Harap pilih atau unggah gambar banner.', 'error')
      return
    }

    setUploadingAsset('banner')
    try {
      let finalUrl = existingUrl
      if (file) {
        finalUrl = await uploadDesignAsset(business.id, file, 'banner')
      }

      const bannerSection = layout.find((s) => s.id === 'banner')
      const existingBanners = Array.isArray(bannerSection?.props?.banners) ? [...bannerSection.props.banners] : []

      let updatedBanners = []
      if (editingBanner) {
        const found = existingBanners.some((b) => b.id === editingBanner.id)
        if (found) {
          updatedBanners = existingBanners.map((b) =>
            b.id === editingBanner.id
              ? { ...b, imageUrl: finalUrl, title, description, ctaText, ctaUrl, imagePosition }
              : b
          )
        } else {
          // If editing a virtual fallback cover or new banner without match, append
          updatedBanners = [
            ...existingBanners,
            {
              id: `bnr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              imageUrl: finalUrl,
              title,
              description,
              ctaText,
              ctaUrl,
              imagePosition,
            },
          ]
        }
      } else {
        const newBanner = {
          id: `bnr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          imageUrl: finalUrl,
          title,
          description,
          ctaText,
          ctaUrl,
          imagePosition,
        }
        updatedBanners = [...existingBanners, newBanner]
      }

      const updatedLayout = layout.map((s) =>
        s.id === 'banner'
          ? {
              ...s,
              props: {
                ...s.props,
                banners: updatedBanners,
                imageUrl: updatedBanners[0]?.imageUrl || finalUrl,
              },
            }
          : s
      )

      setLayout(updatedLayout)

      if (updatedBanners.length > 0 && finalUrl) {
        await supabase
          .from('businesses')
          .update({ cover_url: finalUrl, updated_at: new Date().toISOString() })
          .eq('id', business.id)
        refreshBusiness?.()
      }

      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout: updatedLayout,
      })

      showToast(editingBanner ? 'Banner berhasil diperbarui!' : 'Banner berhasil ditambahkan!', 'success')
      setIsBannerModalOpen(false)
      setEditingBanner(null)
    } catch (err) {
      console.error('[QRMenuDesigner] Save banner error:', err)
      showToast(err.message || 'Gagal menyimpan banner.', 'error')
    } finally {
      setUploadingAsset(null)
    }
  }

  // Handle Delete Banner (qr.md)
  async function handleDeleteBanner(bannerId) {
    if (!window.confirm('Apakah Anda yakin ingin menghapus banner ini?')) {
      return
    }

    try {
      const bannerSection = layout.find((s) => s.id === 'banner')
      const existingBanners = Array.isArray(bannerSection?.props?.banners) ? bannerSection.props.banners : []
      const updatedBanners = existingBanners.filter((b) => b.id !== bannerId)

      const updatedLayout = layout.map((s) =>
        s.id === 'banner'
          ? {
              ...s,
              props: {
                ...s.props,
                banners: updatedBanners,
                imageUrl: updatedBanners[0]?.imageUrl || null,
              },
            }
          : s
      )

      setLayout(updatedLayout)

      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout: updatedLayout,
      })

      if (updatedBanners.length === 0) {
        await supabase
          .from('businesses')
          .update({ cover_url: null, updated_at: new Date().toISOString() })
          .eq('id', business.id)
        refreshBusiness?.()
      }

      showToast('Banner berhasil dihapus.', 'info')
    } catch (err) {
      console.error('[QRMenuDesigner] Delete banner error:', err)
      showToast('Gagal menghapus banner.', 'error')
    }
  }

  // Handle Save Social Link (from Modal - qr.md)
  async function handleSaveSocialLink({ platform, url, label }) {
    const cleanUrl = sanitizeSocialUrl(platform, url)
    if (!cleanUrl) {
      showToast('Harap masukkan URL atau akun yang valid.', 'error')
      return
    }

    try {
      const socialSection = layout.find((s) => s.id === 'social')
      const existingLinks = getNormalizedSocialLinks(socialSection?.props)

      let updatedLinks = []
      if (editingSocial) {
        updatedLinks = existingLinks.map((l) =>
          l.id === editingSocial.id
            ? { ...l, platform, url: cleanUrl, label: label?.trim() || '' }
            : l
        )
      } else {
        if (existingLinks.length >= 5) {
          showToast('Maksimal 5 link kontak telah tercapai.', 'warning')
          return
        }
        const newLink = {
          id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          platform,
          url: cleanUrl,
          label: label?.trim() || '',
        }
        updatedLinks = [...existingLinks, newLink]
      }

      const updatedLayout = layout.map((s) =>
        s.id === 'social'
          ? {
              ...s,
              props: {
                ...s.props,
                links: updatedLinks,
              },
            }
          : s
      )

      setLayout(updatedLayout)

      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout: updatedLayout,
      })

      showToast(editingSocial ? 'Kontak berhasil diperbarui!' : 'Kontak berhasil ditambahkan!', 'success')
      setIsSocialModalOpen(false)
      setEditingSocial(null)
    } catch (err) {
      console.error('[QRMenuDesigner] Save social error:', err)
      showToast(err.message || 'Gagal menyimpan kontak.', 'error')
    }
  }

  // Handle Delete Social Link (qr.md)
  async function handleDeleteSocialLink(linkId) {
    if (!window.confirm('Apakah Anda yakin ingin menghapus kontak ini?')) {
      return
    }

    try {
      const socialSection = layout.find((s) => s.id === 'social')
      const existingLinks = getNormalizedSocialLinks(socialSection?.props)
      const updatedLinks = existingLinks.filter((l) => (l.id || l.url) !== linkId)

      const updatedLayout = layout.map((s) =>
        s.id === 'social'
          ? {
              ...s,
              props: {
                ...s.props,
                links: updatedLinks,
              },
            }
          : s
      )

      setLayout(updatedLayout)

      await saveDesignSettings(business.id, {
        version: 1,
        theme,
        layout: updatedLayout,
      })

      showToast('Kontak berhasil dihapus.', 'info')
    } catch (err) {
      console.error('[QRMenuDesigner] Delete social error:', err)
      showToast('Gagal menghapus kontak.', 'error')
    }
  }

  // Handle Move Social Link (qr.md)
  async function handleMoveSocialLink(index, direction) {
    const socialSection = layout.find((s) => s.id === 'social')
    const existingLinks = getNormalizedSocialLinks(socialSection?.props)
    const target = index + direction
    if (target < 0 || target >= existingLinks.length) return
    const updatedLinks = [...existingLinks]
    const [moved] = updatedLinks.splice(index, 1)
    updatedLinks.splice(target, 0, moved)

    const updatedLayout = layout.map((s) =>
      s.id === 'social'
        ? {
            ...s,
            props: {
              ...s.props,
              links: updatedLinks,
            },
          }
        : s
    )

    setLayout(updatedLayout)

    await saveDesignSettings(business.id, {
      version: 1,
      theme,
      layout: updatedLayout,
    })
  }

  // Handle Logo Removal
  async function handleRemoveLogo() {
    try {
      await supabase
        .from('businesses')
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', business.id)
      await refreshBusiness()
      showToast('Logo bisnis dihapus.', 'info')
    } catch (err) {
      showToast('Gagal menghapus logo.', 'error')
    }
  }

  // Handle Banner Removal
  async function handleRemoveBanner() {
    try {
      await supabase
        .from('businesses')
        .update({ cover_url: null, updated_at: new Date().toISOString() })
        .eq('id', business.id)
      await refreshBusiness()
      showToast('Banner bisnis dihapus.', 'info')
    } catch (err) {
      showToast('Gagal menghapus banner.', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-warm-400 border-t-transparent" />
      </div>
    )
  }

  const publicMenuUrl = `${window.location.origin}/menu/${business?.id}`

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-background">
      {/* Top Navigation Bar */}
      <header className="shrink-0 flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3 shadow-2xs">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <BackButton fallbackUrl="/dashboard/pos/qr-menu" label="Kembali" className="!mb-0 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-navy-700 leading-tight truncate">
              QR Menu Designer
            </h1>
            <p className="hidden sm:block text-[11px] text-text-muted truncate">
              Kustomisasi tampilan menu publik agar mencerminkan identitas tokomu.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={publicMenuUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-cream transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Buka Menu Publik
          </a>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-warm-400 px-3.5 sm:px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-warm-500 disabled:opacity-60 transition-all hover:shadow-md"
          >
            {saving ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>Simpan Desain</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Mobile & Tablet Tab Bar (< lg screens per bug.md) */}
      <div className="lg:hidden shrink-0 flex items-center justify-around border-b border-border bg-surface px-2 py-1.5 shadow-2xs">
        <button
          type="button"
          onClick={() => setMobileTab('sections')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            mobileTab === 'sections'
              ? 'bg-warm-400 text-white shadow-xs'
              : 'text-text-secondary hover:bg-cream'
          }`}
        >
          <span>📋</span>
          <span>Tata Letak</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            mobileTab === 'preview'
              ? 'bg-warm-400 text-white shadow-xs'
              : 'text-text-secondary hover:bg-cream'
          }`}
        >
          <span>📱</span>
          <span>Simulator</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('inspector')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            mobileTab === 'inspector'
              ? 'bg-warm-400 text-white shadow-xs'
              : 'text-text-secondary hover:bg-cream'
          }`}
        >
          <span>⚙️</span>
          <span>Tampilan</span>
        </button>
      </div>

      {/* Main 3-Column Layout Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT PANEL: SECTIONS & DRAG REORDER ── */}
        <aside className={`w-full lg:w-72 shrink-0 border-r border-border bg-surface flex-col overflow-hidden ${mobileTab === 'sections' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-3.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-700">
              Tata Letak Seksi
            </span>
            <button
              type="button"
              onClick={handleResetLayout}
              className="text-[10px] font-semibold text-text-muted hover:text-warm-500 transition-colors"
            >
              Reset Default
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <p className="text-[11px] text-text-muted px-1">
              Geser <span className="font-mono">⋮⋮</span> untuk mengatur urutan susunan menu.
            </p>

            <Reorder.Group
              axis="y"
              values={layout}
              onReorder={setLayout}
              className="space-y-2"
            >
              {layout.map((item) => (
                <ReorderSectionItem
                  key={item.id}
                  item={item}
                  isSelected={selectedSectionId === item.id}
                  onSelect={() => {
                    setSelectedSectionId(item.id)
                    setMobileTab('inspector')
                  }}
                  onToggleVisibility={() => toggleSectionVisibility(item.id)}
                />
              ))}
            </Reorder.Group>
          </div>

          {/* Quick Tab Switcher */}
          <div className="p-3 border-t border-border bg-cream/40">
            <p className="text-[10px] font-bold text-text-muted uppercase mb-2">Kategori Desain</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedSectionId('theme')
                  setMobileTab('inspector')
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg text-left transition-colors ${
                  selectedSectionId === 'theme'
                    ? 'bg-warm-400 text-white shadow-xs'
                    : 'bg-surface border border-border text-navy-700 hover:bg-cream'
                }`}
              >
                🎨 Tema & Warna
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSectionId('typography')
                  setMobileTab('inspector')
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg text-left transition-colors ${
                  selectedSectionId === 'typography'
                    ? 'bg-warm-400 text-white shadow-xs'
                    : 'bg-surface border border-border text-navy-700 hover:bg-cream'
                }`}
              >
                🔤 Tipografi
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSectionId('social')
                  setMobileTab('inspector')
                }}
                className={`col-span-2 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-left transition-colors ${
                  selectedSectionId === 'social'
                    ? 'bg-warm-400 text-white shadow-xs'
                    : 'bg-surface border border-border text-navy-700 hover:bg-cream'
                }`}
              >
                📱 Media Sosial & Kontak
              </button>
            </div>
          </div>
        </aside>

        {/* ── CENTER PANEL: LIVE SIMULATOR CANVAS ── */}
        <main className={`w-full flex-1 bg-cream/60 flex-col overflow-hidden ${mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}`}>
          {/* Device Size Switcher Bar */}
          <div className="shrink-0 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 py-2 px-2 border-b border-border/60 bg-surface/50">
            <button
              type="button"
              onClick={() => setDeviceMode('mobile')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                deviceMode === 'mobile'
                  ? 'bg-warm-50 text-warm-500 border border-warm-200'
                  : 'text-text-muted hover:text-navy-700'
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
              <span>Mobile (390px)</span>
            </button>

            <button
              type="button"
              onClick={() => setDeviceMode('tablet')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                deviceMode === 'tablet'
                  ? 'bg-warm-50 text-warm-500 border border-warm-200'
                  : 'text-text-muted hover:text-navy-700'
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>Tablet (640px)</span>
            </button>

            <button
              type="button"
              onClick={() => setDeviceMode('desktop')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                deviceMode === 'desktop'
                  ? 'bg-warm-50 text-warm-500 border border-warm-200'
                  : 'text-text-muted hover:text-navy-700'
              }`}
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
              <span>Desktop</span>
            </button>
          </div>

          {/* Simulator Viewport Container */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-4 flex items-start justify-center">
            <div
              className={`transition-all duration-300 relative w-full ${
                deviceMode === 'mobile'
                  ? 'max-w-[390px] rounded-3xl sm:rounded-[36px] shadow-2xl border-4 sm:border-8 border-slate-800 bg-white overflow-hidden my-auto'
                  : deviceMode === 'tablet'
                  ? 'max-w-[640px] rounded-2xl sm:rounded-3xl shadow-2xl border-4 sm:border-8 border-slate-800 bg-white overflow-hidden my-auto'
                  : 'max-w-3xl rounded-2xl shadow-lg border border-border bg-white overflow-hidden'
              }`}
            >
              {/* Phone Speaker Notch for Mobile */}
              {deviceMode === 'mobile' && (
                <div className="absolute top-0 inset-x-0 h-4 bg-slate-800 z-50 flex items-center justify-center pointer-events-none">
                  <div className="h-1.5 w-16 bg-slate-600 rounded-full" />
                </div>
              )}

              {/* Shared Renderer in Simulator */}
              <div className="max-h-[calc(100vh-210px)] sm:max-h-[760px] overflow-y-auto pt-3 sm:pt-0">
                <PublicMenuRenderer
                  business={business}
                  products={products}
                  categories={categories}
                  theme={theme}
                  layout={layout}
                  activeCategory={activeCategory}
                  onSelectCategory={setActiveCategory}
                  cart={simulatorCart}
                  onAddToCart={(p) => {
                    setSimulatorCart((prev) => [
                      ...prev,
                      {
                        id: p.id,
                        product_name: p.name,
                        quantity: 1,
                        unit_price: p.unit_price,
                        subtotal: p.unit_price,
                      },
                    ])
                  }}
                  onSelectProduct={(p) => {
                    showToast(`Preview: Klik pada ${p.name}`, 'info')
                  }}
                  onOpenCart={() => {
                    showToast('Preview Keranjang: Berfungsi normal pada menu publik', 'info')
                  }}
                  isInteractive={true}
                  isSimulator={true}
                />
              </div>
            </div>
          </div>
        </main>

        {/* ── RIGHT PANEL: PROPERTIES & APPEARANCE INSPECTOR ── */}
        <aside className={`w-full lg:w-80 shrink-0 border-l border-border bg-surface flex-col overflow-hidden ${mobileTab === 'inspector' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-navy-700">
              Pengaturan Tampilan
            </h2>
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className="lg:hidden text-xs font-bold text-warm-500 hover:text-warm-600 flex items-center gap-1"
            >
              <span>Lihat Simulator</span>
              <span>&rarr;</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* 1. Theme Presets & Custom Colors */}
            {(selectedSectionId === 'theme' || selectedSectionId === 'logo') && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-navy-700 block mb-2">
                    Preset Tema Warna
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(THEME_PRESETS).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPreset(p.id)}
                        className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 transition-all ${
                          theme.preset === p.id
                            ? 'border-warm-400 bg-warm-50/50 ring-2 ring-warm-400/20'
                            : 'border-border bg-surface hover:bg-cream'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: p.primary }}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: p.background }}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: p.text }}
                          />
                        </div>
                        <span className="text-xs font-bold text-navy-700 truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Color Pickers */}
                <div className="space-y-3 pt-3 border-t border-border">
                  <label className="text-xs font-bold text-navy-700 block">Kustomisasi Warna</label>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Warna Utama (Primary)</span>
                    <input
                      type="color"
                      value={theme.primary}
                      onChange={(e) => setTheme({ ...theme, primary: e.target.value, button: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Warna Latar (Background)</span>
                    <input
                      type="color"
                      value={theme.background}
                      onChange={(e) => setTheme({ ...theme, background: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Warna Kartu (Surface)</span>
                    <input
                      type="color"
                      value={theme.surface}
                      onChange={(e) => setTheme({ ...theme, surface: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Warna Teks</span>
                    <input
                      type="color"
                      value={theme.text}
                      onChange={(e) => setTheme({ ...theme, text: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0"
                    />
                  </div>
                </div>

                {/* Button Radius */}
                <div className="pt-3 border-t border-border">
                  <label className="text-xs font-bold text-navy-700 block mb-2">Bentuk Tombol</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['pill', 'rounded', 'square'].map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setTheme({ ...theme, buttonStyle: style })}
                        className={`py-2 text-xs font-bold capitalize transition-colors ${
                          theme.buttonStyle === style
                            ? 'bg-navy-700 text-white'
                            : 'bg-cream text-navy-700 hover:bg-slate-200'
                        } ${style === 'pill' ? 'rounded-full' : style === 'rounded' ? 'rounded-xl' : 'rounded-md'}`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Logo Properties */}
            {selectedSectionId === 'logo' && (
              <div className="space-y-4 pt-3 border-t border-border">
                <label className="text-xs font-bold text-navy-700 block">Identitas Logo Toko</label>

                {/* Upload Logo Trigger */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                />

                <div className="flex items-center gap-3">
                  {business?.logo_url ? (
                    <img src={business.logo_url} alt="" className="h-12 w-12 rounded-full object-cover border" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-cream border flex items-center justify-center text-xs font-bold text-text-muted">
                      No Logo
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5">
                    <button
                      type="button"
                      disabled={uploadingAsset === 'logo'}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg bg-navy-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-700 disabled:opacity-60 transition-colors"
                    >
                      {uploadingAsset === 'logo' ? 'Mengunggah...' : business?.logo_url ? 'Ganti Logo' : 'Upload Logo'}
                    </button>
                    {business?.logo_url && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="w-full text-left text-[11px] font-semibold text-red-500 hover:underline"
                      >
                        Hapus Logo
                      </button>
                    )}
                  </div>
                </div>

                {/* Logo Shape & Size */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-[11px] text-text-secondary block mb-1">Bentuk</span>
                    <select
                      value={layout.find((s) => s.id === 'logo')?.props?.shape || 'circle'}
                      onChange={(e) => updateSectionProps('logo', { shape: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium"
                    >
                      <option value="circle">Bulat (Circle)</option>
                      <option value="rounded">Rounded</option>
                      <option value="square">Kotak (Square)</option>
                    </select>
                  </div>

                  <div>
                    <span className="text-[11px] text-text-secondary block mb-1">Ukuran</span>
                    <select
                      value={layout.find((s) => s.id === 'logo')?.props?.size || 'md'}
                      onChange={(e) => updateSectionProps('logo', { size: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium"
                    >
                      <option value="sm">Kecil</option>
                      <option value="md">Sedang</option>
                      <option value="lg">Besar</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Banner / Hero Image Properties (qr.md) */}
            {selectedSectionId === 'banner' && (
              <BannerEditor
                business={business}
                layout={layout}
                updateSectionProps={updateSectionProps}
                onOpenAddModal={() => {
                  setEditingBanner(null)
                  setIsBannerModalOpen(true)
                }}
                onOpenEditModal={(item) => {
                  setEditingBanner(item)
                  setIsBannerModalOpen(true)
                }}
                onDeleteBanner={handleDeleteBanner}
              />
            )}

            {/* 4. Products Layout Properties */}
            {selectedSectionId === 'products' && (
              <div className="space-y-4">
                <label className="text-xs font-bold text-navy-700 block">Tata Letak Produk</label>

                <div className="space-y-2">
                  {[
                    { id: 'grid', label: 'Grid 2 Kolom', desc: 'Cocok untuk cafe/resto dengan banyak pilihan menu' },
                    { id: 'list', label: 'List Horizontal', desc: 'Compact & cepat discroll di smartphone' },
                    { id: 'card', label: 'Visual Card Besar', desc: 'Fokus pada foto makanan yang menggugah selera' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => updateSectionProps('products', { layout: l.id })}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        layout.find((s) => s.id === 'products')?.props?.layout === l.id
                          ? 'border-warm-400 bg-warm-50/50 ring-2 ring-warm-400/20'
                          : 'border-border bg-surface hover:bg-cream'
                      }`}
                    >
                      <p className="text-xs font-bold text-navy-700">{l.label}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{l.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Typography Properties */}
            {selectedSectionId === 'typography' && (
              <div className="space-y-4">
                <label className="text-xs font-bold text-navy-700 block">Pilihan Font</label>

                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-text-secondary block mb-1.5">Font Judul</span>
                    <select
                      value={theme.fontHeading}
                      onChange={(e) => setTheme({ ...theme, fontHeading: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium"
                    >
                      {FONT_PRESETS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-xs text-text-secondary block mb-1.5">Font Konten (Body)</span>
                    <select
                      value={theme.fontBody}
                      onChange={(e) => setTheme({ ...theme, fontBody: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium"
                    >
                      {FONT_PRESETS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 6. Footer & Custom Closing Message */}
            {selectedSectionId === 'footer' && (
              <div className="space-y-4">
                <label className="text-xs font-bold text-navy-700 block">Ucapan Penutup / Footer</label>

                <textarea
                  rows={3}
                  value={layout.find((s) => s.id === 'footer')?.props?.text || ''}
                  onChange={(e) => updateSectionProps('footer', { text: e.target.value })}
                  placeholder="Contoh: Terima kasih sudah mendukung usaha kami ❤️"
                  className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-navy-700 focus:border-warm-400 focus:outline-none"
                />
              </div>
            )}

            {/* 7. Social Media & Contact Links (qr.md) */}
            {selectedSectionId === 'social' && (
              <SocialLinksEditor
                layout={layout}
                onOpenAddModal={() => {
                  setEditingSocial(null)
                  setIsSocialModalOpen(true)
                }}
                onOpenEditModal={(item) => {
                  setEditingSocial(item)
                  setIsSocialModalOpen(true)
                }}
                onDeleteLink={handleDeleteSocialLink}
                onMoveLink={handleMoveSocialLink}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Banner Modal (qr.md) */}
      <BannerModal
        isOpen={isBannerModalOpen}
        onClose={() => {
          setIsBannerModalOpen(false)
          setEditingBanner(null)
        }}
        banner={editingBanner}
        onSave={handleSaveBanner}
        uploading={uploadingAsset === 'banner'}
      />

      {/* Social Link Modal (qr.md) */}
      <SocialModal
        isOpen={isSocialModalOpen}
        onClose={() => {
          setIsSocialModalOpen(false)
          setEditingSocial(null)
        }}
        link={editingSocial}
        onSave={handleSaveSocialLink}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Reorder Item Component using Framer Motion
// ─────────────────────────────────────────────────────────────

function ReorderSectionItem({ item, isSelected, onSelect, onToggleVisibility }) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }}
      className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${
        isSelected
          ? 'border-warm-400 bg-warm-50/40 ring-1 ring-warm-400'
          : 'border-border bg-surface hover:bg-cream/40'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab text-text-muted hover:text-navy-700 active:cursor-grabbing p-1 text-xs select-none"
          title="Geser untuk mengatur urutan"
        >
          ⋮⋮
        </span>

        <button
          type="button"
          onClick={onSelect}
          className="text-left font-semibold text-xs text-navy-700 truncate min-w-0"
        >
          {item.label}
        </button>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onToggleVisibility}
          className={`p-1 rounded-md text-xs transition-colors ${
            item.visible ? 'text-text-secondary hover:text-navy-700' : 'text-text-muted/40 hover:text-text-muted'
          }`}
          title={item.visible ? 'Sembunyikan' : 'Tampilkan'}
        >
          {item.visible ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          )}
        </button>
      </div>
    </Reorder.Item>
  )
}

// ─────────────────────────────────────────────────────────────
// Banner / Hero Cover Editor Component (qr.md)
// ─────────────────────────────────────────────────────────────

function BannerEditor({
  business,
  layout,
  updateSectionProps,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteBanner,
}) {
  const bannerSection = layout.find((s) => s.id === 'banner')
  const currentHeight = bannerSection?.props?.height || 'compact'

  const banners = Array.isArray(bannerSection?.props?.banners) && bannerSection.props.banners.length > 0
    ? bannerSection.props.banners
    : (business?.cover_url || bannerSection?.props?.imageUrl
        ? [{
            id: 'default-cover',
            imageUrl: bannerSection?.props?.imageUrl || business?.cover_url,
            title: bannerSection?.props?.title || '',
            description: bannerSection?.props?.description || '',
            ctaText: bannerSection?.props?.ctaText || '',
            ctaUrl: bannerSection?.props?.ctaUrl || '',
          }]
        : [])

  function handleMove(index, direction) {
    const target = index + direction
    if (target < 0 || target >= banners.length) return
    const updated = [...banners]
    const [moved] = updated.splice(index, 1)
    updated.splice(target, 0, moved)
    updateSectionProps('banner', { banners: updated })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-bold text-navy-700 block">
            Banner / Hero Cover
          </label>
          <p className="text-[11px] text-text-muted mt-0.5">
            Foto header atau banner promosi di atas menu.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAddModal}
          className="px-3 py-1.5 rounded-lg bg-navy-600 text-white font-bold text-xs hover:bg-navy-700 transition shadow-xs flex items-center gap-1"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Tambah Banner
        </button>
      </div>

      {/* Height presets (ban.md Section 2) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-navy-700">Tinggi & Proporsi Banner</span>
          <span className="text-[10px] text-text-muted">Aspect Ratio Hero</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'compact', label: 'Compact', ratio: '3.2 : 1' },
            { id: 'medium', label: 'Medium', ratio: '2.6 : 1' },
            { id: 'large', label: 'Large', ratio: '2.1 : 1' },
          ].map(({ id, label, ratio }) => (
            <button
              key={id}
              type="button"
              onClick={() => updateSectionProps('banner', { height: id })}
              className={`py-2 px-1 text-center rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                currentHeight === id
                  ? 'bg-warm-400 border-warm-400 text-white shadow-xs'
                  : 'bg-surface border-border text-navy-700 hover:bg-cream'
              }`}
            >
              <span className="text-xs font-bold capitalize leading-none">{label}</span>
              <span className={`text-[10px] mt-1 leading-none ${currentHeight === id ? 'text-white/85' : 'text-text-muted'}`}>
                {ratio}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Banners List / Empty state */}
      {banners.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-cream/30 p-6 text-center">
          <p className="text-xs font-bold text-navy-700">Belum ada banner</p>
          <p className="text-[11px] text-text-muted mt-1 mb-4">
            Tambahkan cover atau banner promo untuk menu Anda
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-warm-400 text-white font-bold text-xs hover:bg-warm-500 shadow-xs transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Tambah Banner
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((item, index) => (
            <div
              key={item.id || index}
              className="rounded-xl border border-border bg-surface p-3 space-y-2.5 shadow-2xs transition-all hover:border-warm-300"
            >
              <div className="flex gap-3">
                <img
                  src={item.imageUrl}
                  alt={item.title || 'Banner'}
                  className="h-16 w-24 rounded-lg object-cover border shrink-0 bg-cream/40"
                />
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <h4 className="text-xs font-bold text-navy-700 truncate">
                    {item.title || `Banner #${index + 1}`}
                  </h4>
                  {item.description && (
                    <p className="text-[11px] text-text-muted line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  )}
                  {item.ctaText && (
                    <span className="text-[10px] text-warm-600 font-semibold mt-1 block">
                      CTA: {item.ctaText}
                    </span>
                  )}
                  {item.imagePosition && item.imagePosition !== 'center' && (
                    <span className="text-[10px] text-text-muted mt-0.5 block">
                      Fokus gambar: {item.imagePosition === 'top' ? 'Atas' : 'Bawah'}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions: Reorder + Edit + Hapus */}
              <div className="flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    className="p-1 rounded text-text-muted hover:text-navy-700 disabled:opacity-30 transition"
                    title="Pindahkan ke atas"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={index === banners.length - 1}
                    onClick={() => handleMove(index, 1)}
                    className="p-1 rounded text-text-muted hover:text-navy-700 disabled:opacity-30 transition"
                    title="Pindahkan ke bawah"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenEditModal(item)}
                    className="text-xs font-bold text-navy-600 hover:text-navy-800 transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBanner(item.id)}
                    className="text-xs font-bold text-rose-500 hover:text-rose-700 transition"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Social Media & Contact Links Editor Component (qr.md)
// ─────────────────────────────────────────────────────────────

function SocialLinksEditor({
  layout,
  onOpenAddModal,
  onOpenEditModal,
  onDeleteLink,
  onMoveLink,
}) {
  const socialSection = layout.find((s) => s.id === 'social')
  const links = getNormalizedSocialLinks(socialSection?.props)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-bold text-navy-700 block">
            Media Sosial & Kontak
          </label>
          <p className="text-[11px] text-text-muted mt-0.5">
            Maksimal 5 link aktif.
          </p>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            links.length >= 5
              ? 'bg-rose-100 text-rose-600'
              : 'bg-warm-100 text-warm-600'
          }`}
        >
          {links.length}/5
        </span>
      </div>

      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-cream/30 p-5 text-center">
          <p className="text-xs font-bold text-navy-700">Belum ada kontak media sosial</p>
          <p className="text-[11px] text-text-muted mt-1 mb-3">
            Tambahkan kontak toko agar pelanggan dapat terhubung
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warm-400 text-white font-bold text-xs hover:bg-warm-500 shadow-xs transition"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            + Tambah Kontak
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {links.map((item, index) => {
            const platformConfig =
              SOCIAL_PLATFORMS.find((p) => p.id === item.platform) || SOCIAL_PLATFORMS[0]

            return (
              <div
                key={item.id || index}
                className="rounded-xl border border-border bg-surface p-3 space-y-2 shadow-2xs hover:border-warm-300 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-cream text-navy-800 text-[10px] font-bold uppercase tracking-wider">
                      {platformConfig.label}
                    </span>
                    <span className="text-xs font-medium text-navy-700 truncate">
                      {item.label || item.url}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMoveLink(index, -1)}
                      className="p-1 rounded text-text-muted hover:text-navy-700 disabled:opacity-30 transition"
                      title="Pindahkan ke atas"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={index === links.length - 1}
                      onClick={() => onMoveLink(index, 1)}
                      className="p-1 rounded text-text-muted hover:text-navy-700 disabled:opacity-30 transition"
                      title="Pindahkan ke bawah"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                  <span className="text-[11px] text-warm-600 truncate max-w-[180px]">
                    {item.url}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenEditModal(item)}
                      className="font-bold text-navy-600 hover:text-navy-800 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLink(item.id || item.url)}
                      className="font-bold text-rose-500 hover:text-rose-700 transition"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* + Tambah Kontak Button (Max 5, disabled when 5 reached) */}
      <button
        type="button"
        disabled={links.length >= 5}
        onClick={onOpenAddModal}
        className={`w-full py-2.5 px-3 rounded-xl border border-dashed font-bold text-xs transition flex items-center justify-center gap-1.5 ${
          links.length >= 5
            ? 'border-border bg-cream/40 text-text-muted cursor-not-allowed opacity-60'
            : 'border-warm-400 bg-warm-50/50 text-warm-600 hover:bg-warm-100/50 active:scale-[0.99]'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {links.length >= 5 ? 'Maksimal 5 link tercapai' : '+ Tambah Kontak'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Banner Modal Form (qr.md)
// ─────────────────────────────────────────────────────────────

function BannerModal({ isOpen, onClose, banner, onSave, uploading }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [imagePosition, setImagePosition] = useState('center')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (banner) {
      setTitle(banner.title || '')
      setDescription(banner.description || '')
      setCtaText(banner.ctaText || '')
      setCtaUrl(banner.ctaUrl || '')
      setImagePosition(banner.imagePosition || 'center')
      setPreviewUrl(banner.imageUrl || '')
      setFile(null)
    } else {
      setTitle('')
      setDescription('')
      setCtaText('')
      setCtaUrl('')
      setImagePosition('center')
      setFile(null)
      setPreviewUrl('')
    }
  }, [banner, isOpen])

  function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      const url = URL.createObjectURL(selected)
      setPreviewUrl(url)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      title: title.trim(),
      description: description.trim(),
      ctaText: ctaText.trim(),
      ctaUrl: ctaUrl.trim(),
      imagePosition,
      file,
      existingUrl: banner?.imageUrl || previewUrl,
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl bg-surface p-4 sm:p-5 shadow-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-navy-800">
                {banner ? 'Edit Banner / Cover' : 'Tambah Banner / Cover'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-text-muted hover:text-navy-700 hover:bg-cream"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Image Uploader & Preview */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1.5">
                  Gambar Banner *
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border group h-36 w-full bg-cream/30">
                    <img
                      src={previewUrl}
                      alt="Banner Preview"
                      className="h-full w-full object-cover"
                      style={{ objectPosition: imagePosition }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg bg-surface text-navy-800 text-xs font-bold shadow-md hover:bg-cream cursor-pointer"
                      >
                        Ganti Gambar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-warm-400 bg-cream/20 hover:bg-cream/40 transition flex flex-col items-center justify-center p-4 text-center cursor-pointer"
                  >
                    <svg className="h-6 w-6 text-text-muted mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <span className="text-xs font-bold text-navy-700">Pilih Gambar Banner</span>
                    <span className="text-[10px] text-text-muted mt-0.5">JPG, PNG, atau WEBP</span>
                  </button>
                )}
              </div>

              {/* Posisi Fokus Gambar (ban.md Section 3 & 8) */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  Posisi Fokus Gambar
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'top', label: 'Atas' },
                    { id: 'center', label: 'Tengah' },
                    { id: 'bottom', label: 'Bawah' },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setImagePosition(pos.id)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition cursor-pointer text-center ${
                        imagePosition === pos.id
                          ? 'bg-navy-700 text-white border-navy-700 shadow-2xs'
                          : 'bg-surface border-border text-navy-700 hover:bg-cream'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Judul Banner */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  Judul Banner
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Menu Spesial Hari Ini"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* Deskripsi */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  Deskripsi
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi singkat atau promo menarik..."
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* CTA Text & Link */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-navy-700 block mb-1">
                    Teks Tombol CTA
                  </label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="Contoh: Pesan Sekarang"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-navy-700 block mb-1">
                    Link / Target CTA
                  </label>
                  <input
                    type="text"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="Contoh: #kategori-kopi"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-navy-700 hover:bg-cream transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploading || (!file && !previewUrl)}
                  className="px-4 py-2 rounded-xl bg-warm-400 hover:bg-warm-500 text-white text-xs font-bold shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploading ? 'Mengunggah...' : 'Simpan'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────
// Social Media Link Modal Form (qr.md)
// ─────────────────────────────────────────────────────────────

function SocialModal({ isOpen, onClose, link, onSave }) {
  const [platform, setPlatform] = useState('instagram')
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (link) {
      setPlatform(link.platform || 'instagram')
      setUrl(link.url || '')
      setLabel(link.label || '')
    } else {
      setPlatform('instagram')
      setUrl('')
      setLabel('')
    }
  }, [link, isOpen])

  const platformConfig = SOCIAL_PLATFORMS.find((p) => p.id === platform) || SOCIAL_PLATFORMS[0]

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ platform, url, label })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl bg-surface p-4 sm:p-5 shadow-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-navy-800">
                {link ? 'Edit Kontak Media Sosial' : 'Tambah Kontak Media Sosial'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-text-muted hover:text-navy-700 hover:bg-cream"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Platform */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-navy-700 focus:border-warm-400 focus:outline-none"
                >
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* URL */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  URL / Akun *
                </label>
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={platformConfig.placeholder}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* Label (Optional) */}
              <div>
                <label className="text-xs font-bold text-navy-700 block mb-1">
                  Label / Nama Tampilan (Opsional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Contoh: @tokokopi / Hubungi Kami"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-navy-700 placeholder:text-text-muted/60 focus:border-warm-400 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-navy-700 hover:bg-cream transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-warm-400 hover:bg-warm-500 text-white text-xs font-bold shadow-xs transition"
                >
                  Simpan
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

