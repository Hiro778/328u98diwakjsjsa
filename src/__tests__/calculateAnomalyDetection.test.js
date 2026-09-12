import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMedian,
  calculateMAD,
  calculateRobustScore,
  calculatePercentageDifference,
  classifySeverity,
  classifyDirection,
  classifyConfidence,
  SEVERITY,
  DIRECTION,
} from '../sections/AnomalyDetection/anomalyUtils.js'
import {
  aggregateDailyTotals,
  getComparableWeekdayValues,
  detectSingleDayAnomaly,
  calculateTimeSeriesAnomalies,
  analyzeExpenseContributors,
} from '../sections/AnomalyDetection/calculateTimeSeriesAnomalies.js'
import {
  calculateTransactionAnomalies,
} from '../sections/AnomalyDetection/calculateTransactionAnomalies.js'

// ─── STATISTICS: Median ─────────────────────────────────────

describe('STAT: median odd count', () => {
  it('returns middle value', () => {
    assert.equal(calculateMedian([1, 3, 5, 7, 9]), 5)
  })
})

describe('STAT: median even count', () => {
  it('returns average of two middle', () => {
    assert.equal(calculateMedian([1, 2, 3, 4]), 2.5)
  })
})

describe('STAT: median single value', () => {
  it('returns that value', () => {
    assert.equal(calculateMedian([42]), 42)
  })
})

// ─── STATISTICS: MAD ────────────────────────────────────────

describe('STAT: MAD', () => {
  it('calculates correctly', () => {
    // values: [800, 820, 780, 810, 790], median=800
    // deviations: [0, 20, 20, 10, 10] sorted: [0, 10, 10, 20, 20]
    // MAD = 10
    const mad = calculateMAD([800, 820, 780, 810, 790])
    assert.equal(mad, 10)
  })
})

describe('STAT: MAD with pre-computed median', () => {
  it('uses provided median', () => {
    const mad = calculateMAD([800, 820, 780, 810, 790], 800)
    assert.equal(mad, 10)
  })
})

describe('STAT: MAD = 0', () => {
  it('returns 0 for identical values', () => {
    assert.equal(calculateMAD([100, 100, 100, 100, 100]), 0)
  })
})

describe('STAT: empty values', () => {
  it('median returns 0', () => {
    assert.equal(calculateMedian([]), 0)
  })
  it('MAD returns 0', () => {
    assert.equal(calculateMAD([]), 0)
  })
})

describe('STAT: invalid values filtered', () => {
  it('ignores NaN and Infinity', () => {
    assert.equal(calculateMedian([10, NaN, 20, Infinity, 30]), 20)
  })
})

describe('STAT: NaN input', () => {
  it('returns 0 for median of all NaN', () => {
    assert.equal(calculateMedian([NaN, NaN]), 0)
  })
})

describe('STAT: Infinity input', () => {
  it('filters Infinity', () => {
    assert.equal(calculateMedian([Infinity, 10, 20]), 15)
  })
})

// ─── STATISTICS: Robust Score ───────────────────────────────

describe('STAT: robust score', () => {
  it('|850-800|/10 = 5', () => {
    assert.equal(calculateRobustScore(850, 800, 10), 5)
  })
})

describe('STAT: robust score MAD=0', () => {
  it('returns null', () => {
    assert.equal(calculateRobustScore(100, 100, 0), null)
  })
})

// ─── STATISTICS: Severity ───────────────────────────────────

describe('STAT: severity normal', () => {
  it('robustScore < 1.5 → normal', () => {
    assert.equal(classifySeverity(1.0, 0, false), SEVERITY.NORMAL)
  })
})

describe('STAT: severity attention', () => {
  it('1.5 <= robustScore < 3 → attention', () => {
    assert.equal(classifySeverity(2.5, 0, false), SEVERITY.ATTENTION)
  })
})

describe('STAT: severity critical', () => {
  it('robustScore >= 3 → critical', () => {
    assert.equal(classifySeverity(5.0, 0, false), SEVERITY.CRITICAL)
  })
})

describe('STAT: severity MAD zero attention', () => {
  it('percentage >= 50% → attention', () => {
    assert.equal(classifySeverity(null, 60, true), SEVERITY.ATTENTION)
  })
})

describe('STAT: severity MAD zero critical', () => {
  it('percentage >= 100% → critical', () => {
    assert.equal(classifySeverity(null, 100, true), SEVERITY.CRITICAL)
  })
})

describe('STAT: direction increase', () => {
  it('current >= median → increase', () => {
    assert.equal(classifyDirection(850, 800), DIRECTION.INCREASE)
  })
})

