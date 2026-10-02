// supabase/functions/seo-engine/index.ts
// BisnisSehat External SEO Integration Layer (OpenSEO & DataForSEO)
// Smallest stable vertical slice:
// 1. Keyword Research
// 2. SERP Competitor Insights
//
// Complies with load.md & Phase 2 specifications:
// - Server-side only (OpenSEO & DataForSEO credentials NEVER exposed to browser)
// - OpenSEO service unreachable directly by public browser (accessible only via backend)
// - Authenticates Supabase JWT and derives auth.user.id server-side
// - Strict business ownership validation (cross-business IDOR rejected with 403)
// - Strict input sanitization & boundary validation (limits: max 10 keywords, max 100 chars/kw, valid domain)
// - Safe timeout (10s) and malformed provider response recovery
// - Free/BASIC entitlement preserved (no Pro paywall, zero credit deduction)
// - Never leaks provider secrets, raw errors, or internal URLs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, corsResponse, jsonResponse, errorResponse } from "../_shared/response.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { validateSafeDomain, validateSafeUrl } from "../_shared/ssrf.ts";

const REQUEST_TIMEOUT_MS = 10000; // 10s max
const MAX_KEYWORDS_PER_REQUEST = 10;
const MAX_KEYWORD_LENGTH = 100;
const MAX_DOMAIN_LENGTH = 253;

interface ExternalProviderConfig {
  openSeoUrl?: string;
  openSeoApiKey?: string;
  dataForSeoAuth?: string;
}

/**
 * Retrieve server-side credentials securely.
 * Never exposed to client bundle or client responses.
 */
function getProviderConfig(): ExternalProviderConfig {
  const rawOpenSeoUrl = (Deno.env.get("OPENSEO_URL") || "").trim();
  const openSeoApiKey = (Deno.env.get("OPENSEO_API_KEY") || "").trim();

  // SSRF defense: Ensure configured openSeoUrl does not target loopback/private/metadata
  let openSeoUrl: string | undefined = undefined;
  if (rawOpenSeoUrl) {
    const urlCheck = validateSafeUrl(rawOpenSeoUrl);
    if (urlCheck.safe && urlCheck.parsedUrl) {
      openSeoUrl = rawOpenSeoUrl;
    }
  }

  const directApiKey = (Deno.env.get("DATAFORSEO_API_KEY") || "").trim();
  const login = (Deno.env.get("DATAFORSEO_LOGIN") || "").trim();
  const password = (Deno.env.get("DATAFORSEO_PASSWORD") || "").trim();

  let dataForSeoAuth = "";
  if (directApiKey) {
    dataForSeoAuth = directApiKey.startsWith("Basic ") ? directApiKey.replace("Basic ", "").trim() : directApiKey;
  } else if (login && password) {
    dataForSeoAuth = btoa(`${login}:${password}`);
  }

  return {
    openSeoUrl: openSeoUrl || undefined,
    openSeoApiKey: openSeoApiKey || undefined,
    dataForSeoAuth: dataForSeoAuth || undefined,
  };
}

/**
 * Server-side authentication and strict business ownership validation.
 * Rejects unauthenticated requests (401) and cross-business IDOR (403).
 */
