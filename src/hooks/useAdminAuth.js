import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { ADMIN_ROLES } from '../services/adminRbacService.js'

/**
 * useAdminAuth Hook
 * Conforms strictly to @admin.md Section 1, 30, 31:
 * - Always verifies admin role and status from trusted server-side Postgres RPCs.
 * - NEVER stores or reads role from client-side persistent storage.
 * - Safe against role spoofing, client manipulation, and session expiry.
 *
 * FIX (session race): removed queueMicrotask() initial call. Admin state is now
 * driven solely by onAuthStateChange events. INITIAL_SESSION fires once Supabase
 * has finished restoring the persisted session — this is the only safe moment to
 * call verifyWithServer on mount. Subsequent SIGNED_IN / TOKEN_REFRESHED /
 * SIGNED_OUT events keep state current without causing loops.
 */
export function useAdminAuth() {
  const [role, setRole] = useState(ADMIN_ROLES.USER)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tracks the user-id whose role is currently reflected in state.
  // Used to skip redundant TOKEN_REFRESHED re-verifications for the same user.
  const activeUserIdRef = useRef(null)

  // verifyWithServer: calls server-side RPCs to resolve the admin role.
  // Takes the session directly — no extra getSession() call — so it cannot
  // race against a session that is still being restored.
  const verifyWithServer = useCallback(async (session, isMountedRef) => {
    try {
      if (!session?.user) {
        if (!isMountedRef.current) return
        setRole(ADMIN_ROLES.USER)
        setIsAdmin(false)
        setIsSuperAdmin(false)
        activeUserIdRef.current = null
        setError(null)
        setLoading(false)
        return
      }

      activeUserIdRef.current = session.user.id

      // Fetch verified server-side role & flags via SECURITY DEFINER RPCs
      const [roleRes, adminRes, superAdminRes] = await Promise.all([
        supabase.rpc('get_current_admin_role'),
        supabase.rpc('is_admin'),
        supabase.rpc('is_super_admin'),
      ])

      if (!isMountedRef.current) return

      if (roleRes.error || adminRes.error || superAdminRes.error) {
        const fetchErr = roleRes.error || adminRes.error || superAdminRes.error
        console.error('[useAdminAuth] Server verification error:', fetchErr)
        setRole(ADMIN_ROLES.USER)
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setError(fetchErr)
      } else {
        const serverRole = roleRes.data || ADMIN_ROLES.USER
        const serverIsAdmin = Boolean(adminRes.data)
        const serverIsSuperAdmin = Boolean(superAdminRes.data)

        setRole(serverRole)
        setIsAdmin(serverIsAdmin)
        setIsSuperAdmin(serverIsSuperAdmin)
        setError(null)
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('[useAdminAuth] Unexpected error:', err)
        setRole(ADMIN_ROLES.USER)
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setError(err)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Use a ref so async callbacks inside verifyWithServer can check mount status
    // without capturing a stale closure variable.
    const isMountedRef = { current: true }

    // onAuthStateChange is the single driver of admin state.
    //
    // INITIAL_SESSION — fires once on mount after Supabase has finished reading
    //   the persisted session from storage. This replaces the removed
    //   queueMicrotask() call and guarantees verifyWithServer receives a fully
    //   restored (or definitively null) session.
    //
    // SIGNED_IN — user just logged in, or session was refreshed with a new user.
    //
    // TOKEN_REFRESHED — access token silently renewed. Only re-verify if the
    //   user-id changed (should never happen but guards against edge cases).
    //   Skipping re-verify for the same user prevents a brief isAdmin=false
    //   flicker while the RPC round-trip completes.
    //
    // SIGNED_OUT — clear admin state immediately.
    //
    // PASSWORD_RECOVERY / USER_UPDATED — not relevant to admin role; ignore.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMountedRef.current) return

        switch (event) {
          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
            verifyWithServer(session, isMountedRef)
            break

          case 'TOKEN_REFRESHED':
            // Token refresh keeps the same user — no need to re-hit RPCs unless
            // the user-id somehow changed (defensive guard).
            if (session?.user?.id !== activeUserIdRef.current) {
              verifyWithServer(session, isMountedRef)
            }
            // Same user: token is fresh, existing admin state is still valid.
            break

          case 'SIGNED_OUT':
            setRole(ADMIN_ROLES.USER)
            setIsAdmin(false)
            setIsSuperAdmin(false)
            activeUserIdRef.current = null
            setError(null)
            setLoading(false)
            break

          default:
            break
        }
      }
    )

    return () => {
      isMountedRef.current = false
      subscription.unsubscribe()
    }
  }, [verifyWithServer])

  const refreshAdminAuth = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const isMountedRef = { current: true }
    await verifyWithServer(session, isMountedRef)
  }, [verifyWithServer])

  return {
    role,
    isAdmin,
    isSuperAdmin,
    loading,
    error,
    refreshAdminAuth,
  }
}
