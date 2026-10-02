// marketplace-connect/index.ts
// Initiate marketplace OAuth connection flow.
//
// POST body: { marketplace }
// Returns: { authorization_url, state, marketplace, status }
//
// This function:
// 1. Generates a random state parameter
// 2. Stores it in the database with TTL
// 3. Returns the marketplace's authorization URL
// 4. The frontend then redirects the user to that URL

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { getProvider } from "../_shared/marketplace-provider.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side (sec.md)
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // 2. Parse request body
    const body = await req.json();
    const { marketplace } = body;

    if (!marketplace) {
      return errorResponse("Missing required field: marketplace");
    }

    // 3. Get provider and check if configured
    let provider;
    try {
      provider = getProvider(marketplace);
    } catch {
      return errorResponse(`Unsupported marketplace: ${marketplace}`);
    }

    if (!provider.isConfigured()) {
      return jsonResponse({
        data: {
          status: "needs_setup",
          marketplace,
          message: `${marketplace} belum dikonfigurasi. Hubungi admin untuk mengatur API credentials.`,
        },
      });
    }

    // 4. Generate random state parameter
    const stateArray = new Uint8Array(32);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 5. Get IP and User-Agent for audit
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // 6. Store state in database (expires in 10 minutes)
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
      console.error("[marketplace-connect] Insert state error:", insertError);
      return errorResponse("Failed to generate authorization state");
    }

    // 7. Get authorization URL from provider
    const oauthConfig = provider.getOAuthConfig();
    const authorizationUrl = oauthConfig.authorization_url.replace("{state}", state);

    // 8. Update/create connection with connecting status
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

    // 9. Log the authorization attempt
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      marketplace,
      sync_type: "connection_test",
      status: "success",
      items_synced: 0,
      items_failed: 0,
    });

    // 10. Return authorization URL (no credentials in response)
    return jsonResponse({
      data: {
        authorization_url: authorizationUrl,
        marketplace,
        state,
        expires_in: 600, // 10 minutes
      },
    });
  } catch (err) {
    console.error("[marketplace-connect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
