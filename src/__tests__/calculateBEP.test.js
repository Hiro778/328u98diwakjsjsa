import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateBEP } from '../sections/BEPCalculator/calculateBEP.js'

const BASE = {
  sellingPricePerUnit: 20000,
  materialCostPerUnit: 5000,
  packagingCostPerUnit: 1000,
  salesFeePerUnit: 1000,
  otherVariableCostPerUnit: 1000,
  rent: 500000,
  fixedLabor: 400000,
  utilities: 150000,
  software: 50000,
  otherFixedCosts: 100000,
}

// ─── TEST 1: Basic BEP ─────────────────────────────────────

describe('TEST 1: basic BEP', () => {
  it('BEP units = 100, BEP revenue = 2,000,000', () => {
    const r = calculateBEP({
      ...BASE,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.contributionMarginPerUnit, 12000)
    assert.equal(r.bepUnits, 100)
    assert.equal(r.bepRevenue, 2000000)
  })
})

// ─── TEST 2: Contribution margin ────────────────────────────

describe('TEST 2: contribution margin', () => {
  it('CM = 12000', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
    })
    assert.equal(r.contributionMarginPerUnit, 12000)
  })
})

// ─── TEST 3: Contribution margin ratio ──────────────────────

describe('TEST 3: contribution margin ratio', () => {
  it('CM ratio = 60%', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
    })
    assert.equal(r.contributionMarginRatio, 60)
  })
})

// ─── TEST 4: BEP revenue ───────────────────────────────────

describe('TEST 4: BEP revenue', () => {
  it('BEP revenue = 2,000,000', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
    })
    assert.equal(r.bepRevenue, 2000000)
  })
})

// ─── TEST 5: Target profit ─────────────────────────────────

describe('TEST 5: target profit 600k', () => {
  it('required units = 150, required revenue = 3,000,000', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
      targetProfit: 600000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.requiredUnitsForTargetProfit, 150)
    assert.equal(r.requiredRevenueForTargetProfit, 3000000)
  })
})

// ─── TEST 6: Margin of safety ──────────────────────────────

describe('TEST 6: margin of safety', () => {
  it('actual 150 units → MoS = 1,000,000', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
      actualUnits: 150,
    })
    assert.equal(r.marginOfSafety, 1000000)
  })
})

// ─── TEST 7: Margin of safety % ────────────────────────────

describe('TEST 7: margin of safety %', () => {
  it('MoS % = 33.33%', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
      actualUnits: 150,
    })
    assert.ok(Math.abs(r.marginOfSafetyPercent - 33.33) < 0.1)
  })
})

// ─── TEST 8: Zero optional costs ───────────────────────────

describe('TEST 8: zero optional costs', () => {
  it('valid with only selling price and fixed cost', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 10000,
      rent: 500000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.variableCostPerUnit, 0)
    assert.equal(r.contributionMarginPerUnit, 10000)
    assert.equal(r.bepUnits, 50)
    assert.equal(r.bepRevenue, 500000)
  })
})

// ─── TEST 9: Negative selling price ────────────────────────

describe('TEST 9: negative selling price', () => {
  it('validation error', () => {
    const r = calculateBEP({ sellingPricePerUnit: -10000 })
    assert.equal(r.isValid, false)
  })
})

// ─── TEST 10: Negative variable cost ───────────────────────

describe('TEST 10: negative variable cost', () => {
  it('validation error', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: -5000,
    })
    assert.equal(r.isValid, false)
  })
})

// ─── TEST 11: Negative fixed cost ──────────────────────────

describe('TEST 11: negative fixed cost', () => {
  it('validation error', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      rent: -100000,
    })
    assert.equal(r.isValid, false)
  })
})

// ─── TEST 12: Variable cost >= selling price ───────────────

describe('TEST 12: variable cost >= selling price', () => {
  it('validation error', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 10000,
      materialCostPerUnit: 8000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 500,
      otherVariableCostPerUnit: 500,
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('variabel')))
  })
})

// ─── TEST 13: NaN ──────────────────────────────────────────

describe('TEST 13: NaN input', () => {
  it('safe defaults, no NaN output', () => {
    const r = calculateBEP({
      sellingPricePerUnit: NaN,
      materialCostPerUnit: NaN,
    })
    assert.ok(!Number.isNaN(r.contributionMarginPerUnit))
    assert.ok(!Number.isNaN(r.bepUnits))
  })
})

