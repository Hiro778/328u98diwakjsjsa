// _shared/platform-settings.ts
// Server-side platform settings enforcement for Edge Functions (@ban.md)
//
// Reads enable_ai_features from platform_settings using service_role client.
// Must be called BEFORE any AI provider (Gemini/OpenAI) is invoked.
// If false → reject immediately. Provider key is never exposed to client.

import { supabaseAdmin } from "./supabase-admin.ts";

/**
 * Enforce enable_ai_features platform flag.
 * Returns null if allowed, or an error message string if blocked.
 *
 * Usage:
 *   const blocked = await enforceAiFeatureFlag();
 *   if (blocked) return errorResponse(blocked, 503);
 */
export async function enforceAiFeatureFlag(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "enable_ai_features")
    .single();

  // If the key doesn't exist or query fails, default to allowed (safe default for availability).
  // Missing key means setting was never explicitly disabled.
  if (error || !data) {
    return null;
  }

  // value is stored as jsonb. Cast raw value to boolean.
  // Supabase returns jsonb primitive booleans as JS booleans.
  const enabled =
    typeof data.value === "boolean"
      ? data.value
      : data.value === "true" || data.value === true;

  if (enabled === false) {
    return "AI_FEATURES_DISABLED: Fitur AI sedang dinonaktifkan sementara oleh administrator platform. Silakan coba lagi nanti.";
  }

  return null;
}
