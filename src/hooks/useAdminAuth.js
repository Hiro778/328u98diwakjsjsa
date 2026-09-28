import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { ADMIN_ROLES } from '../services/adminRbacService.js'

/**
 * useAdminAuth Hook
 * Conforms strictly to @admin.md Section 1, 30, 31:
 * - Always verifies admin role and status from trusted server-side Postgres RPCs.
 * - NEVER stores or reads role from client-side persistent storage.
 * - Safe against role spoofing, client manipulation, and session expiry.
 */
export function useAdminAuth() {
  const [role, setRole] = useState(ADMIN_ROLES.USER)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const activeUserIdRef = useRef(null)

  const verifyWithServer = useCallback(async (isMounted = true) => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (!isMounted) return

      if (sessionError || !session?.user) {
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

      if (!isMounted) return

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
      if (isMounted) {
        console.error('[useAdminAuth] Unexpected error:', err)
        setRole(ADMIN_ROLES.USER)
        setIsAdmin(false)
        setIsSuperAdmin(false)
        setError(err)
      }
    } finally {
      if (isMounted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    queueMicrotask(() => {
      if (isMounted) {
        verifyWithServer(isMounted)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id !== activeUserIdRef.current || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        verifyWithServer(isMounted)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [verifyWithServer])

  const refreshAdminAuth = useCallback(async () => {
    setLoading(true)
    await verifyWithServer(true)
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
