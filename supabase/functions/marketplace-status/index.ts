// marketplace-status/index.ts
// Get connection status and sync summary for the dashboard.
//
// GET: Returns all connections, sync stats, and recent logs for a business.
// Does NOT expose credentials.

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side (sec.md)
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // 1. Get all connections (no credentials exposed)
    const { data: connections, error: connError } = await supabaseAdmin
      .from("marketplace_connections")
      .select("id, marketplace, status, shop_name, shop_id, last_sync_at, last_error, error_count, created_at, updated_at")
      .eq("business_id", auth.businessId)
      .order("created_at");

    if (connError) {
      console.error("[marketplace-status] Connection query error:", connError);
      return errorResponse("Failed to load connections", 500);
    }

    // 2. Get product sync stats
    const { count: totalProducts } = await supabaseAdmin
      .from("marketplace_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId);

    const { count: syncedProducts } = await supabaseAdmin
      .from("marketplace_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId)
      .eq("sync_status", "synced");

    const { count: errorProducts } = await supabaseAdmin
      .from("marketplace_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId)
      .eq("sync_status", "error");

    // 3. Get order stats
    const { count: totalOrders } = await supabaseAdmin
      .from("marketplace_orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId);

    const { count: pendingOrders } = await supabaseAdmin
      .from("marketplace_orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId)
      .eq("order_status", "pending");

    // 4. Get recent sync logs (last 10)
    const { data: recentLogs } = await supabaseAdmin
      .from("marketplace_sync_logs")
      .select("id, marketplace, sync_type, status, items_synced, items_failed, error_message, duration_ms, created_at")
      .eq("business_id", auth.businessId)
      .order("created_at", { ascending: false })
      .limit(10);

    // 5. Get sync error count (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentErrors } = await supabaseAdmin
      .from("marketplace_sync_logs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", auth.businessId)
      .eq("status", "error")
      .gte("created_at", oneDayAgo);

    return jsonResponse({
      data: {
        connections: connections || [],
        stats: {
          connected_count: (connections || []).filter((c) => c.status === "connected").length,
          total_marketplaces: (connections || []).length || 3,
          total_products: totalProducts || 0,
          synced_products: syncedProducts || 0,
          error_products: errorProducts || 0,
          total_orders: totalOrders || 0,
          pending_orders: pendingOrders || 0,
          recent_errors: recentErrors || 0,
        },
        recent_logs: recentLogs || [],
      },
    });
  } catch (err) {
    console.error("[marketplace-status] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
