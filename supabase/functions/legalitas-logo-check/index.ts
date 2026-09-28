// legalitas-logo-check/index.ts
// Logo similarity check using Google Cloud Vision Web Detection.
//
// POST body: { imageUrl, businessName? }
// Returns: { checkId, overallStatus, results[]}
//
// Requires GOOGLE_CLOUD_VISION_API_KEY env var.
// Validates imageUrl is from Supabase Storage (security).
// NEVER exposes API key to frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Create Supabase clients using environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ── Inline: authenticate user & check business ownership ──

async function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.warn("[legalitas-logo-check] Auth: Missing Authorization header");
    throw new Error("Missing Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    console.warn("[legalitas-logo-check] Auth: Empty token after Bearer strip");
    throw new Error("Missing token");
  }

  // Create a client with the user's JWT to verify it
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    console.warn("[legalitas-logo-check] Auth: getUser failed:", error?.message || "no user");
    throw new Error("Invalid or expired token");
  }

  // Look up business ownership
  const { data: business, error: bizError } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (bizError || !business) {
    console.warn("[legalitas-logo-check] Auth: No business for userId:", user.id, "error:", bizError?.message);
    throw new Error("No business found for this user");
  }

  return {
    userId: user.id,
    businessId: business.id,
  };
}

// ── Inline: response helpers ──

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    },
  });
}

// ── Inline: types ──

type LogoMatchType =
  | "exact_match"
  | "partial_match"
  | "visually_similar"
  | "web_page_match";

type LogoOverallStatus = "CHECKING" | "CLEAN" | "HAS_SIMILARITY" | "ERROR";

interface LogoMatchResult {
  type: LogoMatchType;
  similarity?: number;
  name: string;
  description?: string;
  url?: string;
  thumbnail_url?: string;
}

interface VisionWebDetection {
  fullMatchingImages?: Array<{ url: string }>;
  partialMatchingImages?: Array<{ url: string }>;
  visuallySimilarImages?: Array<{ url: string }>;
  pagesWithMatchingImages?: Array<{ url: string; pageTitle?: string }>;
}

// ── Helpers ──

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    // Must be from our Supabase Storage or a trusted domain
    return (
      parsed.hostname.includes("supabase") &&
      parsed.pathname.includes("/storage/")
    );
  } catch {
    return false;
  }
}

