import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeForInput,
  validateNumeric,
  parseNumericValue,
  onNumericChange,
  onNumericBlur,
  MAX_MONETARY,
} from '../lib/numberInput.js'

// ─── sanitizeForInput ────────────────────────────────────────

describe('sanitizeForInput', () => {
  // Scenario 1: Normal number
  it('preserves normal number', () => {
    assert.equal(sanitizeForInput('1000000'), '1000000')
  })

  // Scenario 2: Decimal
  it('preserves decimal number', () => {
    assert.equal(sanitizeForInput('1000000.50'), '1000000.50')
  })

  // Scenario 3: Empty while editing
  it('returns empty string for empty input', () => {
    assert.equal(sanitizeForInput(''), '')
    assert.equal(sanitizeForInput(null), '')
    assert.equal(sanitizeForInput(undefined), '')
  })

  // Scenario 4: Above maximum — raw input preserved (no clamping)
  it('does NOT clamp above-max values during typing', () => {
    assert.equal(sanitizeForInput('10000000000000'), '10000000000000')
    assert.equal(sanitizeForInput('9'.repeat(40)), '9'.repeat(40))
  })

  // Scenario 5: Extremely long input
  it('preserves extremely long digit strings', () => {
    const long = '1'.repeat(100)
    assert.equal(sanitizeForInput(long), long)
  })

  // Scenario 6: Negative if prohibited — minus stripped
  it('strips minus sign', () => {
    assert.equal(sanitizeForInput('-5000'), '5000')
    assert.equal(sanitizeForInput('-0.5'), '0.5')
  })

  // Scenario 7: NaN — non-numeric chars stripped
  it('strips non-numeric characters', () => {
    assert.equal(sanitizeForInput('abc'), '')
    assert.equal(sanitizeForInput('Rp10.000'), '10.000')
    assert.equal(sanitizeForInput('1,000,000'), '1000000')
  })

  // Scenario 8: Infinity — scientific notation rejected
  it('rejects scientific notation', () => {
    assert.equal(sanitizeForInput('1e20'), '')
    assert.equal(sanitizeForInput('1E10'), '')
    assert.equal(sanitizeForInput('1.5e3'), '')
  })

  // Scenario 9: Editing existing value
  it('allows editing existing value', () => {
    // User has "1000000" and types "0" to make "10000000"
    assert.equal(sanitizeForInput('10000000'), '10000000')
  })

  // Scenario 10: Delete all digits
  it('allows deleting all digits', () => {
    assert.equal(sanitizeForInput(''), '')
  })

  // Edge cases
  it('prevents multiple decimal points', () => {
    assert.equal(sanitizeForInput('10.5.25'), '10.525')
  })

  it('preserves leading zero during typing', () => {
    assert.equal(sanitizeForInput('0'), '0')
    assert.equal(sanitizeForInput('0.'), '0.')
    assert.equal(sanitizeForInput('0.5'), '0.5')
  })

  it('preserves trailing decimal point', () => {
    assert.equal(sanitizeForInput('100.'), '100.')
  })

  it('strips whitespace', () => {
    assert.equal(sanitizeForInput(' 1000 '), '1000')
  })
})

// ─── validateNumeric ─────────────────────────────────────────

