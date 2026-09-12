// google-business-posts/index.ts
// CRUD for Google Business Profile Local Posts.
// Uses Google My Business API v4 (active, not deprecated).
//
// GET:    List local posts
// POST:   Create local post
// PATCH:  Update local post
// DELETE: Delete local post

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
  refresh_token_encrypted: string
): Promise<string | null> {
  try {
    const refreshToken = await decrypt(refresh_token_encrypted);
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

    const { data: connection } = await supabaseAdmin
      .from("google_business_connections")
      .select("id, google_account_id, refresh_token_encrypted, status")
      .eq("business_id", auth.businessId)
      .eq("status", "connected")
      .single();

    if (!connection) {
      return errorResponse("Google Business Profile belum terhubung.", 400);
    }

    const accessToken = await getAccessToken(connection.refresh_token_encrypted);
    if (!accessToken) {
      return errorResponse("Gagal memperbarui sesi Google.", 401);
    }

    const url = new URL(req.url);
    const locationId = url.searchParams.get("location_id");

    if (!locationId) {
      return errorResponse("location_id diperlukan");
    }

    const accountId = connection.google_account_id;
    const basePath = `${GBP_V4_BASE}/accounts/${accountId}/locations/${locationId}/localPosts`;

    // ── GET: List posts ──
    if (req.method === "GET") {
      const pageSize = url.searchParams.get("page_size") || "20";
      const pageToken = url.searchParams.get("page_token") || "";

      let apiUrl = `${basePath}?pageSize=${pageSize}`;
      if (pageToken) apiUrl += `&pageToken=${pageToken}`;

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
                "API Local Posts belum mendapat akses. Google My Business API perlu disetujui.",
            },
          });
        }

        return errorResponse(errMsg || "Gagal mengambil postingan", errCode || 500);
      }

      return jsonResponse({
        data: {
          available: true,
          posts: data.localPosts || [],
          nextPageToken: data.nextPageToken || null,
        },
      });
    }

    // ── POST: Create post ──
    if (req.method === "POST") {
      const body = await req.json();
      const { summary, call_to_action, url, language_code } = body;

      if (!summary) {
        return errorResponse("summary diperlukan");
      }

      const postBody: Record<string, unknown> = {
        languageCode: language_code || "id",
        summary,
      };

      if (call_to_action && url) {
        postBody.callToAction = {
          actionType: call_to_action, // "LEARN_MORE" | "BOOK" | "ORDER" | "SHOP" | "SIGN_UP" | "CALL"
          url,
        };
      }

      const response = await fetch(basePath, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      });

      const data = await response.json();

      if (!response.ok) {
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";

        if (errCode === 403) {
          return errorResponse(
            "Tidak memiliki akses untuk membuat postingan.",
            403
          );
        }

        return errorResponse(errMsg || "Gagal membuat postingan", errCode || 500);
      }

      return jsonResponse({
        data: {
          success: true,
          post: data,
        },
      });
    }

    // ── PATCH: Update post ──
    if (req.method === "PATCH") {
      const body = await req.json();
      const { post_id, summary, call_to_action, url } = body;

      if (!post_id) {
        return errorResponse("post_id diperlukan");
      }

      const postBody: Record<string, unknown> = { name: post_id };
      if (summary) postBody.summary = summary;
      if (call_to_action && url) {
        postBody.callToAction = { actionType: call_to_action, url };
      }

      const response = await fetch(`${basePath}/${post_id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      });

      const data = await response.json();

      if (!response.ok) {
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";
        return errorResponse(errMsg || "Gagal memperbarui postingan", errCode || 500);
      }

      return jsonResponse({ data: { success: true, post: data } });
    }

    // ── DELETE: Delete post ──
    if (req.method === "DELETE") {
      const postId = url.searchParams.get("post_id");

      if (!postId) {
        return errorResponse("post_id diperlukan");
      }

      const response = await fetch(`${basePath}/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const data = await response.json();
        const errCode = data.error?.code;
        const errMsg = data.error?.message || "";
        return errorResponse(errMsg || "Gagal menghapus postingan", errCode || 500);
      }

      return jsonResponse({ data: { success: true } });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("[google-business-posts] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