// ─── TEST 14: Infinity ─────────────────────────────────────

describe('TEST 14: Infinity input', () => {
  it('validation error', () => {
    const r = calculateBEP({
      sellingPricePerUnit: Infinity,
    })
    assert.equal(r.isValid, false)
  })
})

// ─── TEST 15: Zero fixed cost ──────────────────────────────

describe('TEST 15: zero fixed cost', () => {
  it('BEP = 0 units (already profitable)', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.bepUnits, 0)
    assert.equal(r.bepRevenue, 0)
  })
})

// ─── TEST 16: Zero quantity (actualUnits) ──────────────────

describe('TEST 16: zero actual units', () => {
  it('margin of safety = 0', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
      actualUnits: 0,
    })
    assert.equal(r.marginOfSafety, 0)
    assert.equal(r.marginOfSafetyPercent, 0)
  })
})

// ─── TEST 17: Large values ─────────────────────────────────

describe('TEST 17: large values', () => {
  it('handles large numbers correctly', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 500000,
      materialCostPerUnit: 100000,
      rent: 50000000,
      fixedLabor: 30000000,
    })
    assert.equal(r.isValid, true)
    assert.ok(r.bepUnits > 0)
    assert.ok(Number.isFinite(r.bepUnits))
  })
})

// ─── TEST 18: Decimal values ───────────────────────────────

describe('TEST 18: decimal values', () => {
  it('handles decimals correctly', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 15500.50,
      materialCostPerUnit: 4200.75,
      rent: 1250000,
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.bepUnits))
    assert.ok(Number.isFinite(r.bepRevenue))
  })
})

// ─── TEST 19: Fee as part of variable cost ─────────────────

describe('TEST 19: sales fee included in variable cost', () => {
  it('fee adds to variable cost, reduces CM', () => {
    const withoutFee = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      rent: 1000000,
    })
    const withFee = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      salesFeePerUnit: 2000,
      rent: 1000000,
    })
    assert.ok(withFee.variableCostPerUnit > withoutFee.variableCostPerUnit)
    assert.ok(withFee.contributionMarginPerUnit < withoutFee.contributionMarginPerUnit)
    assert.ok(withFee.bepUnits > withoutFee.bepUnits)
  })
})

// ─── TEST 20: Exact expected values from spec ──────────────

describe('TEST 20: exact spec values', () => {
  it('selling=20k, variable=8k, fixed=1.2m → BEP=100 units, 2m revenue', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 20000,
      materialCostPerUnit: 5000,
      packagingCostPerUnit: 1000,
      salesFeePerUnit: 1000,
      otherVariableCostPerUnit: 1000,
      rent: 500000,
      fixedLabor: 400000,
      utilities: 150000,
      software: 50000,
      otherFixedCosts: 100000,
      actualUnits: 150,
      targetProfit: 600000,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.variableCostPerUnit, 8000)
    assert.equal(r.fixedCosts, 1200000)
    assert.equal(r.contributionMarginPerUnit, 12000)
    assert.equal(r.contributionMarginRatio, 60)
    assert.equal(r.bepUnits, 100)
    assert.equal(r.bepRevenue, 2000000)
    assert.equal(r.requiredUnitsForTargetProfit, 150)
    assert.equal(r.requiredRevenueForTargetProfit, 3000000)
    assert.equal(r.marginOfSafety, 1000000)
    assert.ok(Math.abs(r.marginOfSafetyPercent - 33.33) < 0.1)
  })
})

// ─── Numeric Boundary Tests ──────────────────────────────────

describe('TEST 21: max valid monetary (9999999999999.99)', () => {
  it('valid at boundary', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 9999999999999.99,
      materialCostPerUnit: 1,
      rent: 1,
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.bepUnits))
  })
})

describe('TEST 22: overflow (10000000000000)', () => {
  it('rejected as too large', () => {
    const r = calculateBEP({
      sellingPricePerUnit: 10000000000000,
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('terlalu besar')))
  })
})

