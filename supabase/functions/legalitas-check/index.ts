// legalitas-check/index.ts — V2
// Multi-source government portal legality check with:
//   - Verification planner (only check relevant sources)
//   - Cache layer (24h TTL, configurable)
//   - Deterministic matching engine (no LLM)
//   - Proper HTTP response interpretation
//   - Identifier priority (NIB > certificate > exact name > fuzzy)
//
// POST body: { businessName, brandName?, nibNumber?, productCategory?, businessEntityType? }
// Returns: { checkId, results[] }  (only relevant sources, not always 5)
//
// All shared code inlined to avoid _shared/ import resolution issues.
// Cache and entity_type columns are optional — function works without migration 039.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ══════════════════════════════════════════════════════════
// Clients
// ══════════════════════════════════════════════════════════

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const CACHE_TTL_HOURS = parseInt(Deno.env.get("LEGAL_CACHE_TTL_HOURS") || "24");

// ══════════════════════════════════════════════════════════
// Auth
// ══════════════════════════════════════════════════════════

interface AuthContext {
  userId: string;
  businessId: string;
}

async function verifyAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("Missing token");

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Invalid or expired token");

  const { data: business, error: bizError } = await supabaseAdmin
    .from("businesses").select("id").eq("owner_id", user.id).single();

  if (bizError || !business) throw new Error("No business found for this user");
  return { userId: user.id, businessId: business.id };
}

// ══════════════════════════════════════════════════════════
// Response helpers
// ══════════════════════════════════════════════════════════

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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

// ══════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════

type LegalSourceKey = "oss" | "ahu" | "djki" | "bpom" | "bpjph";

type LegalSourceStatus =
  | "TERKONFIRMASI"
  | "DITEMUKAN"
  | "TIDAK_DITEMUKAN"
  | "PERLU_DITINJAU"
  | "TIDAK_RELEVAN"
  | "GAGAL_DIPERIKSA";

interface LegalCheckInput {
  businessName: string;
  brandName?: string;
  nibNumber?: string;
  productCategory?: string;
  businessEntityType?: string;
}

interface LegalSourceResult {
  source: LegalSourceKey;
  status: LegalSourceStatus;
  result_summary: string;
  result_detail: Record<string, unknown>;
  portal_link: string;
  checked_at: string;
  error_message?: string;
}

interface SearchIdentifiers {
  primary: string;
  secondary: string | null;
  method: string;
}

const PORTAL_LINKS: Record<LegalSourceKey, string> = {
  oss: "https://oss.go.id",
  ahu: "https://ahu.go.id",
  djki: "https://djki.go.id",
  bpom: "https://pom.go.id",
  bpjph: "https://halal.go.id",
};

// ══════════════════════════════════════════════════════════
// Normalization
// ══════════════════════════════════════════════════════════

function normalizeForCache(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeForCompare(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[.,\-\/\\()]/g, "").replace(/\s+/g, " ");
}

// ══════════════════════════════════════════════════════════
// Verification Planner (Phase 3)
// ══════════════════════════════════════════════════════════

function planVerification(input: LegalCheckInput): LegalSourceKey[] {
  const sources: LegalSourceKey[] = [];
  const entityType = (input.businessEntityType || "").toLowerCase();
  const hasNib = !!input.nibNumber?.trim();
  const hasName = !!input.businessName?.trim();
  const hasBrand = !!input.brandName?.trim();
  const category = (input.productCategory || "").toLowerCase();

  // OSS: Priority when NIB available. Always include if there's a business name.
  if (hasNib || hasName) {
    sources.push("oss");
  }

  // AHU: Relevant for legal entities (PT, CV, Firma, etc.)
  // Skip for Perorangan. Include for unknown/empty.
  if (entityType !== "perorangan") {
    sources.push("ahu");
  }

  // DJKI: ONLY if brand name is provided
  if (hasBrand) {
    sources.push("djki");
  }

  // BPOM: ONLY if product category is relevant
  const bpomRelevant = ["makanan", "minuman", "obat", "kosmetik", "suplemen", "pangan", "produk"];
  if (category && bpomRelevant.some((c) => category.includes(c))) {
    sources.push("bpom");
  }

  // BPJPH: ONLY if product is halal-relevant (food, drink, certain products)
  const bpjphRelevant = ["makanan", "minuman", "produk", "pangan"];
  if (category && bpjphRelevant.some((c) => category.includes(c))) {
    sources.push("bpjph");
  }

  return sources;
}

