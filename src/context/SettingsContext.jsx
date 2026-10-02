import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { fetchPublicPlatformSettings, DEFAULT_PUBLIC_SETTINGS } from '../services/adminSettingsService'

const SettingsContext = createContext(null)

/**
 * SettingsProvider (@gas.md & @ban.md)
 * Provides centralized, reactive platform settings state across the application tree.
 * Hierarchy:
 *   AuthProvider -> SettingsProvider -> MaintenanceGate -> Application Routes
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_PUBLIC_SETTINGS)
  const [loading, setLoading] = useState(true)
  const isMountedRef = useRef(true)

  const load = useCallback(async (force = false) => {
    try {
      const data = await fetchPublicPlatformSettings(force)
      if (isMountedRef.current && data) {
        setSettings(data)
      }
    } catch (err) {
      console.warn('[SettingsProvider] Failed to fetch settings:', err)
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // Initial load
    load()

    // Dynamic auto-gate listeners (@gas.md & @ban.md)
    const handleFocus = () => load(true)
    const handleInvalidated = () => load(true)
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load(true)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus)
      window.addEventListener('online', handleFocus)
      window.addEventListener('platform-settings-invalidated', handleInvalidated)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    // 30-second interval fallback for active tabs
    const intervalId = setInterval(() => {
      load(true)
    }, 30000)

    return () => {
      isMountedRef.current = false
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus)
        window.removeEventListener('online', handleFocus)
        window.removeEventListener('platform-settings-invalidated', handleInvalidated)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      clearInterval(intervalId)
    }
  }, [load])

  const value = {
    settings,
    loading,
    refetchSettings: () => load(true),
    platformName: settings.platform_name || 'BisnisSehat',
    supportEmail: settings.support_email || 'support@bisnissehat.id',
    supportPhone: settings.support_phone || '+62 812-3456-7890',
    supportHours: settings.support_operating_hours || 'Senin - Jumat, 09:00 - 18:00 WIB',
    isMaintenance: Boolean(settings.maintenance_mode),
    isAnnouncementEnabled: Boolean(settings.announcement_banner_enabled && settings.announcement_banner_text),
    announcementText: settings.announcement_banner_text || '',
    isRegistrationEnabled: settings.enable_user_registration !== false,
    isAiEnabled: settings.enable_ai_features !== false,
    isQrisEnabled: settings.enable_qris_checkout !== false,
    isPosEnabled: settings.enable_pos_module !== false,
    posMaxItems: Number(settings.pos_max_items_per_order) || 100,
    sessionIdleTimeoutMinutes: Number(settings.session_idle_timeout_minutes) || 60,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettingsContext() {
  return useContext(SettingsContext)
}
export default SettingsContext
