// google-business-disconnect/index.ts
// Disconnect Google Business Profile: revoke token, delete credentials.
// POST: Revoke OAuth access and remove stored connection data.

import { verifyAuth } from "../../_shared/auth.ts";
import { isProUser } from "../../_shared/entitlement.ts";
import { supabaseAdmin } from "../../_shared/supabase-admin.ts";
import { decrypt } from "../../_shared/crypto.ts";
import {
  jsonResponse,
  errorResponse,
  corsResponse,
} from "../../_shared/response.ts";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    // Get connection
    const { data: connection } = await supabaseAdmin
      .from("google_business_connections")
      .select("id, refresh_token_encrypted")
      .eq("business_id", auth.businessId)
      .single();

    if (!connection) {
      return jsonResponse({
        data: {
          success: true,
          message: "Tidak ada koneksi aktif.",
        },
      });
    }

    // 1. Try to revoke the refresh token with Google
    if (connection.refresh_token_encrypted) {
      try {
        const refreshToken = await decrypt(connection.refresh_token_encrypted);

        const revokeResponse = await fetch(
          `${GOOGLE_REVOKE_URL}?token=${refreshToken}`,
          { method: "POST" }
        );

        // Google returns 200 on success, 400 if token already revoked
        // Either way, we proceed with cleanup
        if (!revokeResponse.ok && revokeResponse.status !== 400) {
          console.error(
            "[google-business-disconnect] Revoke warning:",
            revokeResponse.status
          );
        }
      } catch (revokeErr) {
        // Revocation failed (maybe token already invalid) — proceed with cleanup
        console.error("[google-business-disconnect] Revoke error:", revokeErr);
      }
    }

    // 2. Delete locations (cascade will handle this, but explicit for clarity)
    await supabaseAdmin
      .from("google_business_locations")
      .delete()
      .eq("connection_id", connection.id);

    // 3. Delete connection (this also deletes encrypted token)
    await supabaseAdmin
      .from("google_business_connections")
      .delete()
      .eq("id", connection.id)
      .eq("business_id", auth.businessId);

    return jsonResponse({
      data: {
        success: true,
        message: "Google Business Profile telah diputuskan.",
      },
    });
  } catch (err) {
    console.error("[google-business-disconnect] Error:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      500
    );
  }
});
