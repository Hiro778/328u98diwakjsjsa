// whatsapp-connect/index.ts
// Return Embedded Signup configuration for the frontend.
//
// POST body: (empty)
// Returns: { config_id, app_id, graph_version }
//
// The frontend uses these values to call FB.login() with the
// official Meta Embedded Signup flow. No OAuth URL is generated
// server-side — the Facebook JS SDK handles the entire flow.
//
// Phase 1.5: Official Meta Embedded Signup v4.

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
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

    // 2. Check if Meta credentials are configured
    const metaAppId = Deno.env.get("WHATSAPP_META_APP_ID");
    const configId = Deno.env.get("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION");

    if (!metaAppId || !configId || !graphVersion) {
      return jsonResponse({
        data: {
          status: "needs_setup",
          message:
            "Integrasi WhatsApp belum dikonfigurasi oleh admin. Hubungi admin untuk mengatur Meta App credentials.",
        },
      });
    }

    // 3. Check if already connected
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_business_connections")
      .select("id, status")
      .eq("business_id", auth.businessId)
      .eq("status", "connected")
      .maybeSingle();

    if (existing) {
      return jsonResponse({
        data: {
          status: "already_connected",
          message: "WhatsApp Business sudah terhubung.",
          connection_id: existing.id,
        },
      });
    }

    // 4. Generate state for CSRF protection (stored for validation)
    const stateArray = new Uint8Array(32);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("whatsapp_oauth_states")
      .insert({
        business_id: auth.businessId,
        state,
        expires_at: expiresAt,
        ip_address:
          req.headers.get("x-forwarded-for") ||
          req.headers.get("x-real-ip") ||
          "unknown",
        user_agent: req.headers.get("user-agent") || "unknown",
      });

    if (insertError) {
      console.error("[whatsapp-connect] Insert state error:", insertError);
      return errorResponse("Failed to generate authorization state");
    }

    // 5. Upsert connection with connecting status
    await supabaseAdmin
      .from("whatsapp_business_connections")
      .upsert(
        {
          business_id: auth.businessId,
          status: "connecting",
          last_error: "",
          error_count: 0,
        },
        { onConflict: "business_id" }
      );

    // 6. Return Embedded Signup config (no secrets exposed)
    return jsonResponse({
      data: {
        config_id: configId,
        app_id: metaAppId,
        graph_version: graphVersion,
        state,
      },
    });
  } catch (err) {
    console.error("[whatsapp-connect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
