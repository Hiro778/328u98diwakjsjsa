import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../../context/AuthContext'
import BackButton from '../../../components/BackButton'
import {
  runSeoAudit,
  loadSeoAuditHistory,
  saveSeoAuditHistory,
  deleteSeoAuditHistory,
  clearSeoAuditHistory,
} from '../../../lib/seoAnalyzer'
import {
  fetchTargetUrlForSeo,
  fetchSeoKeywordResearch,
  fetchSeoCompetitors,
} from '../../../lib/seoService'

// Preset demo templates for UMKM testing
const SAMPLE_TEMPLATES = [
  {
    name: 'Toko Online Kopi Nusantara (Lengkap + JSON-LD Schema)',
    url: 'https://tokokopinusantara.id/produk/kopi-arabika-gayo',
    keyword: 'kopi arabika gayo',
    html: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jual Kopi Arabika Gayo Asli Aceh 250gr - Toko Kopi Nusantara</title>
  <meta name="description" content="Beli kopi arabika gayo premium langsung dari petani Aceh. Biji kopi pilihan dengan aroma fruity harum, dipanggang segar setiap minggu untuk cita rasa terbaik.">
  <link rel="canonical" href="https://tokokopinusantara.id/produk/kopi-arabika-gayo">
  <meta property="og:title" content="Jual Kopi Arabika Gayo Asli Aceh 250gr">
  <meta property="og:description" content="Beli kopi arabika gayo premium langsung dari petani Aceh dengan cita rasa otentik.">
  <meta property="og:image" content="https://tokokopinusantara.id/assets/kopi-arabika-gayo-kemasan.webp">
  <meta property="og:type" content="product">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Kopi Arabika Gayo Asli Aceh 250gr",
    "image": "https://tokokopinusantara.id/assets/kopi-arabika-gayo-kemasan.webp",
    "description": "Biji kopi arabika gayo pilihan dipetik merah dari dataran tinggi Aceh.",
    "brand": {
      "@type": "Brand",
      "name": "Toko Kopi Nusantara"
    },
    "offers": {
      "@type": "Offer",
      "price": 85000,
      "priceCurrency": "IDR",
      "availability": "https://schema.org/InStock",
      "url": "https://tokokopinusantara.id/produk/kopi-arabika-gayo"
    }
  }
  </script>
</head>
<body>
  <header>
    <h1>Kopi Arabika Gayo Asli Asal Dataran Tinggi Aceh</h1>
  </header>
  <main>
    <h2>Cita Rasa dan Karakteristik Kopi Arabika Gayo</h2>
    <p>Kopi arabika gayo dikenal dengan tingkat keasaman yang seimbang, body tebal, serta aroma floral dan rempah yang kuat. Ditanam pada ketinggian 1.400 mdpl di dataran tinggi tanah Gayo, biji kopi arabika gayo ini dipetik merah dan diproses dengan teknik semi-washed tradisional untuk menjaga kemurnian rasa.</p>
    <p>Setiap cangkir menyuguhkan kelezatan otentik yang telah memenangkan berbagai apresiasi cupping internasional. Sangat cocok dinikmati untuk seduhan manual pour over (V60), French Press, maupun espresso harian di rumah.</p>
    <h2>Pilihan Profil Sangrai dan Spesifikasi Biji Kopi</h2>
    <p>Kami menyediakan varian medium roast untuk menonjolkan aroma buah-buahan segar dan medium-dark roast untuk aftertaste cokelat karamel yang pekat. Biji kopi dikemas dalam pouch ber-valve untuk mempertahankan kesegaran hingga 6 bulan.</p>
    <p>Tersedia dalam bentuk biji utuh (whole beans) atau gilingan bubuk halus, sedang, maupun kasar sesuai metode seduh favorit Anda.</p>
    <img src="https://tokokopinusantara.id/assets/kopi-arabika-gayo-kemasan.webp" alt="Kemasan Kopi Arabika Gayo 250 gram dengan ziplock dan valve satu arah" width="600" height="600" loading="lazy">
    <img src="https://tokokopinusantara.id/assets/biji-kopi-gayo.webp" alt="Biji kopi arabika gayo setelah disangrai sempurna" width="600" height="400" loading="lazy">
    <p>Harga Rp85.000 per kemasan 250 gram. Dapatkan diskon ongkir khusus pembelian hari ini melalui website resmi Toko Kopi Nusantara.</p>
    <a href="/checkout?sku=gayo-250">Pesan Kopi Arabika Gayo</a>
    <a href="/panduan-seduh">Panduan Seduh Kopi Manual</a>
    <a href="/kategori/kopi-nusantara">Lihat Koleksi Kopi Lainnya</a>
  </main>
</body>
</html>`,
  },
  {
    name: 'Kasus Nyata seo.md (Halaman Produk Singkat Tanpa Schema)',
    url: 'https://tokokopinusantara.id/produk/kopi-arabika-gayo',
    keyword: 'kopi arabika gayo',
    html: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jual Kopi Arabika Gayo Asli Aceh 250gr - Toko Kopi Nusantara</title>
  <meta name="description" content="Beli kopi arabika gayo premium langsung dari petani Aceh. Biji kopi pilihan dengan aroma fruity harum, dipanggang segar setiap minggu untuk cita rasa terbaik.">
  <link rel="canonical" href="https://tokokopinusantara.id/produk/kopi-arabika-gayo">
</head>
<body>
  <header>
    <h1>Kopi Arabika Gayo Asli Asal Dataran Tinggi Aceh</h1>
  </header>
  <main>
    <h2>Cita Rasa dan Karakteristik Kopi Arabika Gayo</h2>
    <p>Kopi arabika gayo dikenal dengan tingkat keasaman yang seimbang, body tebal, serta aroma floral dan rempah yang kuat. Ditanam pada ketinggian 1.400 mdpl di dataran tinggi tanah Gayo, biji kopi arabika gayo ini dipetik merah dan diproses dengan teknik semi-washed tradisional untuk menjaga kemurnian rasa.</p>
    <p>Setiap cangkir menyuguhkan kelezatan otentik yang telah memenangkan berbagai apresiasi cupping internasional. Sangat cocok dinikmati untuk seduhan manual pour over (V60), French Press, maupun espresso harian di rumah.</p>
    <h2>Pilihan Profil Sangrai (Roast Profile)</h2>
    <p>Kami menyediakan varian medium roast untuk menonjolkan aroma buah-buahan segar dan medium-dark roast untuk Anda yang menyukai aftertaste cokelat karamel yang pekat.</p>
    <img src="https://tokokopinusantara.id/assets/kopi-arabika-gayo-kemasan.jpg" alt="Kemasan Kopi Arabika Gayo 250 gram dengan ziplock dan valve satu arah">
    <img src="https://tokokopinusantara.id/assets/biji-kopi-gayo.jpg" alt="Biji kopi arabika gayo setelah disangrai sempurna">
    <p>Dapatkan diskon ongkir khusus pembelian hari ini melalui website resmi Toko Kopi Nusantara.</p>
    <a href="/checkout?sku=gayo-250">Pesan Sekarang</a>
    <a href="/panduan-seduh">Panduan Seduh Kopi</a>
  </main>
</body>
</html>`,
  },
  {
    name: 'Landing Page Kurang Lengkap (Banyak Masalah Kritis)',
    url: 'http://warung-makan_enak.com/Menu_Spesial',
    keyword: 'nasi kebuli kambing',
    html: `<!DOCTYPE html>
<html>
<head>
  <!-- Missing title and description -->
</head>
<body>
  <!-- Missing H1 -->
  <p>Selamat datang di warung kami.</p>
  <img src="kebuli.jpg">
  <a href="#">Klik di sini</a>
</body>
</html>`,
  },
]

