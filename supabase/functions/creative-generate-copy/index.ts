// creative-generate-copy/index.ts
// Generate marketing copy from approved PRD
//
// POST body: { prd_id: string }
// Returns: { assetId, copyContent, status }
//
// Cost: 1 credit
// Flow: approved PRD + product data → LLM → marketing copy

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    const { prd_id } = await req.json();

    if (!prd_id) {
      return errorResponse("prd_id is required", 400);
    }

    // Validate PRD ownership and status
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

    // Validate campaign ownership
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

    // Check credit balance
    const { data: credits } = await supabaseAdmin
      .from("creative_credits")
      .select("available, reserved, consumed, total_earned")
      .eq("business_id", auth.businessId)
      .single();

    if (!credits || credits.available < 1) {
      return errorResponse("Insufficient credits for copy generation", 400);
    }

    // Reserve 1 credit
    const creditIdempotencyKey = `${auth.businessId}:copy_generate:${prd_id}:${Date.now()}`;

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
      description: "Credit reserved for copy generation",
      idempotency_key: creditIdempotencyKey,
    });

    // Build copy generation prompt
    const prdContent = prd.prd_content;
    const productSnapshot = prdContent.product_snapshot || {};

    const prompt = `Generate marketing copy based on the following Creative PRD.

PRODUCT INFORMATION (VERIFIED FROM DATABASE):
- Name: ${productSnapshot.name}
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
   - "primary_text": Main body text for ads (string, max 125 characters for primary, expandable for description)
   - "caption": Social media caption (string)
   - "CTA": Call to action text (string)
   - "hashtags": Array of relevant hashtags (array of strings)
   - "platform_adaptations": Object with platform-specific copy versions (object)

5. Return ONLY the JSON. No markdown, no code blocks.

Generate the JSON copy now.`;

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
        description: "Credit refunded due to LLM failure during copy generation",
        idempotency_key: `${creditIdempotencyKey}:refund`,
      });

      return errorResponse(`Copy generation failed: ${llmError.message}`, 500);
    }

    // Parse response
    let copyContent: any;
    try {
      let jsonStr = llmResponse;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      copyContent = JSON.parse(jsonStr.trim());
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

      return errorResponse("Copy generation failed: Invalid response format", 500);
    }

    // Create asset record
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("creative_assets")
      .insert({
        prd_id: prd_id,
        business_id: auth.businessId,
        asset_type: "copy",
        storage_path: "",
        metadata: copyContent,
        credit_cost: 1,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (assetError) {
      return errorResponse(`Failed to create asset: ${assetError.message}`, 500);
    }

    // Create generation record
    const promptHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(prompt)
    ).then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

    const genIdempotencyKey = `${auth.businessId}:${prd_id}:copy:${promptHash}:${Date.now()}`;

    await supabaseAdmin.from("creative_generations").insert({
      asset_id: asset.id,
      business_id: auth.businessId,
      provider: "gemini_flash_lite",
      model: "gemini-2.5-flash-lite",
      prompt_hash: promptHash,
      status: "completed",
      credits_charged: 1,
      completed_at: new Date().toISOString(),
      idempotency_key: genIdempotencyKey,
    });

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
      reference_id: asset.id,
      description: "Credit consumed for copy generation",
      idempotency_key: `${genIdempotencyKey}:consume`,
    });

    return jsonResponse({
      status: "ok",
      assetId: asset.id,
      copyContent,
      credits: {
        available: credits.available,
        reserved: credits.reserved,
        consumed: credits.consumed + 1,
      },
    });

  } catch (error: any) {
    console.error("[creative-generate-copy] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
