import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateCashFlowForecast, FORECAST_PERIODS } from '../sections/CashFlowForecast/calculateCashFlowForecast.js'

// ─── TEST 1: Basic positive cash flow ─────────────────────────

describe('TEST 1: basic positive cash flow', () => {
  it('opening=10k, inflow=5k, outflow=3k → closing=12k', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 5000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya Operasional', amount: 3000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.openingCash, 10000)
    assert.equal(r.periods[0].closingBalance, 12000)
  })
})

// ─── TEST 2: Negative cash flow ──────────────────────────────

describe('TEST 2: negative cash flow', () => {
  it('opening=10k, inflow=2k, outflow=7k → closing=5k', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 2000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 7000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods[0].closingBalance, 5000)
  })
})

// ─── TEST 3: Multiple periods ────────────────────────────────

describe('TEST 3: multiple periods', () => {
  it('each period opening equals previous closing', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 5000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 3000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods.length, 3)
    for (let i = 1; i < r.periods.length; i++) {
      assert.equal(r.periods[i].openingBalance, r.periods[i - 1].closingBalance)
    }
  })
})

// ─── TEST 4: Weekly recurring inflow ──────────────────────────

describe('TEST 4: weekly recurring inflow', () => {
  it('appears every week in weekly forecast', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '4_weeks',
      inflows: [{ name: 'Penjualan', amount: 1000, frequency: 'weekly', startPeriod: 1 }],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    for (const p of r.periods) {
      assert.equal(p.totalInflows, 1000)
    }
  })
})

// ─── TEST 5: Monthly recurring outflow ────────────────────────

describe('TEST 5: monthly recurring outflow', () => {
  it('appears every month in monthly forecast', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [],
      outflows: [{ name: 'Sewa', amount: 500000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    for (const p of r.periods) {
      assert.equal(p.totalOutflows, 500000)
    }
  })
})

// ─── TEST 6: One-time inflow ─────────────────────────────────

describe('TEST 6: one-time inflow', () => {
  it('occurs exactly once at startPeriod', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Investasi', amount: 1000000, frequency: 'one_time', startPeriod: 2 }],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods[0].totalInflows, 0)
    assert.equal(r.periods[1].totalInflows, 1000000)
    assert.equal(r.periods[2].totalInflows, 0)
  })
})

// ─── TEST 7: One-time outflow ────────────────────────────────

describe('TEST 7: one-time outflow', () => {
  it('occurs exactly once at startPeriod', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [],
      outflows: [{ name: 'Pembelian Mesin', amount: 500000, frequency: 'one_time', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods[0].totalOutflows, 500000)
    assert.equal(r.periods[1].totalOutflows, 0)
    assert.equal(r.periods[2].totalOutflows, 0)
  })
})

// ─── TEST 8: Start period ────────────────────────────────────

describe('TEST 8: transactions do not occur before start period', () => {
  it('deferred start', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Piutang', amount: 5000, frequency: 'monthly', startPeriod: 3 }],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods[0].totalInflows, 0)
    assert.equal(r.periods[1].totalInflows, 0)
    assert.equal(r.periods[2].totalInflows, 5000)
  })
})

// ─── TEST 9: End period ──────────────────────────────────────

describe('TEST 9: transactions stop after end period', () => {
  it('ends at period 2', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Kontrak', amount: 10000, frequency: 'monthly', startPeriod: 1, endPeriod: 2 }],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods[0].totalInflows, 10000)
    assert.equal(r.periods[1].totalInflows, 10000)
    assert.equal(r.periods[2].totalInflows, 0)
  })
})

// ─── TEST 10: Zero opening cash ──────────────────────────────

