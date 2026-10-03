// midtrans-notification/index.ts
// Handle Midtrans payment notification webhook.
//
// POST body: Midtrans notification payload
// Verifies signature using MIDTRANS_SERVER_KEY via SHA-512.
// Idempotent — safe for duplicate notifications.
// Handles QR Menu order payments, Credit top-ups, and legacy subscription webhook notifications.
// (Note: New customer subscription flow uses manual payment + activation code).
// Subscription payments are identified by midtrans_order_id starting with "SUB-".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// ── Midtrans Signature Verification (Async SHA-512) ──
async function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): Promise<boolean> {
  const raw = orderId + statusCode + grossAmount + serverKey;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex === signatureKey;
}

// ── Status Mapping ──
function mapPaymentStatus(transactionStatus: string, fraudStatus?: string): string {
  if (fraudStatus === "challenge") {
    return "challenge";
  }
  if (fraudStatus === "deny") {
    return "failed";
  }
  switch (transactionStatus) {
    case "capture":
    case "settlement":
      return "paid";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
    case "expire":
      return "failed";
    default:
      return "pending";
  }
}

function mapOrderStatus(transactionStatus: string, fraudStatus?: string): string {
  if (fraudStatus === "challenge") {
    return "pending";
  }
  if (fraudStatus === "deny") {
    return "dibatalkan";
  }
  switch (transactionStatus) {
    case "capture":
    case "settlement":
      return "selesai";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
    case "expire":
      return "dibatalkan";
    default:
      return "pending";
  }
}

