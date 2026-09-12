/**
 * Financial Health Score Calculation Engine
 *
 * Pure functions — no side effects, no Supabase, no React.
 * Produces a deterministic 0-100 health score from real business data.
 *
 * 5 Components:
 *   1. Profitability (net profit margin)
 *   2. Cash Flow (positive balance consistency)
 *   3. Margin (gross margin from HPP data)
 *   4. Break-Even (revenue vs BEP)
 *   5. Stability (revenue consistency)
 *
 * No AI, no randomness, no fake scores.
 */

const round2 = (n) => Math.round(n * 100) / 100
const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ─── Minimum Data Requirements ───────────────────────────────

export const MIN_SALES_FOR_HEALTH = 10
export const MIN_DAYS_FOR_HEALTH = 14

// ─── Component Weights ───────────────────────────────────────

export const COMPONENT_WEIGHTS = {
  profitability: 0.30,
  cashFlow: 0.20,
  margin: 0.20,
  breakEven: 0.15,
  stability: 0.15,
}

// ─── Score Classification ────────────────────────────────────

export function classifyScore(score) {
  if (score >= 80) return { label: 'Sangat Sehat', color: 'green', emoji: '🟢' }
  if (score >= 60) return { label: 'Sehat', color: 'green', emoji: '🟢' }
  if (score >= 40) return { label: 'Perlu Perhatian', color: 'yellow', emoji: '🟡' }
  if (score >= 20) return { label: 'Kurang Sehat', color: 'orange', emoji: '🟠' }
  return { label: 'Kritis', color: 'red', emoji: '🔴' }
}

// ─── Safe Math ───────────────────────────────────────────────

function clamp0100(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function safePercent(num, denom) {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom === 0) return null
  return round2((num / denom) * 100)
}

// ─── 1. Profitability Score ──────────────────────────────────

/**
 * Score based on net profit margin.
 *
 * Net profit = revenue - all expenses
 * Net profit margin = net profit / revenue * 100
 *
 * Scoring:
 *   >= 20% margin → 100
 *   >= 15% → 80
 *   >= 10% → 60
 *   >= 5% → 40
 *   >= 0% → 20
 *   < 0% (loss) → 0
 */
export function scoreProfitability(revenue, totalExpenses) {
  const rev = safeNum(revenue)
  const exp = safeNum(totalExpenses)

  if (rev <= 0) return { score: 0, metric: null, status: 'insufficient_data', detail: 'Revenue belum tersedia.' }

  const netProfit = rev - exp
  const margin = safePercent(netProfit, rev)
  if (margin === null) return { score: 0, metric: null, status: 'insufficient_data', detail: 'Tidak dapat menghitung margin.' }

  let score
  if (margin >= 20) score = 100
  else if (margin >= 15) score = 80
  else if (margin >= 10) score = 60
  else if (margin >= 5) score = 40
  else if (margin >= 0) score = 20
  else score = 0

  return {
    score,
    metric: round2(margin),
    status: 'available',
    detail: `Net profit margin ${margin}%. ${margin >= 10 ? 'Bagus.' : margin >= 0 ? 'Masih bisa ditingkatkan.' : 'Bisnis mengalami kerugian.'}`,
  }
}

// ─── 2. Cash Flow Score ──────────────────────────────────────

/**
 * Score based on % of periods with positive closing balance.
 *
 * Requires daily sales + expense data to estimate daily cash flow.
 * Uses day-by-day net cash flow: positive = good day.
 *
 * Scoring:
 *   >= 90% positive → 100
 *   >= 80% → 80
 *   >= 70% → 60
 *   >= 50% → 40
 *   < 50% → 20
 *   No data → 0
 */
