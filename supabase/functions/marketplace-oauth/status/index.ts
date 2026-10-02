// marketplace-oauth/status/index.ts
// Check OAuth configuration status for each marketplace.
//
// GET: Returns which marketplaces have credentials configured and are ready for OAuth.

import { verifyAuth } from "../../_shared/auth.ts";
import { isProUser } from "../../_shared/entitlement.ts";
import { getProvider, getSupportedMarketplaces } from "../../_shared/marketplace-provider.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    // 1. Verify authentication
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side (sec.md)
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // 2. Check each marketplace's configuration status
    const marketplaces = getSupportedMarketplaces();
    const statusMap: Record<string, { configured: boolean; name: string }> = {};

    for (const key of marketplaces) {
      try {
        const provider = getProvider(key);
        statusMap[key] = {
          configured: provider.isConfigured(),
          name: provider.name,
        };
      } catch {
        statusMap[key] = {
          configured: false,
          name: key,
        };
      }
    }

    // 3. Return status (no credentials exposed)
    return jsonResponse({
      data: {
        marketplaces: statusMap,
        all_configured: Object.values(statusMap).every((m) => m.configured),
      },
    });
  } catch (err) {
    console.error("[marketplace-oauth/status] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
