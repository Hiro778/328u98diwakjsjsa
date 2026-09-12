// marketplace-sync-orders/index.ts
// Sync orders from marketplace to local database.
//
// POST body: { connection_id, since?: string }
// Fetches orders from marketplace API, upserts into marketplace_orders table.

import { verifyAuth, verifyConnectionOwnership } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getProvider } from "../_shared/marketplace-provider.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const startTime = Date.now();

  try {
    const auth = await verifyAuth(req);
    const body = await req.json();
    const { connection_id, since } = body;

    if (!connection_id) {
      return errorResponse("Missing connection_id");
    }

    const owns = await verifyConnectionOwnership(connection_id, auth.businessId);
    if (!owns) {
      return errorResponse("Connection not found", 404);
    }

    // Get connection
    const { data: connection } = await supabaseAdmin
      .from("marketplace_connections")
      .select("*")
      .eq("id", connection_id)
      .single();

    if (!connection || connection.status !== "connected") {
      return errorResponse("Marketplace is not connected");
    }

    // Decrypt credentials
    const credentials = JSON.parse(await decrypt(connection.credentials_encrypted));
    const provider = getProvider(connection.marketplace);

    // Fetch orders from marketplace
    const { orders, total } = await provider.fetchOrders(credentials, since);

    let synced = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        const { error: upsertError } = await supabaseAdmin
          .from("marketplace_orders")
          .upsert(
            {
              business_id: auth.businessId,
              connection_id,
              marketplace_order_id: order.marketplace_order_id,
              buyer_name: order.buyer_name,
              buyer_address: order.buyer_address,
              buyer_phone: order.buyer_phone,
              shipping_method: order.shipping_method,
              tracking_number: order.tracking_number,
              items: order.items,
              subtotal: order.subtotal,
              shipping_fee: order.shipping_fee,
              total_amount: order.total_amount,
              order_status: order.order_status,
              payment_status: order.payment_status,
              payment_method: order.payment_method,
              marketplace_created_at: order.marketplace_created_at,
              raw_data: order.raw_data,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "connection_id,marketplace_order_id" }
          );

        if (upsertError) {
          console.error("[marketplace-sync-orders] Upsert error:", upsertError);
          failed++;
        } else {
          synced++;
        }
      } catch (e) {
        console.error("[marketplace-sync-orders] Order sync error:", e);
        failed++;
      }
    }

    // Update connection last_sync_at
    await supabaseAdmin
      .from("marketplace_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: "" })
      .eq("id", connection_id);

    // Log sync
    const duration = Date.now() - startTime;
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      connection_id,
      marketplace: connection.marketplace,
      sync_type: "orders",
      direction: "inbound",
      status: failed === 0 ? "success" : synced > 0 ? "partial" : "error",
      items_synced: synced,
      items_failed: failed,
      duration_ms: duration,
      details: { total_from_marketplace: total },
    });

    return jsonResponse({
      data: {
        total_from_marketplace: total,
        synced,
        failed,
        duration_ms: duration,
      },
    });
  } catch (err) {
    console.error("[marketplace-sync-orders] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