export function scoreCashFlow(dailyNetCashFlows) {
  if (!Array.isArray(dailyNetCashFlows) || dailyNetCashFlows.length === 0) {
    return { score: 0, metric: null, status: 'insufficient_data', detail: 'Data cash flow belum tersedia.' }
  }

  const validDays = dailyNetCashFlows.filter(v => Number.isFinite(v))
  if (validDays.length < MIN_DAYS_FOR_HEALTH) {
    return { score: 0, metric: null, status: 'insufficient_data', detail: `Data kurang dari ${MIN_DAYS_FOR_HEALTH} hari.` }
  }

  const positiveDays = validDays.filter(v => v > 0).length
  const ratio = positiveDays / validDays.length
  const percentPositive = round2(ratio * 100)

  let score
  if (percentPositive >= 90) score = 100
  else if (percentPositive >= 80) score = 80
  else if (percentPositive >= 70) score = 60
  else if (percentPositive >= 50) score = 40
  else score = 20

  return {
    score,
    metric: percentPositive,
    status: 'available',
    detail: `${percentPositive}% hari memiliki cash flow positif.`,
  }
}

// ─── 3. Margin Score ─────────────────────────────────────────

/**
 * Score based on gross margin (from HPP/product data).
 *
 * Requires products with cost_price or HPP calculations.
 *
 * Scoring:
 *   >= 50% margin → 100
 *   >= 40% → 80
 *   >= 30% → 60
 *   >= 20% → 40
 *   >= 10% → 20
 *   < 10% → 0
 *   No data → not_applicable
 */
export function scoreMargin(productsWithHPP) {
  if (!Array.isArray(productsWithHPP) || productsWithHPP.length === 0) {
    return { score: 0, metric: null, status: 'not_applicable', detail: 'Data HPP belum tersedia. Gunakan HPP Calculator.' }
  }

  const valid = productsWithHPP.filter(p =>
    Number.isFinite(p.unitPrice) && Number.isFinite(p.costPrice) &&
    p.unitPrice > 0 && p.costPrice > 0
  )

  if (valid.length === 0) {
    return { score: 0, metric: null, status: 'not_applicable', detail: 'Data HPP belum lengkap.' }
  }

  // Weighted average margin by revenue potential
  let totalRevenue = 0
  let totalCost = 0
  for (const p of valid) {
    totalRevenue += p.unitPrice
    totalCost += p.costPrice
  }

  const avgMargin = safePercent(totalRevenue - totalCost, totalRevenue)
  if (avgMargin === null) return { score: 0, metric: null, status: 'insufficient_data', detail: 'Tidak dapat menghitung margin.' }

  let score
  if (avgMargin >= 50) score = 100
  else if (avgMargin >= 40) score = 80
  else if (avgMargin >= 30) score = 60
  else if (avgMargin >= 20) score = 40
  else if (avgMargin >= 10) score = 20
  else score = 0

  return {
    score,
    metric: avgMargin,
    status: 'available',
    detail: `Gross margin rata-rata ${avgMargin}%.`,
  }
}

// ─── 4. Break-Even Score ────────────────────────────────────

/**
 * Score based on revenue vs break-even point.
 *
 * BEP coverage = revenue / BEP revenue
 *
 * Scoring:
 *   >= 2.0x → 100
 *   >= 1.5x → 80
 *   >= 1.2x → 60
 *   >= 1.0x → 40
 *   >= 0.8x → 20
 *   < 0.8x → 0
 *   No BEP data → not_applicable
 */
export function scoreBreakEven(revenue, bepRevenue) {
  const rev = safeNum(revenue)
  const bep = safeNum(bepRevenue)

  if (bep <= 0 || rev <= 0) {
    return { score: 0, metric: null, status: 'not_applicable', detail: 'Data BEP belum tersedia. Gunakan BEP Calculator.' }
  }

  const coverage = round2(rev / bep)

  let score
  if (coverage >= 2.0) score = 100
  else if (coverage >= 1.5) score = 80
  else if (coverage >= 1.2) score = 60
  else if (coverage >= 1.0) score = 40
  else if (coverage >= 0.8) score = 20
  else score = 0

  return {
    score,
    metric: coverage,
    status: 'available',
    detail: `Revenue ${coverage}× di atas BEP.`,
  }
}

// ─── 5. Stability Score ─────────────────────────────────────

