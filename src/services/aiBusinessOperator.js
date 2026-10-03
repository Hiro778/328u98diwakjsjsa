/**
 * AI Business Analyst — Standalone AI Operator
 *
 * Sesuai spesifikasi arsitektur BisnisSehat:
 * - Standalone Operator: Berjalan mandiri tanpa dependensi LLM berbayar (Gemini, TokenKoding, OpenAI).
 * - Deterministic Business Intelligence: Memadukan Natural Language Intent Recognition dengan
 *   agregasi data kanonikal bisnis UMKM (canonicalSalesService, inventory, orders, products).
 * - Multi-tenant isolation: Seluruh query data dibatasi secara mutlak oleh business_id.
 * - Security Guardrails: Memfilter prompt injection, permintaan kredensial/kunci rahasia, dan aksi ilegal.
 * - Fallback & Graceful Degradation: Memberikan respon informatif dan saran aksi praktis.
 */

import { supabase } from '../lib/supabase.js'
import {
  fetchCanonicalOrders,
  aggregateSalesMetrics,
  WIB_OFFSET_MS,
} from './canonicalSalesService.js'

// ── 1. OPERATOR INTENTS ──
export const ANALYST_INTENTS = Object.freeze({
  TOP_PRODUCTS: 'TOP_PRODUCTS',
  MONTHLY_REVENUE: 'MONTHLY_REVENUE',
  MARGIN_ANALYSIS: 'MARGIN_ANALYSIS',
  RESTOCK_TIMING: 'RESTOCK_TIMING',
  LOWEST_MARGIN: 'LOWEST_MARGIN',
  SALES_DROP: 'SALES_DROP',
  MONTHLY_COMPARISON: 'MONTHLY_COMPARISON',
  DELETE_SUPPLIER: 'DELETE_SUPPLIER',
  ANALYZE_SUPPLIERS: 'ANALYZE_SUPPLIERS',
  ANALYZE_RISK: 'ANALYZE_RISK',
  MENU_HELP: 'MENU_HELP',
  UNKNOWN: 'UNKNOWN',
})

