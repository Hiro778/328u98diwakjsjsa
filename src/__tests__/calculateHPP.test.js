import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculateHPP, convertUnit } from '../sections/HPPCalculator/calculateHPP.js'

// ─── Unit Conversion ─────────────────────────────────────────

describe('convertUnit', () => {
  it('kg to g', () => {
    assert.equal(convertUnit(1, 'kg', 'g'), 1000)
  })

  it('g to kg', () => {
    assert.equal(convertUnit(250, 'g', 'kg'), 0.25)
  })

  it('same unit', () => {
    assert.equal(convertUnit(5, 'kg', 'kg'), 5)
  })

  it('liter to ml', () => {
    assert.equal(convertUnit(2, 'liter', 'ml'), 2000)
  })

  it('ml to liter', () => {
    assert.equal(convertUnit(500, 'ml', 'liter'), 0.5)
  })

  it('custom unit (ikat) — identity', () => {
    assert.equal(convertUnit(3, 'ikat', 'ikat'), 3)
  })

  it('unknown cross-family — identity fallback', () => {
    assert.equal(convertUnit(10, 'kg', 'pcs'), 10)
  })
})

// ─── Test 1: Basic HPP ─────────────────────────────────────

describe('Test 1: Basic HPP calculation', () => {
  it('materials=100k, packaging=20k, labor=30k, overhead=50k, other=0, qty=100', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 100000 }],
      packaging: [{ name: 'Kemasan', quantity: 1, unit: 'pcs', pricePerUnit: 20000 }],
      labor: [{ name: 'Kerja', cost: 30000 }],
      overhead: [{ name: 'Overhead', cost: 50000 }],
      otherCosts: [],
      quantityProduced: 100,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.totalCost, 200000)
    assert.equal(result.hppPerUnit, 2000)
  })
})

// ─── Test 2: Markup 50% ─────────────────────────────────────

describe('Test 2: Markup 50%', () => {
  it('hpp=10000, markup=50% → selling=15000, profit=5000', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 100,
      priceMode: 'markup',
      markupPercent: 50,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 10000)
    assert.equal(result.sellingPrice, 15000)
    assert.equal(result.profitPerUnit, 5000)
    // Actual margin = (15000 - 10000) / 15000 = 33.33%
    assert.ok(Math.abs(result.actualMargin - 33.33) < 0.1)
  })
})

// ─── Test 3: Margin 50% ─────────────────────────────────────

describe('Test 3: Margin 50%', () => {
  it('hpp=10000, margin=50% → selling=20000, profit=10000', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 100,
      priceMode: 'margin',
      marginPercent: 50,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 10000)
    assert.equal(result.sellingPrice, 20000)
    assert.equal(result.profitPerUnit, 10000)
    assert.equal(result.actualMargin, 50)
  })
})

// ─── Test 4: quantityProduced = 0 ────────────────────────────

describe('Test 4: Quantity zero', () => {
  it('quantityProduced=0 → validation error', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 100000 }],
      quantityProduced: 0,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.length > 0)
    assert.ok(!Number.isFinite(result.hppPerUnit) || result.hppPerUnit === 0)
  })
})

// ─── Test 5: All optional costs = 0 ─────────────────────────

describe('Test 5: All optional costs zero', () => {
  it('valid when quantity > 0 even with zero costs', () => {
    const result = calculateHPP({
      materials: [],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 50,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.totalCost, 0)
    assert.equal(result.hppPerUnit, 0)
  })
})

// ─── Test 6: Unit conversion in cost ─────────────────────────

describe('Test 6: Unit conversion 250g × Rp20,000/kg', () => {
  it('250g of Rp20,000/kg = Rp5,000', () => {
    const result = calculateHPP({
      materials: [{ name: 'Tepung', quantity: 250, unit: 'g', pricePerUnit: 20000, purchaseUnit: 'kg' }],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.materialCost, 5000)
    assert.equal(result.hppPerUnit, 5000)
  })
})

// ─── Test 7: Waste 10% — single application ─────────────────

describe('Test 7: Waste 10% applied once', () => {
  it('materials=10000, waste=10% → materialCost=11000, no double count', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 1,
      wastePercent: 10,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.materialCostBase, 10000)
    assert.equal(result.materialCost, 11000)
    assert.equal(result.totalCost, 11000)
    assert.equal(result.hppPerUnit, 11000)
  })
})

