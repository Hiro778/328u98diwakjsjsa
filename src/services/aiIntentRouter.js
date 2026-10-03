/**
 * AI Business Analyst — Deterministic Intent & Entity Router
 *
 * Supported Tools:
 * READ:
 *   - analyze_sales
 *   - analyze_revenue
 *   - analyze_profit
 *   - analyze_inventory
 *   - analyze_low_stock
 *   - analyze_orders
 *   - analyze_products
 *   - analyze_suppliers
 *   - analyze_cashflow
 *   - analyze_customer_metrics
 *   - analyze_risk
 *
 * WRITE:
 *   - create_supplier
 *   - update_supplier
 *   - delete_supplier
 *   - create_product
 *   - update_product
 *   - delete_product
 *   - update_inventory
 */

export const BUSINESS_TOOLS = Object.freeze({
  // READ
  ANALYZE_SALES: 'analyze_sales',
  ANALYZE_REVENUE: 'analyze_revenue',
  ANALYZE_PROFIT: 'analyze_profit',
  ANALYZE_INVENTORY: 'analyze_inventory',
  ANALYZE_LOW_STOCK: 'analyze_low_stock',
  ANALYZE_ORDERS: 'analyze_orders',
  ANALYZE_PRODUCTS: 'analyze_products',
  ANALYZE_SUPPLIERS: 'analyze_suppliers',
  ANALYZE_CASHFLOW: 'analyze_cashflow',
  ANALYZE_CUSTOMER_METRICS: 'analyze_customer_metrics',
  ANALYZE_RISK: 'analyze_risk',

  // WRITE
  CREATE_SUPPLIER: 'create_supplier',
  UPDATE_SUPPLIER: 'update_supplier',
  DELETE_SUPPLIER: 'delete_supplier',
  CREATE_PRODUCT: 'create_product',
  UPDATE_PRODUCT: 'update_product',
  DELETE_PRODUCT: 'delete_product',
  UPDATE_INVENTORY: 'update_inventory',

  // GENERAL
  GENERAL_CONVERSATION: 'general_conversation',
})

const NOISE_WORDS = ['dong', 'ya', 'deh', 'bang', 'pls', 'please', 'tolong', 'min']

function cleanEntityName(raw) {
  if (!raw || typeof raw !== 'string') return null
  let s = raw.trim()
  // Strip trailing punctuation
  s = s.replace(/[?!.,;:]+$/g, '').trim()
  // Strip trailing conversational particles
  const words = s.split(/\s+/)
  while (words.length > 0 && NOISE_WORDS.includes(words[words.length - 1].toLowerCase())) {
    words.pop()
  }
  s = words.join(' ').trim()
  if (!s || s.toLowerCase() === 'baru' || s.toLowerCase() === 'dong') {
    return null
  }
  return s
}

/**
 * Deterministically parses natural-language user query into an allowlisted tool and extracted entities.
 *
 * @param {string} query - Raw user input string
 * @returns {{ tool: string|null, type: 'READ'|'WRITE'|'UNKNOWN', entity: Record<string, any> }}
 */
