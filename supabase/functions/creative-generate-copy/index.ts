// supabase/functions/creative-generate-copy/index.ts
// Generate marketing copy from approved PRD
//
// POST body: { prd_id: string }
// Returns: { assetId, copyContent, status, credits }
//
// Business Rules (fixwa.md):
// - 1x Free AI usage lifetime per business (tracked in creative_free_usage)
// - Operation cost: 2 credits (GENERATE_COPY)
// - Atomic credit debit via deduct_creative_credits_atomic (prevents negative balance)
// - Actual token usage extracted from Gemini response.usageMetadata
// - Provider cost calculated using official Gemini 2.5 Flash pricing:
//   Input: $0.30/1M ($0.00000030/tok), Output: $2.50/1M ($0.00000250/tok)
// - Recorded to public.ai_usage with idempotency request_id

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { enforceAiFeatureFlag } from "../_shared/platform-settings.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // @ban.md item 6: enforce enable_ai_features platform flag BEFORE calling AI provider
    const aiBlocked = await enforceAiFeatureFlag();
    if (aiBlocked) {
      return errorResponse(aiBlocked, 503);
    }

    const { prd_id } = await req.json();
    if (!prd_id) {
      return errorResponse("prd_id is required", 400);
    }

    // 1. Validate PRD ownership and status
    const { data: prd, error: prdError } = await supabaseAdmin
      .from("creative_prds")
      .select("id, brief_id, prd_content, status")
      .eq("id", prd_id)
      .single();

    if (prdError || !prd) {
      return errorResponse("PRD not found", 404);
    }

    if (prd.status !== "ready" && prd.status !== "approved") {
      return errorResponse("PRD must be approved before generating copy", 400);
    }

    // 2. Validate campaign ownership
    const { data: brief } = await supabaseAdmin
      .from("creative_briefs")
      .select("id, campaign_id")
      .eq("id", prd.brief_id)
      .single();

    if (!brief) {
      return errorResponse("Brief not found", 404);
    }

    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, business_id")
      .eq("id", brief.campaign_id)
      .single();

    if (!campaign || campaign.business_id !== auth.businessId) {
      return errorResponse("Access denied", 403);
    }

    // 3. Entitlement & Free Trial Workflow Linkage
    const requestId = `COPY-${crypto.randomUUID()}`;
    let isFreeUsage = false;

    // Check if this PRD was generated as part of the business's lifetime free trial
    const isPrdFree = Boolean(prd.prd_content?.is_free_generation);

    if (isPrdFree) {
      // Verify business has lifetime free usage claimed
      const { data: freeUsage } = await supabaseAdmin
        .from("creative_free_usage")
        .select("id")
        .eq("business_id", auth.businessId)
        .maybeSingle();

      // Check if a copy asset has already been generated for this PRD
      const { data: existingCopy } = await supabaseAdmin
        .from("creative_assets")
        .select("id")
        .eq("prd_id", prd.id)
        .eq("asset_type", "copy")
        .maybeSingle();

      // If PRD was free and no copy asset exists yet, this copy is part of the ONE lifetime free workflow!
      if (freeUsage && !existingCopy) {
        isFreeUsage = true;
      }
    }

    // If not free via PRD workflow, check if business has unused lifetime free trial
    let directFreeClaimed = false;
    if (!isFreeUsage) {
      const { data: claimRes } = await supabaseAdmin.rpc("claim_creative_free_usage_atomic", {
        p_business_id: auth.businessId,
        p_profile_id: auth.userId,
        p_operation: "GENERATE_COPY",
        p_request_id: requestId,
      });

      if (claimRes?.success) {
        isFreeUsage = true;
        directFreeClaimed = true;
      }
    }

    const CREATIVE_GENERATION_COST = 20;
    const requiredCredits = isFreeUsage ? 0 : CREATIVE_GENERATION_COST; // 20 tokens per ai.md single source of truth

    // 4. Pre-check Credit Balance (if not free)
    if (!isFreeUsage) {
      const { data: creditRec } = await supabaseAdmin
        .from("creative_credits")
        .select("available")
        .eq("business_id", auth.businessId)
        .maybeSingle();

      const availableCredits = creditRec?.available ?? 0;
      if (availableCredits < requiredCredits) {
        return errorResponse("Creative Credits tidak cukup. Silakan top up untuk melanjutkan.", 400);
      }
    }

    // 5. Build copy generation prompt
    const prdContent = prd.prd_content;
    const productSnapshot = prdContent.product_snapshot || {};

    const prompt = `Generate marketing copy based on the following Creative PRD.

PRODUCT INFORMATION (VERIFIED FROM DATABASE):
- Name: ${productSnapshot.name || "Produk UMKM"}
- SKU: ${productSnapshot.sku || "N/A"}
- Price: Rp${(productSnapshot.price || 0).toLocaleString("id-ID")}
- Description: ${productSnapshot.description || "N/A"}

CREATIVE PRD:
${JSON.stringify(prdContent, null, 2)}

REQUIREMENTS:
1. Generate marketing copy for the product based on the PRD.
2. ALL product information MUST come from the Product Information section. Do NOT invent product names, prices, or features.
3. The copy should be engaging, persuasive, and appropriate for the target audience.
4. Return a JSON object with these exact fields:
   - "headline": Attention-grabbing headline (string)
   - "primary_text": Main body text for ads (string, max 125 characters)
   - "caption": Social media caption (string)
   - "CTA": Call to action text (string)
   - "hashtags": Array of relevant hashtags (array of strings)
   - "platform_adaptations": Object with platform-specific copy versions (object)

5. Return ONLY valid JSON. No markdown backticks.`;

    // 6. Call LLM (Gemini 2.5 Flash)
    let llmResponse = "";
    let usageMetadata: any = null;

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
            maxOutputTokens: 1024,
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
      usageMetadata = data.usageMetadata;

      if (!llmResponse) {
        throw new Error("Empty response from Gemini API");
      }
    } catch (llmError: any) {
      if (directFreeClaimed) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }

      return errorResponse(`Copy generation failed: ${llmError.message}`, 500);
    }

    // 7. Parse response
    let copyContent: any;
    try {
      let jsonStr = llmResponse;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      copyContent = JSON.parse(jsonStr.trim());
    } catch (_parseError) {
      if (directFreeClaimed) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }

      return errorResponse("Format respons AI tidak valid. Kredit tidak dipotong.", 500);
    }

    // 8. Atomic Debit (ONLY AFTER Copy response is successfully validated)
    if (!isFreeUsage) {
      const { data: debitResult, error: debitErr } = await supabaseAdmin.rpc("deduct_creative_credits_atomic", {
        p_business_id: auth.businessId,
        p_credits: requiredCredits,
        p_operation: "GENERATE_COPY",
        p_request_id: requestId,
        p_metadata: { prd_id },
      });

      if (debitErr || !debitResult?.success) {
        return errorResponse(
          debitResult?.error === "INSUFFICIENT_CREDITS"
            ? "Creative Credits tidak cukup. Silakan top up untuk melanjutkan."
            : "Gagal memproses saldo kredit.",
          400
        );
      }
    }

    // 9. Create Asset record
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .insert({
        prd_id: prd_id,
        business_id: auth.businessId,
        asset_type: "copy",
        storage_path: "",
        metadata: copyContent,
        credit_cost: requiredCredits,
      })
      .select()
      .single();

    if (assetError) {
      return errorResponse(`Gagal menyimpan aset copy: ${assetError.message}`, 500);
    }

    // 9. Calculate Token Usage & Gemini 2.5 Flash Provider Cost
    const inputTokens = usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
    const outputTokens = usageMetadata?.candidatesTokenCount ?? Math.ceil(llmResponse.length / 4);
    const totalTokens = usageMetadata?.totalTokenCount ?? (inputTokens + outputTokens);
    const isEstimated = !usageMetadata;
    const providerCostUsd = (inputTokens * 0.00000030) + (outputTokens * 0.00000250);

    // 10. Record into ai_usage ledger
    await supabaseAdmin.from("ai_usage").insert({
      business_id: auth.businessId,
      profile_id: auth.userId,
      operation: "GENERATE_COPY",
      model: "gemini-2.5-flash",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      credits_charged: isFreeUsage ? 0 : requiredCredits,
      provider_cost_usd: providerCostUsd,
      is_estimated: isEstimated,
      status: "success",
      request_id: requestId,
      metadata: { prd_id, asset_id: asset.id },
    });

    // 11. Record 1x Free Usage ledger if this was the free operation
    if (isFreeUsage) {
      const { data: currentCredits } = await supabaseAdmin
        .from("creative_credits")
        .select("available")
        .eq("business_id", auth.businessId)
        .maybeSingle();

      await supabaseAdmin.from("credit_ledger").insert({
        business_id: auth.businessId,
        type: "FREE_USAGE",
        credits: 0,
        balance_after: currentCredits?.available ?? 0,
        reference_type: "generation",
        reference_id: asset.id,
        description: "1x Free AI Marketing Usage (GENERATE_COPY)",
        idempotency_key: `${requestId}:free`,
      });
    }

    // Fetch updated balance for response
    const { data: updatedBalance } = await supabaseAdmin
      .from("creative_credits")
      .select("available, reserved, consumed, total_earned")
      .eq("business_id", auth.businessId)
      .maybeSingle();

    return jsonResponse({
      status: "ok",
      assetId: asset.id,
      copyContent,
      isFreeUsage,
      credits: updatedBalance || { available: 0, consumed: 0 },
    });

  } catch (error: any) {
    console.error("[creative-generate-copy] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