describe('TEST 23: Infinity input', () => {
  it('validation error', () => {
    const r = calculateBEP({ sellingPricePerUnit: Infinity })
    assert.equal(r.isValid, false)
  })
})

describe('TEST 24: NaN input', () => {
  it('safe defaults, no NaN output', () => {
    const r = calculateBEP({ sellingPricePerUnit: NaN, materialCostPerUnit: NaN })
    assert.ok(!Number.isNaN(r.contributionMarginPerUnit))
    assert.ok(!Number.isNaN(r.bepUnits))
  })
})

describe('TEST 25: all fields at max boundary', () => {
  it('calculation remains finite', () => {
    const MAX = 9999999999999.99
    const r = calculateBEP({
      sellingPricePerUnit: MAX,
      materialCostPerUnit: 1,
      rent: MAX,
    })
    assert.equal(r.isValid, true)
    assert.ok(Number.isFinite(r.bepUnits))
    assert.ok(Number.isFinite(r.bepRevenue))
  })
})

// ─── sanitizeForInput Tests ──────────────────────────────────

import { sanitizeForInput, validateNumeric, parseNumericValue } from '../lib/numberInput.js'

describe('sanitizeForInput', () => {
  it('normal value unchanged', () => {
    assert.equal(sanitizeForInput('10000'), '10000')
  })

  it('decimal value preserved', () => {
    assert.equal(sanitizeForInput('10000.50'), '10000.50')
  })

  it('empty string returns empty', () => {
    assert.equal(sanitizeForInput(''), '')
  })

  it('does NOT clamp — preserves raw input', () => {
    assert.equal(sanitizeForInput('99999999999999'), '99999999999999')
  })

  it('strips scientific notation', () => {
    assert.equal(sanitizeForInput('1e20'), '')
  })

  it('strips non-numeric chars', () => {
    assert.equal(sanitizeForInput('Rp10.000'), '10.000')
  })

  it('prevents multiple decimals', () => {
    assert.equal(sanitizeForInput('10.50.25'), '10.5025')
  })

  it('strips minus sign for monetary', () => {
    assert.equal(sanitizeForInput('-5000'), '5000')
  })

  it('handles very long digit string without clamping', () => {
    const long = '9'.repeat(50)
    assert.equal(sanitizeForInput(long), long)
  })

  it('null/undefined returns empty', () => {
    assert.equal(sanitizeForInput(null), '')
    assert.equal(sanitizeForInput(undefined), '')
  })

  it('leading dot preserved as partial decimal', () => {
    assert.equal(sanitizeForInput('.'), '')
    assert.equal(sanitizeForInput('0.'), '0.')
  })
})

// ─── validateNumeric Tests ──────────────────────────────────

describe('validateNumeric', () => {
  it('valid value passes', () => {
    const r = validateNumeric('10000')
    assert.equal(r.valid, true)
    assert.equal(r.error, null)
  })

  it('empty value passes', () => {
    const r = validateNumeric('')
    assert.equal(r.valid, true)
  })

  it('above max returns error without changing input', () => {
    const r = validateNumeric('10000000000000')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('maksimum'))
  })

  it('NaN returns error', () => {
    const r = validateNumeric('abc')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('tidak valid'))
  })

  it('Infinity returns error', () => {
    const r = validateNumeric('Infinity')
    assert.equal(r.valid, false)
  })

  it('negative below minValue returns error', () => {
    const r = validateNumeric('-5', { minValue: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('kurang dari'))
  })

  it('custom maxValue is respected', () => {
    const r = validateNumeric('100', { maxValue: 50 })
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('maksimum'))
  })

  it('scientific notation rejected', () => {
    const r = validateNumeric('1e20')
    assert.equal(r.valid, false)
  })
})

// ─── parseNumericValue Tests ────────────────────────────────

describe('parseNumericValue', () => {
  it('parses normal number', () => {
    assert.equal(parseNumericValue('1000'), 1000)
  })

  it('parses decimal', () => {
    assert.equal(parseNumericValue('10.5'), 10.5)
  })

  it('empty returns 0', () => {
    assert.equal(parseNumericValue(''), 0)
  })

  it('null returns 0', () => {
    assert.equal(parseNumericValue(null), 0)
  })

  it('invalid returns 0', () => {
    assert.equal(parseNumericValue('abc'), 0)
  })
})