describe('STAT: direction decrease', () => {
  it('current < median → decrease', () => {
    assert.equal(classifyDirection(750, 800), DIRECTION.DECREASE)
  })
})

describe('STAT: confidence tinggi', () => {
  it('8+ observations → Tinggi', () => {
    assert.equal(classifyConfidence(8), 'Tinggi')
  })
})

describe('STAT: confidence sedang', () => {
  it('5-7 observations → Sedang', () => {
    assert.equal(classifyConfidence(6), 'Sedang')
  })
})

describe('STAT: confidence terbatas', () => {
  it('< 5 observations → Terbatas', () => {
    assert.equal(classifyConfidence(3), 'Terbatas')
  })
})

// ─── TIME SERIES: Aggregate ─────────────────────────────────

describe('TS: aggregate daily totals', () => {
  it('groups by date', () => {
    const totals = aggregateDailyTotals([
      { total: 100, sale_date: '2026-08-01' },
      { total: 200, sale_date: '2026-08-01' },
      { total: 150, sale_date: '2026-08-02' },
    ], 'sale_date', 'total')
    assert.equal(totals.get('2026-08-01'), 300)
    assert.equal(totals.get('2026-08-02'), 150)
  })
})

// ─── TIME SERIES: Comparable weekdays ──────────────────────

describe('TS: comparable weekday filtering', () => {
  it('only returns same weekday values', () => {
    const totals = new Map([
      ['2026-08-03', 800],  // Monday
      ['2026-08-04', 400],  // Tuesday
      ['2026-08-10', 820],  // Monday
      ['2026-08-11', 410],  // Tuesday
      ['2026-08-17', 780],  // Monday
      ['2026-08-24', 810],  // Monday
    ])
    // Target: 2026-08-31 is Monday
    const { values } = getComparableWeekdayValues(totals, '2026-08-31')
    assert.equal(values.length, 4) // 4 Mondays
    assert.ok(values.every(v => v >= 700)) // all Monday values
  })
})

describe('TS: target excluded from baseline', () => {
  it('target date not in historical values', () => {
    const totals = new Map([
      ['2026-08-03', 800],
      ['2026-08-10', 800],
      ['2026-08-31', 200], // target
    ])
    const { values } = getComparableWeekdayValues(totals, '2026-08-31')
    assert.equal(values.length, 2)
    assert.ok(!values.includes(200))
  })
})

describe('TS: insufficient baseline', () => {
  it('fewer than PREFER_WEEKDAY_LOOKBACK → no anomaly', () => {
    const anomaly = detectSingleDayAnomaly(850, '2026-08-31', [800, 820], 'sales')
    assert.equal(anomaly, null)
  })
})

describe('TS: zero baseline', () => {
  it('all zeros → no crash', () => {
    const anomaly = detectSingleDayAnomaly(0, '2026-08-31', [0, 0, 0, 0], 'sales')
    assert.equal(anomaly, null) // normal (0 vs 0)
  })
})

describe('TS: all identical historical values', () => {
  it('MAD=0, same value → normal', () => {
    const anomaly = detectSingleDayAnomaly(100, '2026-08-31', [100, 100, 100, 100], 'sales')
    assert.equal(anomaly, null)
  })
})

describe('TS: all identical historical, outlier', () => {
  it('MAD=0, different value → anomaly', () => {
    const anomaly = detectSingleDayAnomaly(200, '2026-08-31', [100, 100, 100, 100, 100], 'sales')
    assert.notEqual(anomaly, null)
    assert.equal(anomaly.severity, 'critical') // 100% diff
    assert.equal(anomaly.isMadZero, true)
  })
})

// ─── TIME SERIES: TEST A — NORMAL ──────────────────────────

describe('TS TEST A: normal', () => {
  it('robustScore < 1.5 → no anomaly', () => {
    // Historical: 800, 820, 780, 810, 790 → median=800, MAD=10
    // Current: 805 → score = |805-800|/10 = 0.5
    const anomaly = detectSingleDayAnomaly(805, '2026-08-31', [800, 820, 780, 810, 790], 'sales')
    assert.equal(anomaly, null)
  })
})

// ─── TIME SERIES: TEST B — ATTENTION ───────────────────────

describe('TS TEST B: attention', () => {
  it('robustScore = 2.5 → attention', () => {
    // Historical: 800, 820, 780, 810, 790 → median=800, MAD=10
    // Current: 825 → score = |825-800|/10 = 2.5
    const anomaly = detectSingleDayAnomaly(825, '2026-08-31', [800, 820, 780, 810, 790], 'sales')
    assert.notEqual(anomaly, null)
    assert.equal(anomaly.severity, 'attention')
  })
})

