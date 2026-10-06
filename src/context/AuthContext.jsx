import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { calculateSubscriptionEntitlement, resolveCanonicalSubscription } from '../lib/subscriptionUtils'
import { fetchPublicPlatformSettings } from '../services/adminSettingsService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [business, setBusiness] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [hasPaidHistory, setHasPaidHistory] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState(null)

  const [authLoading, setAuthLoading] = useState(true)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [businessLoaded, setBusinessLoaded] = useState(false)
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false)

  const [hasUsedFreeAi, setHasUsedFreeAi] = useState(false)

  const loading = authLoading || (user ? !(profileLoaded && businessLoaded && subscriptionLoaded) : false)

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
      if (data?.id) {
        try {
          const { data: freeData } = await supabase
            .from('creative_free_usage')
            .select('id')
            .eq('business_id', data.id)
            .maybeSingle()
          setHasUsedFreeAi(Boolean(freeData))
        } catch {
          // Ignore
        }
      }
    } catch {
      // Query failed — continue without business
    }
    setBusinessLoaded(true)
  }

  async function loadSubscription(profileId) {
    let sub = null
    let hasPaid = false
    try {
      const { data: subRows, error: subErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('profile_id', profileId)

      if (subErr) {
        console.error('[AuthContext] subscription query error:', subErr)
        setSubscriptionError(subErr)
        setSubscriptionLoaded(true)
        return null
      }

      if (subRows && subRows.length > 0) {
        sub = resolveCanonicalSubscription(subRows)
      }

      // Query database for verified payment records (source of truth for paid Pro)
      try {
        const { data: paymentData, error: paymentErr } = await supabase
          .from('subscription_payments')
          .select('id')
          .eq('profile_id', profileId)
          .in('payment_status', ['paid', 'settlement'])
          .limit(1)

        if (paymentErr) {
          console.warn('[AuthContext] subscription_payments check error:', paymentErr)
        } else if (paymentData && paymentData.length > 0) {
          hasPaid = true
        }
      } catch (pErr) {
        console.warn('[AuthContext] subscription_payments check exception:', pErr)
      }

      setSubscription(sub)
      setHasPaidHistory(hasPaid)
      setSubscriptionError(null)
    } catch (err) {
      console.error('[AuthContext] loadSubscription unexpected error:', err)
      setSubscriptionError(err)
    } finally {
      setSubscriptionLoaded(true)
    }
    return sub
  }

  const loadingUserRef = useRef(null)

  async function loadOrCreateProfile(authUser) {
    if (!authUser) return
    loadingUserRef.current = authUser.id

    // Start subscription load immediately in parallel using authUser.id
    const subPromise = loadSubscription(authUser.id)

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

    // Strict Security Hardening: Banned or suspended user must have ZERO app access
    if (prof?.status === 'banned' || prof?.status === 'suspended' || prof?.status === 'deleted') {
      console.warn('[AuthContext] BANNED/SUSPENDED USER DETECTED. Zero access enforcement initiated.')
      setBusiness(null)
      setBusinessLoaded(true)
      setSubscription(null)
      setSubscriptionLoaded(true)
      return
    }

    // Chain: load business after profile, wait for subPromise
    if (prof) {
      await Promise.all([
        loadBusiness(prof.id),
        subPromise,
      ])
    } else {
      setBusinessLoaded(true)
      await subPromise
    }
  }

  useEffect(() => {
    let isMounted = true

    async function initAuth() {
      try {
        // 1. Initial retrieval of session from storage / memory
        const { data: { session } } = await supabase.auth.getSession()

        if (!isMounted) return

        if (session?.user) {
          setUser(session.user)
          setAuthLoading(false)
          if (loadingUserRef.current !== session.user.id) {
            await loadOrCreateProfile(session.user)
          }
          return
        }

        // 2. If getSession returned null/error, attempt refreshSession fallback
        // (handles cases where token expired while user was paying on Midtrans)
        try {
          const { data: refreshData } = await supabase.auth.refreshSession()
          if (!isMounted) return
          if (refreshData?.session?.user) {
            setUser(refreshData.session.user)
            setAuthLoading(false)
            if (loadingUserRef.current !== refreshData.session.user.id) {
              await loadOrCreateProfile(refreshData.session.user)
            }
            return
          }
        } catch {
          // refreshSession failed or not possible
        }

        // 3. Truly unauthenticated
        if (isMounted) {
          setUser(null)
          setProfileLoaded(true)
          setBusinessLoaded(true)
          setSubscriptionLoaded(true)
          setAuthLoading(false)
        }
      } catch (err) {
        console.error('[AuthContext] initAuth error:', err)
        if (isMounted) {
          setUser(null)
          setProfileLoaded(true)
          setBusinessLoaded(true)
          setSubscriptionLoaded(true)
          setAuthLoading(false)
        }
      }
    }

    initAuth()

    // Immediate status sync when user refocuses browser tab
    const handleWindowFocus = async () => {
      const currentUserId = loadingUserRef.current
      if (!currentUserId || !isMounted) return
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle()

        if (latestProfile && isMounted) {
          setProfile(latestProfile)
          if (['banned', 'suspended', 'deleted'].includes(latestProfile.status)) {
            console.warn('[AuthContext] Banned/suspended status detected on window focus. Zero access enforced.')
            setBusiness(null)
            setSubscription(null)
          }
        }
      } catch (err) {
        console.warn('[AuthContext] focus status sync error:', err)
      }
    }

    window.addEventListener('focus', handleWindowFocus)

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return

        if (session?.user) {
          setUser(session.user)
          setAuthLoading(false)
          if (loadingUserRef.current !== session.user.id || event === 'SIGNED_IN') {
            await loadOrCreateProfile(session.user)
          }
        } else if (event === 'SIGNED_OUT') {
          // Explicit sign out
          loadingUserRef.current = null
          setUser(null)
          setProfile(null)
          setBusiness(null)
          setSubscription(null)
          setHasPaidHistory(false)
          setSubscriptionError(null)
          setProfileLoaded(true)
          setBusinessLoaded(true)
          setSubscriptionLoaded(true)
          setAuthLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      window.removeEventListener('focus', handleWindowFocus)
      authSub.unsubscribe()
    }
  }, [])

  // Instant eviction for active sessions: Supabase Realtime + polling heartbeat
  useEffect(() => {
    if (!user?.id) return

    const channelName = `profile-status-${user.id}`

    if (typeof supabase.getChannels === 'function' && typeof supabase.removeChannel === 'function') {
      const existing = supabase.getChannels().find(
        (c) => c.topic === `realtime:${channelName}` || c.topic === channelName
      )
      if (existing) {
        try {
          supabase.removeChannel(existing)
        } catch {}
        try {
          if (supabase.realtime && Array.isArray(supabase.realtime.channels)) {
            supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== existing)
          }
        } catch {}
        try {
          if (typeof existing.teardown === 'function') {
            existing.teardown()
          }
        } catch {}
      }
    }

    // 1. Supabase Realtime channel on profiles table for instant server-push
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updatedProfile = payload.new
          if (updatedProfile) {
            setProfile(updatedProfile)
            if (['banned', 'suspended', 'deleted'].includes(updatedProfile.status)) {
              console.warn('[AuthContext] Realtime ban/suspension received! Enforcing zero app access immediately.')
              setBusiness(null)
              setSubscription(null)
            }
          }
        }
      )
      .subscribe()

    // 2. Heartbeat polling check (every 4 seconds) to guarantee lockout even if websocket is closed
    const heartbeatTimer = setInterval(async () => {
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (latestProfile) {
          setProfile((prev) => {
            if (prev?.status !== latestProfile.status || prev?.status_reason !== latestProfile.status_reason) {
              if (['banned', 'suspended', 'deleted'].includes(latestProfile.status)) {
                console.warn('[AuthContext] Heartbeat detected status change to', latestProfile.status)
                setBusiness(null)
                setSubscription(null)
              }
              return latestProfile
            }
            return prev
          })
        }
      } catch {
        // Ignore network hiccups
      }
    }, 4000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(heartbeatTimer)
    }
  }, [user?.id])

  const signInWithGoogle = useCallback(async () => {
    return await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    loadingUserRef.current = null
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setBusiness(null)
    setSubscription(null)
    setHasPaidHistory(false)
    setSubscriptionError(null)
    setProfileLoaded(true)
    setBusinessLoaded(true)
    setSubscriptionLoaded(true)
    setAuthLoading(false)
  }, [])

  // Idle Session Inactivity Timeout Enforcement (@ban.md)
  useEffect(() => {
    if (!user?.id) return

    let idleTimeoutMinutes = 60
    let timeoutId = null

    // Load timeout configuration from public platform settings
    fetchPublicPlatformSettings().then((settings) => {
      if (settings?.session_idle_timeout_minutes && Number(settings.session_idle_timeout_minutes) > 0) {
        idleTimeoutMinutes = Number(settings.session_idle_timeout_minutes)
      }
      resetIdleTimer()
    }).catch(() => {
      resetIdleTimer()
    })

    function handleIdleExpiry() {
      console.warn(`[AuthContext] Session idle timeout reached (${idleTimeoutMinutes}m). Auto-signing out.`)
      signOut()
    }

    function resetIdleTimer() {
      if (timeoutId) clearTimeout(timeoutId)
      const timeoutMs = idleTimeoutMinutes * 60 * 1000
      timeoutId = setTimeout(handleIdleExpiry, timeoutMs)
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const handleActivity = () => {
      resetIdleTimer()
    }

    activityEvents.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }))

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleActivity))
    }
  }, [user?.id, signOut])


  const refreshProfile = useCallback(async () => {
    if (user) await loadOrCreateProfile(user)
  }, [user])

  const refreshBusiness = useCallback(async () => {
    if (profile) await loadBusiness(profile.id)
  }, [profile])

  const refreshSubscription = useCallback(async () => {
    const targetId = user?.id || profile?.id
    if (targetId) {
      setSubscriptionError(null)
      return await loadSubscription(targetId)
    }
    return null
  }, [user, profile])

  const refreshFreeAiUsage = useCallback(async () => {
    if (!business?.id) return false
    try {
      const { data: freeData } = await supabase
        .from('creative_free_usage')
        .select('id')
        .eq('business_id', business.id)
        .maybeSingle()
      const used = Boolean(freeData)
      setHasUsedFreeAi(used)
      return used
    } catch {
      return false
    }
  }, [business?.id])

  const isBanned = Boolean(profile?.status === 'banned' || profile?.status === 'deleted')
  const isSuspended = Boolean(profile?.status === 'suspended')
  const isAccessDenied = isBanned || isSuspended
  const banReason = profile?.status_reason || ''

  // Entitlement state machine per fic1.md & fix.md specifications
  const entitlement = calculateSubscriptionEntitlement({
    user,
    subscription,
    hasPaidHistory,
    loading,
    error: subscriptionError,
    now: new Date(),
  })

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        business: isAccessDenied ? null : business,
        subscription: isAccessDenied ? null : subscription,
        hasPaidHistory,
        hasUsedFreeAi,
        loading,
        authLoading,
        isAuthenticated: !!user && !loading && !isAccessDenied,
        isAccessDenied,
        isBanned,
        isSuspended,
        banReason,
        hasCompletedOnboarding: !!business && !isAccessDenied,
        subscriptionState: isAccessDenied ? 'none' : entitlement.subscriptionState,
        hasActiveSubscription: isAccessDenied ? false : entitlement.hasActiveSubscription,
        hasExpiredSubscription: isAccessDenied ? false : entitlement.hasExpiredSubscription,
        hasCancelledSubscription: isAccessDenied ? false : (entitlement.hasCancelledSubscription || false),
        isPro: isAccessDenied ? false : entitlement.isPro,
        isBasic: isAccessDenied ? false : entitlement.isBasic,
        plan: isAccessDenied ? null : entitlement.plan,
        canAccessBasic: isAccessDenied ? false : Boolean(entitlement.hasActiveSubscription),
        canAccessPro: isAccessDenied ? false : Boolean(entitlement.isPro),
        subscriptionExpiresAt: subscription?.expires_at || null,
        subscriptionError,
        isSubscriptionLoading: !subscriptionLoaded,
        signInWithGoogle,
        signOut,
        refreshProfile,
        refreshBusiness,
        refreshSubscription,
        refreshFreeAiUsage,
        retrySubscription: refreshSubscription,
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
