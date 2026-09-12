import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateTaxPlanning, TAX_REGIMES, EXPENSE_CATEGORIES } from '../sections/TaxPlanning/calculateTaxPlanning.js'

// ─── TEST 1: Basic tax calculation (UMKM Final 0.5%) ────────

describe('TEST 1: basic tax calculation (umkm_final)', () => {
  it('revenue=100m, no expenses → tax = 500,000', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      revenueMode: 'annual',
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.revenue, 100_000_000)
    assert.equal(r.taxableBase, 100_000_000)
    assert.equal(r.estimatedTax, 500_000)
    assert.equal(r.effectiveTaxRate, 0.5)
  })
})

// ─── TEST 2: Zero revenue ───────────────────────────────────

describe('TEST 2: zero revenue', () => {
  it('valid with zero revenue', () => {
    const r = calculateTaxPlanning({
      revenue: 0,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 0)
    assert.equal(r.effectiveTaxRate, 0)
  })
})

// ─── TEST 3: Revenue with expenses (PPh Badan 22%) ──────────

describe('TEST 3: revenue with expenses (pph_badan)', () => {
  it('revenue=100m, expenses=60m → taxable=40m, tax=8.8m', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      revenueMode: 'annual',
      taxRegime: 'pph_badan',
      expenses: [
        { category: 'materials', amount: 30_000_000, period: 'annual' },
        { category: 'labor', amount: 20_000_000, period: 'annual' },
        { category: 'rent', amount: 10_000_000, period: 'annual' },
      ],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.revenue, 100_000_000)
    assert.equal(r.totalExpenses, 60_000_000)
    assert.equal(r.deductibleExpenses, 60_000_000)
    assert.equal(r.taxableBase, 40_000_000)
    assert.equal(r.estimatedTax, 8_800_000)
  })
})

// ─── TEST 4: Taxable base calculation ───────────────────────

describe('TEST 4: taxable base (pph_badan)', () => {
  it('taxable base = revenue - deductible expenses', () => {
    const r = calculateTaxPlanning({
      revenue: 200_000_000,
      taxRegime: 'pph_badan',
      expenses: [
        { category: 'materials', amount: 80_000_000, period: 'annual' },
        { category: 'other', amount: 20_000_000, period: 'annual' },
      ],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.taxableBase, 100_000_000)
  })
})

// ─── TEST 5: Tax already paid ────────────────────────────────

describe('TEST 5: tax already paid', () => {
  it('remaining = estimated - paid', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      taxAlreadyPaid: 200_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 500_000)
    assert.equal(r.taxAlreadyPaid, 200_000)
    assert.equal(r.remainingTax, 300_000)
  })
})

// ─── TEST 6: Remaining tax ──────────────────────────────────

describe('TEST 6: remaining tax', () => {
  it('remaining = max(estimated - paid - credits, 0)', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      taxAlreadyPaid: 100_000,
      taxCredits: 100_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 500_000)
    assert.equal(r.remainingTax, 300_000)
  })
})

// ─── TEST 7: Tax already paid > estimated tax ───────────────

describe('TEST 7: tax already paid > estimated tax', () => {
  it('remaining = 0, warning shown', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      taxAlreadyPaid: 600_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.remainingTax, 0)
    assert.ok(r.warnings.length > 0)
  })
})

// ─── TEST 8: Monthly tax reserve ────────────────────────────

describe('TEST 8: monthly tax reserve', () => {
  it('remaining=300k → monthly=25k', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      taxAlreadyPaid: 200_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.monthlyTaxReserve, 25_000)
  })
})

// ─── TEST 9: Annual tax reserve ─────────────────────────────

describe('TEST 9: annual tax reserve', () => {
  it('equals remaining tax', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      taxAlreadyPaid: 200_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.annualTaxReserve, 300_000)
  })
})

// ─── TEST 10: Effective tax rate ────────────────────────────

describe('TEST 10: effective tax rate', () => {
  it('effective = estimatedTax / revenue * 100', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveTaxRate, 0.5)
  })
})

// ─── TEST 11: Post-tax profit ───────────────────────────────

describe('TEST 11: post-tax profit (pph_badan)', () => {
  it('post-tax = revenue - totalExpenses - estimatedTax', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'pph_badan',
      expenses: [
        { category: 'materials', amount: 60_000_000, period: 'annual' },
      ],
    })
    assert.equal(r.isValid, true)
    // taxable=40m, tax=8.8m, totalExp=60m, postTax = 100m - 60m - 8.8m = 31.2m
    assert.equal(r.postTaxProfit, 31_200_000)
  })
})

// ─── TEST 12: Scenario generation ──────────────────────────

describe('TEST 12: scenario generation', () => {
  it('generates at least 2 scenarios', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.ok(r.scenarios.length >= 2)
    assert.equal(r.scenarios[0].name, 'Estimasi Saat Ini')
  })
})