// ══════════════════════════════════════════════════════════
// Identifier Priority (Phase 4)
// ══════════════════════════════════════════════════════════

function getSearchIdentifiers(input: LegalCheckInput, source: LegalSourceKey): SearchIdentifiers {
  switch (source) {
    case "oss":
      return {
        primary: input.nibNumber?.trim() || input.businessName.trim(),
        secondary: input.nibNumber?.trim() ? input.businessName.trim() : null,
        method: input.nibNumber?.trim() ? "nib_exact" : "name_exact",
      };
    case "ahu":
      return {
        primary: input.businessName.trim(),
        secondary: null,
        method: "name_exact",
      };
    case "djki":
      return {
        primary: (input.brandName || input.businessName).trim(),
        secondary: input.businessName.trim(),
        method: input.brandName?.trim() ? "brand_exact" : "name_fuzzy",
      };
    case "bpom":
      return {
        primary: (input.brandName || input.businessName).trim(),
        secondary: input.businessName.trim(),
        method: "name_exact",
      };
    case "bpjph":
      return {
        primary: (input.brandName || input.businessName).trim(),
        secondary: input.businessName.trim(),
        method: "name_exact",
      };
    default:
      return { primary: input.businessName.trim(), secondary: null, method: "name_exact" };
  }
}

// ══════════════════════════════════════════════════════════
// Cache Layer (Phase 8) — resilient to missing table
// ══════════════════════════════════════════════════════════

let cacheTableAvailable: boolean | null = null;

async function isCacheAvailable(): Promise<boolean> {
  if (cacheTableAvailable !== null) return cacheTableAvailable;
  try {
    const { error } = await supabaseAdmin
      .from("legal_check_cache").select("id").limit(1);
    cacheTableAvailable = !error || !error.message?.includes("does not exist");
  } catch {
    cacheTableAvailable = false;
  }
  return cacheTableAvailable;
}

function buildCacheKey(source: LegalSourceKey, searchId: SearchIdentifiers): string {
  return `${source}:${normalizeForCache(searchId.primary)}`;
}

async function getCache(
  businessId: string,
  source: LegalSourceKey,
  cacheKey: string,
): Promise<LegalSourceResult | null> {
  if (!(await isCacheAvailable())) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("legal_check_cache")
      .select("*")
      .eq("business_id", businessId)
      .eq("source", source)
      .eq("identifier_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return {
      source: data.source as LegalSourceKey,
      status: data.status as LegalSourceStatus,
      result_summary: data.result_summary || "",
      result_detail: data.result_detail || {},
      portal_link: data.portal_link || PORTAL_LINKS[source],
      checked_at: data.checked_at,
    };
  } catch {
    return null;
  }
}

async function writeCache(
  businessId: string,
  source: LegalSourceKey,
  cacheKey: string,
  result: LegalSourceResult,
): Promise<void> {
  if (!(await isCacheAvailable())) return;
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600000).toISOString();
    await supabaseAdmin.from("legal_check_cache").insert({
      business_id: businessId,
      source,
      identifier_key: cacheKey,
      status: result.status,
      result_summary: result.result_summary,
      result_detail: result.result_detail,
      portal_link: result.portal_link,
      checked_at: result.checked_at,
      expires_at: expiresAt,
    });
  } catch (e) {
    console.error("[legalitas-check] Cache write error:", e);
  }
}

// ══════════════════════════════════════════════════════════
// Matching Engine (Phase 6) — deterministic, no LLM
// ══════════════════════════════════════════════════════════

