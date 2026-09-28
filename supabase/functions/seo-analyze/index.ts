// supabase/functions/seo-analyze/index.ts
// Secure server-side SEO crawler & analyzer for BisnisSehat
//
// Solves browser CORS limitation by fetching target URLs on the backend
// with multi-layered SSRF protection, redirect verification, response size limits,
// and bot-protection detection.
//
// Free entitlement: accessible by all users (Free and Pro). No paywall.

import { corsHeaders, corsResponse, jsonResponse, errorResponse } from "../_shared/response.ts";

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB max HTML
const USER_AGENT = "Mozilla/5.0 (compatible; BisnisSehat-SEO-Bot/1.0; +https://bisnissehat.id/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Check if an IPv4 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private RFC1918)
  if (a === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata like 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private RFC1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private RFC1918)
  if (a === 192 && b === 168) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use & broadcast 255.255.255.255)
  if (a >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // Loopback (::1) or Unspecified (::)
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:1" || cleanIp === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // IPv4-mapped IPv6 address (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanIp.startsWith("::ffff:") || cleanIp.includes(":ffff:")) {
    const lastPart = cleanIp.split(":").pop() || "";
    if (lastPart.includes(".")) {
      return isPrivateIPv4(lastPart);
    }
  }

  // Link-Local (fe80::/10 -> fe80 - febf)
  if (/^fe[89ab][0-9a-f]/i.test(cleanIp)) return true;

  // Unique Local Address (fc00::/7 -> fc00 - fdff)
  if (/^f[cd][0-9a-f]{2}/i.test(cleanIp)) return true;

  return false;
}

/**
 * Check if hostname or IP address is prohibited by SSRF security policy.
 */
export function isRestrictedHost(hostname: string): { restricted: boolean; reason?: string } {
  const host = hostname.toLowerCase().trim();

  // Explicit forbidden hostnames
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".test") ||
    host.endsWith(".example") ||
    host.endsWith(".invalid") ||
    host === "metadata.google.internal" ||
    host === "instance-data" ||
    host === "metadata.azure.com" ||
    host === "kong" ||
    host === "db" ||
    host === "auth" ||
    host === "rest" ||
    host === "realtime" ||
    host === "storage"
  ) {
    return { restricted: true, reason: `Target host "${host}" dilarang oleh kebijakan keamanan internal (SSRF Protection).` };
  }

  // Direct IPv4 literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    if (isPrivateIPv4(host)) {
      return { restricted: true, reason: `Target IP "${host}" adalah jaringan privat/lokal dan dilarang.` };
    }
  }

  // Direct IPv6 literal
  if (host.includes(":") || (host.startsWith("[") && host.endsWith("]"))) {
    if (isPrivateIPv6(host)) {
      return { restricted: true, reason: `Target IPv6 "${host}" adalah loopback/privat dan dilarang.` };
    }
  }

  return { restricted: false };
}

/**
 * Resolve hostname via DNS and ensure all resolved IP addresses are safe public IPs.
 */
