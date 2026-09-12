// whatsapp-exchange-token/index.ts
// Exchange Embedded Signup token code for a business integration token.
// Subscribe WABA to webhooks and register phone number.
//
// POST body: { code, waba_id, phone_number_id, state }
//
// This is called by the frontend immediately after Embedded Signup completes.
// The token code has a 30-second TTL — must be exchanged immediately.
//
// Tech Provider flow (per Meta docs):
// 1. Exchange code → business token (via OAuth endpoint)
// 2. Subscribe app to WABA webhooks
// 3. Register phone number for Cloud API
// 4. Store connection

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { encrypt } from "../_shared/crypto.ts";
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
    const { code, waba_id, phone_number_id, state, config_id } = body;

    if (!code || !waba_id || !phone_number_id) {
      return errorResponse(
        "Missing required fields: code, waba_id, phone_number_id"
      );
    }

    // 3. Validate state parameter
    if (state) {
      const { data: stateRecord } = await supabaseAdmin
        .from("whatsapp_oauth_states")
        .select("id, expires_at, used")
        .eq("state", state)
        .eq("business_id", auth.businessId)
        .eq("used", false)
        .maybeSingle();

      if (!stateRecord) {
        return errorResponse(
          "Invalid authorization state. Please try again.",
          400
        );
      }

      if (new Date(stateRecord.expires_at) < new Date()) {
        return errorResponse(
          "Authorization state has expired. Please try again.",
          400
        );
      }

      // Mark state as used
      await supabaseAdmin
        .from("whatsapp_oauth_states")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("id", stateRecord.id);
    }

    // 4. Get Meta credentials from environment
    const metaAppId = Deno.env.get("WHATSAPP_META_APP_ID");
    const metaAppSecret = Deno.env.get("WHATSAPP_META_APP_SECRET");
    const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION");

    if (!metaAppId || !metaAppSecret || !graphVersion) {
      return errorResponse(
        "WhatsApp Meta credentials not configured. Contact admin.",
        500
      );
    }

    // 5. Exchange code for business integration token (30s TTL — must be immediate)
    //    Per Meta Tech Provider docs: GET /oauth/access_token
    const tokenExchangeUrl = `https://graph.facebook.com/${graphVersion}/oauth/access_token?client_id=${metaAppId}&client_secret=${metaAppSecret}&code=${code}`;

    const tokenRes = await fetch(tokenExchangeUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      const errCode = tokenData.error?.code || "unknown";
      const errMsg = tokenData.error?.message || "Token exchange failed";
      console.error(
        `[whatsapp-exchange-token] Token exchange failed: code=${errCode} msg=${errMsg}`
      );

      await supabaseAdmin
        .from("whatsapp_business_connections")
        .upsert(
          {
            business_id: auth.businessId,
            status: "error",
            last_error: errMsg,
            error_count: 1,
          },
          { onConflict: "business_id" }
        );

      return jsonResponse({
        data: {
          success: false,
          status: "error",
          error: errMsg,
        },
      });
    }

    const businessToken = tokenData.access_token;

    // 6. Subscribe app to WABA webhooks
    //    Per Meta docs: POST /{WABA_ID}/subscribed_apps
    const subscribeUrl = `https://graph.facebook.com/${graphVersion}/${waba_id}/subscribed_apps`;

    const subscribeRes = await fetch(subscribeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${businessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!subscribeRes.ok) {
      const subscribeData = await subscribeRes.json();
      const subscribeErr =
        subscribeData.error?.message || `HTTP ${subscribeRes.status}`;
      console.error(
        `[whatsapp-exchange-token] Webhook subscribe failed: ${subscribeErr}`
      );

      // Still save the connection — webhook can be configured later
      // But report the error
    }

    // 7. Register phone number for Cloud API
    //    Per Meta docs: POST /{PHONE_NUMBER_ID}/register
    const registerUrl = `https://graph.facebook.com/${graphVersion}/${phone_number_id}/register`;

    const registerRes = await fetch(registerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${businessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
      }),
    });

    // Register may fail if already registered — that's OK
    if (!registerRes.ok) {
      const registerData = await registerRes.json();
      const registerErr = registerData.error?.message || "unknown";
      console.warn(
        `[whatsapp-exchange-token] Phone register result: ${registerErr}`
      );
      // Continue — phone may already be registered
    }

    // 8. Get WABA details for display
    let businessName = "";
    let verifiedName = "";
    let displayPhoneNumber = "";

    try {
      const wabaDetailsUrl = `https://graph.facebook.com/${graphVersion}/${waba_id}?fields=name`;
      const wabaDetailsRes = await fetch(wabaDetailsUrl, {
        headers: { Authorization: `Bearer ${businessToken}` },
      });
      if (wabaDetailsRes.ok) {
        const wabaDetails = await wabaDetailsRes.json();
        businessName = wabaDetails.name || "";
      }
    } catch {
      // Non-critical — continue without business name
    }

    try {
      const phoneDetailsUrl = `https://graph.facebook.com/${graphVersion}/${phone_number_id}?fields;display_phone_number,verified_name`;
      const phoneDetailsRes = await fetch(phoneDetailsUrl, {
        headers: { Authorization: `Bearer ${businessToken}` },
      });
      if (phoneDetailsRes.ok) {
        const phoneDetails = await phoneDetailsRes.json();
        displayPhoneNumber = phoneDetails.display_phone_number || "";
        verifiedName = phoneDetails.verified_name || "";
      }
    } catch {
      // Non-critical — continue without phone details
    }

    // 9. Encrypt the business token for storage
    const accessTokenEncrypted = await encrypt(businessToken);
    const appSecretEncrypted = await encrypt(metaAppSecret);

    // 10. Generate webhook verify token
    const verifyTokenArray = new Uint8Array(32);
    crypto.getRandomValues(verifyTokenArray);
    const webhookVerifyToken = Array.from(verifyTokenArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 11. Upsert connection record
    const { data: connection, error: upsertError } = await supabaseAdmin
      .from("whatsapp_business_connections")
      .upsert(
        {
          business_id: auth.businessId,
          status: "connected",
          phone_number_id: phone_number_id,
          display_phone_number: displayPhoneNumber,
          whatsapp_business_id: waba_id,
          waba_id: waba_id,
          app_id: metaAppId,
          config_id: config_id || "",
          business_name: businessName,
          verified_name: verifiedName,
          access_token_encrypted: accessTokenEncrypted,
          app_secret_encrypted: appSecretEncrypted,
          webhook_verify_token: webhookVerifyToken,
          webhook_secret: webhookVerifyToken,
          last_error: "",
          error_count: 0,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
        },
        { onConflict: "business_id" }
      )
      .select("id, status, display_phone_number, business_name")
      .single();

    if (upsertError) {
      console.error(
        "[whatsapp-exchange-token] Upsert error:",
        upsertError
      );
      return errorResponse("Failed to save connection", 500);
    }

    // 12. Log success (SAFE metadata only)
    await supabaseAdmin.from("whatsapp_webhook_logs").insert({
      business_id: auth.businessId,
      connection_id: connection.id,
      event_type: "connection_established",
      phone_number_id: phone_number_id,
      status: "logged",
      payload: {
        action: "embedded_signup_complete",
        waba_id: waba_id,
        phone_number_id: phone_number_id,
      },
    });

    // 13. Return success (NO tokens in response)
    return jsonResponse({
      data: {
        success: true,
        status: "connected",
        connection_id: connection.id,
        phone_number: connection.display_phone_number,
        business_name: connection.business_name,
      },
    });
  } catch (err) {
    console.error("[whatsapp-exchange-token] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
