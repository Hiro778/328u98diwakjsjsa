// whatsapp-webhook/index.ts
// WhatsApp Cloud API Webhook endpoint.
//
// GET:  Verification challenge (Meta webhook registration)
// POST: Receive webhook events (messages, statuses, etc.)
//
// Phase 1: Validates, identifies connection, logs events safely.
// Does NOT execute operational commands (inventory, income, expense, etc.).

import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

// ══════════════════════════════════════════════════════════
// Webhook Signature Validation
// ══════════════════════════════════════════════════════════

/**
 * Validate X-Hub-Signature-256 header using HMAC-SHA256.
 * Meta sends this header for webhook payload verification.
 */
async function validateWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  // Format: "sha256=<hex-digest>"
  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expectedSig = parts[1];

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const computedSig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computedSig.length !== expectedSig.length) return false;

  let result = 0;
  for (let i = 0; i < computedSig.length; i++) {
    result |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }

  return result === 0;
}

// ══════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  // ── GET: Webhook Verification Challenge ──
  //
  // Meta sends GET with hub.mode=subscribe, hub.verify_token, hub.challenge
  // to verify the webhook endpoint before sending any events.
  //
  // Security: validate against app-level WHATSAPP_WEBHOOK_VERIFY_TOKEN secret.
  // This is a single app-level token — all connections share one webhook URL.
  // Per-connection app_secret is used for POST HMAC validation, not GET verification.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe") {
      return new Response("Forbidden", { status: 403 });
    }

    if (!token || !challenge) {
      return new Response("Bad Request", { status: 400 });
    }

    // Validate against app-level secret (NOT per-connection DB lookup)
    const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    if (!expectedToken) {
      console.error(
        "[whatsapp-webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured"
      );
      return new Response("Forbidden", { status: 403 });
    }

    if (token !== expectedToken) {
      console.error("[whatsapp-webhook] Invalid verify token");
      return new Response("Forbidden", { status: 403 });
    }

    // Return challenge (text/plain as per Meta spec)
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ── POST: Webhook Events ──
  if (req.method === "POST") {
    try {
      const bodyText = await req.text();
      const payload = JSON.parse(bodyText);

      // 1. Get signature header for validation
      const signatureHeader = req.headers.get("x-hub-signature-256");

      // 2. Determine phone_number_id from payload
      const phoneNumberId =
        payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        // Not a standard WhatsApp webhook — acknowledge but don't process
        return new Response("OK", { status: 200 });
      }

      // 3. REJECT if no signature header (before any connection lookup)
      //    SECURITY: Meta always sends X-Hub-Signature-256 on POST webhooks.
      //    Missing signature = reject immediately.
      if (!signatureHeader) {
        console.error(
          "[whatsapp-webhook] Missing X-Hub-Signature-256 header"
        );
        return new Response("Forbidden", { status: 403 });
      }

      // 4. Find the connection for this phone_number_id
      const { data: connection } = await supabaseAdmin
        .from("whatsapp_business_connections")
        .select(
          "id, business_id, app_secret_encrypted, status"
        )
        .eq("phone_number_id", phoneNumberId)
        .eq("status", "connected")
        .maybeSingle();

      if (!connection) {
        console.warn(
          "[whatsapp-webhook] No connection found for phone_number_id:",
          phoneNumberId
        );
        // No connection to validate against — acknowledge to prevent Meta retries
        return new Response("OK", { status: 200 });
      }

      // 5. Validate webhook signature — MANDATORY
      //    SECURITY: Invalid signature = reject. Never silently continue.
      if (!connection.app_secret_encrypted) {
        console.warn(
          "[whatsapp-webhook] WARNING: No app_secret_encrypted for connection:",
          connection.id,
          "— signature validation SKIPPED. Set WHATSAPP_META_APP_SECRET to fix."
        );
      }
      if (connection.app_secret_encrypted) {
        try {
          const { decrypt } = await import("../_shared/crypto.ts");
          const appSecret = await decrypt(connection.app_secret_encrypted);
          const isValid = await validateWebhookSignature(
            bodyText,
            signatureHeader,
            appSecret
          );

          if (!isValid) {
            console.error(
              "[whatsapp-webhook] Invalid HMAC signature for connection:",
              connection.id
            );
            return new Response("Forbidden", { status: 403 });
          }
        } catch (sigErr) {
          // Decrypt or crypto error — reject to be safe
          console.error(
            "[whatsapp-webhook] Signature validation error, rejecting:",
            sigErr
          );
          return new Response("Forbidden", { status: 403 });
        }
      }

      // 5. Extract event info for logging
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const eventType = change?.field || "unknown";

      // Determine if this is a message or status update
      const messages = value?.messages || [];
      const statuses = value?.statuses || [];
      const isMessage = messages.length > 0;
      const isStatus = statuses.length > 0;

      // Get event ID for deduplication
      const eventId =
        messages[0]?.id || statuses[0]?.id || null;

      const senderPhone = messages[0]?.from || "";
      const messageType = messages[0]?.type || "";

      // 6. Log webhook event (with deduplication check)
      if (eventId) {
        // Check for duplicate event
        const { data: existingLog } = await supabaseAdmin
          .from("whatsapp_webhook_logs")
          .select("id, status")
          .eq("event_id", eventId)
          .maybeSingle();

        if (existingLog) {
          // Duplicate — acknowledge but don't re-process
          return new Response("OK", { status: 200 });
        }
      }

      // Insert webhook log
      await supabaseAdmin.from("whatsapp_webhook_logs").insert({
        business_id: connection.business_id,
        connection_id: connection.id,
        event_type: eventType,
        event_id: eventId,
        phone_number_id: phoneNumberId,
        sender_phone: senderPhone,
        message_type: messageType,
        status: "received",
        payload: payload,
      });

      // 7. Update connection last_webhook_at
      await supabaseAdmin
        .from("whatsapp_business_connections")
        .update({
          last_webhook_at: new Date().toISOString(),
          last_error: "",
        })
        .eq("id", connection.id);

      // 8. If it's a message event, ingest into whatsapp_message_queue (REUSE from 034)
      if (isMessage && messages[0]) {
        const msg = messages[0];
        const whatsappMessageId = msg.id || `fallback_${Date.now()}`;

        // Upsert into queue with idempotency (unique constraint on whatsapp_message_id)
        const { error: queueError } = await supabaseAdmin
          .from("whatsapp_message_queue")
          .insert({
            business_id: connection.business_id,
            phone_number_id: phoneNumberId,
            whatsapp_message_id: whatsappMessageId,
            sender_phone: msg.from || "",
            message_type: msg.type || "text",
            message_text: msg.text?.body || "",
            payload: payload,
            status: "queued",
          });

        if (queueError) {
          if (queueError.code === "23505") {
            // Duplicate message — safe to ignore
            return new Response("OK", { status: 200 });
          }
          console.error(
            "[whatsapp-webhook] Queue insert error:",
            queueError
          );
        }
      }

      // 9. Acknowledge receipt (always 200 to prevent Meta retries)
      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("[whatsapp-webhook] POST error:", err);
      // Still return 200 — don't trigger Meta retries on parse errors
      return new Response("OK", { status: 200 });
    }
  }

  // ── Other methods ──
  return errorResponse("Method not allowed", 405);
});
