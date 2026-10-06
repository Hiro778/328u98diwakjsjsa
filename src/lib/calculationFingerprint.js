/**
 * calculationFingerprint.js
 * Deterministic canonicalization and fingerprinting for calculation history.
 * Guarantees that identical calculation inputs produce the identical fingerprint
 * regardless of key ordering, whitespace, or floating point jitter.
 */

// Pure JS SHA-256 for browser, Node, and test runner compatibility
function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount))
  }

  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const lengthProperty = 'length'
  let i, j
  let result = ''

  const words = []
  const asciiBitLength = ascii[lengthProperty] * 8

  let hash = []
  const k = []
  let primeCounter = 0

  const isComposite = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = candidate * 2; i <= 311; i += candidate) {
        isComposite[i] = true
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0
      primeCounter++
    }
  }

  ascii += '\x80'
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00'
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i)
    if (j >> 8) return '' // Ensure UTF-8 pre-encoded
    words[i >> 2] |= j << (((3 - i) % 4) * 8)
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0
  words[words[lengthProperty]] = asciiBitLength | 0

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2]
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
      const val = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0
      w[i] = val

      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6])
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2])
      const s_1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)
      const s_0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)
      const temp1 = (hash[7] + s_1 + ch + k[i] + w[i]) | 0
      const temp2 = (s_0 + maj) | 0

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]]
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }
  return result
}

function utf8Encode(str) {
  try {
    return unescape(encodeURIComponent(str))
  } catch {
    return str
  }
}

/**
 * Normalizes numbers to eliminate floating point jitter and negative zero.
 */
