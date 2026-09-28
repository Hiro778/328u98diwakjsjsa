import { Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import SubscriptionGate from './SubscriptionGate'

export default function RequireSubscription({ featureName = 'Fitur ini' }) {
  const {
    subscriptionState,
    hasActiveSubscription,
    loading,
    refreshSubscription,
  } = useAuth()

  // 1. Loading state — wait for AuthContext and subscription check to complete
  if (loading || subscriptionState === 'loading') {
    return <LoadingScreen />
  }

  // 2. Error state — show friendly error, never degrade Pro user to Free
  if (subscriptionState === 'error') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-warm-300/40 bg-surface p-8 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-inner">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-extrabold text-navy-800">
            Terjadi Kendala Saat Memeriksa Status Langganan
          </h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Tidak dapat memverifikasi status akun Anda saat ini. Silakan coba lagi beberapa saat.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => refreshSubscription()}
              type="button"
              className="w-full rounded-xl bg-warm-500 px-6 py-3 text-center text-sm font-bold text-white shadow transition-all hover:bg-warm-600 cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. Active state — grant access
  if (hasActiveSubscription || subscriptionState === 'active') {
    return <Outlet />
  }

  // 4. Free or Expired state — render gate
  return <SubscriptionGate featureName={featureName} />
}