function matchResults(
  apiData: unknown,
  searchId: SearchIdentifiers,
  source: LegalSourceKey,
  input: LegalCheckInput,
): { status: LegalSourceStatus; summary: string; detail: Record<string, unknown> } {
  const results = (apiData as any)?.data || [];
  const count = Array.isArray(results) ? results.length : 0;

  if (count === 0) {
    return {
      status: "TIDAK_DITEMUKAN",
      summary: "Tidak ditemukan kecocokan pada sumber yang diperiksa.",
      detail: { search_query: searchId.primary, result_count: 0 },
    };
  }

  // NIB exact match — strongest evidence (OSS only)
  if (searchId.method === "nib_exact" && input.nibNumber) {
    const nibMatch = results.find((r: any) =>
      normalizeForCompare(r.nib || r.nomor_induk || r.nib_number || "") ===
      normalizeForCompare(input.nibNumber!)
    );
    if (nibMatch) {
      return {
        status: "TERKONFIRMASI",
        summary: "Data ditemukan dan cocok dengan NIB yang diberikan.",
        detail: { match_type: "nib_exact", record: nibMatch },
      };
    }
  }

  // Name exact match after normalization
  const normalizedPrimary = normalizeForCompare(searchId.primary);
  const exactMatches = results.filter((r: any) => {
    const nameFields = [
      r.nama, r.nama_usaha, r.nama_badan_usaha, r.nama_produk,
      r.nama_merek, r.name, r.company_name, r.business_name,
    ].filter(Boolean);
    return nameFields.some((name: string) => normalizeForCompare(name) === normalizedPrimary);
  });

  if (exactMatches.length > 0) {
    return {
      status: "TERKONFIRMASI",
      summary: `Data ditemukan dan cocok dengan identifier yang diperiksa.`,
      detail: { match_type: "name_exact", count: exactMatches.length, records: exactMatches.slice(0, 3) },
    };
  }

  // Secondary identifier match
  if (searchId.secondary) {
    const normalizedSecondary = normalizeForCompare(searchId.secondary);
    const secondaryMatches = results.filter((r: any) => {
      const nameFields = [
        r.nama, r.nama_usaha, r.nama_badan_usaha, r.nama_produk,
        r.nama_merek, r.name, r.company_name, r.business_name,
      ].filter(Boolean);
      return nameFields.some((name: string) => normalizeForCompare(name) === normalizedSecondary);
    });
    if (secondaryMatches.length > 0) {
      return {
        status: "PERLU_DITINJAU",
        summary: "Ditemukan hasil berdasarkan pencarian sekunder. Perlu ditinjau lebih lanjut.",
        detail: { match_type: "secondary_name", count: secondaryMatches.length, records: secondaryMatches.slice(0, 3) },
      };
    }
  }

  // Results exist but no clear match — fuzzy
  return {
    status: "PERLU_DITINJAU",
    summary: `Ditemukan ${count} hasil. Tidak ada kecocokan pasti. Perlu pengecekan manual.`,
    detail: { match_type: "fuzzy", result_count: count, records: results.slice(0, 3) },
  };
}

// ══════════════════════════════════════════════════════════
// Source Checkers (Phase 5: proper HTTP response interpretation)
// ══════════════════════════════════════════════════════════

function makeApiErrorResult(
  source: LegalSourceKey,
  searchId: SearchIdentifiers,
  httpStatus: number,
  errorMsg: string,
  errorType: string,
): LegalSourceResult {
  const now = new Date().toISOString();
  const summaries: Record<number, string> = {
    401: "Autentikasi ke portal gagal. Konfigurasi API perlu diperiksa.",
    403: "Akses ke portal ditolak. Konfigurasi API perlu diperiksa.",
    429: "Portal membatasi jumlah permintaan. Coba lagi nanti.",
  };

  const isServerError = httpStatus >= 500;
  return {
    source,
    status: "GAGAL_DIPERIKSA",
    result_summary: isServerError
      ? "Portal mengalami gangguan. Coba lagi nanti."
      : summaries[httpStatus] || "Tidak dapat mengakses portal.",
    result_detail: { http_status: httpStatus, error_type: errorType, search_query: searchId.primary },
    portal_link: PORTAL_LINKS[source],
    checked_at: now,
    error_message: errorMsg,
  };
}

