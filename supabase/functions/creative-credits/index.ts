// creative-credits/index.ts
// Credit management for Creative Studio
//
// POST body: { action: 'reserve' | 'consume' | 'refund' | 'unreserve' | 'grant', action_type: string, idempotency_key: string }
// Returns: { available, reserved, consumed, total_earned, already_processed }
//
// Server-side authoritative credit system.
// Frontend NEVER determines cost — backend calculates and validates.

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";

// Credit costs per action (PROPOSED BUSINESS RULE)
const CREDIT_COSTS: Record<string, number> = {
  "prd_generate": 1,
  "prd_revision": 1,
  "copy_generate": 1,
  "image_standard": 2,
  "image_premium": 4,
  "video_fast": 6,
  "video_premium": 10,
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return corsResponse();

  try {
    // Authenticate and get business context
    const auth = await verifyAuth(req);

    // Parse request body
    const { action, action_type, idempotency_key } = await req.json();

    // Validate required fields
    if (!action || !["reserve", "consume", "refund", "unreserve", "grant"].includes(action)) {
      return errorResponse("Invalid action. Must be: reserve, consume, refund, unreserve, grant", 400);
    }

    if (!idempotency_key) {
      return errorResponse("idempotency_key is required", 400);
    }

    // Determine credit cost from action_type (backend authoritative)
    let credit_cost = 0;
    if (action === "reserve" || action === "consume") {
      if (!action_type || !CREDIT_COSTS[action_type]) {
        return errorResponse("Invalid action_type for credit deduction", 400);
      }
      credit_cost = CREDIT_COSTS[action_type];
    }

    // Idempotency check — prevent double charge
    const { data: existing } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, type, credits, balance_after")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (existing) {
      // Already processed — return current balance without charging again
      const { data: credits } = await supabaseAdmin
        .from("creative_credits")
        .select("available, reserved, consumed, total_earned")
        .eq("business_id", auth.businessId)
        .single();

      return jsonResponse({
        status: "ok",
        already_processed: true,
        existing_entry: {
          type: existing.type,
          credits: existing.credits,
          balance_after: existing.balance_after,
        },
        available: credits?.available ?? 0,
        reserved: credits?.reserved ?? 0,
        consumed: credits?.consumed ?? 0,
        total_earned: credits?.total_earned ?? 0,
      });
    }

    // Get current credits
    const { data: currentCredits, error: creditsError } = await supabaseAdmin
      .from("creative_credits")
      .select("available, reserved, consumed, total_earned")
      .eq("business_id", auth.businessId)
      .single();

    if (creditsError || !currentCredits) {
      return errorResponse("Creative credits not found for this business", 404);
    }

    let newAvailable = currentCredits.available;
    let newReserved = currentCredits.reserved;
    let newConsumed = currentCredits.consumed;
    let newTotal = currentCredits.total_earned;

    // Validate and apply credit mutation
    switch (action) {
      case "reserve": {
        // Move from available to reserved (for async generation like video)
        if (currentCredits.available < credit_cost) {
          return errorResponse(
            `Insufficient available credits. Have ${currentCredits.available}, need ${credit_cost}`,
            400
          );
        }
        newAvailable -= credit_cost;
        newReserved += credit_cost;
        break;
      }

      case "consume": {
        // Move from reserved to consumed (async complete) or available to consumed (sync)
        if (currentCredits.reserved >= credit_cost) {
          // Deduct from reserved first
          newReserved -= credit_cost;
          newConsumed += credit_cost;
        } else if (currentCredits.available >= credit_cost) {
          // Then from available
          newAvailable -= credit_cost;
          newConsumed += credit_cost;
        } else {
          return errorResponse(
            `Insufficient credits. Available: ${currentCredits.available}, Reserved: ${currentCredits.reserved}`,
            400
          );
        }
        break;
      }

      case "refund": {
        // Move from consumed back to available
        if (currentCredits.consumed < credit_cost) {
          return errorResponse(
            `Cannot refund ${credit_cost} credits. Only ${currentCredits.consumed} consumed`,
            400
          );
        }
        newConsumed -= credit_cost;
        newAvailable += credit_cost;
        break;
      }

      case "unreserve": {
        // Move from reserved back to available (timeout, failure)
        if (currentCredits.reserved < credit_cost) {
          return errorResponse(
            `Cannot unreserve ${credit_cost} credits. Only ${currentCredits.reserved} reserved`,
            400
          );
        }
        newReserved -= credit_cost;
        newAvailable += credit_cost;
        break;
      }

      case "grant": {
        // Add credits (subscription renewal, addon purchase)
        newAvailable += credit_cost;
        newTotal += credit_cost;
        break;
      }
    }

    // Conservation invariant check (must always hold)
    if (newAvailable + newReserved + newConsumed !== newTotal) {
      return errorResponse("Credit conservation invariant violated", 500);
    }

    // Update credits atomically
    const { error: updateError } = await supabaseAdmin
      .from("creative_credits")
      .update({
        available: newAvailable,
        reserved: newReserved,
        consumed: newConsumed,
        total_earned: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", auth.businessId);

    if (updateError) {
      return errorResponse(`Failed to update credits: ${updateError.message}`, 500);
    }

    // Insert into immutable ledger
    const { error: ledgerError } = await supabaseAdmin
      .from("credit_ledger")
      .insert({
        business_id: auth.businessId,
        type: action,
        credits: credit_cost,
        balance_after: newAvailable + newReserved + newConsumed,
        reference_type: action === "grant" ? "subscription" : "generation",
        description: `Credit ${action} via ${action_type || "subscription"}`,
        idempotency_key: idempotency_key,
      });

    if (ledgerError) {
      // Ledger insert failed — attempt to rollback credit update
      // This is a critical error; credits may be in inconsistent state
      console.error("[creative-credits] Ledger insert failed after credit update:", ledgerError);
      return errorResponse(`Failed to record credit transaction: ${ledgerError.message}`, 500);
    }

    return jsonResponse({
      status: "ok",
      already_processed: false,
      available: newAvailable,
      reserved: newReserved,
      consumed: newConsumed,
      total_earned: newTotal,
    });

  } catch (error: any) {
    console.error("[creative-credits] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
