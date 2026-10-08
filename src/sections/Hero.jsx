import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import usePricingCta from '../hooks/usePricingCta'

const nodes = [
  {
    id: 'hero-node-revenue',
    label: 'Revenue',
    value: 'Rp84.2M',
    insight: 'Current Revenue: Rp84.2M (+12% MoM)',
    color: '#F5A623',
    x: 0,
    y: -120,
    mobileX: 0,
    mobileY: -60,
  },
  {
    id: 'hero-node-profit',
    label: 'Profit',
    value: '28.4%',
    insight: 'Average Margin: 28.4%',
    color: '#10B981',
    x: 105,
    y: -60,
    mobileX: 60,
    mobileY: -60,
  },
  {
    id: 'hero-node-cashflow',
    label: 'Cash Flow',
    value: 'Rp18.4M',
    insight: 'Predicted cash position in 60 days: Rp18.4M',
    color: '#818CF8',
    x: 105,
    y: 60,
    mobileX: -60,
    mobileY: -20,
  },
  {
    id: 'hero-node-inventory',
    label: 'Inventory',
    value: '12.4x',
    insight: 'Stock Turnover: 12.4x (Healthy)',
    color: '#F5A623',
    x: 0,
    y: 120,
    mobileX: 60,
    mobileY: 20,
  },
  {
    id: 'hero-node-customers',
    label: 'Customers',
    value: '42.1%',
    insight: 'Repeat Purchase Rate: 42.1%',
    color: '#10B981',
    x: -105,
    y: 60,
    mobileX: -60,
    mobileY: 60,
  },
  {
    id: 'hero-node-operations',
    label: 'Operasional',
    value: '98.5%',
    insight: 'Efisiensi Operasional Bisnis: 98.5%',
    color: '#6366F1',
    x: -105,
    y: -60,
    mobileX: 60,
    mobileY: 60,
  },
]

