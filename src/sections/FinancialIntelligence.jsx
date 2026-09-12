import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const periods = [
  { label: '30 hari', value: 30 },
  { label: '60 hari', value: 60 },
  { label: '90 hari', value: 90 },
]

const data = {
  30: [
    { day: 1, revenue: 2.1, expenses: 1.4, profit: 0.7, cash: 28.5 },
    { day: 6, revenue: 2.4, expenses: 1.5, profit: 0.9, cash: 27.8 },
    { day: 11, revenue: 1.8, expenses: 1.6, profit: 0.2, cash: 26.9 },
    { day: 16, revenue: 2.8, expenses: 1.5, profit: 1.3, cash: 27.2 },
    { day: 21, revenue: 3.1, expenses: 1.8, profit: 1.3, cash: 28.1 },
    { day: 26, revenue: 2.6, expenses: 1.5, profit: 1.1, cash: 29.0 },
    { day: 30, revenue: 3.0, expenses: 1.7, profit: 1.3, cash: 29.8 },
  ],
  60: [
    { day: 1, revenue: 2.0, expenses: 1.3, profit: 0.7, cash: 28.5 },
    { day: 11, revenue: 2.5, expenses: 1.5, profit: 1.0, cash: 27.6 },
    { day: 21, revenue: 1.9, expenses: 1.7, profit: 0.2, cash: 26.4 },
    { day: 31, revenue: 2.9, expenses: 1.5, profit: 1.4, cash: 25.8 },
    { day: 41, revenue: 2.3, expenses: 1.8, profit: 0.5, cash: 24.9 },
    { day: 51, revenue: 2.1, expenses: 1.6, profit: 0.5, cash: 24.1 },
    { day: 60, revenue: 2.8, expenses: 1.7, profit: 1.1, cash: 23.4 },
  ],
  90: [
    { day: 1, revenue: 2.0, expenses: 1.2, profit: 0.8, cash: 28.5 },
    { day: 16, revenue: 2.6, expenses: 1.5, profit: 1.1, cash: 27.2 },
    { day: 31, revenue: 1.8, expenses: 1.7, profit: 0.1, cash: 25.6 },
    { day: 46, revenue: 2.4, expenses: 1.9, profit: 0.5, cash: 23.8 },
    { day: 61, revenue: 2.1, expenses: 1.8, profit: 0.3, cash: 21.9 },
    { day: 76, revenue: 2.0, expenses: 1.9, profit: 0.1, cash: 20.1 },
    { day: 90, revenue: 2.5, expenses: 1.8, profit: 0.7, cash: 18.4 },
  ],
}

const insights = {
  30: 'Pola pengeluaran dalam 30 hari masih sehat. Revenue konsisten di atas Rp2M per periode.',
  60: 'Kalau pola pengeluaran sekarang berlanjut, cash reserve diperkirakan turun 18% dalam 60 hari.',
  90: 'Tren cash flow menurun dalam 90 hari. Pertimbangkan untuk optimasi biaya atau tambah revenue stream.',
}

const metrics = [
  { label: 'Revenue', color: '#F5A623' },
  { label: 'Expenses', color: '#818CF8' },
  { label: 'Profit', color: '#10B981' },
]

function Chart({ period }) {
  const points = data[period]
  const maxVal = 4

  const width = 600
  const height = 260
  const padL = 40
  const padR = 20
  const padT = 16
  const padB = 28
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const toX = (i) => padL + (i / (points.length - 1)) * chartW
  const toY = (v) => padT + chartH - (v / maxVal) * chartH

  const lines = ['revenue', 'expenses', 'profit'].map((key) => {
    const pts = points.map((p, i) => `${toX(i)},${toY(p[key])}`).join(' ')
    return { key, pts, color: metrics.find((m) => m.label.toLowerCase() === key).color }
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-label={`Chart revenue expenses profit ${period} hari`}>
      {/* Grid lines */}
      {[0, 1, 2, 3, 4].map((v) => (
        <g key={v}>
          <line
            x1={padL} y1={toY(v)} x2={width - padR} y2={toY(v)}
            stroke="#E8E5DC" strokeWidth={0.5} strokeDasharray={v === 0 ? '0' : '4 4'}
          />
          <text x={padL - 6} y={toY(v) + 4} textAnchor="end" fill="#8B90A8" fontSize={10}>
            {v}M
          </text>
        </g>
      ))}

      {/* Line paths */}
      {lines.map((line) => (
        <motion.polyline
          key={line.key}
          points={line.pts}
          fill="none"
          stroke={line.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}

      {/* Data points — revenue only for clarity */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(p.revenue)} r={3.5} fill="#F5A623" stroke="#FBF8F1" strokeWidth={2} />
          <text x={toX(i)} y={toY(p.revenue) - 10} textAnchor="middle" fill="#1A1D2E" fontSize={9} fontWeight={600}>
            {p.revenue}M
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => (
        <text key={i} x={toX(i)} y={height - 6} textAnchor="middle" fill="#8B90A8" fontSize={9}>
          {p.day}h
        </text>
      ))}
    </svg>
  )
}

export default function FinancialIntelligence() {
  const [period, setPeriod] = useState(60)

  return (
    <section className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          className="max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mb-3 text-sm font-semibold tracking-wide text-electric-500 uppercase">
            Financial Intelligence
          </p>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-navy-500 sm:text-4xl">
            Keuangan yang nggak cuma
            <span className="text-warm-400"> dilaporkan,</span>
            <br />
            tapi dipahami.
          </h2>
        </motion.div>

        {/* Chart Area */}
        <motion.div
          className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Main chart */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 lg:col-span-8">
            {/* Period selector */}
            <div className="mb-6 flex items-center gap-1.5 rounded-lg bg-cream p-1">
              {periods.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`relative flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                    period === p.value ? 'text-navy-600' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {period === p.value && (
                    <motion.span
                      layoutId="period-indicator"
                      className="absolute inset-0 rounded-md bg-surface shadow-sm"
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    />
                  )}
                  <span className="relative z-10">{p.label}</span>
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="mb-4 flex gap-5">
              {metrics.map((m) => (
                <div key={m.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-xs font-medium text-text-muted">{m.label}</span>
                </div>
              ))}
            </div>

            {/* Chart */}
            <AnimatePresence mode="wait">
              <motion.div
                key={period}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <Chart period={period} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Insight Panel */}
          <div className="flex flex-col gap-5 lg:col-span-4">
            {/* AI Insight */}
            <div className="relative overflow-hidden rounded-2xl border border-warm-200/60 bg-gradient-to-br from-warm-50 to-surface p-6">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warm-400/10">
                  <svg className="h-4 w-4 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-warm-500 uppercase">Insight</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={period}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="text-[13px] leading-relaxed text-text-secondary"
                >
                  {insights[period]}
                </motion.p>
              </AnimatePresence>
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-warm-300/10" />
            </div>

            {/* Quick Stats */}
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h4 className="mb-3 text-xs font-semibold text-text-muted uppercase">Ringkasan Bulan Ini</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Total Revenue</span>
                  <span className="text-sm font-bold text-navy-600">Rp17.8M</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Total Expenses</span>
                  <span className="text-sm font-bold text-navy-600">Rp11.0M</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Net Profit</span>
                  <span className="text-sm font-bold text-profit-600">Rp6.8M</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Cash Position</span>
                  <span className="text-sm font-bold text-electric-500">Rp23.4M</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
