import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [business, setBusiness] = useState(null)
  const [subscription, setSubscription] = useState(null)

  const [profileLoaded, setProfileLoaded] = useState(false)
  const [businessLoaded, setBusinessLoaded] = useState(false)
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false)

  const loading = !(profileLoaded && businessLoaded && subscriptionLoaded)

  async function loadBusiness(profileId) {
    try {
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setBusiness(data)
    } catch {
      // Query failed — continue without business
    }
    setBusinessLoaded(true)
  }

  async function loadSubscription(profileId) {
    try {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setSubscription(data)
    } catch {
      // Query failed — continue without subscription
    }
    setSubscriptionLoaded(true)
  }

  async function loadOrCreateProfile(authUser) {
    let prof = null

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      prof = data
    } catch {
      // Query failed (timeout/504/etc) — continue without profile
    }

    if (!prof) {
      // Wait for trigger to commit
      await new Promise((r) => setTimeout(r, 500))
      try {
        const { data: retry } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single()
        prof = retry
      } catch {
        // Retry also failed
      }
    }

    if (!prof) {
      // Fallback: insert client-side (requires INSERT RLS policy)
      try {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            email: authUser.email,
            full_name: authUser.user_metadata?.full_name ?? '',
            avatar_url: authUser.user_metadata?.avatar_url ?? '',
          })
          .select()
          .single()
        prof = newProfile
      } catch {
        // Insert also failed
      }
    }

    setProfile(prof)
    setProfileLoaded(true)

    // Chain: load business + subscription after profile
    if (prof) {
      await Promise.all([
        loadBusiness(prof.id),
        loadSubscription(prof.id),
      ])
    } else {
      setBusinessLoaded(true)
      setSubscriptionLoaded(true)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadOrCreateProfile(session.user)
      } else {
        setProfileLoaded(true)
        setBusinessLoaded(true)
        setSubscriptionLoaded(true)
      }
    })

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadOrCreateProfile(session.user)
        } else {
          setProfile(null)
          setBusiness(null)
          setSubscription(null)
          setProfileLoaded(true)
          setBusinessLoaded(true)
          setSubscriptionLoaded(true)
        }
      }
    )

    return () => authSub.unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setBusiness(null)
    setSubscription(null)
    setProfileLoaded(false)
    setBusinessLoaded(false)
    setSubscriptionLoaded(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await loadOrCreateProfile(user)
  }, [user])

  const refreshBusiness = useCallback(async () => {
    if (profile) await loadBusiness(profile.id)
  }, [profile])

  const refreshSubscription = useCallback(async () => {
    if (profile) await loadSubscription(profile.id)
  }, [profile])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        business,
        subscription,
        loading,
        isAuthenticated: !!user && !loading,
        hasCompletedOnboarding: !!business,
        hasActiveSubscription:
          subscription?.status === 'active'
          && subscription?.plan !== 'free'
          && subscription?.expires_at
          && new Date(subscription.expires_at) > new Date(),
        hasExpiredSubscription:
          subscription?.plan === 'pro'
          && subscription?.expires_at
          && new Date(subscription.expires_at) <= new Date(),
        signInWithGoogle,
        signOut,
        refreshProfile,
        refreshBusiness,
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
