// supabase/functions/telegram-webhook/index.ts
// BisnisSehat Telegram Operasional & AI Operator Webhook Receiver (Supabase Edge Function)
// Compliant with specifications from change.md, bot.md, and te.md

import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { decrypt } from "../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../_shared/response.ts";

// ── 1. CONSTANTS & SPECIFICATIONS (bot.md / te.md) ──
export const ASCII_MENU = `╭──────────────────────────────╮
│      BISNISSEHAT BOT         │
│      Operational Assistant   │
╰──────────────────────────────╯

📊 DATA BISNIS
├─ 📦 Cek stok
├─ 🛒 Cek pesanan
├─ 💰 Cek penjualan
└─ 📈 Ringkasan bisnis

⚙️ OPERASIONAL
├─ 👤 Tambah supplier
├─ 🗑️ Hapus supplier
├─ ✏️ Ubah supplier
├─ 📦 Tambah produk
├─ ✏️ Ubah produk
└─ 🔔 Cek stok rendah

📋 LAINNYA
├─ ❓ Bantuan
└─ 📜 Riwayat aktivitas

Ketik permintaan menggunakan bahasa biasa.

Contoh:
"hapus supplier yanto"
"berapa stok kopi?"
"ada order baru?"`;

export const SECURITY_REJECTION_MESSAGE =
  "Maaf, saya tidak dapat membantu dengan akses, kredensial, bypass keamanan, atau tindakan yang dapat merugikan sistem. Saya bisa membantu dengan operasi bisnis BisnisSehat yang tersedia.";

export const ALLOWED_TOOLS = Object.freeze([
  "get_supplier",
  "create_supplier",
  "update_supplier",
  "delete_supplier",
  "get_product",
  "create_product",
  "update_product",
  "get_inventory",
  "get_low_stock",
  "get_orders",
  "get_order_detail",
  "get_sales_summary",
]);

// ── 2. STATE STORES (IN-MEMORY FOR EDGE FUNCTION ISOLATE) ──
const pendingConfirmations = new Map<string, {
  action: string;
  targetId?: string | null;
  targetName?: string | null;
  businessId: string;
  expiresAt: number;
}>();

const rateLimits = new Map<string, number[]>();
const auditTrail: Array<Record<string, unknown>> = [];

// ── 3. SECURITY & THREAT DETECTION ──
const THREAT_PATTERNS = [
  /service[_\s-]?role/i,
  /supabase[_\s-]?(key|secret|credential)/i,
  /database[_\s-]?(password|credential|url)/i,
  /connection[_\s-]?string/i,
  /bot[_\s-]?token/i,
  /env(ironment)?[_\s-]?var(iable)?s?/i,
  /(api|client|app|jwt|shared)[_\s-]?secret/i,
  /secret[_\s-]?key/i,
  /(show|reveal|display|dump|bocorkan|tampilkan|lihat)\s+.*(secret|kredensial|credential|token|password|database)/i,
  /system[_\s-]?prompt/i,
  /ignore[_\s-]?previous[_\s-]?instructions/i,
  /bypass[_\s-]?rls/i,
  /bypass[_\s-]?authoriz/i,
  /other[_\s-]?business|tenant[_\s-]?lain|bisnis[_\s-]?lain/i,
  /\b(drop|truncate|alter)\s+table\b/i,
  /\b(delete\s+from\s+users|delete\s+from\s+auth)\b/i,
  /\bunion\s+select\b/i,
  /\b(chmod|bash|exec|curl|wget|nc|cat\s+\/etc)\b/i,
  /\/etc\/passwd/i,
  /malware|exploit|phishing|penetration\s+test/i,
  /\b(jalankan\s+sql|eksekusi\s+sql|tampilkan\s+database|kasih\s+service\s+role)\b/i,
];

export function isSecurityThreat(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return THREAT_PATTERNS.some((regex) => regex.test(text));
}

export function checkRateLimit(key: string, maxLimit = 20, windowMs = 60000) {
  const now = Date.now();
  const history = (rateLimits.get(key) || []).filter((ts) => now - ts < windowMs);
  if (history.length >= maxLimit) {
    rateLimits.set(key, history);
    return { allowed: false, remaining: 0 };
  }
  history.push(now);
  rateLimits.set(key, history);
  return { allowed: true, remaining: maxLimit - history.length };
}

