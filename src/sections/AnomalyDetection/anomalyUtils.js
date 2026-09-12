/**
 * Anomaly Detection — Statistical Utilities
 *
 * Pure functions for robust statistical analysis.
 * Uses Median + MAD (Median Absolute Deviation) for outlier detection.
 * No AI, no LLM, no randomness.
 */

// ─── Constants ────────────────────────────────────────────────

export const ANOMALY_THRESHOLDS = {
  attention: 1.5,
  critical: 3,
}

export const MAD_ZERO_THRESHOLDS = {
  attention: 50,   // percentage
  critical: 100,   // percentage
}

export const SEVERITY = {
  NORMAL: 'normal',
  ATTENTION: 'attention',
  CRITICAL: 'critical',
}

export const DIRECTION = {
  INCREASE: 'increase',
  DECREASE: 'decrease',
}

export const CONFIDENCE = {
  TINGGI: 'Tinggi',
  SEDANG: 'Sedang',
  TERBATAS: 'Terbatas',
}

export const MIN_HISTORY_DAYS = 14
export const MIN_HISTORY_TRANSACTIONS = 20
export const MIN_TRANSACTION_BASELINE = 10
export const MAX_WEEKDAY_LOOKBACK = 8
export const PREFER_WEEKDAY_LOOKBACK = 4

// ─── Median ───────────────────────────────────────────────────

/**
 * Calculate median of a numeric array.
 * @param {number[]} values - non-empty array of numbers
 * @returns {number} median
 */
export function calculateMedian(values) {
  if (!Array.isArray(values) || values.length === 0) return 0

  const sorted = values
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b)

  if (sorted.length === 0) return 0

  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * Calculate MAD (Median Absolute Deviation).
 * @param {number[]} values
 * @param {number} median - pre-computed median (optional)
 * @returns {number} MAD
 */
export function calculateMAD(values, median) {
  if (!Array.isArray(values) || values.length === 0) return 0

  const med = median !== undefined ? median : calculateMedian(values)

  const deviations = values
    .filter(v => Number.isFinite(v))
    .map(v => Math.abs(v - med))
    .sort((a, b) => a - b)

  if (deviations.length === 0) return 0

  const mid = Math.floor(deviations.length / 2)
  if (deviations.length % 2 === 0) {
    return (deviations[mid - 1] + deviations[mid]) / 2
  }
  return deviations[mid]
}

/**
 * Calculate robust score: |value - median| / MAD.
 * If MAD = 0, returns null (caller must handle with percentage fallback).
 * @param {number} value
 * @param {number} median
 * @param {number} mad
 * @returns {number|null}
 */
export function calculateRobustScore(value, median, mad) {
  if (!Number.isFinite(value) || !Number.isFinite(median)) return null
  if (mad === 0) return null
  return Math.abs(value - median) / mad
}

/**
 * Calculate percentage difference when MAD = 0.
 * @param {number} currentValue
 * @param {number} median
 * @returns {number} percentage (0-100+)
 */
export function calculatePercentageDifference(currentValue, median) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(median)) return 0
  const denominator = Math.max(Math.abs(median), 1)
  return Math.round((Math.abs(currentValue - median) / denominator) * 10000) / 100
}

/**
 * Classify severity based on robust score or percentage difference.
 * @param {number|null} robustScore
 * @param {number} percentageDiff - used when MAD = 0
 * @param {boolean} madZero - whether MAD was zero
 * @returns {string} severity constant
 */
export function classifySeverity(robustScore, percentageDiff = 0, madZero = false) {
  if (madZero) {
    if (percentageDiff >= MAD_ZERO_THRESHOLDS.critical) return SEVERITY.CRITICAL
    if (percentageDiff >= MAD_ZERO_THRESHOLDS.attention) return SEVERITY.ATTENTION
    return SEVERITY.NORMAL
  }

  if (robustScore === null) return SEVERITY.NORMAL
  if (robustScore >= ANOMALY_THRESHOLDS.critical) return SEVERITY.CRITICAL
  if (robustScore >= ANOMALY_THRESHOLDS.attention) return SEVERITY.ATTENTION
  return SEVERITY.NORMAL
}

/**
 * Determine direction of change.
 * @param {number} currentValue
 * @param {number} median
 * @returns {string} direction constant
 */
export function classifyDirection(currentValue, median) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(median)) return DIRECTION.INCREASE
  return currentValue >= median ? DIRECTION.INCREASE : DIRECTION.DECREASE
}

/**
 * Classify confidence based on sample size.
 * @param {number} sampleSize
 * @returns {string} confidence label
 */
export function classifyConfidence(sampleSize) {
  if (sampleSize >= 8) return CONFIDENCE.TINGGI
  if (sampleSize >= 5) return CONFIDENCE.SEDANG
  return CONFIDENCE.TERBATAS
}

/**
 * Get day of week name in Indonesian.
 * @param {string|Date} date
 * @returns {string}
 */
export function getWeekdayName(date) {
  const d = new Date(date)
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return days[d.getDay()]
}

/**
 * Get day of week index (0 = Sunday).
 * @param {string|Date} date
 * @returns {number}
 */
export function getWeekdayIndex(date) {
  return new Date(date).getDay()
}
