import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateLoanSimulation, compareLoanMethods, LOAN_METHODS } from '../sections/LoanSimulation/calculateLoanSimulation.js'

// ─── A. FLAT METHOD ─────────────────────────────────────────

describe('FLAT: exact calculation', () => {
  it('12m, 12%, 12 months', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'flat',
    })
    assert.equal(r.isValid, true)
    // monthlyInterest = 12m * 12% / 12 = 120,000
    // principalPayment = 12m / 12 = 1,000,000
    // monthlyPayment = 1,120,000
    assert.equal(r.monthlyPayment, 1120000)
    assert.equal(r.totalInterest, 1440000)
    assert.equal(r.totalPayment, 13440000)
  })
})

describe('FLAT: constant payment', () => {
  it('every period payment same', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'flat',
    })
    const payments = r.amortizationSchedule.map(p => p.payment)
    assert.ok(payments.every(p => p === payments[0]))
  })
})

describe('FLAT: total interest', () => {
  it('principal * rate * years', () => {
    const r = calculateLoanSimulation({
      principal: 10000000,
      annualInterestRate: 10,
      tenorMonths: 24,
      method: 'flat',
    })
    // 10m * 10% * 2 = 2,000,000
    assert.equal(r.totalInterest, 2000000)
  })
})

// ─── B. EFFECTIVE METHOD ─────────────────────────────────────

describe('EFFECTIVE: exact month 1', () => {
  it('interest on full principal', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'effective',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.amortizationSchedule[0].interestPayment, 120000)
    assert.equal(r.amortizationSchedule[0].principalPayment, 1000000)
    assert.equal(r.amortizationSchedule[0].payment, 1120000)
  })
})

describe('EFFECTIVE: exact month 2', () => {
  it('interest on reduced balance', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'effective',
    })
    assert.equal(r.amortizationSchedule[1].interestPayment, 110000)
    assert.equal(r.amortizationSchedule[1].payment, 1110000)
  })
})

describe('EFFECTIVE: final month', () => {
  it('last payment smallest', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'effective',
    })
    const last = r.amortizationSchedule[11]
    assert.equal(last.interestPayment, 10000)
    assert.equal(last.payment, 1010000)
    assert.equal(last.closingBalance, 0)
  })
})

describe('EFFECTIVE: total interest', () => {
  it('sum of all interest payments', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'effective',
    })
    assert.equal(r.totalInterest, 780000)
    assert.equal(r.totalPayment, 12780000)
  })
})

describe('EFFECTIVE: declining payment', () => {
  it('first payment > last payment', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'effective',
    })
    assert.ok(r.firstPayment > r.lastPayment)
  })
})

// ─── C. ANNUITY METHOD ──────────────────────────────────────

describe('ANNUITY: standard calculation', () => {
  it('12m, 12%, 12 months', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
    })
    assert.equal(r.isValid, true)
    // payment ≈ 1,066,185
    assert.ok(Math.abs(r.monthlyPayment - 1066185) < 10)
    // totalInterest ≈ 794,220
    assert.ok(Math.abs(r.totalInterest - 794220) < 50)
  })
})

describe('ANNUITY: constant payment', () => {
  it('all periods same payment (except last rounding)', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
    })
    // First 11 payments should be very close
    const first11 = r.amortizationSchedule.slice(0, 11).map(p => p.payment)
    assert.ok(first11.every(p => Math.abs(p - first11[0]) < 2))
  })
})

describe('ANNUITY: principal reduction', () => {
  it('closing balance decreases each period', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
    })
    for (let i = 1; i < r.amortizationSchedule.length; i++) {
      assert.ok(r.amortizationSchedule[i].closingBalance < r.amortizationSchedule[i - 1].closingBalance)
    }
  })
})

describe('ANNUITY: zero interest', () => {
  it('0% rate → equal principal payments', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 0,
      tenorMonths: 12,
      method: 'annuity',
    })
    assert.equal(r.monthlyPayment, 1000000)
    assert.equal(r.totalInterest, 0)
    assert.equal(r.totalPayment, 12000000)
  })
})

// ─── D. FEES ────────────────────────────────────────────────

describe('FEES: admin', () => {
  it('added to total', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
      adminFee: 500000,
    })
    assert.equal(r.totalFees, 500000)
    assert.ok(r.totalPayment > r.totalInstallments)
  })
})

describe('FEES: provision', () => {
  it('calculated from principal', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
      provisionRate: 2, // 2%
    })
    assert.equal(r.totalFees, 240000) // 12m * 2%
  })
})

describe('FEES: combined', () => {
  it('admin + provision + other', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
      adminFee: 500000,
      provisionRate: 1,
      otherFee: 100000,
    })
    // provision = 12m * 1% = 120000
    // totalFees = 500000 + 120000 + 100000 = 720000
    assert.equal(r.totalFees, 720000)
  })
})

describe('FEES: effective total cost', () => {
  it('totalPayment - principal', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
      adminFee: 500000,
    })
    assert.equal(r.effectiveTotalCost, r.totalPayment - r.totalPrincipal)
  })
})

