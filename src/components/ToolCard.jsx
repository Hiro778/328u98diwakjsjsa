import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

const TOOL_DESCRIPTIONS = {
  'HPP Calculator': 'Kalkulasi bahan baku & ongkos kerja per unit.',
  'Margin Analysis': 'Analisis margin kotor & kontribusi laba produk.',
  'BEP Calculator': 'Target volume & omzet titik impas modal.',
  'Cash Flow Forecast': 'Peramalan saldo kas & proyeksi likuiditas.',
  'Tax Planning': 'Perencanaan & estimasi kewajiban pajak UMKM.',
  'Financial Reports': 'Laporan laba rugi, neraca, & arus kas.',
  'Anomaly Detection': 'Deteksi dini lonjakan biaya & deviasi kas.',
  'Financial Health Score': 'Audit rasio & skor kesehatan finansial usaha.',
  'Loan Simulation': 'Simulasi cicilan bunga & pelunasan pinjaman.',
  'QR Menu & Pesanan': 'Katalog digital & pemesanan mandiri via QR meja.',
  'POS / Kasir': 'Antarmuka kasir cepat untuk meja & dine-in.',
  'Inventory Management': 'Manajemen stok gudang & auto-deduct bahan baku.',
  'Supplier Database': 'Direktori data supplier & riwayat pasokan.',
  'Production Capacity Planner': 'Perencanaan kapasitas produksi & jadwal kerja.',
  'Excel Penjualan Otomatis': 'Export dan kelola laporan penjualan otomatis dalam format Excel.',
  'Telegram Operasional': 'Notifikasi & otomasi asisten operasional bot.',
  'Customer CRM': 'Database loyalitas, riwayat order, & segmen pelanggan.',
  'Invoice Follow-up': 'Manajemen & pengingat piutang jatuh tempo.',
  'Loyalty Program': 'Sistem poin reward & retensi belanja pelanggan.',
  'WhatsApp Sales Tracker': 'Pipeline prospek & konversi penjualan WhatsApp.',
  'AI Creative Studio': 'Generator materi copy promosi & visual produk.',
  'AI Video Generator': 'Generator video promosi produk otomatis bertenaga Atlas Cloud.',
  'Competitor Analysis': 'Riset produk, harga, & strategi kompetitor.',
  'Ads': 'Kalkulator ROAS & atribusi konversi kampanye iklan.',
  'SEO Optimizer': 'Audit kata kunci & optimasi Google Maps lokal.',
  'Content Calendar': 'Perencanaan & jadwal penerbitan konten medsos.',
  'A/B Testing': 'Uji varian penawaran diskon vs bundling produk.',
  'Legalitas Checker': 'Panduan perizinan NIB, sertifikasi halal, & BPOM.',
  'Real-time Dashboard': 'Ringkasan performa penjualan & metrik utama.',
  'Benchmarking': 'Komparasi performa metrik terhadap standar industri.',
  'Weekly Recap': 'Ringkasan performa & arahan evaluasi mingguan.',
  'Currency Risk Calculator': 'Kalkulasi risiko volatilitas nilai tukar valas.',
  'HS Code Lookup': 'Pencarian kode klasifikasi bea cukai komoditas.',
  'Import Duty Estimator': 'Estimasi tarif bea masuk & pajak impor resmi.',
  'Buyer Matching': 'Pencocokan profil agregator & importir luar negeri.',
  'Incoterms Guide': 'Ketentuan syarat perdagangan & serah terima barang.',
  'Export Documents': 'Daftar kelengkapan & template berkas ekspor.',
  'Certification Guide': 'Standar sertifikasi mutu & kepatuhan internasional.',
  'Freight Estimator': 'Estimasi ongkos kirim logistik laut & udara.',
  'Localization Tool': 'Penyesuaian bahasa, label, & preferensi pasar target.',
}

function getToolContextIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('hpp') || n.includes('bep') || n.includes('tax') || n.includes('margin') || n.includes('calculator')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  }
  if (n.includes('pos') || n.includes('qr') || n.includes('kasir')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M4 8h4m12 0h.01M4 16h4m4 4h.01M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6z" />
      </svg>
    )
  }
  if (n.includes('excel') || n.includes('spreadsheet')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
  if (n.includes('inventory') || n.includes('stok') || n.includes('supplier') || n.includes('capacity')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )
  }
  if (n.includes('creative') || n.includes('ai') || n.includes('studio')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  }
  if (n.includes('seo') || n.includes('competitor') || n.includes('ads') || n.includes('testing')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )
  }
  if (n.includes('crm') || n.includes('customer') || n.includes('whatsapp') || n.includes('loyalty')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  }
  if (n.includes('legal') || n.includes('compliance')) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  }
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

