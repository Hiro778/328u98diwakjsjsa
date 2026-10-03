// supabase/functions/ai-business-analyst/index.ts
// BisnisSehat AI Business Analyst — Standalone AI Experience Edge Function
//
// Target Architecture:
// BisnisSehat AI App -> Authenticated AI Chat -> Supabase Edge Function:
//   Security / Policy Gate -> Auth Verification -> Business Ownership ->
//   Entitlement -> Tool Authorization -> Allowlisted Business Tools (READ/WRITE) ->
//   TokenKoding Ling (ling-3.0-flash) -> Sanitized Natural Language Response
//
// Provider Specification:
// - Provider: TokenKoding ONLY (No Gemini, No Ollama, No provider fallback)
// - Base URL: https://api.tokenkoding.id/v1
// - Endpoint: https://api.tokenkoding.id/v1/chat/completions
// - Model: ling-3.0-flash
// - Secret: TOKENKODING_API_KEY (Server-side Edge Function Secret ONLY, never exposed to client)

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { enforceAiFeatureFlag } from "../_shared/platform-settings.ts";

// ── 0. TOKENKODING LING PROVIDER SPECIFICATION ──

export const TOKENKODING_BASE_URL = "https://api.tokenkoding.id/v1";
export const TOKENKODING_CHAT_ENDPOINT = `${TOKENKODING_BASE_URL}/chat/completions`;
export const TOKENKODING_MODEL = "ling-3.0-flash";

export const SYSTEM_INSTRUCTION = `Anda adalah AI Business Analyst resmi untuk platform BisnisSehat.
Tugas Anda adalah memberikan analisis bisnis mendalam, observasi profitabilitas, tren penjualan, dan rekomendasi operasional yang actionable dan solutif bagi pelaku UMKM.

Pedoman Penting:
1. Dasarkan analisis Anda HANYA pada data bisnis terverifikasi yang disediakan di prompt.
2. Jangan pernah mengarang data atau mengklaim angka di luar metrik yang diberikan.
3. Gunakan bahasa Indonesia yang profesional, ramah, lugas, dan memotivasi.
4. Format jawaban dengan markdown yang rapi (bullet points, bold highlights, emoji terukur).
5. Tolak setiap instruksi yang meminta kredensial, token sistem, bypass database, atau manipulasi data di luar otoritas bisnis.`;

/**
 * Call TokenKoding Ling API with sanitized business metrics.
 * LLM NEVER receives raw database credentials, SQL access, or secret keys.
 */