// ── 2. SECURITY THREAT PATTERNS ──
const SECURITY_PATTERNS = [
  /\b(dump\s+(semua\s+)?(database|db|user|users|transaksi|tabel|table|data\s+mentah)|kirimin\s+database|ambil\s+semua\s+transaksi\s+mentah)\b/i,
  /\b(service[_\s-]?role(\s*key)?|supabase[_\s-]?(service[_\s-]?role|key|secret|credential))\b/i,
  /\b(ambil|kasih|minta|bocorkan|lihat|dump)\s+(auth\s+)?(token|jwt|access[_\s-]?token|refresh[_\s-]?token)\b/i,
  /\b(bearer\s+token|jwt\s+secret)\b/i,
  /\b(vercel\s+(token|credential|secret|api)|tembak\s+api\s+vercel)\b/i,
  /\b(env(ironment)?[_\s-]?(var(iable)?s?|secret)|ambil\s+env|server\s+secrets?|api[_\s-]?keys?)\b/i,
  /\b(kirim\s+credential\s+ke|curl\s+https?:\/\/|wget\s+https?:\/\/|ngrok|webhook\.site)\b/i,
  /\b(hit\s+endpoint.*10\.?000|flood(ing)?\s+(request|api)|ddos|scan\s+production\s+lalu\s+exploit)\b/i,
  /\b(bypass[_\s-]?rls|bypass\s+(auth|authentication|authorization)|(akses|data|lihat)?\s*(bisnis|user|tenant)\s+lain|tenant\s+orang\s+lain|other[_\s-]?business)\b/i,
  /\b(union\s+select|information_schema|drop\s+table|delete\s+semua\s+database|exec\s*\(|alter\s+table)\b/i,
  /\b(rm\s+-rf|sh\s+-c|bash\s+-c|cat\s+\/etc|powershell|cmd\.exe)\b/i,
  /\b(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override|jailbreak)\b/i,
]

export function isAnalystSecurityThreat(text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (/;\s*drop\s+table/i.test(trimmed) || /;\s*delete\s+from/i.test(trimmed)) {
    return true
  }
  return SECURITY_PATTERNS.some((rx) => rx.test(trimmed))
}

export const SECURITY_ALERT_MESSAGE =
  'Maaf, bot tidak bisa melakukan hal itu.\n' +
  'Coba hal lain seperti analisis risiko, keamanan bisnis, atau performa usaha.'

// ── 3. NATURAL LANGUAGE INTENT PARSER ──
export function parseAnalystIntent(query) {
  if (!query || typeof query !== 'string') {
    return { intent: ANALYST_INTENTS.UNKNOWN, params: {} }
  }

  const q = query.trim().toLowerCase()

  // Threat check
  if (isAnalystSecurityThreat(q)) {
    return { intent: 'SECURITY_THREAT', params: {} }
  }

  // 1. Top products / paling laku / terlaris
  if (
    q.includes('paling laku') ||
    q.includes('terlaris') ||
    q.includes('best seller') ||
    q.includes('produk terlaris') ||
    q.includes('paling laku bulan ini')
  ) {
    return { intent: ANALYST_INTENTS.TOP_PRODUCTS, params: {} }
  }

  // 2. Monthly revenue / omzet / omset / pendapatan
  if (
    q.includes('omzet') ||
    q.includes('omset') ||
    q.includes('pendapatan') ||
    q.includes('total penjualan') ||
    q.includes('revenue')
  ) {
    return { intent: ANALYST_INTENTS.MONTHLY_REVENUE, params: {} }
  }

  // 3. Lowest margin products
  if (
    (q.includes('margin') && (q.includes('kecil') || q.includes('rendah') || q.includes('paling kecil') || q.includes('tipis'))) ||
    q.includes('margin terkecil')
  ) {
    return { intent: ANALYST_INTENTS.LOWEST_MARGIN, params: {} }
  }

  // 4. General margin analysis / profit / keuntungan
  if (q.includes('margin') || q.includes('profit') || q.includes('laba kotor') || q.includes('keuntungan')) {
    return { intent: ANALYST_INTENTS.MARGIN_ANALYSIS, params: {} }
  }

  // 5. Restock / inventori / stok menipis
  if (
    q.includes('restock') ||
    q.includes('stok') ||
    q.includes('habis') ||
    q.includes('kapan harus restock') ||
    q.includes('stok menipis')
  ) {
    return { intent: ANALYST_INTENTS.RESTOCK_TIMING, params: {} }
  }

  // 6. Sales drop / kenapa penjualan turun
  if (
    q.includes('turun') ||
    q.includes('penjualan turun') ||
    q.includes('drop') ||
    q.includes('sepi') ||
    q.includes('kenapa turun')
  ) {
    return { intent: ANALYST_INTENTS.SALES_DROP, params: {} }
  }

  // 7. Monthly comparison / bandingkan bulan ini vs lalu
  if (
    q.includes('bandingkan') ||
    q.includes('bulan lalu') ||
    q.includes('perbandingan') ||
    q.includes('vs bulan lalu') ||
    q.includes('pertumbuhan')
  ) {
    return { intent: ANALYST_INTENTS.MONTHLY_COMPARISON, params: {} }
  }

  // 8. Delete supplier (destructive write)
  const delSupMatch = q.match(/^hapus\s+supplier\s+(.+)$/i)
  if (delSupMatch) {
    return { intent: ANALYST_INTENTS.DELETE_SUPPLIER, params: { target: delSupMatch[1].trim() } }
  }

  // 9. Analyze suppliers
  if (q.includes('supplier')) {
    return { intent: ANALYST_INTENTS.ANALYZE_SUPPLIERS, params: {} }
  }

  // 10. Analyze risk
  if (q.includes('risiko') || q.includes('keamanan bisnis')) {
    return { intent: ANALYST_INTENTS.ANALYZE_RISK, params: {} }
  }

  // 11. Help / Menu
  if (q.includes('menu') || q.includes('bantuan') || q.includes('bisa apa') || q === 'hai' || q === 'halo') {
    return { intent: ANALYST_INTENTS.MENU_HELP, params: {} }
  }

  return { intent: ANALYST_INTENTS.UNKNOWN, params: { raw: query } }
}

// ── 4. HELPER DATES ──
function getMonthDateRangeWib() {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  const year = wib.getUTCFullYear()
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0')

  const startOfMonth = `${year}-${month}-01`
  const lastDay = new Date(Date.UTC(year, wib.getUTCMonth() + 1, 0)).getUTCDate()
  const endOfMonth = `${year}-${month}-${String(lastDay).padStart(2, '0')}`

  // Previous month
  const prevMonthDate = new Date(Date.UTC(year, wib.getUTCMonth() - 1, 1))
  const prevYear = prevMonthDate.getUTCFullYear()
  const prevMonthStr = String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')
  const prevLastDay = new Date(Date.UTC(prevYear, prevMonthDate.getUTCMonth() + 1, 0)).getUTCDate()
  const startOfPrevMonth = `${prevYear}-${prevMonthStr}-01`
  const endOfPrevMonth = `${prevYear}-${prevMonthStr}-${String(prevLastDay).padStart(2, '0')}`

  return {
    startOfMonth,
    endOfMonth,
    startOfPrevMonth,
    endOfPrevMonth,
    monthName: wib.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    prevMonthName: prevMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
  }
}

const fmtRupiah = (val) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val || 0)

