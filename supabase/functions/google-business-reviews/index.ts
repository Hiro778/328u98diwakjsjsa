// google-business-reviews/index.ts
// List and reply to Google Business Profile reviews.
// Uses Google My Business API v4 (active, not deprecated).
//
// GET:  List reviews for a location
// POST: Reply to a review (or update existing reply)
// DELETE: Remove reply from a review

import { verifyAuth } from "../../_shared/auth.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { decrypt } from "../../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";

async function getAccessToken(
  connection: { refresh_token_encrypted: string; token_expires_at: string | null }
): Promise<string | null> {
  try {
    // Check if token is still valid (with 5min buffer)
    if (
      connection.token_expires_at &&
      new Date(connection.token_expires_at) > new Date(Date.now() + 5 * 60 * 1000)
    ) {
      // Token still valid, but we don't store access tokens — always refresh
    }

    const refreshToken = await decrypt(connection.refresh_token_encrypted);
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
    if (!response.ok || data.error) return null;
    return data.access_token;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // Get connection
    const { data: connection } = await supabaseAdmin
      .from("google_business_connections")
      .select("id, google_account_id, refresh_token_encrypted, token_expires_at, status")
      .eq("business_id", auth.businessId)
      .eq("status", "connected")
      .single();

    if (!connection) {
      return errorResponse("Google Business Profile belum terhubung.", 400);
    }

    const accessToken = await getAccessToken(connection);
    if (!accessToken) {
      return errorResponse(
        "Gagal memperbarui sesi Google. Silakan hubungkan ulang.",
        401
      );
    }

    // Parse query params
    const url = new URL(req.url);
    const locationId = url.searchParams.get("location_id");

    if (!locationId) {
      return errorResponse("location_id diperlukan");
    }

    const accountId = connection.google_account_id;

    // ── GET: List reviews ──
    if (req.method === "GET") {
      const pageSize = url.searchParams.get("page_size") || "20";
      const pageToken = url.searchParams.get("page_token") || "";

      let apiUrl = `${GBP_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews?pageSize=${pageSize}`;
      if (pageToken) {
        apiUrl += `&pageToken=${pageToken}`;
      }

      const response = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json();

      if (!response.ok) {
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";

        if (errCode === 403) {
          return jsonResponse({
            data: {
              available: false,
              error: "not_approved",
              message:
                "API Reviews belum mendapat akses. Google My Business API perlu disetujui.",
            },
          });
        }

        return errorResponse(errMsg || "Gagal mengambil ulasan", errCode || 500);
      }

      return jsonResponse({
        data: {
          available: true,
          reviews: data.reviews || [],
          totalReviewCount: data.totalReviewCount || 0,
          nextPageToken: data.nextPageToken || null,
          averageRating: data.averageRating || 0,
        },
      });
    }

    // ── POST: Reply to a review ──
    if (req.method === "POST") {
      const body = await req.json();
      const { review_id, comment } = body;

      if (!review_id || !comment) {
        return errorResponse("review_id dan comment diperlukan");
      }

      const apiUrl = `${GBP_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${review_id}/reply`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";

        if (errCode === 403) {
          return errorResponse(
            "Tidak memiliki akses untuk membalas ulasan ini.",
            403
          );
        }
        if (errCode === 404) {
          return errorResponse("Ulasan tidak ditemukan.", 404);
        }

        return errorResponse(errMsg || "Gagal membalas ulasan", errCode || 500);
      }

      return jsonResponse({
        data: {
          success: true,
          review: data,
        },
      });
    }

    // ── DELETE: Remove reply ──
    if (req.method === "DELETE") {
      const reviewId = url.searchParams.get("review_id");

      if (!reviewId) {
        return errorResponse("review_id diperlukan");
      }

      const apiUrl = `${GBP_V4_BASE}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`;

      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const data = await response.json();
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";
        return errorResponse(errMsg || "Gagal menghapus balasan", errCode || 500);
      }

      return jsonResponse({ data: { success: true } });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("[google-business-reviews] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