export function normalizeNumber(val, decimals = 4) {
  const num = Number(val)
  if (!Number.isFinite(num)) return 0
  if (Object.is(num, -0)) return 0
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

/**
 * Recursively canonicalizes any JS value:
 * - Pruning ignored metadata (id, created_at, updated_at, notes, fingerprint)
 * - Sorting object keys alphabetically
 * - Trimming strings
 * - Normalizing numbers
 * - Sorting arrays where order is unordered
 */
export function canonicalize(val, options = {}) {
  if (val === null || val === undefined) return null

  if (typeof val === 'number') {
    return normalizeNumber(val, options.decimals ?? 4)
  }

  if (typeof val === 'string') {
    return val.trim()
  }

  if (typeof val === 'boolean') {
    return val
  }

  if (Array.isArray(val)) {
    const items = val.map(item => canonicalize(item, options))
    if (options.sortArrays) {
      return items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }
    return items
  }

  if (typeof val === 'object') {
    const result = {}
    const keys = Object.keys(val).sort()
    const excludeKeys = options.excludeKeys || ['id', 'created_at', 'updated_at', 'fingerprint', 'notes']

    for (const key of keys) {
      if (excludeKeys.includes(key)) continue
      result[key] = canonicalize(val[key], options)
    }
    return result
  }

  return String(val)
}

/**
 * Deterministic JSON stringify with sorted keys.
 */
export function canonicalStringify(val, options = {}) {
  return JSON.stringify(canonicalize(val, options))
}

/**
 * Extracts canonical input for specific tools.
 */
export function extractCanonicalInputs(toolType, payload) {
  if (!payload || typeof payload !== 'object') return {}

  const p = payload

  switch (toolType) {
    case 'margin_analysis': {
      return {
        product_id: p.product_id ? String(p.product_id).trim().toLowerCase() : null,
        product_name: (p.product_name || '').trim().toLowerCase(),
        cost_per_unit: normalizeNumber(p.cost_per_unit ?? p.costPerUnit ?? p.hpp_snapshot, 2),
        gross_selling_price: normalizeNumber(p.gross_selling_price ?? p.grossSellingPrice, 2),
        discount_percent: normalizeNumber(p.discount_percent ?? p.discountPercent, 2),
        selling_cost_per_unit: normalizeNumber(p.selling_cost_per_unit ?? p.sellingCostPerUnit, 2),
        quantity: Math.max(1, Math.round(Number(p.quantity) || 1)),
        analysis_mode: (p.analysis_mode || p.analysisMode || 'price').trim().toLowerCase(),
        target_margin: normalizeNumber(p.target_margin ?? p.targetMargin, 2),
        target_markup: normalizeNumber(p.target_markup ?? p.targetMarkup, 2),
      }
    }

    case 'hpp_calculation': {
      const breakdown = p.cost_breakdown || {}
      const sanitizeItems = (items, isDetailed = true) => {
        if (!Array.isArray(items)) return []
        return items
          .filter(i => i && (i.name || i.cost || i.pricePerUnit))
          .map(i => ({
            name: (i.name || '').trim().toLowerCase(),
            quantity: isDetailed ? normalizeNumber(i.quantity ?? 1, 4) : undefined,
            unit: isDetailed ? (i.unit || 'pcs').trim().toLowerCase() : undefined,
            price_per_unit: isDetailed ? normalizeNumber(i.pricePerUnit ?? i.price_per_unit ?? 0, 2) : undefined,
            cost: !isDetailed ? normalizeNumber(i.cost ?? 0, 2) : undefined,
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      }

      return {
        product_id: p.product_id ? String(p.product_id).trim().toLowerCase() : null,
        product_name: (p.product_name || '').trim().toLowerCase(),
        quantity_produced: normalizeNumber(p.quantity_produced ?? p.quantityProduced ?? 1, 4),
        production_unit: (p.production_unit || p.productionUnit || 'pcs').trim().toLowerCase(),
        waste_percentage: normalizeNumber(p.waste_percentage ?? p.wastePercent ?? 0, 2),
        price_mode: (p.price_mode || p.priceMode || 'markup').trim().toLowerCase(),
        markup_percent: normalizeNumber(p.markup_percent ?? p.markupPercent ?? 0, 2),
        margin_percent: normalizeNumber(p.margin_percent ?? p.marginPercent ?? 0, 2),
        materials: sanitizeItems(breakdown.materials, true),
        packaging: sanitizeItems(breakdown.packaging, true),
        labor: sanitizeItems(breakdown.labor, false),
        overhead: sanitizeItems(breakdown.overhead, false),
        other_costs: sanitizeItems(breakdown.otherCosts || breakdown.other_costs, false),
      }
    }

    case 'bep_calculation': {
      return {
        product_id: p.product_id ? String(p.product_id).trim().toLowerCase() : null,
        product_name: (p.product_name || '').trim().toLowerCase(),
        selling_price_per_unit: normalizeNumber(p.selling_price_per_unit ?? p.sellingPricePerUnit, 2),
        material_cost_per_unit: normalizeNumber(p.material_cost_per_unit ?? p.materialCostPerUnit, 2),
        packaging_cost_per_unit: normalizeNumber(p.packaging_cost_per_unit ?? p.packagingCostPerUnit, 2),
        sales_fee_per_unit: normalizeNumber(p.sales_fee_per_unit ?? p.salesFeePerUnit, 2),
        other_variable_cost_per_unit: normalizeNumber(p.other_variable_cost_per_unit ?? p.otherVariableCostPerUnit, 2),
        rent: normalizeNumber(p.rent, 2),
        fixed_labor: normalizeNumber(p.fixed_labor ?? p.fixedLabor, 2),
        utilities: normalizeNumber(p.utilities, 2),
        software: normalizeNumber(p.software, 2),
        other_fixed_costs: normalizeNumber(p.other_fixed_costs ?? p.otherFixedCosts, 2),
        actual_units: Math.floor(normalizeNumber(p.actual_units ?? p.actualUnits, 0)),
        target_profit: normalizeNumber(p.target_profit ?? p.targetProfit, 2),
      }
    }

    case 'cash_flow_forecast': {
      const sanitizeTxList = (list) => {
        if (!Array.isArray(list)) return []
        return list
          .filter(Boolean)
          .map(item => ({
            name: (item.name || item.category || '').trim().toLowerCase(),
            amount: normalizeNumber(item.amount ?? item.total, 2),
            period: (item.period || '').trim().toLowerCase(),
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      }

      return {
        forecast_name: (p.forecast_name || p.forecastName || '').trim().toLowerCase(),
        forecast_period: (p.forecast_period || p.forecastPeriod || '3_months').trim().toLowerCase(),
        opening_cash: normalizeNumber(p.opening_cash ?? p.openingCash, 2),
        minimum_cash_balance: normalizeNumber(p.minimum_cash_balance ?? p.minimumCashBalance, 2),
        maximum_cash_balance: normalizeNumber(p.maximum_cash_balance ?? p.maximumCashBalance, 2),
        inflows: sanitizeTxList(p.inflows),
        outflows: sanitizeTxList(p.outflows),
      }
    }

    case 'loan_simulation': {
      return {
        principal: normalizeNumber(p.principal, 2),
        annual_interest_rate: normalizeNumber(p.annual_interest_rate ?? p.annualInterestRate, 4),
        tenor_months: Math.round(normalizeNumber(p.tenor_months ?? p.tenorMonths, 0)),
        method: (p.method || 'annuity').trim().toLowerCase(),
        admin_fee: normalizeNumber(p.admin_fee ?? p.adminFee, 2),
        provision_rate: normalizeNumber(p.provision_rate ?? p.provisionRate, 4),
        other_fee: normalizeNumber(p.other_fee ?? p.otherFee, 2),
      }
    }

    case 'tax_planning': {
      return {
        period: (p.period || 'annual').trim().toLowerCase(),
        tax_regime: (p.tax_regime || p.taxRegime || 'umkm_final').trim().toLowerCase(),
        revenue: normalizeNumber(p.revenue, 2),
        deductible_expenses: normalizeNumber(p.deductible_expenses ?? p.deductibleExpenses, 2),
        tax_already_paid: normalizeNumber(p.tax_already_paid ?? p.taxAlreadyPaid, 2),
      }
    }

    case 'financial_health_score': {
      return {
        analysis_period: (p.analysis_period || '30_days').trim().toLowerCase(),
        period_start: String(p.period_start || '').trim(),
        period_end: String(p.period_end || '').trim(),
        score: Math.round(normalizeNumber(p.score, 0)),
        profitability_score: Math.round(normalizeNumber(p.profitability_score, 0)),
        cash_flow_score: Math.round(normalizeNumber(p.cash_flow_score, 0)),
        margin_score: Math.round(normalizeNumber(p.margin_score, 0)),
        break_even_score: Math.round(normalizeNumber(p.break_even_score, 0)),
        stability_score: Math.round(normalizeNumber(p.stability_score, 0)),
      }
    }

    default:
      return canonicalize(payload, { sortArrays: true })
  }
}

/**
 * Computes a deterministic SHA-256 fingerprint for a calculation.
 * Automatically extracts canonical inputs for the specified toolType.
 * Format: sha256("${toolType}:${canonicalJson}")
 */
export function computeCalculationFingerprint(toolType, inputs) {
  const canonicalInputs = extractCanonicalInputs(toolType, inputs)
  const canonicalStr = canonicalStringify(canonicalInputs, { sortArrays: true })
  const rawTarget = `${toolType}:${canonicalStr}`
  return sha256(utf8Encode(rawTarget))
}

/**
 * Checks if a Supabase error is a duplicate constraint violation.
 */
export function isDuplicateKeyViolation(error) {
  if (!error) return false
  const code = error.code || ''
  const msg = (error.message || error.details || '').toLowerCase()
  return (
    code === '23505' ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists')
  )
}
