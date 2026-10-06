/**
 * calculationHistoryDeduplication.test.js
 * Comprehensive unit and integration regression tests for global calculation history deduplication.
 * Verifies Tests A through J per system requirements.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalize,
  canonicalStringify,
  extractCanonicalInputs,
  computeCalculationFingerprint,
  isDuplicateKeyViolation,
} from '../lib/calculationFingerprint.js'
import {
  saveCalculationHistory,
  SUCCESS_HISTORY_MESSAGE,
} from '../lib/calculationHistoryService.js'

describe('Calculation History Deduplication Engine', () => {

  describe('Canonicalization & Deterministic Fingerprints', () => {
    it('generates identical fingerprint regardless of key ordering', () => {
      const inputA = {
        product_name: 'Kopi Susu',
        cost_per_unit: 10000,
        selling_price: 15000,
        analysis_mode: 'price',
      }
      const inputB = {
        analysis_mode: 'price',
        selling_price: 15000,
        cost_per_unit: 10000,
        product_name: 'Kopi Susu',
      }

      const fpA = computeCalculationFingerprint('margin_analysis', inputA)
      const fpB = computeCalculationFingerprint('margin_analysis', inputB)

      assert.equal(fpA, fpB, 'Fingerprint must be deterministic regardless of object key order')
    })

    it('normalizes insignificant whitespace and numeric representations', () => {
      const input1 = {
        product_name: '  Kopi Susu Gula Aren  ',
        cost_per_unit: 10000.0,
        quantity: '2',
      }
      const input2 = {
        product_name: 'Kopi Susu Gula Aren',
        cost_per_unit: 10000,
        quantity: 2,
      }

      const fp1 = computeCalculationFingerprint('margin_analysis', input1)
      const fp2 = computeCalculationFingerprint('margin_analysis', input2)

      assert.equal(fp1, fp2, 'Whitespace and numeric representation should be equivalent')
    })

    it('ignores volatile metadata like timestamps, ids, and notes in fingerprint calculation', () => {
      const payload1 = {
        id: 'uuid-1',
        created_at: '2026-10-06T10:00:00Z',
        updated_at: '2026-10-06T10:00:00Z',
        notes: 'Catatan batch pagi',
        product_name: 'Roti Bakar',
        cost_per_unit: 8000,
        gross_selling_price: 12000,
      }
      const payload2 = {
        id: 'uuid-2',
        created_at: '2026-10-06T14:30:00Z',
        updated_at: '2026-10-06T14:30:00Z',
        notes: 'Catatan batch sore',
        product_name: 'Roti Bakar',
        cost_per_unit: 8000,
        gross_selling_price: 12000,
      }

      const canonical1 = extractCanonicalInputs('margin_analysis', payload1)
      const canonical2 = extractCanonicalInputs('margin_analysis', payload2)

      const fp1 = computeCalculationFingerprint('margin_analysis', canonical1)
      const fp2 = computeCalculationFingerprint('margin_analysis', canonical2)

      assert.equal(fp1, fp2, 'Metadata such as notes or created_at must not change calculation fingerprint')
    })

    it('TEST G: Different tool with same input produces distinct fingerprints', () => {
      const input = {
        product_name: 'Produk A',
        selling_price_per_unit: 20000,
      }
      const fpMargin = computeCalculationFingerprint('margin_analysis', input)
      const fpBep = computeCalculationFingerprint('bep_calculation', input)

      assert.notEqual(fpMargin, fpBep, 'Different tool types must produce different fingerprints')
    })

    it('TEST H: Same tool with genuinely different inputs produces different fingerprints', () => {
      const inputA = {
        product_name: 'Produk A',
        cost_per_unit: 5000,
        gross_selling_price: 10000,
      }
      const inputB = {
        product_name: 'Produk A',
        cost_per_unit: 6000, // Different cost
        gross_selling_price: 10000,
      }

      const canonicalA = extractCanonicalInputs('margin_analysis', inputA)
      const canonicalB = extractCanonicalInputs('margin_analysis', inputB)

      const fpA = computeCalculationFingerprint('margin_analysis', canonicalA)
      const fpB = computeCalculationFingerprint('margin_analysis', canonicalB)

      assert.notEqual(fpA, fpB, 'Genuinely different inputs must produce different fingerprints')
    })
  })

  describe('Mock Supabase Client & Deduplication Workflow', () => {
    let mockDb
    let mockSupabase

    beforeEach(() => {
      mockDb = {
        margin_analyses: [],
        hpp_calculations: [],
        bep_calculations: [],
      }

      mockSupabase = {
        from: (table) => {
          return {
            insert: (row) => {
              const execute = () => {
                const rows = Array.isArray(row) ? row : [row]
                for (const r of rows) {
                  // Check unique constraint on (business_id, fingerprint)
                  if (r.business_id && r.fingerprint) {
                    const existing = mockDb[table]?.find(
                      (item) => item.business_id === r.business_id && item.fingerprint === r.fingerprint
                    )
                    if (existing) {
                      return {
                        data: null,
                        error: {
                          code: '23505',
                          message: `duplicate key value violates unique constraint "${table}_business_fingerprint_idx"`,
                          details: `Key (business_id, fingerprint)=(${r.business_id}, ${r.fingerprint}) already exists.`,
                        },
                      }
                    }
                  }
                  const saved = { id: `id-${Date.now()}-${Math.random()}`, ...r }
                  mockDb[table].push(saved)
                }
                return {
                  data: rows,
                  error: null,
                }
              }

              return {
                select: () => Promise.resolve(execute()),
                then: (resolve, reject) => Promise.resolve(execute()).then(resolve, reject),
              }
            },
            select: () => {
              return {
                single: () => Promise.resolve({ data: mockDb[table][0] || null, error: null }),
              }
            },
          }
        },
      }
    })

    it('TEST A: Save data X creates exactly 1 row', async () => {
      const dataX = {
        product_name: 'Item X',
        cost_per_unit: 10000,
        gross_selling_price: 15000,
        quantity: 1,
      }

      const result = await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: dataX,
      })

      assert.equal(result.success, true)
      assert.equal(result.isDuplicate, false)
      assert.equal(result.message, SUCCESS_HISTORY_MESSAGE)
      assert.equal(mockDb.margin_analyses.length, 1)
    })

    it('TEST B: Save data X again returns idempotent success without creating a new row', async () => {
      const dataX = {
        product_name: 'Item X',
        cost_per_unit: 10000,
        gross_selling_price: 15000,
        quantity: 1,
      }

      // Save 1
      await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: dataX,
        existingHistory: mockDb.margin_analyses,
      })
      assert.equal(mockDb.margin_analyses.length, 1)

      // Save 2 with exact same data
      const result2 = await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: dataX,
        existingHistory: mockDb.margin_analyses,
      })

      assert.equal(result2.success, true)
      assert.equal(result2.isDuplicate, true)
      assert.equal(result2.message, SUCCESS_HISTORY_MESSAGE)
      assert.equal(mockDb.margin_analyses.length, 1, 'Database must still have exactly 1 row')
    })

    it('TEST C: Save data Y creates a second row (total 2 rows)', async () => {
      const dataX = { product_name: 'Item X', cost_per_unit: 10000, gross_selling_price: 15000 }
      const dataY = { product_name: 'Item Y', cost_per_unit: 20000, gross_selling_price: 30000 }

      await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: dataX,
        existingHistory: mockDb.margin_analyses,
      })

      await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: dataY,
        existingHistory: mockDb.margin_analyses,
      })

      assert.equal(mockDb.margin_analyses.length, 2, 'Genuinely different data must result in 2 rows')
    })

    it('TEST D: Save data X three times results in exactly 1 row', async () => {
      const dataX = { product_name: 'Item X', cost_per_unit: 10000, gross_selling_price: 15000 }

      for (let i = 0; i < 3; i++) {
        const res = await saveCalculationHistory(mockSupabase, {
          table: 'margin_analyses',
          toolType: 'margin_analysis',
          businessId: 'biz-1',
          payload: dataX,
          existingHistory: mockDb.margin_analyses,
        })
        assert.equal(res.success, true)
        assert.equal(res.message, SUCCESS_HISTORY_MESSAGE)
      }

      assert.equal(mockDb.margin_analyses.length, 1, 'Saving 3 times must still yield exactly 1 row')
    })

    it('TEST E: Business A and Business B saving data X do not collide (tenant isolation)', async () => {
      const dataX = { product_name: 'Item Shared Name', cost_per_unit: 10000, gross_selling_price: 15000 }

      const resA = await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-A',
        payload: dataX,
        existingHistory: [],
      })

      const resB = await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-B',
        payload: dataX,
        existingHistory: [],
      })

      assert.equal(resA.success, true)
      assert.equal(resA.isDuplicate, false)
      assert.equal(resB.success, true)
      assert.equal(resB.isDuplicate, false)

      const bizARows = mockDb.margin_analyses.filter((r) => r.business_id === 'biz-A')
      const bizBRows = mockDb.margin_analyses.filter((r) => r.business_id === 'biz-B')

      assert.equal(bizARows.length, 1, 'Business A must have 1 row')
      assert.equal(bizBRows.length, 1, 'Business B must have 1 row')
    })

    it('TEST F: Concurrent save X + X at the exact same time results in only 1 row', async () => {
      const dataX = { product_name: 'Item Race', cost_per_unit: 10000, gross_selling_price: 15000 }

      // Fire both requests concurrently without pre-existing history in memory
      const [res1, res2] = await Promise.all([
        saveCalculationHistory(mockSupabase, {
          table: 'margin_analyses',
          toolType: 'margin_analysis',
          businessId: 'biz-1',
          payload: dataX,
          existingHistory: [],
        }),
        saveCalculationHistory(mockSupabase, {
          table: 'margin_analyses',
          toolType: 'margin_analysis',
          businessId: 'biz-1',
          payload: dataX,
          existingHistory: [],
        }),
      ])

      assert.equal(res1.success, true)
      assert.equal(res2.success, true)
      assert.equal(mockDb.margin_analyses.length, 1, 'Only 1 row must exist after concurrent save')
      assert.ok(
        (res1.isDuplicate && !res2.isDuplicate) || (!res1.isDuplicate && res2.isDuplicate),
        'One request must be marked duplicate, the other fresh insert'
      )
    })

    it('TEST I: Existing history with null fingerprint is not damaged or deleted', async () => {
      mockDb.margin_analyses.push({
        id: 'legacy-id-1',
        business_id: 'biz-1',
        product_name: 'Legacy Product',
        cost_per_unit: 5000,
        fingerprint: null, // Legacy row without fingerprint
      })

      const freshData = { product_name: 'New Product', cost_per_unit: 7000 }
      await saveCalculationHistory(mockSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: freshData,
        existingHistory: mockDb.margin_analyses,
      })

      assert.equal(mockDb.margin_analyses.length, 2)
      assert.equal(mockDb.margin_analyses[0].id, 'legacy-id-1')
      assert.equal(mockDb.margin_analyses[0].fingerprint, null, 'Legacy row untouched')
    })

    it('TEST J: Non-duplicate errors are never swallowed and returned properly', async () => {
      const errorSupabase = {
        from: () => ({
          insert: () => ({
            select: () =>
              Promise.resolve({
                data: null,
                error: { code: '42501', message: 'permission denied for table margin_analyses' },
              }),
          }),
        }),
      }

      const res = await saveCalculationHistory(errorSupabase, {
        table: 'margin_analyses',
        toolType: 'margin_analysis',
        businessId: 'biz-1',
        payload: { product_name: 'Forbidden' },
      })

      assert.equal(res.success, false)
      assert.equal(res.error?.code, '42501')
    })
  })
})
