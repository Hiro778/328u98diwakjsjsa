// midtrans-notification/index.ts
// Handle Midtrans payment notification webhook.
//
// POST body: Midtrans notification payload
// No Authorization header required (Midtrans sends directly).
// Verifies signature using MIDTRANS_SERVER_KEY.
// Updates order payment status and creates payment record.
// Idempotent — safe for duplicate notifications.
//
// Handles both QR Menu order payments and BisnisSehat Pro subscription payments.
// Subscription payments are identified by midtrans_order_id starting with "SUB-".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ── Helpers ──

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
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
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// ── Midtrans Signature Verification ──

function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string,
): boolean {
  const raw = orderId + statusCode + grossAmount + serverKey;
  // SHA-512 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  return crypto.subtle
    .digest("SHA-512", data)
    .then((hash) => {
      const hashArray = Array.from(new Uint8Array(hash));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return hashHex === signatureKey;
    });
}

// ── Map Midtrans status to internal status ──

function mapPaymentStatus(transactionStatus: string): string {
  switch (transactionStatus) {
    case "settlement":
    case "capture":
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

function mapOrderStatus(transactionStatus: string): string {
  switch (transactionStatus) {
    case "settlement":
    case "capture":
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

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const startTime = Date.now();
  console.log("[midtrans-notification] Received");

  try {
    const notification = await req.json();
    console.log("[midtrans-notification] Body:", JSON.stringify({
      order_id: notification.order_id,
      transaction_status: notification.transaction_status,
      status_code: notification.status_code,
      gross_amount: notification.gross_amount,
    }));

    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY") || "";
    if (!serverKey) {
      console.error("[midtrans-notification] MIDTRANS_SERVER_KEY not set");
      return new Response("OK", { status: 200 }); // Return OK to avoid retries
    }

    // 1. Verify signature
    const {
      order_id,
      transaction_id,
      transaction_status,
      status_code,
      gross_amount,
      signature_key,
      payment_type,
      settlement_time,
    } = notification;

    if (!order_id || !signature_key) {
      console.warn("[midtrans-notification] Missing required fields");
      return new Response("OK", { status: 200 });
    }

    const signatureValid = await verifySignature(
      order_id,
      status_code?.toString() || "",
      gross_amount?.toString() || "",
      serverKey,
      signature_key,
    );

    if (!signatureValid) {
      console.error("[midtrans-notification] Invalid signature for order:", order_id);
      return new Response("Invalid signature", { status: 403 });
    }

    // 2. Find order by payment_ref (midtrans order_id)
    const { data: orders, error: findError } = await supabaseAdmin
      .from("orders")
      .select("id, business_id, total, payment_status, order_status, payment_ref")
      .eq("payment_ref", order_id)
      .limit(1);

    if (findError || !orders || orders.length === 0) {
      // Order not found — try subscription payment lookup
      console.log("[midtrans-notification] Order not found, checking subscription payments:", order_id);

      const { data: subPayments, error: subFindError } = await supabaseAdmin
        .from("subscription_payments")
        .select("id, subscription_id, profile_id, midtrans_order_id, gross_amount, payment_status, period_start, period_end")
        .eq("midtrans_order_id", order_id)
        .limit(1);

      if (subFindError || !subPayments || subPayments.length === 0) {
        console.warn("[midtrans-notification] Neither order nor subscription payment found for:", order_id);
        return new Response("OK", { status: 200 }); // Return OK to avoid retries
      }

      const subPayment = subPayments[0];

      // Idempotent: skip if already paid
      const newSubPaymentStatus = mapPaymentStatus(transaction_status);
      if (subPayment.payment_status === "paid" && newSubPaymentStatus === "paid") {
        console.log("[midtrans-notification] Subscription payment already processed:", order_id);
        return new Response("OK", { status: 200 });
      }

      // Update subscription_payments record
      await supabaseAdmin
        .from("subscription_payments")
        .update({
          transaction_status: transaction_status,
          payment_status: newSubPaymentStatus,
          payment_method: payment_type || "online",
          paid_at: newSubPaymentStatus === "paid" ? (settlement_time || new Date().toISOString()) : null,
          raw_response: notification,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subPayment.id);

      // If payment successful, activate subscription
      if (newSubPaymentStatus === "paid") {
        console.log("[midtrans-notification] Activating subscription:", subPayment.subscription_id);
        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            plan: "pro",
            started_at: subPayment.period_start,
            expires_at: subPayment.period_end,
            payment_provider: "midtrans",
            provider_transaction_id: order_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subPayment.subscription_id);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[midtrans-notification] Subscription payment done in ${elapsed}ms — sub_payment=${subPayment.id} status=${newSubPaymentStatus}`);
      return new Response("OK", { status: 200 });
    }

    const order = orders[0];

    // 3. Idempotent: check if already processed
    const newPaymentStatus = mapPaymentStatus(transaction_status);
    const newOrderStatus = mapOrderStatus(transaction_status);

    if (order.payment_status === "paid" && newPaymentStatus === "paid") {
      console.log("[midtrans-notification] Already processed, skipping");
      return new Response("OK", { status: 200 });
    }

    // 4. Update order status
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: newPaymentStatus,
        order_status: newOrderStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("[midtrans-notification] Order update error:", updateError);
      return new Response("OK", { status: 200 });
    }

    // 5. Create or update payment record (idempotent by transaction_id)
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("transaction_id", order_id)
      .limit(1);

    if (existingPayment && existingPayment.length > 0) {
      // Update existing payment record
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
      // Create new payment record
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
    console.log(`[midtrans-notification] Done in ${elapsed}ms — order=${order.id} status=${newPaymentStatus}`);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[midtrans-notification] Error:", err);
    return new Response("OK", { status: 200 }); // Always return OK to avoid Midtrans retries
  }
});
