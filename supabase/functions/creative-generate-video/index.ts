// supabase/functions/creative-generate-video/index.ts
// AI Video Generator Backend via Atlas Cloud
//
// Endpoints:
// - POST { action: "generate", prd_id?, prompt?, image_url?, duration?, resolution?, ratio? }
//   Submits async video task to Atlas Cloud: POST https://api.atlascloud.ai/api/v1/model/generateVideo
//   Returns { taskId, generationId, assetId, status: "processing" }
//
// - POST { action: "status", task_id: string, generation_id?: string }
//   Polls task status from Atlas Cloud: GET https://api.atlascloud.ai/api/v1/model/prediction/{id}
//   Returns { status: "pending" | "processing" | "completed" | "failed", videoUrl?, error? }
//
// Security & Constraints (struk.md):
// - ATLAS_API_KEY only on backend, never exposed to client
// - Model MVP: "bytedance/seedance-2.0-mini/text-to-video"
// - Image-to-video: "bytedance/seedance-2.5/image-to-video"
// - Capped duration: max 8s
// - Capped resolution: "480p"
// - Ratio: "9:16"
// - generate_audio: true
// - Prompt validation & idempotency
// - PRD is strictly isolated (uses Gemini, never Atlas)

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { isAIFeaturesEnabled } from "../_shared/entitlement.ts";

const ATLAS_API_KEY = Deno.env.get("ATLAS_API_KEY");
const ATLAS_BASE_URL = "https://api.atlascloud.ai/api/v1";

const TEXT_TO_VIDEO_MODEL = "bytedance/seedance-2.0-mini/text-to-video";
const IMAGE_TO_VIDEO_MODEL = "bytedance/seedance-2.5/image-to-video";

