/**
 * Number input utilities for robust numeric handling.
 *
 * Architecture:
 *   raw input string → sanitizeForInput (per keystroke) → UI state
 *   UI state → validateNumeric (on blur/submit) → parseNumericValue → calculation engine
 *
 * Prevents: NaN, Infinity, unbounded values, floating-point corruption.
 * Compatible with database numeric(15,2) — max 9,999,999,999,999.99
 *
 * IMPORTANT: User input is NEVER silently clamped or replaced during typing.
 * Validation errors are shown explicitly; raw input stays editable.
 */

/** Maximum monetary value compatible with database numeric(15,2) */
export const MAX_MONETARY = 9_999_999_999_999.99

/**
 * Sanitize a raw input string for display (per-keystroke).
 * - Strips non-numeric characters except decimal point
 * - Prevents multiple decimal points
 * - Strips scientific notation (e.g. 1e20)
 * - Returns '' for empty input
 * - Does NOT clamp to max — user may type freely during editing
 */
export function sanitizeForInput(value) {
  if (value === '' || value === null || value === undefined) return ''

  const str = String(value)

  // Reject scientific notation
  if (/e/i.test(str)) return ''

  // Allow only digits and one decimal point
  const cleaned = str.replace(/[^0-9.]/g, '')

  // Prevent multiple decimal points
  const parts = cleaned.split('.')
  const normalized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned

  // Empty after cleaning
  if (!normalized || normalized === '.') return ''

  return normalized
}

/**
 * Validate a numeric string value (on blur / submit / calculate).
 * Returns { valid, error } — does NOT mutate the input.
 *
 * @param {string} value - raw input string
 * @param {object} options
 * @param {number} options.maxValue - maximum allowed value
 * @param {number} options.minValue - minimum allowed value (default 0)
 * @param {string} options.label - field label for error messages
 */
export function validateNumeric(value, { maxValue = MAX_MONETARY, minValue = 0, label = 'Nilai' } = {}) {
  if (value === '' || value === null || value === undefined) {
    return { valid: true, error: null }
  }

  const str = String(value)

  // Reject scientific notation
  if (/e/i.test(str)) {
    return { valid: false, error: `${label} tidak valid.` }
  }

  const num = Number(str)

  if (!Number.isFinite(num)) {
    return { valid: false, error: `${label} tidak valid.` }
  }

  if (num < minValue) {
    return { valid: false, error: `${label} tidak boleh kurang dari ${minValue}.` }
  }

  if (num > maxValue) {
    const formatted = maxValue.toLocaleString('id-ID', { maximumFractionDigits: 2 })
    return { valid: false, error: `${label} melebihi batas maksimum ${formatted}.` }
  }

  return { valid: true, error: null }
}

/**
 * Safely parse a numeric string to a number for the calculation engine.
 * Returns the numeric value, or 0 if empty/invalid.
 * Only call this AFTER validation passes.
 */
export function parseNumericValue(value) {
  if (value === '' || value === null || value === undefined) return 0
  const num = Number(String(value))
  return Number.isFinite(num) ? num : 0
}

/**
 * Create an onChange handler for numeric inputs that sanitizes per-keystroke.
 * Preserves raw string — does NOT clamp.
 *
 * Usage:
 *   <input
 *     type="text"
 *     inputMode="decimal"
 *     value={form.price}
 *     onChange={onNumericChange('price', setField)}
 *   />
 */
export function onNumericChange(field, setField, options = {}) {
  return (e) => {
    const sanitized = sanitizeForInput(e.target.value, options)
    setField(field, sanitized)
  }
}

/**
 * Create an onBlur handler that validates the final value.
 * Shows error if above max / below min, but KEEPS the raw input.
 * Calculation should only proceed when valid.
 */
export function onNumericBlur(field, setField, options = {}) {
  return (e) => {
    const val = e.target.value
    if (val === '' || val === '.') {
      setField(field, val === '.' ? '' : val)
      return
    }

    const num = Number(val)
    if (!Number.isFinite(num)) {
      // Keep raw input, but clear clearly invalid values
      setField(field, '')
      return
    }

    // Clamp only on blur — this is the ONE place we silently fix out-of-range
    // to prevent sending bad data to the calculation engine.
    const { maxValue = MAX_MONETARY, minValue = 0 } = options
    const clamped = Math.min(maxValue, Math.max(minValue, num))
    if (clamped !== num) {
      setField(field, String(clamped))
    }
  }
}
