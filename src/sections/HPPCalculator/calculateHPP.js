/**
 * HPP (Harga Pokok Penjualan) Calculation Engine
 *
 * Pure function — no side effects, no Supabase calls.
 * Follows Indonesian UMKM accounting conventions.
 */

// ─── Unit Conversion ─────────────────────────────────────────

const CONVERSION_FACTORS = {
  kg: { g: 1000, kg: 1 },
  g: { g: 1, kg: 0.001 },
  liter: { ml: 1000, liter: 1 },
  ml: { ml: 1, liter: 0.001 },
  pcs: { pcs: 1 },
}

/**
 * Convert quantity from one unit to another within the same family.
 * Returns the converted quantity, or the original quantity if no
 * conversion rule exists (custom units treated as identity).
 */
export function convertUnit(quantity, fromUnit, toUnit) {
  if (!quantity || !fromUnit || !toUnit) return quantity || 0
  const f = fromUnit.toLowerCase().trim()
  const t = toUnit.toLowerCase().trim()
  if (f === t) return quantity

  const factors = CONVERSION_FACTORS[f]
  if (!factors || factors[t] === undefined) {
    // Custom unit (ikat, lembar, pak, dus, etc.) — identity conversion
    return quantity
  }
  return quantity * factors[t]
}

// ─── Cost Calculations ───────────────────────────────────────

function calcItemCost(item) {
  const qty = Number(item.quantity) || 0
  const price = Number(item.pricePerUnit) || 0
  const fromUnit = (item.unit || '').toLowerCase().trim()
  const toUnit = (item.purchaseUnit || item.unit || '').toLowerCase().trim()
  // Convert if purchase unit differs from usage unit
  const convertedQty = convertUnit(qty, fromUnit, toUnit)
  const cost = convertedQty * price
  return Number.isFinite(cost) ? cost : 0
}

function calcFlatCost(item) {
  const cost = Number(item.cost) || 0
  return Number.isFinite(cost) ? cost : 0
}

// ─── Core Calculation ────────────────────────────────────────

/**
 * Calculate HPP from cost components.
 *
 * @param {Object} input
 * @param {Array}  input.materials     - [{ name, quantity, unit, pricePerUnit }]
 * @param {Array}  input.packaging     - [{ name, quantity, unit, pricePerUnit }]
 * @param {Array}  input.labor         - [{ name, cost }]
 * @param {Array}  input.overhead      - [{ name, cost }]
 * @param {Array}  input.otherCosts    - [{ name, cost }]
 * @param {number} input.quantityProduced - > 0
 * @param {string} input.priceMode     - 'markup' | 'margin'
 * @param {number} input.markupPercent - 0-1000+
 * @param {number} input.marginPercent - 0-99.99 (must be < 100)
 * @param {number} input.wastePercent  - 0-100 (applied once to materials)
 *
 * @returns {Object} result
 */
export function calculateHPP(input) {
  const {
    materials = [],
    packaging = [],
    labor = [],
    overhead = [],
    otherCosts = [],
    quantityProduced = 0,
    priceMode = 'markup',
    markupPercent = 0,
    marginPercent = 0,
    wastePercent = 0,
  } = input || {}

  const rawQty = Number(quantityProduced)
  const qty = Number.isFinite(rawQty) ? rawQty : 0
  const errors = []

  // ── Validation ──
  if (quantityProduced === '' || quantityProduced === undefined || quantityProduced === null) {
    errors.push('Jumlah produksi wajib diisi')
  } else if (!Number.isFinite(rawQty)) {
    errors.push('Jumlah produksi tidak valid')
  } else if (qty <= 0) {
    errors.push('Jumlah produksi harus lebih dari 0')
  }

  const rawMarkup = Number(markupPercent)
  const rawMargin = Number(marginPercent)
  const rawWaste = Number(wastePercent)
  const markup = Number.isFinite(rawMarkup) ? rawMarkup : 0
  const margin = Number.isFinite(rawMargin) ? rawMargin : 0
  const waste = Number.isFinite(rawWaste) ? rawWaste : 0

  if (priceMode === 'margin' && margin >= 100) {
    errors.push('Margin harus kurang dari 100%')
  }
  if (markup < 0) {
    errors.push('Markup tidak boleh negatif')
  }
  if (margin < 0) {
    errors.push('Margin tidak boleh negatif')
  }
  if (waste < 0 || waste > 100) {
    errors.push('Waste harus antara 0-100%')
  }

  // ── Validate individual cost items ──
  function validateCostItems(items, label, keys) {
    for (const item of items) {
      for (const key of keys) {
        const val = Number(item[key])
        if (item[key] !== '' && item[key] !== undefined && !Number.isFinite(val)) {
          errors.push(`${label} "${item.name || '(tanpa nama)'}" memiliki nilai tidak valid`)
        } else if (Number.isFinite(val) && val < 0) {
          errors.push(`${label} "${item.name || '(tanpa nama)'}" tidak boleh negatif`)
        }
      }
    }
  }
  validateCostItems(materials, 'Bahan Baku', ['quantity', 'pricePerUnit'])
  validateCostItems(packaging, 'Kemasan', ['quantity', 'pricePerUnit'])
  validateCostItems(labor, 'Tenaga Kerja', ['cost'])
  validateCostItems(overhead, 'Overhead', ['cost'])
  validateCostItems(otherCosts, 'Biaya Lain', ['cost'])

  // ── Component Costs ──
  const materialBase = materials.reduce((sum, item) => sum + calcItemCost(item), 0)
  const materialCostWithWaste = materialBase * (1 + waste / 100)
  const packagingCost = packaging.reduce((sum, item) => sum + calcItemCost(item), 0)
  const directLaborCost = labor.reduce((sum, item) => sum + calcFlatCost(item), 0)
  const overheadCost = overhead.reduce((sum, item) => sum + calcFlatCost(item), 0)
  const otherCost = otherCosts.reduce((sum, item) => sum + calcFlatCost(item), 0)

  // ── Totals (full precision, no intermediate rounding) ──
  const rawTotalCost = materialCostWithWaste + packagingCost + directLaborCost + overheadCost + otherCost
  const totalCost = Number.isFinite(rawTotalCost) ? rawTotalCost : 0
  const hppPerUnit = qty > 0 ? totalCost / qty : 0

  // ── Selling Price ──
  let sellingPrice = 0
  if (priceMode === 'markup') {
    sellingPrice = hppPerUnit * (1 + markup / 100)
  } else {
    sellingPrice = margin < 100 ? hppPerUnit / (1 - margin / 100) : 0
  }

  // Protect against NaN/Infinity from edge cases
  if (!Number.isFinite(sellingPrice)) sellingPrice = 0

  const actualMargin = sellingPrice > 0 ? ((sellingPrice - hppPerUnit) / sellingPrice) * 100 : 0
  const profitPerUnit = sellingPrice - hppPerUnit

  // ── Final monetary rounding (display precision) ──
  const round2 = (n) => {
    if (!Number.isFinite(n)) return 0
    return Math.round(n * 100) / 100
  }

  return {
    isValid: errors.length === 0,
    errors,
    materialCost: round2(materialCostWithWaste),
    materialCostBase: round2(materialBase),
    packagingCost: round2(packagingCost),
    directLaborCost: round2(directLaborCost),
    overheadCost: round2(overheadCost),
    otherCost: round2(otherCost),
    totalCost: round2(totalCost),
    hppPerUnit: round2(hppPerUnit),
    sellingPrice: round2(sellingPrice),
    actualMargin: round2(actualMargin),
    profitPerUnit: round2(profitPerUnit),
  }
}
