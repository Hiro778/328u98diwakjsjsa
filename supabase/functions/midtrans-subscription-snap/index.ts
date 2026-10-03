// midtrans-subscription-snap/index.ts
// @deprecated LEGACY BACKEND — Active customer subscription purchase flow now uses manual payment + activation code.
// Snap checkout creation is deprecated and disconnected from customer Pricing UI.
// Retained for status synchronization, legacy order verification, and audit history.
//
// Endpoint: POST /functions/v1/midtrans-subscription-snap
// Auth: Bearer JWT from Authorization header
// Amount: Fixed server-side at Rp 130.000 (Pro) or Rp 35.000 (Basic)
// Duration: 1 calendar month
//
// Actions:
// 1. (Legacy) Create Snap token: { } -> { snap_token, midtrans_order_id, redirect_url, amount }
// 2. Verify payment status: { action: "verify_payment", order_id?: string } -> { status, is_active, expires_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function getMidtransConfig() {
  const serverKey = (Deno.env.get("MIDTRANS_SERVER_KEY") || "").trim();
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  const baseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const apiBaseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  return { serverKey, baseUrl, apiBaseUrl, isProduction };
}

// ── 1 Calendar Month Calculator ──
function calculateCalendarMonthPeriod(
  existingExpiresAt: string | null,
  nowMs: number = Date.now()
): { period_start: string; period_end: string } {
  const now = new Date(nowMs);
  let periodStart: Date;

  if (existingExpiresAt) {
    const existingExpires = new Date(existingExpiresAt);
    if (!isNaN(existingExpires.getTime()) && existingExpires > now) {
      // User is still active: extend from existing expiry date
      periodStart = existingExpires;
    } else {
      // Expired: start from now
      periodStart = now;
    }
  } else {
    // New subscription: start from now
    periodStart = now;
  }

  // Add 1 calendar month using UTC methods to prevent server timezone jitter
  const periodEnd = new Date(periodStart.getTime());
  const originalDay = periodEnd.getUTCDate();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  // Boundary check in UTC: e.g. Jan 31 + 1 month -> Feb 28/29
  if (periodEnd.getUTCDate() !== originalDay) {
    periodEnd.setUTCDate(0);
  }

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // 1. Auth check: verify JWT with Supabase Admin
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return errorResponse("Authorization header dengan Bearer token diperlukan", 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return errorResponse("Sesi login tidak valid atau kadaluarsa. Silakan login kembali.", 401);
    }

    const profileId = userData.user.id;
    const body = await req.json().catch(() => ({}));

    const { serverKey, baseUrl, apiBaseUrl } = getMidtransConfig();
    if (!serverKey) {
      console.error("[midtrans-subscription-snap] MIDTRANS_SERVER_KEY not configured");
      return errorResponse("Konfigurasi payment gateway belum lengkap", 500);
    }

    // 2. Query existing subscription with canonical resolution
    const { data: existingSubs, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, plan, started_at, expires_at, payment_provider, provider_transaction_id, business_id, is_cancelled, updated_at, created_at")
      .eq("profile_id", profileId);

    if (subError) {
      console.error("[midtrans-subscription-snap] Subscription query error:", subError);
      return errorResponse("Gagal mengambil data langganan", 500);
    }

    let existingSub: any = null;
    if (existingSubs && existingSubs.length > 0) {
      const activeUncancelled = existingSubs.find(
        (s: any) => s.status === "active" && s.is_cancelled !== true && (!s.expires_at || new Date(s.expires_at) > new Date())
      );
      existingSub = activeUncancelled || existingSubs.sort((a: any, b: any) => {
        const aExp = a.expires_at ? new Date(a.expires_at).getTime() : 0;
        const bExp = b.expires_at ? new Date(b.expires_at).getTime() : 0;
        if (bExp !== aExp) return bExp - aExp;
        const aUpd = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bUpd = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bUpd - aUpd;
      })[0];
    }

    if (subError) {
      console.error("[midtrans-subscription-snap] Subscription query error:", subError);
      return errorResponse("Gagal mengambil data langganan", 500);
    }

    let subscriptionId: string;
    if (existingSub?.id) {
      subscriptionId = existingSub.id;
    } else {
      const { data: biz } = await supabaseAdmin
        .from("businesses")
        .select("id")
        .eq("owner_id", profileId)
        .limit(1)
        .maybeSingle();

      const { data: newSub, error: createErr } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          profile_id: profileId,
          business_id: biz?.id || null,
          plan: "free",
          status: "inactive",
        })
        .select("id")
        .single();

      if (createErr || !newSub) {
        console.error("[midtrans-subscription-snap] Subscription insert error:", createErr);
        return errorResponse("Gagal membuat data subscription", 500);
      }
      subscriptionId = newSub.id;
    }

    // =========================================================================
    // ACTION: VERIFY PAYMENT STATUS VIA MIDTRANS API (Fallback & Real-time Sync)
    // =========================================================================
    if (body.action === "verify_payment") {
      let targetPayment: {
        id: string;
        subscription_id: string;
        profile_id: string;
        midtrans_order_id: string;
        payment_status: string;
        gross_amount: number;
        period_start: string;
        period_end: string;
      } | null = null;

      let targetOrderId: string | null =
        typeof body.order_id === "string" && body.order_id.trim().length > 0
          ? body.order_id.trim()
          : null;

      if (targetOrderId) {
        // 1. If order_id is specified, strictly verify it belongs to this authenticated profile!
        const { data: paymentRecord, error: pErr } = await supabaseAdmin
          .from("subscription_payments")
          .select("id, subscription_id, profile_id, midtrans_order_id, payment_status, gross_amount, period_start, period_end")
          .eq("midtrans_order_id", targetOrderId)
          .eq("profile_id", profileId)
          .limit(1)
          .maybeSingle();

        if (pErr || !paymentRecord) {
          return errorResponse("Order ID tidak ditemukan atau tidak sesuai dengan akun Anda", 404);
        }
        targetPayment = paymentRecord;
      } else {
        // 2. If no order_id specified, strictly find ONLY the most recent PENDING payment for this profile
        const { data: pendingPayment } = await supabaseAdmin
          .from("subscription_payments")
          .select("id, subscription_id, profile_id, midtrans_order_id, payment_status, gross_amount, period_start, period_end")
          .eq("profile_id", profileId)
          .eq("payment_status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        targetPayment = pendingPayment;
        targetOrderId = pendingPayment?.midtrans_order_id || null;
      }

      const now = new Date();
      const isCurrentlyActive =
        existingSub?.status === "active" &&
        existingSub?.plan === "pro" &&
        existingSub?.expires_at &&
        new Date(existingSub.expires_at) > now;

      // If no pending payment exists to verify, return current status without calling Midtrans or modifying DB
      if (!targetPayment || !targetOrderId) {
        return jsonResponse({
          status: isCurrentlyActive ? "paid" : "no_pending",
          is_active: isCurrentlyActive,
          expires_at: existingSub?.expires_at || null,
        });
      }

      // 3. IDEMPOTENCY CHECK:
      // If payment is ALREADY marked paid, NEVER extend subscription again!
      if (targetPayment.payment_status === "paid") {
        return jsonResponse({
          status: "paid",
          is_active: isCurrentlyActive,
          order_id: targetOrderId,
          expires_at: existingSub?.expires_at || null,
          message: "Pembayaran telah berhasil diverifikasi sebelumnya",
        });
      }

      // 4. Query Midtrans Status API
      const auth = btoa(serverKey + ":");
      const statusRes = await fetch(`${apiBaseUrl}/v2/${targetOrderId}/status`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Basic ${auth}`,
        },
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        console.warn(`[midtrans-subscription-snap] Midtrans status check HTTP ${statusRes.status}: ${errText}`);
        return jsonResponse({
          status: "pending",
          is_active: false,
          order_id: targetOrderId,
          message: "Status belum terkonfirmasi di payment gateway",
        });
      }

      const statusData = await statusRes.json();
      const txStatus = statusData.transaction_status;
      const fraudStatus = statusData.fraud_status;
      const isPaid = txStatus === "settlement" || (txStatus === "capture" && fraudStatus !== "challenge");

      if (isPaid) {
        // Canonical pricing specifications (@phase2.md)
        const CANONICAL_BASIC_AMOUNT = 35000;
        const CANONICAL_PRO_AMOUNT = 130000;

        // Authoritative server-side package resolution
        const targetGross = Number(targetPayment.gross_amount);
        const resolvedPlan = (targetPayment as any).plan === "basic" || targetGross === CANONICAL_BASIC_AMOUNT
          ? "basic"
          : "pro";
        const expectedMinAmount = resolvedPlan === "basic" ? CANONICAL_BASIC_AMOUNT : CANONICAL_PRO_AMOUNT;

        const paidAmount = Number(statusData.gross_amount);

        // Reject if paid amount is lower than package canonical price
        if (isNaN(paidAmount) || paidAmount < expectedMinAmount) {
          console.error(`[midtrans-subscription-snap] Gross amount invalid: ${statusData.gross_amount} for plan ${resolvedPlan}, expected minimum: ${expectedMinAmount}`);
          return errorResponse("Jumlah pembayaran tidak valid", 400);
        }

        // Reject if target payment in DB was forged (< expected price)
        if (targetGross < expectedMinAmount) {
          console.error(`[midtrans-subscription-snap] Recorded payment gross_amount ${targetGross} is less than canonical ${expectedMinAmount}`);
          return errorResponse("Paket atau nominal pembayaran tidak valid", 400);
        }

        const settlementDate = statusData.settlement_time
          ? new Date(statusData.settlement_time)
          : new Date();

        const { period_start, period_end } = calculateCalendarMonthPeriod(
          existingSub?.expires_at || null,
          settlementDate.getTime()
        );

        // 1. Update subscription_payments record to 'paid'
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            transaction_status: txStatus,
            payment_status: "paid",
            payment_method: statusData.payment_type || "online",
            paid_at: settlementDate.toISOString(),
            period_start,
            period_end,
            raw_response: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetPayment.id);

        // 2. Activate subscription with server-authoritative plan (Basic or Pro)
        const activatedPlan = resolvedPlan;
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            plan: activatedPlan,
            started_at: period_start,
            expires_at: period_end,
            is_cancelled: false,
            cancelled_at: null,
            cancelled_by: null,
            payment_provider: "midtrans",
            provider_transaction_id: targetOrderId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetPayment.subscription_id || subscriptionId);

        console.log(`[midtrans-subscription-snap] Subscription activated (${activatedPlan}) via verify_payment for sub ${subscriptionId}, expires_at: ${period_end}`);

        return jsonResponse({
          status: "paid",
          is_active: true,
          order_id: targetOrderId,
          expires_at: period_end,
        });
      } else if (["cancel", "deny", "expire"].includes(txStatus)) {
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            transaction_status: txStatus,
            payment_status: "failed",
            raw_response: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetPayment.id);

        return jsonResponse({
          status: "failed",
          is_active: false,
          order_id: targetOrderId,
        });
      } else {
        return jsonResponse({
          status: "pending",
          is_active: false,
          order_id: targetOrderId,
        });
      }
    }

    // =========================================================================
    // ACTION: CANCEL SUBSCRIPTION (Server-side authenticated & IDOR safe)
    // =========================================================================
    if (body.action === "cancel_subscription") {
      if (!existingSub) {
        return errorResponse("Langganan tidak ditemukan", 404);
      }

      if (existingSub.status === "cancelled") {
        return jsonResponse({
          status: "cancelled",
          is_active: false,
          subscription_id: existingSub.id,
          expires_at: existingSub.expires_at || null,
          message: "Langganan sudah dalam status dihentikan sebelumnya",
        });
      }

      // Execute cancellation: set status = 'cancelled'
      // CRITICAL: Does NOT touch payments, does NOT issue refund, does NOT tamper with ledger
      const { error: cancelErr } = await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "cancelled",
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: profileId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSub.id)
        .eq("profile_id", profileId);

      if (cancelErr) {
        console.error("[midtrans-subscription-snap] Cancel subscription error:", cancelErr);
        return errorResponse("Gagal menghentikan langganan", 500);
      }

      console.log(`[midtrans-subscription-snap] Subscription ${existingSub.id} cancelled by user ${profileId}`);

      return jsonResponse({
        status: "cancelled",
        is_active: false,
        subscription_id: existingSub.id,
        cancelled_at: new Date().toISOString(),
        expires_at: existingSub.expires_at || null,
        message: "Langganan Pro berhasil dihentikan",
      });
    }

    // =========================================================================
    // ACTION: CREATE MIDTRANS SNAP TRANSACTION
    // =========================================================================

    // Query user profile for customer details
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", profileId)
      .maybeSingle();

    const customerName = profile?.full_name || userData.user.user_metadata?.full_name || "Pelanggan BisnisSehat";
    const customerEmail = profile?.email || userData.user.email || `${profileId}@bisnissehat.id`;

    // Support Basic (Rp 35.000) or Pro (Rp 130.000)
    const selectedPlan = body.plan === "basic" ? "basic" : "pro";
    const amount = selectedPlan === "basic" ? 35000 : 130000;
    const planName = selectedPlan === "basic" ? "BisnisSehat Basic (1 Bulan)" : "BisnisSehat Pro (1 Bulan)";
    const itemId = selectedPlan === "basic" ? "bisnissehat-basic-monthly" : "bisnissehat-pro-monthly";

    // Projected duration: 1 calendar month
    const { period_start, period_end } = calculateCalendarMonthPeriod(
      existingSub?.expires_at || null,
      Date.now()
    );

    // Generate unique order_id with SUB- prefix
    const cleanUid = profileId.replace(/-/g, "").substring(0, 8);
    const midtransOrderId = `SUB-${cleanUid}-${Date.now()}`;

    const requestBody = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: amount,
      },
      item_details: [
        {
          id: itemId,
          name: planName,
          price: amount,
          quantity: 1,
        },
      ],
      customer_details: {
        first_name: customerName,
        email: customerEmail,
      },
    };

    const auth = btoa(serverKey + ":");
    const webhookUrl = `${supabaseUrl}/functions/v1/midtrans-notification`;

    const snapResponse = await fetch(`${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Basic ${auth}`,
        "X-Append-Notification": webhookUrl,
      },
      body: JSON.stringify(requestBody),
    });

    const rawResult = await snapResponse.text();
    let snapResult: any;
    try {
      snapResult = JSON.parse(rawResult);
    } catch {
      throw new Error(`Midtrans response bukan JSON valid: ${rawResult.substring(0, 100)}`);
    }

    if (!snapResponse.ok || !snapResult.token) {
      console.error("[midtrans-subscription-snap] Midtrans Snap error:", snapResult);
      const msg = Array.isArray(snapResult.error_messages)
        ? snapResult.error_messages.join("; ")
        : snapResult.message || `HTTP ${snapResponse.status}`;
      return errorResponse(`Gagal membuat token Midtrans Snap: ${msg}`, 502);
    }

    // Record pending payment in subscription_payments
    const { error: insertPaymentErr } = await supabaseAdmin
      .from("subscription_payments")
      .insert({
        subscription_id: subscriptionId,
        profile_id: profileId,
        midtrans_order_id: midtransOrderId,
        gross_amount: amount,
        plan: selectedPlan,
        payment_method: "snap",
        transaction_status: "pending",
        payment_status: "pending",
        period_start,
        period_end,
        raw_response: snapResult,
      });

    if (insertPaymentErr) {
      console.error("[midtrans-subscription-snap] Insert payment record error:", insertPaymentErr);
    }

    return jsonResponse({
      snap_token: snapResult.token,
      midtrans_order_id: midtransOrderId,
      redirect_url: snapResult.redirect_url,
      amount,
    });

  } catch (err: any) {
    console.error("[midtrans-subscription-snap] Error:", err.message);
    return errorResponse(err.message || "Internal server error", 500);
  }
});