// ─── Edge Cases ──────────────────────────────────────────────

describe('Edge cases', () => {
  it('no NaN in output', () => {
    const result = calculateHPP({})
    assert.ok(!Number.isNaN(result.totalCost))
    assert.ok(!Number.isNaN(result.hppPerUnit))
    assert.ok(!Number.isNaN(result.sellingPrice))
  })

  it('no Infinity in output', () => {
    const result = calculateHPP({ quantityProduced: 1 })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.sellingPrice))
  })

  it('margin >= 100 is invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      priceMode: 'margin',
      marginPercent: 100,
    })
    assert.equal(result.isValid, false)
  })

  it('negative markup is invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      priceMode: 'markup',
      markupPercent: -10,
    })
    assert.equal(result.isValid, false)
  })

  it('empty input — quantity=0 → invalid', () => {
    const result = calculateHPP(null)
    assert.equal(result.isValid, false)
  })
})

// ─── Unlimited Production Quantity ─────────────────────────

describe('Unlimited production quantity', () => {
  it('quantityProduced = 1,000,000 → valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      quantityProduced: 1_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })

  it('quantityProduced = 10,000,000 → valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 10000000 }],
      quantityProduced: 10_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })

  it('quantityProduced = 1,000,000,000,000 → valid (1 trillion)', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 1000000000000 }],
      quantityProduced: 1_000_000_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })

  it('quantityProduced = 99999999999999.99 → valid (finite)', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 100000 }],
      quantityProduced: 99999999999999.99,
    })
    assert.equal(result.isValid, true)
    assert.ok(Number.isFinite(result.hppPerUnit))
  })

  it('quantityProduced = 100 → valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 500000 }],
      quantityProduced: 100,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 5000)
  })
})

// ─── NaN / Infinity Protection ─────────────────────────────

describe('NaN and Infinity protection', () => {
  it('NaN quantity → no NaN in output', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: NaN,
    })
    assert.ok(!Number.isNaN(result.hppPerUnit))
    assert.ok(!Number.isNaN(result.totalCost))
    assert.ok(!Number.isNaN(result.sellingPrice))
  })

  it('Infinity quantity → no Infinity in output', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: Infinity,
    })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })

  it('negative quantity → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: -1,
    })
    assert.equal(result.isValid, false)
  })

  it('fractional quantity 0.5 → valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 0.5,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 20000)
  })
})

// ─── Extreme Cost Values ───────────────────────────────────

describe('Extreme cost values', () => {
  it('very large cost → no Infinity in output', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 999999999999999 }],
      quantityProduced: 1,
    })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })

  it('negative cost → valid (cost = 0, no crash)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: -1000 }],
      quantityProduced: 1,
    })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })

  it('NaN cost → no NaN in output', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: NaN }],
      quantityProduced: 1,
    })
    assert.ok(!Number.isNaN(result.hppPerUnit))
    assert.ok(!Number.isNaN(result.totalCost))
  })
})

// ─── Specific User Requirement Formulas ─────────────────────

describe('User requirement formulas', () => {
  it('Basic example: 500k+100k+200k+100k / 100 = 9000', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 500000 }],
      packaging: [{ name: 'Kemasan', quantity: 1, unit: 'pcs', pricePerUnit: 100000 }],
      labor: [{ name: 'Kerja', cost: 200000 }],
      overhead: [{ name: 'Overhead', cost: 100000 }],
      otherCosts: [],
      quantityProduced: 100,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.totalCost, 900000)
    assert.equal(result.hppPerUnit, 9000)
  })

  it('Markup: hpp=10000, markup=50% → 15000', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      quantityProduced: 100,
      priceMode: 'markup',
      markupPercent: 50,
    })
    assert.equal(result.sellingPrice, 15000)
  })

  it('Margin: hpp=10000, margin=50% → 20000', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      quantityProduced: 100,
      priceMode: 'margin',
      marginPercent: 50,
    })
    assert.equal(result.sellingPrice, 20000)
  })

  it('Margin 100% is invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      priceMode: 'margin',
      marginPercent: 100,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('Margin harus kurang dari 100%')))
  })

  it('Margin 99.99% is valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      priceMode: 'margin',
      marginPercent: 99.99,
    })
    assert.equal(result.isValid, true)
  })

  it('quantityProduced = 1,000,000,000,000 → valid (no upper limit)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1000000000000 }],
      quantityProduced: 1_000_000_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })
})