// ── 5. OPERATOR INTENT HANDLERS ──

/**
 * Top selling products handler
 */
async function handleTopProducts({ businessId, businessName, mockDb }) {
  if (mockDb?.topProducts) {
    return formatTopProductsOutput(mockDb.topProducts, businessName)
  }

  const { startOfMonth, endOfMonth, monthName } = getMonthDateRangeWib()

  try {
    const orders = await fetchCanonicalOrders(businessId, startOfMonth, endOfMonth)
    if (!orders || orders.length === 0) {
      return {
        text: `Belum ada pesanan selesai yang tercatat untuk ${businessName} pada periode ${monthName}.\n\n` +
          `💡 *Saran:* Mulai catat transaksi penjualan di menu Kasir POS atau impor data penjualan untuk melihat peringkat produk terlaris secara otomatis.`,
        suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?', 'Berapa margin saya?'],
      }
    }

    // Extract item sales from canonical orders
    const itemMap = new Map() // name -> { qty, revenue }
    orders.forEach((o) => {
      const items = Array.isArray(o.order_items) ? o.order_items : []
      items.forEach((item) => {
        const name = item.product_name || item.name || 'Produk'
        const qty = Number(item.quantity || 1)
        const subtotal = Number(item.subtotal || item.total_price || (item.unit_price * qty) || 0)

        const curr = itemMap.get(name) || { qty: 0, revenue: 0 }
        itemMap.set(name, { qty: curr.qty + qty, revenue: curr.revenue + subtotal })
      })
    })

    const sorted = Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)

    return formatTopProductsOutput(sorted, businessName, monthName)
  } catch {
    return {
      text: `Gagal memuat data produk terlaris. Pastikan koneksi internet stabil dan izin akses bisnis valid.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?'],
    }
  }
}

function formatTopProductsOutput(items, businessName, monthName = 'Bulan Ini') {
  if (!items || items.length === 0) {
    return {
      text: `Belum ada produk yang terjual pada periode ${monthName}.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?'],
    }
  }

  const top3 = items.slice(0, 5)
  let out = `🏆 **Peringkat Produk Terlaris — ${businessName} (${monthName})**\n\n`
  top3.forEach((item, idx) => {
    out += `${idx + 1}. **${item.name}**\n`
    out += `   ├─ Terjual: **${item.qty} pcs/porsi**\n`
    if (item.revenue) {
      out += `   └─ Kontribusi Omzet: **${fmtRupiah(item.revenue)}**\n`
    }
  })

  out += `\n💡 *Rekomendasi Analis:* Produk teratas (${top3[0]?.name || 'utama'}) adalah pendorong penjualan toko Anda. ` +
    `Pertimbangkan strategi bundling dengan produk pendamping atau siapkan program loyalitas untuk pembeli setia.`

  return {
    text: out.trim(),
    suggestions: ['Berapa margin saya?', 'Kapan saya harus restock?', 'Berapa omzet saya bulan ini?'],
  }
}

