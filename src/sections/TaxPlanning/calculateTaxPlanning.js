/**
 * Tax Planning Calculation Engine
 *
 * Pure function — no side effects, no Supabase calls.
 * Estimates tax liability for Indonesian UMKM.
 *
 * CRITICAL: Results are ESTIMATES only, not official tax assessments.
 *
 * Tax regime assumptions are isolated in TAX_REGIMES config.
 * Rates/rules can be updated without touching the UI.
 */

const MAX_MONETARY = 9_999_999_999_999.99
const round2 = (n) => Math.round(n * 100) / 100

// ─── Tax Regime Configuration ─────────────────────────────────
// UPDATE these values when Indonesian tax rules change.

export const TAX_REGIMES = {
  umkm_final: {
    id: 'umkm_final',
    label: 'Pajak Final UMKM (0.5%)',
    description: 'Pajak final 0.5% dari omset bruto. Berlaku untuk UMKM dengan omset ≤ Rp4,8 miliar/tahun.',
    rate: 0.005,
    type: 'final',
    revenueCap: 4_800_000_000,
    usesExpenses: false,
    npwpRequired: true,
  },
  pph_badan: {
    id: 'pph_badan',
    label: 'PPh Badan (22%)',
    description: 'Pajak penghasilan badan 22% dari penghasilan kena pajak (omset dikurangi biaya).',
    rate: 0.22,
    type: 'progressive',
    revenueCap: null,
    usesExpenses: true,
    npwpRequired: true,
  },
  pph_non_pnbp: {
    id: 'pph_non_pnbp',
    label: 'PPh Final Pasal 4(2) (10%)',
    description: 'Pajak final 10% dari bruto. Berlaku untuk jenis penghasilan tertentu.',
    rate: 0.10,
    type: 'final',
    revenueCap: null,
    usesExpenses: false,
    npwpRequired: false,
  },
  custom: {
    id: 'custom',
    label: 'Custom / Lainnya',
    description: 'Masukkan tarif pajak sendiri.',
    rate: 0,
    type: 'custom',
    revenueCap: null,
    usesExpenses: true,
    npwpRequired: false,
  },
}

export const DEFAULT_REGIME = 'umkm_final'

// ─── Expense Categories ───────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  { id: 'materials', label: 'Bahan Baku' },
  { id: 'packaging', label: 'Kemasan' },
  { id: 'labor', label: 'Tenaga Kerja' },
  { id: 'rent', label: 'Sewa' },
  { id: 'utilities', label: 'Utilitas' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'software', label: 'Software / Langganan' },
  { id: 'transport', label: 'Transportasi' },
  { id: 'other', label: 'Lainnya' },
]

// ─── Helper ──────────────────────────────────────────────────

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// ─── Main Calculation ─────────────────────────────────────────

/**
 * Calculate tax planning estimation.
 *
 * @param {Object} input
 * @param {number} input.revenue              - total revenue (Rp)
 * @param {string} input.revenueMode          - 'monthly' | 'annual'
 * @param {Array}  input.monthlyRevenue       - optional [{month, amount}] for monthly breakdown
 * @param {Array}  input.expenses             - [{category, amount, period: 'monthly'|'annual'}]
 * @param {string} input.taxRegime            - key from TAX_REGIMES
 * @param {number} input.customRate           - custom tax rate (0-1) if regime = custom
 * @param {number} input.taxAlreadyPaid       - tax already paid/prepaid (Rp)
 * @param {number} input.taxCredits          - tax credits (Rp)
 * @param {boolean} input.hasNPWP            - has NPWP
 * @param {string} input.period              - 'monthly' | 'annual'
 *
 * @returns {Object} result
 */
