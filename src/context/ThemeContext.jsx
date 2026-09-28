import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { THEME_STORAGE_KEY } from '../lib/themeConstants'

export { THEME_STORAGE_KEY }

const ThemeContext = createContext({
  themeMode: 'system',
  resolvedTheme: 'light',
  setThemeMode: () => {},
})

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored
      }
    } catch {
      // localStorage may fail in restricted/private contexts
    }
    return 'system'
  })

  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Listen to OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e) => {
      setSystemIsDark(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Apply root data-theme attribute per theme.md:
  // - 'light'  -> data-theme="light"
  // - 'dark'   -> data-theme="dark"
  // - 'system' -> remove attribute, let prefers-color-scheme CSS rule apply
  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement

    if (themeMode === 'light') {
      root.setAttribute('data-theme', 'light')
      root.classList.remove('dark')
    } else if (themeMode === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.classList.add('dark')
    } else {
      // System mode: do not force light/dark attribute
      root.removeAttribute('data-theme')
      if (systemIsDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }, [themeMode, systemIsDark])

  const setThemeMode = useCallback((mode) => {
    if (mode !== 'system' && mode !== 'light' && mode !== 'dark') return
    setThemeModeState(mode)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch (err) {
      console.warn('[ThemeContext] Failed to persist theme:', err)
    }
  }, [])

  const resolvedTheme = themeMode === 'system' ? (systemIsDark ? 'dark' : 'light') : themeMode

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