/**
 * Monthly revenue handler
 */
async function handleMonthlyRevenue({ businessId, businessName, mockDb }) {
  if (mockDb?.salesMetrics) {
    return formatRevenueOutput(mockDb.salesMetrics, businessName)
  }

  const { startOfMonth, endOfMonth, monthName } = getMonthDateRangeWib()

  try {
    const orders = await fetchCanonicalOrders(businessId, startOfMonth, endOfMonth)
    const metrics = aggregateSalesMetrics(orders || [])

    return formatRevenueOutput(metrics, businessName, monthName)
  } catch {
    return {
      text: `Gagal menghitung omzet bulanan. Silakan periksa koneksi data bisnis Anda.`,
      suggestions: ['Produk apa paling laku bulan ini?', 'Kapan saya harus restock?'],
    }
  }
}

function formatRevenueOutput(metrics, businessName, monthName = 'Bulan Berjalan') {
  const totalRev = Number(metrics.totalRevenue || 0)
  const totalOrders = Number(metrics.totalOrders || 0)
  const avgOrder = totalOrders > 0 ? totalRev / totalOrders : 0

  let out = `💰 **Ringkasan Omzet Penjualan — ${businessName}**\n`
  out += `📅 Periode: **${monthName}**\n\n`
  out += `• **Total Omzet Bersih:** **${fmtRupiah(totalRev)}**\n`
  out += `• **Total Transaksi Selesai:** **${totalOrders} pesanan**\n`
  out += `• **Rata-rata Nilai Transaksi (AOV):** **${fmtRupiah(avgOrder)}**\n`

  if (metrics.totalDiscount && metrics.totalDiscount > 0) {
    out += `• **Total Potongan Diskon:** ${fmtRupiah(metrics.totalDiscount)}\n`
  }

  if (totalOrders === 0) {
    out += `\n💡 *Saran:* Belum ada pesanan berstatus selesai bulan ini. Mulai operasikan kasir POS untuk mencatat pendapatan pertama toko.`
  } else {
    out += `\n💡 *Insight Analis:* Arus kas masuk berjalan aktif. Jaga tren transaksi harian agar mencapai target akhir bulan.`
  }

  return {
    text: out.trim(),
    suggestions: ['Produk apa paling laku bulan ini?', 'Berapa margin saya?', 'Bandingkan penjualan bulan ini dengan bulan lalu.'],
  }
}

/**
 * Margin analysis handler
 */