// ─── TEST 13: Monthly breakdown ────────────────────────────

describe('TEST 13: monthly breakdown', () => {
  it('generates 12 months with correct cumulative', () => {
    const monthlyRevenue = Array.from({ length: 12 }, (_, i) => ({
      month: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][i],
      amount: 10_000_000,
    }))
    const r = calculateTaxPlanning({
      revenue: 120_000_000,
      revenueMode: 'annual',
      taxRegime: 'umkm_final',
      monthlyRevenue,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.monthlyBreakdown.length, 12)
    // Each month: revenue=10m, tax = 10m * 0.005 = 50,000
    assert.equal(r.monthlyBreakdown[0].estimatedTax, 50_000)
    assert.equal(r.monthlyBreakdown[0].cumulativeTaxReserve, 50_000)
    assert.equal(r.monthlyBreakdown[11].cumulativeTaxReserve, 600_000)
  })
})

// ─── TEST 14: Negative revenue ─────────────────────────────

describe('TEST 14: negative revenue', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: -10_000_000,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('negatif')))
  })
})

// ─── TEST 15: Negative expense ─────────────────────────────

describe('TEST 15: negative expense', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'pph_badan',
      expenses: [{ category: 'materials', amount: -5_000_000, period: 'annual' }],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('tidak valid')))
  })
})

// ─── TEST 16: NaN ──────────────────────────────────────────

describe('TEST 16: NaN input', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: NaN,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.length > 0)
  })
})

// ─── TEST 17: Infinity ─────────────────────────────────────

describe('TEST 17: Infinity input', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: Infinity,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.length > 0)
  })
})

// ─── TEST 18: Invalid tax rate ─────────────────────────────

describe('TEST 18: invalid custom tax rate (0)', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'custom',
      customRate: 0,
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.toLowerCase().includes('tarif')))
  })
})

// ─── TEST 19: Tax rate >= 100% ────────────────────────────

describe('TEST 19: custom tax rate >= 100%', () => {
  it('rejected', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'custom',
      customRate: 1.0,
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.toLowerCase().includes('tarif')))
  })
})

// ─── TEST 20: Extremely large values ───────────────────────

describe('TEST 20: extremely large values', () => {
  it('rejected safely', () => {
    const r = calculateTaxPlanning({
      revenue: 99_999_999_999_999,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('terlalu besar')))
  })
})

// ─── TEST 21: Decimal values ───────────────────────────────

describe('TEST 21: decimal values', () => {
  it('handles decimals correctly', () => {
    const r = calculateTaxPlanning({
      revenue: 15_500_500.50,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.estimatedTax))
    assert.ok(Number.isFinite(r.effectiveTaxRate))
  })
})

// ─── TEST 22: Empty optional fields ────────────────────────

describe('TEST 22: empty optional fields', () => {
  it('valid with minimal input', () => {
    const r = calculateTaxPlanning({
      revenue: 50_000_000,
      taxRegime: 'umkm_final',
      expenses: [],
      taxAlreadyPaid: 0,
      taxCredits: 0,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 250_000)
  })
})

// ─── TEST 23: No NaN in output ─────────────────────────────

describe('TEST 23: no NaN in output', () => {
  it('all outputs finite', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'pph_badan',
      expenses: [{ category: 'materials', amount: 40_000_000, period: 'annual' }],
      taxAlreadyPaid: 5_000_000,
    })
    assert.equal(r.isValid, true)
    const values = [
      r.revenue, r.totalExpenses, r.deductibleExpenses, r.taxableBase,
      r.estimatedTax, r.taxAlreadyPaid, r.remainingTax, r.effectiveTaxRate,
      r.postTaxProfit, r.monthlyTaxReserve, r.annualTaxReserve,
    ]
    for (const v of values) {
      assert.ok(Number.isFinite(v), `Expected finite but got ${v}`)
      assert.ok(!Number.isNaN(v), `Expected not NaN but got ${v}`)
    }
  })
})

// ─── TEST 24: No Infinity in output ────────────────────────

describe('TEST 24: no Infinity in output', () => {
  it('all outputs finite', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.estimatedTax))
    assert.ok(Number.isFinite(r.remainingTax))
    assert.ok(Number.isFinite(r.postTaxProfit))
  })
})

// ─── TEST 25: Revenue mode monthly ─────────────────────────

describe('TEST 25: revenue mode monthly', () => {
  it('monthly * 12 = annual', () => {
    const r = calculateTaxPlanning({
      revenue: 10_000_000,
      revenueMode: 'monthly',
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.revenue, 120_000_000)
    assert.equal(r.estimatedTax, 600_000)
  })
})

// ─── TEST 26: Monthly expenses normalized ──────────────────

describe('TEST 26: monthly expenses normalized to annual', () => {
  it('monthly 5m * 12 = 60m annual', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'pph_badan',
      expenses: [
        { category: 'rent', amount: 5_000_000, period: 'monthly' },
      ],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.totalExpenses, 60_000_000)
    assert.equal(r.taxableBase, 40_000_000)
  })
})