async function authenticateAndAuthorizeBusiness(req: Request, businessId: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: "Missing Authorization header", status: 401, code: "UNAUTHORIZED" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { error: "Missing authentication token", status: 401, code: "UNAUTHORIZED" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: "Server configuration missing Supabase credentials", status: 500, code: "SERVER_MISCONFIG" };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return { error: "Sesi tidak valid atau telah kedaluwarsa.", status: 401, code: "UNAUTHORIZED" };
  }

  // Account status active check
  const { data: profile, error: profError } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (profError || !profile || profile.status !== "active") {
    return { error: "Akses ditolak: Akun Anda tidak aktif atau sedang dibekukan.", status: 403, code: "ACCOUNT_INACTIVE" };
  }

  const cleanBizId = String(businessId || "").trim();
  if (!cleanBizId) {
    return { error: "ID Bisnis (business_id) wajib disertakan.", status: 400, code: "INVALID_BUSINESS_ID" };
  }

  // Strict IDOR Check: Ensure business exists and is owned by authenticated user
  const { data: business, error: bizError } = await supabaseAdmin
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", cleanBizId)
    .maybeSingle();

  if (bizError || !business) {
    return { error: "Bisnis tidak ditemukan.", status: 404, code: "BUSINESS_NOT_FOUND" };
  }

  if (business.owner_id !== user.id) {
    return {
      error: "Akses ditolak: Anda tidak memiliki wewenang atas data SEO bisnis ini (IDOR Defense).",
      status: 403,
      code: "IDOR_FORBIDDEN",
    };
  }

  return { user, business };
}

/**
 * Validate and sanitize keywords array with strict length and boundary rules.
 */
function validateKeywords(rawKeywords: any): { valid: boolean; keywords?: string[]; error?: string } {
  if (!Array.isArray(rawKeywords) && typeof rawKeywords !== "string") {
    return { valid: false, error: "Input kata kunci harus berupa teks atau array kata kunci." };
  }

  const list = Array.isArray(rawKeywords) ? rawKeywords : [rawKeywords];

  if (list.length === 0) {
    return { valid: false, error: "Daftar kata kunci tidak boleh kosong." };
  }

  if (list.length > MAX_KEYWORDS_PER_REQUEST) {
    return {
      valid: false,
      error: `Jumlah kata kunci melebihi batas maksimal (${MAX_KEYWORDS_PER_REQUEST} kata kunci per pencarian).`,
    };
  }

  const sanitized: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") {
      return { valid: false, error: "Setiap kata kunci harus berupa string teks." };
    }
    const clean = item.trim();
    if (!clean) {
      return { valid: false, error: "Kata kunci tidak boleh berupa karakter kosong." };
    }
    if (clean.length > MAX_KEYWORD_LENGTH) {
      return {
        valid: false,
        error: `Panjang kata kunci "${clean.slice(0, 15)}..." melebihi batas maksimal (${MAX_KEYWORD_LENGTH} karakter).`,
      };
    }
    // Check for malicious control characters
    if (/[\x00-\x1F\x7F]/.test(clean)) {
      return { valid: false, error: "Kata kunci mengandung karakter kontrol yang tidak valid." };
    }
    sanitized.push(clean);
  }

  return { valid: true, keywords: sanitized };
}

/**
 * Validate domain name syntax, length, and enforce multi-layered SSRF protection.
 * Rejects localhost, 127.0.0.1, private IPs, metadata endpoints, and internal domains.
 */
function validateDomain(rawDomain: any): { valid: boolean; domain?: string; code?: string; error?: string } {
  const result = validateSafeDomain(rawDomain);
  if (!result.safe || !result.domain) {
    return {
      valid: false,
      code: result.code || "INVALID_INPUT",
      error: result.error || "Format domain target tidak valid.",
    };
  }

  return { valid: true, domain: result.domain };
}

/**
 * Execute Keyword Research via OpenSEO service or direct DataForSEO provider.
 */
