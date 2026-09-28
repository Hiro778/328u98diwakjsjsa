// competitor-analyze/index.ts
// Analyze compiled competitor research and generate strategic insights
//
// POST body: { analysis_id: string }
// Returns: { status, analysis_data, summary, insights, recommendations }
//
// AI analysis flow:
// 1. Compile all research data from competitor_research_tasks
// 2. Call LLM (Gemini Flash-Lite) with structured research data
// 3. Parse structured JSON response
// 4. Store analysis_data in competitor_analyses
// 5. Update analysis status to completed

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { enforceAiFeatureFlag } from "../_shared/platform-settings.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// Required analysis fields for schema validation
const REQUIRED_ANALYSIS_FIELDS = [
  "executive_summary",
  "competitor_comparison",
  "positioning_analysis",
  "product_analysis",
  "digital_presence_analysis",
  "observed_strengths",
  "observed_weaknesses",
  "market_opportunities",
  "strategic_recommendations",
  "data_sources",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // @ban.md item 6: enforce enable_ai_features platform flag BEFORE calling AI provider
    const aiBlocked = await enforceAiFeatureFlag();
    if (aiBlocked) {
      return errorResponse(aiBlocked, 503);
    }

    // Enforce Pro entitlement server-side
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    const { analysis_id } = await req.json();

    if (!analysis_id) {
      return errorResponse("analysis_id is required", 400);
    }

    // Verify analysis ownership
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from("competitor_analyses")
      .select("id, business_id, title, status, research_data")
      .eq("id", analysis_id)
      .single();

    if (analysisError || !analysis || analysis.business_id !== auth.businessId) {
      return errorResponse("Access denied or analysis not found", 403);
    }

    if (analysis.status !== "analyzing") {
      return errorResponse("Analysis must be in analyzing state", 400);
    }

    // Compile research data from all competitors
    const { data: tasks } = await supabaseAdmin
      .from("competitor_research_tasks")
      .select("competitor_name, website, status, result_data")
      .eq("analysis_id", analysis_id);

    const researchData: any = {};
    const sources: any[] = [];

    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        researchData[task.competitor_name] = task.result_data || {};
        if (task.result_data && task.result_data.sources) {
          sources.push(...task.result_data.sources);
        }
      }
    }

    // Build analysis prompt
    const prompt = `You are a market research analyst. Analyze the following competitor data and generate strategic insights.

COMPETITOR RESEARCH DATA:
${JSON.stringify(researchData, null, 2)}

TASK: Generate a comprehensive competitor analysis report with the following sections:

1. EXECUTIVE SUMMARY
   - Brief overview of the competitive landscape
   - Key takeaways from the research
   - Overall market positioning

2. COMPETITOR COMPARISON TABLE
   - Create a markdown table comparing competitors
   - Columns: Competitor, Positioning, Key Products, Pricing, Digital Presence
   - Use "Tidak tersedia" for missing data

3. POSITIONING ANALYSIS
   - How each competitor positions itself
   - Target audience for each
   - Value proposition

4. PRODUCT ANALYSIS
   - Main products/services offered
   - Product range breadth
   - Unique differentiators

5. DIGITAL PRESENCE ANALYSIS
   - Website quality
   - Social media engagement
   - Online visibility

6. OBSERVED STRENGTHS (factual, from data)
   - List concrete observed strengths
   - Source each observation

7. OBSERVED WEAKNESSES (factual, from data)
   - List concrete observed weaknesses
   - Source each observation

8. MARKET OPPORTUNITIES
   - Gaps you can exploit
   - Unmet customer needs
   - Market gaps

9. STRATEGIC RECOMMENDATIONS
   - Actionable marketing recommendations
   - Product positioning suggestions
   - Digital strategy suggestions

OUTPUT REQUIREMENTS:
1. Return ONLY a valid JSON object with exact schema
2. Separate OBSERVED facts from ANALYSIS/INFERENCES
3. For each claim, include DATA SOURCE reference
4. Use "Tidak tersedia" for missing information
5. Do NOT invent data - say "Data tidak tersedia" if unknown

JSON SCHEMA:
{
  "executive_summary": {
    "overview": "string",
    "key_takeaways": "string[]"
  },
  "competitor_comparison": {
    "columns": "string[]",
    "rows": [
      {
        "competitor": "string",
        "positioning": "string",
        "key_products": "string",
        "pricing": "string",
        "digital_presence": "string"
      }
    ]
  },
  "positioning_analysis": {
    "by_competitor": {
      "[competitor_name]": {
        "target_audience": "string",
        "positioning": "string",
        "value_proposition": "string"
      }
    }
  },
  "product_analysis": {
    "summary": "string",
    "product_categories": "string[]",
    "unique_differentiators": "string[]"
  },
  "digital_presence_analysis": {
    "website_quality": "string",
    "social_media_coverage": {
      "instagram": "present|absent|unknown",
      "tiktok": "present|absent|unknown",
      "facebook": "present|absent|unknown",
      "twitter": "present|absent|unknown",
      "linkedin": "present|absent|unknown"
    },
    "online_visibility": "string"
  },
  "observed_strengths": [
    {
      "finding": "string",
      "source": "string"
    }
  ],
  "observed_weaknesses": [
    {
      "finding": "string",
      "source": "string"
    }
  ],
  "market_opportunities": [
    {
      "opportunity": "string",
      "evidence": "string"
    }
  ],
  "strategic_recommendations": [
    {
      "recommendation": "string",
      "rationale": "string",
      "expected_impact": "string"
    }
  ],
  "data_sources": {
    "websites_scraped": "string[]",
    "social_media_found": "string[]",
    "search_engines_used": "string[]",
    "research_timestamp": "string"
  }
}

Generate the analysis JSON now.`;

    // Call LLM
    let llmResponse: string;
    let providerCostUsd = 0;

    try {
      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      llmResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!llmResponse) {
        throw new Error("Empty response from Gemini API");
      }

      // Calculate provider cost
      const inputTokens = prompt.length / 4;
      const outputTokens = llmResponse.length / 4;
      providerCostUsd = (inputTokens * 0.1 + outputTokens * 0.4) / 1_000_000;

    } catch (llmError: any) {
      console.error("[competitor-analyze] LLM error:", llmError);

      await supabaseAdmin.from("competitor_analyses").update({
        status: "failed",
        error_message: llmError.message || "Analysis failed",
        completed_at: new Date().toISOString(),
      }).eq("id", analysis_id);

      return errorResponse(`Analysis failed: ${llmError.message}`, 500);
    }

    // Parse LLM response
    let analysisData: any;
    try {
      let jsonStr = llmResponse;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      analysisData = JSON.parse(jsonStr.trim());
    } catch (parseError: any) {
      console.error("[competitor-analyze] JSON parse error:", parseError);

      await supabaseAdmin.from("competitor_analyses").update({
        status: "failed",
        error_message: "Invalid JSON response from LLM",
        completed_at: new Date().toISOString(),
      }).eq("id", analysis_id);

      return errorResponse("Analysis failed: Invalid response format", 500);
    }

    // Validate required fields
    const missingFields = REQUIRED_ANALYSIS_FIELDS.filter(
      (field) => !(field in analysisData)
    );
    if (missingFields.length > 0) {
      console.warn("[competitor-analyze] Missing fields:", missingFields);
    }

    // Ensure data_sources timestamp
    analysisData.data_sources = analysisData.data_sources || {
      research_timestamp: new Date().toISOString(),
    };
    analysisData.data_sources.research_timestamp = new Date().toISOString();

    // Save to database
    const { error: updateError } = await supabaseAdmin
      .from("competitor_analyses")
      .update({
        status: "completed",
        analysis_data: analysisData,
        sources: sources,
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysis_id);

    if (updateError) {
      console.error("[competitor-analyze] Database update error:", updateError);
    }

    // Return result
    return jsonResponse({
      status: "completed",
      analysis_id: analysis_id,
      analysis_data: analysisData,
      summary: analysisData.executive_summary || null,
      insights: {
        strengths: analysisData.observed_strengths || [],
        weaknesses: analysisData.observed_weaknesses || [],
        opportunities: analysisData.market_opportunities || [],
      },
      recommendations: analysisData.strategic_recommendations || [],
      provider_cost_usd: providerCostUsd,
    });

  } catch (error: any) {
    console.error("[competitor-analyze] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});