export default function ToolCard({ tool }) {
  const navigate = useNavigate()
  const { isPro, hasUsedFreeAi } = useAuth()

  // 1. AVAILABILITY vs ENTITLEMENT separation (per soon.md)
  // Availability status takes precedence: COMING_SOON tools do NOT carry Free or Pro entitlement.
  const isComingSoon = tool.status === 'coming_soon' || tool.availability === 'COMING_SOON'
  const needsConnection = tool.status === 'needs_connection'

  // Canonical Entitlement Determination per free.md & pro.md:
  // Source-of-truth priority:
  // 1. Explicit tool catalog configuration (tool.requiresPro, tool.isFree)
  // 2. Designated free tool fallbacks (HPP, BEP, SEO, Legalitas, Transaksi Manual)
  const isAiStudio = tool.name === 'AI Creative Studio' || tool.path?.includes('content-generator')
  const isExplicitPro = tool.requiresPro === true
  const isExplicitFree = tool.requiresPro === false || tool.isFree === true
  const isHpp = tool.name === 'HPP Calculator' || tool.name?.toLowerCase().includes('hpp') || tool.path?.includes('hpp')
  const isBep = tool.name === 'BEP Calculator' || tool.name === 'Break-even Point Calculator' || tool.name?.toLowerCase().includes('bep') || tool.name?.toLowerCase().includes('break-even') || tool.name?.toLowerCase().includes('break even') || tool.path?.includes('bep')
  const isSeo = tool.name === 'SEO Optimizer' || tool.path?.includes('seo')
  const isLegal = tool.name === 'Legalitas Checker' || tool.path?.includes('legalitas')
  const isManualTx = tool.name?.toLowerCase().includes('transaksi manual')

  // Tool is free only if LIVE and marked/designated free
  const isFreeTool = !isComingSoon && !isAiStudio && (isHpp || isBep || isExplicitFree || (!isExplicitPro && (isSeo || isLegal || isManualTx)))

  // Entitlement determination
  let isLocked = false
  let showLockIcon = false
  let badgeConfig = null

  if (isFreeTool) {
    // 100% Free tool per free.md
    isLocked = false
    showLockIcon = false
    badgeConfig = {
      label: isSeo ? 'Gratis • Unlimited' : 'Gratis',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-400',
    }
  } else if (isAiStudio) {
    // Canonical Entitlement (pro.md & Context7 design.md):
    // AI Creative Studio is NOT Pro-only.
    // Free = 1x lifetime free generation, then requires purchased tokens.
    // Never locked for Free users.
    isLocked = false
    showLockIcon = false
    if (isPro) {
      badgeConfig = {
        label: 'Siap Digunakan',
        classes: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
        dot: 'bg-indigo-400',
      }
    } else if (!hasUsedFreeAi) {
      badgeConfig = {
        label: 'Gratis • 1x',
        classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-400',
      }
    } else {
      badgeConfig = {
        label: 'Token diperlukan',
        classes: 'bg-slate-800 text-slate-400 border-slate-700',
        dot: 'bg-slate-400',
      }
    }
  } else if (isComingSoon) {
    // COMING_SOON tools have NO Free or Pro entitlement (per soon.md)
    // - No "Gratis" badge
    // - No "Pro" badge
    // - No lock icon
    // - No paywall trigger
    isLocked = false
    showLockIcon = false
    badgeConfig = {
      label: 'Coming Soon',
      classes: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
      dot: 'bg-slate-500',
    }
  } else if (needsConnection) {
    badgeConfig = {
      label: 'Perlu Koneksi',
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
    }
  } else if (!isPro) {
    // All other live tools are Pro-gated per free.md Section 3 & 5
    isLocked = true
    showLockIcon = true
    badgeConfig = {
      label: 'Pro',
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      icon: '🔒',
      dot: null,
    }
  } else if (tool.path) {
    // Pro user has full unlocked access
    badgeConfig = {
      label: 'Siap Digunakan',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-400',
    }
  } else {
    badgeConfig = {
      label: 'Info',
      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      dot: 'bg-blue-400',
    }
  }

  function handleClick() {
    if (isComingSoon) return
    if (isLocked) {
      // Pro tool locked for free user: direct to upgrade
      navigate('/pricing')
      return
    }
    if (tool.path) {
      navigate(tool.path)
    }
  }

  const description = tool.description || tool.desc || TOOL_DESCRIPTIONS[tool.name] || 'Instrumen bisnis terintegrasi BisnisSehat.'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isComingSoon}
      title={isLocked ? 'Upgrade ke Pro' : undefined}
      className={`group relative flex w-full flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 min-h-[148px] ${
        isComingSoon
          ? 'cursor-default border-[#222C3E]/60 bg-[#151D2C]/40 opacity-55'
          : isLocked
          ? 'cursor-pointer border-amber-500/20 bg-[#151D2C] hover:border-amber-500/40 hover:bg-[#1E293B]/70 shadow-xs'
          : 'cursor-pointer border-[#222C3E] bg-[#151D2C] hover:border-[#818CF8]/40 hover:bg-[#1E293B]/80 shadow-xs hover:-translate-y-0.5'
      }`}
    >
      <div className="w-full">
        {/* Top Context & Action Row */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#222C3E] bg-[#1E293B] text-slate-400 group-hover:text-slate-200 group-hover:border-[#818CF8]/30 transition-colors">
            {getToolContextIcon(tool.name)}
          </div>

          {showLockIcon ? (
            <span
              title="Upgrade ke Pro"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
          ) : (
            !isComingSoon && (
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-[#818CF8] transition-all group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )
          )}
        </div>

        {/* Tool Name */}
        <h3 className={`text-sm font-semibold tracking-tight transition-colors line-clamp-1 ${
          isLocked ? 'text-slate-200' : 'text-white group-hover:text-[#818CF8]'
        }`}>
          {tool.name}
        </h3>

        {/* Concise Description */}
        <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-2">
          {description}
        </p>
      </div>

      {/* Access/Status & Action Row */}
      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-[#222C3E]/70 w-full">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium font-mono ${badgeConfig.classes}`}
        >
          {badgeConfig.icon ? (
            <span className="text-[10px] leading-none">{badgeConfig.icon}</span>
          ) : badgeConfig.dot ? (
            <span className={`h-1.5 w-1.5 rounded-full ${badgeConfig.dot}`} />
          ) : null}
          {badgeConfig.label}
        </span>

        {isComingSoon ? (
          <span className="text-[11px] font-mono text-slate-500">
            Segera Hadir
          </span>
        ) : tool.path ? (
          <span className="text-[11px] font-medium text-slate-400 group-hover:text-[#818CF8] transition-colors">
            {isLocked ? 'Upgrade Pro' : 'Buka Tool'}
          </span>
        ) : null}
      </div>
    </button>
  )
}