async function executeKeywordResearch(
  config: ExternalProviderConfig,
  keywords: string[],
  locationCode = 2360,
  languageCode = "id"
) {
  // Option A: External self-hosted OpenSEO service (trusted network only)
  if (config.openSeoUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.openSeoApiKey) {
        headers["Authorization"] = `Bearer ${config.openSeoApiKey}`;
      }

      const response = await fetch(`${config.openSeoUrl.replace(/\/$/, "")}/api/keywords/research`, {
        method: "POST",
        headers,
        body: JSON.stringify({ keywords, locationCode, languageCode }),
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      // SSRF defense: Disallow redirects
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, code: "SSRF_REJECTED", error: "Pengalihan (redirect) engine OpenSEO ditolak untuk mencegah SSRF." };
      }

      if (!response.ok) {
        return { ok: false, code: "PROVIDER_ERROR", error: `Engine OpenSEO mengembalikan respon error (HTTP ${response.status}).` };
      }

      let json: any;
      try {
        json = await response.json();
      } catch {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Format respon dari engine OpenSEO tidak valid (bukan JSON)." };
      }

      const rawList = Array.isArray(json?.results) ? json.results : Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : null;
      if (!rawList) {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Format respon dari engine OpenSEO tidak valid (data tidak ditemukan)." };
      }

      const sanitizedItems = rawList
        .map((item: any) => ({
          keyword: String(item?.keyword || ""),
          search_volume: Number(item?.search_volume ?? item?.volume ?? 0),
          cpc: Number(item?.cpc ?? 0),
          competition: Number(item?.competition ?? 0),
          competition_level: String(item?.competition_level || "LOW"),
          monthly_searches: Array.isArray(item?.monthly_searches) ? item.monthly_searches : [],
        }))
        .filter((item: any) => item.keyword.length > 0);

      if (sanitizedItems.length === 0) {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Respon engine OpenSEO tidak memuat kata kunci yang valid." };
      }

      return { ok: true, source: "openseo", data: sanitizedItems, total: sanitizedItems.length };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { ok: false, code: "PROVIDER_TIMEOUT", error: "Koneksi ke engine OpenSEO memakan waktu terlalu lama (timeout > 10 detik)." };
      }
      return { ok: false, code: "PROVIDER_ERROR", error: "Engine OpenSEO tidak dapat dihubungi saat ini." };
    }
  }

  // Option B: Direct DataForSEO v3 API
  if (config.dataForSeoAuth) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const d4sResponse = await fetch("https://api.dataforseo.com/v3/keywords_data/google/search_volume/live", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${config.dataForSeoAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keywords,
            location_code: locationCode,
            language_code: languageCode,
          },
        ]),
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      // SSRF defense: Disallow redirects
      if (d4sResponse.status >= 300 && d4sResponse.status < 400) {
        return { ok: false, code: "SSRF_REJECTED", error: "Pengalihan (redirect) provider SEO ditolak untuk mencegah SSRF." };
      }

      if (!d4sResponse.ok) {
        return {
          ok: false,
          code: "PROVIDER_ERROR",
          error: `Penyedia SEO eksternal mengembalikan respon error (HTTP ${d4sResponse.status}).`,
        };
      }

      let resJson: any;
      try {
        resJson = await d4sResponse.json();
      } catch {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Penyedia SEO mengembalikan data yang tidak valid (malformed JSON)." };
      }

      const task = resJson?.tasks?.[0];
      if (task?.status_code && task.status_code >= 40000) {
        return {
          ok: false,
          code: "PROVIDER_ERROR",
          error: `Penyedia SEO tidak dapat menyelesaikan tugas riset kata kunci (Status ${task.status_code}).`,
        };
      }

      if (!task || !Array.isArray(task.result)) {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Struktur respon provider SEO tidak sesuai standar." };
      }

      const items = task.result
        .map((item: any) => ({
          keyword: String(item?.keyword || ""),
          search_volume: Number(item?.search_volume ?? 0),
          cpc: Number(item?.cpc ?? 0),
          competition: Number(item?.competition ?? 0),
          competition_level: String(item?.competition_level || "LOW"),
          monthly_searches: Array.isArray(item?.monthly_searches) ? item.monthly_searches : [],
        }))
        .filter((item: any) => item.keyword.length > 0);

      return {
        ok: true,
        source: "dataforseo",
        data: items,
        total: items.length,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { ok: false, code: "PROVIDER_TIMEOUT", error: "Koneksi ke provider SEO memakan waktu terlalu lama (timeout > 10 detik)." };
      }
      return { ok: false, code: "PROVIDER_ERROR", error: "Provider SEO eksternal tidak dapat dihubungi saat ini." };
    }
  }

  // Option C: No provider configured
  return {
    ok: false,
    code: "PROVIDER_NOT_CONFIGURED",
    error: "Penyedia SEO eksternal (OpenSEO / DataForSEO) belum dikonfigurasi di server.",
  };
}

