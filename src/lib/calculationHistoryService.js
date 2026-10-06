/**
 * calculationHistoryService.js
 * Authoritative, idempotent calculation history saving with database-level duplicate prevention.
 */

import {
  extractCanonicalInputs,
  computeCalculationFingerprint,
  isDuplicateKeyViolation,
} from './calculationFingerprint.js'

export const SUCCESS_HISTORY_MESSAGE = 'History telah disimpan'

/**
 * Idempotently saves a calculation to the database.
 * If identical calculation was already saved, prevents duplicate row insertion
 * and returns idempotent success with SUCCESS_HISTORY_MESSAGE.
 *
 * @param {object} supabase - Supabase client instance
 * @param {object} options
 * @param {string} options.table - Target table name (e.g. 'margin_analyses')
 * @param {string} options.toolType - Tool identifier (e.g. 'margin_analysis')
 * @param {string} options.businessId - Current tenant business ID
 * @param {object} options.payload - Raw payload to be saved
 * @param {Array} [options.existingHistory] - Current in-memory history list for client-side pre-check
 * @returns {Promise<{ success: boolean, isDuplicate: boolean, message: string, record?: object, error?: any }>}
 */
export async function saveCalculationHistory(supabase, {
  table,
  toolType,
  businessId,
  payload,
  existingHistory = [],
}) {
  if (!supabase) {
    throw new Error('Supabase client is required.')
  }
  if (!table || !toolType || !businessId) {
    throw new Error('Table, toolType, and businessId are required.')
  }

  // 1. Extract canonical inputs and generate deterministic fingerprint
  const canonicalInputs = extractCanonicalInputs(toolType, payload)
  const fingerprint = computeCalculationFingerprint(toolType, canonicalInputs)

  // 2. Client-side idempotent pre-check against existing history
  if (Array.isArray(existingHistory) && existingHistory.length > 0) {
    const existingMatch = existingHistory.find((item) => {
      if (!item) return false
      // Match by fingerprint if present on item
      if (item.fingerprint && item.fingerprint === fingerprint) return true
      // Match by canonical inputs comparison
      const itemCanonical = extractCanonicalInputs(toolType, item)
      const itemFingerprint = computeCalculationFingerprint(toolType, itemCanonical)
      return itemFingerprint === fingerprint
    })

    if (existingMatch) {
      return {
        success: true,
        isDuplicate: true,
        message: SUCCESS_HISTORY_MESSAGE,
        record: existingMatch,
      }
    }
  }

  // 3. Prepare payload with tenant isolation & fingerprint
  const payloadToInsert = {
    ...payload,
    business_id: businessId,
    fingerprint,
  }

  // 4. Authoritative Database Insertion
  const { data, error } = await supabase
    .from(table)
    .insert(payloadToInsert)
    .select()

  if (error) {
    // 4A. Check for database unique constraint / index violation
    if (isDuplicateKeyViolation(error)) {
      return {
        success: true,
        isDuplicate: true,
        message: SUCCESS_HISTORY_MESSAGE,
      }
    }

    // 4B. Graceful fallback if migration 112 column not yet added to remote cache
    const errMsg = (error.message || '').toLowerCase()
    const errCode = error.code || ''
    if (errCode === '42703' || errCode === 'PGRST204' || errMsg.includes('fingerprint')) {
      const stripped = { ...payloadToInsert }
      delete stripped.fingerprint
      const fallbackResult = await supabase.from(table).insert(stripped).select()
      if (fallbackResult.error) {
        if (isDuplicateKeyViolation(fallbackResult.error)) {
          return {
            success: true,
            isDuplicate: true,
            message: SUCCESS_HISTORY_MESSAGE,
          }
        }
        return {
          success: false,
          error: fallbackResult.error,
        }
      }
      return {
        success: true,
        isDuplicate: false,
        message: SUCCESS_HISTORY_MESSAGE,
        record: Array.isArray(fallbackResult.data) ? fallbackResult.data[0] : fallbackResult.data,
      }
    }

    // 4C. Genuine database error (RLS, FK, NOT NULL, etc.) — never swallowed
    return {
      success: false,
      error,
    }
  }

  const savedRecord = Array.isArray(data) ? data[0] : data
  return {
    success: true,
    isDuplicate: false,
    message: SUCCESS_HISTORY_MESSAGE,
    record: savedRecord,
  }
}