describe('FEES: zero fees', () => {
  it('totalFees = 0', () => {
    const r = calculateLoanSimulation({
      principal: 12000000,
      annualInterestRate: 12,
      tenorMonths: 12,
      method: 'annuity',
    })
    assert.equal(r.totalFees, 0)
  })
})

// ─── E. VALIDATION ──────────────────────────────────────────

describe('VALIDATION: zero principal', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 0, annualInterestRate: 12, tenorMonths: 12 })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.length > 0)
  })
})

describe('VALIDATION: negative principal', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: -1000000, annualInterestRate: 12, tenorMonths: 12 })
    assert.equal(r.isValid, false)
  })
})

describe('VALIDATION: overflow', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 99999999999999, annualInterestRate: 12, tenorMonths: 12 })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('terlalu besar')))
  })
})

describe('VALIDATION: negative rate', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 10000000, annualInterestRate: -5, tenorMonths: 12 })
    assert.equal(r.isValid, false)
  })
})

describe('VALIDATION: rate > 100%', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 10000000, annualInterestRate: 150, tenorMonths: 12 })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('100%')))
  })
})

describe('VALIDATION: zero tenor', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 10000000, annualInterestRate: 12, tenorMonths: 0 })
    assert.equal(r.isValid, false)
  })
})

describe('VALIDATION: decimal tenor', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: 10000000, annualInterestRate: 12, tenorMonths: 12.5 })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('bulat')))
  })
})

describe('VALIDATION: negative fee', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({
      principal: 10000000, annualInterestRate: 12, tenorMonths: 12,
      adminFee: -100000,
    })
    assert.equal(r.isValid, false)
  })
})

describe('VALIDATION: NaN', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: NaN, annualInterestRate: 12, tenorMonths: 12 })
    assert.equal(r.isValid, false)
  })
})

describe('VALIDATION: Infinity', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({ principal: Infinity, annualInterestRate: 12, tenorMonths: 12 })
    assert.equal(r.isValid, false)
  })
})

// ─── F. SCHEDULE ─────────────────────────────────────────────

describe('SCHEDULE: correct periods', () => {
  it('tenor months matches schedule length', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'annuity',
    })
    assert.equal(r.amortizationSchedule.length, 12)
  })
})

describe('SCHEDULE: opening balance chain', () => {
  it('each opening = previous closing', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 6, method: 'effective',
    })
    for (let i = 1; i < r.amortizationSchedule.length; i++) {
      assert.equal(
        r.amortizationSchedule[i].openingBalance,
        r.amortizationSchedule[i - 1].closingBalance
      )
    }
  })
})

describe('SCHEDULE: final balance zero', () => {
  it('last closingBalance = 0', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'annuity',
    })
    assert.equal(r.amortizationSchedule[11].closingBalance, 0)
  })
})

describe('SCHEDULE: no negative balance', () => {
  it('all balances >= 0', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'annuity',
    })
    for (const row of r.amortizationSchedule) {
      assert.ok(row.closingBalance >= 0)
      assert.ok(row.openingBalance >= 0)
    }
  })
})

describe('SCHEDULE: all values finite', () => {
  it('no NaN or Infinity', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'annuity',
    })
    for (const row of r.amortizationSchedule) {
      assert.ok(Number.isFinite(row.openingBalance))
      assert.ok(Number.isFinite(row.payment))
      assert.ok(Number.isFinite(row.principalPayment))
      assert.ok(Number.isFinite(row.interestPayment))
      assert.ok(Number.isFinite(row.closingBalance))
    }
  })
})

// ─── G. COMPARISON ──────────────────────────────────────────

describe('COMPARISON: three methods', () => {
  it('returns 3 results', () => {
    const result = compareLoanMethods({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12,
    })
    assert.equal(result.length, 3)
    assert.equal(result[0].method, 'flat')
    assert.equal(result[1].method, 'effective')
    assert.equal(result[2].method, 'annuity')
  })
})

describe('COMPARISON: different interest totals', () => {
  it('flat > effective typically', () => {
    const result = compareLoanMethods({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12,
    })
    // Flat should have more total interest than effective
    assert.ok(result[0].totalInterest >= result[1].totalInterest)
  })
})

describe('COMPARISON: same principal', () => {
  it('all use same principal', () => {
    const result = compareLoanMethods({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12,
    })
    // All should be valid
    assert.ok(result.every(r => r.isValid))
  })
})

// ─── EDGE CASES ─────────────────────────────────────────────

describe('EDGE: 0% interest', () => {
  it('all methods give same result', () => {
    const flat = calculateLoanSimulation({ principal: 12000000, annualInterestRate: 0, tenorMonths: 12, method: 'flat' })
    const eff = calculateLoanSimulation({ principal: 12000000, annualInterestRate: 0, tenorMonths: 12, method: 'effective' })
    const ann = calculateLoanSimulation({ principal: 12000000, annualInterestRate: 0, tenorMonths: 12, method: 'annuity' })
    assert.equal(flat.monthlyPayment, 1000000)
    assert.equal(eff.monthlyPayment, 1000000)
    assert.equal(ann.monthlyPayment, 1000000)
    assert.equal(flat.totalInterest, 0)
  })
})

