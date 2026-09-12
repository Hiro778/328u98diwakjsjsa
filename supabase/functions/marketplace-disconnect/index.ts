// marketplace-disconnect/index.ts
// Disconnect a marketplace connection: clear tokens, update status.
//
// POST body: { connection_id }

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { verifyConnectionOwnership } from "../_shared/auth.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);

    const body = await req.json();
    const { connection_id } = body;

    if (!connection_id) {
      return errorResponse("Missing required field: connection_id");
    }

    // Verify ownership
    const owned = await verifyConnectionOwnership(connection_id, auth.businessId);
    if (!owned) {
      return errorResponse("Connection not found or access denied", 404);
    }

    // Update connection: clear tokens, set status to disconnected
    const { error: updateError } = await supabaseAdmin
      .from("marketplace_connections")
      .update({
        status: "disconnected",
        authorization_status: "not_started",
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        scope: "",
        last_error: "",
        error_count: 0,
      })
      .eq("id", connection_id)
      .eq("business_id", auth.businessId);

    if (updateError) {
      console.error("[marketplace-disconnect] Update error:", updateError);
      return errorResponse("Failed to disconnect", 500);
    }

    // Log the disconnection
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      connection_id,
      marketplace: "",
      sync_type: "connection_test",
      status: "success",
      error_message: "User disconnected",
      items_synced: 0,
      items_failed: 0,
    });

    return jsonResponse({
      data: { success: true },
    });
  } catch (err) {
    console.error("[marketplace-disconnect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
