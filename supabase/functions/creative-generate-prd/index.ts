// supabase/functions/creative-generate-prd/index.ts
// Generate AI Creative PRD from brief + product data
//
// POST body: { brief_id: string, product_id?: string }
// Returns: { prdId, prdContent, status, credits }
//
// Rules from fix.md & fixwa.md:
// - 1x Free usage per business lifetime (checked via creative_free_usage)
// - Cost: 1 credit (GENERATE_PRD) if not free
// - Atomic credit debit via deduct_creative_credits_atomic ONLY after PRD is successfully validated
// - Primary Model: gemini-3.6-flash
// - Fallback Model: gemini-3.5-flash-lite (triggered only on 503/UNAVAILABLE availability errors)
// - No aggressive retry loops
// - Credit NOT deducted if generation or validation fails
// - Never expose GEMINI_API_KEY to frontend
// - Actual token usage from Gemini response.usageMetadata
// - Provider cost calculated based on actual model used
// - Recorded to public.ai_usage

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { enforceAiFeatureFlag } from "../_shared/platform-settings.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

const REQUIRED_PRD_FIELDS = [
  "headline",
  "subheadline",
  "body_copy",
  "product_snapshot",
  "negative_constraints",
  "platform_adaptations",
];

function isAvailabilityError(error: any): boolean {
  const status = error?.status;
  const msg = String(error?.message || error?.body || "");
  return (
    status === 503 ||
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("overloaded")
  );
}