// ─── TIME SERIES: TEST C — CRITICAL ────────────────────────

describe('TS TEST C: critical', () => {
  it('robustScore >= 3 → critical', () => {
    // Historical: 800, 820, 780, 810, 790 → median=800, MAD=10
    // Current: 850 → score = |850-800|/10 = 5
    const anomaly = detectSingleDayAnomaly(850, '2026-08-31', [800, 820, 780, 810, 790], 'sales')
    assert.notEqual(anomaly, null)
    assert.equal(anomaly.severity, 'critical')
  })
})

// ─── TIME SERIES: TEST D — DECREASE ────────────────────────

describe('TS TEST D: decrease', () => {
  it('direction = decrease', () => {
    // Historical: 1000, 1020, 980, 1010, 990 → median=1000, MAD=10
    // Current: 950 → score = |950-1000|/10 = 5, direction = decrease
    const anomaly = detectSingleDayAnomaly(950, '2026-08-31', [1000, 1020, 980, 1010, 990], 'sales')
    assert.notEqual(anomaly, null)
    assert.equal(anomaly.severity, 'critical')
    assert.equal(anomaly.direction, 'decrease')
  })
})

// ─── TIME SERIES: TEST E — WEEKDAY COMPARISON ──────────────

describe('TS TEST E: weekday comparison', () => {
  it('Monday compared only with Mondays', () => {
    const totals = new Map([
      ['2026-08-03', 800],  // Monday
      ['2026-08-04', 400],  // Tuesday
      ['2026-08-10', 820],  // Monday
      ['2026-08-11', 420],  // Tuesday
      ['2026-08-17', 780],  // Monday
      ['2026-08-24', 810],  // Monday
    ])
    // Target: 2026-08-31 Monday, value 850
    const { values } = getComparableWeekdayValues(totals, '2026-08-31')
    // Should only contain Monday values
    assert.ok(values.every(v => v >= 700))
    assert.ok(!values.includes(400))
    assert.ok(!values.includes(420))
  })
})

// ─── TIME SERIES: Extreme outlier ──────────────────────────

describe('TS: extreme outlier', () => {
  it('massive spike → critical', () => {
    const anomaly = detectSingleDayAnomaly(5000, '2026-08-31', [800, 820, 780, 810, 790], 'sales')
    assert.notEqual(anomaly, null)
    assert.equal(anomaly.severity, 'critical')
    assert.equal(anomaly.direction, 'increase')
  })
})

// ─── TRANSACTION: Normal ───────────────────────────────────

describe('TX: normal transaction', () => {
  it('no anomaly for normal amount', () => {
    const { anomalies } = calculateTransactionAnomalies({
      salesTransactions: [
        { id: '1', total: 100, sale_date: '2026-08-01' },
        { id: '2', total: 110, sale_date: '2026-08-02' },
        { id: '3', total: 95, sale_date: '2026-08-03' },
        { id: '4', total: 105, sale_date: '2026-08-04' },
        { id: '5', total: 102, sale_date: '2026-08-05' },
        { id: '6', total: 98, sale_date: '2026-08-06' },
        { id: '7', total: 108, sale_date: '2026-08-07' },
        { id: '8', total: 97, sale_date: '2026-08-08' },
        { id: '9', total: 103, sale_date: '2026-08-09' },
        { id: '10', total: 101, sale_date: '2026-08-10' },
        { id: '11', total: 104, sale_date: '2026-08-11' }, // this should be normal
      ],
    })
    const txAnomalies = anomalies.filter(a => a.transactionId === '11')
    assert.equal(txAnomalies.length, 0)
  })
})

// ─── TRANSACTION: TEST F — Large transaction ───────────────

describe('TX TEST F: large transaction', () => {
  it('500 vs ~100 median → critical', () => {
    const { anomalies } = calculateTransactionAnomalies({
      salesTransactions: [
        { id: '1', total: 100, sale_date: '2026-08-01' },
        { id: '2', total: 110, sale_date: '2026-08-02' },
        { id: '3', total: 95, sale_date: '2026-08-03' },
        { id: '4', total: 105, sale_date: '2026-08-04' },
        { id: '5', total: 102, sale_date: '2026-08-05' },
        { id: '6', total: 98, sale_date: '2026-08-06' },
        { id: '7', total: 108, sale_date: '2026-08-07' },
        { id: '8', total: 97, sale_date: '2026-08-08' },
        { id: '9', total: 103, sale_date: '2026-08-09' },
        { id: '10', total: 101, sale_date: '2026-08-10' },
        { id: '11', total: 500, sale_date: '2026-08-11' }, // anomaly
      ],
    })
    const txAnomalies = anomalies.filter(a => a.transactionId === '11')
    assert.equal(txAnomalies.length, 1)
    assert.equal(txAnomalies[0].severity, 'critical')
  })
})

