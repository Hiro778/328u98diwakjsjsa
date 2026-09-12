// google-business-status/index.ts
// Return current Google Business Profile connection status.
// GET: Returns connection info, locations, and feature availability.

import { verifyAuth } from "../../_shared/auth.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { decrypt } from "../../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function refreshAccessToken(
  refreshTokenEncrypted: string
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const refreshToken = await decrypt(refreshTokenEncrypted);
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

    if (!clientId || !clientSecret) return null;

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("[google-business-status] Token refresh failed:", data);
      return null;
    }

    return { access_token: data.access_token, expires_in: data.expires_in };
  } catch (err) {
    console.error("[google-business-status] Token refresh error:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);

    // Check if OAuth is configured
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!clientId) {
      return jsonResponse({
        data: {
          configured: false,
          status: "needs_setup",
          message:
            "Google Business Profile API belum dikonfigurasi oleh admin.",
        },
      });
    }

    // Get connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from("google_business_connections")
      .select("*")
      .eq("business_id", auth.businessId)
      .single();

    if (connError || !connection) {
      return jsonResponse({
        data: {
          configured: true,
          status: "not_connected",
          connection: null,
          locations: [],
        },
      });
    }

    // If token expired, try refresh
    if (
      connection.status === "connected" &&
      connection.token_expires_at &&
      new Date(connection.token_expires_at) < new Date()
    ) {
      if (connection.refresh_token_encrypted) {
        const newTokens = await refreshAccessToken(
          connection.refresh_token_encrypted
        );

        if (newTokens) {
          const newExpiresAt = new Date(
            Date.now() + newTokens.expires_in * 1000
          ).toISOString();

          await supabaseAdmin
            .from("google_business_connections")
            .update({
              token_expires_at: newExpiresAt,
              status: "connected",
              last_error: "",
            })
            .eq("id", connection.id);
        } else {
          // Refresh failed — token may be revoked
          await supabaseAdmin
            .from("google_business_connections")
            .update({
              status: "token_expired",
              last_error: "Refresh token expired atau dicabut. Silakan hubungkan ulang.",
            })
            .eq("id", connection.id);

          connection.status = "token_expired";
          connection.last_error =
            "Refresh token expired atau dicabut. Silakan hubungkan ulang.";
        }
      } else {
        connection.status = "token_expired";
        connection.last_error = "Tidak ada refresh token tersimpan.";
      }
    }

    // Get locations
    const { data: locations } = await supabaseAdmin
      .from("google_business_locations")
      .select("*")
      .eq("connection_id", connection.id)
      .order("location_name");

    // Return safe data (no tokens, no secrets)
    return jsonResponse({
      data: {
        configured: true,
        status: connection.status,
        connection: {
          id: connection.id,
          google_account_id: connection.google_account_id,
          google_account_name: connection.google_account_name,
          status: connection.status,
          last_error: connection.last_error,
          connected_at: connection.connected_at,
        },
        locations: (locations || []).map((l) => ({
          id: l.id,
          google_location_id: l.google_location_id,
          location_name: l.location_name,
          address: l.address,
          category: l.category,
          state: l.state,
          phone_number: l.phone_number,
          website_uri: l.website_uri,
          maps_url: l.maps_url,
          profile_url: l.profile_url,
          reviews_enabled: l.reviews_enabled,
          posts_enabled: l.posts_enabled,
          performance_enabled: l.performance_enabled,
          synced_at: l.synced_at,
        })),
      },
    });
  } catch (err) {
    console.error("[google-business-status] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
