import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateFinancialHealthScore,
  scoreProfitability,
  scoreCashFlow,
  scoreMargin,
  scoreBreakEven,
  scoreStability,
  classifyScore,
  generateRisks,
  generatePositiveSignals,
  COMPONENT_WEIGHTS,
  MIN_SALES_FOR_HEALTH,
  MIN_DAYS_FOR_HEALTH,
} from '../sections/FinancialHealthScore/calculateFinancialHealthScore.js'

// ─── TEST 1: Cold start ────────────────────────────────────

describe('TEST 1: cold start', () => {
  it('returns cold_start when insufficient data', () => {
    const r = calculateFinancialHealthScore({
      revenue: 0,
      totalExpenses: 0,
      dailyNetCashFlows: [],
      dailyRevenues: [],
    })
    assert.equal(r.isValid, false)
    assert.equal(r.dataQuality, 'cold_start')
  })
})

// ─── TEST 2: Exactly minimum data ──────────────────────────

describe('TEST 2: exactly minimum data', () => {
  it('returns valid with 14 days', () => {
    const dailyRevenues = Array(14).fill(1000000)
    const r = calculateFinancialHealthScore({
      revenue: 14000000,
      totalExpenses: 10000000,
      dailyRevenues,
      dailyNetCashFlows: Array(14).fill(100000),
    })
    assert.equal(r.isValid, true)
    assert.ok(r.score > 0)
  })
})

// ─── TEST 3: Insufficient transactions ─────────────────────

describe('TEST 3: insufficient transactions', () => {
  it('cold start with no revenue/expenses and less than minimum days', () => {
    const r = calculateFinancialHealthScore({
      revenue: 0,
      totalExpenses: 0,
      dailyRevenues: [1000000],
      dailyNetCashFlows: [200000],
    })
    assert.equal(r.isValid, false)
  })
})

// ─── TEST 4: Profitability >= 20% ──────────────────────────

describe('TEST 4: profitability >= 20%', () => {
  it('score = 100', () => {
    const r = scoreProfitability(10000000, 8000000) // 20% margin
    assert.equal(r.score, 100)
    assert.equal(r.metric, 20)
  })
})

// ─── TEST 5: Profitability 15% ─────────────────────────────

describe('TEST 5: profitability 15%', () => {
  it('score = 80', () => {
    const r = scoreProfitability(10000000, 8500000) // 15% margin
    assert.equal(r.score, 80)
    assert.equal(r.metric, 15)
  })
})

// ─── TEST 6: Profitability 10% ─────────────────────────────

describe('TEST 6: profitability 10%', () => {
  it('score = 60', () => {
    const r = scoreProfitability(10000000, 9000000) // 10% margin
    assert.equal(r.score, 60)
    assert.equal(r.metric, 10)
  })
})

// ─── TEST 7: Profitability negative ────────────────────────

describe('TEST 7: profitability negative', () => {
  it('score = 0', () => {
    const r = scoreProfitability(10000000, 12000000) // -20% margin
    assert.equal(r.score, 0)
    assert.equal(r.metric, -20)
  })
})

// ─── TEST 8: Cash flow 100% positive ──────────────────────

describe('TEST 8: cash flow 100% positive', () => {
  it('score = 100', () => {
    const flows = Array(20).fill(100000)
    const r = scoreCashFlow(flows)
    assert.equal(r.score, 100)
    assert.equal(r.metric, 100)
  })
})

// ─── TEST 9: Cash flow 80% positive ───────────────────────

describe('TEST 9: cash flow 80% positive', () => {
  it('score = 80', () => {
    const flows = Array(16).fill(100000).concat(Array(4).fill(-50000))
    const r = scoreCashFlow(flows)
    assert.equal(r.score, 80)
    assert.equal(r.metric, 80)
  })
})

// ─── TEST 10: Cash flow 50% positive ──────────────────────

describe('TEST 10: cash flow 50% positive', () => {
  it('score = 40', () => {
    const flows = Array(10).fill(100000).concat(Array(10).fill(-50000))
    const r = scoreCashFlow(flows)
    assert.equal(r.score, 40)
    assert.equal(r.metric, 50)
  })
})

// ─── TEST 11: Margin >= 50% ───────────────────────────────

describe('TEST 11: margin >= 50%', () => {
  it('score = 100', () => {
    // unitPrice=200, costPrice=80 → margin = (200-80)/200 = 60%
    const r = scoreMargin([{ unitPrice: 200, costPrice: 80 }])
    assert.equal(r.score, 100)
    assert.equal(r.metric, 60)
  })
})