// ─── Fresh Form: All Costs = 0 ──────────────────────────────

describe('Fresh form: all costs zero', () => {
  it('empty form → hppPerUnit = 0, totalCost = 0', () => {
    const result = calculateHPP({
      materials: [],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: 100,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.totalCost, 0)
    assert.equal(result.hppPerUnit, 0)
    assert.equal(result.materialCost, 0)
    assert.equal(result.packagingCost, 0)
    assert.equal(result.directLaborCost, 0)
    assert.equal(result.overheadCost, 0)
    assert.equal(result.otherCost, 0)
    assert.equal(result.sellingPrice, 0)
  })
})

// ─── Empty Quantity → Invalid ──────────────────────────────

describe('Empty quantity', () => {
  it('quantityProduced = "" → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: '',
    })
    assert.equal(result.isValid, false)
  })

  it('quantityProduced = 0 → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 0,
    })
    assert.equal(result.isValid, false)
  })

  it('quantityProduced = undefined → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: undefined,
    })
    assert.equal(result.isValid, false)
  })

  it('hppPerUnit = 0 when quantity empty (no division by zero)', () => {
    const result = calculateHPP({ quantityProduced: '' })
    assert.equal(result.hppPerUnit, 0)
    assert.ok(Number.isFinite(result.hppPerUnit))
  })
})

// ─── Quantity 1,000,000 → Valid ─────────────────────────────

describe('Quantity 1,000,000 boundary', () => {
  it('quantityProduced = 1,000,000 → valid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1000000 }],
      quantityProduced: 1_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })

  it('quantityProduced = 1,000,001 → valid (no upper limit)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1_000_001,
    })
    assert.equal(result.isValid, true)
  })
})

// ─── NaN / Infinity → Invalid ──────────────────────────────

describe('NaN and Infinity inputs', () => {
  it('NaN quantity → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: NaN,
    })
    assert.equal(result.isValid, false)
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })

  it('Infinity quantity → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: Infinity,
    })
    assert.equal(result.isValid, false)
    assert.ok(Number.isFinite(result.hppPerUnit))
  })

  it('NaN cost in material → item cost = 0, no NaN output', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: NaN, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
    })
    assert.ok(!Number.isNaN(result.hppPerUnit))
    assert.ok(Number.isFinite(result.hppPerUnit))
  })

  it('Infinity cost in labor → item cost = 0, no Infinity output', () => {
    const result = calculateHPP({
      labor: [{ name: 'X', cost: Infinity }],
      quantityProduced: 1,
    })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })
})

// ─── Other Costs: Empty = 0, Extreme = Invalid ─────────────

describe('Other costs validation', () => {
  it('empty otherCosts array → otherCost = 0', () => {
    const result = calculateHPP({
      materials: [],
      otherCosts: [],
      quantityProduced: 10,
    })
    assert.equal(result.otherCost, 0)
  })

  it('otherCosts with valid items → sum correct', () => {
    const result = calculateHPP({
      otherCosts: [
        { name: 'Transport', cost: 50000 },
        { name: 'Bungkus', cost: 30000 },
      ],
      quantityProduced: 10,
    })
    assert.equal(result.otherCost, 80000)
  })

  it('otherCosts with NaN cost → flagged as invalid', () => {
    const result = calculateHPP({
      otherCosts: [{ name: 'Bad', cost: NaN }],
      quantityProduced: 10,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('tidak valid')))
  })

  it('otherCosts with negative cost → flagged as invalid', () => {
    const result = calculateHPP({
      otherCosts: [{ name: 'Bad', cost: -5000 }],
      quantityProduced: 10,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('negatif')))
  })
})