/**
 * Score based on revenue consistency (Coefficient of Variation).
 *
 * CV = stddev / mean
 *
 * Scoring:
 *   CV <= 10% → 100 (very stable)
 *   CV <= 20% → 80
 *   CV <= 30% → 60
 *   CV <= 50% → 40
 *   CV > 50% → 20
 *   No data → insufficient_data
 */
export function scoreStability(dailyRevenues) {
  if (!Array.isArray(dailyRevenues) || dailyRevenues.length < MIN_DAYS_FOR_HEALTH) {
    return { score: 0, metric: null, status: 'insufficient_data', detail: `Data kurang dari ${MIN_DAYS_FOR_HEALTH} hari.` }
  }

  const valid = dailyRevenues.filter(v => Number.isFinite(v) && v >= 0)
  if (valid.length < MIN_DAYS_FOR_HEALTH) {
    return { score: 0, metric: null, status: 'insufficient_data', detail: 'Data tidak cukup.' }
  }

  const mean = valid.reduce((s, v) => s + v, 0) / valid.length
  if (mean === 0) {
    return { score: 20, metric: 0, status: 'available', detail: 'Revenue nol — tidak ada variasi.' }
  }

  const variance = valid.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / valid.length
  const stddev = Math.sqrt(variance)
  const cv = round2((stddev / mean) * 100)

  let score
  if (cv <= 10) score = 100
  else if (cv <= 20) score = 80
  else if (cv <= 30) score = 60
  else if (cv <= 50) score = 40
  else score = 20

  return {
    score,
    metric: cv,
    status: 'available',
    detail: `Variasi revenue ${cv}%. ${cv <= 20 ? 'Stabil.' : 'Perlu diperhatikan.'}`,
  }
}

// ─── Risk Generator ──────────────────────────────────────────

export function generateRisks(components) {
  const risks = []

  if (components.profitability.status === 'available' && components.profitability.metric !== null) {
    if (components.profitability.metric < 0) {
      risks.push({ severity: 'critical', text: 'Bisnis mengalami kerugian. Revenue tidak menutupi pengeluaran.' })
    } else if (components.profitability.metric < 5) {
      risks.push({ severity: 'attention', text: `Profit margin rendah (${components.profitability.metric}%). Pertimbangkan optimasi biaya atau harga jual.` })
    }
  }

  if (components.cashFlow.status === 'available' && components.cashFlow.metric !== null) {
    if (components.cashFlow.metric < 50) {
      risks.push({ severity: 'critical', text: `Hanya ${components.cashFlow.metric}% hari dengan cash flow positif. Likuiditas perlu diperhatikan.` })
    } else if (components.cashFlow.metric < 70) {
      risks.push({ severity: 'attention', text: `Cash flow positif ${components.cashFlow.metric}% hari. Beberapa periode mengalami defisit.` })
    }
  }

  if (components.margin.status === 'available' && components.margin.metric !== null) {
    if (components.margin.metric < 20) {
      risks.push({ severity: 'attention', text: `Gross margin ${components.margin.metric}% — di bawah target ideal 30%+.` })
    }
  }

  if (components.breakEven.status === 'available' && components.breakEven.metric !== null) {
    if (components.breakEven.metric < 1.0) {
      risks.push({ severity: 'critical', text: `Revenue belum mencapai break-even point (${components.breakEven.metric}×).` })
    } else if (components.breakEven.metric < 1.2) {
      risks.push({ severity: 'attention', text: `Revenue hanya ${components.breakEven.metric}× di atas BEP — margin aman tipis.` })
    }
  }

  if (components.stability.status === 'available' && components.stability.metric !== null) {
    if (components.stability.metric > 50) {
      risks.push({ severity: 'attention', text: `Variasi revenue tinggi (${components.stability.metric}%). Pendapatan tidak konsisten.` })
    }
  }

  // Sort: critical first
  risks.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))
  return risks
}

// ─── Positive Signals ────────────────────────────────────────