describe('EDGE: 1 month tenor', () => {
  it('single payment', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 1, method: 'annuity',
    })
    assert.equal(r.amortizationSchedule.length, 1)
    assert.equal(r.amortizationSchedule[0].closingBalance, 0)
  })
})

describe('EDGE: 5 year tenor', () => {
  it('60 months', () => {
    const r = calculateLoanSimulation({
      principal: 50000000, annualInterestRate: 10, tenorMonths: 60, method: 'annuity',
    })
    assert.equal(r.amortizationSchedule.length, 60)
    assert.equal(r.amortizationSchedule[59].closingBalance, 0)
  })
})

describe('EDGE: max valid principal', () => {
  it('9999999999999.99 accepted', () => {
    const r = calculateLoanSimulation({
      principal: 9999999999999.99, annualInterestRate: 12, tenorMonths: 12, method: 'flat',
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.totalPayment))
  })
})

describe('EDGE: empty input', () => {
  it('rejected', () => {
    const r = calculateLoanSimulation({})
    assert.equal(r.isValid, false)
  })
})

describe('EDGE: interest 100%', () => {
  it('accepted at boundary', () => {
    const r = calculateLoanSimulation({
      principal: 10000000, annualInterestRate: 100, tenorMonths: 12, method: 'flat',
    })
    assert.equal(r.isValid, true)
    assert.ok(r.totalInterest > 0)
  })
})

// ─── ROUNDING ────────────────────────────────────────────────

describe('ROUNDING: final balance exact zero', () => {
  it('annuity last period closing = 0', () => {
    const r = calculateLoanSimulation({
      principal: 10000000, annualInterestRate: 7.5, tenorMonths: 24, method: 'annuity',
    })
    assert.equal(r.amortizationSchedule[23].closingBalance, 0)
  })
})

describe('ROUNDING: effective final balance zero', () => {
  it('no negative residual', () => {
    const r = calculateLoanSimulation({
      principal: 10000000, annualInterestRate: 15, tenorMonths: 36, method: 'effective',
    })
    assert.equal(r.amortizationSchedule[35].closingBalance, 0)
  })
})

// ─── NO NaN/Infinity ────────────────────────────────────────

describe('SAFETY: no NaN in any output', () => {
  it('all outputs finite', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'annuity',
      adminFee: 500000, provisionRate: 2, otherFee: 100000,
    })
    assert.ok(Number.isFinite(r.monthlyPayment))
    assert.ok(Number.isFinite(r.totalInterest))
    assert.ok(Number.isFinite(r.totalFees))
    assert.ok(Number.isFinite(r.totalPayment))
    assert.ok(Number.isFinite(r.effectiveTotalCost))
    assert.ok(!Number.isNaN(r.monthlyPayment))
  })
})

describe('SAFETY: no Infinity in any output', () => {
  it('all outputs finite', () => {
    const r = calculateLoanSimulation({
      principal: 12000000, annualInterestRate: 12, tenorMonths: 12, method: 'effective',
    })
    assert.ok(r.totalPayment !== Infinity)
    assert.ok(r.effectiveTotalCost !== Infinity)
  })
})

// ─── REGRESSION ─────────────────────────────────────────────

import { calculateBEP } from '../sections/BEPCalculator/calculateBEP.js'
import { calculateHPP } from '../sections/HPPCalculator/calculateHPP.js'
import { calculateCashFlowForecast } from '../sections/CashFlowForecast/calculateCashFlowForecast.js'
import { calculateTaxPlanning } from '../sections/TaxPlanning/calculateTaxPlanning.js'
import { calculateFinancialHealthScore } from '../sections/FinancialHealthScore/calculateFinancialHealthScore.js'
import { calculateTransactionAnomalies } from '../sections/AnomalyDetection/calculateTransactionAnomalies.js'

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

  it('Cash Flow engine still works', () => {
    const r = calculateCashFlowForecast({
      openingCash: 10000000, forecastPeriod: '3_months',
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

  it('Financial Health Score engine still works', () => {
    const r = calculateFinancialHealthScore({
      revenue: 10000000, totalExpenses: 7000000,
      dailyNetCashFlows: Array(20).fill(150000),
      productsWithHPP: [{ unitPrice: 100, costPrice: 70 }],
      bepRevenue: 5000000, dailyRevenues: Array(20).fill(500000),
    })
    assert.equal(r.isValid, true)
    assert.ok(r.score > 0)
  })

  it('Anomaly Detection engine still works', () => {
    const { anomalies } = calculateTransactionAnomalies({
      salesTransactions: Array.from({ length: 15 }, (_, i) => ({
        id: `${i}`, total: 100, sale_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      })),
    })
    assert.ok(Array.isArray(anomalies))
  })
})
