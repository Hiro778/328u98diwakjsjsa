// competitor-research/index.ts
// Research a competitor's digital presence using public sources
//
// POST body: { analysis_id: string, competitor_id: string, competitor_name: string, website?: string, location?: string, industry?: string }
// Returns: { status, progress, research_data, sources }
//
// Research flow:
// 1. Check cache first (7 day TTL)
// 2. If not cached: search web for public info
// 3. Fetch website content (if available)
// 4. Extract products, pricing, positioning
// 5. Find social media profiles
// 6. Store in cache with TTL

import { verifyAuth } from "../_shared/auth.ts";
import { isProUser } from "../_shared/entitlement.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { jsonResponse, errorResponse, corsResponse } from "../_shared/response.ts";
import { validateSafeUrl } from "../_shared/ssrf.ts";

// API Keys - optional, research works without them (returns limited data)
const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
const SERPER_API_URL = "https://google.serper.dev/search";
const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
const SERPAPI_URL = "https://serpapi.com/search";
const BROWSER_API_KEY = Deno.env.get("BROWSER_API_KEY");
const BROWSER_API_URL = "https://api.browserless.io/v1/content";
const OUGHT_API_KEY = Deno.env.get("OUGHT_API_KEY");
const OUGHT_API_URL = "https://api.ought.org/v1/extract";

