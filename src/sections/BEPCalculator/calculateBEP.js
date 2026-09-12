/**
 * BEP (Break Even Point) Calculation Engine
 *
 * Pure function — no side effects, no Supabase calls.
 * Single-product BEP model.
 *
 * Compatible with database numeric(15,2) — max 9,999,999,999,999.99
 */

const MAX_MONETARY = 9_999_999_999_999.99

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Calculate Break Even Point from cost/revenue inputs.
 *
 * @param {Object} input
 * @param {number} input.sellingPricePerUnit   - harga jual per unit (> 0)
 * @param {number} input.materialCostPerUnit   - bahan baku per unit (>= 0)
 * @param {number} input.packagingCostPerUnit  - kemasan per unit (>= 0)
 * @param {number} input.salesFeePerUnit       - fee penjualan per unit (>= 0)
 * @param {number} input.otherVariableCostPerUnit - biaya variabel lain per unit (>= 0)
 * @param {number} input.rent                  - sewa (>= 0)
 * @param {number} input.fixedLabor            - gaji tetap (>= 0)
 * @param {number} input.utilities             - utilitas (>= 0)
 * @param {number} input.software              - software/subscription (>= 0)
 * @param {number} input.otherFixedCosts       - biaya tetap lain (>= 0)
 * @param {number} input.actualUnits           - penjualan aktual (>= 0, optional)
 * @param {number} input.targetProfit          - target profit (>= 0, optional)
 *
 * @returns {Object} result
 */
export function calculateBEP(input) {
  const {
    sellingPricePerUnit = 0,
    materialCostPerUnit = 0,
    packagingCostPerUnit = 0,
    salesFeePerUnit = 0,
    otherVariableCostPerUnit = 0,
    rent = 0,
    fixedLabor = 0,
    utilities = 0,
    software = 0,
    otherFixedCosts = 0,
    actualUnits = 0,
    targetProfit = 0,
  } = input || {}

  const sp = Number(sellingPricePerUnit) || 0
  const mat = Number(materialCostPerUnit) || 0
  const pkg = Number(packagingCostPerUnit) || 0
  const fee = Number(salesFeePerUnit) || 0
  const otherVar = Number(otherVariableCostPerUnit) || 0
  const r = Number(rent) || 0
  const lab = Number(fixedLabor) || 0
  const util = Number(utilities) || 0
  const sw = Number(software) || 0
  const otherFix = Number(otherFixedCosts) || 0
  const units = Math.floor(Number(actualUnits)) || 0
  const tp = Number(targetProfit) || 0

  const errors = []

  // ── Validation ──
  if (sp <= 0 || !Number.isFinite(sp)) {
    errors.push('Harga jual per unit harus lebih dari 0')
  }
  if (sp > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (mat < 0 || !Number.isFinite(mat)) errors.push('Biaya bahan baku tidak boleh negatif')
  if (mat > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (pkg < 0 || !Number.isFinite(pkg)) errors.push('Biaya kemasan tidak boleh negatif')
  if (pkg > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (fee < 0 || !Number.isFinite(fee)) errors.push('Fee penjualan tidak boleh negatif')
  if (fee > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (otherVar < 0 || !Number.isFinite(otherVar)) errors.push('Biaya variabel lain tidak boleh negatif')
  if (otherVar > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (r < 0 || !Number.isFinite(r)) errors.push('Sewa tidak boleh negatif')
  if (r > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (lab < 0 || !Number.isFinite(lab)) errors.push('Gaji tetap tidak boleh negatif')
  if (lab > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (util < 0 || !Number.isFinite(util)) errors.push('Utilitas tidak boleh negatif')
  if (util > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (sw < 0 || !Number.isFinite(sw)) errors.push('Software tidak boleh negatif')
  if (sw > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (otherFix < 0 || !Number.isFinite(otherFix)) errors.push('Biaya tetap lain tidak boleh negatif')
  if (otherFix > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  if (tp < 0 || !Number.isFinite(tp)) errors.push('Target profit tidak boleh negatif')
  if (tp > MAX_MONETARY) errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')

  // ── Variable Costs ──
  const variableCostPerUnit = mat + pkg + fee + otherVar

  if (sp > 0 && variableCostPerUnit >= sp) {
    errors.push('Biaya variabel per unit harus lebih rendah dari harga jual')
  }

  // ── Fixed Costs ──
  const fixedCosts = r + lab + util + sw + otherFix

  // ── Contribution Margin ──
  const contributionMarginPerUnit = sp - variableCostPerUnit
  const contributionMarginRatio = sp > 0 ? contributionMarginPerUnit / sp : 0

  // ── BEP ──
  let bepUnits = 0
  let bepRevenue = 0

  if (contributionMarginPerUnit > 0) {
    bepUnits = fixedCosts / contributionMarginPerUnit
    bepRevenue = fixedCosts / contributionMarginRatio
  }

  // ── Actual Sales ──
  const actualRevenue = units * sp

  // ── Margin of Safety ──
  let marginOfSafety = 0
  let marginOfSafetyPercent = 0

  if (actualRevenue > 0) {
    marginOfSafety = actualRevenue - bepRevenue
    marginOfSafetyPercent = (marginOfSafety / actualRevenue) * 100
  }

  // ── Target Profit ──
  let requiredUnitsForTargetProfit = 0
  let requiredRevenueForTargetProfit = 0

  if (tp > 0 && contributionMarginPerUnit > 0) {
    requiredUnitsForTargetProfit = (fixedCosts + tp) / contributionMarginPerUnit
    requiredRevenueForTargetProfit = (fixedCosts + tp) / contributionMarginRatio
  }

  return {
    isValid: errors.length === 0,
    errors,

    sellingPricePerUnit: round2(sp),
    variableCostPerUnit: round2(variableCostPerUnit),

    materialCostPerUnit: round2(mat),
    packagingCostPerUnit: round2(pkg),
    salesFeePerUnit: round2(fee),
    otherVariableCostPerUnit: round2(otherVar),

    fixedCosts: round2(fixedCosts),
    rent: round2(r),
    fixedLabor: round2(lab),
    utilities: round2(util),
    software: round2(sw),
    otherFixedCosts: round2(otherFix),

    contributionMarginPerUnit: round2(contributionMarginPerUnit),
    contributionMarginRatio: round2(contributionMarginRatio * 100), // as percentage

    bepUnits: round2(bepUnits),
    bepRevenue: round2(bepRevenue),

    actualUnits: units,
    actualRevenue: round2(actualRevenue),

    marginOfSafety: round2(marginOfSafety),
    marginOfSafetyPercent: round2(marginOfSafetyPercent),

    targetProfit: round2(tp),
    requiredUnitsForTargetProfit: round2(requiredUnitsForTargetProfit),
    requiredRevenueForTargetProfit: round2(requiredRevenueForTargetProfit),
  }
}
