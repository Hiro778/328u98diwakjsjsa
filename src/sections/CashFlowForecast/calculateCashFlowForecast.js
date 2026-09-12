/**
 * Cash Flow Forecast Calculation Engine
 *
 * Pure function — no side effects, no Supabase calls.
 * Projects cash positions over weekly or monthly periods.
 */

const MAX_MONETARY = 9_999_999_999_999.99
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Supported forecast periods and their period counts.
 */
export const FORECAST_PERIODS = {
  '4_weeks':  { label: '4 Minggu',  periods: 4,  type: 'weekly' },
  '8_weeks':  { label: '8 Minggu',  periods: 8,  type: 'weekly' },
  '12_weeks': { label: '12 Minggu', periods: 12, type: 'weekly' },
  '3_months': { label: '3 Bulan',   periods: 3,  type: 'monthly' },
  '6_months': { label: '6 Bulan',   periods: 6,  type: 'monthly' },
  '12_months':{ label: '12 Bulan',  periods: 12, type: 'monthly' },
}

export const FREQUENCIES = {
  one_time: 'Sekali',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
}

/**
 * Generate period labels for a given forecast config.
 */
function generatePeriodLabels(forecastPeriodKey) {
  const config = FORECAST_PERIODS[forecastPeriodKey]
  if (!config) return []

  const labels = []
  for (let i = 1; i <= config.periods; i++) {
    if (config.type === 'weekly') {
      labels.push(`Minggu ${i}`)
    } else {
      labels.push(`Bulan ${i}`)
    }
  }
  return labels
}

/**
 * Check if a transaction applies to a given period number.
 *
 * @param {Object} transaction
 * @param {string} transaction.frequency - 'one_time' | 'weekly' | 'monthly'
 * @param {number} transaction.startPeriod - 1-based period number (inclusive)
 * @param {number|null} transaction.endPeriod - 1-based period number (inclusive), null = no end
 * @param {number} periodNumber - current period (1-based)
 * @param {string} periodType - 'weekly' | 'monthly'
 */
function transactionApplies(transaction, periodNumber, periodType) {
  const { frequency, startPeriod, endPeriod } = transaction
  const start = Number(startPeriod) || 1
  const end = endPeriod != null ? Number(endPeriod) : Infinity

  if (periodNumber < start) return false
  if (periodNumber > end) return false

  if (frequency === 'one_time') {
    return periodNumber === start
  }

  if (frequency === 'weekly' && periodType === 'weekly') {
    return true
  }

  if (frequency === 'monthly' && periodType === 'monthly') {
    return true
  }

  // Cross-frequency: weekly items in monthly forecast → apply every month
  if (frequency === 'weekly' && periodType === 'monthly') {
    return true
  }

  // Monthly items in weekly forecast → apply to first week of each month group
  if (frequency === 'monthly' && periodType === 'weekly') {
    return true
  }

  return false
}

/**
 * Calculate cash flow forecast.
 *
 * @param {Object} input
 * @param {number} input.openingCash - starting cash balance
 * @param {string} input.forecastPeriod - key from FORECAST_PERIODS
 * @param {Array}  input.inflows - [{ name, amount, frequency, startPeriod, endPeriod }]
 * @param {Array}  input.outflows - [{ name, amount, frequency, startPeriod, endPeriod, category }]
 *
 * @returns {Object} result
 */
export function calculateCashFlowForecast(input) {
  const {
    openingCash = 0,
    forecastPeriod = '3_months',
    inflows = [],
    outflows = [],
  } = input || {}

  const rawOpening = Number(openingCash)
  const opening = Number.isFinite(rawOpening) ? rawOpening : NaN
  const errors = []

  // ── Validation ──
  if (!Number.isFinite(opening)) {
    errors.push('Saldo kas saat ini tidak valid')
  } else if (opening < 0) {
    errors.push('Saldo kas saat ini tidak boleh negatif')
  }
  if (opening > MAX_MONETARY) {
    errors.push('Nilai terlalu besar. Maksimal Rp 9.999.999.999.999,99.')
  }

  const config = FORECAST_PERIODS[forecastPeriod]
  if (!config) {
    errors.push('Periode forecast tidak valid')
  }

  // Validate transactions
  const allItems = [
    ...inflows.map(t => ({ ...t, direction: 'inflow' })),
    ...outflows.map(t => ({ ...t, direction: 'outflow' })),
  ]

  for (const item of allItems) {
    const rawAmt = Number(item.amount)
    const amt = Number.isFinite(rawAmt) ? rawAmt : NaN
    if (!Number.isFinite(amt) || amt < 0) {
      errors.push(`Jumlah "${item.name || 'tanpa nama'}" tidak valid`)
    }
    if (amt > MAX_MONETARY) {
      errors.push(`Nilai "${item.name || 'tanpa nama'}" terlalu besar`)
    }
    if (!['one_time', 'weekly', 'monthly'].includes(item.frequency)) {
      errors.push(`Frekuensi "${item.frequency}" tidak valid`)
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      totalInflows: 0,
      totalOutflows: 0,
      netCashFlow: 0,
      openingCash: opening,
      closingCash: opening,
      minimumCashBalance: opening,
      maximumCashBalance: opening,
      shortfallDetected: false,
      shortfallAmount: 0,
      periods: [],
      periodType: config?.type || 'monthly',
    }
  }

  // ── Calculate periods ──
  const periodCount = config.periods
  const periodType = config.type
  const labels = generatePeriodLabels(forecastPeriod)

  let currentBalance = opening
  let totalInflows = 0
  let totalOutflows = 0
  let minBalance = opening
  let maxBalance = opening
  let shortfallDetected = false
  let shortfallAmount = 0

  const periods = []

  for (let i = 0; i < periodCount; i++) {
    const periodNumber = i + 1
    const periodOpening = currentBalance

    // Sum inflows for this period
    let periodInflows = 0
    for (const item of inflows) {
      if (transactionApplies(item, periodNumber, periodType)) {
        periodInflows += Number(item.amount) || 0
      }
    }

    // Sum outflows for this period
    let periodOutflows = 0
    for (const item of outflows) {
      if (transactionApplies(item, periodNumber, periodType)) {
        periodOutflows += Number(item.amount) || 0
      }
    }

    const periodNet = periodInflows - periodOutflows
    const periodClosing = periodOpening + periodNet

    currentBalance = periodClosing
    totalInflows += periodInflows
    totalOutflows += periodOutflows

    if (periodClosing < minBalance) minBalance = periodClosing
    if (periodClosing > maxBalance) maxBalance = periodClosing

    if (periodClosing < 0 && !shortfallDetected) {
      shortfallDetected = true
    }
    if (periodClosing < 0 && Math.abs(periodClosing) > Math.abs(shortfallAmount)) {
      shortfallAmount = Math.abs(periodClosing)
    }

    periods.push({
      periodNumber,
      periodLabel: labels[i] || `Periode ${periodNumber}`,
      openingBalance: round2(periodOpening),
      totalInflows: round2(periodInflows),
      totalOutflows: round2(periodOutflows),
      netCashFlow: round2(periodNet),
      closingBalance: round2(periodClosing),
    })
  }

  return {
    isValid: true,
    errors: [],
    totalInflows: round2(totalInflows),
    totalOutflows: round2(totalOutflows),
    netCashFlow: round2(totalInflows - totalOutflows),
    openingCash: round2(opening),
    closingCash: round2(currentBalance),
    minimumCashBalance: round2(minBalance),
    maximumCashBalance: round2(maxBalance),
    shortfallDetected,
    shortfallAmount: round2(shortfallAmount),
    periods,
    periodType,
  }
}