// Maximum content to fetch from website (bytes)
const MAX_CONTENT_SIZE = 50000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const auth = await verifyAuth(req);

    // Enforce Pro entitlement server-side
    const hasPro = await isProUser(auth.userId);
    if (!hasPro) {
      return errorResponse("Fitur ini membutuhkan BisnisSehat Pro.", 403);
    }

    const { analysis_id, competitor_id, competitor_name, website, location, industry } =
      await req.json();

    if (!analysis_id || !competitor_id || !competitor_name) {
      return errorResponse("analysis_id, competitor_id, and competitor_name are required", 400);
    }

    // Verify analysis ownership
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from("competitor_analyses")
      .select("id, business_id, status")
      .eq("id", analysis_id)
      .single();

    if (analysisError || !analysis || analysis.business_id !== auth.businessId) {
      return errorResponse("Access denied or analysis not found", 403);
    }

    if (analysis.status !== "researching" && analysis.status !== "draft") {
      return errorResponse("Analysis is not in researching state", 400);
    }

    // 1. Check cache first
    const cacheResult = await supabaseAdmin.rpc("get_competitor_cache", {
      p_business_id: auth.businessId,
      p_competitor_name: competitor_name,
      p_website: website,
      p_location: location,
      p_industry: industry,
    });

    if (cacheResult.data && cacheResult.data !== '{}') {
      // Cache hit - update task status
      await supabaseAdmin.from("competitor_research_tasks").update({
        status: "cached",
        progress: 100,
        result_data: cacheResult.data,
        completed_at: new Date().toISOString(),
      }).eq("id", competitor_id);

      return jsonResponse({
        status: "cached",
        progress: 100,
        research_data: cacheResult.data,
        message: "Loaded from cache (within 7 day TTL)",
      });
    }

    // 2. Initialize research task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("competitor_research_tasks")
      .insert({
        analysis_id,
        competitor_id,
        competitor_name,
        website: website || null,
        status: "researching",
        progress: 10,
      })
      .select()
      .single();

    if (taskError) {
      return errorResponse(`Failed to create research task: ${taskError.message}`, 500);
    }

    const researchData: any = {
      competitor_name,
      website: website || null,
      location: location || null,
      industry: industry || null,
      researched_at: new Date().toISOString(),
      sources: [],
      products: [],
      pricing: {},
      positioning: {},
      digital_presence: {},
      summary: "",
      strengths: [],
      weaknesses: [],
    };

    const sources: any[] = [];

    // 3. Search web for competitor info (if SERPER_API_KEY available)
    let webSearchResults: any[] = [];
    if (SERPER_API_KEY && website) {
      try {
        const searchResponse = await fetch(`${SERPER_API_URL}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": SERPER_API_KEY,
          },
          body: JSON.stringify({
            q: `${competitor_name} ${website} ${industry || ""} ${location || ""}`,
            num: 10,
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          webSearchResults = searchData.organic || [];
          sources.push({
            type: "web_search",
            engine: "serper",
            query: `${competitor_name} ${website}`,
            results_count: webSearchResults.length,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("[competitor-research] Web search error:", err);
        // Continue without web search
      }
    }

    // 4. Try to fetch website content (if SERPAPI_KEY available)
    let websiteContent: string | null = null;
    if (website && (SERPAPI_KEY || BROWSER_API_KEY)) {
      const urlCheck = validateSafeUrl(website);
      if (!urlCheck.safe) {
        console.warn("[competitor-research] Blocked potentially dangerous URL:", website, urlCheck.error);
      } else {
        try {
        const cleanWebsite = website.replace(/^https?:\/\//, "").replace(/\/$/, "");
        const domain = cleanWebsite.split("/")[0];

        // Use SerpAPI website scraper if available
        if (SERPAPI_KEY) {
          try {
            const scrapedResponse = await fetch(`${SERPAPI_URL}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                api_key: SERPAPI_KEY,
                engine: "website_scraper",
                url: website,
                num: 10,
              }),
            });

            if (scrapedResponse.ok) {
              const scrapeData = await scrapedResponse.json();
              websiteContent = scrapeData.content || null;
              if (websiteContent) {
                sources.push({
                  type: "website_scrape",
                  engine: "serpapi",
                  url: website,
                  content_length: websiteContent.length,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (err) {
            console.error("[competitor-research] SerpAPI scrape error:", err);
          }
        }

        // Fallback to Browserless
        if (!websiteContent && BROWSER_API_KEY && BROWSER_API_URL) {
          try {
            const browserResponse = await fetch(`${BROWSER_API_URL}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
                "x-api-key": BROWSER_API_KEY,
              },
              body: JSON.stringify({
                url: website,
                element: "body",
                removeElements: "script,noscript,iframe,svg,canvas,svg",
              }),
            });

            if (browserResponse.ok) {
              const browserData = await browserResponse.text();
              websiteContent = browserData.substring(0, MAX_CONTENT_SIZE);
              if (websiteContent) {
                sources.push({
                  type: "website_scrape",
                  engine: "browserless",
                  url: website,
                  content_length: websiteContent.length,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (err) {
            console.error("[competitor-research] Browserless error:", err);
          }
        }
      } catch (err) {
        console.error("[competitor-research] Website fetch error:", err);
      }
      }
    }

    // 5. Extract information from available data
    const extracted = extractCompetitorInfo(
      competitor_name,
      website,
      websiteContent,
      webSearchResults
    );

    researchData.products = extracted.products;
    researchData.pricing = extracted.pricing;
    researchData.positioning = extracted.positioning;
    researchData.digital_presence = extracted.digitalPresence;
    researchData.summary = extracted.summary;
    researchData.strengths = extracted.strengths;
    researchData.weaknesses = extracted.weaknesses;

    researchData.sources = sources;

    // 6. Update task progress
    await supabaseAdmin.from("competitor_research_tasks").update({
      progress: 80,
      status: "researching",
    }).eq("id", competitor_id);

    // 7. Save to cache
    const cacheInsert = await supabaseAdmin
      .from("competitor_research_cache")
      .insert({
        business_id: auth.businessId,
        competitor_name,
        website: website || null,
        location: location || null,
        industry: industry || null,
        research_data: researchData,
        sources: sources,
      })
      .select()
      .single();

    if (cacheInsert.error) {
      console.error("[competitor-research] Cache insert error:", cacheInsert.error);
      // Continue anyway
    }

    // 8. Update task as complete
    await supabaseAdmin.from("competitor_research_tasks").update({
      status: "completed",
      progress: 100,
      result_data: researchData,
      completed_at: new Date().toISOString(),
    }).eq("id", competitor_id);

    // 9. Update analysis status if all tasks complete
    await checkAnalysisCompletion(analysis_id);

    return jsonResponse({
      status: "completed",
      progress: 100,
      research_data: researchData,
      message: "Research completed",
    });

  } catch (error: any) {
    console.error("[competitor-research] Error:", error);
    if (error.message?.includes("Authorization") || error.message?.includes("token")) {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse(error.message || "Internal server error", 500);
  }
});

// ============================================================
// INFO EXTRACTION (Basic pattern matching)
// ============================================================

function extractCompetitorInfo(
  name: string,
  website: string | null,
  content: string | null,
  searchResults: any[]
) {
  const products: any[] = [];
  const pricing: any = {};
  const positioning: any = {};
  const digitalPresence: any = {};
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Extract from search results
  if (searchResults && searchResults.length > 0) {
    const topResult = searchResults[0];
    if (topResult.title) {
      strengths.push(`Recognized online presence with ${topResult.title}`);
    }
    if (topResult.snippet) {
      const summaryMatch = topResult.snippet.match(/(?:products?|services?|offer|provide)[:\s]*(.+?)(?:\.|$)/i);
      if (summaryMatch) {
        const productText = summaryMatch[1];
        const potentialProducts = productText.split(/[;,]/).map((p: string) => p.trim()).filter(Boolean);
        products.push(...potentialProducts.slice(0, 5));
      }
    }
  }

  // Extract from website content
  if (content) {
    // Find product mentions
    const productPatterns = [
      /product[s]?\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi,
      /(?:our|our main|primary) (?:products?|services?|offerings?)[:\s]*(.+?)(?:\.|$)/gi,
    ];

    for (const pattern of productPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const clean = match.replace(/[^A-Za-z0-9\s\-]/g, "").trim();
          if (clean.length > 5 && clean.length < 100) {
            products.push(clean);
          }
        });
      }
    }

    // Pricing extraction - only use exact pricing if explicit, never fabricate or multiply ranges
    if (content.includes(" Rp ") || content.includes("Rp.") || content.includes("IDR")) {
      pricing.clues_found = true;
      pricing.price_range = "Informasi harga spesifik memerlukan penelusuran katalog langsung.";
    } else {
      pricing.price_range = "Tidak tersedia dari sumber yang terhubung.";
    }

    // Extract positioning keywords
    const positioningKeywords = ["premium", "budget", "affordable", "luxury", "quality", "value", "best", "top"];
    const foundKeywords = positioningKeywords.filter((k) =>
      new RegExp(k, "i").test(content)
    );
    if (foundKeywords.length > 0) {
      positioning.target_audience = foundKeywords.slice(0, 3).join(", ");
      positioning.positioning = foundKeywords.slice(0, 2).join(" & ");
    }
  }

  // Try to find social media
  if (website) {
    const domain = website.toLowerCase();
    if (domain.includes("instagram")) digitalPresence.instagram = website;
    if (domain.includes("facebook")) digitalPresence.facebook = website;
    if (domain.includes("tiktok")) digitalPresence.tiktok = website;
    if (domain.includes("twitter") || domain.includes("x.com")) digitalPresence.twitter = website;
    if (domain.includes("linkedin")) digitalPresence.linkedin = website;
  }

  // Summary based on available data
  const hasSocial = Object.keys(digitalPresence).length > 0;
  const hasProducts = products.length > 0;

  if (hasProducts) {
    strengths.push(`Active online presence with visible product portfolio`);
  }
  if (hasSocial) {
    strengths.push(`Engaged on social media platforms`);
  }
  if (!hasSocial && !hasProducts) {
    weaknesses.push(`Limited public digital footprint`);
  }

  // Generate summary
  let summary = `${name}`;
  if (website) summary += ` operates at ${website}`;
  if (positioning.target_audience) summary += `, targeting ${positioning.target_audience}`;
  summary += `. ${products.length > 0 ? `Offers ${products.length}+ product categories.` : `Digital presence information not fully available.`}`;

  return {
    products: [...new Set(products)].slice(0, 10),
    pricing: pricing || { unavailable: true },
    positioning: positioning || { unavailable: true },
    digital_presence: digitalPresence,
    summary,
    strengths: [...new Set(strengths)],
    weaknesses: [...new Set(weaknesses)],
  };
}

async function checkAnalysisCompletion(analysisId: string) {
  // Check if all research tasks are complete
  const { data: tasks } = await supabaseAdmin
    .from("competitor_research_tasks")
    .select("status")
    .eq("analysis_id", analysisId);

  if (tasks && tasks.length > 0) {
    const allComplete = tasks.every((t: any) => ["completed", "cached", "failed"].includes(t.status));
    if (allComplete) {
      await supabaseAdmin.from("competitor_analyses").update({
        status: "analyzing",
        started_at: new Date().toISOString(),
      }).eq("id", analysisId);
    }
  }
}