function processVisionResults(
  webDetection: VisionWebDetection
): LogoMatchResult[] {
  const results: LogoMatchResult[] = [];

  // Full matching images (exact match)
  if (webDetection.fullMatchingImages) {
    for (const img of webDetection.fullMatchingImages) {
      results.push({
        type: "exact_match",
        similarity: 100,
        name: "Gambar identik ditemukan",
        description: "Gambar yang sama persis ditemukan di web",
        url: img.url,
        thumbnail_url: img.url,
      });
    }
  }

  // Partial matching images
  if (webDetection.partialMatchingImages) {
    for (const img of webDetection.partialMatchingImages) {
      results.push({
        type: "partial_match",
        similarity: 80,
        name: "Gambar cocok sebagian",
        description: "Bagian dari gambar ditemukan di sumber lain",
        url: img.url,
        thumbnail_url: img.url,
      });
    }
  }

  // Visually similar images
  if (webDetection.visuallySimilarImages) {
    for (const img of webDetection.visuallySimilarImages) {
      results.push({
        type: "visually_similar",
        similarity: 60,
        name: "Gambar mirip secara visual",
        description: "Gambar dengan kemiripan visual ditemukan",
        url: img.url,
        thumbnail_url: img.url,
      });
    }
  }

  // Web pages with matching images
  if (webDetection.pagesWithMatchingImages) {
    for (const page of webDetection.pagesWithMatchingImages) {
      results.push({
        type: "web_page_match",
        name: page.pageTitle || "Halaman web dengan gambar serupa",
        description: `Gambar muncul di: ${page.url}`,
        url: page.url,
      });
    }
  }

  return results;
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // Server-side safety: LOGO_ANALYZER_ENABLED defaults to false
  const isEnabled = Deno.env.get("LOGO_ANALYZER_ENABLED") === "true";
  if (!isEnabled) {
    console.warn("[legalitas-logo-check] Feature disabled by LOGO_ANALYZER_ENABLED flag");
    return jsonResponse({
      data: {
        checkId: null,
        overallStatus: "COMING_SOON",
        error: "Layanan pemeriksaan logo sedang dalam tahap pengembangan (Segera Hadir).",
        results: [],
      },
    });
  }

  const startTime = Date.now();
  console.log("[legalitas-logo-check] Request received");

  try {
    const auth = await verifyAuth(req);
    console.log("[legalitas-logo-check] Auth OK, userId:", auth.userId, "businessId:", auth.businessId);

    const body = await req.json();
    const { imageUrl, businessName } = body;
    console.log("[legalitas-logo-check] Body:", JSON.stringify({ imageUrl: imageUrl ? "(present)" : "(missing)", businessName: businessName || "" }));

    if (!imageUrl || typeof imageUrl !== "string") {
      console.warn("[legalitas-logo-check] Missing or invalid imageUrl in body");
      return errorResponse("URL gambar diperlukan");
    }

    // Security: validate image URL is from our storage
    if (!isValidImageUrl(imageUrl)) {
      console.warn("[legalitas-logo-check] imageUrl rejected by isValidImageUrl:", imageUrl.substring(0, 120));
      return errorResponse("URL gambar tidak valid. Gunakan URL dari aplikasi.");
    }

    const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
    if (!apiKey) {
      console.error("[legalitas-logo-check] GOOGLE_CLOUD_VISION_API_KEY not set in Edge Function secrets");
      // Create record with error status
      const { data: check, error: insertError } = await supabaseAdmin
        .from("legal_logo_checks")
        .insert({
          business_id: auth.businessId,
          image_url: imageUrl,
          image_filename: body.imageFilename || null,
          overall_status: "ERROR",
          error_message: "Layanan pemeriksaan logo belum dikonfigurasi. Hubungi admin.",
          checked_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[legalitas-logo-check] Insert error:", insertError);
        return errorResponse("Gagal menyimpan data pengecekan logo");
      }

      return jsonResponse({
        data: {
          checkId: check?.id || null,
          overallStatus: "ERROR",
          error: "Layanan pemeriksaan logo belum dikonfigurasi. Hubungi admin.",
          results: [],
        },
      });
    }

    // 1. Create logo check record
    const { data: logoCheck, error: insertError } = await supabaseAdmin
      .from("legal_logo_checks")
      .insert({
        business_id: auth.businessId,
        image_url: imageUrl,
        image_filename: body.imageFilename || null,
        overall_status: "CHECKING",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[legalitas-logo-check] Insert error:", insertError);
      return errorResponse("Gagal menyimpan data pengecekan logo");
    }

    // 2. Call Google Cloud Vision API
    console.log("[legalitas-logo-check] Calling Google Vision API...");
    let overallStatus: LogoOverallStatus = "CLEAN";
    let results: LogoMatchResult[] = [];
    let errorMessage: string | null = null;

    try {
      const visionPayload = {
        requests: [
          {
            image: { source: { imageUri: imageUrl } },
            features: [{ type: "WEB_DETECTION", maxResults: 20 }],
          },
        ],
      };

      const visionRes = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(visionPayload),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!visionRes.ok) {
        const errorBody = await visionRes.text();
        console.error("[legalitas-logo-check] Vision API error:", visionRes.status, errorBody);
        throw new Error(`Vision API returned ${visionRes.status}`);
      }

      const visionData = await visionRes.json();
      const annotations = visionData?.responses?.[0];

      if (annotations?.error) {
        throw new Error(annotations.error.message || "Vision API error");
      }

      const webDetection: VisionWebDetection =
        annotations?.webDetection || {};

      results = processVisionResults(webDetection);
      overallStatus = results.length > 0 ? "HAS_SIMILARITY" : "CLEAN";
      console.log("[legalitas-logo-check] Vision results:", results.length, "matches, status:", overallStatus);
    } catch (e) {
      console.error("[legalitas-logo-check] Vision processing error:", e);
      overallStatus = "ERROR";
      errorMessage = e instanceof Error ? e.message : "Gagal menganalisis logo";
    }

    // 3. Update record with results
    await supabaseAdmin
      .from("legal_logo_checks")
      .update({
        overall_status: overallStatus,
        total_results: results.length,
        results: results,
        error_message: errorMessage,
        checked_at: new Date().toISOString(),
      })
      .eq("id", logoCheck.id);

    const elapsed = Date.now() - startTime;
    console.log(`[legalitas-logo-check] Done in ${elapsed}ms, status: ${overallStatus}, results: ${results.length}`);

    return jsonResponse({
      data: {
        checkId: logoCheck.id,
        overallStatus,
        totalResults: results.length,
        results,
        errorMessage,
      },
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[legalitas-logo-check] Unhandled error after ${elapsed}ms:`, err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});