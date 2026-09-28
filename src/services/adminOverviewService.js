/**
 * adminOverviewService.js
 * Gathers server-side verified statistics for Admin Dashboard Overview.
 * Conforms to @admin.md Section 3:
 * - Gunakan actual database data. Jangan membuat angka palsu.
 * - Server-side verified via get_admin_dashboard_overview RPC.
 */

import { supabase } from '../lib/supabase.js'

export async function fetchAdminOverviewStats() {
  try {
    const { data, error } = await supabase.rpc('get_admin_dashboard_overview')
    if (error) {
      console.error('[adminOverviewService] Fetch overview error:', error)
      return { data: null, error }
    }
    return { data, error: null }
  } catch (err) {
    console.error('[adminOverviewService] Unexpected exception:', err)
    return { data: null, error: err }
  }
}
