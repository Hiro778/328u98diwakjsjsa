import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Toast state hook. Returns [toast, showToast].
 * toast: { message, type } or null
 * showToast(message, type): shows toast for 3s then auto-dismisses
 */
export default function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, type })
    timerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  return { toast, showToast }
}
