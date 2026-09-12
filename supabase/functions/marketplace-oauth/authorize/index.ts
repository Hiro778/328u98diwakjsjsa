// marketplace-oauth/authorize/index.ts
// Generate OAuth state parameter and return authorization URL.
//
// GET: Returns the authorization URL for the specified marketplace.
// The user will be redirected to the marketplace's login/authorization page.

import { verifyAuth } from "../../_shared/auth.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { getProvider } from "../../_shared/marketplace-provider.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    const auth = await verifyAuth(req);

    // 2. Get marketplace from query params
    const url = new URL(req.url);
    const marketplace = url.searchParams.get("marketplace");

    if (!marketplace) {
      return errorResponse("Missing marketplace parameter");
    }

    // 3. Check if marketplace is supported
    let provider;
    try {
      provider = getProvider(marketplace);
    } catch {
      return errorResponse(`Unsupported marketplace: ${marketplace}`);
    }

    // 4. Check if marketplace has credentials configured
    if (!provider.isConfigured()) {
      return jsonResponse({
        data: {
          status: "needs_setup",
          message: `${marketplace} belum dikonfigurasi. Hubungi admin untuk mengatur API credentials.`,
        },
      });
    }

    // 5. Generate random state parameter
    const stateArray = new Uint8Array(32);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 6. Get IP and User-Agent for audit
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 7. Store state in database (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("marketplace_oauth_states")
      .insert({
        business_id: auth.businessId,
        marketplace,
        state,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error("[marketplace-oauth/authorize] Insert error:", insertError);
      return errorResponse("Failed to generate authorization state");
    }

    // 8. Get authorization URL from provider
    const oauthConfig = provider.getOAuthConfig();
    const authorizationUrl = oauthConfig.authorization_url.replace("{state}", state);

    // 9. Update connection status to 'connecting'
    await supabaseAdmin
      .from("marketplace_connections")
      .upsert(
        {
          business_id: auth.businessId,
          marketplace,
          status: "connecting",
          authorization_status: "pending",
          last_error: "",
        },
        { onConflict: "business_id,marketplace" }
      );

    // 10. Log the authorization attempt
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      marketplace,
      sync_type: "connection_test",
      status: "success",
      items_synced: 0,
      items_failed: 0,
    });

    // 11. Return authorization URL (no credentials exposed)
    return jsonResponse({
      data: {
        authorization_url: authorizationUrl,
        marketplace,
        state,
        expires_in: 600, // 10 minutes
      },
    });
  } catch (err) {
    console.error("[marketplace-oauth/authorize] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
