// whatsapp-disconnect/index.ts
// Disconnect WhatsApp Business connection.
//
// POST body: { connection_id }
// Revokes access token server-side, updates status to disconnected.
// Does NOT delete webhook logs or message queue (audit trail preserved).

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    let auth;
    try {
      auth = await verifyAuth(req);
    } catch (authErr) {
      return errorResponse(
        authErr instanceof Error ? authErr.message : "Unauthorized",
        401
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { connection_id } = body;

    if (!connection_id) {
      return errorResponse("Missing required field: connection_id");
    }

    // 3. Verify connection ownership
    const { data: connection, error: fetchError } = await supabaseAdmin
      .from("whatsapp_business_connections")
      .select("id, business_id, status, access_token_encrypted, phone_number_id")
      .eq("id", connection_id)
      .eq("business_id", auth.businessId)
      .single();

    if (fetchError || !connection) {
      return errorResponse("Connection not found", 404);
    }

    if (connection.status === "disconnected") {
      return jsonResponse({
        data: {
          success: true,
          message: "Connection is already disconnected.",
        },
      });
    }

    // 4. Revoke access token server-side (best-effort, but report result)
    let revokeSuccess = false;
    let revokeError = null;

    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION");
    if (!graphVersion) {
      console.error("[whatsapp-disconnect] WHATSAPP_GRAPH_API_VERSION not configured");
      return errorResponse("WhatsApp Graph API version not configured", 500);
    }

    if (connection.access_token_encrypted) {
      try {
        const accessToken = await decrypt(connection.access_token_encrypted);

        // Revoke token via Meta Graph API
        const revokeUrl = `https://graph.facebook.com/${graphVersion}/me/permissions?access_token=${accessToken}`;
        const revokeRes = await fetch(revokeUrl, { method: "DELETE" });

        if (revokeRes.ok) {
          revokeSuccess = true;
        } else {
          // SECURITY: Don't log raw response body (may contain token info)
          revokeError = `HTTP ${revokeRes.status}`;
          console.error(
            `[whatsapp-disconnect] Token revocation failed: HTTP ${revokeRes.status}`
          );
        }
      } catch (decryptErr) {
        revokeError = "decrypt_error";
        console.error(
          "[whatsapp-disconnect] Decrypt error during revocation:",
          decryptErr
        );
      }
    }

    // 5. Update connection status to disconnected + clear ALL credentials
    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_business_connections")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        app_secret_encrypted: null,
        webhook_secret: null,
        webhook_verify_token: null,
        disconnected_at: new Date().toISOString(),
        last_error: revokeSuccess ? "" : `Revoke failed: ${revokeError || "unknown"}`,
      })
      .eq("id", connection_id)
      .eq("business_id", auth.businessId);

    if (updateError) {
      console.error("[whatsapp-disconnect] Update error:", updateError);
      return errorResponse("Failed to disconnect", 500);
    }

    // 6. Log the disconnect event (audit trail)
    await supabaseAdmin.from("whatsapp_webhook_logs").insert({
      business_id: auth.businessId,
      connection_id: connection.id,
      event_type: "connection_disconnected",
      phone_number_id: connection.phone_number_id,
      status: revokeSuccess ? "logged" : "error",
      payload: {
        action: "disconnect",
        initiated_by: "user",
        revoke_success: revokeSuccess,
        revoke_error: revokeError,
      },
    });

    // 7. Return result — include revocation status so UI can warn if revoke failed
    return jsonResponse({
      data: {
        success: true,
        disconnected: true,
        revoke_success: revokeSuccess,
        revoke_error: revokeSuccess ? null : revokeError,
        message: revokeSuccess
          ? "WhatsApp Business connection has been disconnected."
          : "Connection disconnected, but token revocation failed. The token may still be active on Meta's side.",
      },
    });
  } catch (err) {
    console.error("[whatsapp-disconnect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
