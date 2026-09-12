// google-business-callback/index.ts
// Handle Google OAuth callback.
// POST body: { code, state }
// Validates state, exchanges code for tokens, fetches accounts & locations.

import { verifyAuth } from "../../_shared/auth.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { encrypt } from "../../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ACCOUNTS_URL =
  "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const GOOGLE_LOCATIONS_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const LOCATIONS_READ_MASK =
  "title,storeCode,websiteUri,phoneNumbers,categories,metadata";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);
    const body = await req.json();
    const { code, state } = body;

    if (!code || !state) {
      return errorResponse("Missing required fields: code, state");
    }

    // 1. Validate state
    const { data: stateRecord, error: stateError } = await supabaseAdmin
      .from("google_business_oauth_states")
      .select("*")
      .eq("state", state)
      .eq("business_id", auth.businessId)
      .eq("user_id", auth.userId)
      .eq("used", false)
      .single();

    if (stateError || !stateRecord) {
      return errorResponse(
        "State otorisasi tidak valid atau kedaluwarsa. Silakan coba lagi.",
        400
      );
    }

    if (new Date(stateRecord.expires_at) < new Date()) {
      return errorResponse(
        "State otorisasi sudah kedaluwarsa. Silakan coba lagi.",
        400
      );
    }

    // Mark state as used (replay protection)
    await supabaseAdmin
      .from("google_business_oauth_states")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", stateRecord.id);

    // 2. Exchange code for tokens
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return errorResponse("Google OAuth tidak dikonfigurasi di server", 500);
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || tokens.error) {
      console.error("[google-business-callback] Token exchange error:", tokens);

      await supabaseAdmin
        .from("google_business_connections")
        .upsert(
          {
            business_id: auth.businessId,
            user_id: auth.userId,
            status: "error",
            last_error: tokens.error_description || tokens.error || "Token exchange failed",
          },
          { onConflict: "business_id" }
        );

      return jsonResponse({
        data: {
          success: false,
          status: "error",
          error: "Gagal menukar kode otorisasi. Silakan coba lagi.",
        },
      });
    }

    if (!tokens.refresh_token) {
      console.error("[google-business-callback] No refresh token returned");
      return jsonResponse({
        data: {
          success: false,
          status: "error",
          error:
            "Google tidak mengembalikan refresh token. Silakan coba lagi dengan consent.",
        },
      });
    }

    // 3. Encrypt refresh token
    const encryptedRefreshToken = await encrypt(tokens.refresh_token);
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // 4. Fetch Google accounts
    const accountsResponse = await fetch(GOOGLE_ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const accountsData = await accountsResponse.json();

    if (!accountsResponse.ok || accountsData.error) {
      console.error("[google-business-callback] Accounts fetch error:", accountsData);

      // Check for API not enabled / not approved
      const errCode = accountsData.error?.code;
      const errMsg = accountsData.error?.message || "";

      let userError = "Gagal mengambil akun Google.";
      if (errCode === 403) {
        userError =
          "Akses API belum disetujui. Google Business Profile API perlu disetujui oleh Google sebelum dapat digunakan.";
      } else if (errCode === 401) {
        userError = "Otorisasi Google gagal. Silakan coba lagi.";
      }

      // Still save connection as error so user knows what happened
      await supabaseAdmin
        .from("google_business_connections")
        .upsert(
          {
            business_id: auth.businessId,
            user_id: auth.userId,
            google_account_id: "",
            google_account_name: "",
            refresh_token_encrypted: encryptedRefreshToken,
            token_expires_at: tokenExpiresAt,
            scope: tokens.scope || "",
            status: "error",
            last_error: userError,
          },
          { onConflict: "business_id" }
        );

      return jsonResponse({
        data: {
          success: false,
          status: "error",
          error: userError,
          error_code: errCode,
        },
      });
    }

    const accounts = accountsData.accounts || [];

    if (accounts.length === 0) {
      // No accounts — save connection but note it
      await supabaseAdmin
        .from("google_business_connections")
        .upsert(
          {
            business_id: auth.businessId,
            user_id: auth.userId,
            google_account_id: "",
            google_account_name: "",
            refresh_token_encrypted: encryptedRefreshToken,
            token_expires_at: tokenExpiresAt,
            scope: tokens.scope || "",
            status: "connected",
            connected_at: new Date().toISOString(),
            last_error: "",
          },
          { onConflict: "business_id" }
        );

      return jsonResponse({
        data: {
          success: true,
          status: "connected",
          accounts: [],
          locations: [],
          message: "Tidak ada akun Business Profile yang ditemukan.",
        },
      });
    }

    // Use first account (most users have one)
    const account = accounts[0];
    const accountId = account.accountId || account.name?.replace("accounts/", "") || "";
    const accountName = account.accountName || account.name || "";

    // 5. Save connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from("google_business_connections")
      .upsert(
        {
          business_id: auth.businessId,
          user_id: auth.userId,
          google_account_id: accountId,
          google_account_name: accountName,
          refresh_token_encrypted: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          scope: tokens.scope || "",
          status: "connected",
          connected_at: new Date().toISOString(),
          last_error: "",
        },
        { onConflict: "business_id" }
      )
      .select("id")
      .single();

    if (connError) {
      console.error("[google-business-callback] Connection save error:", connError);
      return errorResponse("Gagal menyimpan koneksi", 500);
    }

    // 6. Fetch locations from Business Information API v1
    const locationsUrl = `${GOOGLE_LOCATIONS_BASE}/accounts/${accountId}/locations?readMask=${LOCATIONS_READ_MASK}`;
    const locationsResponse = await fetch(locationsUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const locationsData = await locationsResponse.json();
    const locations = locationsData.locations || [];

    // 7. Save locations
    const savedLocations = [];
    for (const loc of locations) {
      const locName = loc.name?.replace(`accounts/${accountId}/locations/`, "") || "";
      const title = loc.title || "";
      const addressParts = loc.address?.addressLines?.join(", ") || "";
      const category = loc.categories?.primaryCategory?.displayName || "";
      const state = loc.storefrontAddress?.regionCode || loc.address?.regionCode || "";
      const phone = loc.phoneNumbers?.primaryPhone || "";
      const website = loc.websiteUri || "";

      // Build maps URL
      const mapsUrl = loc.name
        ? `https://www.google.com/maps/place/?q=place_id:${loc.name}`
        : "";

      const { data: savedLoc } = await supabaseAdmin
        .from("google_business_locations")
        .upsert(
          {
            connection_id: connection.id,
            business_id: auth.businessId,
            google_account_id: accountId,
            google_location_id: locName,
            location_name: title,
            address: addressParts,
            category,
            state,
            phone_number: phone,
            website_uri: website,
            maps_url: mapsUrl,
            profile_url: "",
            synced_at: new Date().toISOString(),
          },
          { onConflict: "connection_id,google_location_id" }
        )
        .select()
        .single();

      if (savedLoc) savedLocations.push(savedLoc);
    }

    return jsonResponse({
      data: {
        success: true,
        status: "connected",
        account_name: accountName,
        account_id: accountId,
        locations: savedLocations.map((l) => ({
          id: l.id,
          google_location_id: l.google_location_id,
          name: l.location_name,
          address: l.address,
          category: l.category,
        })),
      },
    });
  } catch (err) {
    console.error("[google-business-callback] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