async function checkOSS(input: LegalCheckInput, searchId: SearchIdentifiers): Promise<LegalSourceResult> {
  const now = new Date().toISOString();
  const apiUrl = Deno.env.get("OSS_API_URL");
  const apiKey = Deno.env.get("OSS_API_KEY");

  if (!apiUrl || !apiKey) {
    return {
      source: "oss",
      status: "PERLU_DITINJAU",
      result_summary: "Pengecekan NIB perlu dilakukan langsung di portal OSS.",
      result_detail: { search_query: searchId.primary, nib: input.nibNumber || null, method: searchId.method },
      portal_link: PORTAL_LINKS.oss,
      checked_at: now,
    };
  }

  try {
    const params = new URLSearchParams();
    if (input.nibNumber) params.set("nib", input.nibNumber);
    params.set("nama", searchId.primary);

    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return makeApiErrorResult("oss", searchId, res.status, `HTTP ${res.status}`, "auth");
    }
    if (res.status === 429) {
      return makeApiErrorResult("oss", searchId, 429, "Rate limited", "rate_limit");
    }
    if (res.status >= 500) {
      return makeApiErrorResult("oss", searchId, res.status, `Server error ${res.status}`, "server");
    }
    if (!res.ok) {
      return makeApiErrorResult("oss", searchId, res.status, `HTTP ${res.status}`, "unexpected");
    }

    const data = await res.json();
    const match = matchResults(data, searchId, "oss", input);
    return { source: "oss", status: match.status, result_summary: match.summary, result_detail: match.detail, portal_link: PORTAL_LINKS.oss, checked_at: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("timeout") || msg.includes("AbortError")) {
      return makeApiErrorResult("oss", searchId, 0, "Request timed out", "timeout");
    }
    return makeApiErrorResult("oss", searchId, 0, msg, "network");
  }
}

async function checkAHU(input: LegalCheckInput, searchId: SearchIdentifiers): Promise<LegalSourceResult> {
  const now = new Date().toISOString();
  const apiUrl = Deno.env.get("AHU_API_URL");
  const apiKey = Deno.env.get("AHU_API_KEY");

  if (!apiUrl || !apiKey) {
    return {
      source: "ahu",
      status: "PERLU_DITINJAU",
      result_summary: "Pengecekan badan usaha perlu dilakukan langsung di portal AHU.",
      result_detail: { search_query: searchId.primary, entity_type: input.businessEntityType || null },
      portal_link: PORTAL_LINKS.ahu,
      checked_at: now,
    };
  }

  try {
    const params = new URLSearchParams({ nama: searchId.primary });
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) return makeApiErrorResult("ahu", searchId, res.status, `HTTP ${res.status}`, "auth");
    if (res.status === 429) return makeApiErrorResult("ahu", searchId, 429, "Rate limited", "rate_limit");
    if (res.status >= 500) return makeApiErrorResult("ahu", searchId, res.status, `Server error ${res.status}`, "server");
    if (!res.ok) return makeApiErrorResult("ahu", searchId, res.status, `HTTP ${res.status}`, "unexpected");

    const data = await res.json();
    const match = matchResults(data, searchId, "ahu", input);
    return { source: "ahu", status: match.status, result_summary: match.summary, result_detail: match.detail, portal_link: PORTAL_LINKS.ahu, checked_at: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("timeout") || msg.includes("AbortError")) return makeApiErrorResult("ahu", searchId, 0, "Request timed out", "timeout");
    return makeApiErrorResult("ahu", searchId, 0, msg, "network");
  }
}

async function checkDJKI(input: LegalCheckInput, searchId: SearchIdentifiers): Promise<LegalSourceResult> {
  const now = new Date().toISOString();
  const apiUrl = Deno.env.get("DJKI_API_URL");
  const apiKey = Deno.env.get("DJKI_API_KEY");

  if (!apiUrl || !apiKey) {
    return {
      source: "djki",
      status: "PERLU_DITINJAU",
      result_summary: "Pengecekan merek dagang perlu dilakukan langsung di portal DJKI.",
      result_detail: { search_term: searchId.primary },
      portal_link: PORTAL_LINKS.djki,
      checked_at: now,
    };
  }

  try {
    const params = new URLSearchParams({ nama: searchId.primary });
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) return makeApiErrorResult("djki", searchId, res.status, `HTTP ${res.status}`, "auth");
    if (res.status === 429) return makeApiErrorResult("djki", searchId, 429, "Rate limited", "rate_limit");
    if (res.status >= 500) return makeApiErrorResult("djki", searchId, res.status, `Server error ${res.status}`, "server");
    if (!res.ok) return makeApiErrorResult("djki", searchId, res.status, `HTTP ${res.status}`, "unexpected");

    const data = await res.json();
    const match = matchResults(data, searchId, "djki", input);
    return { source: "djki", status: match.status, result_summary: match.summary, result_detail: match.detail, portal_link: PORTAL_LINKS.djki, checked_at: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("timeout") || msg.includes("AbortError")) return makeApiErrorResult("djki", searchId, 0, "Request timed out", "timeout");
    return makeApiErrorResult("djki", searchId, 0, msg, "network");
  }
}