export default function SeoOptimizerPage() {
  const { business, user } = useAuth()
  const tenantId = business?.id || user?.id || 'guest'

  // Form states
  const [url, setUrl] = useState('')
  const [targetKeyword, setTargetKeyword] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [htmlSourceUrl, setHtmlSourceUrl] = useState('') // Tracks URL tied to current htmlContent
  const [showHtmlInput, setShowHtmlInput] = useState(false)

  // Request identity & race condition control (Context7 React official pattern)
  const activeRequestIdRef = useRef(0)
  const activeAbortRef = useRef(null)

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort()
    }
  }, [])

  // Process states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [currentAudit, setCurrentAudit] = useState(null)

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState('audit') // 'audit' | 'keywords' | 'competitors' | 'history'
  const [issueFilter, setIssueFilter] = useState('all') // 'all' | 'critical' | 'warning' | 'passed'

  // OpenSEO Vertical Slice: Keyword Research states
  const [researchQuery, setResearchQuery] = useState('')
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState(null)
  const [researchResults, setResearchResults] = useState([])

  // OpenSEO Vertical Slice: Competitor Insights states
  const [competitorQuery, setCompetitorQuery] = useState('')
  const [competitorLoading, setCompetitorLoading] = useState(false)
  const [competitorError, setCompetitorError] = useState(null)
  const [competitorResults, setCompetitorResults] = useState([])

  // Keyword research submit handler
  const handleKeywordResearchSubmit = async (e) => {
    e?.preventDefault()
    const q = researchQuery.trim()
    if (!q) {
      setResearchError('Masukkan kata kunci yang ingin diriset.')
      return
    }
    setResearchLoading(true)
    setResearchError(null)
    try {
      const res = await fetchSeoKeywordResearch({
        businessId: business?.id || user?.id,
        keywords: q.split(',').map((s) => s.trim()).filter(Boolean),
      })
      if (!res.ok) {
        setResearchError(res.error || res.message || 'Gagal memproses riset kata kunci.')
      } else {
        setResearchResults(Array.isArray(res.data) ? res.data : [])
      }
    } catch (err) {
      setResearchError(err?.message || 'Terjadi kesalahan sistem saat riset kata kunci.')
    } finally {
      setResearchLoading(false)
    }
  }

  // Competitor insights submit handler
  const handleCompetitorSubmit = async (e) => {
    e?.preventDefault()
    const domain = competitorQuery.trim()
    if (!domain) {
      setCompetitorError('Masukkan domain target untuk menganalisis pesaing.')
      return
    }
    setCompetitorLoading(true)
    setCompetitorError(null)
    try {
      const res = await fetchSeoCompetitors({
        businessId: business?.id || user?.id,
        targetDomain: domain,
      })
      if (!res.ok) {
        setCompetitorError(res.error || res.message || 'Gagal mengambil wawasan kompetitor.')
      } else {
        setCompetitorResults(Array.isArray(res.competitors) ? res.competitors : [])
      }
    } catch (err) {
      setCompetitorError(err?.message || 'Terjadi kesalahan sistem saat menganalisis pesaing.')
    } finally {
      setCompetitorLoading(false)
    }
  }

  // History state with zero cascading-render warnings
  const [history, setHistory] = useState(() => loadSeoAuditHistory(tenantId))
  const [lastTenantId, setLastTenantId] = useState(tenantId)

  // Sync state if tenantId changes during navigation/login switch
  if (lastTenantId !== tenantId) {
    setLastTenantId(tenantId)
    setHistory(loadSeoAuditHistory(tenantId))
  }

  // Handle URL change with stale state protection
  const handleUrlChange = (newUrl) => {
    setUrl(newUrl)
    // If htmlContent was associated with a different URL/template, invalidate it to prevent cross-contamination
    if (htmlSourceUrl && htmlSourceUrl !== newUrl.trim()) {
      setHtmlContent('')
      setHtmlSourceUrl('')
    }
  }

  // Handle template selection
  const handleApplyTemplate = (tpl) => {
    setUrl(tpl.url)
    setTargetKeyword(tpl.keyword)
    setHtmlContent(tpl.html)
    setHtmlSourceUrl(tpl.url)
    setShowHtmlInput(true)
    setError(null)
    setNotice(null)
  }

  // Run SEO Analysis with strict source identity and race condition protection
  const handleAnalyze = async (e) => {
    e?.preventDefault()
    if (loading) return

    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError('Masukkan URL yang ingin dianalisis terlebih dahulu.')
      return
    }

    // 1. Cancel previous in-flight request
    if (activeAbortRef.current) {
      activeAbortRef.current.abort()
    }
    const controller = new AbortController()
    activeAbortRef.current = controller

    // 2. Increment active request ID
    const currentRequestId = ++activeRequestIdRef.current

    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      // 3. Strict Source Identity Check:
      // Only use raw HTML if showHtmlInput is explicitly open AND it belongs to this URL
      let finalHtml = ''
      if (showHtmlInput && htmlContent.trim()) {
        if (htmlSourceUrl && htmlSourceUrl !== trimmedUrl) {
          // Stale HTML from a previous URL/template! Invalidate to prevent data mix-up.
          finalHtml = ''
          setHtmlContent('')
          setHtmlSourceUrl('')
        } else {
          finalHtml = htmlContent.trim()
        }
      }

      let effectiveFinalUrl = trimmedUrl

      // If no valid raw HTML is pasted, fetch via BisnisSehat backend Edge Function (SSRF & CORS safe)
      if (!finalHtml && /^https?:\/\//i.test(trimmedUrl)) {
        const fetchResult = await fetchTargetUrlForSeo({
          url: trimmedUrl,
          targetKeyword: targetKeyword.trim(),
        })

        if (currentRequestId !== activeRequestIdRef.current) return

        if (!fetchResult.ok) {
          setShowHtmlInput(true)
          setCurrentAudit(null)

          let userMessage = fetchResult.message
          if (fetchResult.code === 'TARGET_UNREACHABLE') {
            userMessage = 'Halaman target tidak dapat diambil otomatis dari server analisis.'
          } else if (fetchResult.code === 'TARGET_BLOCKED') {
            userMessage = 'Halaman target menolak akses otomatis (dilindungi proteksi bot/WAF).'
          } else if (fetchResult.code === 'TARGET_RATE_LIMITED') {
            userMessage = 'Server target menerapkan batas akses (HTTP 429 Rate Limited).'
          } else if (fetchResult.code === 'SSRF_REJECTED') {
            userMessage = fetchResult.message || 'Target URL dilarang oleh proteksi keamanan SSRF.'
          } else if (fetchResult.code === 'INVALID_URL') {
            userMessage = 'Format URL tidak valid. Pastikan URL menyertakan domain yang benar.'
          } else if (fetchResult.code === 'INVALID_CONTENT_TYPE' || fetchResult.code === 'NON_HTML_RESPONSE') {
            userMessage = 'Konten target bukan berupa dokumen HTML yang valid untuk audit SEO.'
          } else if (fetchResult.code === 'TIMEOUT' || fetchResult.code === 'TARGET_TIMEOUT') {
            userMessage = 'Koneksi ke server target memakan waktu terlalu lama (timeout).'
          }

          setError(userMessage)
          return
        }

        effectiveFinalUrl = fetchResult.finalUrl || trimmedUrl
        finalHtml = fetchResult.html || ''
      }

      if (currentRequestId !== activeRequestIdRef.current) return

      // Execute deterministic SEO audit with explicit audit ID
      const auditResult = runSeoAudit({
        url: trimmedUrl,
        finalUrl: effectiveFinalUrl,
        html: finalHtml,
        content: finalHtml,
        targetKeyword: targetKeyword.trim(),
      })

      if (currentRequestId !== activeRequestIdRef.current) return

      setCurrentAudit(auditResult)

      if (auditResult.hasSourceMismatch) {
        setNotice(auditResult.sourceMismatchReason)
      }

      // Persist to tenant-scoped history
      const updatedHistory = saveSeoAuditHistory(tenantId, auditResult)
      setHistory(updatedHistory)
    } catch (err) {
      if (currentRequestId === activeRequestIdRef.current) {
        setError(err.message || 'Terjadi kesalahan saat menganalisis SEO.')
        setCurrentAudit(null)
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setLoading(false)
      }
    }
  }

  // Delete single history entry
  const handleDeleteHistory = (auditId) => {
    const updated = deleteSeoAuditHistory(tenantId, auditId)
    setHistory(updated)
    if (currentAudit?.id === auditId) {
      setCurrentAudit(null)
    }
  }

  // Clear all history
  const handleClearAllHistory = () => {
    if (window.confirm('Yakin ingin menghapus seluruh riwayat audit SEO untuk bisnis ini?')) {
      clearSeoAuditHistory(tenantId)
      setHistory([])
      setCurrentAudit(null)
    }
  }

  // Filter issues based on active filter
  const displayedIssues = currentAudit
    ? issueFilter === 'all'
      ? [...currentAudit.issues, ...(currentAudit.unverified || []), ...currentAudit.passed]
      : issueFilter === 'critical'
      ? currentAudit.issues.filter((i) => i.severity === 'critical')
      : issueFilter === 'warning'
      ? currentAudit.issues.filter((i) => i.severity === 'warning')
      : issueFilter === 'unverified'
      ? (currentAudit.unverified || [])
      : currentAudit.passed
    : []

  return (
    <div className="space-y-6 pb-12">
      <BackButton fallbackUrl="/dashboard/marketing" label="Kembali" />
      {/* Header & Breadcrumb */}
      <div>
        <nav className="mb-2 flex items-center gap-2 text-xs text-text-muted">
          <Link to="/dashboard" className="hover:text-navy-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link to="/dashboard/marketing" className="hover:text-navy-700">
            Marketing
          </Link>
          <span>/</span>
          <span className="font-semibold text-navy-700">SEO Optimizer</span>
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-navy-700">SEO Optimizer</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Audit on-page SEO, struktur heading, meta tag, kepadatan kata kunci, dan teknis website
              UMKM secara nyata dan deterministik.
            </p>
          </div>
          {/* Top navigation tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('audit')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'audit'
                  ? 'bg-navy-700 text-white'
                  : 'border border-border bg-surface text-text-secondary hover:bg-cream'
              }`}
            >
              Audit On-Page
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'keywords'
                  ? 'bg-navy-700 text-white'
                  : 'border border-border bg-surface text-text-secondary hover:bg-cream'
              }`}
            >
              Riset Kata Kunci
            </button>
            <button
              onClick={() => setActiveTab('competitors')}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'competitors'
                  ? 'bg-navy-700 text-white'
                  : 'border border-border bg-surface text-text-secondary hover:bg-cream'
              }`}
            >
              Pesaing SERP
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-navy-700 text-white'
                  : 'border border-border bg-surface text-text-secondary hover:bg-cream'
              }`}
            >
              <span>Riwayat</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  activeTab === 'history'
                    ? 'bg-white/20 text-white'
                    : 'bg-navy-100 text-navy-700'
                }`}
              >
                {history.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW: AUDIT TAB */}
      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN: Input Form */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-navy-700">Form Analisis SEO</h2>
                <span className="text-xs text-text-muted">Real-time Engine</span>
              </div>

              {/* Sample Templates */}
              <div className="mb-4 rounded-xl border border-border/80 bg-warm-50/50 p-3">
                <p className="text-xs font-semibold text-navy-700">
                  Gunakan Contoh Cepat UMKM:
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {SAMPLE_TEMPLATES.map((tpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyTemplate(tpl)}
                      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-xs text-text-secondary hover:border-profit-300 hover:text-navy-800 transition-colors"
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAnalyze} className="space-y-4">
                {/* URL Input */}
                <div>
                  <label className="block text-xs font-semibold text-navy-700">
                    URL Halaman Web <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://tokoanda.com/produk/kopi-robusta"
                    disabled={loading}
                    className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-text-muted focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500 disabled:opacity-60"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Contoh: https://website-umkm.id atau http://toko.com/halaman
                  </p>
                </div>

                {/* Target Keyword Input */}
                <div>
                  <label className="block text-xs font-semibold text-navy-700">
                    Kata Kunci Sasaran (Opsional)
                  </label>
                  <input
                    type="text"
                    value={targetKeyword}
                    onChange={(e) => setTargetKeyword(e.target.value)}
                    placeholder="misal: kopi robusta dampit"
                    disabled={loading}
                    className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-text-muted focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500 disabled:opacity-60"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Sistem akan mengukur kepadatan kata kunci pada judul, deskripsi, dan konten.
                  </p>
                </div>

                {/* Toggle HTML Input */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowHtmlInput(!showHtmlInput)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-electric-600 hover:text-electric-500"
                  >
                    <span>{showHtmlInput ? '▼ Sembunyikan' : '▶ Tampilkan'} Kode HTML / Konten Lengkap</span>
                    <span className="text-[10px] text-text-muted">(Direkomendasikan untuk audit akurat)</span>
                  </button>

                  {showHtmlInput && (
                    <div className="mt-2.5">
                      <textarea
                        id="manual-html-input"
                        rows={8}
                        value={htmlContent}
                        onChange={(e) => {
                          setHtmlContent(e.target.value)
                          if (e.target.value.trim() && url.trim()) {
                            setHtmlSourceUrl(url.trim())
                          } else if (!e.target.value.trim()) {
                            setHtmlSourceUrl('')
                          }
                        }}
                        placeholder="Tempelkan source code HTML lengkap (misal: <html><head><title>...</title>...) atau salin konten teks halaman di sini..."
                        disabled={loading}
                        className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs text-navy-900 placeholder:text-text-muted focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500 disabled:opacity-60"
                      />
                      <p className="mt-1 text-[11px] text-text-muted">
                        Mendukung tag title, meta description, h1-h3, img alt, link canonical, dan teks artikel.
                      </p>
                    </div>
                  )}
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <p className="font-semibold">Gagal Menjalankan Analisis:</p>
                    <p className="mt-0.5 leading-relaxed">{error}</p>
                    <div className="mt-2.5 flex items-center justify-between border-t border-red-200/70 pt-2">
                      <span className="text-[11px] font-medium text-red-800">Tersedia Fallback:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowHtmlInput(true)
                          const el = document.getElementById('manual-html-input')
                          if (el) el.focus()
                        }}
                        className="inline-flex items-center gap-1 font-bold text-red-900 underline hover:text-red-950 text-[11px]"
                      >
                        Buka Analisis HTML Manual &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {/* Notice Banner */}
                {notice && (
                  <div className="rounded-xl border border-warm-200 bg-warm-50 p-3 text-xs text-warm-500">
                    <p className="font-semibold">Info Perayapan:</p>
                    <p className="mt-0.5 leading-relaxed">{notice}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-profit-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-profit-500 disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Memuat halaman untuk dianalisis...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>Jalankan Audit SEO</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT COLUMN: Audit Result */}
          <div className="lg:col-span-7">
            {currentAudit ? (
              <div className="space-y-6">
                {/* Source Mismatch Warning Alert */}
                {currentAudit.hasSourceMismatch && (
                  <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-xs text-red-900 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-sm text-red-800">
                      <span>⚠️ Peringatan Ketidakcocokan Sumber Konten (Source Mismatch)</span>
                    </div>
                    <p className="mt-1 leading-relaxed text-red-700">
                      {currentAudit.sourceMismatchReason}
                    </p>
                    <p className="mt-2 text-[11px] text-red-600">
                      Pastikan input URL dan kode HTML merujuk ke website yang sama agar hasil evaluasi akurat.
                    </p>
                  </div>
                )}

                {/* Score Summary Card */}
                <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
                  <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-block rounded-full bg-navy-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy-700">
                          {currentAudit.pageTypeLabel || 'Hasil Audit SEO'}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            currentAudit.confidence === 'HIGH'
                              ? 'bg-profit-50 text-profit-700'
                              : currentAudit.confidence === 'MEDIUM'
                              ? 'bg-warm-50 text-warm-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Akurasi: {currentAudit.confidence === 'HIGH' ? 'Tinggi' : currentAudit.confidence === 'MEDIUM' ? 'Sedang' : 'Terbatas'}
                        </span>
                      </div>
                      <h3 className="mt-1.5 break-all text-base font-bold text-navy-700">
                        {currentAudit.requestedUrl || currentAudit.url}
                      </h3>
                      {currentAudit.isRedirected && (
                        <p className="mt-0.5 text-xs text-warm-600">
                          Dialihkan ke: <span className="font-mono text-navy-700">{currentAudit.finalUrl}</span>
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span>Waktu: {new Date(currentAudit.analyzedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                        {currentAudit.targetKeyword && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-electric-600">
                              Kata Kunci: "{currentAudit.targetKeyword}"
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Radial / Badge Score */}
                    <div className="flex items-center gap-3 self-center sm:self-auto">
                      <div className="text-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className={`text-4xl font-black ${currentAudit.gradeColor}`}>
                            {currentAudit.totalScore}
                          </span>
                          <span className="text-sm font-semibold text-text-muted">/100</span>
                        </div>
                        <span className={`mt-0.5 inline-block text-xs font-bold ${currentAudit.gradeColor}`}>
                          Grade {currentAudit.grade} • {currentAudit.gradeLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Category Breakdown Bars */}
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Object.entries(currentAudit.breakdown).map(([key, item]) => {
                      const pct = Math.round((item.score / item.max) * 100)
                      return (
                        <div key={key} className="rounded-xl border border-border/80 bg-cream/40 p-3">
                          <p className="text-[11px] font-medium text-text-secondary">{item.label}</p>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-base font-bold text-navy-700">
                              {item.score}
                              <span className="text-xs text-text-muted font-normal">/{item.max}</span>
                            </span>
                            <span className="text-[11px] font-semibold text-text-muted">{pct}%</span>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 80 ? 'bg-profit-500' : pct >= 55 ? 'bg-warm-400' : 'bg-red-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {item.evidence && (
                            <p className="mt-1.5 line-clamp-2 text-[10px] text-text-muted">
                              {item.evidence}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Score Explanation: Evidence-Based Rationale */}
                  {currentAudit.scoreExplanation && (
                    <div className="mt-5 rounded-xl border border-border/80 bg-warm-50/40 p-4 text-xs">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-navy-800 flex items-center gap-1.5">
                          <span>💡</span>
                          <span>Mengapa Skor Halaman Ini {currentAudit.totalScore}/100?</span>
                        </h4>
                        <span className="text-[10px] font-semibold text-text-muted uppercase">Evidence-Based</span>
                      </div>
                      <p className="mt-1.5 text-text-secondary leading-relaxed">
                        {currentAudit.scoreExplanation.summary}
                      </p>
                      {currentAudit.scoreExplanation.topPriorities?.length > 0 && (
                        <div className="mt-2.5">
                          <span className="font-semibold text-navy-700">Fokus Peningkatan Terpenting:</span>
                          <ul className="mt-1 list-disc list-inside space-y-0.5 text-text-secondary">
                            {currentAudit.scoreExplanation.topPriorities.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Meta Snapshot */}
                  <div className="mt-5 rounded-xl border border-border bg-surface p-4 text-xs">
                    <p className="font-semibold text-navy-700">Ringkasan Metadata Terdeteksi:</p>
                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-text-secondary">
                      <div>
                        <span className="block text-[11px] text-text-muted">Tag Title</span>
                        <span className="font-medium text-navy-900">
                          {currentAudit.metadata.title ? `${currentAudit.metadata.title.length} char` : 'Tidak Ada'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-text-muted">Meta Description</span>
                        <span className="font-medium text-navy-900">
                          {currentAudit.metadata.metaDescription ? `${currentAudit.metadata.metaDescription.length} char` : 'Tidak Ada'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-text-muted">Heading H1 / H2</span>
                        <span className="font-medium text-navy-900">
                          {currentAudit.metadata.h1Count} H1 / {currentAudit.metadata.h2Count} H2
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-text-muted">Teks Utama</span>
                        <span className="font-medium text-navy-900">
                          {currentAudit.metadata.mainWordCount || currentAudit.metadata.wordCount} kata
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filterable Issues and Recommendations */}
                <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-navy-700">
                        Daftar Temuan & Rekomendasi
                      </h4>
                      <p className="text-xs text-text-secondary">
                        Langkah praktis berbasis bukti nyata untuk meningkatkan kualitas halaman
                      </p>
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setIssueFilter('all')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          issueFilter === 'all'
                            ? 'bg-navy-700 text-white'
                            : 'bg-cream text-text-secondary hover:bg-navy-100'
                        }`}
                      >
                        Semua ({currentAudit.issues.length + (currentAudit.unverified?.length || 0) + currentAudit.passed.length})
                      </button>
                      <button
                        onClick={() => setIssueFilter('critical')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          issueFilter === 'critical'
                            ? 'bg-red-600 text-white'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        Kritis ({currentAudit.counts.critical})
                      </button>
                      <button
                        onClick={() => setIssueFilter('warning')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          issueFilter === 'warning'
                            ? 'bg-warm-500 text-white'
                            : 'bg-warm-50 text-warm-500 hover:bg-warm-100'
                        }`}
                      >
                        Peringatan ({currentAudit.counts.warning})
                      </button>
                      {currentAudit.counts.unverified > 0 && (
                        <button
                          onClick={() => setIssueFilter('unverified')}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            issueFilter === 'unverified'
                              ? 'bg-slate-700 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Belum Diverifikasi ({currentAudit.counts.unverified})
                        </button>
                      )}
                      <button
                        onClick={() => setIssueFilter('passed')}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          issueFilter === 'passed'
                            ? 'bg-profit-600 text-white'
                            : 'bg-profit-50 text-profit-600 hover:bg-profit-100'
                        }`}
                      >
                        Lolos ({currentAudit.counts.passed})
                      </button>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div className="mt-5 space-y-3">
                    {displayedIssues.length === 0 ? (
                      <p className="py-6 text-center text-xs text-text-muted">
                        Tidak ada temuan pada filter ini.
                      </p>
                    ) : (
                      displayedIssues.map((issue) => {
                        const isCrit = issue.severity === 'critical'
                        const isWarn = issue.severity === 'warning'
                        const isUnverified = !issue.severity && (currentAudit.unverified || []).some((u) => u.id === issue.id)
                        const isPass = !issue.severity && !isUnverified

                        return (
                          <div
                            key={issue.id}
                            className={`rounded-xl border p-4 transition-all ${
                              isCrit
                                ? 'border-red-200 bg-red-50/40'
                                : isWarn
                                ? 'border-warm-200 bg-warm-50/40'
                                : isUnverified
                                ? 'border-slate-200 bg-slate-50/40'
                                : 'border-profit-200 bg-profit-50/30'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Status Icon */}
                              <div className="mt-0.5 shrink-0">
                                {isCrit && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </span>
                                )}
                                {isWarn && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warm-100 text-warm-500">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                  </span>
                                )}
                                {isUnverified && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </span>
                                )}
                                {isPass && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-profit-100 text-profit-600">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </span>
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                      isCrit
                                        ? 'bg-red-100 text-red-700'
                                        : isWarn
                                        ? 'bg-warm-100 text-warm-500'
                                        : isUnverified
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-profit-100 text-profit-700'
                                    }`}
                                  >
                                    {isCrit ? 'Kritis' : isWarn ? 'Peringatan' : isUnverified ? 'Belum Terverifikasi' : 'Lolos'}
                                  </span>
                                  <h5 className="text-sm font-bold text-navy-800">
                                    {issue.title}
                                  </h5>
                                </div>
                                <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                                  {issue.message}
                                </p>

                                {/* Actionable Recommendation */}
                                {issue.recommendation && (
                                  <div className="mt-2.5 rounded-lg border border-border/80 bg-surface p-2.5 text-xs text-navy-700">
                                    <span className="font-semibold text-profit-600">💡 Rekomendasi Solusi: </span>
                                    <span>{issue.recommendation}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Empty Audit State */
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 p-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-navy-400">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-bold text-navy-700">Belum Ada Hasil Audit</h3>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  Masukkan alamat URL website atau pilih salah satu template contoh di sebelah kiri, lalu klik{' '}
                  <strong className="text-navy-700">"Jalankan Audit SEO"</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: KEYWORDS RESEARCH TAB (OpenSEO / DataForSEO vertical slice) */}
      {activeTab === 'keywords' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <div className="mb-4">
              <h2 className="text-base font-bold text-navy-700">Riset Kata Kunci Google</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Cari volume pencarian bulanan, estimasi CPC, dan tingkat persaingan kata kunci di Google Indonesia.
              </p>
            </div>

            <form onSubmit={handleKeywordResearchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-700">
                  Kata Kunci Sasaran <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    placeholder="misal: kopi gayo, kopi robusta lampung, hampers kopi"
                    disabled={researchLoading}
                    className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-text-muted focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={researchLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-profit-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-profit-500 disabled:opacity-60 shadow-xs cursor-pointer"
                  >
                    {researchLoading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Mencari data...</span>
                      </>
                    ) : (
                      <span>Riset Kata Kunci</span>
                    )}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-text-muted">
                  Pisahkan beberapa kata kunci dengan tanda koma (maksimal 10 kata kunci per pencarian).
                </p>
              </div>

              {researchError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold">Informasi Engine:</p>
                  <p className="mt-0.5 leading-relaxed">{researchError}</p>
                </div>
              )}
            </form>
          </div>

          {/* Results table */}
          {researchResults.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
              <h3 className="text-base font-bold text-navy-700">Hasil Analisis Kata Kunci</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Data metrik pasar Google Search Indonesia (ID)
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-cream/40 text-text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Kata Kunci</th>
                      <th className="px-4 py-3 font-semibold">Volume Pencarian</th>
                      <th className="px-4 py-3 font-semibold">CPC (USD)</th>
                      <th className="px-4 py-3 font-semibold">Persaingan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {researchResults.map((item, idx) => (
                      <tr key={idx} className="hover:bg-cream/20">
                        <td className="px-4 py-3 font-medium text-navy-900">{item.keyword}</td>
                        <td className="px-4 py-3 text-text-secondary font-mono">{Number(item.search_volume || 0).toLocaleString('id-ID')} /bln</td>
                        <td className="px-4 py-3 text-text-secondary font-mono">${Number(item.cpc || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                            item.competition_level === 'HIGH' ? 'bg-red-100 text-red-700' : item.competition_level === 'MEDIUM' ? 'bg-warm-100 text-warm-700' : 'bg-profit-100 text-profit-700'
                          }`}>
                            {item.competition_level || 'LOW'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: COMPETITORS INSIGHTS TAB (OpenSEO / DataForSEO vertical slice) */}
      {activeTab === 'competitors' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs">
            <div className="mb-4">
              <h2 className="text-base font-bold text-navy-700">Wawasan Pesaing SERP</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Petakan domain kompetitor yang memperebutkan visibilitas organik pada Google Search.
              </p>
            </div>

            <form onSubmit={handleCompetitorSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-700">
                  Domain Website atau Toko <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={competitorQuery}
                    onChange={(e) => setCompetitorQuery(e.target.value)}
                    placeholder="misal: tokokopi.id atau website-umkm.id"
                    disabled={competitorLoading}
                    className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-text-muted focus:border-profit-500 focus:outline-none focus:ring-1 focus:ring-profit-500 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={competitorLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-profit-600 px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-profit-500 disabled:opacity-60 shadow-xs cursor-pointer"
                  >
                    {competitorLoading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Menganalisis...</span>
                      </>
                    ) : (
                      <span>Cari Pesaing</span>
                    )}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-text-muted">
                  Masukkan domain tanpa https:// (contoh: kopikenangan.com).
                </p>
              </div>

              {competitorError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold">Informasi Engine:</p>
                  <p className="mt-0.5 leading-relaxed">{competitorError}</p>
                </div>
              )}
            </form>
          </div>

          {/* Results table */}
          {competitorResults.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
              <h3 className="text-base font-bold text-navy-700">Daftar Pesaing Teratas</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Peringkat visibilitas kompetitor di Google
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-cream/40 text-text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Domain Pesaing</th>
                      <th className="px-4 py-3 font-semibold">Rata-rata Posisi</th>
                      <th className="px-4 py-3 font-semibold">Skor Visibilitas</th>
                      <th className="px-4 py-3 font-semibold">Relevansi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {competitorResults.map((item, idx) => (
                      <tr key={idx} className="hover:bg-cream/20">
                        <td className="px-4 py-3 font-medium text-navy-900">{item.domain}</td>
                        <td className="px-4 py-3 text-text-secondary font-mono">{item.avg_position ? Number(item.avg_position).toFixed(1) : '-'}</td>
                        <td className="px-4 py-3 text-text-secondary font-mono">{Number(item.visibility || 0).toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 text-profit-600 font-semibold">{item.competitor_relevance ? `${Math.round(item.competitor_relevance * 100)}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-navy-700">
                Riwayat Audit SEO Bisnis Anda
              </h2>
              <p className="text-xs text-text-secondary">
                Tersimpan secara lokal per tenant bisnis ({business?.name || tenantId})
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllHistory}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Hapus Semua Riwayat
              </button>
            )}
          </div>

          <div className="mt-6">
            {history.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs text-text-muted">
                  Belum ada riwayat audit yang tersimpan untuk bisnis ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-cream/40 text-text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">URL Halaman</th>
                      <th className="px-4 py-3 font-semibold">Kata Kunci</th>
                      <th className="px-4 py-3 font-semibold">Skor & Grade</th>
                      <th className="px-4 py-3 font-semibold">Temuan</th>
                      <th className="px-4 py-3 font-semibold">Tanggal</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-cream/20">
                        <td className="max-w-[220px] truncate px-4 py-3 font-medium text-navy-900">
                          {item.url}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {item.targetKeyword ? `"${item.targetKeyword}"` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${item.gradeColor}`}>
                            {item.totalScore}/100 (Grade {item.grade})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {item.counts.critical > 0 && (
                            <span className="mr-1 text-red-600 font-semibold">
                              {item.counts.critical} Kritis
                            </span>
                          )}
                          {item.counts.warning > 0 && (
                            <span className="text-warm-500 font-semibold">
                              {item.counts.warning} Peringatan
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-muted">
                          {new Date(item.analyzedAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setCurrentAudit(item)
                                setUrl(item.requestedUrl || item.url)
                                setTargetKeyword(item.targetKeyword || '')
                                setHtmlContent('')
                                setHtmlSourceUrl('')
                                setShowHtmlInput(false)
                                setActiveTab('audit')
                                setError(null)
                                setNotice(item.hasSourceMismatch ? item.sourceMismatchReason : null)
                              }}
                              className="rounded bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:bg-navy-100 transition-colors"
                            >
                              Lihat
                            </button>
                            <button
                              onClick={() => handleDeleteHistory(item.id)}
                              className="rounded px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