export function generatePositiveSignals(components) {
  const signals = []

  if (components.cashFlow.status === 'available' && components.cashFlow.metric >= 90) {
    signals.push(`✓ Cash flow positif pada ${components.cashFlow.metric}% periode`)
  }

  if (components.breakEven.status === 'available' && components.breakEven.metric >= 2.0) {
    signals.push(`✓ Revenue berada ${components.breakEven.metric}× di atas BEP`)
  }

  if (components.profitability.status === 'available' && components.profitability.metric >= 15) {
    signals.push(`✓ Profit margin ${components.profitability.metric}% — di atas target`)
  }

  if (components.margin.status === 'available' && components.margin.metric >= 40) {
    signals.push(`✓ Gross margin ${components.margin.metric}% — sehat`)
  }

  if (components.stability.status === 'available' && components.stability.metric <= 15) {
    signals.push(`✓ Revenue stabil (variasi ${components.stability.metric}%)`)
  }

  return signals.slice(0, 3) // max 3
}

// ─── Main: Calculate Financial Health Score ──────────────────

/**
 * Calculate the Financial Health Score.
 *
 * @param {Object} input
 * @param {number} input.revenue - total revenue in period
 * @param {number} input.totalExpenses - total expenses in period
 * @param {Array}  input.dailyNetCashFlows - [number] daily net cash flow estimates
 * @param {Array}  input.productsWithHPP - [{ unitPrice, costPrice }]
 * @param {number} input.bepRevenue - break-even revenue
 * @param {Array}  input.dailyRevenues - [number] daily revenue values
 * @param {number} input.prevScore - previous period score (optional)
 * @param {number} input.anomalyCount - anomaly count in period (optional)
 *
 * @returns {Object} result
 */
export function calculateFinancialHealthScore(input) {
  const {
    revenue = 0,
    totalExpenses = 0,
    dailyNetCashFlows = [],
    productsWithHPP = [],
    bepRevenue = 0,
    dailyRevenues = [],
    prevScore = null,
    anomalyCount = 0,
  } = input || {}

  // Check minimum data
  const totalSalesData = dailyRevenues.length
  const hasMinimalData = totalSalesData >= MIN_DAYS_FOR_HEALTH || (revenue > 0 && totalExpenses > 0)

  if (!hasMinimalData && dailyNetCashFlows.length < MIN_DAYS_FOR_HEALTH) {
    return {
      isValid: false,
      errors: [],
      score: 0,
      classification: classifyScore(0),
      components: {},
      risks: [],
      positiveSignals: [],
      prevScore: null,
      scoreChange: null,
      dataQuality: 'cold_start',
      anomalyCount: safeNum(anomalyCount),
    }
  }

  // Calculate components
  const profitability = scoreProfitability(revenue, totalExpenses)
  const cashFlow = scoreCashFlow(dailyNetCashFlows)
  const margin = scoreMargin(productsWithHPP)
  const breakEven = scoreBreakEven(revenue, bepRevenue)
  const stability = scoreStability(dailyRevenues)

  // Calculate weighted score
  const availableWeights = {}
  let totalWeight = 0
  let weightedSum = 0

  for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS)) {
    const comp = { profitability, cashFlow, margin, breakEven, stability }[key]
    if (comp && comp.status === 'available') {
      availableWeights[key] = weight
      totalWeight += weight
      weightedSum += comp.score * weight
    }
  }

  // Normalize weights if some components unavailable
  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0
  const score = clamp0100(Math.round(rawScore))

  // Risks and signals
  const components = { profitability, cashFlow, margin, breakEven, stability }
  const risks = generateRisks(components)
  const positiveSignals = generatePositiveSignals(components)

  // Previous period comparison
  const prev = safeNum(prevScore) || null
  const change = prev !== null ? score - prev : null

  return {
    isValid: true,
    errors: [],
    score,
    classification: classifyScore(score),
    components,
    risks,
    positiveSignals,
    prevScore: prev,
    scoreChange: change,
    dataQuality: totalWeight < 0.3 ? 'insufficient_data' : 'available',
    anomalyCount: safeNum(anomalyCount),
  }
}