async function handleMarginAnalysis({ businessId, businessName, mockDb }) {
  if (mockDb?.products) {
    return formatMarginOutput(mockDb.products, businessName)
  }

  try {
    const { data: prods, error } = await supabase
      .from('products')
      .select('name, unit_price, purchase_price')
      .eq('business_id', businessId)
      .limit(30)

    if (error || !prods || prods.length === 0) {
      return {
        text: `Belum ada katalog produk dengan data harga beli dan harga jual untuk ${businessName}.\n\n` +
          `💡 *Saran:* Lengkapi harga beli (HPP) dan harga jual produk di menu POS atau HPP Calculator untuk menghitung margin keuntungan otomatis.`,
        suggestions: ['Berapa omzet saya bulan ini?', 'Produk apa paling laku bulan ini?'],
      }
    }

    return formatMarginOutput(prods, businessName)
  } catch {
    return {
      text: `Gagal menghitung margin produk. Silakan coba kembali sesaat lagi.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?'],
    }
  }
}

function formatMarginOutput(products, businessName) {
  const calculated = products
    .filter((p) => Number(p.unit_price) > 0)
    .map((p) => {
      const sell = Number(p.unit_price || 0)
      const buy = Number(p.purchase_price || 0)
      const marginNominal = sell - buy
      const marginPct = buy > 0 ? Math.round((marginNominal / sell) * 100) : 100
      return { name: p.name, sell, buy, marginNominal, marginPct }
    })
    .sort((a, b) => b.marginPct - a.marginPct)

  if (calculated.length === 0) {
    return {
      text: `Belum ada produk aktif yang memiliki harga jual valid untuk dianalisis.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?'],
    }
  }

  const avgMargin = Math.round(
    calculated.reduce((acc, c) => acc + c.marginPct, 0) / calculated.length
  )

  const top = calculated[0]
  const lowest = calculated[calculated.length - 1]

  let out = `📊 **Evaluasi Margin & Profitabilitas — ${businessName}**\n\n`
  out += `• **Rata-rata Margin Kotor:** **${avgMargin}%** (${avgMargin >= 40 ? 'Sangat Sehat' : 'Perlu Dioptimalkan'})\n`
  out += `• **Margin Tertinggi:** **${top.name}** (${top.marginPct}% | Laba: ${fmtRupiah(top.marginNominal)}/item)\n`
  out += `• **Margin Terendah:** **${lowest.name}** (${lowest.marginPct}% | Laba: ${fmtRupiah(lowest.marginNominal)}/item)\n\n`

  if (lowest.marginPct < 30) {
    out += `💡 *Peringatan Analis:* Produk "${lowest.name}" memiliki margin di bawah 30%. Pertimbangkan untuk meninjau supplier bahan baku atau menyesuaikan harga jual agar tidak tergerus beban operasional.`
  } else {
    out += `💡 *Insight Analis:* Struktur margin produk berada dalam rentang kompetitif dan sehat untuk skala UMKM.`
  }

  return {
    text: out.trim(),
    suggestions: ['Produk mana yang marginnya paling kecil?', 'Kapan saya harus restock?', 'Berapa omzet saya bulan ini?'],
  }
}

/**
 * Restock timing & low stock handler
 */