function EcosystemCore() {
  const [hoveredNode, setHoveredNode] = useState(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 300)
    return () => clearTimeout(timer)
  }, [])

  const hoveredData = useMemo(
    () => nodes.find((n) => n.id === hoveredNode),
    [hoveredNode]
  )

  return (
    <div className="relative flex w-full items-center justify-center" style={{ minHeight: '480px' }}>
      {/* Ambient glow layer */}
      <div
        id="hero-ambient-glow"
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(245,166,35,0.15) 0%, rgba(129,140,248,0.06) 60%, transparent 100%)',
        }}
      />

      <div className="relative z-10">
        {/* Connection lines - SVG behind nodes */}
        <svg
          className="absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
          width="340"
          height="340"
          viewBox="-170 -170 340 340"
          aria-hidden="true"
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {nodes.map((node) => {
            const isActive = hoveredNode === node.id
            return (
              <line
                key={node.id}
                id="hero-connection"
                x1="0"
                y1="0"
                x2={node.x}
                y2={node.y}
                stroke={isActive ? node.color : '#A8AED0'}
                strokeWidth={isActive ? 1.5 : 0.8}
                opacity={hoveredNode && !isActive ? 0.25 : 0.6}
                filter={isActive ? 'url(#glow)' : undefined}
                style={{ transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            )
          })}
        </svg>

        {/* Business Core Node */}
        <motion.div
          id="hero-business-core"
          className="absolute top-1/2 left-1/2 z-20 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(245,166,35,0.9) 0%, rgba(30,42,94,0.95) 100%)',
            boxShadow: hoveredNode
              ? '0 0 40px rgba(245,166,35,0.5), 0 0 80px rgba(245,166,35,0.15)'
              : '0 0 25px rgba(245,166,35,0.25), 0 0 60px rgba(245,166,35,0.08)',
            transition: 'box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={isVisible ? { scale: 1, opacity: 1 } : {}}
          transition={{ type: 'spring', stiffness: 180, damping: 20, delay: 0.4 }}
        >
          <span className="text-lg font-bold text-white opacity-80 tracking-tight">Rp</span>
        </motion.div>

        {/* Outer node elements */}
        {nodes.map((node, i) => {
          const isHovered = hoveredNode === node.id
          const isAnyHovered = hoveredNode !== null
          const dimmed = isAnyHovered && !isHovered

          return (
            <motion.div
              key={node.id}
              id={node.id}
              className="absolute top-1/2 left-1/2 z-10 cursor-pointer"
              style={{ translate: '-50% -50%' }}
              initial={{ x: node.x, y: node.y, opacity: 0, scale: 0.5 }}
              animate={isVisible ? { x: node.x, y: node.y, opacity: 1, scale: 1 } : {}}
              transition={{
                type: 'spring',
                stiffness: 120,
                damping: 18,
                delay: 0.5 + i * 0.08,
              }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <motion.div
                className="flex flex-col items-center"
                animate={{ opacity: dimmed ? 0.35 : 1 }}
                transition={{ duration: 0.25 }}
              >
                {/* Node circle */}
                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300"
                  style={{
                    backgroundColor: isHovered ? `${node.color}22` : '#FFFFFF',
                    borderColor: isHovered ? node.color : '#E8E5DC',
                    boxShadow: isHovered
                      ? `0 0 20px ${node.color}44, 0 0 40px ${node.color}15`
                      : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Glowing dot inside node */}
                  <div
                    className="h-2.5 w-2.5 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: node.color,
                      boxShadow: isHovered ? `0 0 8px ${node.color}` : 'none',
                    }}
                  />
                </div>

                {/* Label + value */}
                <div className="mt-2 text-center">
                  <span className="block text-[11px] font-medium tracking-wide text-text-muted uppercase">
                    {node.label}
                  </span>
                  <span
                    className="block text-sm font-bold transition-colors duration-200"
                    style={{ color: isHovered ? node.color : '#1A1D2E' }}
                  >
                    {node.value}
                  </span>
                </div>

                {/* Insight tooltip */}
                <motion.div
                  className="pointer-events-none absolute top-full mt-3 w-44 rounded-lg bg-navy-600 px-3 py-2 text-center text-xs leading-relaxed text-white shadow-lg"
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={
                    isHovered
                      ? { opacity: 1, y: 0, scale: 1 }
                      : { opacity: 0, y: -6, scale: 0.95 }
                  }
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {node.insight}
                  <div className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-navy-600" />
                </motion.div>
              </motion.div>
            </motion.div>
          )
        })}

        {/* Animated data pulses along connections — hero-particle layer */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {isVisible &&
            nodes.map((node, i) => (
              <motion.div
                key={`pulse-${node.id}`}
                className="hero-particle absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: node.color }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
                animate={{
                  opacity: [0, 0.8, 0],
                  x: [0, node.x],
                  y: [0, node.y],
                  scale: [0.5, 1.2, 0.5],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  delay: 1.2 + i * 0.5,
                  ease: 'easeInOut',
                }}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  const { handleCtaClick, loading } = usePricingCta()

  return (
    <section className="relative overflow-hidden px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-24">
      {/* Background texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(255,240,200,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col items-center text-center">
          {/* Headline */}
          <motion.h1
            className="text-4xl font-extrabold leading-[1.1] tracking-tight text-navy-500 sm:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Bikin bisnis lebih sehat.
            <br />
            <span className="text-warm-400">Biar tumbuhnya</span> nggak
            <br />
            nebak-nebak.
          </motion.h1>

          {/* Supporting text */}
          <motion.p
            className="mt-5 max-w-md text-base leading-relaxed text-text-secondary sm:text-lg"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            Bantu UMKM mengelola keuangan, penjualan, stok, operasional, dan mengambil keputusan bisnis dengan tools dan AI.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={handleCtaClick}
              disabled={loading}
              className="group inline-flex items-center gap-2 rounded-xl bg-warm-400 px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-warm-400/30 disabled:opacity-60"
            >
              Mulai 130K/bulan
              <svg
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
            <a
              href="#cara-kerja"
              className="group inline-flex items-center gap-2 rounded-xl border border-navy-100 bg-white/60 px-6 py-3.5 text-[15px] font-medium text-navy-500 backdrop-blur-sm transition-all duration-200 hover:border-navy-200 hover:bg-white hover:shadow-sm"
            >
              Lihat cara kerjanya
              <svg
                className="h-4 w-4 opacity-50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </motion.div>
        </div>

        {/* Interactive Ecosystem */}
        <motion.div
          className="mt-12 sm:mt-16"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <EcosystemCore />
        </motion.div>
      </div>
    </section>
  )
}
