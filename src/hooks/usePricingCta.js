import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

/**
 * Shared CTA logic for "Mulai sekarang" / pricing buttons.
 *
 * Flow per PRD:
 * - Not authenticated  → /auth?returnTo=/pricing (login then redirect back to pricing)
 * - Authenticated      → /pricing (direct to pricing to subscribe)
 */
export default function usePricingCta() {
  const navigate = useNavigate()
  const { isAuthenticated, loading } = useAuth()

  function handleCtaClick() {
    if (loading) return

    if (!isAuthenticated) {
      navigate('/auth?returnTo=/pricing')
    } else {
      navigate('/pricing')
    }
  }

  return { handleCtaClick, loading }
}