export function calculateTaxPlanning(input) {
  const {
    revenue = 0,
    revenueMode = 'annual',
    monthlyRevenue = [],
    expenses = [],
    taxRegime = DEFAULT_REGIME,
    customRate = 0,
    taxAlreadyPaid = 0,
    taxCredits = 0,
    hasNPWP = true,
    period: _period = 'annual',
  } = input || {}

  const errors = []
  const warnings = []

  // ── Validation: Revenue (check raw before conversion) ──
  const rawRev = Number(revenue)
  if (revenue === '' || revenue === null || revenue === undefined) {
    // Allow — treat as 0
  } else if (!Number.isFinite(rawRev)) {
    errors.push('Pendapatan tidak valid')
  } else if (rawRev < 0) {
    errors.push('Pendapatan tidak boleh negatif')
  } else if (rawRev > MAX_MONETARY) {
    errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  }

  const rev = Number.isFinite(rawRev) ? rawRev : 0

  // ── Validation: Tax Regime ──
  const regime = TAX_REGIMES[taxRegime]
  if (!regime) {
    errors.push('Regime pajak tidak valid')
  }

  // ── Validation: Custom Rate ──
  const rawCustom = Number(customRate)
  const rate = regime ? (taxRegime === 'custom' ? rawCustom : regime.rate) : 0
  if (taxRegime === 'custom' && (!Number.isFinite(rawCustom) || rawCustom <= 0 || rawCustom >= 1)) {
    errors.push('Tarif pajak custom harus antara 0% dan 100%')
  }
  if (regime && taxRegime !== 'custom' && (rate <= 0 || rate >= 1)) {
    errors.push('Tarif pajak tidak valid')
  }

  // ── Validation: Revenue Cap ──
  if (regime?.revenueCap && rev > regime.revenueCap) {
    warnings.push(`Omset melebihi batas ${regime.label} (Rp ${regime.revenueCap.toLocaleString('id-ID')}). Periksa kelayakan regime ini.`)
  }

  // ── Validation: NPWP ──
  if (regime?.npwpRequired && !hasNPWP) {
    warnings.push('Regime ini memerlukan NPWP. Tanpa NPWP, tarif pajak bisa berbeda.')
  }

  // ── Validation: Tax Already Paid ──
  const rawPaid = Number(taxAlreadyPaid)
  const paid = Number.isFinite(rawPaid) ? rawPaid : 0
  if (taxAlreadyPaid !== '' && taxAlreadyPaid !== null && taxAlreadyPaid !== undefined && !Number.isFinite(rawPaid)) {
    errors.push('Pajak yang sudah dibayar tidak valid')
  } else if (paid < 0) {
    errors.push('Pajak yang sudah dibayar tidak boleh negatif')
  } else if (paid > MAX_MONETARY) {
    errors.push('Nilai pajak sudah terlalu besar')
  }

  // ── Validation: Credits ──
  const rawCredits = Number(taxCredits)
  const credits = Number.isFinite(rawCredits) ? rawCredits : 0
  if (taxCredits !== '' && taxCredits !== null && taxCredits !== undefined && !Number.isFinite(rawCredits)) {
    errors.push('Kredit pajak tidak valid')
  } else if (credits < 0) {
    errors.push('Kredit pajak tidak boleh negatif')
  } else if (credits > MAX_MONETARY) {
    errors.push('Nilai kredit pajak terlalu besar')
  }

  // ── Validate Expenses ──
  let totalExpenses = 0
  for (const exp of expenses) {
    const amt = toNumber(exp.amount)
    if (!Number.isFinite(amt) || amt < 0) {
      errors.push(`Biaya "${exp.category || 'tanpa nama'}" tidak valid`)
    }
    if (amt > MAX_MONETARY) {
      errors.push(`Biaya "${exp.category || 'tanpa nama'}" terlalu besar`)
    }
    if (amt > 0) {
      const normalized = exp.period === 'monthly' ? amt * 12 : amt
      totalExpenses += normalized
    }
  }

  // ── Validate Monthly Revenue ──
  if (monthlyRevenue.length > 0) {
    for (const mr of monthlyRevenue) {
      const amt = toNumber(mr.amount)
      if (!Number.isFinite(amt) || amt < 0) {
        errors.push(`Pendapatan bulan "${mr.month || 'tanpa nama'}" tidak valid`)
      }
      if (amt > MAX_MONETARY) {
        errors.push(`Pendapatan bulan "${mr.month || 'tanpa nama'}" terlalu besar`)
      }
    }
  }

  // ── Early return on errors ──
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings: [],
      revenue: 0,
      totalExpenses: 0,
      deductibleExpenses: 0,
      taxableBase: 0,
      estimatedTax: 0,
      taxAlreadyPaid: 0,
      taxCredits: 0,
      remainingTax: 0,
      effectiveTaxRate: 0,
      postTaxProfit: 0,
      monthlyTaxReserve: 0,
      annualTaxReserve: 0,
      scenarios: [],
      monthlyBreakdown: [],
      taxRegime: taxRegime || DEFAULT_REGIME,
    }
  }

  // ── Normalize Revenue ──
  const annualRevenue = revenueMode === 'monthly' ? rev * 12 : rev

  // ── Deductible Expenses ──
  // For final tax regimes, expenses don't reduce taxable base
  const deductibleExpenses = regime?.usesExpenses ? totalExpenses : 0

  if (!regime?.usesExpenses && totalExpenses > 0) {
    warnings.push('Regime pajak ini tidak memperhitungkan pengurang biaya. Pengeluaran tidak mengurangi dasar pengenaan pajak.')
  }

  // ── Taxable Base ──
  const taxableBase = Math.max(0, annualRevenue - deductibleExpenses)

  // ── Estimated Tax ──
  const estimatedTax = round2(taxableBase * rate)

  // ── Remaining Tax ──
  const totalPaidAndCredits = paid + credits
  const remainingTax = round2(Math.max(0, estimatedTax - totalPaidAndCredits))

  if (totalPaidAndCredits > estimatedTax && estimatedTax > 0) {
    warnings.push('Pajak yang sudah dibayar/kredit melebihi estimasi pajak. Sisa pajak = 0.')
  }

  // ── Effective Tax Rate ──
  const effectiveTaxRate = annualRevenue > 0
    ? round2((estimatedTax / annualRevenue) * 100)
    : 0

  // ── Post-Tax Profit ──
  const postTaxProfit = round2(annualRevenue - totalExpenses - estimatedTax)

  // ── Tax Reserve ──
  // eslint-disable-next-line no-unused-vars
  const annualTaxReserve = remainingTax
  const monthlyTaxReserve = round2(annualTaxReserve / 12)

  // ── Monthly Breakdown ──
  let monthlyBreakdown = []
  if (monthlyRevenue.length > 0) {
    let cumulativeReserve = 0
    const monthlyExpenseTotal = totalExpenses / 12

    for (const mr of monthlyRevenue) {
      const monthRev = toNumber(mr.amount)
      const monthTaxableBase = regime?.usesExpenses
        ? Math.max(0, monthRev - monthlyExpenseTotal)
        : monthRev
      const monthTax = round2(monthTaxableBase * rate)
      cumulativeReserve += monthTax

      monthlyBreakdown.push({
        month: mr.month,
        revenue: round2(monthRev),
        expenses: round2(monthlyExpenseTotal),
        taxableBase: round2(monthTaxableBase),
        estimatedTax: round2(monthTax),
        taxReserve: round2(monthTax),
        cumulativeTaxReserve: round2(cumulativeReserve),
      })
    }
  }

  // ── Scenarios ──
  const scenarios = generateScenarios({
    annualRevenue,
    deductibleExpenses,
    rate,
    paid,
    credits,
    totalExpenses,
    regime,
    hasNPWP,
    taxRegime,
  })

  return {
    isValid: true,
    errors: [],
    warnings,
    revenue: round2(annualRevenue),
    totalExpenses: round2(totalExpenses),
    deductibleExpenses: round2(deductibleExpenses),
    taxableBase: round2(taxableBase),
    estimatedTax,
    taxAlreadyPaid: round2(paid),
    taxCredits: round2(credits),
    remainingTax,
    effectiveTaxRate,
    postTaxProfit,
    monthlyTaxReserve,
    annualTaxReserve,
    scenarios,
    monthlyBreakdown,
    taxRegime,
  }
}

