/**
 * Margin Analysis Calculation Engine
 *
 * Pure function — no side effects, no Supabase calls.
 * Three analysis modes: by selling price, target margin, target markup.
 */

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Calculate margin analysis from input.
 *
 * @param {Object} input
 * @param {number} input.costPerUnit        - HPP / cost per unit (>= 0)
 * @param {number} input.sellingPrice        - gross selling price (mode: 'price')
 * @param {number} input.discountPercent     - discount % (0-100, optional)
 * @param {number} input.sellingCostPerUnit  - variable selling cost per unit (>= 0, optional)
 * @param {number} input.quantity            - number of units (> 0)
 * @param {string} input.analysisMode        - 'price' | 'target_margin' | 'target_markup'
 * @param {number} input.targetMargin        - target margin % (0-99.99, mode: 'target_margin')
 * @param {number} input.targetMarkup        - target markup % (>= 0, mode: 'target_markup')
 *
 * @returns {Object} result with isValid, errors, and all calculated values
 */
export function calculateMarginAnalysis(input) {
  const {
    costPerUnit = 0,
    sellingPrice = 0,
    discountPercent = 0,
    sellingCostPerUnit = 0,
    quantity = 1,
    analysisMode = 'price',
    targetMargin = 0,
    targetMarkup = 0,
  } = input || {}

  const cost = Number(costPerUnit) || 0
  const price = Number(sellingPrice) || 0
  const discount = Number(discountPercent) || 0
  const sellCost = Number(sellingCostPerUnit) || 0
  const qty = Math.floor(Number(quantity)) || 0
  const tMargin = Number(targetMargin) || 0
  const tMarkup = Number(targetMarkup) || 0

  const errors = []

  // ── Validation ──
  if (cost < 0 || !Number.isFinite(cost)) {
    errors.push('HPP/Cost tidak boleh negatif')
  }
  if (qty <= 0) {
    errors.push('Jumlah unit harus lebih dari 0')
  }
  if (discount < 0 || discount > 100) {
    errors.push('Diskon harus antara 0-100%')
  }
  if (sellCost < 0 || !Number.isFinite(sellCost)) {
    errors.push('Biaya penjualan tidak boleh negatif')
  }

  if (analysisMode === 'price') {
    if (price < 0 || !Number.isFinite(price)) {
      errors.push('Harga jual tidak boleh negatif')
    }
  } else if (analysisMode === 'target_margin') {
    if (!Number.isFinite(tMargin) || tMargin >= 100) {
      errors.push('Target margin harus kurang dari 100%')
    }
    if (tMargin < 0) {
      errors.push('Target margin tidak boleh negatif')
    }
  } else if (analysisMode === 'target_markup') {
    if (!Number.isFinite(tMarkup) || tMarkup < 0) {
      errors.push('Target markup tidak boleh negatif')
    }
  }

  // ── Calculate effective selling price ──
  let effectiveSellingPrice = 0
  let grossSellingPrice = 0
  let discountAmount = 0

  if (analysisMode === 'price') {
    grossSellingPrice = price
    discountAmount = price * (discount / 100)
    effectiveSellingPrice = price - discountAmount
  } else if (analysisMode === 'target_margin') {
    // sellingPrice = cost / (1 - margin/100)
    effectiveSellingPrice = tMargin < 100 ? cost / (1 - tMargin / 100) : 0
    grossSellingPrice = effectiveSellingPrice
    discountAmount = 0
  } else if (analysisMode === 'target_markup') {
    // sellingPrice = cost * (1 + markup/100)
    effectiveSellingPrice = cost * (1 + tMarkup / 100)
    grossSellingPrice = effectiveSellingPrice
    discountAmount = 0
  }

  // ── Profit & Margin ──
  const totalCostPerUnit = cost + sellCost
  const profitPerUnit = effectiveSellingPrice - totalCostPerUnit
  const marginPercent = effectiveSellingPrice > 0
    ? (profitPerUnit / effectiveSellingPrice) * 100
    : 0
  const markupPercent = cost > 0
    ? (profitPerUnit / cost) * 100
    : 0

  // ── Totals ──
  const revenue = effectiveSellingPrice * qty
  const totalCost = totalCostPerUnit * qty
  const totalProfit = profitPerUnit * qty

  return {
    isValid: errors.length === 0,
    errors,
    costPerUnit: round2(cost),
    grossSellingPrice: round2(grossSellingPrice),
    discountAmount: round2(discountAmount),
    effectiveSellingPrice: round2(effectiveSellingPrice),
    sellingCostPerUnit: round2(sellCost),
    totalCostPerUnit: round2(totalCostPerUnit),
    profitPerUnit: round2(profitPerUnit),
    marginPercent: round2(marginPercent),
    markupPercent: round2(markupPercent),
    quantity: qty,
    revenue: round2(revenue),
    totalCost: round2(totalCost),
    totalProfit: round2(totalProfit),
  }
}

/**
 * Generate scenario comparison table.
 * Shows profit/margin/markup for multiple selling prices.
 *
 * @param {number} costPerUnit
 * @param {number[]} sellingPrices
 * @param {number} sellingCostPerUnit
 * @returns {Array} [{ sellingPrice, profit, margin, markup }]
 */
export function generateScenarios(costPerUnit, sellingPrices, sellingCostPerUnit = 0) {
  const cost = Number(costPerUnit) || 0
  const sellCost = Number(sellingCostPerUnit) || 0
  const totalCost = cost + sellCost

  return (sellingPrices || []).map(sp => {
    const price = Number(sp) || 0
    const profit = price - totalCost
    const margin = price > 0 ? (profit / price) * 100 : 0
    const markup = cost > 0 ? (profit / cost) * 100 : 0

    return {
      sellingPrice: round2(price),
      profit: round2(profit),
      marginPercent: round2(margin),
      markupPercent: round2(markup),
    }
  })
}
