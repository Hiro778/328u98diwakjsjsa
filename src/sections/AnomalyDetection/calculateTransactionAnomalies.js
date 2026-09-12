/**
 * Transaction-Level Anomaly Detection Engine
 *
 * Detects unusually large or small individual transactions
 * by comparing against historical transaction amounts.
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
  MIN_TRANSACTION_BASELINE,
  SEVERITY,
} from './anomalyUtils.js'

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Detect transaction-level anomalies.
 *
 * For each transaction, compare against historical transactions of the same type
 * that occurred BEFORE the target transaction.
 *
 * @param {Object} input
 * @param {Array} input.salesTransactions - [{ id, total, sale_date }] sorted by date asc
 * @param {Array} input.expenseTransactions - [{ id, amount, expense_date, category }] sorted by date asc
 * @param {number} input.maxHistory - max historical transactions to use (default 30)
 * @returns {Object} { anomalies: [], summary: {} }
 */
export function calculateTransactionAnomalies({
  salesTransactions = [],
  expenseTransactions = [],
  maxHistory = 30,
} = {}) {
  const anomalies = []

  // ── Sales transactions ──
  const sortedSales = [...salesTransactions]
    .filter(t => Number.isFinite(Number(t.total)) && Number(t.total) > 0)
    .sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)))

  for (let i = 0; i < sortedSales.length; i++) {
    const tx = sortedSales[i]
    const txAmount = Number(tx.total)

    // Historical: previous transactions of same type
    const historical = sortedSales
      .slice(Math.max(0, i - maxHistory), i)
      .map(t => Number(t.total))
      .filter(v => Number.isFinite(v) && v > 0)

    if (historical.length < MIN_TRANSACTION_BASELINE) continue

    const median = calculateMedian(historical)
    const mad = calculateMAD(historical, median)
    const robustScore = calculateRobustScore(txAmount, median, mad)

    const isMadZero = mad === 0
    const actualPercentageDiff = calculatePercentageDifference(txAmount, median)
    const severity = classifySeverity(robustScore, actualPercentageDiff, isMadZero)

    if (severity === SEVERITY.NORMAL) continue

    const direction = classifyDirection(txAmount, median)
    const confidence = classifyConfidence(historical.length)
    const difference = round2(txAmount - median)

    anomalies.push({
      type: 'transaction',
      metric: 'sales',
      transactionId: tx.id,
      date: String(tx.sale_date || '').slice(0, 10),
      severity,
      direction,
      currentValue: round2(txAmount),
      baselineMedian: round2(median),
      mad: round2(mad),
      difference,
      percentageDifference: actualPercentageDiff,
      robustScore: isMadZero ? null : round2(robustScore),
      confidence,
      isMadZero,
      explanation: `Transaksi penjualan Rp${Math.round(txAmount).toLocaleString('id-ID')} jauh berbeda dari pola transaksi sebelumnya dengan median Rp${Math.round(median).toLocaleString('id-ID')}.`,
    })
  }

  // ── Expense transactions ──
  const sortedExpenses = [...expenseTransactions]
    .filter(t => Number.isFinite(Number(t.amount)) && Number(t.amount) > 0)
    .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)))

  for (let i = 0; i < sortedExpenses.length; i++) {
    const tx = sortedExpenses[i]
    const txAmount = Number(tx.amount)

    // Historical: previous transactions of same type
    const historical = sortedExpenses
      .slice(Math.max(0, i - maxHistory), i)
      .map(t => Number(t.amount))
      .filter(v => Number.isFinite(v) && v > 0)

    if (historical.length < MIN_TRANSACTION_BASELINE) continue

    const median = calculateMedian(historical)
    const mad = calculateMAD(historical, median)
    const robustScore = calculateRobustScore(txAmount, median, mad)

    const isMadZero = mad === 0
    const actualPercentageDiff = calculatePercentageDifference(txAmount, median)
    const severity = classifySeverity(robustScore, actualPercentageDiff, isMadZero)

    if (severity === SEVERITY.NORMAL) continue

    const direction = classifyDirection(txAmount, median)
    const confidence = classifyConfidence(historical.length)
    const difference = round2(txAmount - median)

    anomalies.push({
      type: 'transaction',
      metric: 'expenses',
      transactionId: tx.id,
      date: String(tx.expense_date || '').slice(0, 10),
      severity,
      direction,
      currentValue: round2(txAmount),
      baselineMedian: round2(median),
      mad: round2(mad),
      difference,
      percentageDifference: actualPercentageDiff,
      robustScore: isMadZero ? null : round2(robustScore),
      confidence,
      isMadZero,
      category: tx.category || '',
      explanation: `Transaksi pengeluaran Rp${Math.round(txAmount).toLocaleString('id-ID')} jauh berbeda dari pola transaksi sebelumnya dengan median Rp${Math.round(median).toLocaleString('id-ID')}.`,
    })
  }

  // Sort by date desc, then severity
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
    },
  }
}
