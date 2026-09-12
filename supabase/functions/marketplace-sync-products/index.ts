// marketplace-sync-products/index.ts
// Sync products from/to marketplace.
//
// POST body: { connection_id, action: 'pull' | 'push' }
//   pull: fetch products from marketplace → marketplace_products table
//   push: push local stock/price changes to marketplace

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
    const { connection_id, action = "pull" } = body;

    if (!connection_id) {
      return errorResponse("Missing connection_id");
    }

    // Verify ownership
    const owns = await verifyConnectionOwnership(connection_id, auth.businessId);
    if (!owns) {
      return errorResponse("Connection not found", 404);
    }

    // Get connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from("marketplace_connections")
      .select("*")
      .eq("id", connection_id)
      .single();

    if (connError || !connection) {
      return errorResponse("Connection not found", 404);
    }

    if (connection.status !== "connected") {
      return errorResponse("Marketplace is not connected");
    }

    // Decrypt credentials
    const credentials = JSON.parse(await decrypt(connection.credentials_encrypted));
    const provider = getProvider(connection.marketplace);

    if (action === "pull") {
      // Fetch products from marketplace
      const { products, total } = await provider.fetchProducts(credentials);

      let synced = 0;
      let failed = 0;

      for (const product of products) {
        try {
          // Upsert marketplace product
          const { error: upsertError } = await supabaseAdmin
            .from("marketplace_products")
            .upsert(
              {
                business_id: auth.businessId,
                connection_id,
                marketplace_product_id: product.marketplace_product_id,
                marketplace_name: product.name,
                marketplace_sku: product.sku,
                marketplace_price: product.price,
                marketplace_stock: product.stock,
                marketplace_image_url: product.image_url,
                marketplace_category: product.category,
                marketplace_status: product.status,
                sync_status: "synced",
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "connection_id,marketplace_product_id" }
            );

          if (upsertError) {
            console.error("[marketplace-sync-products] Upsert error:", upsertError);
            failed++;
          } else {
            synced++;
          }
        } catch (e) {
          console.error("[marketplace-sync-products] Product sync error:", e);
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
        sync_type: "products",
        direction: "inbound",
        status: failed === 0 ? "success" : synced > 0 ? "partial" : "error",
        items_synced: synced,
        items_failed: failed,
        duration_ms: duration,
        details: { total_from_marketplace: total },
      });

      return jsonResponse({
        data: {
          action: "pull",
          total_from_marketplace: total,
          synced,
          failed,
          duration_ms: duration,
        },
      });
    }

    if (action === "push") {
      // Push local stock/price changes to marketplace
      // Get all products with sync_direction = 'to_marketplace' or 'bidirectional'
      const { data: mappings, error: mapError } = await supabaseAdmin
        .from("marketplace_products")
        .select("*, local_product:products(id, unit_price, inventory(quantity))")
        .eq("connection_id", connection_id)
        .in("sync_direction", ["to_marketplace", "bidirectional"]);

      if (mapError) {
        return errorResponse("Failed to load product mappings", 500);
      }

      let synced = 0;
      let failed = 0;

      for (const mapping of mappings || []) {
        if (!mapping.local_product_id) continue;

        try {
          // Update stock if sync_stock is enabled
          if (mapping.sync_stock && mapping.local_product?.inventory?.quantity !== undefined) {
            const stockResult = await provider.updateStock(
              credentials,
              mapping.marketplace_product_id,
              mapping.local_product.inventory.quantity
            );
            if (!stockResult.success) {
              failed++;
              continue;
            }
          }

          // Update price if sync_price is enabled
          if (mapping.sync_price && mapping.local_product?.unit_price) {
            const priceResult = await provider.updatePrice(
              credentials,
              mapping.marketplace_product_id,
              mapping.local_product.unit_price
            );
            if (!priceResult.success) {
              failed++;
              continue;
            }
          }

          // Update mapping sync status
          await supabaseAdmin
            .from("marketplace_products")
            .update({
              sync_status: "synced",
              last_synced_at: new Date().toISOString(),
              sync_error: "",
            })
            .eq("id", mapping.id);

          synced++;
        } catch (e) {
          console.error("[marketplace-sync-products] Push error:", e);
          failed++;

          await supabaseAdmin
            .from("marketplace_products")
            .update({
              sync_status: "error",
              sync_error: e instanceof Error ? e.message : "Unknown error",
            })
            .eq("id", mapping.id);
        }
      }

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
        duration_ms: duration,
      });

      return jsonResponse({
        data: {
          action: "push",
          synced,
          failed,
          duration_ms: duration,
        },
      });
    }

    return errorResponse("Invalid action. Use 'pull' or 'push'.");
  } catch (err) {
    console.error("[marketplace-sync-products] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
