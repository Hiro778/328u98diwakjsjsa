// creative-revise-prd/index.ts
// Revise existing PRD based on user instructions
//
// POST body: { prd_id: string, revision_instructions: string }
// Returns: { prdId, prdContent, version, status }
//
// Cost: 1 credit
// Flow: existing PRD + revision instructions → LLM → revised PRD

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { enforceAiFeatureFlag } from "../_shared/platform-settings.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    // @ban.md item 6: enforce enable_ai_features platform flag BEFORE calling AI provider
    const aiBlocked = await enforceAiFeatureFlag();
    if (aiBlocked) {
      return errorResponse(aiBlocked, 503);
    }

    const body = await req.json();
    const { prd_id, revision_instructions, business_id } = body || {};

    if (!prd_id || !revision_instructions) {
      return errorResponse("prd_id and revision_instructions are required", 400);
    }

    // Validate PRD ownership
    const { data: existingPrd, error: prdError } = await supabaseAdmin
      .from("creative_prds")
      .select("id, brief_id, prd_content, version, status")
      .eq("id", prd_id)
      .single();

    if (prdError || !existingPrd) {
      return errorResponse("PRD not found", 404);
    }

    // Validate campaign ownership via brief
    const { data: brief } = await supabaseAdmin
      .from("creative_briefs")
      .select("id, campaign_id")
      .eq("id", existingPrd.brief_id)
      .single();

    if (!brief) {
      return errorResponse("Brief not found", 404);
    }

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, business_id")
      .eq("id", brief.campaign_id)
      .single();

    if (!campaign) {
      return errorResponse("Campaign not found", 404);
    }

    const authoritativeBusinessId = campaign.business_id || business_id;
    const auth = await verifyAuth(req, authoritativeBusinessId);

    const { data: userBusiness } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", campaign.business_id)
      .eq("owner_id", auth.userId)
      .maybeSingle();

    if (!userBusiness) {
      return errorResponse("Access denied", 403);
    }

    // Check credit balance
    const { data: credits } = await supabaseAdmin
      .from("creative_credits")
      .select("available, reserved, consumed, total_earned")
      .eq("business_id", auth.businessId)
      .single();

    if (!credits || credits.available < 1) {
      return errorResponse("Insufficient credits for PRD revision", 400);
    }

    // Reserve 1 credit
    const creditIdempotencyKey = `${auth.businessId}:prd_revision:${prd_id}:${Date.now()}`;

    await supabaseAdmin.from("creative_credits").update({
      available: credits.available - 1,
      reserved: credits.reserved + 1,
      updated_at: new Date().toISOString(),
    }).eq("business_id", auth.businessId);

    await supabaseAdmin.from("credit_ledger").insert({
      business_id: auth.businessId,
      type: "reserve",
      credits: 1,
      balance_after: (credits.available - 1) + (credits.reserved + 1) + credits.consumed,
      reference_type: "generation",
      description: "Credit reserved for PRD revision",
      idempotency_key: creditIdempotencyKey,
    });

    // Build revision prompt
    const currentPrd = existingPrd.prd_content;
    const productSnapshot = currentPrd.product_snapshot || {};

    const prompt = `Revise the following Creative PRD based on user instructions.

CURRENT PRD:
${JSON.stringify(currentPrd, null, 2)}

USER REVISION INSTRUCTIONS:
${revision_instructions}

REQUIREMENTS:
1. Apply the revision instructions to the PRD.
2. Keep all product information (product_snapshot) EXACTLY as provided. Do NOT change product name, SKU, price, or description.
3. Maintain the same JSON structure.
4. Return ONLY the revised JSON. No markdown, no code blocks.

Generate the revised JSON PRD now.`;

    // Call LLM
    let llmResponse: string;
    try {
      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      llmResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!llmResponse) {
        throw new Error("Empty response from Gemini API");
      }
    } catch (llmError: any) {
      // Refund on failure
      await supabaseAdmin.from("creative_credits").update({
        available: credits.available,
        reserved: credits.reserved,
        updated_at: new Date().toISOString(),
      }).eq("business_id", auth.businessId);

      await supabaseAdmin.from("credit_ledger").insert({
        business_id: auth.businessId,
        type: "refund",
        credits: 1,
        balance_after: credits.available + credits.reserved + credits.consumed,
        reference_type: "generation",
        description: "Credit refunded due to LLM failure during revision",
        idempotency_key: `${creditIdempotencyKey}:refund`,
      });

      return errorResponse(`PRD revision failed: ${llmError.message}`, 500);
    }

    // Parse response
    let revisedPrd: any;
    try {
      let jsonStr = llmResponse;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      revisedPrd = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      // Refund on invalid JSON
      await supabaseAdmin.from("creative_credits").update({
        available: credits.available,
        reserved: credits.reserved,
        updated_at: new Date().toISOString(),
      }).eq("business_id", auth.businessId);

      await supabaseAdmin.from("credit_ledger").insert({
        business_id: auth.businessId,
        type: "refund",
        credits: 1,
        balance_after: credits.available + credits.reserved + credits.consumed,
        reference_type: "generation",
        description: "Credit refunded due to invalid JSON response",
        idempotency_key: `${creditIdempotencyKey}:refund:json`,
      });

      return errorResponse("PRD revision failed: Invalid response format", 500);
    }

    // Ensure product_snapshot is preserved
    revisedPrd.product_snapshot = productSnapshot;

    // Create new PRD version
    const { data: newPrd, error: createError } = await supabaseAdmin
      .from("creative_prds")
      .insert({
        brief_id: existingPrd.brief_id,
        prd_content: revisedPrd,
        version: existingPrd.version + 1,
        status: "ready",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      return errorResponse(`Failed to create revised PRD: ${createError.message}`, 500);
    }

    // Mark old PRD as superseded
    await supabaseAdmin.from("creative_prds").update({
      status: "superseded",
    }).eq("id", prd_id);

    // Consume credit
    await supabaseAdmin.from("creative_credits").update({
      reserved: credits.reserved,
      consumed: credits.consumed + 1,
      updated_at: new Date().toISOString(),
    }).eq("business_id", auth.businessId);

    await supabaseAdmin.from("credit_ledger").insert({
      business_id: auth.businessId,
      type: "consume",
      credits: 1,
      balance_after: credits.available + credits.reserved + credits.consumed + 1 - 1,
      reference_type: "generation",
      reference_id: newPrd.id,
      description: "Credit consumed for PRD revision",
      idempotency_key: `${creditIdempotencyKey}:consume`,
    });

    return jsonResponse({
      status: "ok",
      prdId: newPrd.id,
      prdContent: revisedPrd,
      version: newPrd.version,
      credits: {
        available: credits.available,
        reserved: credits.reserved,
        consumed: credits.consumed + 1,
      },
    });

  } catch (error: any) {
    console.error("[creative-revise-prd] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