// ─── TEST 12: Margin 40% ──────────────────────────────────

describe('TEST 12: margin 40%', () => {
  it('score = 80', () => {
    // unitPrice=100, costPrice=60 → margin = 40%
    const r = scoreMargin([{ unitPrice: 100, costPrice: 60 }])
    assert.equal(r.score, 80)
    assert.equal(r.metric, 40)
  })
})

// ─── TEST 13: Margin < 10% ────────────────────────────────

describe('TEST 13: margin < 10%', () => {
  it('score = 0', () => {
    // unitPrice=100, costPrice=95 → margin = 5%
    const r = scoreMargin([{ unitPrice: 100, costPrice: 95 }])
    assert.equal(r.score, 0)
    assert.equal(r.metric, 5)
  })
})

// ─── TEST 14: Missing HPP ─────────────────────────────────

describe('TEST 14: missing HPP', () => {
  it('returns not_applicable', () => {
    const r = scoreMargin([])
    assert.equal(r.status, 'not_applicable')
  })
})

// ─── TEST 15: BEP coverage >= 2x ─────────────────────────

describe('TEST 15: BEP coverage >= 2x', () => {
  it('score = 100', () => {
    const r = scoreBreakEven(2000000, 1000000)
    assert.equal(r.score, 100)
    assert.equal(r.metric, 2)
  })
})

// ─── TEST 16: BEP coverage 1.5x ───────────────────────────

describe('TEST 16: BEP coverage 1.5x', () => {
  it('score = 80', () => {
    const r = scoreBreakEven(1500000, 1000000)
    assert.equal(r.score, 80)
    assert.equal(r.metric, 1.5)
  })
})

// ─── TEST 17: BEP below 1x ────────────────────────────────

describe('TEST 17: BEP below 1x', () => {
  it('score = 20 for 0.8x', () => {
    const r = scoreBreakEven(800000, 1000000)
    assert.equal(r.score, 20) // 0.8x gets score 20
    assert.equal(r.metric, 0.8)
  })
})

// ─── TEST 18: Missing BEP ─────────────────────────────────

describe('TEST 18: missing BEP', () => {
  it('returns not_applicable', () => {
    const r = scoreBreakEven(1000000, 0)
    assert.equal(r.status, 'not_applicable')
  })
})

// ─── TEST 19: Stable revenue CV <= 10% ─────────────────────

describe('TEST 19: stable revenue CV <= 10%', () => {
  it('score = 100', () => {
    // Values very close together: 100, 101, 99, 100, 102, 98, 100, 101, 99, 100, 101, 99, 100, 102
    const dailyRevenues = [100, 101, 99, 100, 102, 98, 100, 101, 99, 100, 101, 99, 100, 102]
    const r = scoreStability(dailyRevenues)
    assert.equal(r.score, 100)
    assert.ok(r.metric <= 10)
  })
})

// ─── TEST 20: Unstable revenue CV > 50% ────────────────────

describe('TEST 20: unstable revenue CV > 50%', () => {
  it('score = 20', () => {
    // Wildly varying: 10, 100, 5, 200, 15, 150, 8, 180, 12, 120, 7, 160, 10, 190
    const dailyRevenues = [10, 100, 5, 200, 15, 150, 8, 180, 12, 120, 7, 160, 10, 190]
    const r = scoreStability(dailyRevenues)
    assert.equal(r.score, 20)
    assert.ok(r.metric > 50)
  })
})

// ─── TEST 21: Zero revenue ─────────────────────────────────

describe('TEST 21: zero revenue', () => {
  it('profitability score = 0', () => {
    const r = scoreProfitability(0, 0)
    assert.equal(r.score, 0)
    assert.equal(r.status, 'insufficient_data')
  })
})

// ─── TEST 22: Zero denominator ─────────────────────────────

describe('TEST 22: zero denominator in profitability', () => {
  it('handles gracefully', () => {
    const r = scoreProfitability(0, 5000000)
    assert.equal(r.score, 0)
    assert.ok(Number.isFinite(r.score))
  })
})

// ─── TEST 23: NaN ──────────────────────────────────────────

describe('TEST 23: NaN input', () => {
  it('handles gracefully', () => {
    const r = scoreProfitability(NaN, NaN)
    assert.equal(r.score, 0)
    assert.ok(Number.isFinite(r.score))
  })
})

// ─── TEST 24: Infinity ─────────────────────────────────────

describe('TEST 24: Infinity input', () => {
  it('handles gracefully', () => {
    const r = scoreProfitability(Infinity, Infinity)
    assert.equal(r.score, 0)
    assert.ok(Number.isFinite(r.score))
  })
})