// ─── Calculation Never Produces Infinity ────────────────────

describe('No Infinity in output', () => {
  it('huge cost / small quantity → finite result', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 99999999999999 }],
      quantityProduced: 0.001,
    })
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(Number.isFinite(result.totalCost))
  })

  it('zero quantity with costs → hppPerUnit = 0 (no division by zero)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 100000 }],
      quantityProduced: 0,
    })
    assert.equal(result.hppPerUnit, 0)
    assert.ok(Number.isFinite(result.hppPerUnit))
  })

  it('margin 99.99% → finite selling price', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      priceMode: 'margin',
      marginPercent: 99.99,
    })
    assert.ok(Number.isFinite(result.sellingPrice))
  })
})

// ─── Fresh Form Default State ──────────────────────────────

describe('Fresh form default state', () => {
  it('EMPTY_FORM has all cost arrays as empty', () => {
    // Simulates what EMPTY_FORM looks like
    const freshForm = {
      materials: [],
      packaging: [],
      labor: [],
      overhead: [],
      otherCosts: [],
      quantityProduced: '',
      wastePercent: '',
    }
    const result = calculateHPP({
      materials: freshForm.materials,
      packaging: freshForm.packaging,
      labor: freshForm.labor,
      overhead: freshForm.overhead,
      otherCosts: freshForm.otherCosts,
      quantityProduced: Number(freshForm.quantityProduced) || 0,
      wastePercent: Number(freshForm.wastePercent) || 0,
    })
    assert.equal(result.totalCost, 0)
    assert.equal(result.hppPerUnit, 0)
    assert.equal(result.materialCost, 0)
    assert.equal(result.packagingCost, 0)
    assert.equal(result.directLaborCost, 0)
    assert.equal(result.overheadCost, 0)
    assert.equal(result.otherCost, 0)
  })
})

// ─── Total Cost Overflow → Valid (no max limit) ──────────────

describe('Total cost — no maximum limit', () => {
  it('very large totalCost is valid (no cap)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 5e15 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
    assert.ok(result.totalCost > 9999999999999.99)
  })

  it('huge material cost is valid (no per-component cap)', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1e16 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
    assert.ok(result.materialCost === 1e16)
  })

  it('huge labor cost is valid (no per-component cap)', () => {
    const result = calculateHPP({
      labor: [{ name: 'X', cost: 1e16 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
  })

  it('huge overhead cost is valid (no per-component cap)', () => {
    const result = calculateHPP({
      overhead: [{ name: 'X', cost: 1e16 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
  })

  it('huge otherCosts is valid (no per-component cap)', () => {
    const result = calculateHPP({
      otherCosts: [{ name: 'X', cost: 1e16 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
  })

  it('huge packaging cost is valid (no per-component cap)', () => {
    const result = calculateHPP({
      packaging: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 1e16 }],
      quantityProduced: 1,
    })
    assert.equal(result.isValid, true)
  })
})

// ─── Waste Percentage Scenarios ──────────────────────────────

describe('Waste percentage scenarios', () => {
  it('waste 0% → no change to material cost', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      wastePercent: 0,
    })
    assert.equal(result.materialCostBase, 10000)
    assert.equal(result.materialCost, 10000)
  })

  it('waste 5% → materialCost = base × 1.05', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      wastePercent: 5,
    })
    assert.equal(result.materialCostBase, 10000)
    assert.equal(result.materialCost, 10500)
  })

  it('waste 50% → materialCost = base × 1.5', () => {
    const result = calculateHPP({
      materials: [
        { name: 'Bahan A', quantity: 1, unit: 'pcs', pricePerUnit: 10000 },
        { name: 'Bahan B', quantity: 1, unit: 'pcs', pricePerUnit: 20000 },
      ],
      quantityProduced: 1,
      wastePercent: 50,
    })
    assert.equal(result.materialCostBase, 30000)
    assert.equal(result.materialCost, 45000)
  })

  it('waste > 100% → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      wastePercent: 101,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('Waste')))
  })

  it('waste negative → invalid', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 1,
      wastePercent: -5,
    })
    assert.equal(result.isValid, false)
    assert.ok(result.errors.some(e => e.includes('Waste')))
  })

  it('waste applies ONLY to materials, not packaging', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      packaging: [{ name: 'Kemasan', quantity: 1, unit: 'pcs', pricePerUnit: 5000 }],
      quantityProduced: 1,
      wastePercent: 10,
    })
    assert.equal(result.materialCost, 11000) // 10000 × 1.1
    assert.equal(result.packagingCost, 5000) // unaffected
    assert.equal(result.totalCost, 16000) // 11000 + 5000
  })
})