// ── 4. DETERMINISTIC INTENT PARSER ──
export function fallbackIntentParser(text: string): { action: string; arguments: Record<string, unknown> } {
  const lower = text.trim().toLowerCase();

  // 1. Delete supplier
  const delSuppMatch = lower.match(/(?:hapus|delete)\s+supplier\s+(.+)/i);
  if (delSuppMatch) {
    return { action: "delete_supplier", arguments: { name: delSuppMatch[1].trim() } };
  }

  // 2. Create supplier
  const addSuppMatch = lower.match(/(?:tambah|buat|add)\s+supplier\s+(.+)/i);
  if (addSuppMatch) {
    return { action: "create_supplier", arguments: { name: addSuppMatch[1].trim() } };
  }

  // 3. Get supplier
  const getSuppMatch = lower.match(/(?:cek|lihat|info|cari)\s+supplier(?:\s+(.+))?/i);
  if (getSuppMatch) {
    return { action: "get_supplier", arguments: { name: getSuppMatch[1]?.trim() || "" } };
  }

  // 4. Low stock
  if (lower.includes("stok rendah") || lower.includes("stok menipis") || lower.includes("low stock")) {
    return { action: "get_low_stock", arguments: {} };
  }

  // 5. Get inventory / product stock
  const stockMatch = lower.match(/(?:cek\s+stok|stok|berapa\s+stok)\s*(.+)?/i);
  if (stockMatch) {
    return { action: "get_inventory", arguments: { product_name: stockMatch[1]?.trim() || "" } };
  }

  // 6. Update product price
  const updatePriceMatch = lower.match(/ubah\s+harga\s+(.+?)\s+jadi\s+(\d+)/i);
  if (updatePriceMatch) {
    return {
      action: "update_product",
      arguments: { name: updatePriceMatch[1].trim(), price: Number(updatePriceMatch[2]) },
    };
  }

  // 7. Get orders
  if (lower.includes("order") || lower.includes("pesanan")) {
    return { action: "get_orders", arguments: { limit: 5 } };
  }

  // 8. Get sales summary
  if (lower.includes("penjualan") || lower.includes("omset") || lower.includes("ringkasan bisnis")) {
    return { action: "get_sales_summary", arguments: { period: "today" } };
  }

  return { action: "unknown", arguments: {} };
}

