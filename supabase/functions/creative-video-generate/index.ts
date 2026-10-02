// supabase/functions/creative-video-generate/index.ts
// AI Video Generator Backend via Open-Generative-AI external engine
// Architecture: Phase 12 Integration (@phase12.md)
//
// Security & Constraints:
// - Server-side authoritative: JWT authentication & business ownership via verifyAuth
// - Feature status: Pro-exclusive video generation (UI status: Coming Soon / Beta)
// - Platform switch: strictly respects enable_ai_features (FEATURE_DISABLED)
// - Pro Entitlement: Free, Basic, Expired Pro, Cancelled Pro rejected (PRO_REQUIRED)
// - Credit safety: atomic deduction via deduct_creative_credits_atomic only on provider success
// - Model input validation: whitelist models, duration capped at 8s, resolution 480p, ratio 9:16
// - Provider isolation: external Open-Generative-AI credentials (OPEN_GENERATIVE_AI_API_KEY) never exposed to browser
// - Normalized error codes: PROVIDER_NOT_CONFIGURED, PROVIDER_TIMEOUT, PROVIDER_RATE_LIMITED, PROVIDER_ERROR, INVALID_INPUT, INSUFFICIENT_CREDITS, FEATURE_DISABLED, PRO_REQUIRED

import { verifyAuth } from "../_shared/auth.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { isProUser, isBusinessPro, isAIFeaturesEnabled } from "../_shared/entitlement.ts";

const OPEN_GENERATIVE_AI_URL = Deno.env.get("OPEN_GENERATIVE_AI_URL") || "https://api.muapi.ai";
const OPEN_GENERATIVE_AI_API_KEY = Deno.env.get("OPEN_GENERATIVE_AI_API_KEY") || Deno.env.get("ATLAS_API_KEY");

const ALLOWED_MODELS = [
  "seedance-lite-t2v",
  "bytedance/seedance-2.0-mini/text-to-video",
  "bytedance/seedance-2.5/image-to-video",
  "open-generative-ai/text-to-video",
  "open-generative-ai/image-to-video",
];

const DEFAULT_TEXT_MODEL = "seedance-lite-t2v";
const DEFAULT_IMAGE_MODEL = "bytedance/seedance-2.5/image-to-video";

