import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const TYPE_STYLES = {
  success: 'border-profit-200 bg-profit-50 text-profit-600',
  error: 'border-red-200 bg-red-50 text-red-600',
  info: 'border-blue-200 bg-blue-50 text-blue-600',
}

const TYPE_ICONS = {
  success: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
}

/**
 * Toast notification component.
 * Props: message (string), type ('success'|'error'|'info'), onDismiss (callback)
 */
export default function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => onDismiss?.(), 3000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className={`fixed top-4 right-4 z-[60] flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${TYPE_STYLES[type] || TYPE_STYLES.info}`}
        >
          {TYPE_ICONS[type] || TYPE_ICONS.info}
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