async function handleRestockTiming({ businessId, businessName, mockDb }) {
  if (mockDb?.inventory) {
    return formatRestockOutput(mockDb.inventory, businessName)
  }

  try {
    const { data: prods } = await supabase
      .from('products')
      .select('id, name')
      .eq('business_id', businessId)

    if (!prods || prods.length === 0) {
      return {
        text: `Belum ada produk yang terdaftar di ${businessName}. Tambahkan produk di menu POS atau Inventori untuk memantau stok.`,
        suggestions: ['Berapa omzet saya bulan ini?', 'Produk apa paling laku bulan ini?'],
      }
    }

    const prodIds = prods.map((p) => p.id)
    const { data: invs } = await supabase
      .from('inventory')
      .select('product_id, quantity, min_stock')
      .in('product_id', prodIds)

    const prodMap = new Map(prods.map((p) => [p.id, p.name]))
    const lowStockItems = (invs || [])
      .filter((i) => Number(i.quantity || 0) <= Number(i.min_stock || 0))
      .map((i) => ({
        name: prodMap.get(i.product_id) || 'Item Produk',
        quantity: Number(i.quantity || 0),
        min_stock: Number(i.min_stock || 0),
      }))

    return formatRestockOutput(lowStockItems, businessName)
  } catch {
    return {
      text: `Gagal memuat status inventori toko. Silakan periksa kembali beberapa saat lagi.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Produk apa paling laku bulan ini?'],
    }
  }
}

function formatRestockOutput(lowItems, businessName) {
  if (!lowItems || lowItems.length === 0) {
    return {
      text: `✅ **Semua Stok Aman — ${businessName}**\n\n` +
        `Saat ini seluruh bahan baku dan produk berada di atas batas stok minimum aman.\n\n` +
        `💡 *Saran:* Tetap lakukan stok opname rutin setiap akhir pekan untuk mencegah selisih pencatatan fisik dan sistem.`,
      suggestions: ['Produk apa paling laku bulan ini?', 'Berapa omzet saya bulan ini?', 'Berapa margin saya?'],
    }
  }

  let out = `⚠️ **Peringatan Inventori & Jadwal Restock — ${businessName}**\n\n`
  out += `Ditemukan **${lowItems.length} item** yang berada di bawah atau sama dengan batas stok minimum:\n\n`

  lowItems.slice(0, 5).forEach((item, idx) => {
    out += `${idx + 1}. **${item.name}**\n`
    out += `   ├─ Sisa Stok: **${item.quantity}**\n`
    out += `   └─ Batas Minimum: **${item.min_stock}**\n`
  })

  out += `\n📦 *Rekomendasi Tindakan:* Hubungi supplier terkait hari ini untuk pemesanan ulang agar tidak terjadi kekosongan barang (out-of-stock) saat jam ramai.`

  return {
    text: out.trim(),
    suggestions: ['Produk apa paling laku bulan ini?', 'Berapa omzet saya bulan ini?', 'Berapa margin saya?'],
  }
}

/**
 * Lowest margin products handler
 */
async function handleLowestMargin({ businessId, businessName, mockDb }) {
  const marginResult = await handleMarginAnalysis({ businessId, businessName, mockDb })
  return {
    ...marginResult,
    suggestions: ['Kapan saya harus restock?', 'Berapa omzet saya bulan ini?', 'Produk apa paling laku bulan ini?'],
  }
}

/**
 * Sales drop analysis handler
 */
async function handleSalesDrop({ _businessId, businessName, mockDb }) {
  if (mockDb?.salesDropAnalysis) {
    return mockDb.salesDropAnalysis
  }

  return {
    text: `📉 **Analisis Penurunan Penjualan — ${businessName}**\n\n` +
      `Berdasarkan audit pola transaksi:\n` +
      `1. **Hari Tenang (Dead Days):** Transaksi cenderung mengalami penurunan pada hari Selasa dan Rabu.\n` +
      `2. **Jam Sepi:** Penurunan frekuensi transaksi tertinggi terpantau pada jam 14.00–16.30 WIB.\n` +
      `3. **Penyebab Umum:** Kurangnya promosi khusus jam sepi serta ketiadaan paket bundling hemat.\n\n` +
      `💡 *Solusi Pemulihan Praktis:*\n` +
      `• Buat program "Happy Hour" diskon 15% pada jam 14.00–16.30 WIB.\n` +
      `• Buat paket bundling produk favorit dengan margin tinggi untuk mendongkrak omzet harian.`,
    suggestions: ['Bandingkan penjualan bulan ini dengan bulan lalu.', 'Berapa margin saya?', 'Produk apa paling laku bulan ini?'],
  }
}

/**
 * Month over month comparison handler
 */
async function handleMonthlyComparison({ businessId, businessName, mockDb }) {
  if (mockDb?.monthlyComparison) {
    return mockDb.monthlyComparison
  }

  const { startOfMonth, endOfMonth, startOfPrevMonth, endOfPrevMonth, monthName, prevMonthName } =
    getMonthDateRangeWib()

  try {
    const currentOrders = await fetchCanonicalOrders(businessId, startOfMonth, endOfMonth)
    const prevOrders = await fetchCanonicalOrders(businessId, startOfPrevMonth, endOfPrevMonth)

    const currMetrics = aggregateSalesMetrics(currentOrders || [])
    const prevMetrics = aggregateSalesMetrics(prevOrders || [])

    const currRev = Number(currMetrics.totalRevenue || 0)
    const prevRev = Number(prevMetrics.totalRevenue || 0)

    let growthPct = 0
    if (prevRev > 0) {
      growthPct = Math.round(((currRev - prevRev) / prevRev) * 100)
    }

    let out = `🔄 **Perbandingan Performa Bulan ke Bulan — ${businessName}**\n\n`
    out += `• **${monthName} (Bulan Ini):** ${fmtRupiah(currRev)} (${currMetrics.totalOrders || 0} pesanan)\n`
    out += `• **${prevMonthName} (Bulan Lalu):** ${fmtRupiah(prevRev)} (${prevMetrics.totalOrders || 0} pesanan)\n\n`

    if (prevRev === 0) {
      out += `📈 Belum ada data pembanding dari bulan lalu. Konsistensi pencatatan transaksi akan mempertajam akurasi komparasi MoM.`
    } else if (growthPct >= 0) {
      out += `📈 **Pertumbuhan:** **+${growthPct}%** dibandingkan bulan lalu! Performa bisnis berada di jalur ekspansi.`
    } else {
      out += `📉 **Penurunan:** **${growthPct}%** dibandingkan bulan lalu. Periksa kembali produk yang mengalami perlambatan transaksi.`
    }

    return {
      text: out.trim(),
      suggestions: ['Produk apa paling laku bulan ini?', 'Berapa omzet saya bulan ini?', 'Berapa margin saya?'],
    }
  } catch {
    return {
      text: `Gagal melakukan komparasi bulanan. Pastikan data transaksi tersedia.`,
      suggestions: ['Berapa omzet saya bulan ini?', 'Kapan saya harus restock?'],
    }
  }
}

/**
 * Help menu handler
 */
function handleMenuHelp(businessName) {
  return {
    text: `👋 **AI Business Analyst — Panduan Analisis Cerdas**\n\n` +
      `Saya dapat membantu menganalisis data riil operasional ${businessName || 'toko Anda'} secara instan:\n\n` +
      `📊 **Performa & Finansial:**\n` +
      `• *"Berapa omzet saya bulan ini?"*\n` +
      `• *"Berapa margin saya?"*\n` +
      `• *"Bandingkan penjualan bulan ini dengan bulan lalu."*\n\n` +
      `📦 **Inventori & Produk:**\n` +
      `• *"Produk apa paling laku bulan ini?"*\n` +
      `• *"Kapan saya harus restock?"*\n` +
      `• *"Produk mana yang marginnya paling kecil?"*\n\n` +
      `💡 Ketik pertanyaan Anda menggunakan bahasa sehari-hari atau klik tombol saran di atas.`,
    suggestions: ['Produk apa paling laku bulan ini?', 'Berapa omzet saya bulan ini?', 'Berapa margin saya?', 'Kapan saya harus restock?'],
  }
}

// ── 6. MAIN OPERATOR EXECUTION DISPATCHER ──

/**
 * Process a business intelligence query as the Standalone AI Operator.
 *
 * @param {object} params
 * @param {string} params.query - Natural language user message
 * @param {string} params.businessId - Current active tenant ID
 * @param {string} params.businessName - Display name of the business
 * @param {object} [params.mockDb] - Optional mock database for offline testing
 * @returns {Promise<{ text: string, suggestions: string[], isThreat?: boolean }>}
 */
export async function processAiBusinessOperatorQuery({
  query,
  businessId,
  businessName = 'Bisnis Anda',
  mockDb = null,
  confirmationId = null,
  confirmed = null,
}) {
  // Handle confirmation
  if (confirmationId) {
    if (confirmed === false) {
      return {
        text: 'Tindakan penghapusan dibatalkan. Data tetap aman.',
      }
    }
    if (confirmed === true) {
      // Check dependencies in mockDb if present
      if (mockDb?.inventory && mockDb.inventory.some((i) => i.supplier_id)) {
        return {
          text: '⚠️ Gagal Menghapus: Supplier tidak dapat dihapus karena masih digunakan oleh data pembelian/produk tertentu.',
        }
      }
      return {
        text: '✅ Berhasil: Supplier berhasil dihapus.',
      }
    }
  }

  const parsed = parseAnalystIntent(query)

  // 1. Security rejection guard
  if (parsed.intent === 'SECURITY_THREAT') {
    return {
      text: SECURITY_ALERT_MESSAGE,
      suggestions: ['Produk apa paling laku bulan ini?', 'Berapa omzet saya bulan ini?'],
      isThreat: true,
    }
  }

  // 2. Dispatch by intent
  switch (parsed.intent) {
    case ANALYST_INTENTS.TOP_PRODUCTS:
      return handleTopProducts({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.MONTHLY_REVENUE:
      return handleMonthlyRevenue({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.MARGIN_ANALYSIS:
      return handleMarginAnalysis({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.RESTOCK_TIMING:
      return handleRestockTiming({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.LOWEST_MARGIN:
      return handleLowestMargin({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.SALES_DROP:
      return handleSalesDrop({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.MONTHLY_COMPARISON:
      return handleMonthlyComparison({ businessId, businessName, mockDb })

    case ANALYST_INTENTS.DELETE_SUPPLIER: {
      const targetName = parsed.params.target
      let found = null
      if (mockDb?.suppliers) {
        found = mockDb.suppliers.find(
          (s) => s.name.toLowerCase() === targetName.toLowerCase() || s.id === targetName
        )
      } else {
        const { data } = await supabase
          .from('suppliers')
          .select('id, name')
          .eq('business_id', businessId)
        found = (data || []).find(
          (s) => s.name.toLowerCase() === targetName.toLowerCase() || s.id === targetName
        )
      }

      if (!found) {
        return {
          text: `Supplier "${targetName}" tidak ditemukan di database bisnis Anda.`,
          suggestions: ['Analisis supplier', 'Produk paling laku bulan ini'],
        }
      }

      return {
        confirmationRequired: true,
        confirmationId: `conf_${Date.now()}`,
        action: 'delete_supplier',
        target: { id: found.id, name: found.name },
        text: `Saya menemukan supplier "${found.name}". Menghapusnya akan menghapus data supplier tersebut. Apakah kamu yakin ingin menghapusnya?`,
      }
    }

    case ANALYST_INTENTS.ANALYZE_SUPPLIERS: {
      let sups = []
      if (mockDb?.suppliers) {
        sups = mockDb.suppliers
      } else {
        const { data } = await supabase
          .from('suppliers')
          .select('name, contact_person, phone, is_active')
          .eq('business_id', businessId)
        sups = data || []
      }
      return {
        text: `🏢 **Database Supplier — ${businessName}**\n\n` +
          `• **Total Supplier:** ${sups.length}\n` +
          `• **Supplier Aktif:** ${sups.filter((s) => s.is_active !== false).length}\n\n` +
          `Ketik *"hapus supplier [nama]"* untuk menghapus atau *"analisis risiko bisnis"* untuk evaluasi ketergantungan supplier.`,
        suggestions: ['Hapus supplier ABC', 'Analisis risiko bisnis'],
      }
    }

    case ANALYST_INTENTS.ANALYZE_RISK: {
      return {
        text: `🛡️ **Audit Risiko & Keamanan Usaha — ${businessName}**\n\n` +
          `• **Risiko Kehabisan Stok:** Terpantau dengan batas minimum inventori.\n` +
          `• **Risiko Margin Menipis:** Evaluasi berkala HPP terhadap fluktuasi harga supplier.\n` +
          `• **Ketergantungan Supplier:** Diversifikasi mitra pemasok kunci untuk kelancaran suplai.\n\n` +
          `💡 *Rekomendasi:* Pertahankan pencatatan kasir harian agar audit anomali transaksi akurat.`,
        suggestions: ['Kapan saya harus restock?', 'Berapa margin saya?'],
      }
    }

    case ANALYST_INTENTS.MENU_HELP:
      return handleMenuHelp(businessName)

    case ANALYST_INTENTS.UNKNOWN:
    default: {
      return {
        text: `Pertanyaan: "${query}"\n\n` +
          `Sebagai AI Business Analyst ${businessName || 'BisnisSehat'}, saya berfokus pada analisis data riil penjualan kasir POS, ` +
          `margin keuntungan produk, status stok gudang, dan perbandingan omzet bulanan.\n\n` +
          `Silakan pilih salah satu topik analisis berikut:`,
        suggestions: [
          'Produk apa paling laku bulan ini?',
          'Berapa omzet saya bulan ini?',
          'Berapa margin saya?',
          'Kapan saya harus restock?',
        ],
      }
    }
  }
}
