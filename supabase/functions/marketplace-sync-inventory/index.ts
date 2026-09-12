// marketplace-sync-inventory/index.ts
// Push stock changes from local inventory to connected marketplaces.
//
// POST body: { connection_id, product_ids?: string[] }
// If product_ids not provided, syncs all mapped products with sync_stock=true.
//
// Uses the existing adjust_stock() RPC pattern for atomic updates.

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
    const { connection_id, product_ids } = body;

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

    // Get product mappings to sync
    let query = supabaseAdmin
      .from("marketplace_products")
      .select("id, marketplace_product_id, local_product_id, sync_stock, local_product:products(id, inventory(quantity))")
      .eq("connection_id", connection_id)
      .eq("sync_stock", true)
      .not("local_product_id", "is", null);

    if (product_ids && product_ids.length > 0) {
      query = query.in("local_product_id", product_ids);
    }

    const { data: mappings, error: mapError } = await query;

    if (mapError) {
      return errorResponse("Failed to load product mappings", 500);
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const mapping of mappings || []) {
      const localProduct = mapping.local_product;
      if (!localProduct?.inventory?.quantity && localProduct?.inventory?.quantity !== 0) {
        continue;
      }

      const stock = localProduct.inventory.quantity;

      try {
        const result = await provider.updateStock(
          credentials,
          mapping.marketplace_product_id,
          stock
        );

        if (result.success) {
          synced++;
          await supabaseAdmin
            .from("marketplace_products")
            .update({
              marketplace_stock: stock,
              sync_status: "synced",
              last_synced_at: new Date().toISOString(),
              sync_error: "",
            })
            .eq("id", mapping.id);
        } else {
          failed++;
          errors.push(result.error || "Stock update failed");
          await supabaseAdmin
            .from("marketplace_products")
            .update({
              sync_status: "error",
              sync_error: result.error || "Unknown error",
            })
            .eq("id", mapping.id);
        }
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : "Unknown error";
        errors.push(msg);
      }
    }

    // Log sync
    const duration = Date.now() - startTime;
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      connection_id,
      marketplace: connection.marketplace,
      sync_type: "inventory",
      direction: "outbound",
      status: failed === 0 ? "success" : synced > 0 ? "partial" : "error",
      items_synced: synced,
      items_failed: failed,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      duration_ms: duration,
    });

    return jsonResponse({
      data: { synced, failed, errors, duration_ms: duration },
    });
  } catch (err) {
    console.error("[marketplace-sync-inventory] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