async function checkBPOM(input: LegalCheckInput, searchId: SearchIdentifiers): Promise<LegalSourceResult> {
  const now = new Date().toISOString();
  const apiUrl = Deno.env.get("BPOM_API_URL");
  const apiKey = Deno.env.get("BPOM_API_KEY");

  if (!apiUrl || !apiKey) {
    return {
      source: "bpom",
      status: "PERLU_DITINJAU",
      result_summary: "Pengecekan produk perlu dilakukan langsung di portal BPOM.",
      result_detail: { search_term: searchId.primary, product_category: input.productCategory },
      portal_link: PORTAL_LINKS.bpom,
      checked_at: now,
    };
  }

  try {
    const params = new URLSearchParams({ nama: searchId.primary });
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) return makeApiErrorResult("bpom", searchId, res.status, `HTTP ${res.status}`, "auth");
    if (res.status === 429) return makeApiErrorResult("bpom", searchId, 429, "Rate limited", "rate_limit");
    if (res.status >= 500) return makeApiErrorResult("bpom", searchId, res.status, `Server error ${res.status}`, "server");
    if (!res.ok) return makeApiErrorResult("bpom", searchId, res.status, `HTTP ${res.status}`, "unexpected");

    const data = await res.json();
    const match = matchResults(data, searchId, "bpom", input);
    return { source: "bpom", status: match.status, result_summary: match.summary, result_detail: match.detail, portal_link: PORTAL_LINKS.bpom, checked_at: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("timeout") || msg.includes("AbortError")) return makeApiErrorResult("bpom", searchId, 0, "Request timed out", "timeout");
    return makeApiErrorResult("bpom", searchId, 0, msg, "network");
  }
}

