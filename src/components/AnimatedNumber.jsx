import { useEffect, useRef, useState } from 'react'

/**
 * Smooth animated number with optional direction indicator.
 * Uses requestAnimationFrame for smooth interpolation.
 *
 * Props:
 *   value      – target number
 *   duration   – animation duration in ms (default 500)
 *   format     – function(value) => string for display formatting
 *   className  – container className
 *   size       – 'sm' | 'md' | 'lg' | 'xl'
 *   showIndicator – show up/down arrow on change
 */
export default function AnimatedNumber({
  value,
  duration = 500,
  format = (v) => (Number.isFinite(v) ? v.toLocaleString('id-ID') : '—'),
  className = '',
  size = 'md',
  showIndicator = false,
}) {
  const [display, setDisplay] = useState(value)
  const [direction, setDirection] = useState(null)
  const prevRef = useRef(value)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const fromRef = useRef(value)
  const timerRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setDisplay(to)
      prevRef.current = to
      return
    }

    if (Math.abs(from - to) < 0.000001) {
      setDisplay(to)
      prevRef.current = to
      return
    }

    if (to > from + 0.000001) setDirection('up')
    else if (to < from - 0.000001) setDirection('down')
    else setDirection(null)

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (timerRef.current) clearTimeout(timerRef.current)

    fromRef.current = from
    startRef.current = null

    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setDisplay(fromRef.current + (to - fromRef.current) * eased)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplay(to)
        prevRef.current = to
        timerRef.current = setTimeout(() => setDirection(null), 1500)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, duration])

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl sm:text-4xl',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`}>
      <span className={`${sizeClasses[size] || ''} font-bold transition-colors duration-300`}>
        {format(display)}
      </span>
      {showIndicator && direction && (
        <span
          className={`inline-flex items-center text-xs font-semibold transition-all duration-500 ${
            direction === 'up'
              ? 'text-profit-500 translate-y-0 opacity-100'
              : 'text-red-500 translate-y-0 opacity-100'
          }`}
        >
          {direction === 'up' ? '▲' : '▼'}
        </span>
      )}
    </span>
  )
}