describe('TEST 10: zero opening cash', () => {
  it('valid', () => {
    const r = calculateCashFlowForecast({
      openingCash: 0,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 5000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 3000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.openingCash, 0)
  })
})

// ─── TEST 11: Zero inflows and outflows ─────────────────────

describe('TEST 11: zero inflows and outflows', () => {
  it('closing equals opening', () => {
    const r = calculateCashFlowForecast({
      openingCash: 50000,
      forecastPeriod: '3_months',
      inflows: [],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.closingCash, 50000)
    for (const p of r.periods) {
      assert.equal(p.closingBalance, 50000)
    }
  })
})

// ─── TEST 12: Shortfall ──────────────────────────────────────

describe('TEST 12: shortfall detected', () => {
  it('negative closing → shortfallDetected = true', () => {
    const r = calculateCashFlowForecast({
      openingCash: 5000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 2000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 5000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.shortfallDetected, true)
  })
})

// ─── TEST 13: Shortfall amount ───────────────────────────────

describe('TEST 13: shortfall amount correct', () => {
  it('shortfall = absolute of most negative closing', () => {
    const r = calculateCashFlowForecast({
      openingCash: 5000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 2000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 5000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    // Month 1: 5m + 2m - 5m = 2m, Month 2: 2m + 2m - 5m = -1m, Month 3: -1m + 2m - 5m = -4m
    assert.equal(r.shortfallAmount, 4000000)
    assert.equal(r.minimumCashBalance, -4000000)
  })
})

// ─── TEST 14: Minimum cash balance ───────────────────────────

describe('TEST 14: minimum cash balance', () => {
  it('tracks lowest balance across all periods', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 8000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    // Month 1: 10m → 17m, Month 2: 17m → 24m, Month 3: 24m → 31m
    assert.equal(r.minimumCashBalance, 10000000)
  })
})

// ─── TEST 15: Maximum cash balance ───────────────────────────

describe('TEST 15: maximum cash balance', () => {
  it('tracks highest balance across all periods', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 8000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.maximumCashBalance, 31000000)
  })
})

// ─── TEST 16: NaN ────────────────────────────────────────────

describe('TEST 16: NaN input', () => {
  it('rejects gracefully', () => {
    const r = calculateCashFlowForecast({
      openingCash: NaN,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Test', amount: NaN, frequency: 'monthly', startPeriod: 1 }],
      outflows: [],
    })
    // NaN opening should produce error
    assert.equal(r.isValid, false)
    assert.ok(r.errors.length > 0)
  })
})

// ─── TEST 17: Infinity ───────────────────────────────────────

describe('TEST 17: Infinity input', () => {
  it('rejects gracefully', () => {
    const r = calculateCashFlowForecast({
      openingCash: Infinity,
      forecastPeriod: '3_months',
      inflows: [],
      outflows: [],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.length > 0)
  })
})

// ─── TEST 18: Negative transaction amount ────────────────────

describe('TEST 18: negative transaction amount', () => {
  it('rejected', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Test', amount: -5000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('tidak valid')))
  })
})

// ─── TEST 19: Invalid frequency ──────────────────────────────

describe('TEST 19: invalid frequency', () => {
  it('rejected', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Test', amount: 5000, frequency: 'daily', startPeriod: 1 }],
      outflows: [],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('tidak valid')))
  })
})

// ─── TEST 20: Invalid forecast period ────────────────────────

describe('TEST 20: invalid forecast period', () => {
  it('rejected', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000,
      forecastPeriod: 'invalid_period',
      inflows: [],
      outflows: [],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('tidak valid')))
  })
})

// ─── TEST 21: Extremely large monetary input ─────────────────

describe('TEST 21: extremely large monetary input', () => {
  it('rejected safely', () => {
    const r = calculateCashFlowForecast({
      openingCash: 99999999999999,
      forecastPeriod: '3_months',
      inflows: [],
      outflows: [],
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('terlalu besar')))
  })
})

// ─── TEST 22: No NaN/Infinity in output ──────────────────────

describe('TEST 22: no NaN or Infinity in output', () => {
  it('all numeric outputs are finite', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 8000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.totalInflows))
    assert.ok(Number.isFinite(r.totalOutflows))
    assert.ok(Number.isFinite(r.netCashFlow))
    assert.ok(Number.isFinite(r.openingCash))
    assert.ok(Number.isFinite(r.closingCash))
    assert.ok(Number.isFinite(r.minimumCashBalance))
    assert.ok(Number.isFinite(r.maximumCashBalance))
    assert.ok(Number.isFinite(r.shortfallAmount))
    for (const p of r.periods) {
      assert.ok(Number.isFinite(p.openingBalance))
      assert.ok(Number.isFinite(p.totalInflows))
      assert.ok(Number.isFinite(p.totalOutflows))
      assert.ok(Number.isFinite(p.netCashFlow))
      assert.ok(Number.isFinite(p.closingBalance))
    }
  })
})