export async function validateDnsAndSsrf(hostname: string): Promise<{ valid: boolean; reason?: string }> {
  // First check hostname pattern
  const hostCheck = isRestrictedHost(hostname);
  if (hostCheck.restricted) {
    return { valid: false, reason: hostCheck.reason };
  }

  // If host is already an IP address, it passed the isRestrictedHost check above
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":")) {
    return { valid: true };
  }

  // Perform DNS resolution in Deno runtime if available
  if (typeof Deno !== "undefined" && typeof Deno.resolveDns === "function") {
    try {
      const ipv4Records = await Deno.resolveDns(hostname, "A").catch(() => [] as string[]);
      for (const ip of ipv4Records) {
        if (isPrivateIPv4(ip)) {
          return {
            valid: false,
            reason: `Hostname "${hostname}" mengarah ke IP privat (${ip}). Permintaan ditolak (SSRF Protection).`,
          };
        }
      }

      const ipv6Records = await Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]);
      for (const ip of ipv6Records) {
        if (isPrivateIPv6(ip)) {
          return {
            valid: false,
            reason: `Hostname "${hostname}" mengarah ke IPv6 privat (${ip}). Permintaan ditolak (SSRF Protection).`,
          };
        }
      }
    } catch (err: any) {
      return {
        valid: false,
        reason: `Gagal menyelesaikan DNS hostname "${hostname}": ${err?.message || "Domain tidak ditemukan."}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Detect if response HTML contains anti-bot / Cloudflare challenge page.
 */
export function isBotChallenge(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("just a moment...") ||
    lower.includes("attention required! | cloudflare") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-platform") ||
    lower.includes("cf-turnstile") ||
    lower.includes("ddos protection by cloudflare") ||
    lower.includes("<title>403 forbidden</title>") ||
    lower.includes("<title>access denied</title>") ||
    lower.includes("<title>security check</title>") ||
    lower.includes("shieldsquare") ||
    lower.includes("perimeterx") ||
    lower.includes("px-captcha") ||
    lower.includes("verify you are human") ||
    lower.includes("verifikasi bahwa anda adalah manusia")
  );
}

Deno.serve(async (req) => {
  // CORS Preflight
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

    const rawUrl = String(body?.url || "").trim();
    const targetKeyword = String(body?.targetKeyword || "").trim();

    if (!rawUrl) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          error: {
            code: "INVALID_URL",
            message: "URL target wajib disertakan.",
          },
          message: "URL target wajib disertakan.",
          fallback: { available: false, mode: "manual_html" },
        },
        200
      );
    }

    // 1. Validate URL syntax
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    } catch {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          error: {
            code: "INVALID_URL",
            message: "Format URL tidak valid. Pastikan URL menyertakan domain yang benar.",
          },
          message: "Format URL tidak valid. Pastikan URL menyertakan domain yang benar.",
          fallback: { available: false, mode: "manual_html" },
        },
        200
      );
    }

    // 2. Only permit http & https schemes
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_URL",
          error: {
            code: "INVALID_URL",
            message: `Protokol "${parsedUrl.protocol}" tidak diizinkan. Hanya http dan https yang didukung.`,
          },
          message: `Protokol "${parsedUrl.protocol}" tidak diizinkan. Hanya http dan https yang didukung.`,
          fallback: { available: false, mode: "manual_html" },
        },
        200
      );
    }

    // 3. SSRF & Redirect-safe fetch loop
    let currentUrl = parsedUrl.href;
    let redirectCount = 0;
    let finalResponse: Response | null = null;
    let finalHtml = "";

    while (redirectCount <= MAX_REDIRECTS) {
      const currentParsed = new URL(currentUrl);

      // Validate scheme on every hop
      if (currentParsed.protocol !== "http:" && currentParsed.protocol !== "https:") {
        return jsonResponse(
          {
            ok: false,
            code: "SSRF_REJECTED",
            error: {
              code: "SSRF_REJECTED",
              message: `Pengalihan (redirect) ke protokol tidak aman "${currentParsed.protocol}" ditolak.`,
            },
            message: `Pengalihan (redirect) ke protokol tidak aman "${currentParsed.protocol}" ditolak.`,
            fallback: { available: true, mode: "manual_html" },
          },
          200
        );
      }

      // Pre-flight DNS & SSRF IP check on every hop
      const ssrfCheck = await validateDnsAndSsrf(currentParsed.hostname);
      if (!ssrfCheck.valid) {
        return jsonResponse(
          {
            ok: false,
            code: "SSRF_REJECTED",
            error: {
              code: "SSRF_REJECTED",
              message: ssrfCheck.reason || "Target URL dilarang oleh proteksi SSRF.",
            },
            message: ssrfCheck.reason || "Target URL dilarang oleh proteksi SSRF.",
            fallback: { available: true, mode: "manual_html" },
          },
          200
        );
      }

      // Safe fetch with manual redirect & timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr?.name === "AbortError") {
          return jsonResponse(
            {
              ok: false,
              code: "TARGET_TIMEOUT",
              error: {
                code: "TIMEOUT",
                message: "Koneksi ke server target memakan waktu terlalu lama (timeout > 8 detik).",
              },
              message: "Koneksi ke server target memakan waktu terlalu lama (timeout > 8 detik).",
              fallback: {
                available: true,
                mode: "manual_html",
              },
            },
            200
          );
        }

        // Catch HTTP/2 stream errors, SendRequest, TLS, connection resets, or network failures
        return jsonResponse(
          {
            ok: false,
            code: "TARGET_UNREACHABLE",
            error: {
              code: "TARGET_UNREACHABLE",
              message: "Halaman target tidak dapat diambil oleh server analyzer.",
            },
            message: "Halaman target tidak dapat diambil oleh server analyzer.",
            fallback: {
              available: true,
              mode: "manual_html",
            },
          },
          200
        );
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle Redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          return jsonResponse(
            {
              ok: false,
              code: "TOO_MANY_REDIRECTS",
              error: {
                code: "TARGET_UNREACHABLE",
                message: `Halaman target melebihi batas pengalihan maksimal (${MAX_REDIRECTS} redirects).`,
              },
              message: `Halaman target melebihi batas pengalihan maksimal (${MAX_REDIRECTS} redirects).`,
              fallback: { available: true, mode: "manual_html" },
            },
            200
          );
        }

        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          return jsonResponse(
            {
              ok: false,
              code: "TARGET_UNREACHABLE",
              error: {
                code: "TARGET_UNREACHABLE",
                message: "Server target mengembalikan status redirect tanpa header Location.",
              },
              message: "Server target mengembalikan status redirect tanpa header Location.",
              fallback: { available: true, mode: "manual_html" },
            },
            200
          );
        }

        // Resolve destination relative to current URL
        try {
          const nextTarget = new URL(locationHeader, currentUrl).href;
          currentUrl = nextTarget;
          continue;
        } catch {
          return jsonResponse(
            {
              ok: false,
              code: "TARGET_UNREACHABLE",
              error: {
                code: "TARGET_UNREACHABLE",
                message: `Header redirect Location "${locationHeader}" tidak dapat diparse.`,
              },
              message: `Header redirect Location "${locationHeader}" tidak dapat diparse.`,
              fallback: { available: true, mode: "manual_html" },
            },
            200
          );
        }
      }

      // We received a terminal response
      finalResponse = response;
      break;
    }

    if (!finalResponse) {
      return jsonResponse(
        {
          ok: false,
          code: "TARGET_UNREACHABLE",
          error: {
            code: "TARGET_UNREACHABLE",
            message: "Halaman target tidak dapat diambil oleh server analyzer.",
          },
          message: "Halaman target tidak dapat diambil oleh server analyzer.",
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    // 4. Target Protection handling (401, 403, 429, 503)
    if (finalResponse.status === 403 || finalResponse.status === 401) {
      return jsonResponse(
        {
          ok: false,
          code: "TARGET_BLOCKED",
          targetStatus: finalResponse.status,
          error: {
            code: "TARGET_BLOCKED",
            message: "Halaman target menolak akses otomatis (HTTP 403 / Access Denied). Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          },
          message: "Halaman target menolak akses otomatis (HTTP 403 / Access Denied). Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    if (finalResponse.status === 429) {
      return jsonResponse(
        {
          ok: false,
          code: "TARGET_RATE_LIMITED",
          targetStatus: 429,
          error: {
            code: "TARGET_RATE_LIMITED",
            message: "Server target menerapkan pembatasan frekuensi akses (HTTP 429 Rate Limited). Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          },
          message: "Server target menerapkan pembatasan frekuensi akses (HTTP 429 Rate Limited). Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    if (finalResponse.status >= 400) {
      return jsonResponse(
        {
          ok: false,
          code: "TARGET_UNREACHABLE",
          targetStatus: finalResponse.status,
          error: {
            code: "TARGET_UNREACHABLE",
            message: `Server target merespons dengan status HTTP ${finalResponse.status}. Halaman target tidak dapat diambil oleh server analyzer.`,
          },
          message: `Server target merespons dengan status HTTP ${finalResponse.status}. Halaman target tidak dapat diambil oleh server analyzer.`,
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    // 5. Content-Type check (must be HTML / XHTML)
    const contentType = (finalResponse.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
      return jsonResponse(
        {
          ok: false,
          code: "NON_HTML_RESPONSE",
          error: {
            code: "INVALID_CONTENT_TYPE",
            message: `Konten yang diterima bukan berupa dokumen HTML (${contentType}). SEO Optimizer hanya mengaudit halaman web HTML.`,
          },
          message: `Konten yang diterima bukan berupa dokumen HTML (${contentType}). SEO Optimizer hanya mengaudit halaman web HTML.`,
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    // 6. Read stream with strict size limit (MAX_RESPONSE_BYTES)
    const reader = finalResponse.body?.getReader();
    if (!reader) {
      return jsonResponse(
        {
          ok: false,
          code: "EMPTY_BODY",
          message: "Respon dari server target tidak memiliki konten body.",
        },
        200
      );
    }

    const decoder = new TextDecoder();
    let totalBytes = 0;
    let chunks = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel("Payload exceeded max allowed size");
        return jsonResponse(
          {
            ok: false,
            code: "RESPONSE_TOO_LARGE",
            error: {
              code: "RESPONSE_TOO_LARGE",
              message: "Ukuran dokumen HTML melebihi batas maksimal yang diizinkan (2 MB).",
            },
            message: "Ukuran dokumen HTML melebihi batas maksimal yang diizinkan (2 MB).",
            fallback: {
              available: true,
              mode: "manual_html",
            },
          },
          200
        );
      }

      chunks += decoder.decode(value, { stream: true });
    }
    chunks += decoder.decode();
    finalHtml = chunks;

    // 7. Check if response is a bot/Cloudflare challenge page
    if (isBotChallenge(finalHtml)) {
      return jsonResponse(
        {
          ok: false,
          code: "TARGET_BLOCKED",
          targetStatus: finalResponse.status,
          error: {
            code: "TARGET_BLOCKED",
            message: "Halaman target memuat proteksi bot / challenge verifikasi (seperti Cloudflare atau CAPTCHA), bukan konten publik asli. Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          },
          message: "Halaman target memuat proteksi bot / challenge verifikasi (seperti Cloudflare atau CAPTCHA), bukan konten publik asli. Tempelkan HTML halaman pada mode Analisis Manual untuk melanjutkan.",
          fallback: {
            available: true,
            mode: "manual_html",
          },
        },
        200
      );
    }

    // 8. Success: return fetched HTML and metadata
    return jsonResponse({
      ok: true,
      status: "success",
      url: rawUrl,
      finalUrl: currentUrl,
      httpStatus: finalResponse.status,
      contentType,
      contentLength: totalBytes,
      targetKeyword,
      html: finalHtml,
    });
  } catch (err: any) {
    return errorResponse(`Terjadi kesalahan internal server: ${err?.message || "Unknown error"}`, 500);
  }
});