// ─── TEST 27: PPh Badan scenario comparison ────────────────

describe('TEST 27: pph_badan generates umkm_final alternative', () => {
  it('includes umkm_final scenario', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'pph_badan',
      expenses: [{ category: 'materials', amount: 60_000_000, period: 'annual' }],
    })
    assert.equal(r.isValid, true)
    const names = r.scenarios.map(s => s.name)
    assert.ok(names.some(n => n.includes('UMKM')))
  })
})

// ─── TEST 28: Final tax regime ignores expenses ────────────

describe('TEST 28: final tax regime ignores expenses', () => {
  it('taxable base = revenue, not revenue - expenses', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'umkm_final',
      expenses: [{ category: 'materials', amount: 50_000_000, period: 'annual' }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.taxableBase, 100_000_000)
    assert.equal(r.deductibleExpenses, 0)
    assert.ok(r.warnings.some(w => w.includes('tidak memperhitungkan')))
  })
})

// ─── TEST 29: Revenue cap warning ──────────────────────────

describe('TEST 29: revenue cap warning for umkm_final', () => {
  it('warns when revenue > 4.8b', () => {
    const r = calculateTaxPlanning({
      revenue: 5_000_000_000,
      taxRegime: 'umkm_final',
    })
    assert.equal(r.isValid, true)
    assert.ok(r.warnings.some(w => w.includes('melebihi batas')))
  })
})

// ─── TEST 30: Custom rate ──────────────────────────────────

describe('TEST 30: custom tax rate', () => {
  it('custom rate 15% applied', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      taxRegime: 'custom',
      customRate: 0.15,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 15_000_000)
    assert.equal(r.effectiveTaxRate, 15)
  })
})

// ─── REGRESSION: Existing engines unaffected ────────────────

import { calculateBEP } from '../sections/BEPCalculator/calculateBEP.js'
import { calculateHPP } from '../sections/HPPCalculator/calculateHPP.js'
import { calculateMarginAnalysis } from '../sections/MarginAnalysis/calculateMarginAnalysis.js'
import { calculateCashFlowForecast } from '../sections/CashFlowForecast/calculateCashFlowForecast.js'

describe('REGRESSION: existing engines unaffected', () => {
  it('BEP engine still works', () => {
    const r = calculateBEP({ sellingPricePerUnit: 20000, materialCostPerUnit: 5000, rent: 500000 })
    assert.equal(r.isValid, true)
    assert.ok(r.bepUnits > 0)
    assert.ok(Number.isFinite(r.bepUnits))
  })

  it('HPP engine still works', () => {
    const r = calculateHPP({
      materials: [{ name: 'Bahan A', quantity: 10, unit: 'kg', unitPrice: 5000 }],
      quantityProduced: 100,
    })
    assert.equal(r.isValid, true)
  })

  it('Margin engine still works', () => {
    const r = calculateMarginAnalysis({ costPerUnit: 10000, sellingPrice: 15000, quantity: 1, analysisMode: 'price' })
    assert.equal(r.isValid, true)
    assert.equal(r.profitPerUnit, 5000)
  })

  it('Cash Flow engine still works', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10_000_000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15_000_000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 8_000_000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.closingCash, 31_000_000)
  })
})

// ─── SPEC: Expected deterministic example ───────────────────

describe('SPEC: deterministic example (pph_badan)', () => {
  it('revenue=100m, expenses=60m, paid=5m', () => {
    const r = calculateTaxPlanning({
      revenue: 100_000_000,
      revenueMode: 'annual',
      taxRegime: 'pph_badan',
      expenses: [
        { category: 'materials', amount: 30_000_000, period: 'annual' },
        { category: 'labor', amount: 20_000_000, period: 'annual' },
        { category: 'rent', amount: 10_000_000, period: 'annual' },
      ],
      taxAlreadyPaid: 5_000_000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.revenue, 100_000_000)
    assert.equal(r.totalExpenses, 60_000_000)
    assert.equal(r.deductibleExpenses, 60_000_000)
    assert.equal(r.taxableBase, 40_000_000)
    assert.equal(r.estimatedTax, 8_800_000)
    assert.equal(r.taxAlreadyPaid, 5_000_000)
    assert.equal(r.remainingTax, 3_800_000)
    assert.equal(r.effectiveTaxRate, 8.8)
    assert.equal(r.postTaxProfit, 31_200_000)
    assert.equal(r.monthlyTaxReserve, Math.round(3_800_000 / 12 * 100) / 100)
  })
})