const DEFAULT_DURATION = 8;
const MAX_DURATION = 8;
const DEFAULT_RESOLUTION = "480p";
const DEFAULT_RATIO = "9:16";
const CREATIVE_GENERATION_COST = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "generate";

    // ── 1. AUTHENTICATE & RESOLVE AUTHORITATIVE IDENTITY ──
    let auth;
    try {
      auth = await verifyAuth(req, body.business_id);
    } catch (_authErr) {
      return errorResponse("UNAUTHENTICATED: Sesi tidak valid atau telah berakhir.", 401);
    }

    // ── 2. PLATFORM SETTING CHECK (enable_ai_features) ──
    const aiEnabled = await isAIFeaturesEnabled();
    if (!aiEnabled) {
      return errorResponse("FEATURE_DISABLED: Fitur kecerdasan buatan sedang dinonaktifkan oleh administrator platform.", 403);
    }

    // ── 3. PRO ENTITLEMENT ENFORCEMENT ──
    const userIsPro = await isProUser(auth.userId);
    const bizIsPro = await isBusinessPro(auth.businessId);
    if (!userIsPro && !bizIsPro) {
      return errorResponse("PRO_REQUIRED: Fitur AI Video Generator membutuhkan langganan BisnisSehat Pro yang aktif.", 403);
    }

    // ── 4. STATUS POLLING ACTION ──
    if (action === "status") {
      const taskId = (body.task_id || "").trim();
      if (!taskId) {
        return errorResponse("INVALID_INPUT: task_id is required for status check", 400);
      }

      if (!OPEN_GENERATIVE_AI_URL) {
        return errorResponse("PROVIDER_NOT_CONFIGURED: Engine Open-Generative-AI belum dikonfigurasi.", 500);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (OPEN_GENERATIVE_AI_API_KEY) {
        headers["x-api-key"] = OPEN_GENERATIVE_AI_API_KEY;
        headers["Authorization"] = `Bearer ${OPEN_GENERATIVE_AI_API_KEY}`;
      }

      let providerRes;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        providerRes = await fetch(`${OPEN_GENERATIVE_AI_URL}/api/v1/predictions/${encodeURIComponent(taskId)}/result`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (pollErr: any) {
        if (pollErr.name === "AbortError") {
          return errorResponse("PROVIDER_TIMEOUT: Permintaan status engine video melampaui batas waktu.", 504);
        }
        return errorResponse("PROVIDER_ERROR: Gagal menghubungi engine Open-Generative-AI.", 502);
      }

      if (!providerRes.ok) {
        if (providerRes.status === 429) {
          return errorResponse("PROVIDER_RATE_LIMITED: Batas panggilan Open-Generative-AI terlampaui.", 429);
        }
        return errorResponse("PROVIDER_ERROR: Open-Generative-AI error saat memeriksa status.", 502);
      }

      const pollData = await providerRes.json();
      const status = pollData?.status || "processing";
      const videoUrl = pollData?.url || (pollData?.outputs && pollData.outputs[0]) || pollData?.output || null;
      const errorMsg = pollData?.error || null;

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

    // ── 5. GENERATE VIDEO ACTION ──
    if (action === "generate") {
      let prompt = (body.prompt || "").trim();
      const imageUrl = (body.image_url || "").trim() || null;
      const prdId = body.prd_id || null;
      const requestedModel = (body.model || "").trim();

      // Model validation & whitelisting
      let selectedModel = imageUrl ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL;
      if (requestedModel) {
        if (!ALLOWED_MODELS.includes(requestedModel)) {
          return errorResponse("INVALID_INPUT: Model AI yang diminta tidak didukung atau tidak diizinkan.", 400);
        }
        selectedModel = requestedModel;
      }

      // If PRD provided, validate PRD & campaign business ownership
      if (prdId) {
        const { data: prd, error: prdError } = await supabaseAdmin
          .from("creative_prds")
          .select("id, brief_id, prd_content, status")
          .eq("id", prdId)
          .single();

        if (prdError || !prd) {
          return errorResponse("INVALID_INPUT: PRD tidak ditemukan.", 404);
        }

        const { data: brief } = await supabaseAdmin
          .from("creative_briefs")
          .select("id, campaign_id")
          .eq("id", prd.brief_id)
          .single();

        if (!brief) return errorResponse("INVALID_INPUT: Brief tidak ditemukan.", 404);

        const { data: campaign } = await supabaseAdmin
          .from("campaigns")
          .select("id, business_id")
          .eq("id", brief.campaign_id)
          .single();

        if (!campaign || campaign.business_id !== auth.businessId) {
          return errorResponse("INVALID_INPUT: Akses PRD ditolak (tenant isolation violation).", 403);
        }

        if (!prompt) {
          const content = prd.prd_content || {};
          prompt = content.video_script || content.video_concept || content.headline || "";
        }
      }

      // Strict prompt input validation
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return errorResponse("INVALID_INPUT: Prompt wajib diisi untuk pembuatan video.", 400);
      }
      if (prompt.length > 1000) {
        prompt = prompt.substring(0, 1000);
      }

      // Duration & resolution enforcement
      const rawDuration = Number(body.duration) || DEFAULT_DURATION;
      const sanitizedDuration = Math.max(1, Math.min(rawDuration, MAX_DURATION));
      const sanitizedResolution = DEFAULT_RESOLUTION;
      const sanitizedRatio = DEFAULT_RATIO;

      // Reject arbitrary external URLs passed in provider fields
      if (body.provider_url || body.endpoint_override) {
        return errorResponse("INVALID_INPUT: Parameter provider eksternal tidak diizinkan.", 400);
      }

      // ── 6. CREDIT AVAILABILITY CHECK ──
      const requiredCredits = CREATIVE_GENERATION_COST;
      const { data: creditRec } = await supabaseAdmin
        .from("creative_credits")
        .select("available")
        .eq("business_id", auth.businessId)
        .maybeSingle();

      const availableCredits = creditRec?.available ?? 0;
      if (availableCredits < requiredCredits) {
        return errorResponse("INSUFFICIENT_CREDITS: Saldo Creative Credits tidak mencukupi untuk generate video.", 400);
      }

      // ── 7. IDEMPOTENCY / DUPLICATE PROTECTION ──
      const clientRequestId = (body.request_id || req.headers.get("x-request-id") || "").trim();
      const requestId = clientRequestId || `VIDEO-${crypto.randomUUID()}`;

      if (clientRequestId) {
        const { data: existingLedger } = await supabaseAdmin
          .from("credit_ledger")
          .select("id, balance_after")
          .eq("idempotency_key", clientRequestId)
          .maybeSingle();

        if (existingLedger) {
          return jsonResponse({
            success: true,
            already_processed: true,
            message: "Permintaan telah diproses sebelumnya (idempotency match).",
          });
        }
      }

      // ── 8. CALL OPEN-GENERATIVE-AI EXTERNAL ENGINE ──
      const payload: Record<string, any> = {
        model: selectedModel,
        prompt,
        duration: sanitizedDuration,
        aspect_ratio: sanitizedRatio,
        resolution: sanitizedResolution,
        request_id: requestId,
      };

      if (imageUrl) {
        payload.image_url = imageUrl;
      } else {
        payload.generate_audio = true;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (OPEN_GENERATIVE_AI_API_KEY) {
        headers["x-api-key"] = OPEN_GENERATIVE_AI_API_KEY;
        headers["Authorization"] = `Bearer ${OPEN_GENERATIVE_AI_API_KEY}`;
      }

      let providerRes;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        providerRes = await fetch(`${OPEN_GENERATIVE_AI_URL}/api/v1/generateVideo`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          return errorResponse("PROVIDER_TIMEOUT: Permintaan generate video ke engine melampaui batas waktu 30 detik.", 504);
        }
        return errorResponse("PROVIDER_ERROR: Gagal menghubungi engine Open-Generative-AI.", 502);
      }

      if (!providerRes.ok) {
        if (providerRes.status === 429) {
          return errorResponse("PROVIDER_RATE_LIMITED: Engine Open-Generative-AI sedang mencapai batas laju request.", 429);
        }
        return errorResponse("PROVIDER_ERROR: Engine Open-Generative-AI mengalami kendala saat memproses video.", 502);
      }

      const providerData = await providerRes.json();
      const taskId = providerData?.requestId || providerData?.data?.id || providerData?.id || providerData?.taskId;
      if (!taskId) {
        return errorResponse("PROVIDER_ERROR: Engine Open-Generative-AI tidak mengembalikan task ID yang valid.", 502);
      }

      // ── 9. ATOMIC CREDIT DEDUCTION (ONLY ON SUCCESSFUL ENGINE CALL) ──
      const { data: debitResult, error: debitErr } = await supabaseAdmin.rpc("deduct_creative_credits_atomic", {
        p_business_id: auth.businessId,
        p_credits: requiredCredits,
        p_operation: "GENERATE_VIDEO",
        p_request_id: requestId,
        p_metadata: { prompt, model: selectedModel, taskId },
      });

      if (debitErr || !debitResult?.success) {
        return errorResponse(
          debitResult?.error === "INSUFFICIENT_CREDITS"
            ? "INSUFFICIENT_CREDITS: Saldo tidak mencukupi saat proses debit kredit."
            : "PROVIDER_ERROR: Gagal memproses saldo kredit secara atomik.",
          400
        );
      }

      // ── 10. AI USAGE TELEMETRY & RECORDING ──
      await supabaseAdmin.from("ai_usage").insert({
        business_id: auth.businessId,
        profile_id: auth.userId,
        operation: "GENERATE_VIDEO",
        model: selectedModel,
        credits_charged: requiredCredits,
        status: "processing",
        request_id: requestId,
      });

      // ── 11. RECORD CREATIVE ASSET & GENERATION TRACKER ──
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
              provider: "open-generative-ai",
              model: selectedModel,
              duration: sanitizedDuration,
              resolution: sanitizedResolution,
              ratio: sanitizedRatio,
            },
            credit_cost: requiredCredits,
          })
          .select("id")
          .single();
        assetId = assetRec?.id || null;
      }

      let generationId = null;
      if (assetId) {
        const { data: genRec } = await supabaseAdmin
          .from("creative_generations")
          .insert({
            asset_id: assetId,
            business_id: auth.businessId,
            provider: "open-generative-ai",
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
        provider: "open-generative-ai",
        model: selectedModel,
        status: "processing",
        message: "Video generation task successfully submitted to Open-Generative-AI engine.",
      });
    }

    return errorResponse(`INVALID_INPUT: Aksi tidak didukung: ${action}`, 400);
  } catch (err: any) {
    console.error("[creative-video-generate] Error:", err);
    return errorResponse("PROVIDER_ERROR: Terjadi kesalahan internal pada pemrosesan video.", 500);
  }
});
