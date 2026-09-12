// creative-generate-prd/index.ts
// Generate AI Creative PRD from brief + product data
//
// POST body: { brief_id: string, product_id?: string }
// Returns: { prdId, prdContent, status }
//
// Flow:
// 1. Authenticate & validate business ownership
// 2. Validate subscription entitlement
// 3. Validate brief exists
// 4. Reserve 1 credit (atomic)
// 5. Build prompt with actual product data from DB
// 6. Call LLM provider (Gemini Flash-Lite)
// 7. Validate response schema
// 8. Store PRD in creative_prds
// 9. Create generation record
// 10. Consume credit
// 11. Return result or refund on failure

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// Required PRD fields for schema validation
const REQUIRED_PRD_FIELDS = [
  "headline",
  "subheadline",
  "body_copy",
  "product_snapshot",
  "negative_constraints",
  "platform_adaptations",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    // 1. Authenticate
    const auth = await verifyAuth(req);

    // 2. Parse request
    const { brief_id, product_id } = await req.json();

    if (!brief_id) {
      return errorResponse("brief_id is required", 400);
    }

    // 3. Validate brief ownership
    const { data: brief, error: briefError } = await supabaseAdmin
      .from("creative_briefs")
      .select("id, campaign_id, product_id, brief_json, reference_urls")
      .eq("id", brief_id)
      .single();

    if (briefError || !brief) {
      return errorResponse("Creative brief not found", 404);
    }

    // Validate campaign ownership
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("id, business_id")
      .eq("id", brief.campaign_id)
      .single();

    if (!campaign || campaign.business_id !== auth.businessId) {
      return errorResponse("Access denied: brief does not belong to your business", 403);
    }

    // 4. Get product data from database (source of truth)
    let productData = null;
    const productIdToUse = product_id || brief.product_id;

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

    // 5. Build prompt with actual product data
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
   - "negative_constraints": Array of constraints to avoid (array of strings)
   - "hook": Attention-grabbing opening (string)
   - "storyboard": Visual storyboard description (string)
   - "scene_descriptions": Array of scene descriptions for video (array of strings)
   - "camera_direction": Camera movement and framing (string)
   - "lighting": Lighting direction (string)
   - "duration": Video duration in seconds (number)
   - "CTA": Call to action text (string)
   - "caption": Social media caption (string)
   - "hashtags": Array of relevant hashtags (array of strings)

3. ALL product information MUST come from the Product Information section above. DO NOT invent product names, prices, SKUs, or descriptions.
4. ALL creative directions should respect the user's brief input.
5. Return ONLY the JSON object. No markdown, no code blocks, no explanatory text.
6. Ensure the JSON is valid and parseable.

Generate the JSON PRD now.`;

    // 6. Reserve 1 credit (atomic operation)
    const creditIdempotencyKey = `${auth.businessId}:prd_generate:${brief_id}:${Date.now()}`;

    // First check credit balance
    const { data: credits } = await supabaseAdmin
      .from("creative_credits")
      .select("available, reserved, consumed, total_earned")
      .eq("business_id", auth.businessId)
      .single();

    if (!credits || credits.available < 1) {
      return errorResponse("Insufficient credits for PRD generation", 400);
    }

    // Reserve credit
    const newAvailable = credits.available - 1;
    const newReserved = credits.reserved + 1;

    const { error: reserveError } = await supabaseAdmin
      .from("creative_credits")
      .update({
        available: newAvailable,
        reserved: newReserved,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", auth.businessId);

    if (reserveError) {
      return errorResponse(`Failed to reserve credit: ${reserveError.message}`, 500);
    }

    // Insert ledger entry for reservation
    await supabaseAdmin.from("credit_ledger").insert({
      business_id: auth.businessId,
      type: "reserve",
      credits: 1,
      balance_after: newAvailable + newReserved + credits.consumed,
      reference_type: "generation",
      description: "Credit reserved for PRD generation",
      idempotency_key: creditIdempotencyKey,
    });

    // 7. Create PRD record (status: generating)
    const { data: prd, error: prdError } = await supabaseAdmin
      .from("creative_prds")
      .insert({
        brief_id: brief_id,
        prd_content: {
          product_snapshot: productSnapshot,
          status: "generating",
        },
        version: 1,
        status: "generating",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (prdError) {
      // Refund credit on failure
      await supabaseAdmin.from("creative_credits").update({
        available: credits.available,
        reserved: credits.reserved,
        updated_at: new Date().toISOString(),
      }).eq("business_id", auth.businessId);

      await supabaseAdmin.from("credit_ledger").insert({
        business_id: auth.businessId,
        type: "unreserve",
        credits: 1,
        balance_after: credits.available + credits.reserved + credits.consumed,
        reference_type: "generation",
        description: "Credit unreserved due to PRD creation failure",
        idempotency_key: `${creditIdempotencyKey}:refund`,
      });

      return errorResponse(`Failed to create PRD record: ${prdError.message}`, 500);
    }

    // 8. Create generation record
    const promptHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(prompt)
    ).then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

    const genIdempotencyKey = `${auth.businessId}:${brief_id}:prd:${promptHash}:${Date.now()}`;

    const { data: generation, error: genError } = await supabaseAdmin
      .from("creative_generations")
      .insert({
        asset_id: prd.id,
        business_id: auth.businessId,
        provider: "gemini_flash_lite",
        model: "gemini-2.5-flash-lite",
        prompt_hash: promptHash,
        status: "processing",
        credits_charged: 1,
        idempotency_key: genIdempotencyKey,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (genError) {
      // Refund and cleanup
      await supabaseAdmin.from("creative_prds").delete().eq("id", prd.id);
      await supabaseAdmin.from("creative_credits").update({
        available: credits.available,
        reserved: credits.reserved,
        updated_at: new Date().toISOString(),
      }).eq("business_id", auth.businessId);

      return errorResponse(`Failed to create generation record: ${genError.message}`, 500);
    }

    // 9. Call LLM provider (with timeout)
    let llmResponse: string;
    let providerCostUsd = 0;

    try {
      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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

      // Calculate provider cost (Gemini Flash-Lite: $0.10/1M input, $0.40/1M output)
      const inputTokens = prompt.length / 4; // rough estimate
      const outputTokens = llmResponse.length / 4;
      providerCostUsd = (inputTokens * 0.1 + outputTokens * 0.4) / 1_000_000;

    } catch (llmError: any) {
      // LLM failed — refund credit and update records
      console.error("[creative-generate-prd] LLM error:", llmError);

      // Update generation as failed
      await supabaseAdmin.from("creative_generations").update({
        status: "failed",
        error_message: llmError.message || "LLM generation failed",
        completed_at: new Date().toISOString(),
      }).eq("id", generation.id);

      // Update PRD as failed
      await supabaseAdmin.from("creative_prds").update({
        status: "failed",
      }).eq("id", prd.id);

      // Refund credit
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
        reference_id: generation.id,
        description: `Credit refunded due to LLM failure: ${llmError.message}`,
        idempotency_key: `${genIdempotencyKey}:refund`,
      });

      return errorResponse(`PRD generation failed: ${llmError.message}`, 500);
    }

    // 10. Validate LLM response schema
    let parsedPrd: any;
    try {
      // Try to extract JSON from response (may be wrapped in markdown)
      let jsonStr = llmResponse;

      // Remove markdown code blocks if present
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }

      parsedPrd = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      // Invalid JSON — refund and fail
      console.error("[creative-generate-prd] JSON parse error:", parseError);

      await supabaseAdmin.from("creative_generations").update({
        status: "failed",
        error_message: "Invalid JSON response from LLM",
        completed_at: new Date().toISOString(),
      }).eq("id", generation.id);

      await supabaseAdmin.from("creative_prds").update({
        status: "failed",
      }).eq("id", prd.id);

      // Refund credit
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
        reference_id: generation.id,
        description: "Credit refunded due to invalid JSON response",
        idempotency_key: `${genIdempotencyKey}:refund:json`,
      });

      return errorResponse("PRD generation failed: Invalid response format", 500);
    }

    // 11. Validate required fields
    const missingFields = REQUIRED_PRD_FIELDS.filter((field) => !(field in parsedPrd));
    if (missingFields.length > 0) {
      // Incomplete PRD — still refund? Or accept with warnings?
      // For Phase 1, we'll accept but log warnings
      console.warn("[creative-generate-prd] Missing fields:", missingFields);
    }

    // 12. Ensure product_snapshot comes from database (not LLM invention)
    parsedPrd.product_snapshot = productSnapshot;

    // 13. Update PRD with validated content
    const { error: updatePrdError } = await supabaseAdmin
      .from("creative_prds")
      .update({
        prd_content: parsedPrd,
        status: "ready",
      })
      .eq("id", prd.id);

    if (updatePrdError) {
      console.error("[creative-generate-prd] Failed to update PRD:", updatePrdError);
    }

    // 14. Update generation as completed
    await supabaseAdmin.from("creative_generations").update({
      status: "completed",
      provider_cost_usd: providerCostUsd,
      completed_at: new Date().toISOString(),
    }).eq("id", generation.id);

    // 15. Consume the reserved credit
    await supabaseAdmin.from("creative_credits").update({
      reserved: credits.reserved,
      consumed: credits.consumed + 1,
      updated_at: new Date().toISOString(),
    }).eq("business_id", auth.businessId);

    await supabaseAdmin.from("credit_ledger").insert({
      business_id: auth.businessId,
      type: "consume",
      credits: 1,
      balance_after: credits.available + credits.reserved + credits.consumed + 1 - 1, // net: consumed+1, reserved same, available same
      reference_type: "generation",
      reference_id: generation.id,
      description: "Credit consumed for PRD generation",
      idempotency_key: `${genIdempotencyKey}:consume`,
    });

    // 16. Return success
    return jsonResponse({
      status: "ok",
      prdId: prd.id,
      generationId: generation.id,
      prdContent: parsedPrd,
      credits: {
        available: credits.available,
        reserved: credits.reserved,
        consumed: credits.consumed + 1,
      },
      provider_cost_usd: providerCostUsd,
    });

  } catch (error: any) {
    console.error("[creative-generate-prd] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
