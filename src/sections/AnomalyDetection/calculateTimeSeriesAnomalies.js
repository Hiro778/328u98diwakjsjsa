/**
 * Time-Series Anomaly Detection Engine
 *
 * Detects unusual aggregate daily values (sales revenue, expense totals)
 * by comparing against comparable weekday historical baselines.
 *
 * Uses Median + MAD for robust outlier detection.
 * No AI, no external APIs, no randomness.
 */

import {
  calculateMedian,
  calculateMAD,
  calculateRobustScore,
  calculatePercentageDifference,
  classifySeverity,
  classifyDirection,
  classifyConfidence,
  getWeekdayName,
  getWeekdayIndex,
  MAX_WEEKDAY_LOOKBACK,
  PREFER_WEEKDAY_LOOKBACK,
  SEVERITY,
} from './anomalyUtils.js'

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Aggregate daily totals from transactions.
 *
 * @param {Array} transactions - [{ total, sale_date }] or [{ amount, expense_date }]
 * @param {string} dateField - 'sale_date' or 'expense_date'
 * @param {string} valueField - 'total' or 'amount'
 * @returns {Map<string, number>} date → daily total
 */
export function aggregateDailyTotals(transactions, dateField, valueField) {
  const map = new Map()
  if (!Array.isArray(transactions)) return map

  for (const tx of transactions) {
    const dateStr = String(tx[dateField] || '').slice(0, 10)
    if (!dateStr) continue
    const val = Number(tx[valueField]) || 0
    if (!Number.isFinite(val)) continue
    map.set(dateStr, (map.get(dateStr) || 0) + val)
  }

  return map
}

/**
 * Get comparable weekday historical values for a target date.
 *
 * @param {Map<string, number>} dailyTotals - date → total
 * @param {string} targetDate - YYYY-MM-DD
 * @param {number} maxLookback - max historical comparable days to consider
 * @returns {{ values: number[], dates: string[] }}
 */
export function getComparableWeekdayValues(dailyTotals, targetDate, maxLookback = MAX_WEEKDAY_LOOKBACK) {
  const targetWeekday = getWeekdayIndex(targetDate)
  const values = []
  const dates = []

  // Sort all dates, filter to same weekday, exclude target
  const allDates = Array.from(dailyTotals.keys()).sort()

  for (const date of allDates) {
    if (date === targetDate) continue
    if (getWeekdayIndex(date) !== targetWeekday) continue
    values.push(dailyTotals.get(date))
    dates.push(date)
  }

  // Take the most recent N comparable days
  const recentValues = values.slice(-maxLookback)
  const recentDates = dates.slice(-maxLookback)

  return { values: recentValues, dates: recentDates }
}

/**
 * Detect anomalies for a single target day.
 *
 * @param {number} currentValue - the day's total
 * @param {string} targetDate - YYYY-MM-DD
 * @param {number[]} historicalValues - comparable weekday values
 * @param {string} metric - 'sales' or 'expenses'
 * @returns {Object|null} anomaly or null if normal
 */
export function detectSingleDayAnomaly(currentValue, targetDate, historicalValues, metric) {
  if (!Number.isFinite(currentValue)) return null
  if (historicalValues.length < PREFER_WEEKDAY_LOOKBACK) return null

  const median = calculateMedian(historicalValues)
  const mad = calculateMAD(historicalValues, median)
  const robustScore = calculateRobustScore(currentValue, median, mad)

  const isMadZero = mad === 0
  const actualPercentageDiff = calculatePercentageDifference(currentValue, median)
  const severity = classifySeverity(robustScore, actualPercentageDiff, isMadZero)

  if (severity === SEVERITY.NORMAL) return null

  const direction = classifyDirection(currentValue, median)
  const confidence = classifyConfidence(historicalValues.length)
  const difference = round2(currentValue - median)

  const weekdayName = getWeekdayName(targetDate)

  const metricLabel = metric === 'sales' ? 'Penjualan' : 'Pengeluaran'
  const dirLabel = direction === 'increase' ? 'meningkat' : 'turun'

  return {
    type: 'time_series',
    metric,
    date: targetDate,
    severity,
    direction,
    currentValue: round2(currentValue),
    baselineMedian: round2(median),
    mad: round2(mad),
    difference,
    percentageDifference: actualPercentageDiff,
    robustScore: isMadZero ? null : round2(robustScore),
    confidence,
    isMadZero,
    explanation: `${metricLabel} hari ${weekdayName} ${dirLabel} tidak biasa: Rp${Math.round(currentValue).toLocaleString('id-ID')} dibanding median Rp${Math.round(median).toLocaleString('id-ID')} pada ${weekdayName} sebelumnya.`,
  }
}

