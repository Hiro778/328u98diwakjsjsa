// google-business-connect/index.ts
// Initiate Google Business Profile OAuth flow.
// POST: Generates OAuth authorization URL and returns it.

import { verifyAuth } from "../../_shared/auth.ts";
import { isProUser } from "../../_shared/entitlement.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // Check OAuth configuration
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      return jsonResponse({
        data: {
          status: "needs_setup",
          message:
            "Google Business Profile API belum dikonfigurasi. Admin perlu mengatur GOOGLE_OAUTH_CLIENT_ID dan GOOGLE_OAUTH_REDIRECT_URI.",
        },
      });
    }

    // Check if already connected
    const { data: existing } = await supabaseAdmin
      .from("google_business_connections")
      .select("id, status")
      .eq("business_id", auth.businessId)
      .eq("status", "connected")
      .single();

    if (existing) {
      return jsonResponse({
        data: {
          status: "already_connected",
          message: "Google Business Profile sudah terhubung.",
        },
      });
    }

    // Generate CSRF state
    const stateArray = new Uint8Array(32);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const ipAddress = req.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Store state with business_id + user_id binding
    const { error: insertError } = await supabaseAdmin
      .from("google_business_oauth_states")
      .insert({
        business_id: auth.businessId,
        user_id: auth.userId,
        state,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (insertError) {
      console.error("[google-business-connect] Insert error:", insertError);
      return errorResponse("Gagal menghasilkan state otorisasi");
    }

    // Update connection status to connecting
    await supabaseAdmin.from("google_business_connections").upsert(
      {
        business_id: auth.businessId,
        user_id: auth.userId,
        status: "connecting",
        last_error: "",
      },
      { onConflict: "business_id" }
    );

    // Build authorization URL
    const authorizationUrl = new URL(GOOGLE_AUTH_URL);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/business.manage"
    );
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");

    return jsonResponse({
      data: {
        authorization_url: authorizationUrl.toString(),
        state,
        expires_in: 600,
      },
    });
  } catch (err) {
    console.error("[google-business-connect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