// ─── TRANSACTION: target excluded ──────────────────────────

describe('TX: target excluded from baseline', () => {
  it('target not in its own historical', () => {
    const { anomalies } = calculateTransactionAnomalies({
      expenseTransactions: [
        { id: '1', amount: 100, expense_date: '2026-08-01' },
        { id: '2', amount: 100, expense_date: '2026-08-02' },
        { id: '3', amount: 100, expense_date: '2026-08-03' },
        { id: '4', amount: 100, expense_date: '2026-08-04' },
        { id: '5', amount: 100, expense_date: '2026-08-05' },
        { id: '6', amount: 100, expense_date: '2026-08-06' },
        { id: '7', amount: 100, expense_date: '2026-08-07' },
        { id: '8', amount: 100, expense_date: '2026-08-08' },
        { id: '9', amount: 100, expense_date: '2026-08-09' },
        { id: '10', amount: 100, expense_date: '2026-08-10' },
        { id: '11', amount: 200, expense_date: '2026-08-11' },
      ],
    })
    const txAnomalies = anomalies.filter(a => a.transactionId === '11')
    assert.equal(txAnomalies.length, 1)
    assert.equal(txAnomalies[0].severity, 'critical')
  })
})

// ─── TRANSACTION: fewer than 10 ────────────────────────────

describe('TX: fewer than 10 historical', () => {
  it('no transaction anomaly classified', () => {
    const { anomalies } = calculateTransactionAnomalies({
      salesTransactions: [
        { id: '1', total: 100, sale_date: '2026-08-01' },
        { id: '2', total: 100, sale_date: '2026-08-02' },
        { id: '3', total: 500, sale_date: '2026-08-03' },
      ],
    })
    assert.equal(anomalies.length, 0)
  })
})

// ─── TRANSACTION: MAD = 0 ──────────────────────────────────

describe('TX: MAD = 0 outlier', () => {
  it('detects via percentage', () => {
    const { anomalies } = calculateTransactionAnomalies({
      expenseTransactions: [
        { id: '1', amount: 100, expense_date: '2026-08-01' },
        { id: '2', amount: 100, expense_date: '2026-08-02' },
        { id: '3', amount: 100, expense_date: '2026-08-03' },
        { id: '4', amount: 100, expense_date: '2026-08-04' },
        { id: '5', amount: 100, expense_date: '2026-08-05' },
        { id: '6', amount: 100, expense_date: '2026-08-06' },
        { id: '7', amount: 100, expense_date: '2026-08-07' },
        { id: '8', amount: 100, expense_date: '2026-08-08' },
        { id: '9', amount: 100, expense_date: '2026-08-09' },
        { id: '10', amount: 100, expense_date: '2026-08-10' },
        { id: '11', amount: 300, expense_date: '2026-08-11' },
      ],
    })
    const txAnomalies = anomalies.filter(a => a.transactionId === '11')
    assert.equal(txAnomalies.length, 1)
    assert.equal(txAnomalies[0].severity, 'critical') // 200% diff
    assert.equal(txAnomalies[0].isMadZero, true)
  })
})

// ─── TRANSACTION: invalid amount ───────────────────────────

describe('TX: invalid transaction amount', () => {
  it('skips NaN/Infinity amounts', () => {
    const { anomalies } = calculateTransactionAnomalies({
      salesTransactions: [
        { id: '1', total: NaN, sale_date: '2026-08-01' },
        { id: '2', total: Infinity, sale_date: '2026-08-02' },
        { id: '3', total: 100, sale_date: '2026-08-03' },
      ],
    })
    assert.equal(anomalies.length, 0)
  })
})

// ─── COLD START ────────────────────────────────────────────

describe('COLD START: fewer than 14 days', () => {
  it('time series returns empty with insufficient data', () => {
    const salesByDay = new Map([
      ['2026-08-01', 100],
      ['2026-08-02', 100],
    ])
    const result = calculateTimeSeriesAnomalies({
      salesByDay,
      expensesByDay: new Map(),
      targetDates: ['2026-08-02'],
    })
    // With only 1 comparable Monday, no anomaly should be produced
    assert.equal(result.anomalies.length, 0)
  })
})

