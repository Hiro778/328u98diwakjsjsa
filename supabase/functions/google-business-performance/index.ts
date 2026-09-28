// google-business-performance/index.ts
// Fetch Google Business Profile performance metrics.
// Uses Business Profile Performance API v1.
//
// POST: fetchMultiDailyMetricsTimeSeries
// GET:  search keyword impressions

import { verifyAuth } from "../../_shared/auth.ts";
import { isProUser } from "../../_shared/entitlement.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { decrypt } from "../../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PERFORMANCE_BASE = "https://businessprofileperformance.googleapis.com/v1";

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

    // Enforce Pro entitlement server-side
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

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

    // ── POST: fetchMultiDailyMetricsTimeSeries ──
    if (req.method === "POST") {
      const body = await req.json();
      const { daily_metrics, start_date, end_date } = body;

      // Default: last 7 days
      const endDate = end_date || new Date().toISOString().split("T")[0];
      const startDate =
        start_date ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      // Default metrics
      const metrics = daily_metrics || [
        "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
        "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
        "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
        "CALL_CLICKS",
        "WEBSITE_CLICKS",
        "BUSINESS_DIRECTION_REQUESTS",
      ];

      const locationName = `locations/${locationId}`;

      const requestBody = {
        locationNames: [locationName],
        dailyMetrics: metrics,
        dailyRange: {
          startDate: {
            year: parseInt(startDate.split("-")[0]),
            month: parseInt(startDate.split("-")[1]),
            day: parseInt(startDate.split("-")[2]),
          },
          endDate: {
            year: parseInt(endDate.split("-")[0]),
            month: parseInt(endDate.split("-")[1]),
            day: parseInt(endDate.split("-")[2]),
          },
        },
      };

      const apiUrl = `${PERFORMANCE_BASE}/${locationName}:fetchMultiDailyMetricsTimeSeries`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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
                "Business Profile Performance API belum mendapat akses. API perlu disetujui oleh Google.",
            },
          });
        }

        return errorResponse(
          errMsg || "Gagal mengambil data performa",
          errCode || 500
        );
      }

      return jsonResponse({
        data: {
          available: true,
          metrics: data.multiDailyMetricTimeSeries || [],
          timeFrame: { startDate, endDate },
        },
      });
    }

    // ── GET: Search keyword impressions ──
    if (req.method === "GET") {
      const locationName = `locations/${locationId}`;
      const apiUrl = `${PERFORMANCE_BASE}/${locationName}/searchkeywords/impressions/monthly`;

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
                "Business Profile Performance API belum mendapat akses.",
            },
          });
        }

        return errorResponse(
          errMsg || "Gagal mengambil data keyword",
          errCode || 500
        );
      }

      return jsonResponse({
        data: {
          available: true,
          searchKeywords: data.monthlySearchKeywordImpressions || [],
        },
      });
    }

    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("[google-business-performance] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
