// Temporary diagnostic function for Google Vision API.
// DELETE after diagnosis.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");

  // Step 1: Check if key exists
  if (!apiKey) {
    return new Response(JSON.stringify({
      step: "key_check",
      result: "FAIL",
      error: "GOOGLE_CLOUD_VISION_API_KEY not set in Edge Function secrets"
    }, null, 2), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // Step 2: Test with a simple public image (Google logo)
  const testImageUrl = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png";

  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: testImageUrl } },
            features: [{ type: "WEB_DETECTION", maxResults: 5 }],
          }],
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const status = visionRes.status;
    const bodyText = await visionRes.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch { /* not JSON */ }

    // Sanitize: never return the key
    return new Response(JSON.stringify({
      step: "vision_api_test",
      httpStatus: status,
      ok: visionRes.ok,
      responseBody: bodyJson || bodyText,
      keyExists: true,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      step: "vision_api_test",
      result: "EXCEPTION",
      error: e instanceof Error ? e.message : String(e),
      keyExists: true,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