// ── 5. TOOL EXECUTORS (TENANT ISOLATED) ──
async function executeTool(
  action: string,
  args: Record<string, unknown>,
  businessId: string,
  client = supabaseAdmin
): Promise<{ success: boolean; message: string }> {
  if (!ALLOWED_TOOLS.includes(action)) {
    return { success: false, message: "Fitur tersebut belum tersedia di BisnisSehat." };
  }

  switch (action) {
    case "get_supplier": {
      let query = client.from("suppliers").select("*").eq("business_id", businessId);
      if (args.name && typeof args.name === "string") {
        query = query.ilike("name", `%${args.name}%`);
      }
      const { data, error } = await query.order("name").limit(5);
      if (error) return { success: false, message: "Gagal mengambil data supplier." };
      if (!data || data.length === 0) {
        return { success: true, message: "Supplier tidak ditemukan." };
      }
      let out = "📋 <b>DATA SUPPLIER</b>\n";
      data.forEach((s: Record<string, unknown>) => {
        out += `\n👤 <b>${s.name}</b>`;
        if (s.company) out += `\n├─ Perusahaan: ${s.company}`;
        if (s.phone) out += `\n├─ Telepon: ${s.phone}`;
        out += `\n└─ Status: ${s.status || "Aktif"}\n`;
      });
      return { success: true, message: out.trim() };
    }

    case "create_supplier": {
      if (!args.name || typeof args.name !== "string") {
        return { success: false, message: "Nama supplier wajib diisi." };
      }
      const payload = {
        business_id: businessId,
        name: args.name.trim(),
        company: (args.company as string) || args.name.trim(),
        phone: (args.phone as string) || null,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await client.from("suppliers").insert(payload).select().single();
      if (error) return { success: false, message: "Gagal menambahkan supplier." };
      return { success: true, message: `✓ Supplier <b>${data.name}</b> berhasil ditambahkan.` };
    }

    case "delete_supplier": {
      if (!args.name || typeof args.name !== "string") {
        return { success: false, message: "Nama supplier wajib diisi untuk menghapus." };
      }
      const { data, error } = await client
        .from("suppliers")
        .delete()
        .eq("business_id", businessId)
        .ilike("name", `%${args.name.trim()}%`)
        .select();

      if (error || !data || data.length === 0) {
        return { success: false, message: `Supplier <b>${args.name}</b> tidak ditemukan.` };
      }
      return { success: true, message: `🗑️ Supplier <b>${args.name}</b> berhasil dihapus.` };
    }

    case "get_inventory":
    case "get_low_stock": {
      let query = client
        .from("inventory")
        .select("product_id, quantity, min_stock, products(id, name, business_id)")
        .order("quantity", { ascending: true })
        .limit(10);

      const { data, error } = await query;
      if (error) return { success: false, message: "Gagal mengambil data stok." };

      // Filter by tenant via products relation
      const tenantItems = (data || []).filter(
        (item: any) => item.products?.business_id === businessId
      );

      if (action === "get_low_stock") {
        const lowStock = tenantItems.filter((i: any) => (i.quantity || 0) <= (i.min_stock || 5));
        if (lowStock.length === 0) {
          return { success: true, message: "Semua stok barang dalam kondisi aman. Tidak ada stok rendah." };
        }
        let out = "⚠️ <b>PERINGATAN STOK RENDAH</b>\n";
        lowStock.forEach((i: any) => {
          out += `\n📦 <b>${i.products?.name || "Produk"}</b>: Sisa ${i.quantity} (Batas Min: ${i.min_stock || 5})`;
        });
        return { success: true, message: out.trim() };
      }

      if (tenantItems.length === 0) {
        return { success: true, message: "Data stok kosong atau produk belum terdaftar." };
      }

      let out = "📦 <b>STATUS STOK PRODUK</b>\n";
      tenantItems.forEach((i: any) => {
        const isLow = (i.quantity || 0) <= (i.min_stock || 5);
        out += `\n${isLow ? "⚠️" : "✓"} <b>${i.products?.name || "Produk"}</b>: ${i.quantity} unit`;
      });
      return { success: true, message: out.trim() };
    }

    case "get_orders": {
      const { data, error } = await client
        .from("orders")
        .select("id, total_amount, status, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(Number(args.limit) || 5);

      if (error) return { success: false, message: "Gagal mengambil daftar pesanan." };
      if (!data || data.length === 0) {
        return { success: true, message: "Belum ada pesanan terbaru." };
      }
      let out = "🛒 <b>PESANAN TERBARU</b>\n";
      data.forEach((o: any) => {
        const date = new Date(o.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        out += `\n#${String(o.id).slice(-4)} • Rp ${Number(o.total_amount || 0).toLocaleString("id-ID")} [${o.status}] (${date})`;
      });
      return { success: true, message: out.trim() };
    }

    case "get_sales_summary": {
      const { data, error } = await client
        .from("orders")
        .select("total_amount, status")
        .eq("business_id", businessId)
        .eq("status", "completed");

      if (error) return { success: false, message: "Gagal menghitung ringkasan penjualan." };
      const totalOmset = (data || []).reduce((acc: number, cur: any) => acc + Number(cur.total_amount || 0), 0);
      const totalOrders = (data || []).length;
      return {
        success: true,
        message: `💰 <b>RINGKASAN PENJUALAN TOKO</b>\n\n├─ Total Transaksi Selesai: <b>${totalOrders} order</b>\n└─ Total Pendapatan: <b>Rp ${totalOmset.toLocaleString("id-ID")}</b>`,
      };
    }

    default:
      return { success: true, message: "Perintah diterima dan sedang diproses oleh BisnisSehat." };
  }
}

// ── 6. AUDIT LOGGING HELPER ──
async function logAuditEvent(entry: {
  businessId: string;
  chatId: string;
  action: string;
  targetName?: string;
  success?: boolean;
}, client = supabaseAdmin) {
  const record = {
    business_id: entry.businessId,
    actor: "telegram",
    chat_id: String(entry.chatId || ""),
    action: entry.action,
    target_name: entry.targetName || null,
    success: entry.success ?? true,
    timestamp: new Date().toISOString(),
  };

  auditTrail.push(record);
  try {
    await client.from("audit_logs").insert(record);
  } catch {
    // In-memory fallback if audit_logs table isn't migrated
  }
  return record;
}

// ── 7. MAIN WEBHOOK HANDLER ──
export async function handleTelegramWebhook(req: Request, overrides: any = {}): Promise<Response> {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const client = overrides.supabaseAdmin || supabaseAdmin;
  const decryptFn = overrides.decrypt || decrypt;
  const fetchFn = overrides.fetchFn || fetch;

  try {
    const update = await req.json();

    if (!update || typeof update.update_id !== "number") {
      return errorResponse("Invalid Telegram update", 400);
    }

    const updateId = update.update_id;

    // 1. Idempotency Check
    const { data: existingUpdate } = await client
      .from("telegram_processed_updates")
      .select("update_id")
      .eq("update_id", updateId)
      .maybeSingle();

    if (existingUpdate) {
      return jsonResponse({ ok: true, status: "duplicate_ignored" });
    }

    await client.from("telegram_processed_updates").insert({ update_id: updateId });

    // 2. Extract Message
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) {
      return jsonResponse({ ok: true, status: "ignored_non_text" });
    }

    const text = msg.text.trim();
    const chatId = String(msg.chat?.id || "");
    const chatTitle =
      msg.chat?.title ||
      msg.chat?.username ||
      [msg.chat?.first_name, msg.chat?.last_name].filter(Boolean).join(" ") ||
      "Personal Chat";

    // 3. Pairing Code Flow: format BS-XXXXXX
    const pairingMatch = text.match(/BS-\d{6}/i);
    if (pairingMatch) {
      const code = pairingMatch[0].toUpperCase();
      const now = new Date().toISOString();

      const { data: tokenRecord, error: tokenErr } = await client
        .from("telegram_pairing_tokens")
        .select("*")
        .eq("pairing_code", code)
        .eq("is_used", false)
        .gt("expires_at", now)
        .maybeSingle();

      if (!tokenRecord || tokenErr) {
        return jsonResponse({
          ok: true,
          status: "pairing_code_invalid_or_expired",
        });
      }

      // Mark single-use token as consumed
      await client
        .from("telegram_pairing_tokens")
        .update({ is_used: true, used_at: now })
        .eq("id", tokenRecord.id);

      // Link chat to business
      const { data: botSettings } = await client
        .from("telegram_bot_settings")
        .update({
          chat_id: chatId,
          chat_title: chatTitle,
          is_connected: true,
          status: "connected",
          updated_at: now,
        })
        .eq("business_id", tokenRecord.business_id)
        .select("bot_token_encrypted, bot_token")
        .maybeSingle();

      let botToken = botSettings?.bot_token;
      if (botSettings?.bot_token_encrypted) {
        try {
          botToken = await decryptFn(botSettings.bot_token_encrypted);
        } catch (decErr) {
          console.error("[telegram-webhook] Failed decrypting bot token:", decErr);
        }
      }

      if (botToken) {
        const welcomeText =
          "🎉 <b>Selamat! Bot Terhubung dengan BisnisSehat.</b>\n\n" +
          "Akun Telegram Anda sekarang telah resmi terhubung sebagai penerima notifikasi operasional toko Anda.\n\n" +
          "Ketik <b>.menu</b> untuk melihat daftar perintah yang tersedia.";

        try {
          await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: welcomeText,
              parse_mode: "HTML",
            }),
          });
        } catch (fetchErr) {
          console.error("[telegram-webhook] Error sending welcome:", fetchErr);
        }
      }

      return jsonResponse({
        ok: true,
        status: "paired_successfully",
        business_id: tokenRecord.business_id,
      });
    }

    // 4. Resolve Trusted Business Connection
    const { data: botSettings } = await client
      .from("telegram_bot_settings")
      .select("business_id, bot_token_encrypted, bot_token, chat_id, is_connected")
      .eq("chat_id", chatId)
      .eq("is_connected", true)
      .maybeSingle();

    if (!botSettings || !botSettings.business_id) {
      return jsonResponse({
        ok: true,
        status: "unauthorized_chat",
        message: "Chat belum dipairing ke toko BisnisSehat.",
      });
    }

    const businessId = botSettings.business_id;

    // Resolve Bot Token
    let botToken = botSettings.bot_token;
    if (botSettings.bot_token_encrypted) {
      try {
        botToken = await decryptFn(botSettings.bot_token_encrypted);
      } catch {
        // Fallback
      }
    }

    // Helper for sending sanitized Telegram messages
    const sendReply = async (replyText: string) => {
      if (!botToken) return;
      try {
        await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
          }),
        });
      } catch (err: any) {
        const safeError = (err?.message || "").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[TOKEN]");
        console.error("[telegram-webhook] Send message error:", safeError);
      }
    };

    // 5. Rate Limiting (Max 20 requests/minute)
    const rateCheck = checkRateLimit(chatId, 20, 60000);
    if (!rateCheck.allowed) {
      const rateLimitMsg = "⏳ Terlalu banyak permintaan. Mohon tunggu beberapa saat sebelum mengirim perintah lagi.";
      await sendReply(rateLimitMsg);
      return jsonResponse({ ok: true, status: "rate_limited", reply: rateLimitMsg });
    }

    // 6. Monospace ASCII .menu Interception (Deterministic before LLM)
    if (text.toLowerCase() === ".menu" || text.toLowerCase() === "/menu") {
      await sendReply(ASCII_MENU);
      return jsonResponse({ ok: true, status: "menu_displayed", reply: ASCII_MENU });
    }

    // 7. Security & Threat Rejection
    if (isSecurityThreat(text)) {
      await sendReply(SECURITY_REJECTION_MESSAGE);
      return jsonResponse({ ok: true, status: "security_rejected", reply: SECURITY_REJECTION_MESSAGE });
    }

    // 8. Pending Confirmation Handling for Destructive Actions
    const pending = pendingConfirmations.get(chatId);
    if (pending && Date.now() <= pending.expiresAt) {
      const lower = text.toLowerCase();
      if (lower === "ya" || lower === "setuju" || lower === "ok" || lower === "lanjut") {
        pendingConfirmations.delete(chatId);
        const execResult = await executeTool(
          pending.action,
          { name: pending.targetName },
          pending.businessId,
          client
        );
        await logAuditEvent({
          businessId: pending.businessId,
          chatId,
          action: pending.action,
          targetName: pending.targetName || undefined,
          success: execResult.success,
        }, client);

        await sendReply(execResult.message);
        return jsonResponse({ ok: true, status: "confirmed_execution", reply: execResult.message });
      } else if (lower === "batal" || lower === "tidak" || lower === "cancel") {
        pendingConfirmations.delete(chatId);
        const cancelMsg = "❌ Aksi telah dibatalkan.";
        await sendReply(cancelMsg);
        return jsonResponse({ ok: true, status: "cancelled", reply: cancelMsg });
      }
    }

    // 9. Intent Resolution & LLM Endpoint Handling
    let intent: { action: string; arguments: Record<string, unknown> } | null = null;
    const llmEndpoint =
      typeof Deno !== "undefined"
        ? Deno.env.get("LLM_ENDPOINT_URL") || Deno.env.get("AI_OPERATOR_LLM_URL")
        : (overrides.llmEndpoint || null);

    if (llmEndpoint) {
      try {
        const llmRes = await fetchFn(llmEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });
        const llmData = await llmRes.json();
        if (llmData && llmData.action && ALLOWED_TOOLS.includes(llmData.action)) {
          intent = { action: llmData.action, arguments: llmData.arguments || {} };
        }
      } catch {
        // Fallback to deterministic intent parser
      }
    }

    if (!intent) {
      intent = fallbackIntentParser(text);
    }

    // 10. Handle Destructive Intent (Requires Confirmation)
    if (intent.action === "delete_supplier" && intent.arguments.name) {
      pendingConfirmations.set(chatId, {
        action: "delete_supplier",
        targetName: String(intent.arguments.name),
        businessId,
        expiresAt: Date.now() + 60000,
      });

      const confirmMsg = `⚠️ Apakah Anda yakin ingin menghapus supplier <b>${intent.arguments.name}</b>?\n\nBalas <b>YA</b> untuk konfirmasi atau <b>BATAL</b> untuk membatalkan (berlaku 60 detik).`;
      await sendReply(confirmMsg);
      return jsonResponse({ ok: true, status: "awaiting_confirmation", reply: confirmMsg });
    }

    // 11. Execute Allowlisted Tool
    if (intent.action !== "unknown") {
      const toolRes = await executeTool(intent.action, intent.arguments, businessId, client);
      await sendReply(toolRes.message);
      return jsonResponse({ ok: true, status: "tool_executed", action: intent.action, reply: toolRes.message });
    }

    // 12. Safe Guidance Response for Unknown Commands
    const guidanceMsg =
      "Saya belum memahami perintah tersebut.\n\nKetik <b>.menu</b> untuk melihat daftar perintah operasional yang tersedia atau coba:\n• \"cek stok kopi\"\n• \"cek pesanan\"\n• \"cek supplier\"";
    await sendReply(guidanceMsg);
    return jsonResponse({ ok: true, status: "guidance_sent", reply: guidanceMsg });
  } catch (err: any) {
    console.error("[telegram-webhook] Execution error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

// Deno Edge Runtime Auto-serve
if (typeof Deno !== "undefined" && (Deno as any).serve) {
  (Deno as any).serve(async (req: Request) => {
    return handleTelegramWebhook(req);
  });
}
