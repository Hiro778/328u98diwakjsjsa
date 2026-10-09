import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { calculateSubscriptionEntitlement, resolveCanonicalSubscription } from '../lib/subscriptionUtils'
import { fetchPublicPlatformSettings } from '../services/adminSettingsService'
import { createSafeRealtimeChannel, cleanupAllRealtimeChannels } from '../lib/realtimeHelper'
import { invalidateBusinessSalesDataCache } from '../services/canonicalSalesService'

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
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const isSigningOutRef = useRef(false)
  const loadingUserRef = useRef(null)

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

      if (loadingUserRef.current !== profileId) return

      setBusiness(data)
      setBusinessLoaded(true)

      if (data?.id) {
        // Asynchronously check creative free usage without blocking business load
        supabase
          .from('creative_free_usage')
          .select('id')
          .eq('business_id', data.id)
          .maybeSingle()
          .then(({ data: freeData }) => {
            if (loadingUserRef.current === profileId) {
              setHasUsedFreeAi(Boolean(freeData))
            }
          })
          .catch(() => {})
      }
    } catch {
      // Query failed — continue without business
    } finally {
      if (loadingUserRef.current === profileId) {
        setBusinessLoaded(true)
      }
    }
  }

  async function loadSubscription(profileId) {
    let sub = null
    let hasPaid = false
    try {
      // Parallelize subscriptions and verified payments checks
      const subPromise = supabase
        .from('subscriptions')
        .select('*')
        .eq('profile_id', profileId)

      const paymentPromise = supabase
        .from('subscription_payments')
        .select('id')
        .eq('profile_id', profileId)
        .in('payment_status', ['paid', 'settlement'])
        .limit(1)

      const [subResult, paymentResult] = await Promise.all([subPromise, paymentPromise])

      if (loadingUserRef.current !== profileId) return null

      const { data: subRows, error: subErr } = subResult
      if (subErr) {
        console.error('[AuthContext] subscription query error:', subErr)
        setSubscriptionError(subErr)
        setSubscriptionLoaded(true)
        return null
      }

      if (subRows && subRows.length > 0) {
        sub = resolveCanonicalSubscription(subRows)
      }

      const { data: paymentData, error: paymentErr } = paymentResult
      if (paymentErr) {
        console.warn('[AuthContext] subscription_payments check error:', paymentErr)
      } else if (paymentData && paymentData.length > 0) {
        hasPaid = true
      }

      if (loadingUserRef.current !== profileId) return null

      setSubscription(sub)
      setHasPaidHistory(hasPaid)
      setSubscriptionError(null)
    } catch (err) {
      console.error('[AuthContext] loadSubscription unexpected error:', err)
      if (loadingUserRef.current === profileId) {
        setSubscriptionError(err)
      }
    } finally {
      if (loadingUserRef.current === profileId) {
        setSubscriptionLoaded(true)
      }
    }
    return sub
  }

  async function loadOrCreateProfile(authUser) {
    if (!authUser) return
    loadingUserRef.current = authUser.id

    // Start subscription and business loads immediately in parallel using authUser.id
    const subPromise = loadSubscription(authUser.id)
    const businessPromise = loadBusiness(authUser.id)

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

    if (loadingUserRef.current !== authUser.id) return

    if (!prof) {
      // Wait for trigger to commit
      await new Promise((r) => setTimeout(r, 500))
      if (loadingUserRef.current !== authUser.id) return
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

    if (loadingUserRef.current !== authUser.id) return

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

    if (loadingUserRef.current !== authUser.id) return

    setProfile(prof)
    setProfileLoaded(true)

    // Wait for parallel subscription and business loads to complete
    await Promise.all([subPromise, businessPromise])

    // Strict Security Hardening: Banned or suspended user must have ZERO app access
    if (prof?.status === 'banned' || prof?.status === 'suspended' || prof?.status === 'deleted') {
      console.warn('[AuthContext] BANNED/SUSPENDED USER DETECTED. Zero access enforcement initiated.')
      setBusiness(null)
      setBusinessLoaded(true)
      setSubscription(null)
      setSubscriptionLoaded(true)
      return
    }
  }

  useEffect(() => {
    let isMounted = true

    async function initAuth() {
      try {
        // Fast path: check whether localStorage has a stored Supabase token
        const hasStoredToken = (() => {
          try {
            if (typeof window === 'undefined' || !window.localStorage) return false
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const item = localStorage.getItem(key)
                return Boolean(item && item !== 'null' && item !== '{}')
              }
            }
          } catch {
            return false
          }
          return false
        })()

        // Zero-wait resolution: if no auth token is stored in localStorage,
        // user is definitively unauthenticated on initial load.
        // Prevents blocking the entire app and /auth on unnecessary async checks.
        if (!hasStoredToken) {
          if (isMounted) {
            setUser(null)
            setProfileLoaded(true)
            setBusinessLoaded(true)
            setSubscriptionLoaded(true)
            setAuthLoading(false)
          }
          return
        }

        // 1. Initial retrieval of session from storage / memory with safety timeout (prevents deadlock)
        const getSessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 3000))
        const { data: { session } } = await Promise.race([getSessionPromise, timeoutPromise])

        if (!isMounted) return

        if (session?.user) {
          setUser(session.user)
          setAuthLoading(false)
          if (loadingUserRef.current !== session.user.id) {
            await loadOrCreateProfile(session.user)
          }
          return
        }

        // 2. Only attempt refreshSession fallback if a stored token is present
        // (handles cases where token expired while user was paying on Midtrans)
        if (hasStoredToken) {
          try {
            const refreshPromise = supabase.auth.refreshSession()
            const refreshTimeout = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 3000))
            const { data: refreshData } = await Promise.race([refreshPromise, refreshTimeout])
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

        if (latestProfile && isMounted && loadingUserRef.current === currentUserId) {
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

        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true)
        }

        if (session?.user) {
          setUser(session.user)
          setAuthLoading(false)
          if (loadingUserRef.current !== session.user.id || event === 'SIGNED_IN') {
            await loadOrCreateProfile(session.user)
          }
        } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session?.user)) {
          // Explicit sign out or empty initial session
          setIsRecoveryMode(false)
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

    const userId = user.id
    const channelName = `profile-status-${userId}`

    // 1. Supabase Realtime channel on profiles table for instant server-push
    const channel = createSafeRealtimeChannel(
      supabase,
      channelName,
      (ch) => {
        ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            if (loadingUserRef.current !== userId) return
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
      }
    )

    // 2. Heartbeat polling check (fallback safety net every 30s) to guarantee lockout even if websocket disconnects
    const heartbeatTimer = setInterval(async () => {
      if (loadingUserRef.current !== userId) return
      try {
        const { data: latestProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (loadingUserRef.current !== userId) return

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
    }, 30000)

    return () => {
      clearInterval(heartbeatTimer)
      if (channel && typeof supabase.removeChannel === 'function') {
        try {
          supabase.removeChannel(channel)
        } catch {}
      }
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

  const signInWithEmail = useCallback(async (email, password) => {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    })
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const resetPasswordForEmail = useCallback(async (email) => {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    return await supabase.auth.updateUser({
      password: newPassword,
    })
  }, [])

  const signOut = useCallback(async () => {
    if (isSigningOutRef.current) return
    isSigningOutRef.current = true
    setIsLoggingOut(true)
    setIsRecoveryMode(false)
    loadingUserRef.current = null

    // 1. Immediately wipe local auth and entity states to provide instant UI response
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

    // 2. Clean up any Supabase auth tokens stored in localStorage immediately to prevent resurrecting session
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key)
          }
        })
      }
    } catch {}

    // Invalidate any cached business analytics data
    try {
      invalidateBusinessSalesDataCache()
    } catch {}

    // 3. Immediately tear down all active realtime channels
    try {
      await cleanupAllRealtimeChannels(supabase)
    } catch (cleanupErr) {
      console.warn('[AuthContext] realtime cleanup warning during signOut:', cleanupErr)
    }

    // 4. Dispatch server-side signOut with safety timeout (2.5s)
    try {
      const signOutPromise = supabase.auth.signOut()
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 2500))
      const res = await Promise.race([signOutPromise, timeoutPromise])
      if (res?.timeout) {
        console.warn('[AuthContext] supabase.auth.signOut timed out, invoking local scope signout fallback')
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch {}
      }
    } catch (err) {
      console.warn('[AuthContext] signOut server notice:', err)
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {}
    } finally {
      setIsLoggingOut(false)
      isSigningOutRef.current = false
    }
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

  // Entitlement state machine per fic1.md & fix.md specifications (memoized)
  const entitlement = useMemo(() => calculateSubscriptionEntitlement({
    user,
    subscription,
    hasPaidHistory,
    loading,
    error: subscriptionError,
    now: new Date(),
  }), [user, subscription, hasPaidHistory, loading, subscriptionError])

  const value = useMemo(() => ({
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
    isLoggingOut,
    isRecoveryMode,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    updatePassword,
    signOut,
    refreshProfile,
    refreshBusiness,
    refreshSubscription,
    refreshFreeAiUsage,
    retrySubscription: refreshSubscription,
  }), [
    user,
    profile,
    business,
    subscription,
    hasPaidHistory,
    hasUsedFreeAi,
    loading,
    authLoading,
    isAccessDenied,
    isBanned,
    isSuspended,
    banReason,
    entitlement,
    subscriptionError,
    subscriptionLoaded,
    isLoggingOut,
    isRecoveryMode,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    updatePassword,
    signOut,
    refreshProfile,
    refreshBusiness,
    refreshSubscription,
    refreshFreeAiUsage,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