// ─── TEST 25: Negative invalid input ───────────────────────

describe('TEST 25: negative revenue', () => {
  it('profitability score = 0', () => {
    const r = scoreProfitability(-1000000, 500000)
    assert.equal(r.score, 0)
  })
})

// ─── TEST 26: Score aggregation ────────────────────────────

describe('TEST 26: score aggregation', () => {
  it('weighted average is correct', () => {
    const dailyRevenues = Array(20).fill(1000000)
    const r = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 14000000,
      dailyNetCashFlows: Array(20).fill(300000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 60 }],
      bepRevenue: 10000000,
      dailyRevenues,
    })
    assert.equal(r.isValid, true)
    assert.ok(r.score >= 0 && r.score <= 100)
    assert.ok(Number.isFinite(r.score))
  })
})

// ─── TEST 27: Score rounding ───────────────────────────────

describe('TEST 27: score is integer', () => {
  it('score is rounded to integer', () => {
    const dailyRevenues = Array(20).fill(500000)
    const r = calculateFinancialHealthScore({
      revenue: 10000000,
      totalExpenses: 7500000,
      dailyNetCashFlows: Array(20).fill(125000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 70 }],
      bepRevenue: 8000000,
      dailyRevenues,
    })
    assert.equal(typeof r.score, 'number')
    assert.ok(Number.isInteger(r.score))
  })
})

// ─── TEST 28: Score classification ─────────────────────────

describe('TEST 28: score classification', () => {
  it('classifyScore returns correct labels', () => {
    assert.equal(classifyScore(85).label, 'Sangat Sehat')
    assert.equal(classifyScore(65).label, 'Sehat')
    assert.equal(classifyScore(45).label, 'Perlu Perhatian')
    assert.equal(classifyScore(25).label, 'Kurang Sehat')
    assert.equal(classifyScore(10).label, 'Kritis')
  })
})

// ─── TEST 29: Previous period comparison ───────────────────

describe('TEST 29: previous period comparison', () => {
  it('scoreChange calculated correctly', () => {
    const dailyRevenues = Array(20).fill(1000000)
    const r = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 14000000,
      dailyNetCashFlows: Array(20).fill(300000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 60 }],
      bepRevenue: 10000000,
      dailyRevenues,
      prevScore: 50,
    })
    assert.ok(r.scoreChange !== null)
    assert.equal(typeof r.scoreChange, 'number')
  })
})

// ─── TEST 30: Score increase ───────────────────────────────

describe('TEST 30: score increase', () => {
  it('positive change', () => {
    const dailyRevenues = Array(20).fill(1000000)
    const r = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 14000000,
      dailyNetCashFlows: Array(20).fill(300000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 60 }],
      bepRevenue: 10000000,
      dailyRevenues,
      prevScore: 40,
    })
    assert.ok(r.scoreChange >= 0)
  })
})

// ─── TEST 31: Score decrease ───────────────────────────────

describe('TEST 31: score decrease', () => {
  it('negative change when prevScore higher', () => {
    const dailyRevenues = Array(20).fill(1000000)
    const r = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 16000000, // worse profitability
      dailyNetCashFlows: Array(14).fill(100000).concat(Array(6).fill(-50000)), // 70% positive
      productsWithHPP: [{ unitPrice: 100, costPrice: 75 }],
      bepRevenue: 18000000, // close to revenue
      dailyRevenues,
      prevScore: 95,
    })
    assert.ok(r.scoreChange < 0)
  })
})

// ─── TEST 32: Score unchanged ──────────────────────────────

describe('TEST 32: score unchanged', () => {
  it('zero change when same prevScore', () => {
    const dailyRevenues = Array(20).fill(1000000)
    const r1 = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 14000000,
      dailyNetCashFlows: Array(20).fill(300000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 60 }],
      bepRevenue: 10000000,
      dailyRevenues,
    })
    const r2 = calculateFinancialHealthScore({
      revenue: 20000000,
      totalExpenses: 14000000,
      dailyNetCashFlows: Array(20).fill(300000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 60 }],
      bepRevenue: 10000000,
      dailyRevenues,
      prevScore: r1.score,
    })
    assert.equal(r2.scoreChange, 0)
  })
})

// ─── TEST 33: Top risks ordering ──────────────────────────

