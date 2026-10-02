// _shared/entitlement.ts
// Server-side Pro entitlement verification for Edge Functions.
// Conforms strictly to lock.md specifications.

import { supabaseAdmin } from "./supabase-admin.ts";

/**
 * Check whether a user has an active BisnisSehat Pro subscription.
 * Verifies profile_id, plan = 'pro', status = 'active', and expires_at > now().
 */
export async function isProUser(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, plan, expires_at, is_cancelled")
      .eq("profile_id", userId)
      .eq("plan", "pro")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error || !sub || (sub as any).is_cancelled === true) {
      return false;
    }
    return true;
  } catch (err) {
    console.error("[entitlement] Error checking user Pro status:", err);
    return false;
  }
}

/**
 * Check whether a business has an active Pro subscription via its owner.
 */
export async function isBusinessPro(businessId: string): Promise<boolean> {
  if (!businessId) return false;

  try {
    const { data: isPro, error } = await supabaseAdmin.rpc(
      "is_business_pro_active",
      { p_business_id: businessId }
    );

    if (!error && typeof isPro === "boolean") {
      return isPro;
    }

    // Fallback if RPC not yet reloaded: query direct via business owner
    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .single();

    if (!business?.owner_id) return false;
    return await isProUser(business.owner_id);
  } catch (err) {
    console.error("[entitlement] Error checking business Pro status:", err);
    return false;
  }
}

/**
 * Check whether platform-wide AI features are enabled (@ban.md).
 */
export async function isAIFeaturesEnabled(): Promise<boolean> {
  try {
    const { data: setting, error } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "enable_ai_features")
      .maybeSingle();

    if (!error && setting && setting.value === false) {
      return false;
    }
    return true;
  } catch (err) {
    console.error("[entitlement] Error checking AI features flag:", err);
    return true;
  }
}

