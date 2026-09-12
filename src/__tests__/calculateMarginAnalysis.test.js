import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMarginAnalysis, generateScenarios } from '../sections/MarginAnalysis/calculateMarginAnalysis.js'

// ═══════════════════════════════════════════════════════════════
// TEST 5: Selling price calculation benar
// ═══════════════════════════════════════════════════════════════

describe('TEST 5: Selling price calculation', () => {
  it('cost=10000, selling=15000 → effective=15000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 15000)
  })

  it('cost=10000, selling=15000, discount=10% → effective=13500', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      discountPercent: 10,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 13500)
    assert.equal(r.discountAmount, 1500)
    assert.equal(r.grossSellingPrice, 15000)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 6: Margin calculation benar
// ═══════════════════════════════════════════════════════════════

describe('TEST 6: Margin calculation', () => {
  it('cost=10000, selling=20000 → margin=50%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.marginPercent, 50)
  })

  it('cost=10000, selling=15000 → margin≈33.33%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.ok(Math.abs(r.marginPercent - 33.33) < 0.1)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 7: Markup calculation benar
// ═══════════════════════════════════════════════════════════════

describe('TEST 7: Markup calculation', () => {
  it('cost=10000, selling=15000 → markup=50%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.markupPercent, 50)
  })

  it('cost=10000, selling=20000 → markup=100%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.markupPercent, 100)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 8: Target margin calculation benar
// ═══════════════════════════════════════════════════════════════

describe('TEST 8: Target margin calculation', () => {
  it('cost=10000, target margin=50% → selling=20000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 50,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 20000)
    assert.equal(r.marginPercent, 50)
  })

  it('cost=10000, target margin=40% → selling≈16666.67', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 40,
    })
    assert.equal(r.isValid, true)
    assert.ok(Math.abs(r.effectiveSellingPrice - 16666.67) < 0.1)
    assert.equal(r.marginPercent, 40)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 9: Target markup calculation benar
// ═══════════════════════════════════════════════════════════════

describe('TEST 9: Target markup calculation', () => {
  it('cost=10000, target markup=50% → selling=15000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: 50,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 15000)
    assert.equal(r.markupPercent, 50)
  })

  it('cost=10000, target markup=100% → selling=20000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: 100,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 20000)
    assert.equal(r.markupPercent, 100)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 10: HPP + sales cost = total cost
// ═══════════════════════════════════════════════════════════════

describe('TEST 10: HPP + sales cost = total cost', () => {
  it('cost=10000, selling cost=2000 → total cost = 12000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      sellingCostPerUnit: 2000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.totalCostPerUnit, 12000)
  })

  it('cost=5000, selling cost=0 → total cost = 5000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 5000,
      sellingPrice: 10000,
      sellingCostPerUnit: 0,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.totalCostPerUnit, 5000)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 11: Profit = selling price - total cost
// ═══════════════════════════════════════════════════════════════

describe('TEST 11: Profit = selling price - total cost', () => {
  it('selling=20000, cost=10000, sell cost=2000 → profit=8000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      sellingCostPerUnit: 2000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.profitPerUnit, 8000)
  })

  it('selling=15000, cost=10000, sell cost=0 → profit=5000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.profitPerUnit, 5000)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 12: Margin = profit / selling price
// ═══════════════════════════════════════════════════════════════

describe('TEST 12: Margin = profit / selling price', () => {
  it('profit=8000, selling=20000 → margin=40%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      sellingCostPerUnit: 2000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.marginPercent, 40)
  })

  it('verify: margin = profit / effectiveSellingPrice * 100', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 12000,
      sellingPrice: 18000,
      sellingCostPerUnit: 1000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    const expectedMargin = (r.profitPerUnit / r.effectiveSellingPrice) * 100
    assert.ok(Math.abs(r.marginPercent - expectedMargin) < 0.01)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 13: Markup = profit / HPP
// ═══════════════════════════════════════════════════════════════

describe('TEST 13: Markup = profit / HPP', () => {
  it('profit=8000, cost=10000 → markup=80%', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      sellingCostPerUnit: 2000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.markupPercent, 80)
  })

  it('verify: markup = profit / costPerUnit * 100', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 15000,
      sellingPrice: 25000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    const expectedMarkup = (r.profitPerUnit / r.costPerUnit) * 100
    assert.ok(Math.abs(r.markupPercent - expectedMarkup) < 0.01)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 14: Division by zero aman
// ═══════════════════════════════════════════════════════════════

describe('TEST 14: Division by zero aman', () => {
  it('cost=0, selling=0 → margin=0, markup=0 (no crash)', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 0,
      sellingPrice: 0,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.marginPercent, 0)
    assert.equal(r.markupPercent, 0)
    assert.ok(Number.isFinite(r.marginPercent))
    assert.ok(Number.isFinite(r.markupPercent))
  })

  it('cost=0, selling=10000 → margin=100%, markup=0 (no crash)', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 0,
      sellingPrice: 10000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.marginPercent, 100)
    assert.equal(r.markupPercent, 0)
    assert.ok(Number.isFinite(r.marginPercent))
    assert.ok(Number.isFinite(r.markupPercent))
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 15: NaN invalid
// ═══════════════════════════════════════════════════════════════

describe('TEST 15: NaN input', () => {
  it('NaN cost → coerced to 0, result valid but no NaN', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: NaN,
      sellingPrice: 10000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.ok(!Number.isNaN(r.profitPerUnit))
    assert.ok(!Number.isNaN(r.marginPercent))
    assert.ok(!Number.isNaN(r.markupPercent))
    assert.ok(Number.isFinite(r.profitPerUnit))
    assert.ok(Number.isFinite(r.marginPercent))
  })

  it('NaN selling price → coerced to 0, no NaN in result', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: NaN,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.ok(!Number.isNaN(r.profitPerUnit))
    assert.ok(Number.isFinite(r.profitPerUnit))
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 16: Infinity invalid
// ═══════════════════════════════════════════════════════════════

describe('TEST 16: Infinity cost', () => {
  it('Infinity cost → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: Infinity,
      sellingPrice: 10000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
  })

  it('Infinity selling price → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: Infinity,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
  })

  it('Infinity selling cost → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      sellingCostPerUnit: Infinity,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 17: Negative cost invalid
// ═══════════════════════════════════════════════════════════════

describe('TEST 17: Negative cost invalid', () => {
  it('cost=-5000 → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: -5000,
      sellingPrice: 10000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('negatif')))
  })

  it('negative selling cost → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      sellingCostPerUnit: -1000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('negatif')))
  })

  it('negative selling price → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: -5000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('negatif')))
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST 18: Target margin 100% invalid
// ═══════════════════════════════════════════════════════════════

describe('TEST 18: Target margin 100% invalid', () => {
  it('target margin=100% → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 100,
    })
    assert.equal(r.isValid, false)
    assert.ok(r.errors.some(e => e.includes('100%')))
  })

  it('target margin > 100% → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 150,
    })
    assert.equal(r.isValid, false)
  })

  it('negative target margin → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: -10,
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Additional: quantity analysis
// ═══════════════════════════════════════════════════════════════

describe('Quantity analysis', () => {
  it('qty=10 → revenue, totalCost, totalProfit correct', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 10,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.revenue, 150000)
    assert.equal(r.totalCost, 100000)
    assert.equal(r.totalProfit, 50000)
  })

  it('qty=0 → invalid', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 0,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Additional: discount tests
// ═══════════════════════════════════════════════════════════════

describe('Discount tests', () => {
  it('discount 0% → effective = gross', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      discountPercent: 0,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.effectiveSellingPrice, 15000)
    assert.equal(r.discountAmount, 0)
  })

  it('discount 50% → effective = half', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 20000,
      discountPercent: 50,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.effectiveSellingPrice, 10000)
    assert.equal(r.discountAmount, 10000)
  })

  it('discount > 100% → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      discountPercent: 110,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Scenario Generation
// ═══════════════════════════════════════════════════════════════

describe('generateScenarios', () => {
  it('generates correct scenarios', () => {
    const scenarios = generateScenarios(10000, [12000, 15000, 20000, 25000])
    assert.equal(scenarios.length, 4)
    assert.equal(scenarios[0].profit, 2000)
    assert.ok(Math.abs(scenarios[0].marginPercent - 16.67) < 0.1)
    assert.equal(scenarios[0].markupPercent, 20)

    assert.equal(scenarios[1].profit, 5000)
    assert.ok(Math.abs(scenarios[1].marginPercent - 33.33) < 0.1)
    assert.equal(scenarios[1].markupPercent, 50)

    assert.equal(scenarios[2].profit, 10000)
    assert.equal(scenarios[2].marginPercent, 50)
    assert.equal(scenarios[2].markupPercent, 100)

    assert.equal(scenarios[3].profit, 15000)
    assert.equal(scenarios[3].marginPercent, 60)
    assert.equal(scenarios[3].markupPercent, 150)
  })

  it('with selling cost', () => {
    const scenarios = generateScenarios(10000, [15000, 20000], 2000)
    assert.equal(scenarios[0].profit, 3000) // 15000 - 10000 - 2000
    assert.equal(scenarios[1].profit, 8000) // 20000 - 10000 - 2000
  })

  it('empty prices → empty array', () => {
    const scenarios = generateScenarios(10000, [])
    assert.equal(scenarios.length, 0)
  })

  it('cost=0 → markup=0 for all', () => {
    const scenarios = generateScenarios(0, [10000, 20000])
    assert.equal(scenarios[0].markupPercent, 0)
    assert.equal(scenarios[1].markupPercent, 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: target markup + sales cost interaction
// ═══════════════════════════════════════════════════════════════

describe('Target markup + sales cost', () => {
  it('cost=8000, markup=50%, salesCost=2000 → selling=12000', () => {
    // Formula: sellingPrice = HPP × (1 + markup%) + Sales Cost
    // But current engine: sellingPrice = cost × (1 + markup/100)
    // salesCost is added to totalCost, not to selling price
    // So effectiveSellingPrice = 8000 * 1.5 = 12000
    // totalCostPerUnit = 8000 + 2000 = 10000
    // profit = 12000 - 10000 = 2000
    const r = calculateMarginAnalysis({
      costPerUnit: 8000,
      sellingCostPerUnit: 2000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: 50,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 12000)
    assert.equal(r.totalCostPerUnit, 10000)
    assert.equal(r.profitPerUnit, 2000)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: zero cost with target margin
// ═══════════════════════════════════════════════════════════════

describe('Zero cost with target margin', () => {
  it('cost=0, target margin=50% → selling=0 (0 / 0.5 = 0)', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 0,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 50,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 0)
    assert.ok(Number.isFinite(r.effectiveSellingPrice))
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: target margin 0%
// ═══════════════════════════════════════════════════════════════

describe('Target margin 0%', () => {
  it('cost=10000, target margin=0% → selling=10000 (cost / 1)', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: 0,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 10000)
    assert.equal(r.marginPercent, 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: target markup 0%
// ═══════════════════════════════════════════════════════════════

describe('Target markup 0%', () => {
  it('cost=10000, target markup=0% → selling=10000', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: 0,
    })
    assert.equal(r.isValid, true)
    assert.equal(r.effectiveSellingPrice, 10000)
    assert.equal(r.markupPercent, 0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: negative target markup
// ═══════════════════════════════════════════════════════════════

describe('Negative target markup', () => {
  it('target markup=-10 → validation error', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: -10,
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: All NaN inputs produce no NaN
// ═══════════════════════════════════════════════════════════════

describe('All NaN inputs', () => {
  it('every field NaN → no NaN in results', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: NaN,
      sellingPrice: NaN,
      discountPercent: NaN,
      sellingCostPerUnit: NaN,
      quantity: NaN,
      targetMargin: NaN,
      targetMarkup: NaN,
    })
    assert.ok(!Number.isNaN(r.profitPerUnit))
    assert.ok(!Number.isNaN(r.marginPercent))
    assert.ok(!Number.isNaN(r.markupPercent))
    assert.ok(!Number.isNaN(r.effectiveSellingPrice))
    assert.ok(Number.isFinite(r.profitPerUnit))
    assert.ok(Number.isFinite(r.marginPercent))
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: Infinity in all fields
// ═══════════════════════════════════════════════════════════════

describe('Infinity in all fields', () => {
  it('Infinity target margin → invalid', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_margin',
      targetMargin: Infinity,
    })
    assert.equal(r.isValid, false)
  })

  it('Infinity target markup → invalid', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      quantity: 1,
      analysisMode: 'target_markup',
      targetMarkup: Infinity,
    })
    assert.equal(r.isValid, false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge Cases: product mode vs manual mode
// ═══════════════════════════════════════════════════════════════

describe('Product mode vs manual mode', () => {
  it('manual mode (no productId) still calculates correctly', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.profitPerUnit, 5000)
  })

  it('product mode calculates identically to manual', () => {
    const r = calculateMarginAnalysis({
      costPerUnit: 10000,
      sellingPrice: 15000,
      quantity: 1,
      analysisMode: 'price',
    })
    assert.equal(r.isValid, true)
    assert.equal(r.profitPerUnit, 5000)
  })
})
