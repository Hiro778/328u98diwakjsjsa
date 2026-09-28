// _shared/auth.ts
// JWT verification and business ownership check for Edge Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseAdmin } from "./supabase-admin.ts";

export interface AuthContext {
  userId: string;
  businessId: string;
}

/**
 * Verify the JWT from the Authorization header and return auth context.
 * Throws on failure — callers should catch and return error response.
 */
export async function verifyAuth(req: Request, explicitBusinessId?: string | null): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    throw new Error("Missing token");
  }

  // Create a client with the user's JWT to verify it
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error("Invalid or expired token");
  }

  // 1. Authoritative account access enforcement
  const { data: profile, error: profError } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profError || !profile || profile.status !== "active") {
    throw new Error("Account access denied: Account is not active or has been suspended/banned");
  }

  // 2. Look up business ownership
  // Priority 1: Check explicit businessId or x-business-id header
  const targetBusinessId = explicitBusinessId || req.headers.get("x-business-id");

  if (targetBusinessId) {
    const { data: targetBiz, error: targetBizErr } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", targetBusinessId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!targetBizErr && targetBiz?.id) {
      return {
        userId: user.id,
        businessId: targetBiz.id,
      };
    }
  }

  // Priority 2: Safely query user's business without fragile .single()
  // Multi-business safe: never call .single() on queries that can legitimately return multiple businesses
  const { data: business, error: bizError } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bizError || !business) {
    throw new Error("No business found for this user");
  }

  return {
    userId: user.id,
    businessId: business.id,
  };
}

/**
 * Verify that a connection belongs to the authenticated user's business.
 */
export async function verifyConnectionOwnership(
  connectionId: string,
  businessId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("marketplace_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("business_id", businessId)
    .single();

  return !error && !!data;
}