// ── 1 Calendar Month Calculator ──
function calculateCalendarMonthPeriod(
  existingExpiresAt: string | null,
  settlementTime: Date
): { period_start: Date; period_end: Date } {
  let periodStart: Date;

  if (existingExpiresAt) {
    const existingExpires = new Date(existingExpiresAt);
    if (!isNaN(existingExpires.getTime()) && existingExpires > settlementTime) {
      // User renewed before expiry: retain remaining time, start new month from current expiry
      periodStart = existingExpires;
    } else {
      // New or expired: starts from settlement time
      periodStart = settlementTime;
    }
  } else {
    periodStart = settlementTime;
  }

  // Add 1 calendar month using UTC methods to prevent server timezone jitter
  const periodEnd = new Date(periodStart.getTime());
  const originalDay = periodEnd.getUTCDate();
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  // Boundary check in UTC: e.g. Jan 31 + 1 month -> Feb 28/29
  if (periodEnd.getUTCDate() !== originalDay) {
    periodEnd.setUTCDate(0);
  }

  return { period_start: periodStart, period_end: periodEnd };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const startTime = Date.now();

  try {
    const notification = await req.json();
    const {
      order_id,
      transaction_id,
      transaction_status,
      status_code,
      gross_amount,
      signature_key,
      payment_type,
      fraud_status,
      settlement_time,
    } = notification;

    console.log(`[midtrans-notification] Received for order: ${order_id}, status: ${transaction_status}`);

    const serverKey = (Deno.env.get("MIDTRANS_SERVER_KEY") || "").trim();
    if (!serverKey) {
      console.error("[midtrans-notification] MIDTRANS_SERVER_KEY not set");
      return new Response("OK", { status: 200 }); // Return OK so Midtrans doesn't bombard retries
    }

    if (!order_id || !signature_key || !status_code || gross_amount === undefined || gross_amount === null) {
      console.warn("[midtrans-notification] Missing required fields in notification payload");
      return new Response("Invalid notification payload: missing required fields", { status: 400 });
    }

    // Optional Merchant ID verification against configured environment variable
    const expectedMerchantId = (Deno.env.get("MIDTRANS_MERCHANT_ID") || "").trim();
    if (expectedMerchantId && notification.merchant_id && notification.merchant_id !== expectedMerchantId) {
      console.error(`[midtrans-notification] Merchant ID mismatch: received ${notification.merchant_id}, expected ${expectedMerchantId}`);
      return new Response("Invalid merchant_id", { status: 403 });
    }

    // 1. Verify Midtrans Signature
    const signatureValid = await verifySignature(
      order_id,
      status_code?.toString() || "",
      gross_amount?.toString() || "",
      serverKey,
      signature_key
    );

    if (!signatureValid) {
      console.error(`[midtrans-notification] Invalid signature for order: ${order_id}`);
      return new Response("Invalid signature", { status: 403 });
    }

    const newPaymentStatus = mapPaymentStatus(transaction_status, fraud_status);

    // =========================================================================
    // DOMAIN A: BISNISSEHAT PRO SUBSCRIPTION PAYMENT (Prefix: "SUB-")
    // =========================================================================
    if (order_id.startsWith("SUB-")) {
      const { data: subPayments, error: subFindError } = await supabaseAdmin
        .from("subscription_payments")
        .select("id, subscription_id, profile_id, midtrans_order_id, gross_amount, payment_status, period_start, period_end")
        .eq("midtrans_order_id", order_id)
        .limit(1);

      if (subFindError || !subPayments || subPayments.length === 0) {
        console.warn(`[midtrans-notification] Subscription payment not found for order: ${order_id}`);
        return new Response("OK", { status: 200 });
      }

      const subPayment = subPayments[0];

      // IDEMPOTENCY CHECK:
      // If already marked paid and incoming is paid, do not extend again!
      if (subPayment.payment_status === "paid" && newPaymentStatus === "paid") {
        console.log(`[midtrans-notification] Subscription payment already processed: ${order_id}. Skipping.`);
        return new Response("OK", { status: 200 });
      }

      const settlementDate = settlement_time ? new Date(settlement_time) : new Date();

      if (newPaymentStatus === "paid") {
        // Amount verification
        if (Number(gross_amount) < Number(subPayment.gross_amount)) {
          console.error(`[midtrans-notification] Paid gross_amount ${gross_amount} less than expected ${subPayment.gross_amount}`);
          return new Response("Invalid gross_amount", { status: 400 });
        }

        // Fetch current subscription status to check existing expires_at
        const { data: currentSub } = await supabaseAdmin
          .from("subscriptions")
          .select("id, expires_at, status")
          .eq("id", subPayment.subscription_id)
          .single();

        const { period_start, period_end } = calculateCalendarMonthPeriod(
          currentSub?.expires_at || null,
          settlementDate
        );

        // 1. Update subscription_payments record
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            transaction_status: transaction_status,
            payment_status: "paid",
            payment_method: payment_type || "online",
            paid_at: settlementDate.toISOString(),
            period_start: period_start.toISOString(),
            period_end: period_end.toISOString(),
            raw_response: notification,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subPayment.id);

        // Determine plan from payment record or amount
        const activatedPlan = (subPayment.plan === "basic" || Number(subPayment.gross_amount) <= 35000) ? "basic" : "pro";

        // 2. Activate subscription
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            plan: activatedPlan,
            is_cancelled: false,
            cancelled_at: null,
            cancellation_reason: null,
            started_at: period_start.toISOString(),
            expires_at: period_end.toISOString(),
            payment_provider: "midtrans",
            provider_transaction_id: order_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subPayment.subscription_id);

        console.log(`[midtrans-notification] ${activatedPlan} activated for sub: ${subPayment.subscription_id}, period: ${period_start.toISOString()} -> ${period_end.toISOString()}`);

        // 3. Atomically grant Pro 200 monthly token allowance for this period ONLY for Pro plan (ai.md specification)
        if (activatedPlan === "pro") {
          const { data: businessRec } = await supabaseAdmin
            .from("businesses")
            .select("id")
            .eq("owner_id", subPayment.profile_id)
            .maybeSingle();

          if (businessRec?.id) {
            const { data: grantResult, error: grantErr } = await supabaseAdmin.rpc("grant_pro_monthly_allowance_atomic", {
              p_business_id: businessRec.id,
              p_subscription_id: subPayment.subscription_id,
              p_period_start: period_start.toISOString(),
            });

            if (grantErr) {
              console.error(`[midtrans-notification] Error granting monthly Pro allowance: ${grantErr.message}`);
            } else {
              console.log(`[midtrans-notification] Monthly Pro allowance result:`, grantResult);
            }
          }
        }
      } else {
        // Update to pending or failed without modifying subscription entitlement
        await supabaseAdmin
          .from("subscription_payments")
          .update({
            transaction_status: transaction_status,
            payment_status: newPaymentStatus,
            payment_method: payment_type || "online",
            raw_response: notification,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subPayment.id);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[midtrans-notification] Subscription payment processed in ${elapsed}ms`);
      return new Response("OK", { status: 200 });
    }

    // =========================================================================
    // DOMAIN C: CREATIVE CREDITS TOP UP PAYMENT (Prefix: "CREDIT-")
    // =========================================================================
    if (order_id.startsWith("CREDIT-")) {
      const { data: purchases, error: purchaseErr } = await supabaseAdmin
        .from("credit_purchases")
        .select("id, business_id, profile_id, order_id, credits, amount_idr, status")
        .eq("order_id", order_id)
        .limit(1);

      if (purchaseErr || !purchases || purchases.length === 0) {
        console.warn(`[midtrans-notification] Credit purchase not found for order: ${order_id}`);
        return new Response("OK", { status: 200 });
      }

      const purchase = purchases[0];

      // IDEMPOTENCY CHECK:
      // If already marked paid and incoming is paid, skip duplicate credit grant!
      if (purchase.status === "paid" && newPaymentStatus === "paid") {
        console.log(`[midtrans-notification] Credit purchase already processed: ${order_id}. Skipping duplicate.`);
        return new Response("OK", { status: 200 });
      }

      if (newPaymentStatus === "paid") {
        // Amount verification
        if (Number(gross_amount) < Number(purchase.amount_idr)) {
          console.error(`[midtrans-notification] Paid gross_amount ${gross_amount} less than expected ${purchase.amount_idr}`);
          return new Response("Invalid gross_amount", { status: 400 });
        }

        // Atomic status transition: only grant credits if status is updated from pending -> paid
        const { data: updatedPurchase, error: updateErr } = await supabaseAdmin
          .from("credit_purchases")
          .update({
            status: "paid",
            midtrans_transaction_id: transaction_id || "",
            raw_response: notification,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id)
          .eq("status", "pending")
          .select("id, business_id, credits")
          .maybeSingle();

        if (updatedPurchase) {
          // Atomically grant credits to business and record to credit_ledger
          await supabaseAdmin.rpc("grant_creative_credits_atomic", {
            p_business_id: updatedPurchase.business_id,
            p_credits: updatedPurchase.credits,
            p_order_id: order_id,
          });

          console.log(`[midtrans-notification] Granted ${updatedPurchase.credits} credits to business ${updatedPurchase.business_id} for order ${order_id}`);
        } else {
          console.log(`[midtrans-notification] Status was not pending for order ${order_id}, skipping credit grant.`);
        }
      } else {
        await supabaseAdmin
          .from("credit_purchases")
          .update({
            status: newPaymentStatus === "failed" ? "failed" : "pending",
            midtrans_transaction_id: transaction_id || "",
            raw_response: notification,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[midtrans-notification] Credit purchase processed in ${elapsed}ms`);
      return new Response("OK", { status: 200 });
    }

    // =========================================================================
    // DOMAIN B: QR MENU / POS ORDER PAYMENT (Non-Subscription)
    // =========================================================================
    const { data: orders, error: findError } = await supabaseAdmin
      .from("orders")
      .select("id, business_id, total, payment_status, order_status, payment_ref")
      .eq("payment_ref", order_id)
      .limit(1);

    if (findError || !orders || orders.length === 0) {
      console.warn(`[midtrans-notification] Order not found for order_id: ${order_id}`);
      return new Response("OK", { status: 200 });
    }

    const order = orders[0];
    const newOrderStatus = mapOrderStatus(transaction_status, fraud_status);

    // Idempotent: check if order already paid
    if (order.payment_status === "paid" && newPaymentStatus === "paid") {
      console.log(`[midtrans-notification] Order ${order.id} already paid, skipping.`);
      return new Response("OK", { status: 200 });
    }

    // Amount verification: paid gross_amount cannot be less than order.total
    if (newPaymentStatus === "paid" && Number(gross_amount) < Number(order.total)) {
      console.error(`[midtrans-notification] Paid gross_amount ${gross_amount} less than order total ${order.total}`);
      return new Response("Invalid gross_amount", { status: 400 });
    }

    // Update order status
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: newPaymentStatus,
        order_status: newOrderStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // Upsert payments record
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("transaction_id", order_id)
      .limit(1);

    if (existingPayment && existingPayment.length > 0) {
      await supabaseAdmin
        .from("payments")
        .update({
          transaction_status: transaction_status,
          payment_status: newPaymentStatus,
          paid_at: newPaymentStatus === "paid" ? (settlement_time || new Date().toISOString()) : null,
          raw_response: notification,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment[0].id);
    } else {
      await supabaseAdmin.from("payments").insert({
        order_id: order.id,
        business_id: order.business_id,
        payment_provider: "midtrans",
        payment_method: payment_type || "online",
        transaction_id: order_id,
        gross_amount: Number(gross_amount) || order.total,
        transaction_status: transaction_status,
        payment_status: newPaymentStatus,
        paid_at: newPaymentStatus === "paid" ? (settlement_time || new Date().toISOString()) : null,
        raw_response: notification,
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[midtrans-notification] Order payment done in ${elapsed}ms — order=${order.id}`);
    return new Response("OK", { status: 200 });

  } catch (err: any) {
    console.error("[midtrans-notification] Uncaught error:", err.message);
    return new Response("OK", { status: 200 }); // Always return 200 to prevent retries on unhandled errors
  }
});