export function parseBusinessIntent(query) {
  if (!query || typeof query !== 'string') {
    return { tool: null, type: 'UNKNOWN', entity: {} }
  }

  const raw = query.trim()
  const clean = raw.replace(/[?!.,;:]+$/g, '').trim()
  const lower = clean.toLowerCase()

  // ──────────────────────────────────────────────────────────
  // 1. WRITE TOOLS & ENTITY EXTRACTION
  // ──────────────────────────────────────────────────────────

  // 1.1 CREATE_SUPPLIER
  // Pattern B: "masukin Yanto sebagai supplier" / "jadikan PT ABC sebagai supplier"
  const supAsMatch = clean.match(
    /^(?:bisa\s+)?(?:masuk(?:in|kan)|tambah(?:kan)?|daftarkan|jadikan)\s+(.+?)\s+sebagai\s+(?:supplier|pemasok)$/i
  )
  if (supAsMatch) {
    const extracted = cleanEntityName(supAsMatch[1])
    return {
      tool: BUSINESS_TOOLS.CREATE_SUPPLIER,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // Pattern C: "tambah yanto supplier" / "masukin yanto supplier"
  const supInvertMatch = clean.match(
    /^(?:bisa\s+)?(?:tambah(?:kan)?|daftarkan|masuk(?:in|kan)|input)\s+(.+?)\s+(?:supplier|pemasok)$/i
  )
  if (supInvertMatch) {
    const extracted = cleanEntityName(supInvertMatch[1])
    return {
      tool: BUSINESS_TOOLS.CREATE_SUPPLIER,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // Pattern A: "bisa tambah supplier yanto" / "tambah supplier Yanto" / "buat supplier baru namanya Yanto"
  // "gw mau nambah supplier" / "buat supplier baru dong"
  const supAddMatch = clean.match(
    /^(?:bisa\s+)?(?:gw\s+mau\s+|saya\s+mau\s+|aku\s+mau\s+|mau\s+|ingin\s+)?(?:tambah(?:kan)?|bikin|buat|daftarkan|masuk(?:in|kan)|input|daftarin|nambah)\s+(?:supplier|pemasok)(?:\s+baru)?(?:\s+(?:namanya|bernama))?(?:\s+(.+))?$/i
  )
  if (supAddMatch) {
    const rawName = supAddMatch[1] ? supAddMatch[1].trim() : ''
    const extracted = cleanEntityName(rawName)
    return {
      tool: BUSINESS_TOOLS.CREATE_SUPPLIER,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.2 DELETE_SUPPLIER
  const supDelMatch = clean.match(
    /^(?:bisa\s+)?(?:hapus|delete|hilangkan|buang|drop)\s+(?:supplier|pemasok)(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  )
  if (supDelMatch) {
    const extracted = cleanEntityName(supDelMatch[1])
    return {
      tool: BUSINESS_TOOLS.DELETE_SUPPLIER,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.3 UPDATE_SUPPLIER
  const supUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:ubah|update|edit|ganti)\s+(?:supplier|pemasok)(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  )
  if (supUpdMatch) {
    const extracted = cleanEntityName(supUpdMatch[1])
    return {
      tool: BUSINESS_TOOLS.UPDATE_SUPPLIER,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.4 CREATE_PRODUCT
  const prodAddMatch = clean.match(
    /^(?:bisa\s+)?(?:gw\s+mau\s+|saya\s+mau\s+|aku\s+mau\s+|mau\s+|ingin\s+)?(?:tambah(?:kan)?|bikin|buat|daftarkan|masuk(?:in|kan)|input|daftarin|nambah)\s+produk(?:\s+baru)?(?:\s+(?:namanya|bernama))?(?:\s+(.+))?$/i
  )
  if (prodAddMatch) {
    const extracted = cleanEntityName(prodAddMatch[1])
    return {
      tool: BUSINESS_TOOLS.CREATE_PRODUCT,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.5 DELETE_PRODUCT
  const prodDelMatch = clean.match(
    /^(?:bisa\s+)?(?:hapus|delete|hilangkan|buang)\s+produk(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  )
  if (prodDelMatch) {
    const extracted = cleanEntityName(prodDelMatch[1])
    return {
      tool: BUSINESS_TOOLS.DELETE_PRODUCT,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.6 UPDATE_PRODUCT
  const prodUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:ubah|update|edit|ganti)\s+(?:harga|nama|data)?\s*produk\s+(.+)$/i
  )
  if (prodUpdMatch) {
    const extracted = cleanEntityName(prodUpdMatch[1])
    return {
      tool: BUSINESS_TOOLS.UPDATE_PRODUCT,
      type: 'WRITE',
      entity: { name: extracted },
    }
  }

  // 1.7 UPDATE_INVENTORY
  const invUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:update|ubah|tambah|sesuaikan|kurangi|set)\s+stok(?:\s+(?:produk|barang))?\s*(.+)?$/i
  )
  if (invUpdMatch) {
    const extracted = cleanEntityName(invUpdMatch[1])
    return {
      tool: BUSINESS_TOOLS.UPDATE_INVENTORY,
      type: 'WRITE',
      entity: { target: extracted },
    }
  }

  // ──────────────────────────────────────────────────────────
  // 2. READ TOOLS
  // ──────────────────────────────────────────────────────────

  // 2.1 Low stock & Restock timing
  if (
    lower.includes('restock') ||
    lower.includes('stok menipis') ||
    lower.includes('stok habis') ||
    lower.includes('stok kritis') ||
    lower.includes('stok rendah') ||
    lower.includes('low stock') ||
    lower.includes('kapan harus restock') ||
    lower.includes('kapan restock')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_LOW_STOCK, type: 'READ', entity: {} }
  }

  // 2.2 Inventory / Stock overview
  if (
    lower.includes('inventori') ||
    lower.includes('stok gudang') ||
    lower.includes('persediaan') ||
    lower.includes('cek stok') ||
    lower.includes('total stok') ||
    lower.includes('stok saya') ||
    lower.includes('status inventori')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_INVENTORY, type: 'READ', entity: {} }
  }

  // 2.3 Profit & Margin
  if (
    lower.includes('margin') ||
    lower.includes('profit') ||
    lower.includes('laba') ||
    lower.includes('keuntungan') ||
    lower.includes('margin kotor') ||
    lower.includes('margin terkecil') ||
    lower.includes('margin paling kecil')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_PROFIT, type: 'READ', entity: {} }
  }

  // 2.4 Revenue & Omzet
  if (
    lower.includes('omzet') ||
    lower.includes('omset') ||
    lower.includes('revenue') ||
    lower.includes('pendapatan')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_REVENUE, type: 'READ', entity: {} }
  }

  // 2.5 Sales & Top Products
  if (
    lower.includes('paling laku') ||
    lower.includes('terlaris') ||
    lower.includes('best seller') ||
    lower.includes('penjualan') ||
    lower.includes('sales') ||
    lower.includes('penjualan turun') ||
    lower.includes('kenapa penjualan turun') ||
    lower.includes('bandingkan penjualan')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_SALES, type: 'READ', entity: {} }
  }

  // 2.6 Cashflow
  if (
    lower.includes('arus kas') ||
    lower.includes('cashflow') ||
    lower.includes('cash flow') ||
    lower.includes('kas masuk') ||
    lower.includes('kas keluar')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_CASHFLOW, type: 'READ', entity: {} }
  }

  // 2.7 Customer metrics / CRM
  if (
    lower.includes('pelanggan') ||
    lower.includes('customer') ||
    lower.includes('crm') ||
    lower.includes('loyalitas') ||
    lower.includes('pembeli')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_CUSTOMER_METRICS, type: 'READ', entity: {} }
  }

  // 2.8 Suppliers list & analysis
  if (
    lower.includes('supplier') ||
    lower.includes('pemasok') ||
    lower.includes('mitra pasokan')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_SUPPLIERS, type: 'READ', entity: {} }
  }

  // 2.9 Orders & Transactions
  if (
    lower.includes('pesanan') ||
    lower.includes('order') ||
    lower.includes('transaksi')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_ORDERS, type: 'READ', entity: {} }
  }

  // 2.10 Products catalog
  if (
    lower.includes('katalog') ||
    lower.includes('daftar produk') ||
    lower.includes('semua produk') ||
    lower.includes('menu produk')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_PRODUCTS, type: 'READ', entity: {} }
  }

  // 2.11 Risk & Security analysis
  if (
    lower.includes('risiko') ||
    lower.includes('keamanan bisnis') ||
    lower.includes('audit risiko') ||
    lower.includes('risk')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_RISK, type: 'READ', entity: {} }
  }

  // 2.12 General Business Condition / Health / Overview
  if (
    lower.includes('kondisi bisnis') ||
    lower.includes('kesehatan bisnis') ||
    lower.includes('performa') ||
    lower.includes('overview') ||
    lower.includes('ringkasan') ||
    lower.includes('data yang tersedia')
  ) {
    return { tool: BUSINESS_TOOLS.ANALYZE_SALES, type: 'READ', entity: {} }
  }

  return {
    tool: null,
    type: 'UNKNOWN',
    intent: BUSINESS_TOOLS.GENERAL_CONVERSATION,
    entity: {},
  }
}
