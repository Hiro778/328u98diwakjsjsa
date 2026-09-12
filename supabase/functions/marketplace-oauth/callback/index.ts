// marketplace-oauth/callback/index.ts
// Handle OAuth callback from marketplace authorization.
//
// POST body: { code, state }
// Validates state, exchanges code for tokens, fetches shop info, saves encrypted.
// Returns success status and shop info (no tokens exposed).

import { verifyAuth } from "../../_shared/auth.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { encrypt } from "../../_shared/crypto.ts";
import { getProvider } from "../../_shared/marketplace-provider.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    const auth = await verifyAuth(req);

    // 2. Parse request body
    const body = await req.json();
    const { code, state } = body;

    if (!code || !state) {
      return errorResponse("Missing required fields: code, state");
    }

    // 3. Validate state parameter
    const { data: stateRecord, error: stateError } = await supabaseAdmin
      .from("marketplace_oauth_states")
      .select("*")
      .eq("state", state)
      .eq("business_id", auth.businessId)
      .eq("used", false)
      .single();

    if (stateError || !stateRecord) {
      return errorResponse("Invalid or expired authorization state. Please try again.", 400);
    }

    // Check if state has expired
    if (new Date(stateRecord.expires_at) < new Date()) {
      return errorResponse("Authorization state has expired. Please try again.", 400);
    }

    // 4. Mark state as used
    await supabaseAdmin
      .from("marketplace_oauth_states")
      .update({
        used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", stateRecord.id);

    // 5. Get provider
    const marketplace = stateRecord.marketplace;
    let provider;
    try {
      provider = getProvider(marketplace);
    } catch {
      return errorResponse(`Unsupported marketplace: ${marketplace}`);
    }

    // 6. Exchange authorization code for tokens
    const exchangeResult = await provider.exchangeCode(code, state);

    if (!exchangeResult.success) {
      // Log the failure
      await supabaseAdmin.from("marketplace_sync_logs").insert({
        business_id: auth.businessId,
        marketplace,
        sync_type: "connection_test",
        status: "error",
        error_message: exchangeResult.error,
        items_synced: 0,
        items_failed: 1,
      });

      // Update connection status to error
      await supabaseAdmin
        .from("marketplace_connections")
        .upsert(
          {
            business_id: auth.businessId,
            marketplace,
            status: "error",
            authorization_status: "error",
            last_error: exchangeResult.error || "Authorization failed",
            error_count: 1,
          },
          { onConflict: "business_id,marketplace" }
        );

      return jsonResponse({
        data: {
          success: false,
          status: "error",
          error: exchangeResult.error,
        },
      });
    }

    // 7. Encrypt tokens for storage
    const tokens = exchangeResult.tokens!;
    const tokensJson = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
    });

    const encryptedTokens = await encrypt(tokensJson);

    // 8. Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // 9. Get shop info
    const shopInfo = exchangeResult.shop_info || {
      shop_id: "",
      shop_name: "Unknown Shop",
    };

    // 10. Upsert connection record
    const { data: connection, error: upsertError } = await supabaseAdmin
      .from("marketplace_connections")
      .upsert(
        {
          business_id: auth.businessId,
          marketplace,
          status: "connected",
          authorization_status: "authorized",
          access_token_encrypted: encryptedTokens,
          refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token) : null,
          token_expires_at: tokenExpiresAt,
          token_type: tokens.token_type || "bearer",
          scope: tokens.scope || "",
          shop_name: shopInfo.shop_name,
          shop_id: shopInfo.shop_id,
          shop_url: shopInfo.shop_url || "",
          shop_username: shopInfo.shop_username || "",
          shop_email: shopInfo.shop_email || "",
          shop_phone: shopInfo.shop_phone || "",
          shop_avatar_url: shopInfo.shop_avatar_url || "",
          shop_verified: shopInfo.shop_verified || false,
          last_error: "",
          error_count: 0,
        },
        { onConflict: "business_id,marketplace" }
      )
      .select("id, status, shop_name, shop_id")
      .single();

    if (upsertError) {
      console.error("[marketplace-oauth/callback] Upsert error:", upsertError);
      return errorResponse("Failed to save connection", 500);
    }

    // 11. Log success
    await supabaseAdmin.from("marketplace_sync_logs").insert({
      business_id: auth.businessId,
      connection_id: connection.id,
      marketplace,
      sync_type: "connection_test",
      status: "success",
      items_synced: 1,
      items_failed: 0,
    });

    // 12. Return success (no tokens in response)
    return jsonResponse({
      data: {
        success: true,
        status: "connected",
        connection_id: connection.id,
        shop_name: connection.shop_name,
        shop_id: connection.shop_id,
        marketplace,
      },
    });
  } catch (err) {
    console.error("[marketplace-oauth/callback] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
