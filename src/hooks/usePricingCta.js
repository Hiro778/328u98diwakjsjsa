import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

/**
 * Shared CTA logic for "Mulai sekarang" / pricing buttons.
 *
 * Flow:
 * - Not authenticated  → /auth?returnTo=/dashboard (login then redirect to dashboard)
 * - Authenticated       → /dashboard (direct, no checkout)
 * - Active subscription  → /dashboard (no duplicate subscription)
 */
export default function usePricingCta() {
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()

  function handleCtaClick() {
    if (loading) return

    if (!isAuthenticated) {
      navigate('/auth?returnTo=/dashboard')
    } else {
      navigate('/dashboard')
    }
  }

  return { handleCtaClick, loading }
}
