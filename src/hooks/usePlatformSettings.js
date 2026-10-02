import { useSettingsContext } from '../context/SettingsContext'

/**
 * Custom React hook to consume platform settings (@ban.md, @gl.md, & @gas.md).
 *
 * This hook REQUIRES SettingsProvider to be present in the component tree.
 * SettingsProvider is the single source of truth for all public platform settings
 * (maintenance_mode, announcement banners, feature flags, etc.).
 *
 * FIX (conditional hooks): the previous implementation called useState/useEffect
 * conditionally after an early-return guard, violating React Rules of Hooks.
 * The standalone fallback fetch logic has been removed. All settings state now
 * lives exclusively in SettingsProvider/SettingsContext — no duplicate fetches,
 * no conditional hook calls, no split source of truth.
 *
 * If this hook is called outside a SettingsProvider, it throws immediately so
 * misconfigured trees are caught at development time rather than silently
 * returning stale defaults.
 */
export function usePlatformSettings() {
  const context = useSettingsContext()

  if (context === null || context === undefined) {
    throw new Error(
      '[usePlatformSettings] Must be used inside <SettingsProvider>. ' +
      'Ensure SettingsProvider wraps the component tree above this component.'
    )
  }

  return context
}