async function requestGemini(model: string, prompt: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(url, {
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

    const responseText = await response.text();

    if (!response.ok) {
      const err = new Error(`Gemini API error ${response.status}: ${responseText}`);
      (err as any).status = response.status;
      (err as any).body = responseText;
      throw err;
    }

    const data = JSON.parse(responseText);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    return {
      text,
      usageMetadata: data.usageMetadata,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side (sec.md)
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // @ban.md item 6: enforce enable_ai_features platform flag BEFORE calling AI provider
    const aiBlocked = await enforceAiFeatureFlag();
    if (aiBlocked) {
      return errorResponse(aiBlocked, 503);
    }

    const body = await req.json();
    const { brief_id, product_id } = body || {};
    if (!brief_id) {
      return errorResponse("brief_id is required", 400);
    }

    // 1. Validate brief ownership
    const { data: brief, error: briefError } = await supabaseAdmin
      .from("creative_briefs")
      .select("id, campaign_id, product_id, brief_json, reference_urls")
      .eq("id", brief_id)
      .single();

    if (briefError || !brief) {
      return errorResponse("Creative brief not found", 404);
    }

    // 2. Validate campaign ownership
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("id, business_id")
      .eq("id", brief.campaign_id)
      .single();

    if (campaignError || !campaign) {
      return errorResponse("Campaign not found", 404);
    }

    // Verify authenticated user owns this business
    const { data: userBusiness } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", campaign.business_id)
      .eq("owner_id", auth.userId)
      .maybeSingle();

    if (!userBusiness) {
      return errorResponse("Access denied: You do not own this campaign", 403);
    }

    // Bind authoritative businessId
    auth.businessId = campaign.business_id;

    // 3. Resolve product data if present
    const productIdToUse = product_id || brief.product_id;
    let productData: any = null;

    if (productIdToUse) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("id, name, sku, description, unit_price, category")
        .eq("id", productIdToUse)
        .single();

      if (product) {
        productData = product;
      }
    }

    const briefData = brief.brief_json || {};
    const productSnapshot = productData
      ? {
          name: productData.name,
          sku: productData.sku || "",
          price: productData.unit_price || 0,
          description: productData.description || "",
          category: productData.category || "",
        }
      : {
          name: "Product not specified",
          sku: "",
          price: 0,
          description: "No product selected",
          category: "",
        };

    const prompt = `Create a comprehensive creative brief for marketing content.

Product Information (VERIFIED FROM DATABASE):
- Name: ${productSnapshot.name}
- SKU: ${productSnapshot.sku}
- Price: Rp${(productSnapshot.price || 0).toLocaleString("id-ID")}
- Description: ${productSnapshot.description}
- Category: ${productSnapshot.category}

Creative Brief from User (FREE TEXT - DO NOT MODIFY):
- Vibe/Style: ${briefData.vibe_style || "Not specified"}
- Objective: ${briefData.objective || "Not specified"}
- Target Audience: ${briefData.target_audience || "Not specified"}
- Platform: ${briefData.platform || "Not specified"}
- CTA: ${briefData.cta || "Not specified"}
- Offer/Promo: ${briefData.offer_promo || "Not specified"}
- Duration: ${briefData.duration_seconds || "Not specified"} seconds
- Language: ${briefData.language || "id"}
- Negative Constraints: ${briefData.negative_constraints || "None"}
- Brand Constraints: ${briefData.brand_constraints || "None"}
- Additional Instructions: ${briefData.additional_instructions || "None"}

REQUIREMENTS:
1. Generate a structured PRD in JSON format.
2. The JSON MUST include these exact fields:
   - "headline": Catchy headline for marketing (string)
   - "subheadline": Supporting subheadline (string)
   - "body_copy": Main body copy for marketing materials (string)
   - "image_prompt_standard": Prompt for standard image generation, 1024x1024 (string)
   - "image_prompt_premium": Prompt for premium image generation, HD quality (string)
   - "video_concept": Concept description for video, 5-8 seconds (string)
   - "video_script": Full script for video generation (string)
   - "platform_adaptations": Object with platform-specific adaptations (object)
   - "product_snapshot": Object with name, sku, price, description (object)

3. Return ONLY valid JSON. No markdown backticks.`;

    // 4. Atomic Check & Claim 1x Lifetime Free Usage (Anti-Race Condition)
    const requestId = `PRD-${crypto.randomUUID()}`;
    let isFreeUsage = false;

    const { data: claimRes } = await supabaseAdmin.rpc("claim_creative_free_usage_atomic", {
      p_business_id: auth.businessId,
      p_profile_id: auth.userId,
      p_operation: "GENERATE_PRD",
      p_request_id: requestId,
    });

    if (claimRes?.success) {
      isFreeUsage = true;
    }

    const CREATIVE_GENERATION_COST = 20;
    const requiredCredits = isFreeUsage ? 0 : CREATIVE_GENERATION_COST; // 20 tokens per ai.md single source of truth

    // 5. Pre-check Credit Balance (prevent generating if credits insufficient)
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

    // 6. Create PRD record (status: generating)
    const { data: prd, error: prdError } = await supabaseAdmin
      .from("creative_prds")
      .insert({
        brief_id: brief_id,
        prd_content: {
          product_snapshot: productSnapshot,
          status: "generating",
          is_free_generation: isFreeUsage,
          request_id: requestId,
        },
        version: 1,
        status: "generating",
      })
      .select()
      .single();

    if (prdError) {
      if (isFreeUsage) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }
      return errorResponse(`Failed to create PRD record: ${prdError.message}`, 500);
    }

    // 7. Call LLM (Primary Model with Fallback on 503/UNAVAILABLE)
    let llmResponse = "";
    let usageMetadata: any = null;
    let modelUsed = PRIMARY_MODEL;

    try {
      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      try {
        const result = await requestGemini(PRIMARY_MODEL, prompt, GEMINI_API_KEY);
        llmResponse = result.text;
        usageMetadata = result.usageMetadata;
        modelUsed = PRIMARY_MODEL;
      } catch (primaryErr: any) {
        // Fallback ONLY for availability errors (503 / UNAVAILABLE / high demand)
        if (isAvailabilityError(primaryErr)) {
          console.warn(`[creative-generate-prd] Primary model ${PRIMARY_MODEL} unavailable (503/UNAVAILABLE). Falling back to ${FALLBACK_MODEL}...`);
          const fallbackResult = await requestGemini(FALLBACK_MODEL, prompt, GEMINI_API_KEY);
          llmResponse = fallbackResult.text;
          usageMetadata = fallbackResult.usageMetadata;
          modelUsed = FALLBACK_MODEL;
        } else {
          // Do not fallback on 400 or other non-availability errors
          throw primaryErr;
        }
      }
    } catch (llmError: any) {
      // Credit and free usage NOT consumed on generation failure
      if (isFreeUsage) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }
      await supabaseAdmin.from("creative_prds").update({ status: "failed" }).eq("id", prd.id);
      return errorResponse(`PRD generation failed: ${llmError.message}`, 500);
    }

    // 8. Parse & Validate LLM response JSON
    let parsedPrd: any;
    try {
      let jsonStr = llmResponse;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      parsedPrd = JSON.parse(jsonStr.trim());
    } catch (_parseError) {
      // Free usage NOT consumed on parse failure
      if (isFreeUsage) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }
      await supabaseAdmin.from("creative_prds").update({ status: "failed" }).eq("id", prd.id);
      return errorResponse("Format respons AI tidak valid. Kredit tidak dipotong.", 500);
    }

    // Validate required fields structure
    if (!parsedPrd || typeof parsedPrd !== "object" || !parsedPrd.headline || !parsedPrd.body_copy) {
      if (isFreeUsage) {
        await supabaseAdmin.rpc("rollback_creative_free_usage", {
          p_business_id: auth.businessId,
          p_request_id: requestId,
        });
      }
      await supabaseAdmin.from("creative_prds").update({ status: "failed" }).eq("id", prd.id);
      return errorResponse("Format respons AI tidak valid. Kredit tidak dipotong.", 500);
    }

    parsedPrd.product_snapshot = productSnapshot;
    parsedPrd.is_free_generation = isFreeUsage;
    parsedPrd.request_id = requestId;

    // 9. Atomic Debit (ONLY AFTER PRD response is successfully validated)
    if (!isFreeUsage) {
      const { data: debitResult, error: debitErr } = await supabaseAdmin.rpc("deduct_creative_credits_atomic", {
        p_business_id: auth.businessId,
        p_credits: requiredCredits,
        p_operation: "GENERATE_PRD",
        p_request_id: requestId,
        p_metadata: { brief_id },
      });

      if (debitErr || !debitResult?.success) {
        await supabaseAdmin.from("creative_prds").update({ status: "failed" }).eq("id", prd.id);
        return errorResponse(
          debitResult?.error === "INSUFFICIENT_CREDITS"
            ? "Creative Credits tidak cukup. Silakan top up untuk melanjutkan."
            : "Gagal memproses saldo kredit.",
          400
        );
      }
    }

    // 10. Update PRD with ready status
    await supabaseAdmin
      .from("creative_prds")
      .update({ prd_content: parsedPrd, status: "ready" })
      .eq("id", prd.id);

    // 11. Extract tokens & calculate provider cost based on actual model used
    const inputTokens = usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4);
    const outputTokens = usageMetadata?.candidatesTokenCount ?? Math.ceil(llmResponse.length / 4);
    const totalTokens = usageMetadata?.totalTokenCount ?? (inputTokens + outputTokens);
    const isEstimated = !usageMetadata;

    const inputRate = modelUsed === "gemini-3.5-flash-lite" ? 0.00000010 : 0.00000030;
    const outputRate = modelUsed === "gemini-3.5-flash-lite" ? 0.00000040 : 0.00000250;
    const providerCostUsd = (inputTokens * inputRate) + (outputTokens * outputRate);

    // 12. Record to ai_usage
    await supabaseAdmin.from("ai_usage").insert({
      business_id: auth.businessId,
      profile_id: auth.userId,
      operation: "GENERATE_PRD",
      model: modelUsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      credits_charged: isFreeUsage ? 0 : requiredCredits,
      provider_cost_usd: providerCostUsd,
      is_estimated: isEstimated,
      status: "success",
      request_id: requestId,
      metadata: { brief_id, prd_id: prd.id, fallback_triggered: modelUsed !== PRIMARY_MODEL },
    });

    // 13. Record Free Usage ledger if applicable
    if (isFreeUsage) {
      const { data: curBal } = await supabaseAdmin
        .from("creative_credits")
        .select("available")
        .eq("business_id", auth.businessId)
        .maybeSingle();

      await supabaseAdmin.from("credit_ledger").insert({
        business_id: auth.businessId,
        type: "FREE_USAGE",
        credits: 0,
        balance_after: curBal?.available ?? 0,
        reference_type: "generation",
        reference_id: prd.id,
        description: "1x Free AI Marketing Usage (GENERATE_PRD)",
        idempotency_key: `${requestId}:free`,
      });
    }

    const { data: finalBal } = await supabaseAdmin
      .from("creative_credits")
      .select("available, consumed")
      .eq("business_id", auth.businessId)
      .maybeSingle();

    return jsonResponse({
      status: "ok",
      prdId: prd.id,
      prdContent: parsedPrd,
      isFreeUsage,
      modelUsed,
      credits: finalBal || { available: 0, consumed: 0 },
    });

  } catch (error: any) {
    console.error("[creative-generate-prd] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