// ─── Scenario Generation ──────────────────────────────────────

function generateScenarios({
  annualRevenue,
  deductibleExpenses,
  rate,
  paid,
  credits,
  totalExpenses,
  regime,
  hasNPWP: _hasNPWP,
  taxRegime,
}) {
  const scenarios = []

  // Scenario A: Current estimate
  scenarios.push(buildScenario('Estimasi Saat Ini', annualRevenue, deductibleExpenses, rate, paid, credits, totalExpenses))

  // Scenario B: Higher revenue (+20%)
  const higherRevenue = round2(annualRevenue * 1.2)
  scenarios.push(buildScenario('Pendapatan +20%', higherRevenue, deductibleExpenses, rate, paid, credits, totalExpenses))

  // Scenario C: Lower expenses (reduce by 15% where applicable)
  if (regime?.usesExpenses && deductibleExpenses > 0) {
    const lowerExpenses = round2(deductibleExpenses * 0.85)
    scenarios.push(buildScenario('Biaya -15%', annualRevenue, lowerExpenses, rate, paid, credits, totalExpenses))
  }

  // Scenario D: Alternative regime (pph_badan if currently umkm_final, or vice versa)
  if (taxRegime !== 'pph_badan' && regime?.id !== 'pph_badan') {
    const altRate = TAX_REGIMES.pph_badan.rate
    scenarios.push(buildScenario('PPh Badan (22%)', annualRevenue, deductibleExpenses, altRate, paid, credits, totalExpenses))
  } else if (taxRegime !== 'umkm_final' && regime?.id !== 'umkm_final') {
    const altRate = TAX_REGIMES.umkm_final.rate
    scenarios.push(buildScenario('Pajak Final UMKM (0.5%)', annualRevenue, 0, altRate, paid, credits, totalExpenses))
  }

  return scenarios
}

function buildScenario(name, revenue, expenses, rate, paid, credits, totalExpenses) {
  const taxableBase = Math.max(0, revenue - expenses)
  const estimatedTax = round2(taxableBase * rate)
  const remainingTax = round2(Math.max(0, estimatedTax - paid - credits))
  const effectiveTaxRate = revenue > 0 ? round2((estimatedTax / revenue) * 100) : 0
  const postTaxProfit = round2(revenue - totalExpenses - estimatedTax)

  return {
    name,
    revenue: round2(revenue),
    expenses: round2(expenses),
    taxableBase: round2(taxableBase),
    estimatedTax,
    remainingTax,
    effectiveTaxRate,
    postTaxProfit,
  }
}
