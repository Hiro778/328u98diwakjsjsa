export const PLANS = {
  BASIC: 'basic',
  PRO: 'pro',
  FREE: 'free', // Kept for legacy backward compatibility
}

export const PLAN_CONFIG = {
  [PLANS.BASIC]: {
    label: 'Basic',
    displayName: 'BisnisSehat Basic',
    price: 35000,
    priceLabel: 'Rp35K / bulan',
    priceDetail: 'Rp35.000 / bulan',
    description: 'Akses penuh ke kumpulan tools bisnis kalkulasi standalone.',
  },
  [PLANS.PRO]: {
    label: 'Pro',
    displayName: 'BisnisSehat Pro',
    price: 130000,
    priceLabel: 'Rp130K / bulan',
    priceDetail: 'Rp130.000 / bulan',
    description: 'Semua fitur Basic plus POS, database bisnis, inventori, CRM, analitik, dan AI.',
  },
  [PLANS.FREE]: {
    label: 'Free',
    displayName: 'BisnisSehat Free (Legacy)',
    price: null,
    priceLabel: 'Legacy',
    priceDetail: 'Paket Lama',
    isLegacy: true,
  },
}

export function getPlanDisplay(plan) {
  return PLAN_CONFIG[plan] || PLAN_CONFIG[PLANS.FREE]
}

export const TOOL_AVAILABILITY = {
  LIVE: 'LIVE',
  COMING_SOON: 'COMING_SOON',
}