describe('validateNumeric', () => {
  it('valid normal value', () => {
    const r = validateNumeric('1000000')
    assert.equal(r.valid, true)
    assert.equal(r.error, null)
  })

  it('valid decimal value', () => {
    const r = validateNumeric('1000000.50')
    assert.equal(r.valid, true)
  })

  it('empty string is valid (not yet filled)', () => {
    const r = validateNumeric('')
    assert.equal(r.valid, true)
  })

  it('above max produces error — input NOT changed', () => {
    const r = validateNumeric('10000000000000')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('maksimum'))
    // Original value is NOT returned as clamped
    assert.notEqual(r.error, String(MAX_MONETARY))
  })

  it('NaN produces error', () => {
    const r = validateNumeric('abc')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('tidak valid'))
  })

  it('Infinity produces error', () => {
    const r = validateNumeric('Infinity')
    assert.equal(r.valid, false)
  })

  it('negative below minValue produces error', () => {
    const r = validateNumeric('-5', { minValue: 0 })
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('kurang dari'))
  })

  it('custom maxValue respected', () => {
    const r = validateNumeric('100', { maxValue: 50 })
    assert.equal(r.valid, false)
  })

  it('value at exact max is valid', () => {
    const r = validateNumeric('9999999999999.99', { maxValue: MAX_MONETARY })
    assert.equal(r.valid, true)
  })

  it('scientific notation rejected', () => {
    const r = validateNumeric('1e20')
    assert.equal(r.valid, false)
  })

  it('negative rejected when minValue is 0', () => {
    const r = validateNumeric('-1')
    assert.equal(r.valid, false)
  })
})

// ─── parseNumericValue ───────────────────────────────────────

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

  it('null/undefined returns 0', () => {
    assert.equal(parseNumericValue(null), 0)
    assert.equal(parseNumericValue(undefined), 0)
  })

  it('invalid returns 0', () => {
    assert.equal(parseNumericValue('abc'), 0)
  })

  it('parses large valid number', () => {
    assert.equal(parseNumericValue('999999999999'), 999999999999)
  })

  it('preserves decimal precision for reasonable values', () => {
    assert.equal(parseNumericValue('1234.56'), 1234.56)
  })
})

// ─── onNumericChange handler ─────────────────────────────────

describe('onNumericChange', () => {
  it('calls setField with sanitized value', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericChange('price', setField)

    handler({ target: { value: '1000' } })
    assert.deepEqual(captured, { field: 'price', val: '1000' })
  })

  it('strips non-numeric chars on change', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericChange('price', setField)

    handler({ target: { value: 'Rp10.000' } })
    assert.equal(captured.val, '10.000')
  })

  it('does NOT clamp large values on change', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericChange('price', setField)

    handler({ target: { value: '10000000000000' } })
    assert.equal(captured.val, '10000000000000')
  })

  it('empty input returns empty', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericChange('price', setField)

    handler({ target: { value: '' } })
    assert.equal(captured.val, '')
  })
})

// ─── onNumericBlur handler ───────────────────────────────────

describe('onNumericBlur', () => {
  it('clamps above-max on blur', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericBlur('price', setField)

    handler({ target: { value: '10000000000000' } })
    assert.equal(captured.val, String(MAX_MONETARY))
  })

  it('does not change valid value on blur', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericBlur('price', setField)

    handler({ target: { value: '1000' } })
    assert.equal(captured, null) // setField not called
  })

  it('clears empty string on blur', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericBlur('price', setField)

    handler({ target: { value: '' } })
    // Empty string is kept as-is (not forced to 0)
    assert.equal(captured.val, '')
  })

  it('clears invalid value on blur', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericBlur('price', setField)

    handler({ target: { value: 'abc' } })
    assert.equal(captured.val, '')
  })

  it('clears lone dot on blur', () => {
    let captured = null
    const setField = (field, val) => { captured = { field, val } }
    const handler = onNumericBlur('price', setField)

    handler({ target: { value: '.' } })
    assert.equal(captured.val, '')
  })
})

// ─── Visual overflow regression ──────────────────────────────

describe('numeric input overflow behavior', () => {
  it('sanitizeForInput preserves 40-digit number for scroll display', () => {
    const huge = '1'.repeat(40)
    const result = sanitizeForInput(huge)
    assert.equal(result, huge)
    // Input should hold the full value for horizontal scrolling
    assert.equal(result.length, 40)
  })

  it('sanitizeForInput preserves 50-digit number', () => {
    const huge = '9'.repeat(50)
    assert.equal(sanitizeForInput(huge), huge)
  })

  it('validateNumeric rejects above-max but preserves error message', () => {
    const huge = '1'.repeat(40)
    const r = validateNumeric(huge)
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('maksimum'))
  })
})
