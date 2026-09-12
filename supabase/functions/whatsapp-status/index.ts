// whatsapp-status/index.ts
// Get WhatsApp Business connection status for the authenticated business.
//
// GET: Returns connection status, phone number, and configuration status.
//      No credentials or tokens exposed.

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    let auth;
    try {
      auth = await verifyAuth(req);
    } catch (authErr) {
      return errorResponse(
        authErr instanceof Error ? authErr.message : "Unauthorized",
        401
      );
    }

    // 2. Check if Meta credentials are configured
    const metaAppId = Deno.env.get("WHATSAPP_META_APP_ID");
    const metaConfigured = !!metaAppId;

    // 3. Get connection status
    const { data: connection } = await supabaseAdmin
      .from("whatsapp_business_connections")
      .select(
        `
        id,
        status,
        display_phone_number,
        business_name,
        verified_name,
        phone_number_id,
        whatsapp_business_id,
        waba_id,
        webhook_url,
        connected_at,
        disconnected_at,
        last_webhook_at,
        last_error,
        error_count,
        created_at,
        updated_at
      `
      )
      .eq("business_id", auth.businessId)
      .maybeSingle();

    // 4. Get webhook event count (last 24h)
    let webhookCount24h = 0;
    if (connection?.id) {
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();
      const { count } = await supabaseAdmin
        .from("whatsapp_webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connection.id)
        .gte("created_at", oneDayAgo);
      webhookCount24h = count || 0;
    }

    // 5. Get queue stats (using whatsapp_message_queue from 034)
    let queueStats = { queued: 0, processing: 0, completed: 0, failed: 0 };
    if (connection?.phone_number_id) {
      const base = supabaseAdmin
        .from("whatsapp_message_queue")
        .select("id", { count: "exact", head: true })
        .eq("phone_number_id", connection.phone_number_id);

      const [q, p, c, f] = await Promise.all([
        base.eq("status", "queued").then((r) => r.count || 0),
        base.eq("status", "processing").then((r) => r.count || 0),
        base.eq("status", "completed").then((r) => r.count || 0),
        base.eq("status", "failed").then((r) => r.count || 0),
      ]);

      queueStats = { queued: q, processing: p, completed: c, failed: f };
    }

    // 6. Mask phone number for display
    let maskedPhone = "";
    if (connection?.display_phone_number) {
      const phone = connection.display_phone_number;
      // Show last 4 digits: +62 812-XXXX-3456
      if (phone.length > 7) {
        maskedPhone =
          phone.slice(0, -4) + "•••" + phone.slice(-4);
      } else {
        maskedPhone = phone;
      }
    }

    // 7. Return status (no credentials exposed)
    return jsonResponse({
      data: {
        meta_configured: metaConfigured,
        connection: connection
          ? {
              id: connection.id,
              status: connection.status,
              display_phone_number: maskedPhone,
              phone_number_id: connection.phone_number_id,
              business_name: connection.business_name,
              verified_name: connection.verified_name,
              whatsapp_business_id: connection.whatsapp_business_id,
              waba_id: connection.waba_id,
              webhook_url: connection.webhook_url,
              connected_at: connection.connected_at,
              disconnected_at: connection.disconnected_at,
              last_webhook_at: connection.last_webhook_at,
              last_error: connection.last_error,
              error_count: connection.error_count,
              created_at: connection.created_at,
              updated_at: connection.updated_at,
              webhook_count_24h: webhookCount24h,
              queue_stats: queueStats,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("[whatsapp-status] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