// ─── TEST 23: Long numeric input (no silent clamp) ──────────

describe('TEST 23: long numeric input', () => {
  it('does not silently clamp valid large values', () => {
    const r = calculateCashFlowForecast({
      openingCash: 9999999999999.99,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Test', amount: 0.01, frequency: 'monthly', startPeriod: 1 }],
      outflows: [],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.openingCash, 9999999999999.99)
  })
})

// ─── REGRESSION: Existing tests must pass ────────────────────

import { calculateBEP } from '../sections/BEPCalculator/calculateBEP.js'
import { calculateHPP } from '../sections/HPPCalculator/calculateHPP.js'
import { calculateMarginAnalysis } from '../sections/MarginAnalysis/calculateMarginAnalysis.js'

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
})

// ─── EXACT EXPECTED EXAMPLE (from spec) ──────────────────────

describe('SPEC: exact expected example', () => {
  it('opening=10m, inflow=15m/mo, outflow=8m/mo, 3 months', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 15000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya Operasional', amount: 8000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)
    assert.equal(r.periods.length, 3)

    // Month 1
    assert.equal(r.periods[0].openingBalance, 10000000)
    assert.equal(r.periods[0].totalInflows, 15000000)
    assert.equal(r.periods[0].totalOutflows, 8000000)
    assert.equal(r.periods[0].netCashFlow, 7000000)
    assert.equal(r.periods[0].closingBalance, 17000000)

    // Month 2
    assert.equal(r.periods[1].openingBalance, 17000000)
    assert.equal(r.periods[1].totalInflows, 15000000)
    assert.equal(r.periods[1].totalOutflows, 8000000)
    assert.equal(r.periods[1].netCashFlow, 7000000)
    assert.equal(r.periods[1].closingBalance, 24000000)

    // Month 3
    assert.equal(r.periods[2].openingBalance, 24000000)
    assert.equal(r.periods[2].totalInflows, 15000000)
    assert.equal(r.periods[2].totalOutflows, 8000000)
    assert.equal(r.periods[2].netCashFlow, 7000000)
    assert.equal(r.periods[2].closingBalance, 31000000)

    // Totals
    assert.equal(r.totalInflows, 45000000)
    assert.equal(r.totalOutflows, 24000000)
    assert.equal(r.netCashFlow, 21000000)
    assert.equal(r.closingCash, 31000000)
    assert.equal(r.minimumCashBalance, 10000000)
    assert.equal(r.maximumCashBalance, 31000000)
    assert.equal(r.shortfallDetected, false)
  })
})

// ─── SHORTFALL SPEC ──────────────────────────────────────────

describe('SPEC: shortfall example', () => {
  it('opening=5m, inflow=2m/mo, outflow=5m/mo, 3 months', () => {
    const r = calculateCashFlowForecast({
      openingCash: 5000000,
      forecastPeriod: '3_months',
      inflows: [{ name: 'Penjualan', amount: 2000000, frequency: 'monthly', startPeriod: 1 }],
      outflows: [{ name: 'Biaya', amount: 5000000, frequency: 'monthly', startPeriod: 1 }],
    })
    assert.equal(r.isValid, true)

    // Month 1: 5m + 2m - 5m = 2m
    assert.equal(r.periods[0].closingBalance, 2000000)
    // Month 2: 2m + 2m - 5m = -1m
    assert.equal(r.periods[1].closingBalance, -1000000)
    // Month 3: -1m + 2m - 5m = -4m
    assert.equal(r.periods[2].closingBalance, -4000000)

    assert.equal(r.shortfallDetected, true)
    assert.equal(r.minimumCashBalance, -4000000)
    assert.equal(r.shortfallAmount, 4000000)
  })
})
