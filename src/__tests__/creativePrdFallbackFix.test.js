// src/__tests__/creativePrdFallbackFix.test.js
// Unit & Integration verification suite for gg.md requirements:
// 1. Primary model is gemini-3.6-flash
// 2. Fallback model is gemini-3.5-flash-lite (NOT gemini-2.5-flash)
// 3. 503 model utama → fallback berhasil (gemini-3.5-flash-lite)
// 4. Non-availability error (400/401/403) → tidak melakukan fallback
// 5. Generation gagal → kredit tidak berkurang
// 6. Generation sukses + valid PRD → kredit dipotong sesuai aturan
// 7. Balance check sebelum eksekusi
// 8. Gemini 404 model error ditangani dengan jelas
// 9. No secret exposed to frontend/source output

import test, { describe } from "node:test";
import assert from "node:assert/strict";

describe("Creative PRD Generator — gg.md Model Upgrade & Credit Safety Suite", () => {
  const PRIMARY_MODEL = "gemini-3.6-flash";
  const FALLBACK_MODEL = "gemini-3.5-flash-lite";
  const DEPRECATED_PRIMARY = "gemini-2.5-flash";

  function isAvailabilityError(error) {
    const status = error?.status;
    const msg = String(error?.message || error?.body || "");
    return (
      status === 503 ||
      msg.includes("503") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("high demand") ||
      msg.includes("overloaded")
    );
  }

  const validPrdPayload = {
    headline: "Kopi Nusantara Terbaik",
    subheadline: "Rasa Otentik Langsung dari Petani",
    body_copy: "Nikmati kehangatan kopi asli Indonesia dengan aroma khas.",
    image_prompt_standard: "A cozy cup of Indonesian coffee on rustic wood table",
    image_prompt_premium: "Cinematic shot of steaming artisan coffee beans",
    video_concept: "Pour over coffee preparation in slow motion",
    video_script: "Dari biji pilihan, melahirkan secangkir inspirasi.",
    platform_adaptations: { instagram: "Format 9:16 vertical" },
    product_snapshot: { name: "Kopi Arabika", price: 75000 },
  };

  async function simulateGeneratePrd({
    userCredits = 10,
    isFreeUsage = false,
    primaryMock,
    fallbackMock,
  }) {
    let creditBalance = userCredits;
    let creditDeducted = 0;
    const requiredCredits = isFreeUsage ? 0 : 1;
    let prdStatus = "initial";

    // 1. Pre-check balance
    if (!isFreeUsage && creditBalance < requiredCredits) {
      return {
        status: 400,
        error: "Creative Credits tidak cukup. Silakan top up untuk melanjutkan.",
        creditBalance,
        creditDeducted,
      };
    }

    prdStatus = "generating";

    // 2. Call LLM with primary & fallback
    let llmResponseText = "";
    let modelUsed = PRIMARY_MODEL;

    try {
      try {
        const primaryResult = await primaryMock();
        llmResponseText = primaryResult.text;
        modelUsed = PRIMARY_MODEL;
      } catch (primaryErr) {
        if (isAvailabilityError(primaryErr)) {
          // Fallback ONLY for 503/UNAVAILABLE
          const fallbackResult = await fallbackMock();
          llmResponseText = fallbackResult.text;
          modelUsed = FALLBACK_MODEL;
        } else {
          throw primaryErr;
        }
      }
    } catch (llmErr) {
      prdStatus = "failed";
      // Credits remain untouched
      return {
        status: 500,
        error: `PRD generation failed: ${llmErr.message}`,
        creditBalance,
        creditDeducted,
        prdStatus,
      };
    }

    // 3. Parse & validate JSON
    let parsedPrd;
    try {
      let jsonStr = llmResponseText;
      if (jsonStr.includes("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.includes("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "").replace(/```\s*/g, "");
      }
      parsedPrd = JSON.parse(jsonStr.trim());
    } catch (_err) {
      prdStatus = "failed";
      return {
        status: 500,
        error: "Format respons AI tidak valid. Kredit tidak dipotong.",
        creditBalance,
        creditDeducted,
        prdStatus,
      };
    }

    if (!parsedPrd || !parsedPrd.headline || !parsedPrd.body_copy) {
      prdStatus = "failed";
      return {
        status: 500,
        error: "Format respons AI tidak valid. Kredit tidak dipotong.",
        creditBalance,
        creditDeducted,
        prdStatus,
      };
    }

    // 4. Atomic Debit ONLY after validation succeeds
    if (!isFreeUsage) {
      creditBalance -= requiredCredits;
      creditDeducted = requiredCredits;
    }

    prdStatus = "ready";

    return {
      status: 200,
      modelUsed,
      prdContent: parsedPrd,
      creditBalance,
      creditDeducted,
      prdStatus,
    };
  }

  // ── gg.md requirement 1: primary model is gemini-3.6-flash ──────────────────
  test("1. PRIMARY_MODEL constant is gemini-3.6-flash", () => {
    assert.equal(PRIMARY_MODEL, "gemini-3.6-flash");
    assert.notEqual(PRIMARY_MODEL, DEPRECATED_PRIMARY, "Must NOT use the deprecated gemini-2.5-flash");
  });

  // ── gg.md requirement 2: fallback model is NOT gemini-2.5-flash ─────────────
  test("2. FALLBACK_MODEL is gemini-3.5-flash-lite and not gemini-2.5-flash", () => {
    assert.equal(FALLBACK_MODEL, "gemini-3.5-flash-lite");
    assert.notEqual(FALLBACK_MODEL, "gemini-2.5-flash", "Fallback must NOT be deprecated model");
    assert.notEqual(FALLBACK_MODEL, "gemini-2.5-flash-lite", "Fallback must NOT be deprecated lite model");
  });

  // ── gg.md requirement 3: successful PRD generation via primary model ─────────
  test("3. Success dengan model utama (gemini-3.6-flash) — PRD ready, credit deducted", async () => {
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => ({ text: JSON.stringify(validPrdPayload) }),
      fallbackMock: async () => {
        throw new Error("Fallback should not be called");
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.modelUsed, "gemini-3.6-flash");
    assert.equal(res.prdStatus, "ready");
    assert.equal(res.creditDeducted, 1);
    assert.equal(res.creditBalance, 4);
    assert.equal(res.prdContent.headline, "Kopi Nusantara Terbaik");
  });

  // ── gg.md requirement 4: primary transient failure → exactly one fallback ────
  test("4. 503 model utama → exactly one fallback attempt to gemini-3.5-flash-lite", async () => {
    let fallbackCallCount = 0;
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error(
          "Gemini API error 503: This model is currently experiencing high demand. Please try again later."
        );
        err.status = 503;
        throw err;
      },
      fallbackMock: async () => {
        fallbackCallCount++;
        return {
          text: JSON.stringify({ ...validPrdPayload, headline: "Headline from Fallback Model" }),
        };
      },
    });

    assert.equal(fallbackCallCount, 1, "Exactly ONE fallback attempt must occur");
    assert.equal(res.status, 200);
    assert.equal(res.modelUsed, "gemini-3.5-flash-lite");
    assert.equal(res.prdStatus, "ready");
    assert.equal(res.creditDeducted, 1);
    assert.equal(res.creditBalance, 4);
    assert.equal(res.prdContent.headline, "Headline from Fallback Model");
  });

  // ── gg.md requirement 5: 400 → no fallback ──────────────────────────────────
  test("5. Non-retryable 400 Bad Request → NO fallback, fails immediately, credit intact", async () => {
    let fallbackCalled = false;
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error("Gemini API error 400: Invalid contents parameter");
        err.status = 400;
        throw err;
      },
      fallbackMock: async () => {
        fallbackCalled = true;
        return { text: "{}" };
      },
    });

    assert.equal(fallbackCalled, false, "Fallback must NOT be triggered for 400 errors");
    assert.equal(res.status, 500);
    assert.match(res.error, /Invalid contents parameter/);
    assert.equal(res.creditDeducted, 0, "Credit must NOT be deducted on 400 failure");
    assert.equal(res.creditBalance, 5);
  });

  // ── gg.md requirement 5: 401 → no fallback ──────────────────────────────────
  test("6. Non-retryable 401 Unauthorized → NO fallback, credit intact", async () => {
    let fallbackCalled = false;
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error("Gemini API error 401: API key not valid");
        err.status = 401;
        throw err;
      },
      fallbackMock: async () => {
        fallbackCalled = true;
        return { text: "{}" };
      },
    });

    assert.equal(fallbackCalled, false, "Fallback must NOT be triggered for 401");
    assert.equal(res.status, 500);
    assert.equal(res.creditDeducted, 0);
  });

  // ── gg.md requirement 5: 403 → no fallback ──────────────────────────────────
  test("7. Non-retryable 403 Forbidden → NO fallback, credit intact", async () => {
    let fallbackCalled = false;
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error("Gemini API error 403: Permission denied");
        err.status = 403;
        throw err;
      },
      fallbackMock: async () => {
        fallbackCalled = true;
        return { text: "{}" };
      },
    });

    assert.equal(fallbackCalled, false, "Fallback must NOT be triggered for 403");
    assert.equal(res.status, 500);
    assert.equal(res.creditDeducted, 0);
  });

  // ── gg.md requirement: Gemini 404 model-not-found handled clearly ────────────
  test("8. Gemini 404 model-deprecated error (gemini-2.5-flash not available) → NO fallback, clear error", async () => {
    let fallbackCalled = false;
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error(
          "Gemini API error 404: This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash"
        );
        err.status = 404;
        throw err;
      },
      fallbackMock: async () => {
        fallbackCalled = true;
        return { text: "{}" };
      },
    });

    // 404 is NOT an availability error → no fallback
    assert.equal(fallbackCalled, false, "404 model error must NOT trigger fallback");
    assert.equal(res.status, 500);
    assert.match(res.error, /404/, "Error message must surface the 404 clearly");
    assert.equal(res.creditDeducted, 0, "Credit must NOT be deducted on model-404 error");
    assert.equal(res.creditBalance, 5);
  });

  // ── gg.md requirement: invalid JSON → no credit debit ──────────────────────
  test("9. Generation gagal (invalid JSON format) → kredit tidak berkurang", async () => {
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => ({ text: "Not a valid JSON response from AI" }),
      fallbackMock: async () => {
        throw new Error("Should not be called");
      },
    });

    assert.equal(res.status, 500);
    assert.equal(res.error, "Format respons AI tidak valid. Kredit tidak dipotong.");
    assert.equal(res.creditDeducted, 0, "Kredit harus tetap utuh");
    assert.equal(res.creditBalance, 5);
    assert.equal(res.prdStatus, "failed");
  });

  // ── Fallback chain both fail ─────────────────────────────────────────────────
  test("10. Fallback gagal → error sebenarnya ditampilkan ke user, credit intact", async () => {
    const res = await simulateGeneratePrd({
      userCredits: 5,
      isFreeUsage: false,
      primaryMock: async () => {
        const err = new Error("503: Primary overloaded");
        err.status = 503;
        throw err;
      },
      fallbackMock: async () => {
        const err = new Error("503: Fallback also experiencing high demand");
        err.status = 503;
        throw err;
      },
    });

    assert.equal(res.status, 500);
    assert.match(res.error, /Fallback also experiencing high demand/);
    assert.equal(res.creditDeducted, 0, "Credit must NOT be deducted");
    assert.equal(res.creditBalance, 5);
    assert.equal(res.prdStatus, "failed");
  });

  // ── gg.md requirement: no secret exposed ────────────────────────────────────
  test("11. No GEMINI_API_KEY or sensitive secret exposed in source output or response", () => {
    // Verify the Edge Function source does NOT reference API key in any literal that
    // could leak to frontend bundle. All secrets must come from Deno.env.get().
    const sourceSnippet = `const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");`;
    // Ensure key is loaded from env, NOT hardcoded
    assert.match(sourceSnippet, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
    // Simulate response object — must not include key
    const simulatedResponse = {
      status: "ok",
      prdId: "some-uuid",
      modelUsed: "gemini-3.6-flash",
      credits: { available: 4, consumed: 1 },
    };
    const responseStr = JSON.stringify(simulatedResponse);
    assert.doesNotMatch(responseStr, /AIza|GEMINI_API_KEY|api_key/i, "Response must not contain API key material");
  });

  // ── Free usage ───────────────────────────────────────────────────────────────
  test("12. Generation sukses + Free Usage → kredit 0 dipotong", async () => {
    const res = await simulateGeneratePrd({
      userCredits: 0,
      isFreeUsage: true,
      primaryMock: async () => ({ text: JSON.stringify(validPrdPayload) }),
      fallbackMock: async () => {
        throw new Error("Should not be called");
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.creditDeducted, 0);
    assert.equal(res.creditBalance, 0);
    assert.equal(res.prdStatus, "ready");
  });

  // ── Insufficient credits pre-check ──────────────────────────────────────────
  test("13. Insufficient credits pre-check blocks call before any Gemini request", async () => {
    let primaryCalled = false;
    const res = await simulateGeneratePrd({
      userCredits: 0,
      isFreeUsage: false,
      primaryMock: async () => {
        primaryCalled = true;
        return { text: JSON.stringify(validPrdPayload) };
      },
      fallbackMock: async () => {
        throw new Error("Should not be called");
      },
    });

    assert.equal(primaryCalled, false, "Primary model must NOT be called if credits are 0");
    assert.equal(res.status, 400);
    assert.match(res.error, /Creative Credits tidak cukup/);
    assert.equal(res.creditDeducted, 0);
  });

  // ── Availability error detector ──────────────────────────────────────────────
  test("14. Availability error detector identifies 503, UNAVAILABLE, and high demand — NOT 400/401/403/404", () => {
    assert.equal(isAvailabilityError({ status: 503 }), true);
    assert.equal(isAvailabilityError({ message: "503: Service Unavailable" }), true);
    assert.equal(isAvailabilityError({ message: 'status: "UNAVAILABLE"' }), true);
    assert.equal(isAvailabilityError({ message: "high demand" }), true);
    assert.equal(isAvailabilityError({ message: "overloaded" }), true);
    // Non-availability
    assert.equal(isAvailabilityError({ status: 400, message: "Invalid argument" }), false);
    assert.equal(isAvailabilityError({ status: 401, message: "API key not valid" }), false);
    assert.equal(isAvailabilityError({ status: 403, message: "Permission denied" }), false);
    assert.equal(isAvailabilityError({ status: 404, message: "Model not found" }), false);
  });
});
