import { Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import SubscriptionGate from './SubscriptionGate'

export default function RequireSubscription({
  featureName = 'Fitur ini',
  requiredPlan = 'basic', // 'basic' | 'pro'
}) {
  const {
    subscriptionState,
    hasActiveSubscription,
    isPro,
    loading,
    refreshSubscription,
  } = useAuth()

  // 1. Loading state — wait for AuthContext and subscription check to complete
  if (loading || subscriptionState === 'loading') {
    return <LoadingScreen />
  }

  // 2. Error state — show friendly error, never degrade user
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

  // 3. Active state — check required plan
  if (hasActiveSubscription || subscriptionState === 'active') {
    if (requiredPlan === 'pro') {
      if (isPro) {
        return <Outlet />
      }
      // Active Basic user trying to access Pro-only tool -> show gate to upgrade to Pro
      return <SubscriptionGate featureName={featureName} requiredPlan="pro" />
    }
    // requiredPlan is 'basic': both Basic and Pro active subscribers can access
    return <Outlet />
  }

  // 4. Inactive / Free / Expired state — render gate with requiredPlan
  return <SubscriptionGate featureName={featureName} requiredPlan={requiredPlan} />
}
