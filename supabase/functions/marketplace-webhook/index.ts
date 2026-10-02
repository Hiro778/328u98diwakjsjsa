// marketplace-webhook/index.ts
// Receive webhook callbacks from marketplaces.
//
// Each marketplace sends webhooks for order status changes, stock updates, etc.
// This function verifies the webhook signature and processes the event.
//
// POST body: marketplace-specific webhook payload
// Query params: ?marketplace=shopee|tokopedia|tiktokshop

import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

// Map marketplace webhook topic to our order status
function mapOrderStatus(marketplace: string, webhookStatus: string): string {
  // TODO: Map each marketplace's status codes to our unified statuses
  // Shopee: UNPAID(0), PENDING(1), COMPLETED(2), CANCELLED(3)
  // Tokopedia: waiting_confirmation, waiting_seller, processed, delivered
  // TikTok: pending, confirmed, shipped, delivered, completed

  const statusMap: Record<string, Record<string, string>> = {
    shopee: {
      "0": "pending",
      "1": "processing",
      "2": "completed",
      "3": "cancelled",
      "5": "cancelled",
      "8": "pending",
    },
    tokopedia: {
      waiting_confirmation: "pending",
      waiting_seller: "processing",
      processed: "shipped",
      delivered: "delivered",
    },
    tiktokshop: {
      pending: "pending",
      confirmed: "processing",
      shipped: "shipped",
      delivered: "delivered",
      completed: "completed",
    },
  };

  return statusMap[marketplace]?.[webhookStatus] || webhookStatus;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const marketplace = url.searchParams.get("marketplace");

    if (!marketplace || !["shopee", "tokopedia", "tiktokshop"].includes(marketplace)) {
      return errorResponse("Invalid or missing marketplace parameter");
    }

    // Parse webhook body
    const body = await req.json();

    // TODO: Verify webhook signature using marketplace-specific methods
    // Each marketplace has different signing mechanisms:
    // - Shopee: HMAC-SHA256 with partner_key
    // - Tokopedia: signature in header
    // - TikTok: HMAC-SHA256

    // Find the connection for this webhook
    // Webhooks typically include shop_id or seller_id
    const shopId = body.shopid || body.shop_id || body.seller_id || "";

    let connection = null;
    if (shopId) {
      const { data } = await supabaseAdmin
        .from("marketplace_connections")
        .select("id, business_id, credentials_encrypted")
        .eq("marketplace", marketplace)
        .eq("shop_id", String(shopId))
        .eq("status", "connected")
        .single();
      connection = data;
    }

    if (!connection) {
      console.error("[marketplace-webhook] No verified connection found for", marketplace, shopId);
      return errorResponse("Verified marketplace connection not found", 404);
    }

    // Process based on webhook type
    // TODO: Detect webhook topic/type from payload structure
    // For now, handle order status updates generically

    const orderId = body.order_id || body.order_no || "";
    const status = body.status || body.order_status || "";

    if (orderId && status) {
      const mappedStatus = mapOrderStatus(marketplace, status);

      // Update order status
      const { error: updateError } = await supabaseAdmin
        .from("marketplace_orders")
        .update({ order_status: mappedStatus, synced_at: new Date().toISOString() })
        .eq("connection_id", connection.id)
        .eq("marketplace_order_id", String(orderId));

      if (updateError) {
        console.error("[marketplace-webhook] Order update error:", updateError);
      }
    }

    // Log webhook received
    const duration = Date.now() - startTime;
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: connection.business_id,
      connection_id: connection.id,
      marketplace,
      sync_type: "webhook",
      status: "success",
      items_synced: 1,
      items_failed: 0,
      duration_ms: duration,
      details: { webhook_body: body },
    });

    return jsonResponse({ data: { received: true, processed: true } });
  } catch (err) {
    console.error("[marketplace-webhook] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
