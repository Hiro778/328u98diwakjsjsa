import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { verifyAuth } from "../_shared/auth.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = Boolean(serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);

    let userAuth = null;
    if (!isServiceRole) {
      try {
        userAuth = await verifyAuth(req);
      } catch (authErr: any) {
        return errorResponse(authErr.message || "Unauthorized", 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const { notification_id, business_id } = body;

    if (!notification_id && !business_id) {
      return errorResponse("Missing notification_id or business_id", 400);
    }

    let notifData = null;
    let targetBusinessId = business_id;

    if (notification_id) {
      const { data, error } = await supabaseAdmin
        .from("notifications")
        .select("*")
        .eq("id", notification_id)
        .single();

      if (error || !data) {
        return errorResponse("Notification not found", 404);
      }
      notifData = data;
      targetBusinessId = data.business_id;
    } else {
      notifData = {
        id: null,
        title: body.title || "BisnisSehat Notifikasi",
        message: body.message || "",
        action_url: body.action_url || "/dashboard",
        category: body.category || "general",
        priority: body.priority || "normal",
        dedup_key: body.dedup_key || null,
      };
    }

    // Tenant Isolation: normal authenticated user can only dispatch push for their own business
    if (!isServiceRole && userAuth) {
      if (userAuth.businessId !== targetBusinessId) {
        return errorResponse("Access denied: You can only dispatch push notifications for your own business", 403);
      }
    }

    console.log(
      `[WebPush:Dispatch] notification_id: ${notifData.id || "manual"}, business_id: ${targetBusinessId}, priority: ${notifData.priority}, category: ${notifData.category}`
    );

    // Only send Web Push for high / urgent priorities to prevent notification spam
    if (notifData.priority !== "high" && notifData.priority !== "urgent") {
      console.log(`[WebPush:Skip] Priority '${notifData.priority}' is neither 'high' nor 'urgent'. Push skipped.`);
      return jsonResponse({
        skipped: true,
        reason: "Priority is not high or urgent",
        sent: 0,
      });
    }

    // TENANT ISOLATION: Fetch ONLY subscriptions belonging to targetBusinessId
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("business_id", targetBusinessId);

    if (subError) {
      console.error(`[WebPush:Error] Failed to fetch subscriptions:`, subError.message);
      return errorResponse(subError.message, 500);
    }

    const subCount = subscriptions?.length || 0;
    console.log(`[WebPush:SubCount] Found ${subCount} active subscription(s) for business: ${targetBusinessId}`);

    if (subCount === 0) {
      return jsonResponse({
        skipped: true,
        reason: "No active web push subscriptions for this business",
        sent: 0,
      });
    }

    // Configure VAPID from server-side environment secrets
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@bisnissehat.id";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("[WebPush:Error] VAPID credentials not configured in server secrets");
      return jsonResponse({
        skipped: true,
        reason: "VAPID credentials not configured on server",
        sent: 0,
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: notifData.title,
      message: notifData.message,
      action_url: notifData.action_url || "/dashboard",
      category: notifData.category,
      priority: notifData.priority,
      dedup_key: notifData.dedup_key,
    });

    let sentCount = 0;
    let failedCount = 0;
    let expiredCount = 0;

    for (const sub of subscriptions) {
      let endpointHost = "unknown";
      try {
        endpointHost = new URL(sub.endpoint).hostname;
      } catch (_) {
        // Safe fallback
      }

      console.log(`[WebPush:SendAttempt] Sending push to subscription ${sub.id} via ${endpointHost}`);

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          {
            TTL: 86400,
            urgency: notifData.priority === "urgent" ? "high" : "normal",
          }
        );
        sentCount++;
        console.log(`[WebPush:Result] Success for subscription ${sub.id}`);
      } catch (pushErr: any) {
        const statusCode = pushErr.statusCode;
        console.warn(`[WebPush:Result] Failed for subscription ${sub.id} (status: ${statusCode}): ${pushErr.message}`);

        // Handle expired or invalid endpoints (404 Not Found or 410 Gone)
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin
            .from("web_push_subscriptions")
            .delete()
            .eq("id", sub.id);
          expiredCount++;
          console.log(`[WebPush:Cleaned] Removed expired subscription ${sub.id} (HTTP ${statusCode})`);
        } else {
          failedCount++;
        }
      }
    }

    console.log(
      `[WebPush:Summary] Dispatch finished. Sent: ${sentCount}, Failed: ${failedCount}, Expired Cleaned: ${expiredCount}`
    );

    return jsonResponse({
      success: true,
      notification_id: notifData.id,
      business_id: targetBusinessId,
      subscription_count: subCount,
      sent: sentCount,
      failed: failedCount,
      expired_cleaned: expiredCount,
    });
  } catch (err: any) {
    console.error("[WebPush:UnhandledError]", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