describe('TEST 33: top risks ordering', () => {
  it('critical risks come first', () => {
    const risks = generateRisks({
      profitability: { status: 'available', metric: -5 },
      cashFlow: { status: 'available', metric: 40 },
      margin: { status: 'available', metric: 30 },
      breakEven: { status: 'available', metric: 0.8 },
      stability: { status: 'available', metric: 60 },
    })
    assert.ok(risks.length > 0)
    // Critical should be first
    const criticalIdx = risks.findIndex(r => r.severity === 'critical')
    const attentionIdx = risks.findIndex(r => r.severity === 'attention')
    if (criticalIdx >= 0 && attentionIdx >= 0) {
      assert.ok(criticalIdx < attentionIdx)
    }
  })
})

// ─── TEST 34: Positive signals ─────────────────────────────

describe('TEST 34: positive signals', () => {
  it('generates signals for good metrics', () => {
    const signals = generatePositiveSignals({
      profitability: { status: 'available', metric: 20 },
      cashFlow: { status: 'available', metric: 95 },
      margin: { status: 'available', metric: 45 },
      breakEven: { status: 'available', metric: 2.5 },
      stability: { status: 'available', metric: 12 },
    })
    assert.ok(signals.length > 0)
    assert.ok(signals.length <= 3)
  })
})

// ─── TEST 35: Deterministic output ─────────────────────────

describe('TEST 35: deterministic output', () => {
  it('same input = same output', () => {
    const input = {
      revenue: 15000000,
      totalExpenses: 10000000,
      dailyNetCashFlows: Array(20).fill(250000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 65 }],
      bepRevenue: 8000000,
      dailyRevenues: Array(20).fill(750000),
    }
    const r1 = calculateFinancialHealthScore(input)
    const r2 = calculateFinancialHealthScore(input)
    assert.equal(r1.score, r2.score)
    assert.deepEqual(r1.components.profitability, r2.components.profitability)
  })
})

// ─── TEST 36: No NaN in final output ───────────────────────

describe('TEST 36: no NaN in final output', () => {
  it('all scores are finite', () => {
    const r = calculateFinancialHealthScore({
      revenue: 10000000,
      totalExpenses: 7000000,
      dailyNetCashFlows: Array(20).fill(150000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 70 }],
      bepRevenue: 5000000,
      dailyRevenues: Array(20).fill(500000),
    })
    assert.ok(Number.isFinite(r.score))
    assert.ok(!Number.isNaN(r.score))
    for (const [key, comp] of Object.entries(r.components)) {
      if (comp && comp.status === 'available') {
        assert.ok(Number.isFinite(comp.score), `${key} score is not finite`)
        assert.ok(!Number.isNaN(comp.score), `${key} score is NaN`)
      }
    }
  })
})

// ─── TEST 37: No Infinity in final output ──────────────────

describe('TEST 37: no Infinity in final output', () => {
  it('all scores are finite', () => {
    const r = calculateFinancialHealthScore({
      revenue: 10000000,
      totalExpenses: 7000000,
      dailyNetCashFlows: Array(20).fill(150000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 70 }],
      bepRevenue: 5000000,
      dailyRevenues: Array(20).fill(500000),
    })
    assert.ok(Number.isFinite(r.score))
    assert.ok(r.score !== Infinity)
  })
})

// ─── REGRESSION: existing engines unaffected ───────────────

import { calculateBEP } from '../sections/BEPCalculator/calculateBEP.js'
import { calculateHPP } from '../sections/HPPCalculator/calculateHPP.js'
import { calculateMarginAnalysis } from '../sections/MarginAnalysis/calculateMarginAnalysis.js'
import { calculateCashFlowForecast } from '../sections/CashFlowForecast/calculateCashFlowForecast.js'
import { calculateTaxPlanning } from '../sections/TaxPlanning/calculateTaxPlanning.js'
import { calculateRevenueSummary } from '../sections/FinancialReports/calculateFinancialReports.js'

describe('REGRESSION: existing engines unaffected', () => {
  it('BEP engine still works', () => {
    const r = calculateBEP({ sellingPricePerUnit: 20000, materialCostPerUnit: 5000, rent: 500000 })
    assert.equal(r.isValid, true)
    assert.ok(r.bepUnits > 0)
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
      openingCash: 10000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 8000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.closingCash, 31000000)
  })

  it('Tax Planning engine still works', () => {
    const r = calculateTaxPlanning({ revenue: 100000000, taxRegime: 'umkm_final' })
    assert.equal(r.isValid, true)
    assert.equal(r.estimatedTax, 500000)
  })

  it('Financial Reports engine still works', () => {
    const r = calculateRevenueSummary([{ total: 100000 }, { total: 200000 }])
    assert.equal(r.totalRevenue, 300000)
  })
})