async function checkBPJPH(input: LegalCheckInput, searchId: SearchIdentifiers): Promise<LegalSourceResult> {
  const now = new Date().toISOString();
  const apiUrl = Deno.env.get("BPJPH_API_URL");
  const apiKey = Deno.env.get("BPJPH_API_KEY");

  if (!apiUrl || !apiKey) {
    return {
      source: "bpjph",
      status: "PERLU_DITINJAU",
      result_summary: "Pengecekan sertifikasi halal perlu dilakukan langsung di portal BPJPH.",
      result_detail: { search_term: searchId.primary },
      portal_link: PORTAL_LINKS.bpjph,
      checked_at: now,
    };
  }

  try {
    const params = new URLSearchParams({ nama: searchId.primary });
    const res = await fetch(`${apiUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) return makeApiErrorResult("bpjph", searchId, res.status, `HTTP ${res.status}`, "auth");
    if (res.status === 429) return makeApiErrorResult("bpjph", searchId, 429, "Rate limited", "rate_limit");
    if (res.status >= 500) return makeApiErrorResult("bpjph", searchId, res.status, `Server error ${res.status}`, "server");
    if (!res.ok) return makeApiErrorResult("bpjph", searchId, res.status, `HTTP ${res.status}`, "unexpected");

    const data = await res.json();
    const match = matchResults(data, searchId, "bpjph", input);
    return { source: "bpjph", status: match.status, result_summary: match.summary, result_detail: match.detail, portal_link: PORTAL_LINKS.bpjph, checked_at: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("timeout") || msg.includes("AbortError")) return makeApiErrorResult("bpjph", searchId, 0, "Request timed out", "timeout");
    return makeApiErrorResult("bpjph", searchId, 0, msg, "network");
  }
}

// ══════════════════════════════════════════════════════════
// Source checker map
// ══════════════════════════════════════════════════════════

const SOURCE_CHECKERS: Record<LegalSourceKey, (input: LegalCheckInput, searchId: SearchIdentifiers) => Promise<LegalSourceResult>> = {
  oss: checkOSS,
  ahu: checkAHU,
  djki: checkDJKI,
  bpom: checkBPOM,
  bpjph: checkBPJPH,
};

// ══════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);
    const body = await req.json();
    const { businessName, brandName, nibNumber, productCategory, businessEntityType } = body;

    if (!businessName || typeof businessName !== "string" || businessName.trim().length < 2) {
      return errorResponse("Nama usaha minimal 2 karakter");
    }

    // 1. Build verification plan (which sources to check)
    const input: LegalCheckInput = {
      businessName: businessName.trim(),
      brandName: brandName?.trim() || undefined,
      nibNumber: nibNumber?.trim() || undefined,
      productCategory: productCategory?.trim() || undefined,
      businessEntityType: businessEntityType?.trim() || undefined,
    };

    const sourcesToCheck = planVerification(input);
    console.log(`[legalitas-check] Planner output: ${sourcesToCheck.join(", ")}`);

    // 2. Create check record (try with business_entity_type, fall back without)
    const normalizedQuery = businessName.trim().toLowerCase().replace(/\s+/g, " ");
    let checkRecord: { id: string };

    const insertData: Record<string, unknown> = {
      business_id: auth.businessId,
      search_query: businessName.trim(),
      normalized_query: normalizedQuery,
      brand_name: brandName || null,
      nib_number: nibNumber || null,
      product_category: productCategory || null,
      check_type: "sources",
    };

    // Try inserting with business_entity_type (works if column exists after migration 039)
    const { data: check, error: checkError } = await supabaseAdmin
      .from("legal_checks")
      .insert({ ...insertData, business_entity_type: businessEntityType || null })
      .select("id")
      .single();

    if (checkError) {
      // If column doesn't exist, retry without it
      if (checkError.message?.includes("business_entity_type") || checkError.code === "42703") {
        const { data: check2, error: checkError2 } = await supabaseAdmin
          .from("legal_checks")
          .insert(insertData)
          .select("id")
          .single();
        if (checkError2 || !check2) {
          console.error("[legalitas-check] Insert check error:", checkError2);
          return errorResponse("Gagal menyimpan data pengecekan");
        }
        checkRecord = check2;
      } else {
        console.error("[legalitas-check] Insert check error:", checkError);
        return errorResponse("Gagal menyimpan data pengecekan");
      }
    } else {
      checkRecord = check!;
    }

    // 3. Run planned source checks with cache
    const results = await Promise.all(
      sourcesToCheck.map(async (source) => {
        const searchId = getSearchIdentifiers(input, source);
        const cacheKey = buildCacheKey(source, searchId);

        // Check cache first
        const cached = await getCache(auth.businessId, source, cacheKey);
        if (cached) {
          console.log(`[legalitas-check] Cache hit: ${source}`);
          return cached;
        }

        // Run checker
        const checker = SOURCE_CHECKERS[source];
        const result = await checker(input, searchId).catch((err) => {
          console.error(`[legalitas-check] ${source} checker failed:`, err);
          return {
            source,
            status: "GAGAL_DIPERIKSA" as const,
            result_summary: "Gagal memeriksa sumber ini.",
            result_detail: {},
            portal_link: PORTAL_LINKS[source],
            checked_at: new Date().toISOString(),
            error_message: err instanceof Error ? err.message : "Unknown error",
          };
        });

        // Write to cache (fire-and-forget)
        writeCache(auth.businessId, source, cacheKey, result).catch(console.error);

        return result;
      })
    );

    // 4. Insert results into legal_check_results
    const resultRows = results.map((r) => ({
      check_id: checkRecord.id,
      category: r.source,
      status: r.status,
      source: r.source.toUpperCase(),
      source_url: r.portal_link,
      result_summary: r.result_summary,
      result_detail: r.result_detail,
      portal_link: r.portal_link,
      checked_at: r.checked_at,
      error_message: r.error_message || null,
    }));

    const { error: resultsError } = await supabaseAdmin
      .from("legal_check_results")
      .insert(resultRows);

    if (resultsError) {
      console.error("[legalitas-check] Insert results error:", resultsError);
      return errorResponse("Gagal menyimpan hasil pengecekan");
    }

    // 5. Return only the sources that were actually checked
    return jsonResponse({
      data: {
        checkId: checkRecord.id,
        results: resultRows,
      },
    });
  } catch (err) {
    console.error("[legalitas-check] Error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";

    if (msg.includes("Authorization") || msg.includes("token") || msg.includes("Invalid") || msg.includes("No business")) {
      return errorResponse(msg, 401);
    }

    return errorResponse(msg, 500);
  }
});