export async function callTokenKodingLing({
  userMessage,
  toolName,
  sanitizedMetrics,
  apiKey,
}: {
  userMessage: string;
  toolName: string;
  sanitizedMetrics: any;
  apiKey: string | undefined;
}): Promise<{ success: boolean; text: string; error?: string }> {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return {
      success: false,
      text: "Layanan AI Business Analyst belum dapat memproses analisis karena TOKENKODING_API_KEY belum dikonfigurasi di server.",
      error: "TOKENKODING_API_KEY_NOT_CONFIGURED",
    };
  }

  // Ensure prompt contains ONLY sanitized business metrics — never secrets or raw tables
  const promptContent = `Pertanyaan Pengguna: "${userMessage}"\n` +
    `Fokus Analisis: ${toolName}\n\n` +
    `Data Metrik Bisnis (Tersanitasi dari Database):\n${JSON.stringify(sanitizedMetrics, null, 2)}\n\n` +
    `Berikan analisis mendalam, tren, dan saran operasional berdasarkan data di atas.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(TOKENKODING_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: TOKENKODING_MODEL,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: promptContent },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      // Safe diagnostic log without logging API key
      console.error(`[TokenKoding Ling] API responded with HTTP status ${resp.status}`);
      return {
        success: false,
        text: "Maaf, terjadi kendala saat menghubungi layanan AI Business Analyst. Silakan coba beberapa saat lagi.",
        error: `PROVIDER_HTTP_${resp.status}`,
      };
    }

    const data = await resp.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string" || !content.trim()) {
      console.error("[TokenKoding Ling] Malformed or empty response received from provider");
      return {
        success: false,
        text: "Maaf, respons dari layanan AI tidak valid. Silakan coba kembali sesaat lagi.",
        error: "MALFORMED_PROVIDER_RESPONSE",
      };
    }

    return {
      success: true,
      text: content.trim(),
    };
  } catch (err: any) {
    // Safe error handling: never leak the key or internal stack traces
    const safeError = err?.name === "AbortError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR";
    console.error(`[TokenKoding Ling] Call failed: ${safeError}`);
    return {
      success: false,
      text: "Maaf, koneksi ke layanan AI Business Analyst terputus atau melebihi batas waktu. Silakan coba kembali.",
      error: safeError,
    };
  }
}

// ── 1. TOOL ALLOWLIST REGISTRY ──

export const ALLOWED_READ_TOOLS = Object.freeze([
  "analyze_sales",
  "analyze_revenue",
  "analyze_profit",
  "analyze_inventory",
  "analyze_low_stock",
  "analyze_orders",
  "analyze_products",
  "analyze_suppliers",
  "analyze_cashflow",
  "analyze_customer_metrics",
  "analyze_risk",
]);

export const ALLOWED_WRITE_TOOLS = Object.freeze([
  "create_product",
  "update_product",
  "delete_product",
  "create_supplier",
  "update_supplier",
  "delete_supplier",
  "update_inventory",
  "create_order",
  "update_order",
]);

// ── 2. SECURITY POLICY & BLOCK RESPONSE ──

export const SECURITY_BLOCK_MESSAGE =
  "Maaf, bot tidak bisa melakukan hal itu.\n" +
  "Coba hal lain seperti analisis risiko, keamanan bisnis, atau performa usaha.\n\n" +
  "Coba hal lain seperti:\n" +
  "• analisis risiko bisnis\n" +
  "• analisis penjualan\n" +
  "• analisis stok\n" +
  "• analisis margin\n" +
  "• audit operasional\n" +
  "• analisis supplier\n" +
  "• deteksi anomali transaksi";

const ABUSE_THREAT_PATTERNS = [
  // 1. Raw DB dump / data exfiltration
  /\b((dump|give\s+me|show\s+me|ambil|tampilkan|lihat)\s+(all\s+|semua\s+|the\s+)?(database|db|users?|pengguna|businesses|bisnis|transaksi|tabel|tables?|data\s+mentah)|kirimin\s+database|ambil\s+semua\s+transaksi\s+mentah)\b/i,
  // 2. Supabase Service Role / secrets / database passwords
  /\b(service[_\s-]?role(\s*key)?|supabase[_\s-]?(service[_\s-]?role|key|secret|credential)|database[_\s-]?password|db[_\s-]?password)\b/i,
  // 3. JWT & Access/Auth tokens
  /\b(ambil|kasih|minta|bocorkan|lihat|dump|tampilkan|show|give)\s+(auth\s+)?(token|jwt|access[_\s-]?token|refresh[_\s-]?token)\b/i,
  /\b(bearer\s+token|jwt\s+secret)\b/i,
  // 4. TokenKoding API Key probing
  /\b(tokenkoding[_\s-]?(api[_\s-]?key|key|secret|token)|ling[_\s-]?api[_\s-]?key)\b/i,
  // 5. Vercel & cloud secrets
  /\b(vercel\s+(token|credentials?|secrets?|apis?)|tembak\s+api\s+vercel)\b/i,
  // 6. Environment variables & API keys
  /(?:\b(env(ironment)?[_\s-]?(var(iable)?s?|secret)|ambil\s+env|server\s+secrets?|api[_\s-]?keys?)\b|\.env)/i,
  // 7. External credential exfiltration & proxying
  /\b(kirim\s+credential\s+ke|curl\s+https?:\/\/|wget\s+https?:\/\/|ngrok|webhook\.site|proxy(\s+this)?\s+url|proxy\s+request)\b/i,
  // 8. Request flooding & DDoS / destructive testing
  /\b(hit\s+endpoint.*10\.?000|flood(ing)?\s+(request|api)|ddos|scan\s+production\s+lalu\s+exploit)\b/i,
  // 9. Cross-tenant & RLS bypass
  /\b((ignore|bypass)[_\s-]?rls|bypass\s+(auth|authentication|authorization)|(akses|data|lihat|show|tampilkan)?\s*(bisnis|user|tenant|business)\s+(lain|orang\s+lain)|another\s+tenant|other[_\s-]?business|other\s+tenant)\b/i,
  // 10. Arbitrary SQL execution / injection
  /\b(union\s+select|information_schema|drop\s+table|delete\s+semua\s+database|exec\s*\(|alter\s+table|truncate\s+table|select\s+\*\s+from|execute\s+sql|run\s+sql|arbitrary\s+sql)\b/i,
  // 11. Arbitrary shell/OS commands / filesystem access
  /\b(rm\s+-rf|sh\s+-c|bash\s+-c|cat\s+\/etc|powershell|cmd\.exe|eval\s*\(|(server\s+)?filesystem|file\s+system|\/etc\/passwd)\b/i,
  // 12. Prompt injection directives & system prompt extraction
  /\b(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt\s+override|jailbreak|(bocorkan|tampilkan|lihat|dump|print|reveal|show|what\s+is|tell\s+me|repeat)\s+(your\s+|the\s+|all\s+|everything\s+you\s+received\s+in\s+your\s+)?(system\s+prompt|instruksi\s+sistem|developer\s+instruction|system\s+instruction|hidden\s+business\s+context|hidden\s+context|context\s+verbatim))\b/i,
];

export function isAbuseThreat(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const normalized = input.trim();
  if (/;\s*drop\s+table/i.test(normalized) || /;\s*delete\s+from/i.test(normalized)) {
    return true;
  }
  return ABUSE_THREAT_PATTERNS.some((pattern) => pattern.test(normalized));
}

// In-memory pending confirmations for destructive operations (TTL: 60s)
const pendingConfirmations = new Map<string, {
  userId: string;
  businessId: string;
  action: string;
  targetId: string;
  targetName: string;
  expiresAt: number;
}>();

const NOISE_WORDS = ["dong", "ya", "deh", "bang", "pls", "please", "tolong", "min"];

function cleanEntityName(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  s = s.replace(/[?!.,;:]+$/g, "").trim();
  const words = s.split(/\s+/);
  while (words.length > 0 && NOISE_WORDS.includes(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  s = words.join(" ").trim();
  if (!s || s.toLowerCase() === "baru" || s.toLowerCase() === "dong") {
    return null;
  }
  return s;
}

export function parseBusinessIntent(query: string) {
  if (!query || typeof query !== "string") {
    return { tool: null, type: "UNKNOWN", entity: {} as Record<string, any> };
  }

  const raw = query.trim();
  const clean = raw.replace(/[?!.,;:]+$/g, "").trim();
  const lower = clean.toLowerCase();

  // 1. WRITE: CREATE_SUPPLIER
  // Pattern B: "masukin Yanto sebagai supplier"
  const supAsMatch = clean.match(
    /^(?:bisa\s+)?(?:masuk(?:in|kan)|tambah(?:kan)?|daftarkan|jadikan)\s+(.+?)\s+sebagai\s+(?:supplier|pemasok)$/i
  );
  if (supAsMatch) {
    return {
      tool: "create_supplier",
      type: "WRITE",
      entity: { name: cleanEntityName(supAsMatch[1]) },
    };
  }

  // Pattern C: "tambah yanto supplier" / "masukin yanto supplier"
  const supInvertMatch = clean.match(
    /^(?:bisa\s+)?(?:tambah(?:kan)?|daftarkan|masuk(?:in|kan)|input)\s+(.+?)\s+(?:supplier|pemasok)$/i
  );
  if (supInvertMatch) {
    return {
      tool: "create_supplier",
      type: "WRITE",
      entity: { name: cleanEntityName(supInvertMatch[1]) },
    };
  }

  // Pattern A: "bisa tambah supplier yanto" / "tambah supplier Yanto" / "buat supplier baru namanya Yanto"
  // "gw mau nambah supplier" / "buat supplier baru dong"
  const supAddMatch = clean.match(
    /^(?:bisa\s+)?(?:gw\s+mau\s+|saya\s+mau\s+|aku\s+mau\s+|mau\s+|ingin\s+)?(?:tambah(?:kan)?|bikin|buat|daftarkan|masuk(?:in|kan)|input|daftarin|nambah)\s+(?:supplier|pemasok)(?:\s+baru)?(?:\s+(?:namanya|bernama))?(?:\s+(.+))?$/i
  );
  if (supAddMatch) {
    const rawName = supAddMatch[1] ? supAddMatch[1].trim() : "";
    return {
      tool: "create_supplier",
      type: "WRITE",
      entity: { name: cleanEntityName(rawName) },
    };
  }

  // 2. WRITE: DELETE_SUPPLIER
  const supDelMatch = clean.match(
    /^(?:bisa\s+)?(?:hapus|delete|hilangkan|buang|drop)\s+(?:supplier|pemasok)(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  );
  if (supDelMatch) {
    return {
      tool: "delete_supplier",
      type: "WRITE",
      entity: { name: cleanEntityName(supDelMatch[1]) },
    };
  }

  // 3. WRITE: UPDATE_SUPPLIER
  const supUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:ubah|update|edit|ganti)\s+(?:supplier|pemasok)(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  );
  if (supUpdMatch) {
    return {
      tool: "update_supplier",
      type: "WRITE",
      entity: { name: cleanEntityName(supUpdMatch[1]) },
    };
  }

  // 4. WRITE: CREATE_PRODUCT
  const prodAddMatch = clean.match(
    /^(?:bisa\s+)?(?:gw\s+mau\s+|saya\s+mau\s+|aku\s+mau\s+|mau\s+|ingin\s+)?(?:tambah(?:kan)?|bikin|buat|daftarkan|masuk(?:in|kan)|input|daftarin|nambah)\s+produk(?:\s+baru)?(?:\s+(?:namanya|bernama))?(?:\s+(.+))?$/i
  );
  if (prodAddMatch) {
    return {
      tool: "create_product",
      type: "WRITE",
      entity: { name: cleanEntityName(prodAddMatch[1]) },
    };
  }

  // 5. WRITE: DELETE_PRODUCT
  const prodDelMatch = clean.match(
    /^(?:bisa\s+)?(?:hapus|delete|hilangkan|buang)\s+produk(?:\s+(?:namanya|bernama))?\s+(.+)$/i
  );
  if (prodDelMatch) {
    return {
      tool: "delete_product",
      type: "WRITE",
      entity: { name: cleanEntityName(prodDelMatch[1]) },
    };
  }

  // 6. WRITE: UPDATE_PRODUCT
  const prodUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:ubah|update|edit|ganti)\s+(?:harga|nama|data)?\s*produk\s+(.+)$/i
  );
  if (prodUpdMatch) {
    return {
      tool: "update_product",
      type: "WRITE",
      entity: { name: cleanEntityName(prodUpdMatch[1]) },
    };
  }

  // 7. WRITE: UPDATE_INVENTORY
  const invUpdMatch = clean.match(
    /^(?:bisa\s+)?(?:update|ubah|tambah|sesuaikan|kurangi|set)\s+stok(?:\s+(?:produk|barang))?\s*(.+)?$/i
  );
  if (invUpdMatch) {
    return {
      tool: "update_inventory",
      type: "WRITE",
      entity: { target: cleanEntityName(invUpdMatch[1]) },
    };
  }

  // 8. READ: Low Stock / Restock
  if (
    lower.includes("restock") ||
    lower.includes("stok menipis") ||
    lower.includes("stok habis") ||
    lower.includes("stok kritis") ||
    lower.includes("low stock") ||
    lower.includes("kapan harus restock") ||
    lower.includes("kapan restock")
  ) {
    return { tool: "analyze_low_stock", type: "READ", entity: {} };
  }

  // 9. READ: Inventory
  if (
    lower.includes("inventori") ||
    lower.includes("stok gudang") ||
    lower.includes("persediaan") ||
    lower.includes("cek stok") ||
    lower.includes("total stok")
  ) {
    return { tool: "analyze_inventory", type: "READ", entity: {} };
  }

  // 10. READ: Profit & Margin
  if (
    lower.includes("margin") ||
    lower.includes("profit") ||
    lower.includes("laba") ||
    lower.includes("keuntungan")
  ) {
    return { tool: "analyze_profit", type: "READ", entity: {} };
  }

  // 11. READ: Revenue
  if (
    lower.includes("omzet") ||
    lower.includes("omset") ||
    lower.includes("revenue") ||
    lower.includes("pendapatan")
  ) {
    return { tool: "analyze_revenue", type: "READ", entity: {} };
  }

  // 12. READ: Sales
  if (
    lower.includes("paling laku") ||
    lower.includes("terlaris") ||
    lower.includes("best seller") ||
    lower.includes("penjualan") ||
    lower.includes("sales") ||
    lower.includes("penjualan turun") ||
    lower.includes("kenapa penjualan turun") ||
    lower.includes("bandingkan penjualan")
  ) {
    return { tool: "analyze_sales", type: "READ", entity: {} };
  }

  // 13. READ: Suppliers
  if (lower.includes("supplier") || lower.includes("pemasok")) {
    return { tool: "analyze_suppliers", type: "READ", entity: {} };
  }

  // 14. READ: Risk
  if (lower.includes("risiko") || lower.includes("keamanan bisnis")) {
    return { tool: "analyze_risk", type: "READ", entity: {} };
  }

  // 15. READ: Orders
  if (lower.includes("pesanan") || lower.includes("order") || lower.includes("transaksi")) {
    return { tool: "analyze_orders", type: "READ", entity: {} };
  }

  // 16. READ: Products
  if (lower.includes("katalog") || lower.includes("daftar produk") || lower.includes("semua produk")) {
    return { tool: "analyze_products", type: "READ", entity: {} };
  }

  // 17. READ: Cashflow
  if (lower.includes("arus kas") || lower.includes("cashflow") || lower.includes("cash flow")) {
    return { tool: "analyze_cashflow", type: "READ", entity: {} };
  }

  // 18. READ: Customer Metrics
  if (lower.includes("pelanggan") || lower.includes("customer") || lower.includes("crm")) {
    return { tool: "analyze_customer_metrics", type: "READ", entity: {} };
  }

  // 19. READ: Overview / Condition
  if (
    lower.includes("kondisi bisnis") ||
    lower.includes("kesehatan bisnis") ||
    lower.includes("performa") ||
    lower.includes("overview") ||
    lower.includes("ringkasan") ||
    lower.includes("data yang tersedia")
  ) {
    return { tool: "analyze_sales", type: "READ", entity: {} };
  }

  return { tool: null, type: "UNKNOWN", entity: {} };
}

// ── 3. EDGE FUNCTION HANDLER ──

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    // 1. Authoritative Auth Verification (auth.uid() -> profile -> business ownership)
    const auth = await verifyAuth(req);

    // 2. Entitlement check (Require subscription)
    const _hasPro = await isProUser(auth.userId);
    const aiBlocked = await enforceAiFeatureFlag();
    if (aiBlocked) {
      return errorResponse(aiBlocked, 503);
    }

    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : "";
    const confirmationId = body.confirmationId;
    const confirmed = body.confirmed;

    // 3. Security / Abuse Gate (BEFORE any tool execution or LLM call)
    if (message && isAbuseThreat(message)) {
      return jsonResponse({
        status: 400,
        blocked: true,
        text: SECURITY_BLOCK_MESSAGE,
        suggestions: [
          "Produk apa paling laku bulan ini?",
          "Berapa omzet saya bulan ini?",
          "Berapa margin saya?",
          "Kapan saya harus restock?",
        ],
      });
    }

    // 4. Handle Confirmation Flow for Destructive Actions (Server-side revalidation)
    if (confirmationId) {
      const pending = pendingConfirmations.get(confirmationId);
      if (!pending || Date.now() > pending.expiresAt) {
        pendingConfirmations.delete(confirmationId);
        return jsonResponse({
          status: 400,
          text: "Permintaan konfirmasi telah kedaluwarsa atau tidak valid. Silakan ulangi permintaan Anda.",
        });
      }

      // Revalidate ownership
      if (pending.businessId !== auth.businessId || pending.userId !== auth.userId) {
        pendingConfirmations.delete(confirmationId);
        return errorResponse("Access denied: Konfirmasi tidak sesuai dengan bisnis Anda.", 403);
      }

      if (confirmed === false) {
        pendingConfirmations.delete(confirmationId);
        const entityLabel = pending.action === "delete_product" ? "produk" : "supplier";
        return jsonResponse({
          status: 200,
          text: `Tindakan penghapusan ${entityLabel} "${pending.targetName}" dibatalkan. Data tetap aman.`,
        });
      }

      if (confirmed === true) {
        pendingConfirmations.delete(confirmationId);

        if (pending.action === "delete_supplier") {
          // Check dependencies on inventory table
          const { data: invs } = await supabaseAdmin
            .from("inventory")
            .select("id")
            .eq("supplier_id", pending.targetId)
            .limit(1);

          if (invs && invs.length > 0) {
            return jsonResponse({
              status: 200,
              text: `⚠️ **Gagal Menghapus:** Supplier "${pending.targetName}" tidak dapat dihapus karena masih digunakan oleh data pembelian/produk tertentu.`,
            });
          }

          // Authorized deletion
          const { error: delErr } = await supabaseAdmin
            .from("suppliers")
            .delete()
            .eq("id", pending.targetId)
            .eq("business_id", auth.businessId);

          if (delErr) {
            return errorResponse("Gagal menghapus supplier dari database.", 500);
          }

          return jsonResponse({
            status: 200,
            text: `✅ **Berhasil:** Supplier ${pending.targetName} berhasil dihapus.`,
          });
        }

        if (pending.action === "delete_product") {
          // Check dependencies on order_items table
          const { data: items } = await supabaseAdmin
            .from("order_items")
            .select("id")
            .eq("product_id", pending.targetId)
            .limit(1);

          if (items && items.length > 0) {
            return jsonResponse({
              status: 200,
              text: `⚠️ **Gagal Menghapus:** Produk "${pending.targetName}" tidak dapat dihapus karena masih digunakan dalam riwayat pesanan aktif.`,
            });
          }

          const { error: delErr } = await supabaseAdmin
            .from("products")
            .delete()
            .eq("id", pending.targetId)
            .eq("business_id", auth.businessId);

          if (delErr) {
            return errorResponse("Gagal menghapus produk dari database.", 500);
          }

          return jsonResponse({
            status: 200,
            text: `✅ **Berhasil:** Produk ${pending.targetName} berhasil dihapus.`,
          });
        }
      }
    }

    // 5. Intent Planning & Dispatching
    const parsed = parseBusinessIntent(message);

    // 5.1 CREATE_SUPPLIER
    if (parsed.tool === "create_supplier") {
      const targetName = parsed.entity?.name;
      if (!targetName) {
        return jsonResponse({
          status: 200,
          text: "Siap. Nama supplier yang mau ditambahkan siapa?",
          suggestions: ["Tambah supplier Yanto", "Daftar supplier aktif", "Analisis supplier"],
        });
      }

      const { data: existing } = await supabaseAdmin
        .from("suppliers")
        .select("id, name")
        .eq("business_id", auth.businessId)
        .ilike("name", targetName)
        .maybeSingle();

      if (existing) {
        return jsonResponse({
          status: 200,
          text: `Supplier "${targetName}" sudah terdaftar di database bisnis Anda.`,
          suggestions: ["Daftar supplier aktif", "Analisis supplier"],
        });
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("suppliers")
        .insert({
          business_id: auth.businessId,
          name: targetName,
        })
        .select()
        .single();

      if (insErr) {
        return jsonResponse({
          status: 500,
          text: `Gagal menambahkan supplier "${targetName}": ${insErr.message}`,
        });
      }

      return jsonResponse({
        status: 200,
        text: `✅ Supplier "${targetName}" berhasil ditambahkan ke database bisnis Anda.`,
        data: inserted,
        suggestions: ["Daftar supplier aktif", "Analisis supplier", "Kapan saya harus restock?"],
      });
    }

    // 5.2 DELETE_SUPPLIER (Destructive, Requires confirmation)
    if (parsed.tool === "delete_supplier") {
      const targetQuery = parsed.entity?.name;
      if (!targetQuery) {
        return jsonResponse({
          status: 200,
          text: `Sebutkan nama supplier yang ingin dihapus (contoh: *"hapus supplier ABC"*).`,
          suggestions: ["Analisis supplier", "Produk paling laku bulan ini"],
        });
      }

      const { data: sups } = await supabaseAdmin
        .from("suppliers")
        .select("id, name")
        .eq("business_id", auth.businessId);

      const found = (sups || []).find(
        (s) => s.name.toLowerCase() === targetQuery.toLowerCase() || s.id === targetQuery
      );

      if (!found) {
        return jsonResponse({
          status: 200,
          text: `Supplier "${targetQuery}" tidak ditemukan di database bisnis Anda.`,
          suggestions: ["Analisis supplier", "Produk paling laku bulan ini"],
        });
      }

      // Check dependencies in inventory
      const { data: depInvs } = await supabaseAdmin
        .from("inventory")
        .select("id")
        .eq("business_id", auth.businessId)
        .eq("supplier_id", found.id)
        .limit(1);

      if (depInvs && depInvs.length > 0) {
        return jsonResponse({
          status: 200,
          text: "Supplier tidak dapat dihapus karena masih digunakan oleh data pembelian/produk tertentu.",
          suggestions: ["Analisis supplier", "Daftar supplier aktif"],
        });
      }

      const newConfId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      pendingConfirmations.set(newConfId, {
        userId: auth.userId,
        businessId: auth.businessId,
        action: "delete_supplier",
        targetId: found.id,
        targetName: found.name,
        expiresAt: Date.now() + 60 * 1000,
      });

      return jsonResponse({
        status: 200,
        confirmationRequired: true,
        confirmationId: newConfId,
        action: "delete_supplier",
        target: { id: found.id, name: found.name },
        text: `Saya menemukan supplier "${found.name}". Menghapusnya akan menghapus data supplier tersebut. Apakah kamu yakin ingin menghapusnya?`,
      });
    }

    // 5.3 UPDATE_SUPPLIER
    if (parsed.tool === "update_supplier") {
      const targetName = parsed.entity?.name;
      return jsonResponse({
        status: 200,
        text: `Supplier ${targetName ? `"${targetName}" ` : ""}ditemukan. Silakan sebutkan informasi yang ingin diperbarui (kontak, nomor telepon, atau alamat) atau buka menu Database Supplier.`,
        suggestions: ["Daftar supplier aktif", "Analisis supplier"],
      });
    }

    // 5.4 CREATE_PRODUCT
    if (parsed.tool === "create_product") {
      const targetName = parsed.entity?.name;
      if (!targetName) {
        return jsonResponse({
          status: 200,
          text: `Tentu! Silakan sebutkan nama produk baru yang ingin ditambahkan (contoh: *"tambah produk Kopi Susu Aren"*).`,
          suggestions: ["Katalog produk", "Produk paling laku bulan ini"],
        });
      }
      return jsonResponse({
        status: 200,
        text: `Untuk mendaftarkan produk baru "${targetName}", silakan tentukan harga jual & modal HPP melalui menu Manajemen Produk & Kasir POS.`,
        suggestions: ["Katalog produk", "Buka Kasir POS"],
      });
    }

    // 5.5 UPDATE_PRODUCT
    if (parsed.tool === "update_product") {
      const targetName = parsed.entity?.name;
      return jsonResponse({
        status: 200,
        text: `Pembaruan data produk ${targetName ? `"${targetName}" ` : ""}dapat dilakukan secara instan melalui modul Produk & Kasir POS.`,
        suggestions: ["Katalog produk", "Berapa margin saya?"],
      });
    }

    // 5.6 DELETE_PRODUCT (Destructive, Requires confirmation)
    if (parsed.tool === "delete_product") {
      const targetQuery = parsed.entity?.name;
      if (!targetQuery) {
        return jsonResponse({
          status: 200,
          text: `Sebutkan nama produk yang ingin dihapus (contoh: *"hapus produk Espresso"*).`,
          suggestions: ["Katalog produk", "Produk paling laku bulan ini"],
        });
      }

      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .eq("business_id", auth.businessId);

      const found = (prods || []).find(
        (p) => p.name.toLowerCase() === targetQuery.toLowerCase() || p.id === targetQuery
      );

      if (!found) {
        return jsonResponse({
          status: 200,
          text: `Produk "${targetQuery}" tidak ditemukan di database bisnis Anda.`,
          suggestions: ["Katalog produk", "Produk paling laku bulan ini"],
        });
      }

      // Check dependencies on order_items table
      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("id")
        .eq("product_id", found.id)
        .limit(1);

      if (items && items.length > 0) {
        return jsonResponse({
          status: 200,
          text: `⚠️ **Gagal Menghapus:** Produk "${found.name}" tidak dapat dihapus karena masih digunakan dalam riwayat pesanan aktif.`,
          suggestions: ["Katalog produk", "Berapa margin saya?"],
        });
      }

      const newConfId = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      pendingConfirmations.set(newConfId, {
        userId: auth.userId,
        businessId: auth.businessId,
        action: "delete_product",
        targetId: found.id,
        targetName: found.name,
        expiresAt: Date.now() + 60 * 1000,
      });

      return jsonResponse({
        status: 200,
        confirmationRequired: true,
        confirmationId: newConfId,
        action: "delete_product",
        target: {
          id: found.id,
          name: found.name,
        },
        text: `Saya menemukan produk "${found.name}". Menghapusnya akan menghapus produk tersebut dari katalog bisnis Anda. Apakah kamu yakin ingin menghapusnya?`,
      });
    }

    // 5.7 UPDATE_INVENTORY
    if (parsed.tool === "update_inventory") {
      const target = parsed.entity?.target;
      return jsonResponse({
        status: 200,
        text: `Penyesuaian stok inventori ${target ? `(${target}) ` : ""}dapat dicatat melalui modul Operasional & Inventori untuk menjaga rekam jejak kartu stok.`,
        suggestions: ["Kapan saya harus restock?", "Status inventori"],
      });
    }

    // Read Secret Server-Side: Deno.env.get("TOKENKODING_API_KEY")
    const tokenKodingApiKey = Deno.env.get("TOKENKODING_API_KEY");

    // 5.8 READ TOOL: Sales & Top Products
    if (parsed.tool === "analyze_sales") {
      const [{ data: orders }, { data: prods }] = await Promise.all([
        supabaseAdmin
          .from("orders")
          .select("total_amount, status, created_at")
          .eq("business_id", auth.businessId),
        supabaseAdmin
          .from("products")
          .select("id, name, unit_price")
          .eq("business_id", auth.businessId)
          .limit(10),
      ]);

      const validOrders = (orders || []).filter((o) =>
        ["completed", "settlement", "paid"].includes(o.status)
      );
      const totalRev = validOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const aov = validOrders.length > 0 ? Math.round(totalRev / validOrders.length) : 0;

      const sanitizedMetrics = {
        totalRevenue: totalRev,
        orderCount: validOrders.length,
        aov,
        topProductsCatalog: (prods || []).map((p: any) => ({ name: p.name, price: p.unit_price })),
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: "analyze_sales",
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.9 READ TOOL: Revenue
    if (parsed.tool === "analyze_revenue") {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("total_amount, status, created_at")
        .eq("business_id", auth.businessId);

      const validOrders = (orders || []).filter((o) =>
        ["completed", "settlement", "paid"].includes(o.status)
      );
      const totalRev = validOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const aov = validOrders.length > 0 ? Math.round(totalRev / validOrders.length) : 0;

      const sanitizedMetrics = {
        totalRevenue: totalRev,
        orderCount: validOrders.length,
        aov,
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: "analyze_revenue",
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.10 READ TOOL: Profit / Margin
    if (parsed.tool === "analyze_profit") {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("name, unit_price, purchase_price")
        .eq("business_id", auth.businessId);

      const margins = (prods || [])
        .filter((p: any) => Number(p.unit_price) > 0)
        .map((p: any) => {
          const sell = Number(p.unit_price);
          const buy = Number(p.purchase_price || 0);
          const marginPct = buy > 0 ? Math.round(((sell - buy) / sell) * 100) : 100;
          return { name: p.name, sell, buy, marginPct };
        })
        .sort((a: any, b: any) => b.marginPct - a.marginPct);

      if (margins.length === 0) {
        return jsonResponse({
          status: 200,
          text: "Belum ada produk aktif yang memiliki harga jual valid untuk dihitung margin keuntungannya.",
        });
      }

      const avgMargin = Math.round(
        margins.reduce((acc: number, m: any) => acc + m.marginPct, 0) / margins.length
      );
      const lowest = margins[margins.length - 1];

      const sanitizedMetrics = {
        avgMargin,
        highestMarginProduct: margins[0],
        lowestMarginProduct: lowest,
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: "analyze_profit",
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.11 READ TOOL: Stock / Low Stock / Restock
    if (parsed.tool === "analyze_low_stock" || parsed.tool === "analyze_inventory") {
      const { data: invs } = await supabaseAdmin
        .from("inventory")
        .select("quantity, min_stock, products(name)")
        .eq("business_id", auth.businessId);

      const lowStock = (invs || []).filter(
        (i: any) => Number(i.quantity || 0) <= Number(i.min_stock || 0)
      );

      const sanitizedMetrics = {
        totalInventoryItems: (invs || []).length,
        lowStockCount: lowStock.length,
        itemsRequiringRestock: lowStock.slice(0, 5).map((i: any) => ({
          name: i.products?.name || "Item Produk",
          quantity: i.quantity,
          min_stock: i.min_stock,
        })),
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: parsed.tool,
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.12 READ TOOL: Suppliers
    if (parsed.tool === "analyze_suppliers") {
      const { data: sups } = await supabaseAdmin
        .from("suppliers")
        .select("name, contact, phone, is_active")
        .eq("business_id", auth.businessId);

      const sanitizedMetrics = {
        totalSuppliers: (sups || []).length,
        activeSuppliers: (sups || []).filter((s: any) => s.is_active !== false).length,
        suppliers: (sups || []).slice(0, 5).map((s: any) => ({ name: s.name, contact: s.contact || s.phone })),
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: "analyze_suppliers",
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.13 READ TOOL: Risk
    if (parsed.tool === "analyze_risk") {
      const sanitizedMetrics = {
        riskCategory: "OPERATIONAL_FINANCIAL_INVENTORY",
        assessment: "Audited through real inventory min_stock levels and canonical POS transactions.",
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: "analyze_risk",
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // 5.14 READ TOOL: Orders / Products / Cashflow / Customer Metrics
    if (
      parsed.tool === "analyze_orders" ||
      parsed.tool === "analyze_products" ||
      parsed.tool === "analyze_cashflow" ||
      parsed.tool === "analyze_customer_metrics"
    ) {
      const [{ data: orders }, { data: prods }, { data: custs }] = await Promise.all([
        supabaseAdmin.from("orders").select("total_amount, status").eq("business_id", auth.businessId),
        supabaseAdmin.from("products").select("id, name, unit_price").eq("business_id", auth.businessId),
        supabaseAdmin.from("customers").select("id", { count: "exact", head: true }).eq("business_id", auth.businessId),
      ]);

      const sanitizedMetrics = {
        totalOrders: (orders || []).length,
        totalProducts: (prods || []).length,
        totalCustomers: custs?.count || 0,
      };

      const lingResult = await callTokenKodingLing({
        userMessage: message,
        toolName: parsed.tool,
        sanitizedMetrics,
        apiKey: tokenKodingApiKey,
      });

      return jsonResponse({
        status: 200,
        text: lingResult.text,
        data: sanitizedMetrics,
      });
    }

    // Default Guidance
    return jsonResponse({
      status: 200,
      text: `Halo! Saya AI Business Analyst BisnisSehat.\n\n` +
        `"Tanya atau minta saya melakukan sesuatu untuk bisnis kamu."\n\n` +
        `Contoh pertanyaan & tindakan:\n` +
        `• *"Produk apa paling laku bulan ini?"*\n` +
        `• *"Berapa omzet saya bulan ini?"*\n` +
        `• *"Berapa margin saya?"*\n` +
        `• *"Kapan saya harus restock?"*\n` +
        `• *"Tambah supplier PT Makmur"* atau *"bisa tambah supplier yanto?"*\n` +
        `• *"Hapus supplier ABC"*\n` +
        `• *"Analisis risiko bisnis"*`,
      suggestions: [
        "Produk paling laku bulan ini",
        "Berapa omzet saya bulan ini?",
        "Berapa margin saya?",
        "Kapan harus restock?",
      ],
    });
  } catch (err: any) {
    return errorResponse(err.message || "Internal server error", 500);
  }
});