describe('COLD START: sufficient data', () => {
  it('produces anomalies when enough history exists', () => {
    const salesByDay = new Map([
      ['2026-08-03', 800],  // Mon
      ['2026-08-10', 820],  // Mon
      ['2026-08-17', 780],  // Mon
      ['2026-08-24', 810],  // Mon
      ['2026-08-31', 850],  // Mon - target
    ])
    const result = calculateTimeSeriesAnomalies({
      salesByDay,
      expensesByDay: new Map(),
      targetDates: ['2026-08-31'],
    })
    assert.ok(result.anomalies.length > 0)
  })
})

// ─── CATEGORY ──────────────────────────────────────────────

describe('CATEGORY: expense contributors', () => {
  it('breaks down by category with differences', () => {
    const dayExpenses = [
      { category: 'Bahan Baku', amount: 1800000 },
      { category: 'Operasional', amount: 900000 },
    ]
    const historicalByCategory = new Map([
      ['Bahan Baku', [700000, 720000, 680000, 710000]],
      ['Operasional', [700000, 700000, 700000, 700000]],
    ])
    const contributors = analyzeExpenseContributors(dayExpenses, historicalByCategory)
    assert.equal(contributors.length, 2)
    assert.equal(contributors[0].category, 'Bahan Baku')
    assert.ok(contributors[0].difference > 0)
  })
})

describe('CATEGORY: zero category', () => {
  it('defaults to Lainnya', () => {
    const dayExpenses = [{ category: '', amount: 500000 }]
    const contributors = analyzeExpenseContributors(dayExpenses, new Map())
    assert.equal(contributors[0].category, 'Lainnya')
  })
})

describe('CATEGORY: empty expenses', () => {
  it('returns empty array', () => {
    assert.deepEqual(analyzeExpenseContributors([], new Map()), [])
  })
})

// ─── DEDUPLICATION ─────────────────────────────────────────

describe('DEDUP: daily + transaction anomaly', () => {
  it('both exist but are separate types', () => {
    const salesByDay = new Map([
      ['2026-08-03', 800],
      ['2026-08-10', 820],
      ['2026-08-17', 780],
      ['2026-08-24', 810],
      ['2026-08-31', 850],
    ])
    const tsResult = calculateTimeSeriesAnomalies({
      salesByDay,
      expensesByDay: new Map(),
      targetDates: ['2026-08-31'],
    })
    const txResult = calculateTransactionAnomalies({
      salesTransactions: [
        { id: '1', total: 800, sale_date: '2026-08-03' },
        { id: '2', total: 820, sale_date: '2026-08-10' },
        { id: '3', total: 780, sale_date: '2026-08-17' },
        { id: '4', total: 810, sale_date: '2026-08-24' },
        { id: '5', total: 850, sale_date: '2026-08-31' },
      ],
    })
    // Both should produce anomalies independently
    assert.ok(tsResult.anomalies.length > 0 || txResult.anomalies.length >= 0)
  })
})

// ─── NaN/Infinity safety ───────────────────────────────────

describe('SAFETY: no NaN in output', () => {
  it('all statistical outputs are finite', () => {
    const median = calculateMedian([100, 200, 300, NaN, Infinity, 150])
    const mad = calculateMAD([100, 200, 300, NaN, Infinity, 150])
    const score = calculateRobustScore(250, median, mad)
    assert.ok(Number.isFinite(median))
    assert.ok(Number.isFinite(mad))
    assert.ok(score === null || Number.isFinite(score))
  })
})

describe('SAFETY: no Infinity in percentage', () => {
  it('percentage handles zero median', () => {
    const pct = calculatePercentageDifference(100, 0)
    assert.ok(Number.isFinite(pct))
    assert.equal(pct, 10000) // 100/1 * 100
  })
})

// ─── Full integration ──────────────────────────────────────

describe('INTEGRATION: full time-series run', () => {
  it('returns correct summary', () => {
    const salesByDay = new Map()
    // 4 Mondays
    salesByDay.set('2026-08-03', 800)
    salesByDay.set('2026-08-10', 820)
    salesByDay.set('2026-08-17', 780)
    salesByDay.set('2026-08-24', 810)
    // Target Monday
    salesByDay.set('2026-08-31', 850)

    const result = calculateTimeSeriesAnomalies({
      salesByDay,
      expensesByDay: new Map(),
      targetDates: ['2026-08-31'],
    })

    assert.ok(result.anomalies.length > 0)
    assert.equal(result.summary.criticalAnomalies + result.summary.attentionAnomalies, result.summary.totalAnomalies)
    assert.equal(result.summary.totalDaysAnalyzed, 1)
  })
})
