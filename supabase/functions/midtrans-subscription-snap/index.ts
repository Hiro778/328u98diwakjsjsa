// midtrans-subscription-snap/index.ts
// Create Midtrans Snap token for BisnisSehat Pro subscription payments.
//
// POST body: { } (no params needed — amount is fixed at 130000)
// Returns: { snap_token, midtrans_order_id, redirect_url, amount }
//
// Requires: MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY env vars.
// Auth: JWT from Authorization header to identify user's profile_id.
// Period logic:
//   - New / expired subscription: period_start = now(), period_end = now() + 30 days
//   - Active renewal: period_start = current expires_at, period_end = expires_at + 30 days
// No recurring/subscription auto-charge — manual monthly renewal.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function getMidtransConfig() {
  const serverKey = (Deno.env.get("MIDTRANS_SERVER_KEY") || "").trim();
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  const baseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

  const hasKey = !!serverKey;
  const keyLen = serverKey.length;
  const hasTrailingNewline = serverKey.includes("\n") || serverKey.includes("\r");
  const hasTrailingSpace = serverKey.endsWith(" ");
  const looksLikeClientKey = serverKey.startsWith("Mid-client") || serverKey.startsWith("SB-Mid-client");
  const looksLikeServerKey = serverKey.startsWith("Mid-server") || serverKey.startsWith("SB-Mid-server");

  return { serverKey, baseUrl, isProduction, hasKey, keyLen, hasTrailingNewline, hasTrailingSpace, looksLikeClientKey, looksLikeServerKey };
}

// ── Verify JWT from Authorization header ──

async function getProfileIdFromAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") || "";

  // If no auth header, return null (anonymous — but we need profile for subscription)
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    // Decode JWT manually to get sub (profile_id) — no external validation needed
    // JWT format: header.payload.signature, base64url decode the payload
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[midtrans-subscription-snap] Invalid JWT format");
      return null;
    }

    // base64url decode payload
    const payload = decodeURIComponent(
      atob(parts[1])
        .split("")
        .map(c => {
          return "%" + c.charCodeAt(0).toString(16).padStart(2, "0");
        })
        .join("")
    );
    const parsed = JSON.parse(payload);
    return parsed.sub || parsed.user_id || null;
  } catch (err) {
    console.error("[midtrans-subscription-snap] JWT decode error:", err);
    return null;
  }
}

// ── Calculate subscription period ──

function calculateSubscriptionPeriod(
  existingSubscription: { status: string; expires_at: string | null } | null,
  nowMs: number
): { period_start: string; period_end: string } {
  const now = new Date(nowMs);

  if (!existingSubscription) {
    // New subscription — start from now
    const periodStart = now;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    };
  }

  // Check if existing subscription is expired
  const existingExpires = new Date(existingSubscription.expires_at);
  const isExpired = existingExpires <= now;

  if (isExpired) {
    // Renewal from expired state — new period starts from now
    const periodStart = now;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    };
  }

  // Active renewal — extend from existing expires_at
  const periodStart = existingExpires;
  const periodEnd = new Date(existingExpires);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // 1. Auth: extract profile_id from JWT
    const profileId = await getProfileIdFromAuth(req);
    if (!profileId) {
      return errorResponse("Authorization header with JWT required", 401);
    }

    // 2. Find or create subscription for this profile
    const { data: existingSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, plan, started_at, expires_at, payment_provider, provider_transaction_id")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error("[midtrans-subscription-snap] Subscription query error:", subError);
      return errorResponse("Failed to query subscription", 500);
    }

    // 3. Calculate period based on existing subscription state
    const nowMs = Date.now();
    const { period_start, period_end } = calculateSubscriptionPeriod(
      existingSub ? { status: existingSub.status, expires_at: existingSub.expires_at } : null,
      nowMs
    );

    // 4. Ensure subscription row exists
    let subscriptionId: string;
    if (existingSub) {
      subscriptionId = existingSub.id;
    } else {
      // Create new subscription row
      const { data: newSub, error: createErr } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          profile_id: profileId,
          plan: "pro",
          status: "pending",
          started_at: period_start,
          expires_at: period_end,
          payment_provider: "midtrans",
        })
        .select("id")
        .single();

      if (createErr) {
        console.error("[midtrans-subscription-snap] Subscription insert error:", createErr);
        return errorResponse("Failed to create subscription", 500);
      }
      subscriptionId = newSub.id;
    }

    // 5. Hardcode amount = 130000 (server-side only)
    const amount = 130000;

    // 6. Generate unique order_id with SUB- prefix for subscription payments
    const midtransOrderId = `SUB-${profileId.substring(0, 8)}-${Date.now()}`;

    // 7. Build Snap request body
    const requestBody = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: amount,
      },
      item_details: [
        {
          id: "sub-pro",
          name: "BisnisSehat Pro - 1 Bulan",
          price: amount,
          quantity: 1,
        },
      ],
      customer_details: {
        first_name: "Pelanggan",
        email: `${profileId}@bisnissehat.id`,
        phone: "081234567890",
      },
      callbacks: {
        finish: `${window?.location?.origin}/pricing?payment=success`,
      },
    };

    // 8. Call Midtrans Snap API
    const { serverKey, baseUrl } = getMidtransConfig();

    if (!serverKey) {
      return errorResponse("MIDTRANS_SERVER_KEY not configured", 500);
    }

    const auth = btoa(serverKey + ":");

    const snapUrl = `${baseUrl}/snap/v1/transactions`;

    const response = await fetch(snapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const rawResult = await response.text();

    let result: any;
    if (rawResult && rawResult.trim()) {
      try {
        result = JSON.parse(rawResult);
      } catch (e) {
        console.error("[midtrans-subscription-snap] Failed to parse Midtrans response");
        throw new Error("Midtrans response bukan JSON valid");
      }
    } else {
      throw new Error(`Midtrans response kosong (HTTP ${response.status})`);
    }

    // Snap API success: returns token and redirect_url
    if (result.token && result.redirect_url) {
      // 9. Insert subscription_payments record
      await supabaseAdmin.from("subscription_payments").insert({
        subscription_id: subscriptionId,
        profile_id: profileId,
        midtrans_order_id: midtransOrderId,
        gross_amount: amount,
        payment_method: "online",
        transaction_status: "pending",
        payment_status: "pending",
        period_start,
        period_end,
        raw_response: { ...result },
      });

      return jsonResponse({
        data: {
          snap_token: result.token,
          midtrans_order_id: midtransOrderId,
          redirect_url: result.redirect_url,
          amount,
        },
      });
    }

    // Snap API error
    const msgs = result.error_messages || [];
    const msg = Array.isArray(msgs) ? msgs.join("; ") : String(msgs);

    console.error(JSON.stringify({
      midtransError: true,
      status: response.status,
      messages: msg,
    }));

    throw new Error(msg || `Midtrans HTTP ${response.status}`);

  } catch (err: any) {
    console.error(`[midtrans-subscription-snap] Error: ${err.message}`);
    return errorResponse(err.message || "Internal server error", 500);
  }
});