/**
 * Run time-series anomaly detection across a date range.
 *
 * @param {Object} input
 * @param {Map<string, number>} input.salesByDay - date → sales total
 * @param {Map<string, number>} input.expensesByDay - date → expense total
 * @param {string[]} input.targetDates - dates to analyze (YYYY-MM-DD)
 * @returns {Object} { anomalies: [], summary: {} }
 */
export function calculateTimeSeriesAnomalies({ salesByDay, expensesByDay, targetDates }) {
  const anomalies = []
  let normalDays = 0

  for (const date of targetDates) {
    // Sales anomaly
    const salesValue = salesByDay?.get(date) || 0
    if (salesValue > 0) {
      const { values } = getComparableWeekdayValues(salesByDay || new Map(), date)
      const anomaly = detectSingleDayAnomaly(salesValue, date, values, 'sales')
      if (anomaly) {
        anomalies.push(anomaly)
      } else {
        normalDays++
      }
    }

    // Expense anomaly
    const expenseValue = expensesByDay?.get(date) || 0
    if (expenseValue > 0) {
      const { values } = getComparableWeekdayValues(expensesByDay || new Map(), date)
      const anomaly = detectSingleDayAnomaly(expenseValue, date, values, 'expenses')
      if (anomaly) {
        anomalies.push(anomaly)
      } else {
        normalDays++
      }
    }

    // If neither sales nor expenses had data for this day
    if (salesValue === 0 && expenseValue === 0) {
      normalDays++
    }
  }

  // Sort by date descending, then severity
  const severityOrder = { critical: 0, attention: 1 }
  anomalies.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  })

  return {
    anomalies,
    summary: {
      totalAnomalies: anomalies.length,
      criticalAnomalies: anomalies.filter(a => a.severity === 'critical').length,
      attentionAnomalies: anomalies.filter(a => a.severity === 'attention').length,
      normalDays,
      totalDaysAnalyzed: targetDates.length,
    },
  }
}

/**
 * Analyze expense category contributors for a specific day.
 *
 * @param {Array} dayExpenses - expenses for the target day [{ category, amount }]
 * @param {Map<string, number[]>} historicalByCategory - category → [historical amounts]
 * @returns {Array} [{ category, amount, median, difference, percentContribution }]
 */
export function analyzeExpenseContributors(dayExpenses, historicalByCategory) {
  if (!Array.isArray(dayExpenses) || dayExpenses.length === 0) return []

  // Aggregate day expenses by category
  const dayByCategory = {}
  for (const exp of dayExpenses) {
    const cat = exp.category || 'Lainnya'
    dayByCategory[cat] = (dayByCategory[cat] || 0) + (Number(exp.amount) || 0)
  }

  const totalDayExpense = Object.values(dayByCategory).reduce((s, v) => s + v, 0)

  const contributors = []
  for (const [category, amount] of Object.entries(dayByCategory)) {
    const historical = historicalByCategory?.get(category) || []
    const median = historical.length > 0 ? calculateMedian(historical) : 0
    const difference = amount - median

    contributors.push({
      category,
      amount: round2(amount),
      median: round2(median),
      difference: round2(difference),
      percentContribution: totalDayExpense > 0 ? round2((amount / totalDayExpense) * 100) : 0,
    })
  }

  // Sort by absolute difference descending (biggest contributors first)
  contributors.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  return contributors
}
