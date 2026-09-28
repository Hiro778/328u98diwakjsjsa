import { useNavigate } from 'react-router'

/**
 * BackButton component per undo.md and Context7 design specification:
 * - Navigates backward in history via navigate(-1)
 * - Safe fallback to fallbackUrl when no valid internal history exists
 * - Prevents navigating to external origins or leaving the app unexpectedly
 * - WAI-ARIA compliant: native <button type="button">, aria-label, keyboard navigable
 * - Design tokens & subtle hover interaction: ArrowLeft hover animation
 */
export default function BackButton({
  fallbackUrl = '/dashboard',
  label = 'Kembali',
  onClick,
  className = '',
}) {
  const navigate = useNavigate()

  const handleBack = (e) => {
    if (onClick) {
      onClick(e)
      return
    }
    // Check if there is internal SPA navigation history (React Router tracks idx > 0 in history state)
    const hasSpaHistory = typeof window !== 'undefined' && window.history?.state?.idx > 0

    // Also check document.referrer for internal origin
    const isInternalReferrer =
      typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin)

    if (hasSpaHistory || (typeof window !== 'undefined' && window.history?.length > 1 && isInternalReferrer)) {
      navigate(-1)
    } else {
      // Safe fallback to internal parent module
      navigate(fallbackUrl)
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={`group -ml-2 mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none transition-colors duration-150 ${className}`}
    >
      <svg
        className="h-4 w-4 shrink-0 -translate-x-0.5 group-hover:-translate-x-1 transition-transform duration-150"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span>{label}</span>
    </button>
  )
}