/**
 * Execute SERP Competitor Insights via OpenSEO service or DataForSEO Labs.
 */
async function executeCompetitorInsights(
  config: ExternalProviderConfig,
  targetDomain: string,
  keywords: string[] = [],
  locationCode = 2360,
  languageCode = "id"
) {
  // Option A: OpenSEO external service
  if (config.openSeoUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.openSeoApiKey) {
        headers["Authorization"] = `Bearer ${config.openSeoApiKey}`;
      }

      const response = await fetch(`${config.openSeoUrl.replace(/\/$/, "")}/api/competitors/insights`, {
        method: "POST",
        headers,
        body: JSON.stringify({ targetDomain, keywords, locationCode, languageCode }),
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      // SSRF defense: Disallow redirects
      if (response.status >= 300 && response.status < 400) {
        return { ok: false, code: "SSRF_REJECTED", error: "Pengalihan (redirect) engine OpenSEO ditolak untuk mencegah SSRF." };
      }

      if (!response.ok) {
        return { ok: false, code: "PROVIDER_ERROR", error: `Engine OpenSEO mengembalikan respon error (HTTP ${response.status}).` };
      }

      let json: any;
      try {
        json = await response.json();
      } catch {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Format respon dari engine OpenSEO tidak valid (bukan JSON)." };
      }

      const rawCompetitors = Array.isArray(json?.competitors) ? json.competitors : Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : null;
      if (!rawCompetitors) {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Struktur respon engine OpenSEO tidak sesuai standar." };
      }

      const items = rawCompetitors
        .map((item: any) => ({
          domain: String(item?.domain || ""),
          avg_position: Number(item?.avg_position ?? item?.position ?? 0),
          median_position: Number(item?.median_position ?? item?.avg_position ?? 0),
          visibility: Number(item?.visibility ?? 0),
          competitor_relevance: Number(item?.competitor_relevance ?? 0),
          rating: Number(item?.rating ?? 0),
        }))
        .filter((item: any) => item.domain.length > 0);

      return {
        ok: true,
        source: "openseo",
        targetDomain,
        competitors: items,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { ok: false, code: "PROVIDER_TIMEOUT", error: "Koneksi ke engine OpenSEO memakan waktu terlalu lama (timeout > 10 detik)." };
      }
      return { ok: false, code: "PROVIDER_ERROR", error: "Engine OpenSEO tidak dapat dihubungi saat ini." };
    }
  }

  // Option B: Direct DataForSEO Labs API
  if (config.dataForSeoAuth) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const queryKeywords = keywords.length > 0 ? keywords : [targetDomain.replace(/\..*$/, "")];

      const d4sResponse = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/serp_competitors/live", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${config.dataForSeoAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keywords: queryKeywords,
            location_code: locationCode,
            language_code: languageCode,
          },
        ]),
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      // SSRF defense: Disallow redirects
      if (d4sResponse.status >= 300 && d4sResponse.status < 400) {
        return { ok: false, code: "SSRF_REJECTED", error: "Pengalihan (redirect) provider SEO ditolak untuk mencegah SSRF." };
      }

      if (!d4sResponse.ok) {
        return {
          ok: false,
          code: "PROVIDER_ERROR",
          error: `Penyedia SEO eksternal mengembalikan respon error (HTTP ${d4sResponse.status}).`,
        };
      }

      let resJson: any;
      try {
        resJson = await d4sResponse.json();
      } catch {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Penyedia SEO mengembalikan data yang tidak valid (malformed JSON)." };
      }

      const task = resJson?.tasks?.[0];
      if (task?.status_code && task.status_code >= 40000) {
        return {
          ok: false,
          code: "PROVIDER_ERROR",
          error: `Penyedia SEO tidak dapat menyelesaikan tugas wawasan kompetitor (Status ${task.status_code}).`,
        };
      }

      if (!task || !Array.isArray(task.result)) {
        return { ok: false, code: "MALFORMED_PROVIDER_RESPONSE", error: "Struktur respon provider SEO tidak sesuai standar." };
      }

      const rawItems = Array.isArray(task.result?.[0]?.items) ? task.result[0].items : [];
      const items = rawItems
        .map((item: any) => ({
          domain: String(item?.domain || ""),
          avg_position: Number(item?.avg_position ?? 0),
          median_position: Number(item?.median_position ?? 0),
          visibility: Number(item?.visibility ?? 0),
          competitor_relevance: Number(item?.competitor_relevance ?? 0),
          rating: Number(item?.rating ?? 0),
        }))
        .filter((item: any) => item.domain.length > 0);

      return {
        ok: true,
        source: "dataforseo",
        targetDomain,
        competitors: items,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { ok: false, code: "PROVIDER_TIMEOUT", error: "Koneksi ke provider SEO memakan waktu terlalu lama (timeout > 10 detik)." };
      }
      return { ok: false, code: "PROVIDER_ERROR", error: "Provider SEO eksternal tidak dapat dihubungi saat ini." };
    }
  }

  return {
    ok: false,
    code: "PROVIDER_NOT_CONFIGURED",
    error: "Penyedia SEO eksternal (OpenSEO / DataForSEO) belum dikonfigurasi di server.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsResponse();
  }

  if (req.method !== "POST") {
    return errorResponse("Hanya metode POST yang diizinkan.", 405);
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body permintaan harus berupa JSON yang valid.", 400);
    }

    const businessId = String(body?.business_id || body?.businessId || "").trim();
    const action = String(body?.action || "").trim();

    // 1. Authorize user & strictly enforce business ownership (IDOR defense)
    const authResult = await authenticateAndAuthorizeBusiness(req, businessId);
    if ("error" in authResult) {
      return jsonResponse(
        { ok: false, code: authResult.code, error: authResult.error },
        authResult.status
      );
    }

    const providerConfig = getProviderConfig();

    // 2. Dispatch only to Phase 2 approved capabilities
    switch (action) {
      case "keyword-research": {
        const validation = validateKeywords(body?.keywords || body?.keyword);
        if (!validation.valid || !validation.keywords) {
          return jsonResponse({ ok: false, code: "INVALID_INPUT", error: validation.error }, 400);
        }

        const result = await executeKeywordResearch(
          providerConfig,
          validation.keywords,
          body?.locationCode,
          body?.languageCode
        );
        return jsonResponse(result);
      }

      case "competitor-insights": {
        const domainValidation = validateDomain(body?.targetDomain || body?.domain);
        if (!domainValidation.valid || !domainValidation.domain) {
          return jsonResponse(
            { ok: false, code: domainValidation.code || "INVALID_INPUT", error: domainValidation.error },
            400
          );
        }

        let validatedKeywords: string[] = [];
        if (body?.keywords) {
          const kwValidation = validateKeywords(body.keywords);
          if (!kwValidation.valid) {
            return jsonResponse({ ok: false, code: "INVALID_INPUT", error: kwValidation.error }, 400);
          }
          validatedKeywords = kwValidation.keywords || [];
        }

        const result = await executeCompetitorInsights(
          providerConfig,
          domainValidation.domain,
          validatedKeywords,
          body?.locationCode,
          body?.languageCode
        );
        return jsonResponse(result);
      }

      default:
        return jsonResponse(
          {
            ok: false,
            code: "UNSUPPORTED_ACTION",
            error: `Aksi SEO "${action}" tidak didukung pada rilis ini. Aksi yang didukung: keyword-research, competitor-insights.`,
          },
          400
        );
    }
  } catch (err: any) {
    return errorResponse(`Terjadi kesalahan internal server: ${err?.message || "Unknown error"}`, 500);
  }
});