export const CATEGORIES = {
  finance: {
    id: 'finance',
    title: 'Keuangan',
    color: '#F5A623',
    tools: [
      { name: 'HPP Calculator', path: '/dashboard/keuangan/hpp-calculator', tier: 'basic', requiresPro: false, availability: 'LIVE' },
      { name: 'Margin Analysis', path: '/dashboard/keuangan/margin-analysis', tier: 'pro', requiresPro: true, availability: 'LIVE' },
      { name: 'BEP Calculator', path: '/dashboard/keuangan/bep-calculator', tier: 'basic', requiresPro: false, availability: 'LIVE' },
      { name: 'Cash Flow Forecast', path: '/dashboard/keuangan/cash-flow-forecast', tier: 'basic', requiresPro: false, availability: 'LIVE' },
      { name: 'Tax Planning', path: '/dashboard/keuangan/tax-planning', tier: 'basic', requiresPro: false, availability: 'LIVE' },
      { name: 'Financial Reports', path: '/dashboard/keuangan/financial-reports', tier: 'pro', requiresPro: true, availability: 'LIVE' },
      { name: 'Anomaly Detection', path: '/dashboard/keuangan/anomaly-detection', tier: 'pro', requiresPro: true, availability: 'LIVE' },
      { name: 'Financial Health Score', path: '/dashboard/keuangan/financial-health-score', tier: 'pro', requiresPro: true, availability: 'LIVE' },
      { name: 'Loan Simulation', path: '/dashboard/keuangan/loan-simulation', tier: 'basic', requiresPro: false, availability: 'LIVE' },
      { name: 'Kurs', path: '/dashboard/ekspor', tier: 'basic', requiresPro: false, availability: 'LIVE' },
    ],
  },
  operations: {
    id: 'operations',
    title: 'Operasional',
    color: '#F5A623',
    tools: [
      { name: 'QR Menu & Pesanan', path: '/dashboard/pos/qr-menu', tier: 'pro', requiresPro: true },
      { name: 'POS / Kasir', path: '/dashboard/pos', tier: 'pro', requiresPro: true },
      { name: 'Inventory Management', path: '/dashboard/operasional/inventory', tier: 'pro', requiresPro: true },
      { name: 'Supplier Database', path: '/dashboard/operasional/suppliers', tier: 'pro', requiresPro: true },
      { name: 'Production Capacity Planner', path: '/dashboard/operasional/production-capacity', tier: 'pro', requiresPro: true },
      { name: 'Excel Penjualan Otomatis', path: '/dashboard/operasional/excel-penjualan', tier: 'pro', requiresPro: true },
    ],
  },
  sales: {
    id: 'sales',
    title: 'Penjualan & CRM',
    color: '#10B981',
    tools: [
      { name: 'Customer CRM', path: '/dashboard/penjualan/customer-crm', tier: 'pro', requiresPro: true },
      { name: 'Invoice Follow-up', path: '/dashboard/penjualan/invoice-follow-up', tier: 'pro', requiresPro: true },
      { name: 'Loyalty Program', path: '/dashboard/penjualan/loyalty-program', tier: 'pro', requiresPro: true },
      { name: 'WhatsApp Sales Tracker', path: '/dashboard/penjualan/whatsapp-sales-tracker', tier: 'pro', requiresPro: true },
    ],
  },
  marketing: {
    id: 'marketing',
    title: 'Marketing',
    color: '#818CF8',
    tools: [
      { name: 'AI Creative Studio', path: '/dashboard/marketing/content-generator', tier: 'basic', requiresPro: false },
      { name: 'AI Video Generator', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Competitor Analysis', path: '/dashboard/marketing/competitor-analysis', tier: 'pro', requiresPro: true },
      { name: 'Ads', path: '/dashboard/marketing/ads', tier: 'pro', requiresPro: true },
      { name: 'SEO Optimizer', path: '/dashboard/marketing/seo-optimizer', tier: 'pro', requiresPro: true },
      { name: 'Content Calendar', path: '/dashboard/marketing/content-calendar', tier: 'pro', requiresPro: true },
      { name: 'A/B Testing', path: '/dashboard/marketing/ab-testing', tier: 'pro', requiresPro: true },
    ],
  },
  legal: {
    id: 'legal',
    title: 'Legal & Compliance',
    color: '#10B981',
    tools: [
      { name: 'Legalitas Checker', path: '/dashboard/legalitas', tier: 'pro', requiresPro: true, availability: 'LIVE' },
      { name: 'Logo Analyzer', path: '/dashboard/legalitas?tab=logo', availability: 'COMING_SOON', status: 'coming_soon' },
    ],
  },
  export: {
    id: 'export',
    title: 'Kurs & Valuta Asing',
    color: '#6366F1',
    tools: [
      { name: 'Currency Risk Calculator', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'HS Code Lookup', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Import Duty Estimator', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Buyer Matching', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Incoterms Guide', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Export Documents', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Certification Guide', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Freight Estimator', availability: 'COMING_SOON', status: 'coming_soon' },
      { name: 'Localization Tool', availability: 'COMING_SOON', status: 'coming_soon' },
    ],
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    color: '#818CF8',
    tools: [
      { name: 'Real-time Dashboard', path: '/dashboard/analytics/realtime', tier: 'pro', requiresPro: true },
      { name: 'Benchmarking', path: '/dashboard/analytics/benchmarking', tier: 'pro', requiresPro: true },
      { name: 'Weekly Recap', path: '/dashboard/analytics/weekly-recap', tier: 'pro', requiresPro: true },
    ],
  },
}

export const SIDEBAR_NAV = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { id: 'keuangan', label: 'Keuangan', path: '/dashboard/keuangan', categoryId: 'finance', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' },
  { id: 'operasional', label: 'Operasional', path: '/dashboard/operasional', categoryId: 'operations', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'penjualan', label: 'Penjualan & CRM', path: '/dashboard/penjualan', categoryId: 'sales', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'marketing', label: 'Marketing', path: '/dashboard/marketing', categoryId: 'marketing', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
  { id: 'legalitas', label: 'Legal & Compliance', path: '/dashboard/legalitas', categoryId: 'legal', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'ekspor', label: 'Kurs', path: '/dashboard/ekspor', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1' },
  { id: 'insight', label: 'Analytics', path: '/dashboard/analytics', categoryId: 'analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'tools', label: 'Semua Tools', path: '/dashboard/semua-tools', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-1.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
]

export const TOTAL_TOOLS = Object.values(CATEGORIES).reduce((sum, c) => sum + c.tools.length, 0)

export function isToolAvailable(tool) {
  return tool.availability !== TOOL_AVAILABILITY.COMING_SOON && tool.status !== 'coming_soon'
}

export const TOTAL_AVAILABLE_TOOLS = Object.values(CATEGORIES).reduce(
  (sum, c) => sum + c.tools.filter(isToolAvailable).length,
  0
)