// ─── Snapshot Cost Breakdown Structure ──────────────────────

describe('Cost breakdown snapshot structure', () => {
  it('all line items captured correctly for snapshot', () => {
    const materials = [
      { name: 'Kopi', quantity: 2, unit: 'kg', pricePerUnit: 120000 },
      { name: 'Susu', quantity: 5, unit: 'liter', pricePerUnit: 15000 },
    ]
    const packaging = [{ name: 'Cup', quantity: 100, unit: 'pcs', pricePerUnit: 500 }]
    const labor = [{ name: 'Barista', cost: 50000 }]
    const overhead = [{ name: 'Listrik', cost: 20000 }]
    const otherCosts = [{ name: 'Transport', cost: 10000 }]

    const result = calculateHPP({
      materials,
      packaging,
      labor,
      overhead,
      otherCosts,
      quantityProduced: 100,
      wastePercent: 5,
    })

    // Verify snapshot would contain correct aggregated values
    assert.equal(result.materialCostBase, 315000) // 240000 + 75000
    assert.equal(result.materialCost, 330750) // 315000 × 1.05
    assert.equal(result.packagingCost, 50000)
    assert.equal(result.directLaborCost, 50000)
    assert.equal(result.overheadCost, 20000)
    assert.equal(result.otherCost, 10000)
    assert.equal(result.totalCost, 460750)
    assert.equal(result.hppPerUnit, 4607.5)
  })
})

// ─── Regression: Large Quantities ──────────────────────────

describe('Regression: large quantity edge cases', () => {
  it('quantity 1,000,000 with real costs → PASS', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1000, unit: 'kg', pricePerUnit: 50000 }],
      packaging: [{ name: 'Kemasan', quantity: 1000000, unit: 'pcs', pricePerUnit: 200 }],
      labor: [{ name: 'Kerja', cost: 5000000 }],
      overhead: [{ name: 'Overhead', cost: 2000000 }],
      quantityProduced: 1_000_000,
    })
    assert.equal(result.isValid, true)
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(result.hppPerUnit > 0)
  })

  it('quantity 10,000,000 → PASS', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 100000000 }],
      quantityProduced: 10_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 10)
  })

  it('quantity 1,000,000,000,000 (1T) → PASS', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 1000000000000 }],
      quantityProduced: 1_000_000_000_000,
    })
    assert.equal(result.isValid, true)
    assert.equal(result.hppPerUnit, 1)
  })

  it('very large finite quantity → PASS', () => {
    const result = calculateHPP({
      materials: [{ name: 'Bahan', quantity: 1, unit: 'pcs', pricePerUnit: 5000000 }],
      quantityProduced: 100_000_000,
    })
    assert.equal(result.isValid, true)
    assert.ok(Number.isFinite(result.hppPerUnit))
    assert.ok(result.hppPerUnit > 0)
  })

  it('0 → FAIL', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: 0,
    })
    assert.equal(result.isValid, false)
  })

  it('negative → FAIL', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: -100,
    })
    assert.equal(result.isValid, false)
  })

  it('NaN → FAIL', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: NaN,
    })
    assert.equal(result.isValid, false)
  })

  it('Infinity → FAIL', () => {
    const result = calculateHPP({
      materials: [{ name: 'X', quantity: 1, unit: 'pcs', pricePerUnit: 10000 }],
      quantityProduced: Infinity,
    })
    assert.equal(result.isValid, false)
  })
})
