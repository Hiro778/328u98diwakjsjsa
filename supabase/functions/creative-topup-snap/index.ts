// supabase/functions/creative-topup-snap/index.ts
// Create Midtrans Snap transaction for Creative Credits Top Up.
//
// Endpoint: POST /functions/v1/creative-topup-snap
// Auth: Bearer JWT from Authorization header
//
// Prices and credits are STRICTLY server-enforced:
// - starter: 100 credits, Rp 25.000
// - growth: 500 credits, Rp 100.000
// - pro: 1.000 credits, Rp 175.000
// - business: 3.000 credits, Rp 450.000

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

const CREDIT_PACKAGES: Record<string, { credits: number; priceIdr: number; name: string }> = {
  starter: { credits: 100, priceIdr: 25000, name: "Starter (100 Credits)" },
  growth: { credits: 500, priceIdr: 100000, name: "Growth (500 Credits)" },
  pro: { credits: 1000, priceIdr: 175000, name: "Pro (1.000 Credits)" },
  business: { credits: 3000, priceIdr: 450000, name: "Business (3.000 Credits)" },
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid Authorization header", 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    // Get business owned by user
    const { data: business, error: bizError } = await supabaseAdmin
      .from("businesses")
      .select("id, name, owner_id")
      .eq("owner_id", user.id)
      .single();

    if (bizError || !business) {
      return errorResponse("Business not found for current user", 404);
    }

    const body = await req.json().catch(() => ({}));

    // =========================================================================
    // ACTION: VERIFY PAYMENT STATUS VIA MIDTRANS API (Backend Verification)
    // =========================================================================
    if (body.action === "verify_payment") {
      const targetOrderId = body.order_id;
      if (!targetOrderId || typeof targetOrderId !== "string" || !targetOrderId.startsWith("CREDIT-")) {
        return errorResponse("order_id tidak valid", 400);
      }

      // Check credit purchase record for this business
      const { data: purchase, error: purchaseErr } = await supabaseAdmin
        .from("credit_purchases")
        .select("id, business_id, profile_id, order_id, credits, amount_idr, status")
        .eq("order_id", targetOrderId)
        .eq("business_id", business.id)
        .maybeSingle();

      if (purchaseErr || !purchase) {
        return errorResponse("Pesanan top up tidak ditemukan", 404);
      }

      // If already recorded as paid
      if (purchase.status === "paid") {
        return jsonResponse({
          status: "paid",
          is_paid: true,
          order_id: targetOrderId,
          credits: purchase.credits,
        });
      }

      // Query Midtrans status API to verify authoritatively
      const { serverKey, apiBaseUrl } = getMidtransConfig();
      if (!serverKey) {
        return errorResponse("MIDTRANS_SERVER_KEY is not configured", 500);
      }

      const auth = btoa(`${serverKey}:`);
      const statusRes = await fetch(`${apiBaseUrl}/v2/${targetOrderId}/status`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
      });

      if (!statusRes.ok) {
        return jsonResponse({
          status: purchase.status || "pending",
          is_paid: false,
          order_id: targetOrderId,
        });
      }

      const statusData = await statusRes.json();
      const txStatus = statusData.transaction_status;
      const fraudStatus = statusData.fraud_status;
      const isPaid = txStatus === "settlement" || (txStatus === "capture" && fraudStatus !== "challenge");

      if (isPaid) {
        const { data: updatedPurchase } = await supabaseAdmin
          .from("credit_purchases")
          .update({
            status: "paid",
            midtrans_transaction_id: statusData.transaction_id || "",
            raw_response: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id)
          .eq("status", "pending")
          .select("id, business_id, credits")
          .maybeSingle();

        if (updatedPurchase) {
          await supabaseAdmin.rpc("grant_creative_credits_atomic", {
            p_business_id: updatedPurchase.business_id,
            p_credits: updatedPurchase.credits,
            p_order_id: targetOrderId,
          });
          console.log(`[creative-topup-snap] Granted ${updatedPurchase.credits} credits via verify_payment for ${targetOrderId}`);
        }

        return jsonResponse({
          status: "paid",
          is_paid: true,
          order_id: targetOrderId,
          credits: purchase.credits,
        });
      } else if (["cancel", "deny", "expire"].includes(txStatus)) {
        await supabaseAdmin
          .from("credit_purchases")
          .update({
            status: "failed",
            midtrans_transaction_id: statusData.transaction_id || "",
            raw_response: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id)
          .eq("status", "pending");

        return jsonResponse({
          status: "failed",
          is_paid: false,
          order_id: targetOrderId,
        });
      } else {
        return jsonResponse({
          status: "pending",
          is_paid: false,
          order_id: targetOrderId,
        });
      }
    }

    // =========================================================================
    // ACTION: CREATE TOP UP TRANSACTION
    // =========================================================================
    const package_key = body.package_key;
    const pkg = CREDIT_PACKAGES[package_key];

    if (!pkg) {
      return errorResponse("Paket credit tidak valid", 400);
    }

    const { serverKey, baseUrl } = getMidtransConfig();
    if (!serverKey) {
      return errorResponse("MIDTRANS_SERVER_KEY is not configured", 500);
    }

    // Determine Finish Redirect URL (callbacks.finish)
    let appOrigin = "http://localhost:5173";
    if (body.redirect_origin && typeof body.redirect_origin === "string" && !body.redirect_origin.includes("example.com")) {
      appOrigin = body.redirect_origin.trim().replace(/\/$/, "");
    } else {
      const originHeader = req.headers.get("origin");
      const refererHeader = req.headers.get("referer");
      if (originHeader && !originHeader.includes("example.com")) {
        appOrigin = originHeader.trim().replace(/\/$/, "");
      } else if (refererHeader && !refererHeader.includes("example.com")) {
        try {
          const u = new URL(refererHeader);
          appOrigin = `${u.protocol}//${u.host}`;
        } catch {
          // keep default
        }
      }
    }

    const finishRedirectUrl = `${appOrigin}/dashboard/marketing/credits`;

    // Order ID format: CREDIT-<uuid>
    const orderId = `CREDIT-${crypto.randomUUID()}`;

    // Get user profile info for Snap customer details
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    const customerDetails = {
      first_name: profile?.full_name || business.name || "Customer",
      email: profile?.email || user.email || "customer@bisnissehat.id",
      phone: profile?.phone || "081234567890",
    };

    const snapPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: pkg.priceIdr,
      },
      item_details: [
        {
          id: package_key,
          price: pkg.priceIdr,
          quantity: 1,
          name: pkg.name,
        },
      ],
      customer_details: customerDetails,
      callbacks: {
        finish: finishRedirectUrl,
      },
    };

    // Call Midtrans Snap API
    const authString = btoa(`${serverKey}:`);
    const webhookUrl = `${supabaseUrl}/functions/v1/midtrans-notification`;
    const snapResponse = await fetch(`${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${authString}`,
        "X-Append-Notification": webhookUrl,
      },
      body: JSON.stringify(snapPayload),
    });

    const snapData = await snapResponse.json();

    if (!snapResponse.ok || !snapData.token) {
      console.error("[creative-topup-snap] Midtrans error:", snapData);
      return errorResponse(
        snapData.error_messages?.join(", ") || "Failed to create Midtrans transaction",
        502
      );
    }

    // Insert pending record into credit_purchases
    const { error: insertError } = await supabaseAdmin
      .from("credit_purchases")
      .insert({
        business_id: business.id,
        profile_id: user.id,
        order_id: orderId,
        package_key,
        amount_idr: pkg.priceIdr,
        credits: pkg.credits,
        status: "pending",
        snap_token: snapData.token,
        raw_response: snapData,
      });

    if (insertError) {
      console.error("[creative-topup-snap] DB Insert error:", insertError);
      return errorResponse("Failed to create pending credit purchase", 500);
    }

    return jsonResponse({
      order_id: orderId,
      snap_token: snapData.token,
      redirect_url: snapData.redirect_url,
      package: {
        key: package_key,
        name: pkg.name,
        credits: pkg.credits,
        priceIdr: pkg.priceIdr,
      },
    });

  } catch (err: any) {
    console.error("[creative-topup-snap] Internal error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
