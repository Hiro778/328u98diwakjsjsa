import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMaterialBatches,
  calculateRequirements,
  calculateShortages
} from '../services/productionCapacityService.js'

describe('Production Capacity Planner (cap.md Acceptance Tests)', () => {
  // Common material definitions
  const materialA = { id: 'mat-1', name: 'Tepung Terigu', unit: 'pcs' }

  // ============================================================
  // CASE 1: Kebutuhan = 30, Target = 100
  // ============================================================
  it('Case 1: Kebutuhan = 30, Target = 100 batch (Stok = 1500 pcs)', () => {
    const bomItems = [
      {
        material_product_id: 'mat-1',
        quantity_required: 30,
        unit: 'pcs',
        material: materialA,
      },
    ]

    const targetBatches = 100
    const inventoryMap = { 'mat-1': 1500 } // Stok tersedia 1500 pcs

    // 1. Hitung Kapasitas Maksimum (Max Batch)
    const { maxBatches, bottleneck, breakdown } = calculateMaterialBatches(inventoryMap, bomItems)
    assert.equal(maxBatches, 50, 'Max batch harus 1500 / 30 = 50 batch')
    assert.equal(bottleneck.material_product_id, 'mat-1')
    assert.equal(breakdown[0].possibleBatches, 50)
    assert.equal(breakdown[0].requiredPerBatch, 30)

    // 2. Hitung Total Kebutuhan (Total Dibutuhkan = 30 * 100 = 3000)
    const requirements = calculateRequirements(targetBatches, bomItems)
    assert.equal(requirements['mat-1'], 3000, 'Total kebutuhan harus 30 * 100 = 3000 pcs')

    // 3. Hitung Kekurangan (Shortage = 3000 - 1500 = 1500)
    const shortages = calculateShortages(inventoryMap, requirements, bomItems)
    assert.equal(shortages.length, 1)
    assert.equal(shortages[0].required, 3000)
    assert.equal(shortages[0].stock, 1500)
    assert.equal(shortages[0].shortage, 1500, 'Kekurangan bahan harus 3000 - 1500 = 1500 pcs')

    // 4. Status Target: 50 < 100 -> Tidak Terpenuhi
    const targetFulfilled = maxBatches >= targetBatches
    assert.equal(targetFulfilled, false, 'Target tidak terpenuhi karena max batch (50) < target (100)')
  })

  // ============================================================
  // CASE 2: Kebutuhan = 3000, Target = 100
  // ============================================================
  it('Case 2: Kebutuhan = 3000, Target = 100 batch (Stok = 6000 pcs)', () => {
    const bomItems = [
      {
        material_product_id: 'mat-1',
        quantity_required: 3000,
        unit: 'pcs',
        material: materialA,
      },
    ]

    const targetBatches = 100
    const inventoryMap = { 'mat-1': 6000 }

    // 1. Max Batch = floor(6000 / 3000) = 2 batch
    const { maxBatches } = calculateMaterialBatches(inventoryMap, bomItems)
    assert.equal(maxBatches, 2, 'Max batch harus 6000 / 3000 = 2 batch')

    // 2. Total Kebutuhan = 3000 * 100 = 300.000 pcs
    const requirements = calculateRequirements(targetBatches, bomItems)
    assert.equal(requirements['mat-1'], 300000, 'Total kebutuhan harus 3000 * 100 = 300.000 pcs')

    // 3. Kekurangan = 300.000 - 6.000 = 294.000 pcs
    const shortages = calculateShortages(inventoryMap, requirements, bomItems)
    assert.equal(shortages.length, 1)
    assert.equal(shortages[0].shortage, 294000, 'Kekurangan bahan harus 294.000 pcs')

    // 4. Status Target: 2 < 100 -> Tidak Terpenuhi
    const targetFulfilled = maxBatches >= targetBatches
    assert.equal(targetFulfilled, false, 'Target tidak terpenuhi')
  })

  // ============================================================
  // CASE 3: Kebutuhan = 0, Target = 100
  // ============================================================
  it('Case 3: Kebutuhan = 0, Target = 100 batch (Safety check no division by zero)', () => {
    const bomItems = [
      {
        material_product_id: 'mat-1',
        quantity_required: 0,
        unit: 'pcs',
        material: materialA,
      },
    ]

    const targetBatches = 100
    const inventoryMap = { 'mat-1': 1000 }

    // 1. Max Batch handles 0 gracefully with warning and maxBatches = 0
    const { maxBatches, warnings } = calculateMaterialBatches(inventoryMap, bomItems)
    assert.equal(maxBatches, 0)
    assert.ok(warnings.length > 0, 'Harus mencantumkan warning jika kebutuhan <= 0')

    // 2. Total Kebutuhan = 0
    const requirements = calculateRequirements(targetBatches, bomItems)
    assert.equal(requirements['mat-1'], 0, 'Total kebutuhan bahan bernilai 0 harus 0')

    // 3. Kekurangan = 0 (karena kebutuhan 0, stok 1000 cukup)
    const shortages = calculateShortages(inventoryMap, requirements, bomItems)
    assert.equal(shortages.length, 0, 'Tidak ada kekurangan bahan ketika kebutuhan 0')

    // 4. Status target
    const targetFulfilled = maxBatches >= targetBatches
    assert.equal(targetFulfilled, false)
  })

  // ============================================================
  // CASE 4: Stok tersedia lebih besar dari kebutuhan
  // ============================================================
  it('Case 4: Stok tersedia lebih besar dari kebutuhan (Stok = 5000 pcs, Kebutuhan = 30, Target = 100 batch)', () => {
    const bomItems = [
      {
        material_product_id: 'mat-1',
        quantity_required: 30,
        unit: 'pcs',
        material: materialA,
      },
    ]

    const targetBatches = 100
    const inventoryMap = { 'mat-1': 5000 } // Total dibutuhkan = 30 * 100 = 3000 pcs, stok = 5000 pcs

    // 1. Max Batch = floor(5000 / 30) = 166 batch
    const { maxBatches } = calculateMaterialBatches(inventoryMap, bomItems)
    assert.equal(maxBatches, 166, 'Max batch harus 166 batch')

    // 2. Total Kebutuhan = 3000 pcs
    const requirements = calculateRequirements(targetBatches, bomItems)
    assert.equal(requirements['mat-1'], 3000)

    // 3. Kekurangan = 0 (Stok 5000 >= 3000)
    const shortages = calculateShortages(inventoryMap, requirements, bomItems)
    assert.equal(shortages.length, 0, 'Tidak ada kekurangan bahan')

    // 4. Status Target: 166 >= 100 -> Terpenuhi (true)
    const targetFulfilled = maxBatches >= targetBatches
    assert.equal(targetFulfilled, true, 'Status target harus TERPENUHI')
  })
})