const DEFAULT_DURATION = 8;
const DEFAULT_RESOLUTION = "480p";
const DEFAULT_RATIO = "9:16";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // Authoritative platform-wide AI flag enforcement (@ban.md)
    if (!(await isAIFeaturesEnabled())) {
      return errorResponse("AI_FEATURES_DISABLED: Fitur kecerdasan buatan sedang dinonaktifkan oleh administrator platform.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "generate";

    // ── 1. STATUS POLLING ACTION ──
    if (action === "status") {
      const taskId = body.task_id;
      if (!taskId) {
        return errorResponse("task_id is required for status check", 400);
      }

      if (!ATLAS_API_KEY) {
        return errorResponse("ATLAS_API_KEY not configured on server", 500);
      }

      // Query Atlas Cloud Prediction endpoint per docs: GET /api/v1/model/prediction/{id}
      const atlasRes = await fetch(`${ATLAS_BASE_URL}/model/prediction/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ATLAS_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!atlasRes.ok) {
        const errorText = await atlasRes.text();
        return errorResponse(`Atlas Cloud API error ${atlasRes.status}: ${errorText}`, atlasRes.status);
      }

      const atlasData = await atlasRes.json();
      const prediction = atlasData?.data || atlasData;
      const status = prediction?.status || "processing"; // pending | processing | completed | failed

      let videoUrl = null;
      let errorMsg = null;

      if (status === "completed") {
        videoUrl = (prediction?.outputs && prediction.outputs[0]) || prediction?.output || null;
      } else if (status === "failed") {
        errorMsg = prediction?.error || "Video generation failed on Atlas Cloud";
      }

      // Update generation record in database if generation_id provided
      if (body.generation_id) {
        const updatePayload: Record<string, any> = {
          status: status === "completed" ? "completed" : status === "failed" ? "failed" : "processing",
        };
        if (videoUrl) {
          updatePayload.result_url = videoUrl;
          updatePayload.completed_at = new Date().toISOString();
        }
        if (errorMsg) {
          updatePayload.error_message = errorMsg;
        }

        await supabaseAdmin
          .from("creative_generations")
          .update(updatePayload)
          .eq("id", body.generation_id)
          .eq("business_id", auth.businessId);

        if (videoUrl && body.asset_id) {
          await supabaseAdmin
            .from("creative_assets")
            .update({ storage_path: videoUrl })
            .eq("id", body.asset_id)
            .eq("business_id", auth.businessId);
        }
      }

      return jsonResponse({
        success: true,
        taskId,
        status,
        videoUrl,
        error: errorMsg,
      });
    }

    // ── 2. VIDEO GENERATION SUBMISSION ACTION ──
    if (action === "generate") {
      // Security Enforcement (Phase 6): Video Generator UI is COMING SOON.
      // Backend must strictly reject generation requests from public users to prevent direct API bypass.
      const internalAdminKey = req.headers.get("x-internal-admin-key");
      const expectedAdminKey = Deno.env.get("ADMIN_INTERNAL_BYPASS_KEY");
      const isInternalAdmin = Boolean(expectedAdminKey && internalAdminKey === expectedAdminKey);

      if (!isInternalAdmin) {
        return errorResponse("Fitur AI Video Generator saat ini berstatus Coming Soon dan belum dibuka untuk publik.", 403);
      }

      let prompt = (body.prompt || "").trim();
      let imageUrl = (body.image_url || "").trim() || null;
      const prdId = body.prd_id || null;

      // If PRD provided, validate ownership and extract video concept / script if prompt not specified
      if (prdId) {
        const { data: prd, error: prdError } = await supabaseAdmin
          .from("creative_prds")
          .select("id, brief_id, prd_content, status")
          .eq("id", prdId)
          .single();

        if (prdError || !prd) {
          return errorResponse("PRD not found", 404);
        }

        // Verify brief -> campaign -> business ownership
        const { data: brief } = await supabaseAdmin
          .from("creative_briefs")
          .select("id, campaign_id")
          .eq("id", prd.brief_id)
          .single();

        if (!brief) return errorResponse("Brief not found", 404);

        const { data: campaign } = await supabaseAdmin
          .from("campaigns")
          .select("id, business_id")
          .eq("id", brief.campaign_id)
          .single();

        if (!campaign || campaign.business_id !== auth.businessId) {
          return errorResponse("Access denied", 403);
        }

        if (!prompt) {
          const content = prd.prd_content || {};
          prompt = content.video_script || content.video_concept || content.headline || "";
        }
      }

      // Prompt validation (Security & Cost Control)
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return errorResponse("Prompt is required for video generation", 400);
      }

      // Cap prompt length
      if (prompt.length > 1000) {
        prompt = prompt.substring(0, 1000);
      }

      if (!ATLAS_API_KEY) {
        return errorResponse("ATLAS_API_KEY not configured on server", 500);
      }

      // Determine model server-side (Users cannot override model)
      const isImageToVideo = Boolean(imageUrl);
      const selectedModel = isImageToVideo ? IMAGE_TO_VIDEO_MODEL : TEXT_TO_VIDEO_MODEL;

      // Server-side enforced payload
      const atlasPayload: Record<string, any> = {
        model: selectedModel,
        prompt: prompt,
        duration: Math.min(Number(body.duration) || DEFAULT_DURATION, DEFAULT_DURATION), // capped at 8s
        resolution: DEFAULT_RESOLUTION,
        ratio: DEFAULT_RATIO,
      };

      if (isImageToVideo) {
        atlasPayload.image_url = imageUrl;
      } else {
        atlasPayload.generate_audio = true;
      }

      // 1. Create asset record (asset_type: video_fast)
      let assetId = null;
      if (prdId) {
        const { data: assetRec } = await supabaseAdmin
          .from("creative_assets")
          .insert({
            prd_id: prdId,
            business_id: auth.businessId,
            asset_type: "video_fast",
            storage_path: "",
            metadata: {
              prompt,
              provider: "atlas_cloud",
              model: selectedModel,
              duration: atlasPayload.duration,
              resolution: atlasPayload.resolution,
              ratio: atlasPayload.ratio,
            },
            credit_cost: 20,
          })
          .select("id")
          .single();
        assetId = assetRec?.id || null;
      }

      // 2. Submit async task to Atlas Cloud: POST /api/v1/model/generateVideo
      const atlasRes = await fetch(`${ATLAS_BASE_URL}/model/generateVideo`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ATLAS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(atlasPayload),
      });

      if (!atlasRes.ok) {
        const errText = await atlasRes.text();
        return errorResponse(`Atlas Cloud submission failed ${atlasRes.status}: ${errText}`, atlasRes.status);
      }

      const atlasData = await atlasRes.json();
      const taskId = atlasData?.data?.id || atlasData?.id;

      if (!taskId) {
        return errorResponse("Atlas Cloud did not return a valid task ID", 502);
      }

      // 3. Create generation tracking record
      let generationId = null;
      if (assetId) {
        const { data: genRec } = await supabaseAdmin
          .from("creative_generations")
          .insert({
            asset_id: assetId,
            business_id: auth.businessId,
            provider: "atlas_cloud",
            model: selectedModel,
            prompt_hash: "",
            status: "processing",
            provider_task_id: taskId,
          })
          .select("id")
          .single();
        generationId = genRec?.id || null;
      }

      return jsonResponse({
        success: true,
        taskId,
        generationId,
        assetId,
        provider: "atlas_cloud",
        model: selectedModel,
        status: "processing",
        message: "Video generation task submitted successfully to Atlas Cloud",
      });
    }

    return errorResponse(`Unsupported action: ${action}`, 400);
  } catch (err: any) {
    console.error("[creative-generate-video] Error:", err);
    return errorResponse(err?.message || "Internal server error", 500);
  }
});
