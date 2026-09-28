// midtrans-create-snap/index.ts
// Create Midtrans Snap transaction for QR Menu online payment.
//
// POST body: { order_id: string }
// Returns: { snap_token, midtrans_order_id, redirect_url }
//
// Requires: MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY env vars.
// Sandbox mode: MIDTRANS_IS_PRODUCTION=false

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
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

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    },
  });
}

// ── Midtrans Config ──

function getMidtransConfig() {
  const serverKey = (Deno.env.get("MIDTRANS_SERVER_KEY") || "").trim();
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  // Snap API uses 'app' domain, not 'api' domain
  const baseUrl = isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const apiBaseUrl = isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

  // Safe diagnostics — never log the key value
  const hasKey = !!serverKey;
  const keyLen = serverKey.length;
  const hasTrailingNewline = serverKey.includes("\n") || serverKey.includes("\r");
  const hasTrailingSpace = serverKey.endsWith(" ");
  // Detect if key looks like a Client Key instead of Server Key
  const looksLikeClientKey = serverKey.startsWith("Mid-client") || serverKey.startsWith("SB-Mid-client");
  // Detect valid Server Key prefixes
  const looksLikeServerKey = serverKey.startsWith("Mid-server") || serverKey.startsWith("SB-Mid-server");

  console.log(JSON.stringify({
    hasServerKey: hasKey,
    serverKeyLength: keyLen,
    hasTrailingNewline,
    hasTrailingSpace,
    looksLikeClientKey,
    looksLikeServerKey,
    isProduction,
    baseUrl,
    apiBaseUrl,
  }));

  return { serverKey, baseUrl, apiBaseUrl, isProduction };
}

// ── Verify user auth (for QR menu, order is created by anon) ──

async function verifyOrderOwnership(orderId: string) {
  // Fetch order with business info
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, business_id, total, payment_method, payment_status, order_status, order_number")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Order not found");
  }

  // Verify business has published menu
  const { data: business, error: bizError } = await supabaseAdmin
    .from("businesses")
    .select("id, name, is_menu_published")
    .eq("id", order.business_id)
    .single();

  if (bizError || !business) {
    throw new Error("Business not found");
  }

  if (!business.is_menu_published) {
    throw new Error("Menu is not published");
  }

  return { order, business };
}

// ── Recalculate total from order_items (don't trust frontend) ──

async function recalculateTotal(orderId: string): Promise<number> {
  const { data: items, error } = await supabaseAdmin
    .from("order_items")
    .select("unit_price, quantity")
    .eq("order_id", orderId);

  if (error || !items || items.length === 0) {
    throw new Error("No order items found");
  }

  return items.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);
}

// ── Create Midtrans Snap Transaction ──

async function createMidtransTransaction(
  orderId: string,
  orderNumber: number,
  amount: number,
  businessName: string,
) {
  const { serverKey, baseUrl } = getMidtransConfig();

  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY not configured");
  }

  // Midtrans order_id must be unique — prefix with order number
  const midtransOrderId = `BS-${orderNumber}-${Date.now()}`;

  const requestBody = {
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: amount,
    },
    item_details: [
      {
        id: "order-" + orderId.substring(0, 8),
        name: `Pesanan #${orderNumber}`,
        price: amount,
        quantity: 1,
      },
    ],
    customer_details: {
      first_name: businessName,
      email: "order@business.com",
      phone: "081234567890",
    },
    callbacks: {
      finish: "https://localhost:5173",
    },
  };

  const auth = btoa(serverKey + ":");

  // Midtrans Snap API endpoint: {baseUrl}/snap/v1/transactions
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

  // Safe diagnostic log — no secrets
  console.log(JSON.stringify({
    midtransEndpoint: snapUrl,
    midtransStatus: response.status,
    midtransBodyLength: rawResult.length,
    midtransBodyPreview: rawResult.substring(0, 200),
  }));

  let result: any;
  if (rawResult && rawResult.trim()) {
    try {
      result = JSON.parse(rawResult);
    } catch (e) {
      console.error(`[midtrans-create-snap] Failed to parse Midtrans response`);
      throw new Error("Midtrans response bukan JSON valid");
    }
  } else {
    throw new Error(`Midtrans response kosong (HTTP ${response.status})`);
  }

  // Snap API success: returns token and redirect_url, no status_code field
  if (result.token && result.redirect_url) {
    return {
      midtransOrderId,
      snapToken: result.token,
      redirectUrl: result.redirect_url,
    };
  }

  // Snap API error: contains error_messages array
  if (result.error_messages || result.status_code) {
    const msgs = result.error_messages || [];
    const msg = Array.isArray(msgs) ? msgs.join("; ") : String(msgs);

    // Helpful diagnostic hints
    let hint = "";
    if (serverKey.startsWith("Mid-client") || serverKey.startsWith("SB-Mid-client")) {
      hint = " [DIAG: key looks like a Client Key, not Server Key]";
    } else if (serverKey.startsWith("Mid-server") || serverKey.startsWith("SB-Mid-server")) {
      hint = " [DIAG: key format matches Server Key pattern, but value may be wrong or from wrong environment]";
    }

    console.error(JSON.stringify({
      midtransError: true,
      status: response.status,
      messages: msg,
    }));

    throw new Error(msg + hint || `Midtrans HTTP ${response.status}`);
  }

  // Unknown response format
  console.error(`[midtrans-create-snap] Unexpected response: ${rawResult.substring(0, 300)}`);
  throw new Error(`Midtrans response tidak dikenal (HTTP ${response.status})`);
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  // GET / = diagnostic (safe — no secrets revealed)
  if (req.method === "GET") {
    const raw = Deno.env.get("MIDTRANS_SERVER_KEY") || "";
    const trimmed = raw.trim();
    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
    return jsonResponse({
      hasServerKey: !!trimmed,
      rawLength: raw.length,
      trimmedLength: trimmed.length,
      startsWithSBMidServer: trimmed.startsWith("SB-Mid-server"),
      startsWithMidServer: trimmed.startsWith("Mid-server"),
      isProduction,
    });
  }

  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const { order_id } = await req.json();

    if (!order_id || typeof order_id !== "string") {
      return errorResponse("order_id is required");
    }

    // 1. Verify order and business
    const { order, business } = await verifyOrderOwnership(order_id);

    // 2. Only allow online payment orders
    if (order.payment_method !== "online") {
      return errorResponse("This order is not for online payment");
    }

    // 3. Only allow pending orders
    if (order.payment_status !== "pending") {
      return errorResponse("Order is not pending payment");
    }

    // 4. Recalculate total from order_items
    const recalculatedTotal = await recalculateTotal(order_id);

    // 5. Update order total if different
    if (recalculatedTotal !== Number(order.total)) {
      await supabaseAdmin
        .from("orders")
        .update({ total: recalculatedTotal, updated_at: new Date().toISOString() })
        .eq("id", order_id);
    }

    // 6. Create Midtrans Snap transaction
    const midtransResult = await createMidtransTransaction(
      order_id,
      order.order_number,
      recalculatedTotal,
      business.name,
    );

    // 7. Save midtrans_order_id to orders table
    await supabaseAdmin
      .from("orders")
      .update({
        payment_ref: midtransResult.midtransOrderId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    // 8. Create payment record (pending)
    await supabaseAdmin.from("payments").insert({
      order_id: order_id,
      business_id: order.business_id,
      payment_provider: "midtrans",
      payment_method: "online",
      gross_amount: recalculatedTotal,
      transaction_status: "pending",
      payment_status: "pending",
      transaction_id: midtransResult.midtransOrderId,
    });

    return jsonResponse({
      data: {
        snap_token: midtransResult.snapToken,
        midtrans_order_id: midtransResult.midtransOrderId,
        redirect_url: midtransResult.redirectUrl,
        amount: recalculatedTotal,
      },
    });
  } catch (err) {
    console.error(`[midtrans-create-snap] Error: ${err instanceof Error ? err.message : err}`);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500,
    );
  }
});
